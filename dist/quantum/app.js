// Quantum waves: the particle darkroom. A live Schrödinger solver printed as halftone dots, an emitter that fires one
// particle (one wave) at a time, and a photographic plate where each is found at a single place by the Born rule.
import * as q from './physics.js';
import {exposures, WALL} from './scenarios.js';

const $ = id => document.getElementById(id);
const NX = 256, NY = 128, LX = 128, LY = 64, DX = LX / NX, ABSORB = 16;
const PLATE = 44, SX = 6, T_MAX = 150, AUTO = 5;   // Keep firing sends five identical particles per wave
const C = {ink: '#2f3614', ink3: '#6a6f45', ink4: '#8a8c68', olive: '#56612a', oliveDark: '#3b4419', spot: '#c8541f', tint: '#c9c9a3', print: '#f2ebdc', film: '#3a3d26'};
const HINTS = {
  move: 'Drag the emitter to move it; drag the tip of its arrow to aim it and set its momentum.',
  look: 'Click in the chamber to look inside the circle: the particle is found there, or that part of the wave vanishes.',
  wall: 'Drag to paint a wall the particle cannot pass.',
  barrier: 'Drag to paint a barrier of the height below: low enough to tunnel through.',
  erase: 'Drag to rub out walls and barriers.',
};

// ---------------------------------------------------------------- state
const wave = q.createWave({nx: NX, ny: NY, lx: LX, ly: LY, dt: .2, absorb: ABSORB});
const paint = new Float64Array(NX * NY);           // painted walls and barriers, on top of the exposure's own potential
let baseV = () => 0;
const plateAcc = new Float64Array(NY);
const lab = {
  exp: null, k: 1.4, width: 5, V0: 1.6, speed: 2, playing: true, tool: 'move', crests: false, auto: false,
  emitter: {x: -40, y: 0, angle: 0}, detections: [], jitter: [], fired: 0, run: null, lastProfile: null, orbital: '2p', atomDots: [],
  PLATE, SX,
  base(fn) { baseV = fn; },
  plateWidth() {
    const p = this.lastProfile;
    if (!p) return 0;
    let s = 0, m = 0, m2 = 0;
    p.forEach((w, j) => { const y = wave.yAt(j); s += w; m += w * y; m2 += w * y * y; });
    return s ? Math.sqrt(m2 / s - (m / s) ** 2) : 0;
  },
  waveTime() { return wave.t; },
};
function applyPotential() { wave.setPotential((x, y) => baseV(x, y) + paint[cellIndex(x, y)]); }
const cellIndex = (x, y) => Math.min(NY - 1, Math.max(0, Math.round(y / DX + NY / 2))) * NX + Math.min(NX - 1, Math.max(0, Math.round(x / DX + NX / 2)));

/** Fires one particle: a fresh wave packet from the emitter. `count` particles are detected from this one wave. */
function fire(count = 1) {
  if (lab.exp.atom) { look(count); return; }
  const {x, y, angle} = lab.emitter, a = angle * Math.PI / 180;
  const sx = lab.exp.omega ? lab.width : SX;
  wave.setPacket({x0: x, y0: y, kx: lab.k * Math.cos(a), ky: lab.k * Math.sin(a), sx, sy: lab.width});
  if (Math.abs(a) > 1e-6 && !lab.exp.omega) rotatePacket(x, y, a, sx);
  plateAcc.fill(0);
  lab.run = {count, start: performance.now()};
  setPlaying(true);
}
/** For an aimed emitter, lay the packet's long axis across the direction of travel. */
function rotatePacket(x0, y0, a, sx) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const dx = wave.xAt(i) - x0, dy = wave.yAt(j) - y0, u = c * dx + s * dy, v = -s * dx + c * dy, k = j * NX + i;
    const amp = Math.exp(-u * u / (4 * sx * sx) - v * v / (4 * lab.width * lab.width)), p = lab.k * u;
    wave.re[k] = amp * Math.cos(p); wave.im[k] = amp * Math.sin(p);
  }
  wave.normalise();
}

function step() {
  wave.step();
  if (!lab.run || !lab.exp.plate) return;
  // The plate absorbs whatever reaches it, and remembers where.
  const i0 = Math.round(PLATE / DX + NX / 2);
  let caught = 0;
  for (let j = 0; j < NY; j++) for (let i = i0; i < i0 + 3; i++) {
    const k = j * NX + i, d = (wave.re[k] * wave.re[k] + wave.im[k] * wave.im[k]) * DX * DX;
    plateAcc[j] += d; caught += d; wave.re[k] = 0; wave.im[k] = 0;
  }
  // Done once the plate has had its share and nothing more is arriving (what is left was reflected).
  const run = lab.run, total = plateAcc.reduce((a, b) => a + b, 0);
  // For a barrier, record the largest share of the wave beyond it (plus what the plate has already caught).
  if (lab.exp.barrier && Math.round(wave.t / wave.dt) % 10 === 0) run.through = Math.max(run.through ?? 0, wave.probability(x => x > 1) + total);
  run.quiet = caught < 2e-5 ? (run.quiet ?? 0) + 1 : 0;
  if (wave.t > T_MAX || (wave.t > 20 && wave.norm() < .01) || (total > .002 && run.quiet > 40)) finishRun();
}
function finishRun() {
  const run = lab.run;
  lab.run = null;
  lab.lastProfile = Float64Array.from(plateAcc);
  if (run.through != null) lab.through = run.through;
  let detected = 0;
  for (const v of plateAcc) detected += v;
  for (let n = 0; n < run.count; n++) {
    lab.fired++;
    if (Math.random() >= detected) continue;          // this particle went elsewhere (reflected, or left the chamber)
    const j = q.sampleIndex(plateAcc);
    lab.detections.push(wave.yAt(j) + (Math.random() - .5) * DX);
    lab.jitter.push(Math.random());
  }
  renderInsight(); drawPlate();
  if (lab.auto) setTimeout(() => { if (lab.auto && !lab.run) fire(AUTO); }, 250);
}

// ---------------------------------------------------------------- atom
let atomGrid = null;
function buildAtom() {
  const o = q.orbital(lab.orbital), R = o.extent * .5, w = 220, h = 110, density = new Float64Array(w * h), sign = new Int8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i / (w - 1) - .5) * 4 * R, z = (.5 - j / (h - 1)) * 2 * R, p = o.psi(x, 0, z);
    density[j * w + i] = p * p; sign[j * w + i] = Math.sign(p);
  }
  atomGrid = {o, R, w, h, density, sign, max: Math.max(...density)};
}
function look(count) {
  const g = atomGrid;
  for (let n = 0; n < count; n++) {
    const idx = q.sampleIndex(g.density);
    const i = idx % g.w + Math.random() - .5, j = Math.floor(idx / g.w) + Math.random() - .5;
    lab.atomDots.push([(i / (g.w - 1) - .5) * 4 * g.R, (.5 - j / (g.h - 1)) * 2 * g.R]);
  }
  if (lab.atomDots.length > 6000) lab.atomDots.splice(0, lab.atomDots.length - 6000);
  renderInsight(); draw();
}

// ---------------------------------------------------------------- the chamber print
const chamber = $('c-chamber'), cctx = chamber.getContext('2d'), plateCanvas = $('c-plate'), pctx = plateCanvas.getContext('2d');
const size = {cw: 1, ch: 1, pw: 1, ph: 1, dpr: 1};
new ResizeObserver(() => {
  const d = Math.min(devicePixelRatio || 1, 2), r = chamber.getBoundingClientRect(), p = plateCanvas.getBoundingClientRect();
  Object.assign(size, {cw: r.width, ch: r.height, pw: p.width, ph: p.height, dpr: d});
  chamber.width = Math.round(r.width * d); chamber.height = Math.round(r.height * d);
  plateCanvas.width = Math.round(p.width * d); plateCanvas.height = Math.round(p.height * d);
  draw(); drawPlate();
}).observe(document.querySelector('.room'));
/** Chamber: fit the 128 × 64 grid (or the orbital slice) into the print, keeping its shape. */
function view() {
  const s = Math.min(size.cw / LX, size.ch / LY);
  return {s, ox: size.cw / 2, oy: size.ch / 2, to: (x, y) => [size.cw / 2 + x * s, size.ch / 2 - y * s], from: (px, py) => [(px - size.cw / 2) / s, (size.ch / 2 - py) / s]};
}
let dmax = 1e-3, lookMark = null;
function drawWalls(ctx, v) {
  // Walls (tall) solid, barriers hatched; one sample per grid cell.
  const cell = DX * v.s;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = wave.xAt(i), y = wave.yAt(j), V = baseV(x, y) + paint[j * NX + i];
    if (V <= .05 || lab.exp.omega) continue;
    const [px, py] = v.to(x, y);
    ctx.fillStyle = V >= WALL * .8 ? C.oliveDark : `rgba(86,97,42,${Math.min(.55, .12 + V * .12)})`;
    ctx.fillRect(px - cell / 2, py - cell / 2, cell + .6, cell + .6);
  }
  if (lab.exp.omega) {
    ctx.strokeStyle = 'rgba(86,97,42,.45)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    for (const V of [.5, 2, 4.5, 8]) { const r = Math.sqrt(2 * V) / lab.exp.omega; ctx.beginPath(); ctx.arc(v.ox, v.oy, r * v.s, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.setLineDash([]);
  }
}
function draw() {
  if (!lab.exp) return;
  const ctx = cctx, v = view();
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = C.print; ctx.fillRect(0, 0, size.cw, size.ch);
  if (lab.exp.atom) return drawAtom(ctx);
  drawWalls(ctx, v);
  // Halftone print of |ψ|²: dot area proportional to the probability density.
  const g = Math.max(4.5, size.cw / 170);
  let m = 0;
  const dens = [];
  for (let py = g / 2; py < size.ch; py += g) for (let px = g / 2; px < size.cw; px += g) {
    const [x, y] = v.from(px, py), i = Math.round(x / DX + NX / 2), j = Math.round(y / DX + NY / 2);
    if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
    const k = j * NX + i, d = wave.re[k] * wave.re[k] + wave.im[k] * wave.im[k];
    m = Math.max(m, d); if (d > dmax * .004) dens.push(px, py, d, k);
  }
  dmax = m > dmax ? m : dmax + (m - dmax) * .05;
  for (let n = 0; n < dens.length; n += 4) {
    const d = dens[n + 2], k = dens[n + 3], r = g * .58 * Math.sqrt(Math.min(1, d / dmax));
    if (r < .35) continue;
    const crest = lab.crests && d > dmax * .03 && wave.re[k] / Math.sqrt(d) > .92;
    ctx.fillStyle = crest ? C.spot : C.ink;
    ctx.beginPath(); ctx.arc(dens[n], dens[n + 1], r, 0, 2 * Math.PI); ctx.fill();
  }
  // The plate's edge in the chamber, with the latest particles found.
  if (lab.exp.plate) {
    const [px] = v.to(PLATE, 0);
    ctx.strokeStyle = C.film; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, size.ch); ctx.stroke();
    ctx.fillStyle = C.spot;
    for (const y of lab.detections.slice(-60)) { const [, py] = v.to(PLATE, y); ctx.fillRect(px + 2, py - 1, 6, 2); }
    label(ctx, 'PLATE', px - 6, 14, 'right');
  }
  drawEmitter(ctx, v);
  if (lookMark) {
    const [lx, ly] = v.to(lookMark.x, lookMark.y), age = (performance.now() - lookMark.t) / 1500;
    if (age < 1) {
      ctx.globalAlpha = 1 - age; ctx.strokeStyle = C.spot; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lx, ly, LOOK_R * v.s, 0, 2 * Math.PI); ctx.stroke();
      label(ctx, lookMark.found ? `FOUND (${Math.round(lookMark.p * 100)}% chance)` : `NOT HERE (${Math.round(lookMark.p * 100)}% chance)`, lx, ly - LOOK_R * v.s - 6, 'center', C.spot);
      ctx.globalAlpha = 1;
    } else lookMark = null;
  }
  if (!lab.run && wave.norm() < .02 && !lab.exp.omega) label(ctx, 'READY · PRESS FIRE ONE', size.cw / 2, size.ch / 2, 'center', C.ink3);
}
function label(ctx, s, x, y, align = 'left', color = C.ink) {
  ctx.font = '700 10px "Space Mono", monospace'; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.textAlign = 'left';
}
function emitterTip() { const a = lab.emitter.angle * Math.PI / 180, L = 4 + lab.k * 5; return [lab.emitter.x + Math.cos(a) * L, lab.emitter.y + Math.sin(a) * L]; }
function drawEmitter(ctx, v) {
  const e = lab.emitter, [ex, ey] = v.to(e.x, e.y), [tx, ty] = v.to(...emitterTip()), a = Math.atan2(ty - ey, tx - ex);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
  ctx.fillStyle = C.film; ctx.fillRect(-18, -7, 18, 14); ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(a);
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, 5); ctx.lineTo(-4, -5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = C.print; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  if (!lab.exp.omega) label(ctx, `EMITTER · k ${lab.k.toFixed(2)}`, ex, ey + 22, 'center', C.ink3);
}
function drawAtom(ctx) {
  const g = atomGrid, s = Math.min(size.cw / (4 * g.R), size.ch / (2 * g.R)), ox = size.cw / 2, oy = size.ch / 2;
  const gap = Math.max(4.5, size.cw / 170);
  for (let py = gap / 2; py < size.ch; py += gap) for (let px = gap / 2; px < size.cw; px += gap) {
    const i = Math.round(((px - ox) / s / (4 * g.R) + .5) * (g.w - 1)), j = Math.round(((py - oy) / s / (2 * g.R) + .5) * (g.h - 1));
    if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
    const k = j * g.w + i, r = gap * .58 * Math.sqrt(g.density[k] / g.max);
    if (r < .35) continue;
    ctx.fillStyle = g.sign[k] < 0 ? C.spot : C.ink; ctx.globalAlpha = .55;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.oliveDark;
  for (const [x, z] of lab.atomDots) ctx.fillRect(ox + x * s - 1.2, oy - z * s - 1.2, 2.4, 2.4);
  ctx.fillStyle = C.spot; ctx.beginPath(); ctx.arc(ox, oy, 3, 0, 2 * Math.PI); ctx.fill();
  label(ctx, 'NUCLEUS', ox + 8, oy + 16, 'left', C.spot);
  const bar = 5 / .529 * s;   // 0.5 nm = 9.45 Bohr radii
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, size.ch - 14); ctx.lineTo(14 + bar, size.ch - 14); ctx.stroke();
  label(ctx, '0.5 nm', 14, size.ch - 20);
}

// ---------------------------------------------------------------- the plate
function drawPlate() {
  const ctx = pctx, {pw, ph} = size, vertical = ph >= pw;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = C.print; ctx.fillRect(0, 0, pw, ph);
  if (!lab.exp?.plate) {
    ctx.fillStyle = C.ink3; ctx.font = 'italic 12px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab.exp?.atom ? 'Dots go in the print' : 'No plate here', pw / 2, ph / 2); ctx.textAlign = 'left';
    return;
  }
  // Along the plate: chamber y from +32 (top / left) to −32.
  const along = y => (vertical ? ph : pw) * (.5 - y / LY), across = u => (vertical ? pw : ph) * (.12 + .76 * u);
  const at = (y, u) => vertical ? [across(u), along(y)] : [along(y), across(u)];
  // Expected pattern from the last wave, faint.
  if (lab.lastProfile) {
    const p = lab.lastProfile, m = Math.max(...p) || 1;
    ctx.fillStyle = 'rgba(200,84,31,.14)';
    ctx.beginPath(); ctx.moveTo(...at(wave.yAt(0), 0));
    p.forEach((v, j) => ctx.lineTo(...at(wave.yAt(j), v / m)));
    ctx.lineTo(...at(wave.yAt(NY - 1), 0)); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = C.ink;
  lab.detections.forEach((y, n) => { const [x, yy] = at(y, lab.jitter[n]); ctx.beginPath(); ctx.arc(x, yy, 1.5, 0, 2 * Math.PI); ctx.fill(); });
  $('count').textContent = lab.detections.length;
}

// ---------------------------------------------------------------- the log
function renderExposure() {
  const x = lab.exp;
  $('exposures').innerHTML = exposures.map((e, i) => `<button class="pill${e === x ? ' on' : ''}" data-id="${e.id}"><i>${i + 1}</i>${e.label}</button>`).join('');
  $('notes-card').innerHTML = `<h1>${x.title}</h1>${x.text}<div class="formula">${x.formula}<small>${x.note}</small></div>
    <p class="cap">Try</p><ul class="try">${x.tries.map(t => `<li>${t}</li>`).join('')}</ul><div class="insight" id="insight"></div>`;
  $('orbital-box').hidden = !x.atom; $('tool-box').hidden = !!x.atom;
  for (const id of ['k', 'w']) $(id).closest('label').hidden = !!x.atom;
  $('auto').hidden = !x.plate; $('fire100').hidden = !x.plate && !x.atom; $('clear-plate').hidden = !x.plate && !x.atom;
  $('clear-plate').textContent = x.atom ? 'Clear dots' : 'Clear plate';
  $('fire1').textContent = x.atom ? 'Look once' : x.omega ? 'Release again' : 'Fire one'; $('fire100').textContent = x.atom ? 'Look 100 times' : 'Fire 100';
  $('orbitals').innerHTML = Object.keys(q.ORBITALS).map(n => `<button class="pill${n === lab.orbital ? ' on' : ''}" data-orbital="${n}">${n}</button>`).join('');
  $('barrier-row').hidden = lab.tool !== 'barrier' && !x.barrier;
  $('caption').textContent = x.atom
    ? 'A slice through a hydrogen atom. Dot size: how likely the electron is to be found there. Ink and orange: the two signs of the wave.'
    : 'Dot size: how likely the particle is to be found there (|ψ|²). Dark blocks are walls; shaded areas are barriers it can tunnel through.';
}
function renderInsight() {
  const el = $('insight'); if (el) el.innerHTML = lab.exp.insight(lab);
  $('count').textContent = lab.exp.atom ? lab.atomDots.length : lab.detections.length;
}
function setSliders() {
  $('k').value = lab.k; $('out-k').textContent = lab.k.toFixed(2);
  $('w').value = lab.width; $('out-w').textContent = lab.width.toFixed(1);
  $('v').value = lab.V0; $('out-v').textContent = lab.V0.toFixed(2);
}
function load(x) {
  lab.exp = x; lab.run = null; lab.detections = []; lab.jitter = []; lab.fired = 0; lab.lastProfile = null; lab.atomDots = []; lab.auto = false;
  $('auto').classList.remove('on'); $('auto').setAttribute('aria-pressed', 'false');
  paint.fill(0); baseV = () => 0;
  if (x.emitter) { lab.emitter = {x: x.emitter.x, y: x.emitter.y, angle: x.emitter.angle}; lab.k = x.emitter.k; lab.width = x.emitter.width; }
  if (x.barrier) lab.V0 = x.barrier;
  if (x.orbital) lab.orbital = x.orbital;
  x.setup(lab);
  if (x.atom) buildAtom();
  else {
    applyPotential();
    wave.re.fill(0); wave.im.fill(0); wave.t = 0;
    if (x.omega) fire(0);           // the well starts with its particle already released
  }
  setSliders(); renderExposure(); renderInsight(); draw(); drawPlate();
}

// ---------------------------------------------------------------- hands
const LOOK_R = 4;
function setTool(t) {
  lab.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) { b.classList.toggle('on', b.dataset.tool === t); b.setAttribute('aria-pressed', String(b.dataset.tool === t)); }
  $('tool-hint').textContent = HINTS[t];
  $('barrier-row').hidden = t !== 'barrier' && !lab.exp?.barrier;
}
let drag = null;
const at = event => { const r = chamber.getBoundingClientRect(); return view().from(event.clientX - r.left, event.clientY - r.top); };
function paintAt(x, y) {
  const r = 2.2, V = lab.tool === 'wall' ? WALL : lab.tool === 'barrier' ? lab.V0 : 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const dx = wave.xAt(i) - x, dy = wave.yAt(j) - y;
    if (dx * dx + dy * dy <= r * r) paint[j * NX + i] = V;
  }
  // The emitter's own spot stays clear.
  applyPotential();
}
chamber.addEventListener('pointerdown', event => {
  if (lab.exp.atom) { look(1); return; }
  const [x, y] = at(event), e = lab.emitter, [tx, ty] = emitterTip(), s = view().s;
  chamber.setPointerCapture(event.pointerId);
  if (lab.tool === 'move') {
    if (Math.hypot(x - tx, y - ty) * s < 14) drag = 'aim';
    else if (Math.hypot(x - e.x, y - e.y) * s < 22) drag = 'emitter';
  } else if (lab.tool === 'look') {
    const res = wave.collapse((px, py) => Math.hypot(px - x, py - y) < LOOK_R);
    lookMark = {x, y, ...res, t: performance.now()};
  } else { drag = 'paint'; paintAt(x, y); }
  draw();
});
chamber.addEventListener('pointermove', event => {
  const [x, y] = at(event);
  if (drag === 'emitter') { lab.emitter.x = Math.max(-58, Math.min(PLATE - 6, x)); lab.emitter.y = Math.max(-28, Math.min(28, y)); }
  else if (drag === 'aim') {
    const e = lab.emitter, dx = x - e.x, dy = y - e.y;
    lab.emitter.angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
    lab.k = Math.max(.6, Math.min(3, (Math.hypot(dx, dy) - 4) / 5));
    setSliders();
  } else if (drag === 'paint') paintAt(x, y);
  if (drag) { draw(); return; }
  if (lab.exp.atom) return showTip(null);
  const i = Math.round(x / DX + NX / 2), j = Math.round(y / DX + NY / 2);
  if (i < 0 || j < 0 || i >= NX || j >= NY) return showTip(null);
  const V = baseV(x, y) + paint[j * NX + i], k = j * NX + i, d = wave.re[k] ** 2 + wave.im[k] ** 2;
  showTip(event, V >= WALL * .8 ? '<b>Wall</b>Far higher than the particle’s energy: the wave reflects.' :
    V > .05 && !lab.exp.omega ? `<b>Barrier, V = ${V.toFixed(2)}</b>The particle’s energy is ${(lab.k * lab.k / 2).toFixed(2)}: ${lab.k * lab.k / 2 < V ? 'too low to climb it, but it can tunnel.' : 'enough to pass over it.'}` :
    d > dmax * .02 ? `<b>Probability here</b>About ${Math.min(100, d * Math.PI * LOOK_R * LOOK_R * 100).toFixed(0)}% chance of finding it inside a Look circle here.` : null);
});
const end = () => { drag = null; };
chamber.addEventListener('pointerup', end);
chamber.addEventListener('pointercancel', end);
chamber.addEventListener('pointerleave', () => showTip(null));
function showTip(event, html) {
  const tip = $('tip');
  if (!html) { tip.classList.remove('visible'); return; }
  tip.innerHTML = html; tip.classList.add('visible');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(innerWidth - w - 10, event.clientX + 16)}px, ${Math.max(10, Math.min(innerHeight - h - 10, event.clientY - h - 12))}px)`;
}

$('exposures').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) load(exposures.find(x => x.id === b.dataset.id)); });
$('orbitals').addEventListener('click', event => { const b = event.target.closest('[data-orbital]'); if (!b) return; lab.orbital = b.dataset.orbital; lab.atomDots = []; buildAtom(); renderExposure(); renderInsight(); draw(); });
$('tools').addEventListener('click', event => { const b = event.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
$('clear-walls').onclick = () => { paint.fill(0); applyPotential(); draw(); };
$('fire1').onclick = () => fire(1);
$('fire100').onclick = () => fire(100);
$('auto').onclick = () => {
  lab.auto = !lab.auto; $('auto').classList.toggle('on', lab.auto); $('auto').setAttribute('aria-pressed', String(lab.auto));
  if (lab.auto && !lab.run) fire(AUTO);
};
$('clear-plate').onclick = () => { lab.detections = []; lab.jitter = []; lab.fired = 0; lab.atomDots = []; renderInsight(); drawPlate(); draw(); };
$('k').oninput = event => { lab.k = +event.target.value; setSliders(); draw(); };
$('w').oninput = event => { lab.width = +event.target.value; setSliders(); };
$('v').oninput = event => {
  lab.V0 = +event.target.value; setSliders();
  if (lab.exp.barrier) applyPotential();
  renderInsight(); draw();
};
$('t-crests').onclick = () => { lab.crests = !lab.crests; $('t-crests').classList.toggle('on', lab.crests); $('t-crests').setAttribute('aria-pressed', String(lab.crests)); draw(); };
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => {
  lab.speed = +b.dataset.speed;
  for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', x === b);
};
function setPlaying(on) { lab.playing = on; $('play').textContent = on ? 'Pause' : 'Play'; $('play').setAttribute('aria-label', on ? 'Pause' : 'Play'); }
$('play').onclick = () => setPlaying(!lab.playing);
const notes = $('notes');
$('about').onclick = () => notes.showModal();
notes.querySelector('.close').onclick = () => notes.close();
notes.addEventListener('click', event => { if (event.target === notes) notes.close(); });
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open]')) return;
  if (event.key === ' ') { event.preventDefault(); setPlaying(!lab.playing); }
  else if (event.key === 'f' || event.key === 'F') fire(1);
  else if (event.key === 'c' || event.key === 'C') $('t-crests').click();
  else if (/^[1-7]$/.test(event.key)) load(exposures[+event.key - 1]);
});

// ---------------------------------------------------------------- loop
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastInsight = 0;
function frame(now) {
  if (lab.playing && !lab.exp.atom && (lab.run || lab.exp.omega)) {
    const n = reducedMotion ? 1 : lab.speed;
    for (let s = 0; s < n && (lab.run || lab.exp.omega); s++) step();
  }
  if (!lab.exp.atom || lookMark) draw();
  if (now - lastInsight > 500) { lastInsight = now; renderInsight(); }
  requestAnimationFrame(frame);
}
setTool('move');
load(exposures[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__quantum = {
    lab, wave, exposures, load: id => load(exposures.find(x => x.id === id)), fire,
    run: steps => { for (let s = 0; s < steps && (lab.run || lab.exp.omega); s++) step(); draw(); drawPlate(); return wave.t; },
    snap: () => ({exp: lab.exp.id, t: wave.t, norm: wave.norm(), running: !!lab.run, fired: lab.fired, found: lab.detections.length, insight: $('insight')?.textContent}),
  };
}
