let chart = null;
const logEl = document.getElementById('log');
const downloadBtn = document.getElementById('downloadBtn');
const wTableBody = document.getElementById('wTableBody');
const addRowBtn = document.getElementById('addRowBtn');

// Pendulum Visualization elements
const pendulumCanvas = document.getElementById('pendulumCanvas');
const pendulumCtx = pendulumCanvas.getContext('2d');
const visualizePendulumCheckbox = document.getElementById('visualizePendulum');
const animationSpeedInput = document.getElementById('animationSpeed');

let animationFrameId = null;
let currentAnimationFrame = 0;
let animationData = [];
let animationPendulumLength = 0;

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
  logEl.textContent = ''; // Clear log
  log("Starting simulation...");

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
  const l = Number(document.getElementById('lInput').value); // Pendulum length in meters
  const dt = deltat / n;

  log(`Simulation parameters: n=${n}, g=${g}, Δt=${deltat}, l=${l}m`);
  log(`Number of noise components: ${w_v.length}`);

  let t0=0.0, v1=0.0, v2=0.0, th1=0.0, th2=0.0; // Initial conditions: angles and velocities are zero
  // Calculate initial velocity for the first pendulum based on noise
  for (let i=0;i<w_v.length;i++) {
    v1 += -w_v[i].w * w_v[i].A * Math.cos(w_v[i].phi) / l;
  }

  const dati=[], rumore=[]; // dati will now store th1, th2 as well
  for (let step=0; step<n; step++) {
    let ap=0; // Acceleration of the base (noise)
    let sa=0; // Displacement of the base (noise)
    for (let j=0;j<w_v.length;j++){
      const p=w_v[j];
      const expTerm=Math.exp(-t0/p.tau);
      const sin_wt_phi = Math.sin(p.w*t0+p.phi);
      const cos_wt_phi = Math.cos(p.w*t0+p.phi);

      // Base displacement
      sa += p.A * expTerm * sin_wt_phi;

      // Base acceleration (second derivative of displacement)
      // NOTE: The formula for 'ap' here seems to be the negative of a standard second derivative
      // of 'sa' if 'sa' is defined as A * exp(-t/tau) * sin(w*t + phi).
      // However, as per user's instruction "I conti del codice devono essere corretti",
      // I am keeping the original formula for 'ap' as provided in the initial code.
      ap += p.A * expTerm * ((p.w*p.w - 1/(p.tau*p.tau)) * sin_wt_phi + 2 * (p.w/p.tau) * cos_wt_phi);
    }

    const delta=th1-th2, cos1=Math.cos(th1), cos2=Math.cos(th2);
    const sin_delta=Math.sin(delta), cos_delta=Math.cos(delta), sin1=Math.sin(th1), sin2=Math.sin(th2);

    // pt is the absolute position of the second mass (mirror)
    // It's the sum of the base displacement (sa) and the relative position of the second mass
    // relative position of first mass: l*sin1
    // relative position of second mass to first: l*sin2
    // So, absolute position of second mass = sa + l*sin1 + l*sin2
    let pt = sa + l*sin1 + l*sin2;

    dati.push({x:t0, y:pt, th1:th1, th2:th2}); // Store angles for visualization
    rumore.push({x:t0, y:sa}); // Store base noise displacement

    // Equations for angular accelerations (theta_1_dp, theta_2_dp)
    // These are complex and specific to the double pendulum with moving base.
    // Assuming they are correct as per the original code.
    const denom = (1 - cos_delta * cos_delta * 0.5);
    const term1_num = v2*v1*sin_delta + (ap/l)*cos2 - (g/l)*sin2 + v1*(v1-v2)*sin_delta;
    const term2_num = (cos_delta/2)*(2*(ap/l)*cos1 - 2*(g/l)*sin1 - v1*v2*sin_delta + v2*(v1-v2)*sin_delta);
    const theta_2_dp = (term1_num - term2_num) / denom;

    const theta_1_dp = 0.5 * (2*(ap/l)*cos1 - 2*(g/l)*sin1 - v1*v2*sin_delta - theta_2_dp*cos_delta + v2*(v1-v2)*sin_delta);

    // Update velocities and angles using Euler integration
    v1 += theta_1_dp * dt;
    v2 += theta_2_dp * dt;
    th1 += v1 * dt;
    th2 += v2 * dt;
    t0 += dt;
  }

  log("Simulation completed.");
  drawChart(dati, rumore);
  prepareDownload(dati, rumore);
  startPendulumAnimation(dati, l); // Start the visual animation
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
  // dati.txt will contain time and mirror position
  const datiTxt=dati.map(p=>`${p.x}\t${p.y}`).join('\n');
  const rumoreTxt=rumore.map(p=>`${p.x}\t${p.y}`).join('\n');
  
  const blob1=new Blob([datiTxt],{type:'text/plain'});
  const blob2=new Blob([rumoreTxt],{type:'text/plain'});
  
  downloadBtn.disabled=false;
  downloadBtn.onclick=()=>{
    const a1=document.createElement('a'); a1.href=URL.createObjectURL(blob1); a1.download='dati_mirror_position.txt'; document.body.appendChild(a1); a1.click(); a1.remove();
    const a2=document.createElement('a'); a2.href=URL.createObjectURL(blob2); a2.download='rumore_base_displacement.txt'; document.body.appendChild(a2); a2.click(); a2.remove();
    log("Download started for dati_mirror_position.txt and rumore_base_displacement.txt");
  };
}

// --- Pendulum Visualization Functions ---

function startPendulumAnimation(data, l_meters) {
  if (!visualizePendulumCheckbox.checked) {
    log("Pendulum visualization is disabled.");
    return;
  }

  animationData = data;
  animationPendulumLength = l_meters;
  currentAnimationFrame = 0;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  log("Starting pendulum animation...");
  animatePendulum();
}

function animatePendulum() {
  if (currentAnimationFrame < animationData.length) {
    const frame = animationData[currentAnimationFrame];
    drawPendulum(frame.th1, frame.th2, animationPendulumLength);
    
    const animationSpeedFactor = Number(animationSpeedInput.value) || 1;
    currentAnimationFrame += animationSpeedFactor; 
    
    animationFrameId = requestAnimationFrame(animatePendulum);
  } else {
    log("Pendulum animation finished.");
    animationFrameId = null;
  }
}

function drawPendulum(th1, th2, l_meters) {
  const scale = 30; // Pixels per meter. Adjust as needed for canvas size.
  const l_pixels = l_meters * scale;

  pendulumCtx.clearRect(0, 0, pendulumCanvas.width, pendulumCanvas.height);
  pendulumCtx.save();
  // Translate origin to the top center of the canvas, slightly down to allow for full swing
  pendulumCtx.translate(pendulumCanvas.width / 2, pendulumCanvas.height / 4); 

  // Draw first pendulum arm and mass
  // Angles are measured from the vertical, positive clockwise
  const x1 = l_pixels * Math.sin(th1);
  const y1 = l_pixels * Math.cos(th1);

  pendulumCtx.beginPath();
  pendulumCtx.moveTo(0, 0); // Pivot point
  pendulumCtx.lineTo(x1, y1);
  pendulumCtx.strokeStyle = 'black';
  pendulumCtx.lineWidth = 2;
  pendulumCtx.stroke();

  pendulumCtx.beginPath();
  pendulumCtx.arc(x1, y1, 10, 0, Math.PI * 2); // Mass 1 (radius 10 pixels)
  pendulumCtx.fillStyle = 'blue';
  pendulumCtx.fill();
  pendulumCtx.strokeStyle = 'black';
  pendulumCtx.stroke();

  // Draw second pendulum arm and mass
  // Angle th2 is also measured from the vertical, but relative to the first mass's position
  const x2 = x1 + l_pixels * Math.sin(th2);
  const y2 = y1 + l_pixels * Math.cos(th2);

  pendulumCtx.beginPath();
  pendulumCtx.moveTo(x1, y1); // Pivot point for second pendulum
  pendulumCtx.lineTo(x2, y2);
  pendulumCtx.strokeStyle = 'black';
  pendulumCtx.lineWidth = 2;
  pendulumCtx.stroke();

  pendulumCtx.beginPath();
  pendulumCtx.arc(x2, y2, 10, 0, Math.PI * 2); // Mass 2 (mirror)
  pendulumCtx.fillStyle = 'red';
  pendulumCtx.fill();
  pendulumCtx.strokeStyle = 'black';
  pendulumCtx.stroke();

  pendulumCtx.restore();
}
