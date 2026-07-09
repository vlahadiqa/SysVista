// ── SysVista v2.0 — Glassmorphism Edition ──────────────

const HISTORY_LEN = 60;
const CIRC = 2 * Math.PI * 48;
const history = {
  cpu: Array(HISTORY_LEN).fill(0), ram: Array(HISTORY_LEN).fill(0),
  read: Array(HISTORY_LEN).fill(0), write: Array(HISTORY_LEN).fill(0),
};
const labels  = Array.from({ length: HISTORY_LEN }, (_, i) => i === HISTORY_LEN - 1 ? 'now' : '');
const csvLog  = [];
let stressActive = false;
let startTime    = Date.now();
let cpuCores     = 1; // updated on first data

// ── SVG Gradients ────────────────────────────────────
const svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svgDefs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
svgDefs.innerHTML = `<defs>
  <linearGradient id="grad-green"  x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#16a34a"/>
    <stop offset="100%" stop-color="#4ade80"/>
  </linearGradient>
  <linearGradient id="grad-amber"  x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#d97706"/>
    <stop offset="100%" stop-color="#fbbf24"/>
  </linearGradient>
  <linearGradient id="grad-blue"   x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#1d4ed8"/>
    <stop offset="100%" stop-color="#60a5fa"/>
  </linearGradient>
  <linearGradient id="grad-purple" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#7c3aed"/>
    <stop offset="100%" stop-color="#a78bfa"/>
  </linearGradient>
  <linearGradient id="grad-red"    x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#b91c1c"/>
    <stop offset="100%" stop-color="#f87171"/>
  </linearGradient>
</defs>`;
document.body.prepend(svgDefs);

// ── Particle BG ──────────────────────────────────────
const bgCanvas = document.getElementById('bg-canvas');
const ctx2d    = bgCanvas.getContext('2d');
let cpuGlobal  = 0;

const particles = Array.from({ length: 50 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: Math.random() * 1.2 + 0.4,
  dx: (Math.random() - 0.5) * 0.35,
  dy: (Math.random() - 0.5) * 0.35,
  a: Math.random() * Math.PI * 2,
}));

function resizeBg() { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; }
window.addEventListener('resize', resizeBg);
resizeBg();

function animBg() {
  ctx2d.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  const speed = 1 + (cpuGlobal / 100) * 2.5;
  particles.forEach(p => {
    p.x += p.dx * speed; p.y += p.dy * speed; p.a += 0.008 * speed;
    if (p.x < 0) p.x = bgCanvas.width;  if (p.x > bgCanvas.width)  p.x = 0;
    if (p.y < 0) p.y = bgCanvas.height; if (p.y > bgCanvas.height) p.y = 0;
    const alpha = (Math.sin(p.a) * 0.4 + 0.6) * 0.5;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx2d.fillStyle = `rgba(74,222,128,${alpha})`;
    ctx2d.fill();
  });
  requestAnimationFrame(animBg);
}
animBg();

// ── Charts ───────────────────────────────────────────
const GRID = 'rgba(255,255,255,0.06)';
const TICK = 'rgba(255,255,255,0.25)';

const baseOpts = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: {
    legend: { display: true, labels: { color: TICK, font: { size: 10 }, boxWidth: 8, padding: 10 } },
    tooltip: { enabled: false }
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 9 }, maxTicksLimit: 4 } },
    y: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 9 }, maxTicksLimit: 4 } }
  },
  elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 1.5 } }
};

const trendChart = new Chart(document.getElementById('chart-trend'), {
  type: 'line',
  data: { labels, datasets: [
    { label: 'CPU %',  data: [...history.cpu],  borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.05)' },
    { label: 'RAM %',  data: [...history.ram],  borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.05)' }
  ]},
  options: { ...baseOpts, scales: { ...baseOpts.scales,
    y: { ...baseOpts.scales.y, min:0, max:100, ticks:{...baseOpts.scales.y.ticks, callback:v=>v+'%'} } } }
});

const diskChart = new Chart(document.getElementById('chart-disk'), {
  type: 'line',
  data: { labels, datasets: [
    { label: 'Read MB/s',  data: [...history.read],  borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.05)' },
    { label: 'Write MB/s', data: [...history.write], borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.05)' }
  ]},
  options: baseOpts
});

// ── Helpers ──────────────────────────────────────────
function push(arr, v) { arr.push(v); if (arr.length > HISTORY_LEN) arr.shift(); }
function setGauge(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.strokeDashoffset = CIRC - (CIRC * Math.min(100, Math.max(0, pct)) / 100);
}

// ── FIX: normalisasi CPU% per proses ─────────────────
// psutil di Windows bisa return >100% karena multi-thread
// dibagi jumlah logical cores untuk dapat nilai 0-100 yg wajar
function normCpu(pct, cores) {
  return Math.min(100, Math.round((pct / cores) * 10) / 10);
}

function cpuColor(pct) {
  if (pct > 85) return '#f87171';
  if (pct > 60) return '#fbbf24';
  return '#4ade80';
}

function heatmapStyle(pct) {
  if (pct > 85) return { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', color: '#fca5a5' };
  if (pct > 60) return { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.22)',  color: '#fde68a' };
  if (pct > 30) return { bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.18)',  color: '#86efac' };
  return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' };
}

function badgeHTML(pct) {
  if (pct > 30) return `<span class="badge badge-hi">high</span>`;
  if (pct > 10) return `<span class="badge badge-md">med</span>`;
  if (pct > 0)  return `<span class="badge badge-ok">ok</span>`;
  return `<span class="badge badge-na">idle</span>`;
}

// ── Alert System ─────────────────────────────────────
function checkAlerts(d) {
  const bar = document.getElementById('alert-bar');
  const msg = document.getElementById('alert-msg');
  const alerts = [];
  if (d.cpu.percent > 90)             alerts.push(`CPU kritis: ${d.cpu.percent}%`);
  if (d.cpu.temp && d.cpu.temp > 85)  alerts.push(`Suhu CPU tinggi: ${d.cpu.temp}°C`);
  if (d.ram.percent > 85)             alerts.push(`RAM hampir penuh: ${d.ram.percent}%`);
  if (alerts.length) { bar.style.display = 'flex'; msg.textContent = '⚠ ' + alerts.join('  ·  '); }
  else               { bar.style.display = 'none'; }
}

// ── Stress Test ───────────────────────────────────────
async function toggleStress() {
  const btn    = document.getElementById('btn-stress');
  const info   = document.getElementById('stress-status-text');
  const meter  = document.getElementById('stress-meter');
  const action = stressActive ? 'stop' : 'start';
  try {
    const res  = await fetch('/api/stress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.status === 'started') {
      stressActive = true;
      btn.classList.add('active');
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop Stress Test`;
      info.textContent = `Running — ${data.cores} cores dibebani penuh`;
      meter.style.display = 'block';
    } else {
      stressActive = false;
      btn.classList.remove('active');
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Run Stress Test`;
      info.textContent = 'Idle — siap dijalankan';
      meter.style.display = 'none';
    }
  } catch(e) { info.textContent = 'Error: tidak bisa koneksi ke backend'; }
}

// ── Export CSV ────────────────────────────────────────
function exportCSV() {
  if (!csvLog.length) { alert('Belum ada data — tunggu beberapa detik.'); return; }
  const header = 'timestamp,cpu_pct,cpu_temp,ram_pct,ram_used_gb,disk_read_mbs,disk_write_mbs\n';
  const rows   = csvLog.map(r => `${r.ts},${r.cpu},${r.temp??''},${r.ram},${r.ram_gb},${r.read},${r.write}`).join('\n');
  const blob   = new Blob([header + rows], { type: 'text/csv' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `sysvista_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Render ────────────────────────────────────────────
function render(d) {
  cpuGlobal = d.cpu.percent;
  cpuCores  = d.cpu.threads || 1;

  // Clock + host
  const now = new Date();
  document.getElementById('nav-clock').textContent =
    String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');
  document.getElementById('nav-host').textContent = `${d.cpu.cores}C/${d.cpu.threads}T · ${(d.cpu.freq_mhz/1000).toFixed(2)} GHz`;

  // CPU gauge
  setGauge('gauge-cpu', d.cpu.percent);
  const cpuEl = document.getElementById('v-cpu');
  cpuEl.textContent = d.cpu.percent;
  cpuEl.style.color = cpuColor(d.cpu.percent);
  // update stroke color based on severity
  const gCpu = document.getElementById('gauge-cpu');
  if (d.cpu.percent > 85) gCpu.style.stroke = 'url(#grad-red)';
  else if (d.cpu.percent > 60) gCpu.style.stroke = 'url(#grad-amber)';
  else gCpu.style.stroke = 'url(#grad-green)';
  document.getElementById('s-cpu').textContent = `${d.cpu.cores} cores · ${(d.cpu.freq_mhz/1000).toFixed(2)} GHz`;

  // Temp gauge
  const tempPct = d.cpu.temp ? Math.min(100, d.cpu.temp) : 0;
  setGauge('gauge-temp', tempPct);
  document.getElementById('v-temp').textContent = d.cpu.temp ?? 'N/A';
  document.getElementById('s-temp').textContent = d.cpu.temp
    ? `TjMax 100°C · ${d.cpu.temp > 80 ? '⚠ hot' : d.cpu.temp > 60 ? 'warm' : 'normal'}`
    : 'Sensor tidak tersedia';

  // RAM gauge
  setGauge('gauge-ram', d.ram.percent);
  document.getElementById('v-ram').textContent = d.ram.used_gb;
  document.getElementById('s-ram').textContent = `of ${d.ram.total_gb} GB · ${d.ram.percent}%`;

  // Disk gauge
  const diskTotal = parseFloat((d.disk.read_mbs + d.disk.write_mbs).toFixed(1));
  setGauge('gauge-disk', Math.min(100, diskTotal / 2));
  document.getElementById('v-disk').textContent = diskTotal;
  document.getElementById('s-disk').textContent = `R: ${d.disk.read_mbs} · W: ${d.disk.write_mbs} MB/s`;

  // Charts
  push(history.cpu, d.cpu.percent); push(history.ram, d.ram.percent);
  push(history.read, d.disk.read_mbs); push(history.write, d.disk.write_mbs);
  trendChart.data.datasets[0].data = [...history.cpu];
  trendChart.data.datasets[1].data = [...history.ram];
  trendChart.update('none');
  diskChart.data.datasets[0].data = [...history.read];
  diskChart.data.datasets[1].data = [...history.write];
  diskChart.update('none');

  // Heatmap per-core
  document.getElementById('heatmap-grid').innerHTML = d.cpu.per_core.map((pct, i) => {
    const c = heatmapStyle(pct);
    return `<div class="hm-cell" style="background:${c.bg};border-color:${c.border}">
      <span class="hm-label">C${i}</span>
      <span class="hm-val" style="color:${c.color}">${pct}%</span>
      <div class="hm-bar"><div class="hm-fill" style="width:${pct}%;background:${c.color}"></div></div>
    </div>`;
  }).join('');

  // Stress meter
  if (stressActive) {
    document.getElementById('stress-bar').style.width = d.cpu.percent + '%';
    document.getElementById('stress-status-text').textContent = `Running · CPU saat ini ${d.cpu.percent}%`;
  }

  // GPU
  if (d.gpu && d.gpu.length > 0) {
    document.getElementById('gpu-section').style.display = 'block';
    document.getElementById('gpu-cards').innerHTML = d.gpu.map(g => `
      <div class="gpu-card">
        <div class="gpu-name" style="color:#4ade80">${g.name}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Load</div>
        <div style="font-size:20px;font-weight:300;color:#fff">${g.load}%</div>
        <div class="bar-track" style="margin-top:6px"><div class="bar-fill" style="width:${g.load}%;background:linear-gradient(90deg,#16a34a,#4ade80)"></div></div>
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:6px">${g.temp}°C · VRAM ${g.mem_used}/${g.mem_total} MB</div>
      </div>`).join('');
  }

  // ── FIX CPU% — normalisasi per logical core ──
  const cores = d.cpu.threads || 1;
  document.getElementById('proc-list').innerHTML = d.processes.map(p => {
    const cpuNorm = normCpu(p.cpu, cores);
    return `<div class="proc-row">
      <span class="pc-pid">${p.pid}</span>
      <span class="pc-name">${p.name}</span>
      <span class="pc-cpu" style="color:${cpuColor(cpuNorm)}">${cpuNorm}%</span>
      <span class="pc-mem">${p.mem_mb > 1024 ? (p.mem_mb/1024).toFixed(1)+' GB' : p.mem_mb+' MB'}</span>
      <div class="pc-bar bar-track">
        <div class="bar-fill" style="width:${Math.min(100,cpuNorm)}%;background:${cpuColor(cpuNorm)};opacity:0.7"></div>
      </div>
      <span class="pc-st">${badgeHTML(cpuNorm)}</span>
    </div>`;
  }).join('');

  checkAlerts(d);

  // CSV log
  csvLog.push({ ts: new Date().toISOString(), cpu: d.cpu.percent, temp: d.cpu.temp,
    ram: d.ram.percent, ram_gb: d.ram.used_gb, read: d.disk.read_mbs, write: d.disk.write_mbs });
  if (csvLog.length > 3600) csvLog.shift();
}

// ── Uptime ────────────────────────────────────────────
setInterval(() => {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  document.getElementById('footer-uptime').textContent =
    `uptime: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}, 1000);

// ── PWA Installation & Live Status ──
let deferredPrompt;
const installBtn = document.getElementById('btn-pwa-install');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User installation choice: ${outcome}`);
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });
}

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (installBtn) {
    installBtn.style.display = 'none';
  }
  console.log('SysVista was successfully installed.');
});

function setLiveStatus(isLive) {
  const badge = document.querySelector('.live-badge');
  if (badge) {
    if (isLive) {
      badge.classList.remove('offline');
      badge.innerHTML = '<span class="live-dot"></span> live';
    } else {
      badge.classList.add('offline');
      badge.innerHTML = '<span class="live-dot offline-dot"></span> disconnected';
    }
  }
}

// ── SSE with AJAX Polling Fallback ───────────────────
let pollInterval = null;
let usePolling = false;

function startPolling() {
  if (pollInterval) return; // Already polling
  usePolling = true;
  console.log('[SSE] Switching to AJAX polling fallback...');
  pollInterval = setInterval(() => {
    fetch('/api/metrics')
      .then(r => r.json())
      .then(d => {
        render(d);
        setLiveStatus(true);
      })
      .catch(err => {
        console.error('[Polling] Error fetching metrics:', err);
        setLiveStatus(false);
      });
  }, 2000);
}

function connect() {
  if (usePolling) return;
  const es = new EventSource('/api/stream');
  
  // Timeout connection attempt after 5 seconds of no data
  let connectionTimeout = setTimeout(() => {
    console.warn('[SSE] Connection timeout. Falling back to polling.');
    es.close();
    startPolling();
  }, 5000);

  es.onmessage = e => {
    clearTimeout(connectionTimeout);
    try {
      const d = JSON.parse(e.data);
      if (!d.error) {
        render(d);
        setLiveStatus(true);
      } else {
        setLiveStatus(false);
      }
    } catch(err){
      setLiveStatus(false);
    }
  };

  es.onerror   = () => {
    clearTimeout(connectionTimeout);
    es.close();
    setLiveStatus(false);
    // Fall back to polling immediately if EventSource fails
    startPolling();
  };
}

fetch('/api/metrics')
  .then(r => r.json())
  .then(d => {
    render(d);
    setLiveStatus(true);
    // Try to connect SSE
    connect();
  })
  .catch(err => {
    console.error('[Initial Fetch] Error:', err);
    setLiveStatus(false);
    // If initial fetch succeeds but SSE fails, or even if initial fetch fails, start polling
    startPolling();
  });


