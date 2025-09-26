let chart = null;
const logEl = document.getElementById('log');
const downloadBtn = document.getElementById('downloadBtn');
const wTableBody = document.getElementById('wTableBody');
const addRowBtn = document.getElementById('addRowBtn');

// Nuovi elementi per l'animazione del pendolo
const pendulumCanvas = document.getElementById('pendulumCanvas');
const pendulumCtx = pendulumCanvas.getContext('2d');

let animationId = null; // Per memorizzare l'ID di requestAnimationFrame
let animationFramesData = []; // Conterrà gli stati del pendolo per l'animazione
let animationL = 0; // Lunghezza del pendolo per l'animazione
let startTime = null; // Per tracciare il tempo di inizio dell'animazione

const ANIMATION_DURATION_SECONDS = 10; // Durata desiderata dell'animazione in tempo reale

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
  logEl.textContent = '';
  let w_v = [];

  for (let row of wTableBody.rows) {
    const tau = Number(row.cells[0].querySelector('input').value);
    const w = Number(row.cells[1].querySelector('input').value) * 2 * Math.PI; // Convert Hz to rad/s
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

  log(`Simulation started with n=${n}, g=${g}, Δt=${deltat}, l=${l}`);

  let t0=0.0, v1=0.0, v2=0.0, th1=0.0, th2=0.0;
  // Inizializzazione della velocità angolare v1 basata sui parametri di rumore
  for (let i=0;i<w_v.length;i++) v1 += -w_v[i].w*w_v[i].A*Math.cos(w_v[i].phi)/l;

  const dati=[], rumore=[];
  let animationFrames = []; // Array per memorizzare gli stati del pendolo per l'animazione

  for (let step=0; step<n; step++) {
    let ap=0; // Accelerazione esterna
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j], expTerm=Math.exp(-t0/p.tau);
      ap += p.A*expTerm*((p.w*p.w - 1/(p.tau*p.tau))*Math.sin(p.w*t0+p.phi)+2*(p.w/p.tau)*Math.cos(p.w*t0+p.phi));
    }

    const delta=th1-th2, cos1=Math.cos(th1), cos2=Math.cos(th2);
    const sin_delta=Math.sin(delta), cos_delta=Math.cos(delta), sin1=Math.sin(th1), sin2=Math.sin(th2);

    let pt=l*sin1+l*sin2, sa=0; // pt: posizione orizzontale del secondo mass, sa: somma del rumore
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j], term=Math.exp(-t0/p.tau)*p.A*Math.sin(p.w*t0+p.phi);
      pt += term; sa += term;
    }

    dati.push({x:t0,y:pt}); rumore.push({x:t0,y:sa});
    animationFrames.push({ th1: th1, th2: th2 }); // Memorizza lo stato per l'animazione

    // Calcoli originali della fisica per il doppio pendolo
    // Questi calcoli sono stati mantenuti come forniti, assumendo la loro correttezza.
    const theta_2_dp=(v2*v1*sin_delta + (ap/l)*cos2 - (g/l)*sin2 + v1*(v1-v2)*sin_delta - (cos_delta/2)*(2*(ap/l)*cos1 - 2*(g/l)*sin1 - v1*v2*sin_delta + v2*(v1-v2)*sin_delta))/(1-cos_delta*cos_delta*0.5);
    const theta_1_dp=0.5*(2*(ap/l)*cos1 - 2*(g/l)*sin1 - v1*v2*sin_delta - theta_2_dp*cos_delta + v2*(v1-v2)*sin_delta);

    v1+=theta_1_dp*dt; v2+=theta_2_dp*dt; th1+=v1*dt; th2+=v2*dt; t0+=dt;
  }

  log("Simulation completed.");
  drawChart(dati, rumore);
  prepareDownload(dati, rumore);

  // Prepara e avvia l'animazione
  animationFramesData = animationFrames; // Memorizza i frame generati
  animationL = l; // Memorizza la lunghezza del pendolo utilizzata
  if (animationId) {
      cancelAnimationFrame(animationId); // Ferma qualsiasi animazione precedente
  }
  startTime = null; // Resetta il tempo di inizio per una nuova animazione
  log("Starting pendulum animation...");
  animationId = requestAnimationFrame(animatePendulum);
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

// --- Funzioni per l'animazione del pendolo ---

function drawPendulum(ctx, l, th1, th2, canvasWidth, canvasHeight) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Centro del canvas per il punto di pivot
    const originX = canvasWidth / 2;
    const originY = canvasHeight / 4; // Inizia un po' più in basso rispetto all'alto

    // Fattore di scala per rendere il pendolo visibile
    // Calcola una scala dinamica basata sull'altezza del canvas e la lunghezza massima del pendolo (2*l)
    const maxPendulumHeight = 2 * l; // Estensione verticale massima del pendolo
    const availableHeight = canvasHeight - originY - 20; // Altezza disponibile dal pivot al fondo, con un po' di padding
    const scale = availableHeight / maxPendulumHeight; // pixel per metro

    const L1 = l * scale;
    const L2 = l * scale;

    // Coordinate della prima massa (m1)
    // Gli angoli sono misurati dalla verticale, positivi in senso orario.
    const x1 = originX + L1 * Math.sin(th1);
    const y1 = originY + L1 * Math.cos(th1);

    // Coordinate della seconda massa (m2)
    const x2 = x1 + L2 * Math.sin(th2);
    const y2 = y1 + L2 * Math.cos(th2);

    // Disegna il pivot
    ctx.beginPath();
    ctx.arc(originX, originY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();

    // Disegna la prima asta
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Disegna la prima massa
    ctx.beginPath();
    ctx.arc(x1, y1, 10, 0, 2 * Math.PI);
    ctx.fillStyle = 'blue';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.stroke();

    // Disegna la seconda asta
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Disegna la seconda massa
    ctx.beginPath();
    ctx.arc(x2, y2, 10, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.stroke();
}

function animatePendulum(currentTime) {
    if (!startTime) startTime = currentTime;
    const elapsed = (currentTime - startTime) / 1000; // tempo trascorso in secondi

    if (elapsed < ANIMATION_DURATION_SECONDS) {
        const progress = elapsed / ANIMATION_DURATION_SECONDS; // progresso da 0 a 1
        const frameIndex = Math.floor(progress * animationFramesData.length);

        if (frameIndex < animationFramesData.length) {
            const frame = animationFramesData[frameIndex];
            drawPendulum(pendulumCtx, animationL, frame.th1, frame.th2, pendulumCanvas.width, pendulumCanvas.height);
        }
        animationId = requestAnimationFrame(animatePendulum);
    } else {
        // Assicurati che l'ultimo frame sia disegnato
        const lastFrame = animationFramesData[animationFramesData.length - 1];
        if (lastFrame) {
            drawPendulum(pendulumCtx, animationL, lastFrame.th1, lastFrame.th2, pendulumCanvas.width, pendulumCanvas.height);
        }
        log("Animation finished.");
        startTime = null; // Resetta per la prossima esecuzione
    }
}
