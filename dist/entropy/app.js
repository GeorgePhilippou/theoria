// Entropy and time's arrow: the time deck. An exactly reversible gas (physics.js) with transport keys, a needle
// meter and chart recorder for the entropy, a speed meter, and a film strip recording you can replay from.
import * as gasLib from './physics.js';
import {reels} from './scenarios.js';

const $ = id => document.getElementById(id);
const C = {ink: '#2f3614', ink2: '#454d22', ink3: '#6a6f45', ink4: '#8a8c68', olive: '#56612a', spot: '#c8541f', tint: '#c9c9a3', cream: '#f3ecdc', chart: '#e9eed9', paper: '#ece4d2'};
const CELLS = {cols: 8, rows: 5}, NUDGE = 3, TIME_RATE = 3, SAMPLE = 25, FRAME_EVERY = 2, MAX_FRAMES = 12, BINS = 24;
const rgb = {olive: [86, 97, 42], spot: [200, 84, 31]};

const lab = {
  reel: null, gas: null, rate: 1, playing: true, nudge: false, colour: 'origin', cells: true,
  history: [], s0: 0, latest: {total: 0, max: 1, kT: 1}, frames: [], lastFrameT: -Infinity, tracked: -1, trail: [], armed: null,
  start: 'spread', freeN: 300, gap: false, leftSamples: 0, allLeft: 0,
  rise() { return this.latest.total - this.s0; },
  allLeftShare() { return this.leftSamples ? this.allLeft / this.leftSamples : 0; },
  leftNow() { return gasLib.leftFraction(this.gas); },
};

// ---------------------------------------------------------------- loading and sampling
function load(reel) {
  lab.reel = reel;
  const kind = reel.free ? lab.start : reel.kind, n = reel.free ? lab.freeN : reel.n;
  lab.gas = gasLib.experiment(kind, {n, seed: 7});
  if (reel.free && lab.gap) {
    const w = lab.gas.walls.find(v => v.middle) ?? (lab.gas.walls.push({x: lab.gas.width / 2, from: -Infinity, until: Infinity, gap: null, middle: true}), lab.gas.walls.at(-1));
    w.until = Infinity; w.gap = [lab.gas.height / 2 - 1.1, lab.gas.height / 2 + 1.1];
  }
  lab.nudge = !!reel.nudge; setNudge(lab.nudge);
  lab.armed = reel.autoReverse ? {...reel.autoReverse} : null;
  lab.history = []; lab.frames = []; lab.lastFrameT = -Infinity; lab.tracked = -1; lab.trail = []; lab.leftSamples = 0; lab.allLeft = 0;
  setRate(reel.rate ?? 1);
  sample(true); lab.s0 = lab.latest.total;
  setPlaying(true);
  renderReel(); renderStrip(); drawAll();
}
function sample(force = false) {
  const g = lab.gas;
  if (!force && g.index % SAMPLE !== 0) return;
  g.refresh();
  lab.latest = gasLib.entropy(g, CELLS);
  lab.history.push({t: g.t, s: lab.latest.total, dir: g.direction});
  if (lab.history.length > 4000) lab.history.splice(0, 1000);
  if (!g.partitioned && g.t > gasLib.LIFT_TIME + 5) { lab.leftSamples++; const f = gasLib.leftFraction(g); if (f === 1 || f === 0) lab.allLeft++; }
  if (lab.tracked >= 0) { lab.trail.push(g.position(lab.tracked)); if (lab.trail.length > 400) lab.trail.shift(); }
  if (Math.abs(g.t - lab.lastFrameT) >= FRAME_EVERY - 1e-9 || force) captureFrame();
}
function captureFrame() {
  const g = lab.gas;
  lab.lastFrameT = g.t;
  const cv = document.createElement('canvas'); cv.width = 192; cv.height = 112;
  drawGas(cv.getContext('2d'), 192, 112, 2, true);
  lab.frames.push({state: g.save(), t: g.t, dir: g.direction, thumb: cv});
  if (lab.frames.length > MAX_FRAMES) lab.frames.splice(1, 1);      // keep the first frame, thin out the rest
  renderStrip();
}
function step(count) {
  const g = lab.gas;
  for (let k = 0; k < count; k++) {
    g.step(1);
    sample();
    if (lab.armed && g.direction > 0 && g.t >= lab.armed.at) { reverse(lab.armed.nudge); lab.armed = null; }
  }
}
function reverse(nudge = lab.nudge) {
  const g = lab.gas;
  g.reverse(nudge ? NUDGE : 0, lab.tracked >= 0 ? lab.tracked : 0);
  sample(true);
  renderTransport();
}

// ---------------------------------------------------------------- drawing
const figs = {};
for (const id of ['gas', 'needle', 'speeds', 'chart']) {
  const canvas = $(`c-${id}`);
  figs[id] = {canvas, ctx: canvas.getContext('2d'), w: 1, h: 1, dpr: 1};
}
new ResizeObserver(() => {
  for (const f of Object.values(figs)) {
    const r = f.canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    Object.assign(f, {w: r.width, h: r.height, dpr: d});
    f.canvas.width = Math.round(r.width * d); f.canvas.height = Math.round(r.height * d);
  }
  drawAll();
}).observe(document.querySelector('.deck'));
function begin(f) { const {ctx, dpr, w, h} = f; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.lineCap = 'round'; return ctx; }
function boxMap(w, h) {
  const g = lab.gas, k = Math.min(w / g.width, h / g.height), ox = (w - g.width * k) / 2, oy = (h - g.height * k) / 2;
  return {k, ox, oy, to: (x, y) => [ox + x * k, oy + (g.height - y) * k]};
}
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
function drawGas(ctx, w, h, scale = 1, thumb = false) {
  const g = lab.gas, m = boxMap(w / scale, h / scale);
  ctx.save(); ctx.scale(scale, scale);
  ctx.fillStyle = C.cream; ctx.fillRect(m.ox, m.oy, g.width * m.k, g.height * m.k);
  // Counting cells: shaded by how many atoms are in each.
  if (lab.cells && !thumb) {
    const counts = new Array(CELLS.cols * CELLS.rows).fill(0);
    for (let i = 0; i < g.n; i++) {
      const [x, y] = g.position(i);
      counts[Math.min(CELLS.rows - 1, Math.max(0, Math.floor(y / g.height * CELLS.rows))) * CELLS.cols + Math.min(CELLS.cols - 1, Math.max(0, Math.floor(x / g.width * CELLS.cols)))]++;
    }
    const even = g.n / counts.length, cw = g.width / CELLS.cols * m.k, ch = g.height / CELLS.rows * m.k;
    counts.forEach((c, idx) => {
      const col = idx % CELLS.cols, row = Math.floor(idx / CELLS.cols), x = m.ox + col * cw, y = m.oy + (CELLS.rows - 1 - row) * ch;
      ctx.fillStyle = `rgba(201,201,163,${Math.min(.6, c / even * .22)})`; ctx.fillRect(x, y, cw, ch);
      if (g.n <= 500 && cw > 34) { ctx.fillStyle = C.ink4; ctx.font = '700 10px "Space Mono", monospace'; ctx.fillText(String(c), x + 4, y + 13); }
    });
    ctx.strokeStyle = 'rgba(86,97,42,.22)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    for (let c = 1; c < CELLS.cols; c++) { const x = m.ox + c * cw; ctx.beginPath(); ctx.moveTo(x, m.oy); ctx.lineTo(x, m.oy + g.height * m.k); ctx.stroke(); }
    for (let r = 1; r < CELLS.rows; r++) { const y = m.oy + r * ch; ctx.beginPath(); ctx.moveTo(m.ox, y); ctx.lineTo(m.ox + g.width * m.k, y); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // Trail of the followed atom.
  if (lab.tracked >= 0 && lab.trail.length > 1 && !thumb) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.globalAlpha = .7; ctx.beginPath();
    lab.trail.forEach(([x, y], i) => { const [px, py] = m.to(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  // Atoms.
  const r = Math.max(thumb ? 1.2 : 1.6, g.radius * m.k), vmax = 2.2 * Math.sqrt(Math.max(.05, lab.latest.kT));
  for (let i = 0; i < g.n; i++) {
    const [x, y] = g.position(i), [px, py] = m.to(x, y);
    if (lab.colour === 'speed') { const [u, v] = g.velocity(i); ctx.fillStyle = mix(rgb.olive, rgb.spot, Math.min(1, Math.hypot(u, v) / vmax)); }
    else ctx.fillStyle = g.origin[i] === 0 ? C.spot : C.olive;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
  }
  if (lab.tracked >= 0 && !thumb) {
    const [px, py] = m.to(...g.position(lab.tracked));
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 2 * Math.PI); ctx.stroke();
  }
  // Walls.
  ctx.strokeStyle = C.ink; ctx.lineWidth = thumb ? 2 : 3;
  ctx.strokeRect(m.ox, m.oy, g.width * m.k, g.height * m.k);
  for (const wl of g.walls) {
    if (!(g.index >= wl.from && g.index < wl.until)) continue;
    const [x0, yTop] = m.to(wl.x, g.height), [, yBot] = m.to(wl.x, 0);
    ctx.lineWidth = thumb ? 2 : 4;
    if (wl.gap) {
      const [, ga] = m.to(wl.x, wl.gap[1]), [, gb] = m.to(wl.x, wl.gap[0]);
      ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x0, ga); ctx.moveTo(x0, gb); ctx.lineTo(x0, yBot); ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot); ctx.stroke(); }
  }
  ctx.restore();
}
function sRange() {
  const ss = lab.history.map(h => h.s);
  const lo = Math.min(...ss, lab.s0) - .15, hi = Math.max(lab.latest.max, ...ss) + .1;
  return [lo, hi];
}
let needleS = null;
function drawNeedle() {
  const f = figs.needle, ctx = begin(f), {w, h} = f, cx = w / 2, cy = h - 10, R = Math.min(w / 2 - 10, h - 22);
  const [lo, hi] = sRange(), a0 = Math.PI * 1.1, a1 = Math.PI * 1.9, ang = s => a0 + (a1 - a0) * Math.max(0, Math.min(1, (s - lo) / (hi - lo)));
  ctx.strokeStyle = C.ink3; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
  for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R - (k % 5 ? 5 : 9)), cy + Math.sin(a) * (R - (k % 5 ? 5 : 9))); ctx.stroke(); }
  // The equilibrium maximum, and the start.
  for (const [s, col] of [[lab.latest.max, C.ink4], [lab.s0, C.olive]]) {
    const a = ang(s); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, R + 3, a - .03, a + .03); ctx.stroke();
  }
  needleS = needleS == null ? lab.latest.total : needleS + (lab.latest.total - needleS) * .15;
  const a = ang(needleS);
  ctx.strokeStyle = lab.gas.direction > 0 ? C.ink : C.spot; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); ctx.stroke();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI); ctx.fill();
  ctx.font = '700 9px "Space Mono", monospace'; ctx.fillStyle = C.ink3; ctx.textAlign = 'left'; ctx.fillText('ORDER', 4, cy); ctx.textAlign = 'right'; ctx.fillText('MAX', w - 4, cy); ctx.textAlign = 'left';
  $('read-s').innerHTML = `S = <b>${lab.latest.total.toFixed(2)}</b> k · max ${lab.latest.max.toFixed(2)}`;
}
function drawSpeeds() {
  const f = figs.speeds, ctx = begin(f), {w, h} = f, kT = Math.max(.02, lab.latest.kT), vmax = 4 * Math.sqrt(kT);
  const hist = gasLib.speedHistogram(lab.gas, BINS, vmax), n = lab.gas.n, bw = (w - 8) / BINS, base = h - 6;
  const scaleY = (h - 14) / Math.max(...[...hist].map(c => c / n / (vmax / BINS)), 1 / Math.sqrt(kT) * .7);
  ctx.fillStyle = C.ink;
  hist.forEach((c, i) => { const v = c / n / (vmax / BINS) * scaleY; ctx.fillRect(4 + i * bw + 1, base - v, bw - 2, v); });
  ctx.strokeStyle = C.spot; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 60; i++) { const v = vmax * i / 60, y = base - gasLib.maxwell(v, kT) * scaleY; i ? ctx.lineTo(4 + (w - 8) * i / 60, y) : ctx.moveTo(4, y); }
  ctx.stroke();
  ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, base); ctx.lineTo(w - 2, base); ctx.stroke();
  $('read-t').innerHTML = `kT = <b>${kT.toFixed(2)}</b> · curve: Maxwell–Boltzmann`;
}
function drawChart() {
  const f = figs.chart, ctx = begin(f), {w, h} = f, [lo, hi] = sRange();
  ctx.fillStyle = C.chart; ctx.fillRect(0, 0, w, h);
  const tMax = Math.max(16, ...lab.history.map(p => p.t)) + 1, tMin = Math.min(0, ...lab.history.map(p => p.t));
  const X = t => 30 + (t - tMin) / (tMax - tMin) * (w - 38), Y = s => h - 16 - (s - lo) / (hi - lo) * (h - 26);
  ctx.strokeStyle = 'rgba(86,97,42,.18)'; ctx.lineWidth = 1;
  for (let t = Math.ceil(tMin / 5) * 5; t <= tMax; t += 5) { ctx.beginPath(); ctx.moveTo(X(t), 4); ctx.lineTo(X(t), h - 16); ctx.stroke(); ctx.fillStyle = C.ink4; ctx.font = '9px "Space Mono", monospace'; ctx.fillText(`${t}`, X(t) - 4, h - 4); }
  ctx.setLineDash([5, 4]); ctx.strokeStyle = C.ink4; ctx.beginPath(); ctx.moveTo(30, Y(lab.latest.max)); ctx.lineTo(w - 6, Y(lab.latest.max)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.ink4; ctx.fillText('max', 4, Y(lab.latest.max) + 3); ctx.fillText('S', 4, 12);
  // The pen: olive forwards, orange backwards (time is plotted as the deck's clock, so a reversal retraces).
  for (let i = 1; i < lab.history.length; i++) {
    const a = lab.history[i - 1], b = lab.history[i];
    ctx.strokeStyle = b.dir > 0 ? C.olive : C.spot; ctx.lineWidth = b.dir > 0 ? 1.8 : 2.4;
    ctx.beginPath(); ctx.moveTo(X(a.t), Y(a.s)); ctx.lineTo(X(b.t), Y(b.s)); ctx.stroke();
  }
  const last = lab.history.at(-1);
  if (last) { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(X(last.t), Y(last.s), 3, 0, 2 * Math.PI); ctx.fill(); }
  const dS = lab.latest.total - Math.min(...lab.history.map(p => p.s)), ex = gasLib.oddsExponent(dS, lab.gas.n);
  $('read-odds').innerHTML = ex > 2 ? `Chance it returns to its lowest point by itself: about <b>1 in 10<sup>${Math.round(ex)}</sup></b>.` : `Chance it returns to its lowest point by itself: about <b>1 in ${Math.max(1, Math.round(10 ** ex))}</b>.`;
}
function drawAll() {
  if (!lab.gas || figs.gas.w < 20 || figs.needle.w < 20) return;      // not laid out yet
  const f = figs.gas, ctx = begin(f);
  drawGas(ctx, f.w, f.h);
  drawNeedle(); drawSpeeds(); drawChart();
  $('digits').textContent = `${lab.gas.t < 0 ? '-' : ''}${Math.abs(lab.gas.t).toFixed(1).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- panels
function renderReel() {
  const r = lab.reel;
  $('reels').innerHTML = reels.map((x, i) => `<button class="sw${x === r ? ' on' : ''}" data-id="${x.id}"><i>${i + 1}</i>${x.label}</button>`).join('');
  $('card').innerHTML = `<h1>${r.title}</h1>${r.text}<div class="formula">${r.formula}<small>${r.note}</small></div>
    <p class="lbl">Try</p><ul class="try">${r.tries.map(t => `<li>${t}</li>`).join('')}</ul><div class="insight" id="insight"></div>`;
  $('free-controls').hidden = !r.free;
  $('n').value = lab.freeN; $('out-n').textContent = lab.freeN;
  for (const b of document.querySelectorAll('[data-start]')) b.classList.toggle('on', b.dataset.start === lab.start);
  $('gap').classList.toggle('on', lab.gap); $('gap').setAttribute('aria-pressed', String(lab.gap));
  $('caption').textContent = lab.colour === 'origin'
    ? 'Orange atoms started on the left, olive on the right. Shaded squares are the counting cells; darker means more atoms. Click an atom to follow it.'
    : 'Colour by speed: olive slow, orange fast. Click an atom to follow it.';
  renderTransport(); renderInsight();
}
function renderInsight() { const el = $('insight'); if (el) el.innerHTML = lab.reel.insight(lab); }
function renderTransport() {
  const g = lab.gas, back = g.direction < 0;
  $('counter').classList.toggle('back', back);
  $('direction').textContent = back ? '◀ time backwards' : '▶ time forwards';
  $('wall-label').textContent = g.partitioned ? 'Lift wall' : 'Lower wall';
  $('play-icon').textContent = lab.playing ? '❚❚' : '▶'; $('play-label').textContent = lab.playing ? 'Pause' : 'Play';
  $('play').classList.toggle('down', !lab.playing);
}
function renderStrip() {
  const strip = $('strip');
  if (!lab.frames.length) { strip.innerHTML = '<span class="empty">Frames appear here as the gas runs.</span>'; return; }
  strip.innerHTML = '';
  lab.frames.forEach((fr, i) => {
    const b = document.createElement('button');
    b.className = `frame${fr.dir < 0 ? ' back' : ''}`; b.title = `Replay from t = ${fr.t.toFixed(1)}`; b.dataset.i = i;
    b.append(fr.thumb); const s = document.createElement('span'); s.textContent = `${fr.dir < 0 ? '◀' : ''}t ${fr.t.toFixed(0)}`; b.append(s);
    strip.append(b);
  });
  strip.scrollLeft = strip.scrollWidth;
}

// ---------------------------------------------------------------- controls
function setPlaying(on) { lab.playing = on; if (lab.gas) renderTransport(); }
function setRate(r) { lab.rate = r; for (const b of document.querySelectorAll('[data-rate]')) b.classList.toggle('down', +b.dataset.rate === r); }
function setNudge(on) { lab.nudge = on; $('nudge').classList.toggle('down', on); $('nudge').setAttribute('aria-pressed', String(on)); $('nudge').querySelector('small').textContent = on ? 'Nudge: on' : 'Nudge: off'; }
function toggleWall() {
  const g = lab.gas;
  if (g.direction < 0) { showToast('Run time forwards to move the wall.'); return; }
  if (g.partitioned) for (const w of g.walls) { if (g.index >= w.from && g.index < w.until) w.until = g.index; }
  else g.walls.push({x: g.width / 2, from: g.index, until: Infinity, gap: lab.gap && lab.reel.free ? [g.height / 2 - 1.1, g.height / 2 + 1.1] : null});
  renderTransport(); drawAll();
}
function showToast(msg) { $('caption').textContent = msg; setTimeout(() => renderReel(), 2500); }
$('reverse').onclick = () => reverse();
$('play').onclick = () => setPlaying(!lab.playing);
$('nudge').onclick = () => setNudge(!lab.nudge);
$('restart').onclick = () => load(lab.reel);
$('wall').onclick = toggleWall;
for (const b of document.querySelectorAll('[data-rate]')) b.onclick = () => setRate(+b.dataset.rate);
for (const b of document.querySelectorAll('[data-colour]')) b.onclick = () => {
  lab.colour = b.dataset.colour;
  for (const x of document.querySelectorAll('[data-colour]')) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }
  renderReel(); drawAll();
};
$('t-cells').onclick = () => { lab.cells = !lab.cells; $('t-cells').classList.toggle('on', lab.cells); $('t-cells').setAttribute('aria-pressed', String(lab.cells)); drawAll(); };
$('reels').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) load(reels.find(r => r.id === b.dataset.id)); });
$('strip').addEventListener('click', event => {
  const b = event.target.closest('[data-i]');
  if (!b) return;
  const fr = lab.frames[+b.dataset.i];
  lab.gas.load(fr.state);
  // Keep the chart honest: drop what came after this frame in the recording.
  const keep = lab.history.findIndex(h => Math.abs(h.t - fr.t) < 1e-9 && h.dir === fr.dir);
  if (keep >= 0) lab.history.length = keep + 1;
  lab.frames.length = +b.dataset.i + 1; lab.lastFrameT = fr.t; lab.armed = null; lab.trail = [];
  sample(true); lab.frames.pop(); renderStrip();
  setPlaying(false); renderReel(); drawAll();
});
$('n').oninput = event => { lab.freeN = +event.target.value; $('out-n').textContent = lab.freeN; };
$('n').onchange = () => load(lab.reel);
for (const b of document.querySelectorAll('[data-start]')) b.onclick = () => { lab.start = b.dataset.start; load(lab.reel); };
$('gap').onclick = () => { lab.gap = !lab.gap; load(lab.reel); };
const gasCanvas = figs.gas.canvas;
gasCanvas.addEventListener('pointerdown', event => {
  const r = gasCanvas.getBoundingClientRect(), m = boxMap(r.width, r.height), g = lab.gas;
  let best = -1, bd = 14;
  for (let i = 0; i < g.n; i++) { const [px, py] = m.to(...g.position(i)), d = Math.hypot(px - (event.clientX - r.left), py - (event.clientY - r.top)); if (d < bd) { bd = d; best = i; } }
  lab.tracked = best === lab.tracked ? -1 : best; lab.trail = [];
  drawAll();
});
gasCanvas.addEventListener('pointermove', event => {
  const r = gasCanvas.getBoundingClientRect(), m = boxMap(r.width, r.height), g = lab.gas;
  let best = -1, bd = 10;
  for (let i = 0; i < g.n; i++) { const [px, py] = m.to(...g.position(i)), d = Math.hypot(px - (event.clientX - r.left), py - (event.clientY - r.top)); if (d < bd) { bd = d; best = i; } }
  const tip = $('tip');
  if (best < 0) { tip.classList.remove('visible'); return; }
  const [u, v] = g.velocity(best);
  tip.innerHTML = `<b>Atom ${best + 1}</b>speed ${Math.hypot(u, v).toFixed(2)} (typical ${Math.sqrt(2 * lab.latest.kT).toFixed(2)})<br>started on the ${g.origin[best] ? 'right' : 'left'}${best === lab.tracked ? '<br>followed: its path is drawn' : '<br>click to follow it'}`;
  tip.classList.add('visible');
  tip.style.transform = `translate(${Math.min(innerWidth - tip.offsetWidth - 10, event.clientX + 16)}px, ${Math.max(10, event.clientY - tip.offsetHeight - 12)}px)`;
});
gasCanvas.addEventListener('pointerleave', () => $('tip').classList.remove('visible'));
const notes = $('notes');
$('about').onclick = () => notes.showModal();
notes.querySelector('.close').onclick = () => notes.close();
notes.addEventListener('click', event => { if (event.target === notes) notes.close(); });
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open]')) return;
  if (event.key === ' ') { event.preventDefault(); setPlaying(!lab.playing); }
  else if (event.key === 'r' || event.key === 'R') reverse();
  else if (event.key === 'w' || event.key === 'W') toggleWall();
  else if (/^[1-7]$/.test(event.key)) load(reels[+event.key - 1]);
});

// ---------------------------------------------------------------- loop
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now(), debt = 0, lastInsight = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (lab.playing) {
    debt += dt * TIME_RATE * lab.rate * (reducedMotion ? .5 : 1) / lab.gas.dt;
    const n = Math.min(400, Math.floor(debt)); debt -= n;
    step(n);
  }
  drawAll();
  if (now - lastInsight > 400) { lastInsight = now; renderInsight(); renderTransport(); }
  requestAnimationFrame(frame);
}
load(reels[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__entropy = {
    lab, reels, load: id => load(reels.find(r => r.id === id)), reverse,
    run: time => { step(Math.round(time / lab.gas.dt)); renderInsight(); renderTransport(); drawAll(); return lab.gas.t; },
    snap: () => ({reel: lab.reel.id, t: lab.gas.t, dir: lab.gas.direction, S: lab.latest.total, max: lab.latest.max, left: gasLib.leftFraction(lab.gas), frames: lab.frames.length, insight: $('insight')?.textContent}),
  };
}
