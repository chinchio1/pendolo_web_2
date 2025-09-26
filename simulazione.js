let chart = null;
const logEl = document.getElementById('log');
const downloadBtn = document.getElementById('downloadBtn');
const wTableBody = document.getElementById('wTableBody');
const addRowBtn = document.getElementById('addRowBtn');
const pendulumCanvas = document.getElementById('pendulumCanvas');
const pendulumCtx = pendulumCanvas.getContext('2d');

// Variabili globali per l'animazione del pendolo
let pendulumStates = [];
let animationFrameId = null;
let lastTimestamp = 0;
let currentSimTime = 0;
let sim_l, sim_deltat, sim_n, sim_dt; // Parametri di simulazione necessari per l'animazione

function log(msg) {
  logEl.textContent += '\n' + msg; // Corretto il newline
  logEl.scrollTop = logEl.scrollHeight;
}

// Dati iniziali (valori originali)
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

// Carica le righe iniziali
initialData.forEach(r => addRow(...r));

// Bottone per aggiungere riga
addRowBtn.addEventListener('click', () => addRow());

document.getElementById('runBtn').addEventListener('click', startSimulation);

async function startSimulation() {
  logEl.textContent = ''; // Pulisce il log all'inizio di una nuova simulazione
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
    // Corretto per gestire newline cross-platform
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
    w_v = lines.map((line)=>{
      const parts=line.split(/\s+/);
      const tau=Number(parts[0]), w=Number(parts[1])*2*Math.PI, phi=Number(parts[2]), A=Number(parts[3]);
      return {tau,w,phi,A};
    });
  }

  sim_n = Number(document.getElementById('nSteps').value) || 100000;
  const g = Number(document.getElementById('gInput').value);
  sim_deltat = Number(document.getElementById('deltatInput').value);
  sim_l = Number(document.getElementById('lInput').value);
  sim_dt = sim_deltat / sim_n;
  const animationSpeedFactor = Number(document.getElementById('animationSpeedInput').value) || 100;


  log(`Simulation started with n=${sim_n}, g=${g}, Δt=${sim_deltat}, l=${sim_l}`);

  let t0=0.0, v1=0.0, v2=0.0, th1=0.0, th2=0.0;
  // Inizializzazione della velocità v1 basata sul rumore
  for (let i=0;i<w_v.length;i++) v1 += -w_v[i].w*w_v[i].A*Math.cos(w_v[i].phi)/sim_l;

  const dati=[], rumore=[];
  pendulumStates = []; // Pulisci gli stati precedenti del pendolo

  for (let step=0; step<sim_n; step++) {
    let ap=0; // Accelerazione del punto di sospensione (base)
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j], expTerm=Math.exp(-t0/p.tau);
      ap += p.A*expTerm*((p.w*p.w - 1/(p.tau*p.tau))*Math.sin(p.w*t0+p.phi)+2*(p.w/p.tau)*Math.cos(p.w*t0+p.phi));
    }

    const delta=th1-th2, cos1=Math.cos(th1), cos2=Math.cos(th2);
    const sin_delta=Math.sin(delta), cos_delta=Math.cos(delta), sin1=Math.sin(th1), sin2=Math.sin(th2);

    // Posizione orizzontale del secondo pendolo rispetto al punto di sospensione
    let pt=sim_l*sin1+sim_l*sin2;
    // Rumore di base (spostamento orizzontale)
    let sa=0;
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j], term=Math.exp(-t0/p.tau)*p.A*Math.sin(p.w*t0+p.phi);
      sa += term;
    }

    dati.push({x:t0,y:pt}); // Dati per il grafico della posizione dello specchio
    rumore.push({x:t0,y:sa}); // Dati per il grafico del rumore di base
    pendulumStates.push({ t: t0, th1: th1, th2: th2 }); // Memorizza gli angoli del pendolo per l'animazione

    // Equazioni del moto per il doppio pendolo (accelerazioni angolari)
    const theta_2_dp=(v2*v1*sin_delta + (ap/sim_l)*cos2 - (g/sim_l)*sin2 + v1*(v1-v2)*sin_delta - (cos_delta/2)*(2*(ap/sim_l)*cos1 - 2*(g/sim_l)*sin1 - v1*v2*sin_delta + v2*(v1-v2)*sin_delta))/(1-cos_delta*cos_delta*0.5);
    const theta_1_dp=0.5*(2*(ap/sim_l)*cos1 - 2*(g/sim_l)*sin1 - v1*v2*sin_delta - theta_2_dp*cos_delta + v2*(v1-v2)*sin_delta);

    // Aggiorna velocità e angoli
    v1+=theta_1_dp*sim_dt;
    v2+=theta_2_dp*sim_dt;
    th1+=v1*sim_dt;
    th2+=v2*sim_dt;
    t0+=sim_dt;
  }

  log("Simulation completed.");
  drawChart(dati, rumore);
  prepareDownload(dati, rumore);
  startPendulumAnimation(sim_l, sim_deltat, sim_n, sim_dt, animationSpeedFactor);
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

function startPendulumAnimation(l, deltat, n, dt, speedFactor) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId); // Annulla qualsiasi animazione precedente
  }
  if (pendulumStates.length === 0) {
    log("No pendulum states to animate.");
    return;
  }

  lastTimestamp = 0; // Resetta il timestamp per il calcolo del tempo reale
  currentSimTime = 0; // Resetta il tempo di simulazione corrente per l'animazione
  const totalSimDuration = deltat; // Durata totale della simulazione

  const animate = (timestamp) => {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }
    const deltaTimeReal = (timestamp - lastTimestamp) / 1000; // Tempo reale trascorso in secondi
    lastTimestamp = timestamp;

    currentSimTime += deltaTimeReal * speedFactor; // Avanza il tempo di simulazione in base al fattore di velocità

    // Loop del tempo di simulazione se supera la durata totale
    if (currentSimTime > totalSimDuration) {
      currentSimTime %= totalSimDuration;
    }

    // Trova l'indice corrispondente negli stati del pendolo
    const animationIndex = Math.floor(currentSimTime / dt);

    if (animationIndex < pendulumStates.length) {
      const state = pendulumStates[animationIndex];
      drawPendulum(pendulumCtx, state.th1, state.th2, l);
    } else {
        // Fallback: se per qualche motivo l'indice è fuori limite, disegna l'ultimo frame
        drawPendulum(pendulumCtx, pendulumStates[pendulumStates.length - 1].th1, pendulumStates[pendulumStates.length - 1].th2, l);
    }

    animationFrameId = requestAnimationFrame(animate); // Richiedi il prossimo frame
  };

  animationFrameId = requestAnimationFrame(animate); // Avvia il loop di animazione
  log("Pendulum animation started.");
}

function drawPendulum(ctx, th1, th2, l) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // Pulisci il canvas
  ctx.save(); // Salva lo stato del contesto

  const scale = 20; // Scala: 20 pixel per metro
  const massRadius = 10; // Raggio delle masse in pixel
  const rodWidth = 2; // Spessore delle aste in pixel

  // Trasla l'origine al centro superiore del canvas
  ctx.translate(ctx.canvas.width / 2, 50); // 50 pixel dal bordo superiore

  // Calcola le coordinate in pixel
  const x1_px = l * Math.sin(th1) * scale;
  const y1_px = l * Math.cos(th1) * scale;
  const x2_px = x1_px + l * Math.sin(th2) * scale;
  const y2_px = y1_px + l * Math.cos(th2) * scale;

  // Disegna le aste
  ctx.beginPath();
  ctx.moveTo(0, 0); // Punto di sospensione
  ctx.lineTo(x1_px, y1_px); // Alla prima massa
  ctx.lineTo(x2_px, y2_px); // Alla seconda massa
  ctx.strokeStyle = 'black';
  ctx.lineWidth = rodWidth;
  ctx.stroke();

  // Disegna le masse
  ctx.beginPath();
  ctx.arc(x1_px, y1_px, massRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'gray';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x2_px, y2_px, massRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'darkgray';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();

  ctx.restore(); // Ripristina lo stato del contesto
}
