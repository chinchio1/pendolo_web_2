let chart = null;
const logEl = document.getElementById('log');
const downloadBtn = document.getElementById('downloadBtn');
const wTableBody = document.getElementById('wTableBody');
const addRowBtn = document.getElementById('addRowBtn');

// Nuovi elementi per la visualizzazione del pendolo
const pendulumCanvas = document.getElementById('pendulumCanvas');
const pendulumCtx = pendulumCanvas.getContext('2d');
let animationId = null; // Per gestire l'animazione del pendolo
let pendulumAnimationData = []; // Dati per l'animazione del pendolo
let currentPendulumLength = 0; // Lunghezza del pendolo per il disegno

function log(msg) {
  logEl.textContent += '\n' + msg;
  logEl.scrollTop = logEl.scrollHeight;
}

// Initial data (original values)
const initialData = [
  [7.1, 8.16, 0, 1.09e-5],
  [10.7, 6.4, 0, 0.94e-5],
  [7.8, 8.59, 0, 1.15e-5],
  [9.5, 5.72, 0, 1.18e-5],
  [6.5, 7.93, 0, 0.99e-5],
  [8.6, 7.35, 0, 1.11e-5],
  [10.3, 6.67, 0, 1.07e-5],
  [7.4, 8.81, 0, 1.13e-5],
  [8.0, 5.58, 0, 1.03e-5],
  [9.0, 8.92, 0, 0.96e-5]
];

function addRow(tau=1, w=1, phi=0, A=1.0e-5) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="w-full border rounded px-1" value="${tau}"></td>
    <td><input type="number" class="w-full border rounded px-1" value="${w}"></td>
    <td><input type="number" class="w-full border rounded px-1" value="${phi}"></td>
    <td><input type="number" class="w-full border rounded px-1" value="${A}"></td>
    <td><button type="button" class="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600" onclick="removeRow(this)">Remove</button></td>
  `;
  wTableBody.appendChild(tr);
}

function removeRow(btn) {
  const tr = btn.closest('tr');
  tr.remove();
}

// Load initial rows
initialData.forEach(r => addRow(...r));

// Add row button
addRowBtn.addEventListener('click', () => addRow());

document.getElementById('runBtn').addEventListener('click', startSimulation);

async function startSimulation() {
  logEl.textContent = ''; // Pulisce il log all'inizio di una nuova simulazione
  if (animationId) {
    cancelAnimationFrame(animationId); // Ferma l'animazione precedente se in corso
  }
  pendulumCtx.clearRect(0, 0, pendulumCanvas.width, pendulumCanvas.height); // Pulisce il canvas del pendolo

  let w_v = [];

  for (let row of wTableBody.rows) {
    const tau = Number(row.cells[0].querySelector('input').value);
    const w = Number(row.cells[1].querySelector('input').value) * 2 * Math.PI; // Converti Hz in rad/s
    const phi = Number(row.cells[2].querySelector('input').value);
    const A = Number(row.cells[3].querySelector('input').value);
    if (!isNaN(tau) && !isNaN(w) && !isNaN(phi) && !isNaN(A)) {
      w_v.push({ tau, w, phi, A });
    }
  }

  if (w_v.length === 0) {
    const fileInput = document.getElementById('fileInput').files[0];
    if (!fileInput) { alert("Please enter at least one row or load a file!"); return; }
    const text = await fileInput.text();
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
    w_v = lines.map((line)=>{
      const parts=line.split(/\s+/);
      const tau=Number(parts[0]), w=Number(parts[1])*2*Math.PI, phi=Number(parts[2]), A=Number(parts[3]);
      return {tau,w,phi,A};
    });
  }

  const n = Number(document.getElementById('nSteps').value) || 100000;
  const g = Number(document.getElementById('gInput').value);
  const deltat = Number(document.getElementById('deltatInput').value);
  const l = Number(document.getElementById('lInput').value);
  const dt = deltat / n;

  currentPendulumLength = l; // Salva la lunghezza per il disegno

  log(`Simulation started with n=${n}, g=${g}, Δt=${deltat}, l=${l}`);

  let t0=0.0, v1=0.0, v2=0.0, th1=0.0, th2=0.0;
  // Calcolo della velocità iniziale per il primo pendolo
  for (let i=0;i<w_v.length;i++) v1 += -w_v[i].w*w_v[i].A*Math.cos(w_v[i].phi)/l;

  const dati=[], rumore=[];
  pendulumAnimationData = []; // Reset dei dati per l'animazione

  for (let step=0; step<n; step++) {
    let ap=0; // Accelerazione della base
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j], expTerm=Math.exp(-t0/p.tau);
      // Calcolo dell'accelerazione della base (derivata seconda della posizione)
      ap += p.A*expTerm*((p.w*p.w - 1/(p.tau*p.tau))*Math.sin(p.w*t0+p.phi)+2*(p.w/p.tau)*Math.cos(p.w*t0+p.phi));
    }

    const delta=th1-th2, cos1=Math.cos(th1), cos2=Math.cos(th2);
    const sin_delta=Math.sin(delta), cos_delta=Math.cos(delta), sin1=Math.sin(th1), sin2=Math.sin(th2);

    // Posizione del mirror (punta del secondo pendolo)
    let pt=l*sin1+l*sin2;
    // Posizione della base (rumore)
    let sa=0;
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j], term=Math.exp(-t0/p.tau)*p.A*Math.sin(p.w*t0+p.phi);
      pt += term; // Aggiungi il rumore alla posizione del mirror
      sa += term; // Solo il rumore per il grafico del rumore
    }

    dati.push({x:t0,y:pt});
    rumore.push({x:t0,y:sa});
    pendulumAnimationData.push({th1: th1, th2: th2}); // Salva gli angoli per l'animazione

    // Equazioni del moto per il doppio pendolo (semplificate per l'accelerazione della base)
    // Queste sono le equazioni differenziali che descrivono il moto
    const den = 2 - cos_delta * cos_delta; // Denominatore comune per le accelerazioni angolari
    const num1 = -g * (2 * sin1 - sin_delta * cos2) - l * (v1 * v1 * sin_delta + v2 * v2 * sin_delta * cos_delta) + ap * (2 * cos1 - cos_delta * cos2);
    const num2 = -g * (2 * sin2 - sin_delta * cos1) + l * (v1 * v1 * sin_delta * cos_delta + v2 * v2 * sin_delta) + ap * (2 * cos2 - cos_delta * cos1);

    const theta_1_dp = (num1 - num2 * cos_delta) / (l * den);
    const theta_2_dp = (num2 - num1 * cos_delta) / (l * den);

    v1+=theta_1_dp*dt; // Aggiorna velocità angolare 1
    v2+=theta_2_dp*dt; // Aggiorna velocità angolare 2
    th1+=v1*dt;       // Aggiorna angolo 1
    th2+=v2*dt;       // Aggiorna angolo 2
    t0+=dt;           // Aggiorna tempo
  }

  log("Simulation completed.");
  drawChart(dati, rumore);
  prepareDownload(dati, rumore);
  startPendulumAnimation(pendulumAnimationData, currentPendulumLength, deltat); // Avvia l'animazione
}

function drawChart(dati, rumore){
  const ctx=document.getElementById('chart').getContext('2d');
  if(chart){chart.destroy();}
  chart=new Chart(ctx,{
    type:'line',
    data:{datasets:[
      {label:'Mirror Position', data:dati, parsing:{xAxisKey:'x',yAxisKey:'y'}, borderColor:'blue', borderWidth:1, pointRadius:0},
      {label:'Base Noise', data:rumore, parsing:{xAxisKey:'x',yAxisKey:'y'}, borderColor:'red', borderWidth:1, pointRadius:0}
    ]},
    options:{responsive:true, animation:false, scales:{x:{type:'linear', title:{display:true,text:'Time (s)'}}, y:{title:{display:true,text:'Amplitude (m)'}}}}
  });
}

function prepareDownload(dati, rumore){
  const datiTxt=dati.map(p=>`${p.x} ${p.y}`).join('\n');
  const rumoreTxt=rumore.map(p=>`${p.x} ${p.y}`).join('\n');
  const blob1=new Blob([datiTxt],{type:'text/plain'}), blob2=new Blob([rumoreTxt],{type:'text/plain'});
  downloadBtn.disabled=false;
  downloadBtn.onclick=()=>{
    const a1=document.createElement('a'); a1.href=URL.createObjectURL(blob1); a1.download='dati.txt'; document.body.appendChild(a1); a1.click(); a1.remove();
    const a2=document.createElement('a'); a2.href=URL.createObjectURL(blob2); a2.download='rumore_base.txt'; document.body.appendChild(a2); a2.click(); a2.remove();
    log("Download started for dati.txt and rumore_base.txt");
  };
}

// --- Funzioni per la visualizzazione del pendolo ---

function drawPendulum(th1, th2, l) {
  pendulumCtx.clearRect(0, 0, pendulumCanvas.width, pendulumCanvas.height); // Pulisci il canvas

  const originX = pendulumCanvas.width / 2;
  const originY = pendulumCanvas.height / 4; // Punto di sospensione

  // Scala per adattare la lunghezza del pendolo al canvas
  // Assumiamo che la lunghezza massima del pendolo (2*l) non superi metà dell'altezza del canvas
  const scale = Math.min(pendulumCanvas.width, pendulumCanvas.height) / (2 * l + 2) ; // +2 per un po' di margine

  // Coordinate del primo punto (massa 1)
  const x1 = originX + l * scale * Math.sin(th1);
  const y1 = originY + l * scale * Math.cos(th1);

  // Coordinate del secondo punto (massa 2)
  const x2 = x1 + l * scale * Math.sin(th2);
  const y2 = y1 + l * scale * Math.cos(th2);

  // Disegna il punto di sospensione
  pendulumCtx.beginPath();
  pendulumCtx.arc(originX, originY, 3, 0, Math.PI * 2);
  pendulumCtx.fillStyle = 'black';
  pendulumCtx.fill();

  // Disegna il primo braccio del pendolo
  pendulumCtx.beginPath();
  pendulumCtx.moveTo(originX, originY);
  pendulumCtx.lineTo(x1, y1);
  pendulumCtx.strokeStyle = 'gray';
  pendulumCtx.lineWidth = 2;
  pendulumCtx.stroke();

  // Disegna la prima massa
  pendulumCtx.beginPath();
  pendulumCtx.arc(x1, y1, 8, 0, Math.PI * 2);
  pendulumCtx.fillStyle = 'blue';
  pendulumCtx.fill();
  pendulumCtx.strokeStyle = 'black';
  pendulumCtx.stroke();

  // Disegna il secondo braccio del pendolo
  pendulumCtx.beginPath();
  pendulumCtx.moveTo(x1, y1);
  pendulumCtx.lineTo(x2, y2);
  pendulumCtx.strokeStyle = 'gray';
  pendulumCtx.lineWidth = 2;
  pendulumCtx.stroke();

  // Disegna la seconda massa (mirror)
  pendulumCtx.beginPath();
  pendulumCtx.arc(x2, y2, 8, 0, Math.PI * 2);
  pendulumCtx.fillStyle = 'red';
  pendulumCtx.fill();
  pendulumCtx.strokeStyle = 'black';
  pendulumCtx.stroke();
}

let animationFrameIndex = 0;
let animationSpeedFactor = 1; // Quanti step di simulazione per frame di animazione

function startPendulumAnimation(data, l_val, totalSimulationTime) {
  if (animationId) {
    cancelAnimationFrame(animationId); // Ferma qualsiasi animazione precedente
  }

  pendulumAnimationData = data;
  currentPendulumLength = l_val;
  animationFrameIndex = 0;

  // Calcola un fattore di velocità per far durare l'animazione un tempo ragionevole (es. 10-20 secondi)
  // Se la simulazione ha molti step, salteremo più frame per mantenere la durata
  const targetAnimationDurationSeconds = 15; // Durata desiderata dell'animazione in secondi
  const totalFramesInSimulation = data.length;
  const framesPerSecond = 60; // FPS del browser
  const requiredFramesForTargetDuration = targetAnimationDurationSeconds * framesPerSecond;

  animationSpeedFactor = Math.max(1, Math.floor(totalFramesInSimulation / requiredFramesForTargetDuration));
  log(`Starting pendulum animation. Total simulation steps: ${totalFramesInSimulation}. Animation speed factor: ${animationSpeedFactor}`);

  animatePendulumFrame();
}

function animatePendulumFrame() {
  if (animationFrameIndex < pendulumAnimationData.length) {
    const frame = pendulumAnimationData[animationFrameIndex];
    drawPendulum(frame.th1, frame.th2, currentPendulumLength);

    animationFrameIndex += animationSpeedFactor; // Avanza di 'animationSpeedFactor' step
    animationId = requestAnimationFrame(animatePendulumFrame);
  } else {
    log("Pendulum animation finished.");
    animationId = null; // Resetta l'ID dell'animazione
  }
}
