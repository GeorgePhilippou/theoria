// Curved spacetime: the chart table. The optics-bench layout (one big chart, a parts tray, a specification sheet and a
// log of exact readings) around a black hole. One clock drives everything: Eddington–Finkelstein time t̃, which ticks
// like a far-away clock and stays finite at the horizon.
import * as gr from './physics.js';
import {plates} from './scenarios.js';

const $ = id => document.getElementById(id);
const C = {ink: '#2f3614', ink2: '#454d22', ink3: '#6a6f45', ink4: '#8a8c68', olive: '#56612a', oliveDark: '#3b4419', spot: '#c8541f',
  tint: '#c9c9a3', paper: '#ece4d2', paper2: '#f4eee0', mat: '#e6e2cc', rule: 'rgba(86,97,42,.14)'};
const TICK = 2, DIAL = 8, LOOK = {laser: 'L', beam: 'B'};
const SCALES = {
  rs: {},
  sun: {km: 2.953, s: 9.85e-6, note: 'one solar mass: rₛ = 2.95 km'},
  sgr: {km: 1.27e7, s: 42.4, note: 'Sagittarius A*: rₛ = 12.7 million km'},
};
const deg = x => x * Math.PI / 180, rad = x => x * 180 / Math.PI, f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), f3 = x => x.toFixed(3);

// ---------------------------------------------------------------- the chart's contents
const lab = {
  plate: null, now: 0, playing: true, speed: 1.5, scale: 'rs', view: 'chart', viewR: 9, span: 24, pulsesOn: true,
  clocks: [], sources: [], probes: [], orbiters: [], pulses: [], selected: null, counter: {}, flashes: [], sites: [], tracers: [],
  next(tag) { this.counter[tag] = (this.counter[tag] ?? 0) + 1; return `${tag}${this.counter[tag]}`; },
  addClock(r, bearing, {beacon = false} = {}) {
    const c = {type: 'clock', label: this.next('C'), x: r * Math.cos(deg(bearing)), y: r * Math.sin(deg(bearing)), tau: 0, beacon,
      nextTick: TICK, history: [], ticks: [], received: []};
    clampClock(c); c.history.push({ef: this.now, r: radius(c)});
    this.clocks.push(c); return c;
  },
  addLaser(x, y, angle) { return this.addSource('laser', x, y, angle, {count: 1, width: 0}); },
  addBeam(x, y, angle, {count = 9, width = 8} = {}) { return this.addSource('beam', x, y, angle, {count, width}); },
  addSource(kind, x, y, angle, {count, width}) {
    const s = {type: 'source', kind, label: this.next(LOOK[kind]), x, y, angle, count, width, T0: this.now};
    trace(s); this.sources.push(s); return s;
  },
  addProbe(r, bearing, {beacon = true} = {}) {
    const p = {type: 'probe', label: this.next('P'), beacon};
    placeProbe(p, r * Math.cos(deg(bearing)), r * Math.sin(deg(bearing)));
    this.probes.push(p); return p;
  },
  addOrbiter(r, bearing, {push = 1, dir = 1} = {}) {
    const o = {type: 'orbiter', label: this.next('O'), push, dir};
    launch(o, r * Math.cos(deg(bearing)), r * Math.sin(deg(bearing)));
    this.orbiters.push(o); return o;
  },
  select(o) { select(o); },
  /** A spot that sets off a flash of light every few units of time (used by the river plate). */
  flashSite(r, bearingDeg) { this.sites.push({x: r * Math.cos(deg(bearingDeg)), y: r * Math.sin(deg(bearingDeg)), next: this.now + this.sites.length * 3}); },
  flash(x, y) { flash(x, y); },
  radius: o => radius(o),
  time: x => formatTime(x),
  /** Gaps (in the receiver's own time) between signals from `from` that it has received. */
  gaps(receiver, from) { const got = receiver.received.filter(x => x.from === from); return got.slice(1).map((x, i) => x.tau - got[i].tau); },
  received(receiver, from) { return receiver.received.filter(x => x.from === from).length; },
};
const radius = o => Math.hypot(o.x, o.y), bearing = o => Math.atan2(o.y, o.x);
function clampClock(c) { const r = radius(c); if (r < 1.05) { const k = 1.05 / (r || 1); c.x = (c.x || 1.05) * k; c.y *= k; } }
function formatTime(x) {
  const s = SCALES[lab.scale];
  if (!s.s) return `${f1(x)} rₛ/c`;
  const sec = x * s.s;
  if (sec < 1e-3) return `${(sec * 1e6).toFixed(1)} µs`;
  if (sec < 1) return `${(sec * 1e3).toFixed(2)} ms`;
  if (sec < 120) return `${sec.toFixed(1)} s`;
  if (sec < 7200) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(2)} h`;
}
function formatLength(r) {
  const s = SCALES[lab.scale];
  if (!s.km) return `${f2(r)} rₛ`;
  const km = r * s.km;
  return km < 1e5 ? `${km.toFixed(km < 100 ? 1 : 0)} km` : `${(km / 1e6).toFixed(1)} million km`;
}

/** Interpolates points ordered by `key`, clamped at the ends. */
function atKey(points, key, v) {
  if (v <= points[0][key]) return points[0];
  if (v >= points.at(-1)[key]) return points.at(-1);
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const m = (hi + lo) >> 1; if (points[m][key] < v) lo = m; else hi = m; }
  const a = points[lo], b = points[hi], u = (v - a[key]) / (b[key] - a[key] || 1), out = {i: lo};
  for (const k of Object.keys(a)) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}
const withEF = (points, r0) => { const off = Math.log(Math.abs(r0 - 1)); for (const p of points) p.ef = p.t + Math.log(Math.abs(p.r - 1)) - off; return points; };

// Light: every ray of a source is traced in full, once, whenever the source moves.
function trace(s) {
  const d = [Math.cos(deg(s.angle)), Math.sin(deg(s.angle))], perp = [-d[1], d[0]], n = s.kind === 'laser' ? 1 : Math.max(2, s.count);
  s.T0 = lab.now; s.rays = [];
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0 : k / (n - 1) - .5, x = s.x + perp[0] * u * s.width, y = s.y + perp[1] * u * s.width, r0 = Math.hypot(x, y);
    if (r0 <= 1.02) continue;
    const t = gr.traceRay(x, y, d[0], d[1], {rOut: Math.max(16, lab.viewR * 1.7)});
    const pts = withEF(t.points, r0), a = pts[0], b = pts[Math.min(3, pts.length - 1)], z = pts.at(-1), y2 = pts.at(-4) ?? pts[0];
    let bend = Math.abs(rad(Math.atan2(z.y - y2.y, z.x - y2.x) - Math.atan2(b.y - a.y, b.x - a.x)));
    if (bend > 180) bend = 360 - bend;
    s.rays.push({points: pts, outcome: t.outcome, b: Math.abs(t.L), rmin: Math.min(...pts.map(p => p.r)), bend, turns: gr.sweptAngle(pts) / (2 * Math.PI), central: Math.abs(u) < 1e-9 || k === n >> 1});
  }
}
// Probes fall from rest; orbiters are launched sideways at a multiple of the circular speed.
function placeProbe(p, x, y) {
  let r = Math.hypot(x, y);
  if (r < 1.1) { const k = 1.1 / (r || 1); x = (x || 1.1) * k; y *= k; r = 1.1; }
  Object.assign(p, {x, y, R: r, phi: Math.atan2(y, x), T0: lab.now, fall: gr.fallEF(r), tau: 0, r, sent: 0, nextTick: TICK, ticks: [], crossed: null, done: false});
  p.ef0 = p.fall.samples[0].ef;
}
function launch(o, x, y) {
  let r0 = Math.hypot(x, y);
  if (r0 < 1.6) { const k = 1.6 / (r0 || 1); x = (x || 1.6) * k; y *= k; r0 = 1.6; }
  const L = gr.circularL(r0) * o.push * o.dir, phi0 = Math.atan2(y, x), res = gr.orbit(r0, L, {tMax: 2400, phi0});
  const pts = withEF(res.points, r0), minima = [];
  pts.forEach((p, i, a) => { if (i > 0 && i < a.length - 1 && p.r < a[i - 1].r && p.r <= a[i + 1].r) minima.push(p); });
  const laps = minima.slice(1).map((m, i) => Math.abs(m.phi - minima[i].phi));
  Object.assign(o, {x, y, bx: x, by: y, phi: phi0, r0, phi0, L, E: res.E, T0: lab.now, points: pts, outcome: res.outcome, minima, gone: false, tau: 0, r: r0, nextTick: TICK, ticks: [],
    rmin: Math.min(...pts.map(p => p.r)), rmax: Math.max(...pts.map(p => p.r)),
    precession: laps.length ? Math.abs(rad(laps[0]) - 360) : null, period: minima.length > 1 ? minima[1].tau - minima[0].tau : null});
}

// ---------------------------------------------------------------- the river of space
/** A flash of light at (x, y): 48 exact rays, aimed evenly in all directions as seen by someone held still there. */
function flash(x, y) {
  const r0 = Math.hypot(x, y);
  if (r0 <= 1.05) return false;
  const rays = [];
  for (let k = 0; k < 48; k++) {
    const a = 2 * Math.PI * k / 48, t = gr.traceRay(x, y, Math.cos(a), Math.sin(a), {rOut: lab.viewR * 2, stepSize: .06});
    rays.push({points: withEF(t.points, r0), outcome: t.outcome});
  }
  lab.flashes.push({x, y, T0: lab.now, rays, cr: r0, cphi: Math.atan2(y, x)});
  if (lab.flashes.length > 8) lab.flashes.shift();
  return true;
}
function seedTracers() {
  const R = lab.viewR * 1.25;
  lab.tracers = Array.from({length: 180}, () => ({r: Math.max(.08, R * Math.sqrt(Math.random())), phi: 2 * Math.PI * Math.random()}));
}
function stepRiver(dt) {
  const R = lab.viewR * 1.25;
  for (const p of lab.tracers) {
    p.r += gr.riverDrift(p.r) * dt;
    if (p.r < .06) { p.r = R * (.85 + .15 * Math.random()); p.phi = 2 * Math.PI * Math.random(); }
  }
  for (const f of lab.flashes) if (f.cr > .06) f.cr += gr.riverDrift(f.cr) * dt;
  lab.flashes = lab.flashes.filter(f => lab.now - f.T0 < 45);
  for (const s of lab.sites) if (lab.now >= s.next) { flash(s.x, s.y); s.next = lab.now + 10; }
}

// ---------------------------------------------------------------- signals: radial light pulses
function pulseRadius(p, ef) {
  if (p.dir < 0) return p.re - (ef - p.efe);
  const g = r => gr.outgoingLightEF(p.re, p.efe, r);
  if (p.re > 1 + 1e-9) {
    let lo = p.re, hi = p.re + 1;
    while (g(hi) < ef && hi < 1e5) hi = 1 + (hi - 1) * 2;
    for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (g(m) < ef) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  if (g(1e-6) <= ef) return 0;
  let lo = 1e-6, hi = p.re;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (g(m) > ef) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function emit(from, r, phi) {
  for (const dir of [1, -1]) lab.pulses.push({re: r, efe: lab.now, phi, dir, from, r, prevR: r});
  if (lab.pulses.length > 400) lab.pulses.splice(0, lab.pulses.length - 400);
}
const angleDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

// ---------------------------------------------------------------- time
function step(dt) {
  lab.now += dt;
  const now = lab.now;
  stepRiver(dt);
  for (const c of lab.clocks) {
    const r = radius(c);
    c.tau += gr.rate(r) * dt;
    while (c.tau >= c.nextTick) { c.ticks.push({ef: now, r}); if (c.beacon) emit(c, r, bearing(c)); c.nextTick += TICK; }
    const last = c.history.at(-1);
    if (!last || now - last.ef > .25 || Math.abs(last.r - r) > 1e-4) c.history.push({ef: now, r});
    if (c.history.length > 5000) c.history.splice(0, 1000);
    if (c.ticks.length > 1200) c.ticks.splice(0, 300);
  }
  for (const p of lab.probes) {
    if (p.done) continue;
    const s = p.fall.atEF(p.ef0 + now - p.T0);
    if (!s) { p.done = true; p.r = 0; p.tau = p.fall.fall.tauCentre; continue; }
    if (p.r > 1 && s.r <= 1) p.crossed = s.tau;
    p.tau = s.tau; p.r = s.r;
    while (p.tau >= p.nextTick) { p.ticks.push({ef: now, r: p.r}); if (p.beacon) { emit(p, p.r, p.phi); p.sent++; } p.nextTick += TICK; }
  }
  for (const o of lab.orbiters) {
    const local = now - o.T0, q = atKey(o.points, 'ef', local);
    Object.assign(o, {r: q.r, bx: q.x, by: q.y, tau: q.tau, phi: q.phi});
    if (local >= o.points.at(-1).ef && o.outcome !== 'bound') o.gone = true;
    while (!o.gone && o.tau >= o.nextTick) { o.ticks.push({ef: now, r: o.r}); o.nextTick += TICK; }
    if (o.ticks.length > 1200) o.ticks.splice(0, 300);
  }
  const keep = [];
  for (const p of lab.pulses) {
    p.prevR = p.r; p.r = pulseRadius(p, now);
    for (const c of lab.clocks) {
      if (c === p.from) continue;
      const cr = radius(c);
      if ((p.prevR - cr) * (p.r - cr) <= 0 && p.prevR !== p.r && Math.abs(angleDiff(bearing(c), p.phi)) < .3) c.received.push({tau: c.tau, from: p.from, dir: p.dir});
    }
    if (p.r > .02 && p.r < lab.viewR * 1.6) keep.push(p);
  }
  lab.pulses = keep;
}
function advance(dt) { const n = Math.ceil(dt / .05); for (let i = 0; i < n; i++) step(dt / n); }

// ---------------------------------------------------------------- drawing: shared
const canvas = $('c-bench'), ctx = canvas.getContext('2d');
let W = 1, H = 1, dpr = 1;
new ResizeObserver(() => {
  const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); draw();
}).observe(canvas);
function letter(s, x, y, {color = C.ink, align = 'left', size = 10, bg = 'rgba(230,226,204,.9)'} = {}) {
  ctx.font = `700 ${size}px "Space Mono", monospace`;
  const w = ctx.measureText(s).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(x0 - 2, y - size + 1, w + 4, size + 3); }
  ctx.fillStyle = color; ctx.fillText(s, x0, y);
}
function arrowHead(x, y, a, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * .8, s * .6); ctx.lineTo(-s * .45, 0); ctx.lineTo(-s * .8, -s * .6); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function polyline(pts, color, width = 1.5, {dash = null, alpha = 1, arrows = 0} = {}) {
  if (pts.length < 2) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore();
  if (arrows) {
    let run = arrows / 2;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy);
      run += len;
      if (run >= arrows && len > 0) { run = 0; arrowHead(pts[i][0], pts[i][1], Math.atan2(dy, dx), 4.5 + width, color); }
    }
  }
}

// ---------------------------------------------------------------- the chart
const k = () => Math.min(W, H) / (2 * lab.viewR * 1.06);
const S = (x, y) => [W / 2 + x * k(), H / 2 - y * k()];
const Wd = (sx, sy) => [(sx - W / 2) / k(), (H / 2 - sy) / k()];
function drawChartGrid() {
  ctx.fillStyle = C.mat; ctx.fillRect(0, 0, W, H);
  const [cx, cy] = S(0, 0), kk = k(), far = Math.hypot(W, H) / kk;
  // Rings every rₛ (stronger every 5), radial lines every 15°.
  for (let r = 1; r < far; r++) {
    ctx.strokeStyle = r % 5 ? C.rule : 'rgba(86,97,42,.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * kk, 0, 2 * Math.PI); ctx.stroke();
  }
  for (let a = 0; a < 360; a += 15) {
    ctx.strokeStyle = a % 90 ? C.rule : 'rgba(86,97,42,.3)';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(deg(a)) * kk, cy - Math.sin(deg(a)) * kk); ctx.lineTo(cx + Math.cos(deg(a)) * far * kk, cy - Math.sin(deg(a)) * far * kk); ctx.stroke();
  }
  // Ring labels along the bearing of 300°, bearing labels round the edge.
  const step = lab.viewR > 12 ? 4 : 2;
  // Each ring: its distance, and how fast a clock held still there ticks.
  for (let r = step; r < lab.viewR * 1.3; r += step) { const [x, y] = S(r * Math.cos(deg(-60)), r * Math.sin(deg(-60))); letter(`${r}  ×${gr.rate(r).toFixed(2)}`, x + 3, y + 4, {size: 9, color: C.ink3, bg: null}); }
  if (lab.viewR <= 6) { const [x, y] = S(1.5 * Math.cos(deg(-60)), 1.5 * Math.sin(deg(-60))); letter(`1.5  ×${gr.rate(1.5).toFixed(2)}`, x + 3, y + 4, {size: 9, color: C.ink3, bg: null}); }
  const edge = Math.min(W, H) / 2 - 12;
  for (let a = 0; a < 360; a += 30) letter(`${a}°`, cx + Math.cos(deg(a)) * edge, cy - Math.sin(deg(a)) * edge + 4, {size: 9, color: C.ink4, align: 'center', bg: null});
  // Photon sphere, innermost stable orbit, horizon.
  ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
  ctx.strokeStyle = C.ink4; ctx.beginPath(); ctx.arc(cx, cy, 3 * kk, 0, 2 * Math.PI); ctx.stroke();
  ctx.strokeStyle = C.spot; ctx.beginPath(); ctx.arc(cx, cy, 1.5 * kk, 0, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, kk, 0, 2 * Math.PI); ctx.fill();
  if (kk > 30) letter('HORIZON', cx, cy + 4, {size: 9, color: C.paper2, align: 'center', bg: null});
  letter('PHOTON SPHERE 1.5', cx + Math.cos(deg(118)) * 1.5 * kk, cy - Math.sin(deg(118)) * 1.5 * kk - 4, {size: 8.5, color: C.spot, align: 'center'});
  letter('ISCO 3', cx + Math.cos(deg(112)) * 3 * kk, cy - Math.sin(deg(112)) * 3 * kk - 4, {size: 8.5, color: C.ink3, align: 'center'});
}
function drawTitleBlock() {
  if (W < 520) return;
  const w = Math.min(260, W * .4), h = 50, x = W - w - 8, y = H - h - 8;
  ctx.fillStyle = C.paper2; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.lineTo(x + w, y + 17); ctx.moveTo(x, y + 34); ctx.lineTo(x + w, y + 34); ctx.stroke();
  letter('SCIENCE YOU CAN SEE · CURVED SPACETIME', x + 6, y + 13, {size: 9, bg: null});
  letter(`PLATE ${String(plates.indexOf(lab.plate) + 1).padStart(2, '0')} · ${lab.plate.label.toUpperCase()}`, x + 6, y + 30, {size: 9, bg: null, color: C.spot});
  letter(`1 RING = ${lab.scale === 'rs' ? '1 rₛ' : formatLength(1)} · t̃ ${formatTime(lab.now)}`, x + 6, y + 46, {size: 9, bg: null, color: C.ink3});
}
function drawDial(x, y, R, reading, color) {
  ctx.fillStyle = C.paper2; ctx.strokeStyle = color; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = C.ink3; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * (R - 3.5), y - Math.cos(a) * (R - 3.5)); ctx.lineTo(x + Math.sin(a) * (R - 1.5), y - Math.cos(a) * (R - 1.5)); ctx.stroke(); }
  const a = 2 * Math.PI * reading / DIAL;      // clockwise from twelve
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * (R - 3), y - Math.cos(a) * (R - 3)); ctx.stroke();
}
function drawChart(river = false) {
  drawChartGrid();
  if (river) drawRiverUnder();
  const kk = k(), [cx, cy] = S(0, 0), now = lab.now;
  // Orbiters: the whole predicted path, faint; the last stretch, bold; the body.
  for (const o of lab.orbiters) {
    const sel = lab.selected === o, local = now - o.T0, pts = [], recent = [];
    // The path ahead, about one lap (or until it falls in or leaves).
    const ahead = o.period ? o.period * 1.3 : 120;
    for (let i = 0; i < o.points.length; i += 3) { const q = o.points[i]; if (q.ef < local) continue; if (q.ef > local + ahead) break; pts.push(S(q.x, q.y)); }
    polyline(pts, C.olive, 1, {dash: [3, 4], alpha: sel ? .65 : .4});
    for (let i = 0; i < o.points.length && o.points[i].ef <= local; i += 3) if (local - o.points[i].ef < 40) recent.push(S(o.points[i].x, o.points[i].y));
    if (!o.gone) recent.push(S(o.bx, o.by));
    polyline(recent, C.olive, 2, {arrows: 120});
    if (!o.gone) {
      const [bx, by] = S(o.bx, o.by);
      ctx.fillStyle = C.olive; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(bx, by, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      letter(o.label, bx + 9, by - 7, {color: sel ? C.spot : C.ink});
    }
    const [lx, ly] = S(o.x, o.y);
    ctx.strokeStyle = C.olive; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 2 * Math.PI); ctx.stroke();
  }
  // Light: full traced paths, with arrows and slow pulses.
  for (const s of lab.sources) {
    for (const r of s.rays) {
      const pts = r.points.filter((_, i) => i % 2 === 0).map(p => S(p.x, p.y));
      polyline(pts, r.outcome === 'captured' ? C.spot : C.oliveDark, lab.selected === s && r.central ? 2.2 : 1.5, {arrows: 110});
      if (lab.pulsesOn) {
        const tEnd = r.points.at(-1).t, gap = 1.6;
        for (let t = ((now - s.T0) % gap + gap) % gap; t < tEnd; t += gap) {
          const q = atKey(r.points, 't', t), [x, y] = S(q.x, q.y);
          ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 2 * Math.PI); ctx.fill();
        }
      }
    }
  }
  // Signals: short arcs moving out (and in) along radial lines.
  for (const p of lab.pulses) {
    if (p.r < .03) continue;
    const half = Math.min(.25, 7 / (p.r * kk));
    ctx.strokeStyle = p.r < 1 ? C.paper2 : C.spot; ctx.lineWidth = 2.4; ctx.globalAlpha = p.dir > 0 ? 1 : .55;
    ctx.beginPath(); ctx.arc(cx, cy, p.r * kk, -p.phi - half, -p.phi + half); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // Probes: the straight fall line, then the probe (paper-coloured once inside the horizon).
  for (const p of lab.probes) {
    const sel = lab.selected === p, [x0, y0] = S(p.R * Math.cos(p.phi), p.R * Math.sin(p.phi)), [sx, sy] = S(p.r * Math.cos(p.phi), p.r * Math.sin(p.phi));
    polyline([[x0, y0], [cx, cy]], C.olive, 1.2, {dash: [2, 4]});
    ctx.strokeStyle = C.olive; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x0, y0, 4, 0, 2 * Math.PI); ctx.stroke();
    if (p.done) continue;
    const inside = p.r < 1, col = inside ? C.paper2 : C.olive;
    if (p.r > .05) arrowHead(sx - Math.cos(p.phi) * 10, sy + Math.sin(p.phi) * 10, Math.atan2(Math.sin(p.phi), -Math.cos(p.phi)), 5.5, col);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4); ctx.fillStyle = col; ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeStyle = inside ? C.paper2 : C.ink; ctx.lineWidth = 1; ctx.strokeRect(-5, -5, 10, 10); ctx.restore();
    letter(`${p.label}  τ ${p.tau.toFixed(1)}${inside ? '  INSIDE' : ''}`, sx + 10, sy + (Math.sin(p.phi) > 0 ? -9 : 17), {color: sel ? C.spot : C.ink});
  }
  // Clocks: dials whose hands turn clockwise at each clock's own rate.
  for (const c of lab.clocks) {
    const [sx, sy] = S(c.x, c.y), sel = lab.selected === c, R = kk < 30 ? 9 : 11;
    if (c.beacon) { ctx.strokeStyle = C.spot; ctx.lineWidth = 1.2; for (const s of [R + 5, R + 9]) { ctx.beginPath(); ctx.arc(sx, sy, s, -.6, .6); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, sy, s, Math.PI - .6, Math.PI + .6); ctx.stroke(); } }
    drawDial(sx, sy, R, c.tau, sel ? C.spot : C.ink2);
    const right = sx < W - 130;
    letter(c.label, right ? sx + R + 5 : sx - R - 5, sy - 3, {align: right ? 'left' : 'right', color: sel ? C.spot : C.ink});
    if (kk > 30) letter(`×${f3(gr.rate(radius(c)))}`, right ? sx + R + 5 : sx - R - 5, sy + 10, {align: right ? 'left' : 'right', color: C.ink3, size: 9});
  }
  // Light sources, with their aim handles.
  for (const s of lab.sources) {
    const a = deg(s.angle), [sx, sy] = S(s.x, s.y), sel = lab.selected === s;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-a); ctx.fillStyle = C.ink;
    if (s.kind === 'laser') { ctx.fillRect(-24, -6, 24, 12); ctx.fillStyle = C.spot; ctx.fillRect(-4, -2, 4, 4); }
    else { const h = s.width * kk / 2 + 6; ctx.fillRect(-9, -h, 9, 2 * h); }
    ctx.restore();
    const [hx, hy] = S(...aimHandle(s));
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = C.paper2; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    if (sel) { ctx.strokeStyle = C.spot; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(sx, sy, 20, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    letter(s.label, sx, sy + 24, {align: 'center', color: sel ? C.spot : C.ink});
  }
  const sel = lab.selected;
  if (sel && sel.type !== 'source') {
    const [x, y] = S(sel.type === 'orbiter' && !sel.gone ? sel.bx : sel.x, sel.type === 'orbiter' && !sel.gone ? sel.by : sel.y);
    ctx.strokeStyle = C.spot; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(x, y, 18, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  }
  if (river) drawRiverOver();
  drawTitleBlock();
}
function drawRiverUnder() {
  const kk = k(), [cx, cy] = S(0, 0);
  // The flowing space: tracer dots with tails pointing upstream, longer where the river runs faster.
  ctx.strokeStyle = 'rgba(86,97,42,.5)'; ctx.lineWidth = 1.4;
  for (const p of lab.tracers) {
    const v = gr.riverSpeed(p.r), x = cx + Math.cos(p.phi) * p.r * kk, y = cy - Math.sin(p.phi) * p.r * kk, tail = Math.min(26, 9 * v * kk / 30 + 3);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.phi) * tail, y - Math.sin(p.phi) * tail); ctx.stroke();
    ctx.fillStyle = C.olive; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 2 * Math.PI); ctx.fill();
  }
  // River speed on a few rings.
  for (const r of [1, 2, 4, 9, 16]) {
    if (r > lab.viewR * 1.15 || (kk < 35 && r !== 1)) continue;
    const a = deg(232), [x, y] = [cx + Math.cos(a) * r * kk, cy - Math.sin(a) * r * kk];
    letter(r === 1 ? 'RIVER AT c' : `RIVER ${gr.riverSpeed(r).toFixed(2)}c`, x - 4, y + 12, {size: 8.5, color: C.olive, align: 'right'});
  }
  // Flashes: where the light from each flash is now (exact rays), and where the river has carried its centre.
  for (const f of lab.flashes) {
    const local = lab.now - f.T0, pts = f.rays.map(r => { const q = atKey(r.points, 'ef', local); return S(q.x, q.y); });
    ctx.fillStyle = 'rgba(200,84,31,.09)'; ctx.strokeStyle = C.spot; ctx.lineWidth = 1.8;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    const [fx, fy] = S(f.x, f.y);
    ctx.strokeStyle = C.spot; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx - 5, fy - 5); ctx.lineTo(fx + 5, fy + 5); ctx.moveTo(fx + 5, fy - 5); ctx.lineTo(fx - 5, fy + 5); ctx.stroke();
    const [dx, dy] = S(f.cr * Math.cos(f.cphi), f.cr * Math.sin(f.cphi));
    if (f.cr > .06) { ctx.fillStyle = C.olive; ctx.beginPath(); ctx.arc(dx, dy, 3.2, 0, 2 * Math.PI); ctx.fill(); }
  }
}
function drawRiverOver() {
  const kk = k();
  // A clock held still is swimming upstream at the river's speed: that is why it runs slow.
  for (const c of lab.clocks) {
    const r = radius(c), v = gr.riverSpeed(r), b = bearing(c), [sx, sy] = S(c.x, c.y), len = 16 + 38 * v;
    const ex = sx + Math.cos(b) * len, ey = sy - Math.sin(b) * len;
    ctx.strokeStyle = C.spot; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + Math.cos(b) * 13, sy - Math.sin(b) * 13); ctx.lineTo(ex, ey); ctx.stroke();
    arrowHead(ex, ey, Math.atan2(ey - sy, ex - sx), 6, C.spot);
    if (kk > 35) letter(`SWIMS AT ${v.toFixed(2)}c`, ex + 6, ey + 4, {size: 8.5, color: C.spot});
  }
  if (W > 520 && kk > 0) {
    const lines = ['THE RIVER OF SPACE', 'dots: space flowing in at √(rₛ/r) × c', 'light moves at c through the flowing space', 'a clock held still swims upstream, so runs slow', 'at the horizon the river reaches c:', 'light aimed outwards there stands still', 'click anywhere to set off a flash'];
    const bw = 290, bh = 16 + lines.length * 14, bx = 10, by = H - bh - 10;
    ctx.fillStyle = 'rgba(244,238,224,.94)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.strokeRect(bx, by, bw, bh);
    lines.forEach((t, i) => { ctx.font = i ? '500 11px Inter, system-ui, sans-serif' : '700 9.5px "Space Mono", monospace'; ctx.fillStyle = i ? C.ink2 : C.ink; ctx.fillText(t, bx + 8, by + 16 + i * 14); });
  }
}
function aimHandle(s) { const a = deg(s.angle), d = 2.2 * 9 / lab.viewR; return [s.x + Math.cos(a) * d, s.y + Math.sin(a) * d]; }

// ---------------------------------------------------------------- the spacetime map (distance across, t̃ up)
const PAD = {l: 46, r: 16, t: 14, b: 30};
const mx = r => PAD.l + r / lab.viewR * (W - PAD.l - PAD.r);
const mr = x => (x - PAD.l) / (W - PAD.l - PAD.r) * lab.viewR;
/** Time axis: 1:1 by default (light far away climbs at 45°, cones look like cones); "fit" squeezes more history in. */
function mapY() {
  const h = H - PAD.t - PAD.b, pxR = (W - PAD.l - PAD.r) / lab.viewR, span = lab.fit ? lab.span : h / pxR;
  const top = lab.now + span * .15, bot = top - span;
  return {top, bot, span, y: ef => PAD.t + (top - ef) / span * h, ef: y => top - (y - PAD.t) / h * span, pxT: h / span};
}
function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function drawCone(m, r, ef, size, {fill = 'rgba(201,201,163,.5)', stroke = C.ink4, width = 1.2} = {}) {
  const pxR = (W - PAD.l - PAD.r) / lab.viewR, [, out] = gr.coneSlopes(r), ax = mx(r), ay = m.y(ef);
  const hIn = size / Math.hypot(pxR, m.pxT), dOut = Math.abs(r - 1) < 1e-6 ? 0 : 1 / out, hOut = size / Math.hypot(dOut * pxR, m.pxT), h = Math.min(hIn, hOut);
  const inX = ax - h * pxR, outX = ax + h * dOut * pxR, topY = ay - h * m.pxT;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(inX, topY); ctx.lineTo(outX, topY); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(inX, topY); ctx.lineTo(ax, ay); ctx.lineTo(outX, topY); ctx.stroke();
  arrowHead(inX, topY, Math.atan2(topY - ay, inX - ax), 2.6 + width, stroke); arrowHead(outX, topY, Math.atan2(topY - ay, outX - ax), 2.6 + width, stroke);
  return {ax, ay, inX, outX, topY};
}
let mapHover = null;
function drawMap() {
  ctx.fillStyle = C.mat; ctx.fillRect(0, 0, W, H);
  const m = mapY(), now = lab.now, pt = (r, ef) => [mx(r), m.y(ef)];
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, W - PAD.l - PAD.r, H - PAD.t - PAD.b); ctx.clip();
  ctx.fillStyle = 'rgba(233,185,154,.3)'; ctx.fillRect(PAD.l, PAD.t, mx(1) - PAD.l, H);
  const tStep = niceStep(m.span / 6);
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
  for (let ef = Math.ceil(m.bot / tStep) * tStep; ef <= m.top; ef += tStep) { ctx.beginPath(); ctx.moveTo(PAD.l, m.y(ef)); ctx.lineTo(W, m.y(ef)); ctx.stroke(); }
  for (let r = 1; r <= lab.viewR; r++) { ctx.beginPath(); ctx.moveTo(mx(r), PAD.t); ctx.lineTo(mx(r), H - PAD.b); ctx.stroke(); }
  // Light cones: a few, large, fixed in spacetime (they slide down the page as time passes).
  const pxR = (W - PAD.l - PAD.r) / lab.viewR, rowEF = niceStep(130 / m.pxT), cStep = Math.max(1, niceStep(130 / pxR)), cols = [.5, 1];
  for (let r = 2; r < lab.viewR - .3; r += cStep) cols.push(r);
  const labelRow = Math.floor((m.bot + m.span * .22) / rowEF) * rowEF;
  for (let ef = Math.floor(m.bot / rowEF) * rowEF; ef <= m.top + rowEF; ef += rowEF) for (const [i, r] of cols.entries()) {
    const c = drawCone(m, r, ef + (i % 2) * rowEF / 2, 34, {width: 1.4});
    if (ef === labelRow) {
      letter('IN', c.inX - 4, c.topY - 4, {size: 8.5, color: C.ink3, align: 'right', bg: null});
      letter(r < .999 ? 'OUT: STILL IN' : r < 1.001 ? 'OUT: STUCK' : 'OUT', c.outX + 4, c.topY - 4, {size: 8.5, color: r <= 1.001 ? C.spot : C.ink3, bg: null});
    }
  }
  // Paths.
  for (const p of lab.pulses) {
    const pts = []; for (let i = 0; i <= 20; i++) { const ef = p.efe + (now - p.efe) * i / 20; pts.push(pt(pulseRadius(p, ef), ef)); }
    polyline(pts, C.spot, 1, {alpha: .7});
  }
  for (const s of lab.sources) for (const r of s.rays) {
    const pts = []; for (let i = 0; i < r.points.length; i += 4) { const q = r.points[i]; if (s.T0 + q.ef > now) break; pts.push(pt(q.r, s.T0 + q.ef)); }
    polyline(pts, r.outcome === 'captured' ? C.spot : C.oliveDark, 1, {alpha: .75});
  }
  const ticks = (list, color) => { ctx.fillStyle = C.paper2; ctx.strokeStyle = color; ctx.lineWidth = 1.4; for (const t of list) if (t.ef > m.bot) { const [x, y] = pt(t.r, t.ef); ctx.beginPath(); ctx.arc(x, y, 2.7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); } };
  for (const c of lab.clocks) {
    const pts = c.history.filter(s => s.ef >= m.bot - 1).map(s => pt(s.r, s.ef)); pts.push(pt(radius(c), now));
    polyline(pts, lab.selected === c ? C.spot : C.ink2, 2.2); ticks(c.ticks, C.ink2);
  }
  for (const p of lab.probes) {
    const end = p.done ? Infinity : p.ef0 + now - p.T0, pts = [];
    for (const s of p.fall.samples) { if (s.ef > end) break; pts.push(pt(s.r, p.T0 + s.ef - p.ef0)); }
    if (!p.done) pts.push(pt(p.r, now));
    polyline(pts, lab.selected === p ? C.spot : C.olive, 2.2); ticks(p.ticks, C.olive);
    if (p.crossed != null) { const [x, y] = pt(1, p.T0 + p.fall.efHorizon - p.ef0); ctx.fillStyle = C.spot; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); letter(`${p.label} CROSSES · τ ${p.crossed.toFixed(1)}`, x + 8, y + 4, {color: C.spot}); }
  }
  for (const o of lab.orbiters) {
    const local = now - o.T0, pts = [];
    for (let i = 0; i < o.points.length && o.points[i].ef <= local; i += 3) { const q = o.points[i]; if (o.T0 + q.ef >= m.bot - 2) pts.push(pt(q.r, o.T0 + q.ef)); }
    if (!o.gone) pts.push(pt(o.r, now));
    polyline(pts, lab.selected === o ? C.spot : C.olive, 1.8);
  }
  // Now.
  const yNow = m.y(now);
  ctx.strokeStyle = C.spot; ctx.lineWidth = 1.5; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(PAD.l, yNow); ctx.lineTo(W, yNow); ctx.stroke(); ctx.setLineDash([]);
  for (const o of [...lab.clocks.map(c => [c, radius(c)]), ...lab.probes.filter(p => !p.done).map(p => [p, p.r]), ...lab.orbiters.filter(o => !o.gone).map(o => [o, o.r])]) {
    const [x, y] = pt(o[1], now); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); letter(o[0].label, x + 6, y - 6, {size: 9.5});
  }
  if (mapHover) { const c = drawCone(m, mapHover.r, mapHover.ef, 56, {fill: 'rgba(200,84,31,.2)', stroke: C.spot, width: 1.8}); letter(mapHover.r < 1 ? 'BOTH EDGES LEAN IN' : 'FUTURE LIGHT CONE', c.ax + 8, c.ay + 15, {color: C.spot}); }
  ctx.restore();
  // Horizon, singularity, axes.
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(mx(1), PAD.t); ctx.lineTo(mx(1), H - PAD.b); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath(); for (let y = PAD.t, i = 0; y <= H - PAD.b; y += 5, i++) { const x = mx(0) + (i % 2 ? 3 : 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = C.spot; ctx.beginPath(); ctx.moveTo(mx(1.5), PAD.t); ctx.lineTo(mx(1.5), H - PAD.b); ctx.stroke(); ctx.setLineDash([]);
  for (let r = 0; r <= lab.viewR; r += lab.viewR > 12 ? 2 : 1) letter(`${r}`, mx(r), H - PAD.b + 14, {size: 9, color: C.ink3, align: 'center', bg: null});
  letter('DISTANCE FROM THE CENTRE r (rₛ) →', W - PAD.r, H - 6, {size: 9, color: C.ink3, align: 'right', bg: null});
  for (let ef = Math.ceil(m.bot / tStep) * tStep; ef <= m.top; ef += tStep) letter(`${+ef.toFixed(1)}`, PAD.l - 6, m.y(ef) + 4, {size: 9, color: C.ink3, align: 'right', bg: null});
  letter('t̃ ↑', PAD.l - 6, PAD.t + 8, {size: 9, color: C.ink3, align: 'right', bg: null});
  letter('NOW', W - PAD.r - 4, yNow - 6, {color: C.spot, align: 'right'});
  letter('HORIZON', mx(1) + 5, H - PAD.b - 6, {});
  letter('INSIDE', PAD.l + 4, PAD.t + 12, {color: C.spot, size: 9});
  const squeeze = m.span * pxR / (H - PAD.t - PAD.b);
  letter(lab.fit ? `TIME SQUEEZED ×${f1(squeeze)} · SCROLL TO CHANGE` : 'TIME 1:1 · LIGHT FAR AWAY CLIMBS AT 45°', W - PAD.r - 4, PAD.t + 12, {size: 9, color: C.ink3, align: 'right'});
  // Key: what the cones mean.
  if (W > 420) {
    const lines = ['EACH CONE: WHERE LIGHT CAN GO NEXT', 'left arm: light moving inwards', 'right arm: light moving outwards', 'anything with mass stays between the arms', 'at the horizon the right arm stands upright;', 'inside, both arms lean in: every future ends at r = 0'];
    const bw = 300, bh = 16 + lines.length * 14, bx = W - PAD.r - bw - 4, by = H - PAD.b - bh - 10;
    ctx.fillStyle = 'rgba(244,238,224,.94)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.strokeRect(bx, by, bw, bh);
    lines.forEach((t, i) => { ctx.font = i ? '500 11px Inter, system-ui, sans-serif' : '700 9.5px "Space Mono", monospace'; ctx.fillStyle = i ? C.ink2 : C.ink; ctx.fillText(t, bx + 8, by + 16 + i * 14); });
  }
}
function draw() {
  if (!lab.plate || W < 10) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (lab.view === 'map') drawMap(); else drawChart(lab.view === 'river');
}

// ---------------------------------------------------------------- the sheet
function renderPlate() {
  const pl = lab.plate;
  $('plates').innerHTML = plates.map((x, i) => `<button class="tab${x === pl ? ' on' : ''}" data-id="${x.id}"><b>${String(i + 1).padStart(2, '0')}</b>${x.label}</button>`).join('');
  $('note').innerHTML = `<p class="letter"><span>Plate ${String(plates.indexOf(pl) + 1).padStart(2, '0')} · notes</span></p><h1>${pl.title}</h1>${pl.text}
    <div class="formula">${pl.formula}<small>${pl.note}</small></div><p class="letter">Try</p><ul class="try">${pl.tries.map(t => `<li>${t}</li>`).join('')}</ul><div class="insight" id="insight"></div>`;
}
const row = (k, v) => `<tr><th>${k}</th><td class="num">${v}</td></tr>`;
function renderSelected() {
  const o = lab.selected, el = $('selected');
  if (!o) { el.innerHTML = '<p class="letter"><span>Specification</span></p><p class="empty">Select something on the chart, or add a part from the tray, to see and change it.</p>'; return; }
  const remove = `<div class="row"><button class="tab" id="sel-remove">Remove ${o.label}</button></div>`;
  let rows = '', controls = '';
  if (o.type === 'clock') {
    const r = radius(o);
    rows = row('Clock', `${o.label}, held still`) + row('Distance r', formatLength(r)) + row('Bearing', `${Math.round(((rad(bearing(o)) % 360) + 360) % 360)}°`);
    controls = `<label><span>Distance r <output>${f2(r)} rₛ</output></span><input type="range" id="sel-r" min="1.05" max="${Math.max(12, lab.viewR)}" step="0.01" value="${r}"></label>
      <div class="row"><button class="tab${o.beacon ? ' on' : ''}" id="sel-beacon">${o.beacon ? 'Signals on' : 'Signals off'}</button></div>`;
  } else if (o.type === 'source') {
    rows = row('Source', `${o.label}, ${o.kind}`) + row('Position', `${f1(o.x)}, ${f1(o.y)} rₛ`) + row('Aimed', `${Math.round(o.angle)}°`);
    controls = `<label><span>Aim <output>${Math.round(o.angle)}°</output></span><input type="range" id="sel-angle" min="-180" max="180" step="1" value="${Math.round(((o.angle + 180) % 360 + 360) % 360 - 180)}"></label>
      ${o.kind === 'beam' ? `<label><span>Rays <output>${o.count}</output></span><input type="range" id="sel-count" min="2" max="25" step="1" value="${o.count}"></label>
      <label><span>Width <output>${f1(o.width)} rₛ</output></span><input type="range" id="sel-width" min="1" max="16" step="0.5" value="${o.width}"></label>` : ''}`;
  } else if (o.type === 'probe') {
    rows = row('Probe', `${o.label}, let go from rest`) + row('Released at', formatLength(o.R));
    controls = `<label><span>Release distance <output>${f2(o.R)} rₛ</output></span><input type="range" id="sel-R" min="1.1" max="${Math.max(12, lab.viewR)}" step="0.05" value="${o.R}"></label>
      <div class="row"><button class="tab" id="sel-drop">Drop again</button><button class="tab${o.beacon ? ' on' : ''}" id="sel-beacon">${o.beacon ? 'Signals on' : 'Signals off'}</button></div>`;
  } else {
    rows = row('Orbiter', `${o.label}, launched sideways`) + row('Launched at', formatLength(o.r0)) + row('Direction', o.dir > 0 ? 'anticlockwise' : 'clockwise');
    controls = `<label><span>Launch speed <output>${f2(o.push)} × circular</output></span><input type="range" id="sel-push" min="0.5" max="1.5" step="0.005" value="${o.push}"></label>
      <div class="row"><button class="tab" id="sel-relaunch">Launch again</button><button class="tab" id="sel-dir">Reverse direction</button></div>`;
  }
  el.innerHTML = `<p class="letter"><span>Specification · ${o.label}</span></p><table class="spec">${rows}</table><div class="controls">${controls}${remove}</div>`;
  bindSelected();
}
function bindSelected() {
  const o = lab.selected, on = (id, fn, fmt) => { const e = $(id); if (e) e.oninput = ev => { fn(+ev.target.value); ev.target.previousElementSibling.querySelector('output').textContent = fmt(+ev.target.value); renderLog(); draw(); }; };
  on('sel-r', v => { const b = bearing(o); o.x = v * Math.cos(b); o.y = v * Math.sin(b); }, v => `${f2(v)} rₛ`);
  on('sel-angle', v => { o.angle = v; trace(o); }, v => `${v}°`);
  on('sel-count', v => { o.count = v; trace(o); }, v => `${v}`);
  on('sel-width', v => { o.width = v; trace(o); }, v => `${f1(v)} rₛ`);
  on('sel-R', v => placeProbe(o, v * Math.cos(o.phi), v * Math.sin(o.phi)), v => `${f2(v)} rₛ`);
  on('sel-push', v => { o.push = v; launch(o, o.x, o.y); }, v => `${f2(v)} × circular`);
  const click = (id, fn) => { const e = $(id); if (e) e.onclick = () => { fn(); renderSelected(); renderLog(); draw(); }; };
  click('sel-beacon', () => { o.beacon = !o.beacon; });
  click('sel-drop', () => placeProbe(o, o.x, o.y));
  click('sel-relaunch', () => launch(o, o.x, o.y));
  click('sel-dir', () => { o.dir = -o.dir; launch(o, o.x, o.y); });
  const rm = $('sel-remove'); if (rm) rm.onclick = () => remove(o);
}
/** Exact readings for the selected item (or the first thing on the chart). */
function renderLog() {
  const o = lab.selected ?? lab.clocks[0] ?? lab.sources[0] ?? lab.probes[0] ?? lab.orbiters[0], el = $('log');
  $('log-who').textContent = o ? o.label : '';
  if (!o) { el.innerHTML = '<p class="empty">Nothing on the chart yet.</p>'; return; }
  let rows = '';
  if (o.type === 'clock') {
    const r = radius(o), q = gr.rate(r), got = o.received, last = got.slice(-2);
    rows = row('River flows past at', `v = √(1/${f2(r)}) = ${f3(gr.riverSpeed(r))} c`) + row('Rate (vs far away)', `√(1 − v²) = ${f3(q)}`) + row('1 s on this clock', `${f3(1 / q)} s far away`)
      + row('Its own time τ', formatTime(o.tau)) + row('Far-away time', formatTime(lab.now))
      + row('Light sent from here', `reaches far away ×${f3(q)} in frequency`)
      + (last.length === 2 && last[0].from === last[1].from ? row('Signals received', `${got.length}, last gap ${formatTime(last[1].tau - last[0].tau)}`) : got.length ? row('Signals received', `${got.length}`) : '');
  } else if (o.type === 'source') {
    const r = o.rays.find(x => x.central) ?? o.rays[0];
    if (!r) { el.innerHTML = '<p class="empty">This source is inside the horizon: no light leaves.</p>'; return; }
    const caught = o.rays.filter(x => x.outcome === 'captured').length;
    rows = (o.kind === 'beam' ? row('Rays captured', `${caught} of ${o.rays.length}`) + row('Central ray', '') : '')
      + row('Impact parameter b', `${f2(r.b)} rₛ <span class="badge${r.b < gr.criticalImpact ? ' spot' : ''}">${r.b < gr.criticalImpact ? 'below 2.60' : 'above 2.60'}</span>`)
      + row('Closest approach', formatLength(r.rmin)) + row('Turns round the hole', f2(r.turns))
      + row('Outcome', r.outcome === 'captured' ? 'falls into the hole' : r.outcome === 'escapes' ? `escapes, turned through ${f1(r.bend)}° on the chart` : 'still going')
      + row('Time to leave the chart', formatTime(r.points.at(-1).t));
  } else if (o.type === 'probe') {
    rows = row('Released from', formatLength(o.R)) + row('Now at', o.done ? 'r = 0' : formatLength(o.r)) + row('Its own time τ', formatTime(o.tau))
      + row('τ to the horizon', formatTime(o.fall.tauHorizon)) + row('τ to the centre', formatTime(o.fall.fall.tauCentre))
      + row('Crossing seen far away', 'never: its light is delayed for ever') + row('Signals sent', `${o.sent}`);
  } else {
    rows = row('Angular momentum L', `${f3(Math.abs(o.L))} rₛc`) + row('Energy E', `${f3(o.E)} mc²`)
      + row('Range of r', `${f2(o.rmin)} to ${f2(o.rmax)} rₛ`)
      + row('Outcome', o.outcome === 'bound' ? 'bound orbit' : o.outcome === 'plunges' ? 'falls in' : 'escapes')
      + (o.precession != null ? row('Precession per lap', `${f1(o.precession)}°`) : '')
      + (o.period ? row('Lap (own time)', formatTime(o.period)) : '') + row('Its own time τ', formatTime(o.tau));
  }
  el.innerHTML = `<table class="spec readings">${rows}</table>`;
}
function renderInsight() { const el = $('insight'); if (el) el.innerHTML = lab.plate.insight(lab); $('clock-far').textContent = `t̃ = ${formatTime(lab.now)}`; }
function select(o) { lab.selected = o; renderSelected(); renderLog(); draw(); }
function remove(o) {
  for (const key of ['clocks', 'sources', 'probes', 'orbiters']) lab[key] = lab[key].filter(x => x !== o);
  lab.selected = null; renderSelected(); renderLog(); draw();
}
function load(pl) {
  Object.assign(lab, {plate: pl, now: 0, clocks: [], sources: [], probes: [], orbiters: [], pulses: [], selected: null, counter: {}, viewR: pl.viewR ?? 9, span: 24, flashes: [], sites: []});
  seedTracers();
  setSpeed(pl.speed ?? 1.5);
  pl.setup(lab);
  setView(pl.view ?? (lab.view === 'river' ? 'chart' : lab.view === 'map' ? 'map' : 'chart'));
  renderPlate(); renderSelected(); renderLog(); renderInsight(); draw();
}

// ---------------------------------------------------------------- hands
function pick(sx, sy) {
  const near = (x, y, r = 16) => { const [px, py] = S(x, y); return Math.hypot(px - sx, py - sy) < r; };
  for (const s of lab.sources) if (near(...aimHandle(s), 12)) return {o: s, mode: 'aim'};
  for (const s of lab.sources) if (near(s.x, s.y, 22)) return {o: s, mode: 'move'};
  for (const c of lab.clocks) if (near(c.x, c.y)) return {o: c, mode: 'move'};
  for (const p of lab.probes) if (near(p.r * Math.cos(p.phi), p.r * Math.sin(p.phi)) || near(p.x, p.y)) return {o: p, mode: 'move'};
  for (const o of lab.orbiters) if ((!o.gone && near(o.bx, o.by)) || near(o.x, o.y)) return {o, mode: 'move'};
  return null;
}
let drag = null;
const local = event => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
canvas.addEventListener('pointerdown', event => {
  if (lab.view === 'map') return;
  const [sx, sy] = local(event), h = pick(sx, sy);
  canvas.setPointerCapture(event.pointerId);
  if (!h) {
    if (lab.view === 'river') { const [x, y] = Wd(sx, sy); if (!flash(x, y)) showTip(event, '<b>Inside the horizon</b>Light from here cannot even stand still: it is swept inwards.'); draw(); return; }
    select(null); return;
  }
  if (lab.selected !== h.o) select(h.o);
  drag = h;
});
canvas.addEventListener('pointermove', event => {
  const [sx, sy] = local(event);
  if (lab.view === 'map') {
    const r = mr(sx), m = mapY();
    mapHover = r > .05 && r < lab.viewR && sy > PAD.t && sy < H - PAD.b ? {r, ef: m.ef(sy)} : null;
    showTip(event, mapHover && (mapHover.r < 1 ? `<b>r = ${f2(mapHover.r)}, inside the horizon</b>Both edges of the light cone point to smaller r: even light aimed outwards falls in.` :
      `<b>r = ${f2(mapHover.r)}, t̃ = ${f1(mapHover.ef)}</b>Ingoing light moves 1 rₛ per rₛ/c here; outgoing light only ${f2(1 / gr.coneSlopes(mapHover.r)[1])}.`));
    if (!lab.playing) draw();
    return;
  }
  const [x, y] = Wd(sx, sy);
  if (drag) {
    const o = drag.o;
    if (drag.mode === 'aim') { o.angle = Math.round(rad(Math.atan2(y - o.y, x - o.x))); trace(o); }
    else if (o.type === 'clock') { o.x = x; o.y = y; clampClock(o); }
    else if (o.type === 'source') { o.x = x; o.y = y; trace(o); }
    else if (o.type === 'probe') placeProbe(o, x, y);
    else launch(o, x, y);
    renderLog(); draw(); return;
  }
  const h = pick(sx, sy);
  canvas.style.cursor = h ? (h.mode === 'aim' ? 'alias' : 'grab') : 'default';
  const r = Math.hypot(x, y);
  showTip(event, h ? `<b>${h.o.label}</b>${h.mode === 'aim' ? 'Drag to aim the light.' : 'Drag to move; select it to change it.'}` :
    r < 1 ? '<b>Inside the horizon</b>Nothing that enters can come out, not even light.' :
    Math.abs(r - 1.5) < .08 ? '<b>Photon sphere, 1.5 rₛ</b>Light aimed sideways here goes round in a circle.' :
    Math.abs(r - 3) < .1 ? '<b>Innermost stable orbit, 3 rₛ</b>No circular orbit inside this lasts.' : null);
});
const end = () => { if (drag) renderSelected(); drag = null; };
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('pointerleave', () => { mapHover = null; showTip(null); });
canvas.addEventListener('wheel', event => {
  if (lab.view !== 'map') return;
  event.preventDefault();
  if (!lab.fit) { lab.span = mapY().span; setFit(true); }
  lab.span = Math.min(400, Math.max(4, lab.span * (event.deltaY > 0 ? 1.12 : 1 / 1.12))); draw();
}, {passive: false});
function showTip(event, html) {
  const tip = $('tip');
  if (!html) { tip.classList.remove('visible'); return; }
  tip.innerHTML = html; tip.classList.add('visible');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(innerWidth - w - 10, event.clientX + 16)}px, ${Math.max(10, Math.min(innerHeight - h - 10, event.clientY - h - 12))}px)`;
}

document.querySelector('.tray').addEventListener('click', event => {
  const b = event.target.closest('[data-add]');
  if (!b) return;
  const kind = b.dataset.add, n = lab.clocks.length + lab.sources.length + lab.probes.length + lab.orbiters.length, a = 30 + n * 47;
  const o = kind === 'clock' ? lab.addClock(5, a) : kind === 'laser' ? lab.addLaser(-lab.viewR * .8, 2.5, 0) : kind === 'beam' ? lab.addBeam(-lab.viewR * .85, 0, 0, {count: 9, width: 8})
    : kind === 'probe' ? lab.addProbe(6, a) : lab.addOrbiter(6, a);
  select(o);
});
$('plates').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) load(plates.find(p => p.id === b.dataset.id)); });
function setFit(on) { lab.fit = on; if (on && !lab.span) lab.span = 30; $('t-fit').classList.toggle('on', on); $('t-fit').setAttribute('aria-pressed', String(on)); $('t-fit').textContent = on ? 'Time squeezed' : 'Time 1:1'; draw(); }
$('t-fit').onclick = () => { if (!lab.fit) lab.span = 30; setFit(!lab.fit); };
function setView(v) { $('t-fit').hidden = v !== 'map'; lab.view = v; mapHover = null; for (const b of document.querySelectorAll('[data-view]')) { b.classList.toggle('on', b.dataset.view === v); b.setAttribute('aria-pressed', String(b.dataset.view === v)); } draw(); }
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => setView(b.dataset.view);
function setSpeed(v) { lab.speed = v; for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === v); }
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => setSpeed(+b.dataset.speed);
for (const b of document.querySelectorAll('[data-scale]')) b.onclick = () => {
  lab.scale = b.dataset.scale; for (const x of document.querySelectorAll('[data-scale]')) x.classList.toggle('on', x === b);
  renderSelected(); renderLog(); renderInsight(); draw();
};
function setPlaying(on) { lab.playing = on; $('play').textContent = on ? 'Pause' : 'Play'; }
$('play').onclick = () => setPlaying(!lab.playing);
$('t-pulses').onclick = () => { lab.pulsesOn = !lab.pulsesOn; $('t-pulses').classList.toggle('on', lab.pulsesOn); $('t-pulses').setAttribute('aria-pressed', String(lab.pulsesOn)); draw(); };
const zoom = f => { lab.viewR = Math.min(20, Math.max(2.5, lab.viewR * f)); for (const s of lab.sources) trace(s); seedTracers(); draw(); };
$('zoom-in').onclick = () => zoom(1 / 1.25);
$('zoom-out').onclick = () => zoom(1.25);
$('restart').onclick = () => load(lab.plate);
const notes = $('notes');
$('about').onclick = () => notes.showModal();
notes.querySelector('.close').onclick = () => notes.close();
notes.addEventListener('click', event => { if (event.target === notes) notes.close(); });
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open]')) return;
  const o = lab.selected, nudge = {ArrowLeft: [-.25, 0], ArrowRight: [.25, 0], ArrowUp: [0, .25], ArrowDown: [0, -.25]}[event.key];
  if (o && nudge && o.type !== 'orbiter' && o.type !== 'probe') { event.preventDefault(); o.x += nudge[0]; o.y += nudge[1]; if (o.type === 'clock') clampClock(o); else trace(o); renderLog(); draw(); }
  else if (o?.type === 'source' && (event.key === '[' || event.key === ']')) { o.angle += event.key === '[' ? 5 : -5; trace(o); renderSelected(); renderLog(); draw(); }
  else if (o && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); remove(o); }
  else if (event.key === ' ') { event.preventDefault(); setPlaying(!lab.playing); }
  else if (event.key === 'm' || event.key === 'M') setView(lab.view === 'map' ? 'chart' : 'map');
  else if (event.key === 'v' || event.key === 'V') setView(lab.view === 'river' ? 'chart' : 'river');
  else if (/^[1-8]$/.test(event.key)) load(plates[+event.key - 1]);
  else if (event.key === 'Escape') select(null);
});

// ---------------------------------------------------------------- loop
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now(), lastPanel = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (lab.playing) advance(dt * lab.speed * (reducedMotion ? .4 : 1));
  draw();
  if (now - lastPanel > 300) { lastPanel = now; renderLog(); renderInsight(); }
  requestAnimationFrame(frame);
}
setPlaying(true);
load(plates[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__gr = {
    lab, plates, load: id => load(plates.find(p => p.id === id)), setView, select,
    run: t => { advance(t); renderLog(); renderInsight(); draw(); return lab.now; },
    snap: () => ({plate: lab.plate.id, now: lab.now, insight: $('insight')?.textContent, log: $('log').textContent.slice(0, 400)}),
  };
}
