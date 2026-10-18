// Light as a wave: the wave tank. A live 2D Maxwell (FDTD) solver drawn as a ripple tank, with paintable glass and
// metal, movable sources, two probes on an oscilloscope and a detector screen.
import * as em from './physics.js';
import {experiments} from './scenarios.js';

const $ = id => document.getElementById(id);
const N = 200, B = 24, V = N - 2 * B, NM = 25;      // grid, absorbing border, visible cells, nm per cell
const RGB = {paper: [236, 228, 210], spot: [200, 84, 31], olive: [86, 97, 42], ink: [47, 54, 20], tint: [201, 201, 163], deep: [102, 41, 15], pale: [233, 185, 154]};
const C = {ink: '#2f3614', ink3: '#6a6f45', spot: '#c8541f', olive: '#56612a', paper2: '#f4eee0', trace: '#f0a35e', traceB: '#c9d27a'};
const HINTS = {
  move: 'Drag a source, probe A or B, or the screen. Hover over anything for its numbers.',
  glass: 'Paint glass into the tank. Set its index n below first; light in it moves at c/n.',
  metal: 'Paint metal: a perfect mirror. Light cannot get in.',
  erase: 'Rub out glass and metal, back to empty space.',
  source: 'Click to add an antenna (up to four). All are driven by the signal generator, in step.',
  ripple: 'Click to set off a single short ripple there.',
  screen: 'Click to place the detector screen at that distance. It records brightness across the tank.',
};

// ---------------------------------------------------------------- simulation
const field = em.createField({nx: N, ny: N, border: B});
const bright = new Float32Array(N * N);
const HIST = 1200, hist = {A: new Float32Array(HIST), B: new Float32Array(HIST), n: 0};

const lab = {
  exp: null, freq: 600, lines: true, speed: .5, playing: true, tool: 'move', brush: 8, n: 1.5, sourcesOn: true,
  sources: [], probes: {A: {i: 118, j: 100}, B: {i: 148, j: 100}}, screen: null,
  lambdaCells() { return em.nmForTHz(this.freq) / NM; },
  lambdaNm() { return em.nmForTHz(this.freq); },
  omega() { return em.omegaFor(this.lambdaCells()); },
  point(i, j) {
    if (this.sources.filter(s => s.kind === 'point').length >= 4) return;
    const s = em.pointSource(i, j, {omega: this.omega(), amp: 6});
    s.on = this.sourcesOn; this.sources.push(s); field.sources.push(s);
  },
  plane(i) {
    const s = em.lineSource(i, {omega: this.omega(), amp: 1});
    s.on = this.sourcesOn; this.sources.push(s); field.sources.push(s);
  },
  /** Fill cells where fn(i, j) is true with glass (index n) or metal. */
  material(fn, kind, n = this.n) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!fn(i, j)) continue;
      const k = j * N + i;
      if (kind === 'metal') { field.metal[k] = 1; field.eps[k] = 1; }
      else if (kind === 'glass') { field.metal[k] = 0; field.eps[k] = n * n; }
      else { field.metal[k] = 0; field.eps[k] = 1; }
    }
    field.rebuild();
  },
  probe(name, i, j) { this.probes[name] = {i, j}; },
  screenAt(i) { this.screen = i; },
  probeDistanceNm() { const a = this.probes.A, b = this.probes.B; return Math.hypot(a.i - b.i, a.j - b.j) * NM; },
  sourceGapNm() { const p = this.sources.filter(s => s.kind === 'point'); return p.length > 1 ? Math.hypot(p[0].i - p[1].i, p[0].j - p[1].j) * NM : 0; },
  indexAt(name) { const p = this.probes[name]; return Math.sqrt(field.eps[Math.round(p.j) * N + Math.round(p.i)]); },
  screenProfile() {
    if (this.screen == null) return null;
    const out = [];
    for (let j = B; j < N - B; j++) out.push(bright[j * N + this.screen]);
    return out;
  },
  screenPeaks() {
    const p = this.screenProfile();
    if (!p || field.t < 2 * V) return 0;
    const max = Math.max(...p);
    if (max <= 0) return 0;
    // Smooth over 5 cells, then count maxima above a fifth of the brightest, at least 6 cells apart.
    const q = p.map((_, k) => { let sum = 0, c = 0; for (let d = -2; d <= 2; d++) if (p[k + d] != null) { sum += p[k + d]; c++; } return sum / c; });
    let n = 0, last = -99;
    for (let k = 1; k < q.length - 1; k++) if (q[k] > .2 * max && q[k] >= q[k - 1] && q[k] > q[k + 1] && k - last >= 6) { n++; last = k; }
    return n;
  },
  screenWidthNm() {
    const p = this.screenProfile();
    if (!p || field.t < 2 * V) return 0;
    const max = Math.max(...p), k = p.indexOf(max);
    let a = k, b = k;
    while (a > 0 && p[a] > max / 2) a--;
    while (b < p.length - 1 && p[b] > max / 2) b++;
    return (b - a) * NM;
  },
};

function setFrequency(f) {
  lab.freq = Math.round(Math.max(400, Math.min(750, f)));
  for (const s of lab.sources) s.retune(lab.omega());
  renderGenerator();
}

function step() {
  field.step();
  const a = 1 / (6 * lab.lambdaCells());
  for (let j = B; j < N - B; j++) for (let i = B; i < N - B; i++) {
    const k = j * N + i, e = field.ez[k];
    bright[k] += (e * e - bright[k]) * a;
  }
  const at = p => field.ez[Math.round(p.j) * N + Math.round(p.i)];
  hist.A[hist.n % HIST] = at(lab.probes.A); hist.B[hist.n % HIST] = at(lab.probes.B); hist.n++;
}

// ---------------------------------------------------------------- the tank picture
const tank = $('c-tank'), tctx = tank.getContext('2d');
const img = new ImageData(V, V), off = new OffscreenCanvas(V, V), octx = off.getContext('2d');
let brightScale = 1e-6, size = 1, dpr = 1;
new ResizeObserver(() => {
  const r = tank.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
  size = r.width; tank.width = Math.round(r.width * dpr); tank.height = Math.round(r.height * dpr);
  draw();
}).observe(tank);
const px = i => (i - B + .5) * size / V;
const cellOf = x => x / size * V + B - .5;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function nearSource(i, j) {
  for (const s of lab.sources) if (s.kind === 'point' && Math.abs(s.i - i) < 5 && Math.abs(s.j - j) < 5) return true;
  return false;
}
function paintImage() {
  // Adaptive gain from the largest value away from the antennas, eased so the picture does not flicker.
  let mb = 0;
  for (let j = B; j < N - B; j += 2) for (let i = Math.max(B, lab.exp.gainFrom ?? B); i < N - B; i += 2) {
    if (nearSource(i, j)) continue;
    mb = Math.max(mb, bright[j * N + i]);
  }
  brightScale += (Math.max(mb, 1e-8) - brightScale) * .08;
  // Base: brightness (field squared, averaged over time). On top: thin ink lines where the field is at a crest now.
  const d = img.data;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = (j + B) * N + i + B, o = (j * V + i) * 4;
    let c;
    if (field.metal[k]) c = RGB.ink;
    else {
      const x = Math.min(1, bright[k] / brightScale);
      c = x < .3 ? mix(RGB.paper, RGB.pale, x / .3) : x < .7 ? mix(RGB.pale, RGB.spot, (x - .3) / .4) : mix(RGB.spot, RGB.deep, (x - .7) / .3);
      if (field.eps[k] > 1.001) c = mix(c, RGB.tint, .5);
      if (lab.lines && bright[k] > .015 * brightScale) {
        const v = field.ez[k] / Math.sqrt(2 * bright[k]);
        if (v > .94) c = mix(c, RGB.ink, Math.min(1, (v - .94) / .04) * .55);
      }
    }
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
}
function arrowHead(ctx, x, y, angle, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * .8, s * .6); ctx.lineTo(-s * .45, 0); ctx.lineTo(-s * .8, -s * .6); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function tag(ctx, s, x, y, color = C.ink) {
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  const w = ctx.measureText(s).width;
  ctx.fillStyle = 'rgba(244,238,224,.92)'; ctx.fillRect(x - 3, y - 11, w + 6, 15);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
let hover = null;
function draw() {
  if (!lab.exp) return;
  paintImage();
  const ctx = tctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, size, size);
  ctx.lineCap = 'round';
  // Glass outlines are implied by the tint; draw the screen and its brightness profile.
  if (lab.screen != null) {
    const x = px(lab.screen), p = lab.screenProfile(), max = Math.max(...p, 1e-12);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(200,84,31,.28)'; ctx.strokeStyle = C.spot; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x, 0);
    p.forEach((v, k) => ctx.lineTo(x + 3 + v / max * size * .1, px(k + B)));
    ctx.lineTo(x, size); ctx.closePath(); ctx.fill(); ctx.stroke();
    tag(ctx, 'SCREEN', x + 6, 16);
  }
  // Sources.
  for (const s of lab.sources) {
    if (s.kind === 'line') {
      const x = px(s.i);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 1; k < 6; k++) arrowHead(ctx, x + 10, size * k / 6, 0, 6, C.ink);
      tag(ctx, 'PLANE WAVE →', x + 4, 16);
    } else {
      const x = px(s.i), y = px(s.j);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      for (const r of [9, 14]) { ctx.beginPath(); ctx.arc(x, y, r, -.7, .7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r, Math.PI - .7, Math.PI + .7); ctx.stroke(); }
      ctx.fillStyle = s.on ? C.spot : C.ink3; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
  }
  // Probes.
  for (const [name, color] of [['A', C.spot], ['B', '#7d8a2a']]) {
    const p = lab.probes[name], x = px(p.i), y = px(p.j);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 13, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 13, y); ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 13); ctx.stroke();
    tag(ctx, name, x + 11, y - 9, color === C.spot ? C.spot : C.ink);
  }
  // Scale bar: 1 µm.
  const bar = 1000 / NM * size / V;
  ctx.fillStyle = 'rgba(244,238,224,.92)'; ctx.fillRect(8, size - 26, bar + 16, 20);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(16, size - 12); ctx.lineTo(16 + bar, size - 12); ctx.moveTo(16, size - 16); ctx.lineTo(16, size - 8); ctx.moveTo(16 + bar, size - 16); ctx.lineTo(16 + bar, size - 8); ctx.stroke();
  ctx.font = '700 10px Inter, system-ui, sans-serif'; ctx.fillStyle = C.ink; ctx.fillText('1 µm', 20 + bar / 2 - 12, size - 15);
  if (hover?.brush) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(hover.x, hover.y, lab.brush * size / V, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
  drawScope();
}

// ---------------------------------------------------------------- oscilloscope
const scope = $('c-scope'), sctx = scope.getContext('2d');
function drawScope() {
  const r = scope.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  if (scope.width !== Math.round(r.width * d)) { scope.width = Math.round(r.width * d); scope.height = Math.round(r.height * d); }
  const w = r.width, h = r.height, ctx = sctx;
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
  const perStep = field.dt, period = lab.lambdaCells(), win = Math.min(HIST, Math.round(4 * period / perStep)), n = Math.min(win, hist.n);
  // Graticule.
  ctx.strokeStyle = 'rgba(201,201,163,.16)'; ctx.lineWidth = 1;
  for (let k = 1; k < 8; k++) { ctx.beginPath(); ctx.moveTo(w * k / 8, 0); ctx.lineTo(w * k / 8, h); ctx.stroke(); }
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(0, h * k / 4); ctx.lineTo(w, h * k / 4); ctx.stroke(); }
  if (n < 2) return;
  let max = 1e-9;
  for (let k = 0; k < n; k++) { const idx = (hist.n - 1 - k) % HIST; max = Math.max(max, Math.abs(hist.A[idx]), Math.abs(hist.B[idx])); }
  for (const [key, color] of [['B', C.traceB], ['A', C.trace]]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const idx = (hist.n - n + k) % HIST, x = w * (k + win - n) / win, y = h / 2 - hist[key][idx] / max * h * .42;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
  }
  const rms = key => { let s = 0; for (let k = 0; k < n; k++) { const v = hist[key][(hist.n - 1 - k) % HIST]; s += v * v; } return Math.sqrt(s / n); };
  const a = rms('A'), b = rms('B'), top = Math.max(a, b, 1e-12);
  $('amp-a').textContent = `${Math.round(a / top * 100)}%`; $('amp-b').textContent = `${Math.round(b / top * 100)}%`;
  $('scope-t').textContent = `${(4 * 1e6 / lab.freq / 1000).toFixed(2)} fs across`;
}

// ---------------------------------------------------------------- the rack
function wavelengthColor(nm) {
  // Approximate sRGB of a pure spectral colour (Bruton), with intensity falloff at the ends of the visible range.
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else r = 1;
  const f = nm < 420 ? .3 + .7 * (nm - 380) / 40 : nm > 700 ? .3 + .7 * (780 - nm) / 80 : 1;
  return `rgb(${[r, g, b].map(v => Math.round(255 * (v * f) ** .8)).join(',')})`;
}
const colourName = nm => nm < 450 ? 'violet' : nm < 495 ? 'blue' : nm < 520 ? 'cyan' : nm < 565 ? 'green' : nm < 590 ? 'yellow' : nm < 625 ? 'orange' : 'red';
function renderKnob() {
  const svg = $('knob-f'), t = (lab.freq - 400) / 350, a = (-135 + 270 * t) * Math.PI / 180;
  let ticks = '';
  for (let f = 400; f <= 750; f += 10) {
    const u = (-135 + 270 * (f - 400) / 350) * Math.PI / 180, r1 = 34, r2 = f % 50 ? 37 : 39.5;
    ticks += `<line x1="${40 + Math.sin(u) * r1}" y1="${40 - Math.cos(u) * r1}" x2="${40 + Math.sin(u) * r2}" y2="${40 - Math.cos(u) * r2}" stroke="${wavelengthColor(em.nmForTHz(f))}" stroke-width="${f % 50 ? 1.6 : 2.6}"/>`;
  }
  svg.innerHTML = `${ticks}<circle cx="40" cy="40" r="29" fill="#2f3614"/><circle cx="40" cy="40" r="25" fill="#454d22" stroke="#1f2410" stroke-width="2"/>
    <line x1="${40 + Math.sin(a) * 8}" y1="${40 - Math.cos(a) * 8}" x2="${40 + Math.sin(a) * 23}" y2="${40 - Math.cos(a) * 23}" stroke="#f0a35e" stroke-width="3.5" stroke-linecap="round"/>`;
  svg.setAttribute('aria-valuenow', lab.freq); svg.setAttribute('aria-valuemin', 400); svg.setAttribute('aria-valuemax', 750);
  svg.setAttribute('aria-valuetext', `${lab.freq} terahertz`);
}
function renderGenerator() {
  renderKnob();
  const nm = lab.lambdaNm(), col = wavelengthColor(nm);
  $('lcd-f').innerHTML = `<span>Frequency</span>${lab.freq} THz<br><span>Wavelength</span>${nm.toFixed(0)} nm<br><span>Period</span>${(1e3 / lab.freq).toFixed(2)} fs<br><span>Colour</span><i class="swatch" style="--c:${col}"></i> ${colourName(nm)}`;
}
function renderExperiment() {
  const x = lab.exp;
  $('presets').innerHTML = experiments.map((e, k) => `<button class="key${e === x ? ' on' : ''}" data-id="${e.id}" aria-pressed="${e === x}"><i class="led"></i>${k + 1} ${e.label}</button>`).join('');
  $('notes-card').innerHTML = `<h1>${x.title}</h1>${x.text}<div class="formula">${x.formula}<small>${x.note}</small></div>
    <p class="eyebrow">Try</p><ul class="try">${x.tries.map(t => `<li>${t}</li>`).join('')}</ul><div class="insight" id="insight"></div>`;
  renderView();
}
function renderView() {
  const b = $('lines'); b.classList.toggle('on', lab.lines); b.setAttribute('aria-pressed', String(lab.lines));
  $('caption').innerHTML = '<b>Shading</b>: how bright the light is at each place, averaged over time, which is what your eye or a camera would record. Dark bands are where waves cancel. ' +
    (lab.lines ? '<b>Ink lines</b>: the wave crests at this instant, drifting outwards at the speed of light, slowed down about 10¹⁵ times.' : 'Turn on <b>Crest lines</b> to see the waves themselves move.');
  $('legend').innerHTML = '<span><i style="--c:#e9b99a"></i>Dim</span><span><i style="--c:#c8541f"></i>Bright</span><span><i style="--c:#66290f"></i>Brightest</span>' +
    (lab.lines ? '<span><i style="--c:#2f3614;height:3px"></i>Crest</span>' : '') + '<span><i style="--c:#c9c9a3"></i>Glass</span><span><i style="--c:#2f3614"></i>Metal</span>';
}
function renderInsight() { const el = $('insight'); if (el) el.innerHTML = lab.exp.insight(lab); }

/** Runs the tank forward quickly, unseen, so the steady pattern is already there. */
function settle(steps) {
  for (let k = 0; k < steps; k++) step();
  brightScale = 1e-6; paintImage(); brightScale = Math.max(brightScale, 1e-8);
}

function load(x) {
  lab.exp = x; lab.sources = []; lab.screen = null;
  field.sources.length = 0; field.clear(); field.eps.fill(1); field.metal.fill(0); field.rebuild();
  bright.fill(0); hist.n = 0; hist.A.fill(0); hist.B.fill(0); brightScale = 1e-6;
  x.setup(lab);
  settle(2.4 * V / field.dt);
  renderExperiment(); renderGenerator(); renderInsight(); draw();
}

// ---------------------------------------------------------------- interaction
function setTool(tool) {
  lab.tool = tool;
  for (const b of document.querySelectorAll('[data-tool]')) { b.classList.toggle('on', b.dataset.tool === tool); b.setAttribute('aria-pressed', String(b.dataset.tool === tool)); }
  $('tool-hint').textContent = HINTS[tool];
  tank.classList.toggle('move', tool === 'move');
}
const cellAt = event => { const r = tank.getBoundingClientRect(); return [cellOf(event.clientX - r.left), cellOf(event.clientY - r.top), event.clientX - r.left, event.clientY - r.top]; };
const clampCell = v => Math.max(B + 1, Math.min(N - B - 2, v));
function grab(i, j) {
  const near = (a, b, r = 4.5) => Math.hypot(a - i, b - j) < r * V / size * 3;
  for (const name of ['A', 'B']) if (near(lab.probes[name].i, lab.probes[name].j)) return {kind: 'probe', name};
  for (const s of lab.sources) {
    if (s.kind === 'point' && near(s.i, s.j)) return {kind: 'source', s};
    if (s.kind === 'line' && Math.abs(s.i - i) < 3) return {kind: 'line', s};
  }
  if (lab.screen != null && Math.abs(lab.screen - i) < 3) return {kind: 'screen'};
  return null;
}
let drag = null, lastPaint = null;
function paint(i, j) {
  const r = lab.brush, kind = lab.tool === 'erase' ? 'air' : lab.tool;
  const from = lastPaint ?? [i, j], steps = Math.max(1, Math.ceil(Math.hypot(i - from[0], j - from[1]) / (r / 2)));
  for (let s = 1; s <= steps; s++) {
    const ci = from[0] + (i - from[0]) * s / steps, cj = from[1] + (j - from[1]) * s / steps;
    for (let y = Math.floor(cj - r); y <= cj + r; y++) for (let x = Math.floor(ci - r); x <= ci + r; x++) {
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1 || (x - ci) ** 2 + (y - cj) ** 2 > r * r) continue;
      const k = y * N + x;
      if (kind === 'metal') { field.metal[k] = 1; field.eps[k] = 1; field.ez[k] = 0; }
      else if (kind === 'glass') { field.metal[k] = 0; field.eps[k] = lab.n * lab.n; }
      else { field.metal[k] = 0; field.eps[k] = 1; }
    }
  }
  lastPaint = [i, j];
  field.rebuild();
}
tank.addEventListener('pointerdown', event => {
  const [i, j] = cellAt(event);
  tank.setPointerCapture(event.pointerId);
  if (lab.tool === 'move') drag = grab(i, j);
  else if (['glass', 'metal', 'erase'].includes(lab.tool)) { drag = {kind: 'paint'}; lastPaint = null; paint(i, j); }
  else if (lab.tool === 'source') lab.point(Math.round(clampCell(i)), Math.round(clampCell(j)));
  else if (lab.tool === 'ripple') field.sources.push(em.pulse({i: Math.round(clampCell(i)), j: Math.round(clampCell(j)), t0: field.t + 6, width: 2.5, amp: 8}));
  else if (lab.tool === 'screen') lab.screen = Math.round(clampCell(i));
  draw();
});
tank.addEventListener('pointermove', event => {
  const [i, j, x, y] = cellAt(event);
  hover = ['glass', 'metal', 'erase'].includes(lab.tool) ? {brush: true, x, y} : null;
  if (drag?.kind === 'paint') paint(i, j);
  else if (drag?.kind === 'probe') lab.probes[drag.name] = {i: clampCell(i), j: clampCell(j)};
  else if (drag?.kind === 'source') { drag.s.i = Math.round(clampCell(i)); drag.s.j = Math.round(clampCell(j)); }
  else if (drag?.kind === 'line') drag.s.i = Math.round(clampCell(i));
  else if (drag?.kind === 'screen') lab.screen = Math.round(clampCell(i));
  if (drag) bright.fill(0);
  if (drag && drag.kind !== 'paint') showTip(event, null);
  else if (!drag) {
    const g = lab.tool === 'move' && grab(i, j);
    const k = Math.round(j) * N + Math.round(i), n = Math.sqrt(field.eps[k]);
    showTip(event, g?.kind === 'probe' ? `<b>Probe ${g.name}</b>Its field is traced on the oscilloscope. Drag it.` :
      g?.kind === 'source' ? `<b>Antenna</b>Driven at ${lab.freq} THz by the signal generator. Drag it.` :
      g?.kind === 'line' ? '<b>Plane-wave source</b>A whole line of antennas in step, making straight wavefronts. Drag it sideways.' :
      g?.kind === 'screen' ? '<b>Screen</b>Shows how bright the light is along it. Drag it.' :
      field.metal[k] ? '<b>Metal</b>The field is zero inside: light reflects.' :
      n > 1.001 ? `<b>Glass, n = ${n.toFixed(2)}</b>Light moves at ${(1 / n).toFixed(2)} c here, with wavelength ${(lab.lambdaNm() / n).toFixed(0)} nm.` : null);
  }
  if (!lab.playing) draw();
});
const end = () => {
  // After a change, run ahead briefly so the new steady pattern appears straight away.
  if (drag && drag.kind !== 'probe') settle(1.4 * V / field.dt);
  drag = null; lastPaint = null; tank.classList.remove('grab');
};
tank.addEventListener('pointerup', end);
tank.addEventListener('pointercancel', end);
tank.addEventListener('pointerleave', () => { hover = null; showTip(null); });
function showTip(event, html) {
  const tip = $('tip');
  if (!html) { tip.classList.remove('visible'); return; }
  tip.innerHTML = html; tip.classList.add('visible');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(innerWidth - w - 10, event.clientX + 16)}px, ${Math.max(10, Math.min(innerHeight - h - 10, event.clientY - h - 12))}px)`;
}

// Frequency knob: drag up or down, scroll, or use the arrow keys.
const knob = $('knob-f');
let knobDrag = null;
knob.addEventListener('pointerdown', event => { knob.setPointerCapture(event.pointerId); knobDrag = {y: event.clientY, f: lab.freq}; });
knob.addEventListener('pointermove', event => { if (knobDrag) setFrequency(knobDrag.f + (knobDrag.y - event.clientY) * 1.6); });
knob.addEventListener('pointerup', () => { knobDrag = null; });
knob.addEventListener('wheel', event => { event.preventDefault(); setFrequency(lab.freq + (event.deltaY < 0 ? 5 : -5)); }, {passive: false});
knob.addEventListener('keydown', event => {
  const d = {ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 25, PageDown: -25}[event.key];
  if (d) { event.preventDefault(); event.stopPropagation(); setFrequency(lab.freq + d); }
});

$('presets').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) load(experiments.find(x => x.id === b.dataset.id)); });
$('tools').addEventListener('click', event => { const b = event.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
$('clear').onclick = () => { field.eps.fill(1); field.metal.fill(0); field.rebuild(); bright.fill(0); draw(); };
$('size').oninput = event => { lab.brush = +event.target.value; $('out-size').textContent = `${(lab.brush * NM / 1000).toFixed(2)} µm`; };
$('n').oninput = event => { lab.n = +event.target.value; $('out-n').textContent = lab.n.toFixed(2); };
$('pulse').onclick = () => {
  for (const s of lab.sources) {
    if (s.kind === 'point') field.sources.push(em.pulse({i: s.i, j: s.j, t0: field.t + 6, width: 2.5, amp: 8}));
    else field.sources.push(em.pulse({i: s.i, t0: field.t + 6, width: 2.5, amp: 1.4}));
  }
};
$('sources-on').onclick = event => {
  lab.sourcesOn = !lab.sourcesOn;
  for (const s of lab.sources) s.on = lab.sourcesOn;
  event.currentTarget.classList.toggle('on', lab.sourcesOn); event.currentTarget.setAttribute('aria-pressed', String(lab.sourcesOn));
};
$('lines').onclick = () => { lab.lines = !lab.lines; renderView(); draw(); };
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => {
  lab.speed = +b.dataset.speed;
  for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', x === b);
};
const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';
function setPlaying(on) { lab.playing = on; $('play').innerHTML = on ? ICON_PAUSE : ICON_PLAY; $('play').setAttribute('aria-label', on ? 'Pause' : 'Play'); }
$('play').onclick = () => setPlaying(!lab.playing);
$('restart').onclick = () => load(lab.exp);
const about = $('about-dialog');
$('about').onclick = () => about.showModal();
about.querySelector('.close').onclick = () => about.close();
about.addEventListener('click', event => { if (event.target === about) about.close(); });
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open], [role=slider]')) return;
  if (event.key === ' ') { event.preventDefault(); setPlaying(!lab.playing); }
  else if (event.key === 'r' || event.key === 'R') load(lab.exp);
  else if (event.key === 'v' || event.key === 'V') { lab.lines = !lab.lines; renderView(); }
  else if (/^[1-8]$/.test(event.key)) load(experiments[+event.key - 1]);
});

// ---------------------------------------------------------------- loop
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastInsight = 0, stepDebt = 0;
function frame(now) {
  if (lab.playing) {
    stepDebt += reducedMotion ? lab.speed / 4 : lab.speed;
    for (; stepDebt >= 1; stepDebt--) step();
  }
  draw();
  if (now - lastInsight > 400) { lastInsight = now; renderInsight(); }
  requestAnimationFrame(frame);
}
setTool('move');
setPlaying(true);
load(experiments[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__light = {
    lab, field, experiments,
    load: id => load(experiments.find(x => x.id === id)),
    run: steps => { for (let k = 0; k < steps; k++) step(); renderInsight(); draw(); return field.t; },
    setFrequency,
    snap: () => ({t: field.t, freq: lab.freq, lines: lab.lines, sources: lab.sources.length, screen: lab.screen, insight: $('insight')?.textContent}),
  };
}
