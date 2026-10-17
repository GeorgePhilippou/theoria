// Curved spacetime: the black-hole lab. Three linked figures (top view, clock rates, spacetime map) drawn in 2D,
// driven by one clock: Eddington–Finkelstein time t̃, which ticks like a far-away clock and stays finite at the horizon.
import * as gr from './physics.js';
import {scenarios} from './scenarios.js';

const $ = id => document.getElementById(id);
const C = {
  ink: '#2f3614', ink2: '#454d22', ink3: '#6a6f45', ink4: '#8a8c68', olive: '#56612a', oliveDark: '#3b4419',
  spot: '#c8541f', spotTint: '#e9b99a', oliveTint: '#c9c9a3', paper: '#ece4d2', paper2: '#f4eee0', rule: 'rgba(86,97,42,.16)',
};
const PALETTE = [C.spot, C.olive, C.ink, '#9a5a1c', C.oliveDark, C.ink3, '#a8432b', '#6f7a34'];
const TICK = 2;                 // clocks tick, and signals are sent, every 2 units of a body's own time
const DIAL_PERIOD = 8;          // one turn of a clock hand per 8 units of its own time
const LIMITS = {clocks: 8, probes: 5, rays: 30, orbits: 6};
const SCALES = {
  rs: {label: 'rₛ', note: 'Distances in Schwarzschild radii rₛ (the horizon radius), times in rₛ/c: the time light takes to cross one.'},
  sun: {km: 2.953, s: 9.85e-6, note: 'One solar mass: rₛ = 2.95 km, rₛ/c = 9.85 µs. The whole hole would fit inside a small town.'},
  sgr: {km: 1.27e7, s: 42.4, note: 'Sagittarius A*, 4.3 million solar masses: rₛ = 12.7 million km (0.085 au), rₛ/c = 42 s.'},
};
const HINTS = {
  move: 'Drag a clock to move it (in figure 1, or its dot in figure 2). Hover over anything for its numbers.',
  clock: 'Click to place a clock held still at that spot. Nothing can be held still at or inside the horizon.',
  ray: 'Press where the light starts and drag the way it should head, then let go.',
  probe: 'Click to let a probe go from rest there. It falls straight in, sending a signal every 2 units of its own time.',
  orbit: 'Click to launch a body sideways (anticlockwise) from there, at the launch speed below.',
  beacon: 'Click a clock or probe to switch its signals on or off: a flash every 2 units of its own time, sent both inwards and outwards.',
};

// ---------------------------------------------------------------- the lab state
const lab = {
  clocks: [], probes: [], rays: [], orbits: [], pulses: [],
  now: 0, playing: true, speed: 2, tool: 'move', viewR: 9, span: 30, scale: 'rs', push: 1, scenario: null, colorIndex: 0,

  nextColor() { return PALETTE[this.colorIndex++ % PALETTE.length]; },
  nextName(list, start) {
    const used = new Set([...this.clocks, ...this.probes, ...this.orbits].map(o => o.name));
    for (let i = 0; i < 26; i++) { const n = String.fromCharCode(start + i); if (!used.has(n)) return n; }
    return '?';
  },
  addClock(r, phi, {name, beacon = false} = {}) {
    if (this.clocks.length >= LIMITS.clocks) this.clocks.shift();
    const c = {kind: 'clock', name: name ?? this.nextName(this.clocks, 65), r: Math.max(1.05, r), phi, tau: 0, beacon, nextTick: TICK,
      color: this.nextColor(), history: [{ef: this.now, r: Math.max(1.05, r)}], ticks: [], received: []};
    this.clocks.push(c);
    return c;
  },
  dropProbe(R, phi, {name, beacon = true} = {}) {
    if (this.probes.length >= LIMITS.probes) this.probes.shift();
    R = Math.max(1.05, R);
    const fall = gr.fallEF(R);
    const p = {kind: 'probe', name: name ?? this.nextName(this.probes, 67), R, phi, T0: this.now, fall, ef0: fall.samples[0].ef,
      tau: 0, r: R, sent: 0, nextTick: TICK, ticks: [], crossed: null, done: false, beacon, color: this.nextColor()};
    this.probes.push(p);
    return p;
  },
  addRay(x, y, dx, dy, {quiet = false} = {}) {
    if (this.rays.length >= LIMITS.rays) this.rays.shift();
    const r0 = Math.hypot(x, y);
    const ray = gr.traceRay(x, y, dx, dy, {rOut: Math.max(16, this.viewR * 1.7)});
    const offset = Math.log(r0 - 1);
    for (const p of ray.points) p.ef = p.t + Math.log(Math.abs(p.r - 1)) - offset;
    const out = {kind: 'ray', T0: this.now, points: ray.points, outcome: ray.outcome, color: ray.outcome === 'captured' ? C.spot : C.olive, L: ray.L, quiet};
    this.rays.push(out);
    return out;
  },
  addOrbit(r0, phi0, L, {name} = {}) {
    if (this.orbits.length >= LIMITS.orbits) this.orbits.shift();
    const o = gr.orbit(r0, L, {tMax: 2400, phi0});
    const offset = Math.log(r0 - 1), minima = [];
    o.points.forEach((p, i, a) => {
      p.ef = p.t + Math.log(Math.abs(p.r - 1)) - offset;
      if (i > 0 && i < a.length - 1 && p.r < a[i - 1].r && p.r <= a[i + 1].r) minima.push({ef: p.ef, phi: p.phi});
    });
    const body = {kind: 'orbit', name: name ?? this.nextName(this.orbits, 68), r0, L, T0: this.now, points: o.points, outcome: o.outcome,
      color: this.nextColor(), minima, periapses: [], tau: 0, r: r0, x: r0 * Math.cos(phi0), y: r0 * Math.sin(phi0), phi: phi0,
      ticks: [], nextTick: TICK, gone: false, beacon: false};
    this.orbits.push(body);
    return body;
  },
  time(x) { return formatTime(x); },
  maxBend() {
    let best = 0;
    for (const ray of this.rays) {
      if (ray.outcome !== 'escapes') continue;
      const p = ray.points, a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), b = Math.atan2(p.at(-1).y - p.at(-2).y, p.at(-1).x - p.at(-2).x);
      let d = Math.abs(b - a) * 180 / Math.PI; if (d > 180) d = 360 - d;
      best = Math.max(best, d);
    }
    return best.toFixed(0);
  },
  clear() {
    this.clocks = []; this.probes = []; this.rays = []; this.orbits = []; this.pulses = []; this.colorIndex = 0;
  },
};

function formatTime(x) {
  const s = SCALES[lab.scale];
  if (!s.s) return `${x.toFixed(1)} rₛ/c`;
  const sec = x * s.s;
  if (sec < 1e-3) return `${(sec * 1e6).toFixed(1)} µs`;
  if (sec < 1) return `${(sec * 1e3).toFixed(2)} ms`;
  if (sec < 120) return `${sec.toFixed(1)} s`;
  if (sec < 7200) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(2)} h`;
}
function formatLength(r) {
  const s = SCALES[lab.scale];
  if (!s.km) return `${r.toFixed(2)} rₛ`;
  const km = r * s.km;
  return km < 1e5 ? `${km.toFixed(km < 100 ? 1 : 0)} km` : `${(km / 1e6).toFixed(1)} million km`;
}

/** Interpolates a list of points ordered by `key` (all keys interpolated), clamped to the ends. */
function atKey(points, key, v) {
  if (v <= points[0][key]) return points[0];
  if (v >= points.at(-1)[key]) return points.at(-1);
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const m = (hi + lo) >> 1; if (points[m][key] < v) lo = m; else hi = m; }
  const a = points[lo], b = points[hi], u = (v - a[key]) / (b[key] - a[key] || 1), out = {i: lo};
  for (const k of Object.keys(a)) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}
function headIndex(points, key, v) {
  let lo = 0, hi = points.length - 1;
  if (v >= points[hi][key]) return hi;
  while (hi - lo > 1) { const m = (hi + lo) >> 1; if (points[m][key] < v) lo = m; else hi = m; }
  return lo;
}

// ---------------------------------------------------------------- signals: radial light pulses
/** Radius of a radial light pulse at EF time ef, sent from (re, efe) outwards (dir +1) or inwards (−1). */
function pulseRadius(p, ef) {
  if (p.dir < 0) return p.re - (ef - p.efe);
  const g = r => gr.outgoingLightEF(p.re, p.efe, r);
  if (p.re > 1 + 1e-9) {
    let lo = p.re, hi = p.re + 1;
    while (g(hi) < ef && hi < 1e5) hi = 1 + (hi - 1) * 2;
    for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (g(m) < ef) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // Inside the horizon the "outgoing" edge of the light cone also points inwards: g rises as r falls.
  if (g(1e-6) <= ef) return 0;
  let lo = 1e-6, hi = p.re;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (g(m) > ef) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function emit(from, r, phi) {
  for (const dir of [1, -1]) lab.pulses.push({re: r, efe: lab.now, phi, dir, from, r, prevR: r, color: from.color});
  if (lab.pulses.length > 500) lab.pulses.splice(0, lab.pulses.length - 500);
}

// ---------------------------------------------------------------- simulation step
function rateAlong(points, key, v) {
  const a = atKey(points, key, v - .05), b = atKey(points, key, v + .05);
  return (b.tau - a.tau) / ((b[key] - a[key]) || 1);
}
function step(dt) {
  lab.now += dt;
  const now = lab.now;
  for (const c of lab.clocks) {
    c.tau += gr.rate(c.r) * dt;
    while (c.tau >= c.nextTick) {
      c.ticks.push({ef: now, r: c.r});
      if (c.beacon) emit(c, c.r, c.phi);
      c.nextTick += TICK;
    }
    const last = c.history.at(-1);
    if (now - last.ef > .25 || Math.abs(last.r - c.r) > 1e-4) c.history.push({ef: now, r: c.r});
    if (c.history.length > 6000) c.history.splice(0, 1000);
    if (c.ticks.length > 1500) c.ticks.splice(0, 300);
  }
  for (const p of lab.probes) {
    if (p.done) continue;
    const s = p.fall.atEF(p.ef0 + now - p.T0);
    if (!s) { p.done = true; p.r = 0; p.tau = p.fall.tauCentre; continue; }
    if (p.r > 1 && s.r <= 1) p.crossed = s.tau;
    p.tau = s.tau; p.r = s.r;
    while (p.tau >= p.nextTick) {
      p.ticks.push({ef: now, r: p.r});
      if (p.beacon) { emit(p, p.r, p.phi); p.sent++; }
      p.nextTick += TICK;
    }
  }
  for (const o of lab.orbits) {
    const local = now - o.T0, end = o.points.at(-1);
    const q = atKey(o.points, 'ef', local);
    Object.assign(o, {r: q.r, x: q.x, y: q.y, tau: q.tau, phi: q.phi});
    if (local >= end.ef && o.outcome !== 'bound') o.gone = true;
    o.periapses = o.minima.filter(m => m.ef <= local).map(m => m.phi);
    while (!o.gone && o.tau >= o.nextTick) { o.ticks.push({ef: now, r: o.r}); if (o.beacon) emit(o, o.r, o.phi); o.nextTick += TICK; }
    if (o.ticks.length > 1500) o.ticks.splice(0, 300);
  }
  const keep = [];
  for (const p of lab.pulses) {
    p.prevR = p.r;
    p.r = pulseRadius(p, now);
    for (const c of lab.clocks) {
      if (c === p.from) continue;
      const crossed = (p.prevR - c.r) * (p.r - c.r) <= 0 && p.prevR !== p.r;
      if (crossed && Math.abs(angleDiff(c.phi, p.phi)) < .3) c.received.push({tau: c.tau, from: p.from, dir: p.dir});
    }
    if (p.r > .02 && p.r < lab.viewR * 1.6) keep.push(p);
  }
  lab.pulses = keep;
}
const angleDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
function advance(dt) {
  const n = Math.ceil(dt / .05);
  for (let i = 0; i < n; i++) step(dt / n);
}

// ---------------------------------------------------------------- canvases
const figs = {};
for (const id of ['top', 'rate', 'diag']) {
  const canvas = $(`c-${id}`), ctx = canvas.getContext('2d');
  figs[id] = {canvas, ctx, w: 1, h: 1};
  new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    Object.assign(figs[id], {w: r.width, h: r.height, dpr});
    drawAll();
  }).observe(canvas);
}
function begin(fig) {
  const {ctx, dpr, w, h} = fig;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.font = '10.5px "Space Mono", monospace';
  return ctx;
}
function arrowHead(ctx, x, y, angle, size, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .8, size * .62); ctx.lineTo(-size * .45, 0); ctx.lineTo(-size * .8, -size * .62); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}
/** Strokes a screen-space polyline with arrowheads every `every` pixels pointing along it, and one at the end. */
function arrowPath(ctx, pts, color, {width = 1.6, every = 80, head = true, alpha = 1, dash = null} = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.setLineDash([]);
  let run = every * .5;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy);
    run += len;
    if (run >= every && len > 0) { run = 0; arrowHead(ctx, pts[i][0], pts[i][1], Math.atan2(dy, dx), 4.2 + width, color); }
  }
  if (head) {
    let j = pts.length - 1, k = j - 1;
    while (k > 0 && Math.hypot(pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]) < 3) k--;
    arrowHead(ctx, pts[j][0], pts[j][1], Math.atan2(pts[j][1] - pts[k][1], pts[j][0] - pts[k][0]), 5.5 + width, color);
  }
  ctx.restore();
}
function label(ctx, text, x, y, {color = C.ink, align = 'left', bold = false, bg = true, size = 10.5} = {}) {
  ctx.font = `${bold ? 700 : 400} ${size}px "Space Mono", monospace`;
  const w = ctx.measureText(text).width, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  if (bg) { ctx.fillStyle = 'rgba(244,238,224,.86)'; ctx.fillRect(x0 - 2, y - size + 1, w + 4, size + 3); }
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x0, y);
}

// ---------------------------------------------------------------- figure 1: top view
function topMap() {
  const {w, h} = figs.top, k = Math.min(w, h) / (2 * lab.viewR * 1.04);
  return {k, cx: w / 2, cy: h / 2, to: (x, y) => [w / 2 + x * k, h / 2 - y * k], from: (sx, sy) => [(sx - w / 2) / k, (h / 2 - sy) / k]};
}
let aim = null, hover = null, dragging = null;
function drawTop() {
  const fig = figs.top, ctx = begin(fig), {w, h} = fig, m = topMap(), {k, cx, cy} = m, now = lab.now;
  // Graph paper, one square per rₛ.
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -Math.ceil(w / 2 / k); i <= Math.ceil(w / 2 / k); i++) { ctx.moveTo(cx + i * k, 0); ctx.lineTo(cx + i * k, h); }
  for (let i = -Math.ceil(h / 2 / k); i <= Math.ceil(h / 2 / k); i++) { ctx.moveTo(0, cy + i * k); ctx.lineTo(w, cy + i * k); }
  ctx.stroke();
  // Distance rings.
  ctx.strokeStyle = 'rgba(86,97,42,.32)';
  for (let r = 2; r <= lab.viewR * 1.5; r += 2) {
    ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 2 * Math.PI); ctx.stroke();
    if (r !== 4 || true) label(ctx, `${r}`, cx + r * k * Math.cos(-.95) + 3, cy - r * k * Math.sin(-.95) + 4, {color: C.ink4, size: 9.5});
  }
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.ink4; ctx.beginPath(); ctx.arc(cx, cy, 3 * k, 0, 2 * Math.PI); ctx.stroke();
  ctx.strokeStyle = C.spot; ctx.beginPath(); ctx.arc(cx, cy, 1.5 * k, 0, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, k, 0, 2 * Math.PI); ctx.fill();
  if (k > 26) label(ctx, 'horizon', cx, cy + 4, {color: C.paper2, align: 'center', bg: false, size: 9.5});

  // Light rays, travelled part only, with arrows along the direction of travel.
  for (const ray of lab.rays) {
    const local = now - ray.T0, n = headIndex(ray.points, 'ef', local), pts = [];
    for (let i = 0; i <= n; i += 2) pts.push(m.to(ray.points[i].x, ray.points[i].y));
    const tip = atKey(ray.points, 'ef', local); pts.push(m.to(tip.x, tip.y));
    const done = local >= ray.points.at(-1).ef;
    arrowPath(ctx, pts, ray.color, {width: 1.5, every: 90, head: !done || ray.outcome !== 'captured', alpha: done ? .55 : 1});
  }
  // Orbits: the path so far, faded with age, arrows on the latest stretch.
  for (const o of lab.orbits) {
    const local = now - o.T0, n = headIndex(o.points, 'ef', local), pts = [];
    for (let i = 0; i <= n; i += 3) pts.push(m.to(o.points[i].x, o.points[i].y));
    pts.push(m.to(o.x, o.y));
    const recent = pts.slice(-260);
    arrowPath(ctx, pts, o.color, {width: 1, every: 1e9, head: false, alpha: .35});
    arrowPath(ctx, recent, o.color, {width: 1.8, every: 120, head: false});
    if (!o.gone) {
      const [sx, sy] = m.to(o.x, o.y), prev = recent.at(-6) || recent[0];
      arrowHead(ctx, sx + (sx - prev[0]) * .0, sy, Math.atan2(sy - prev[1], sx - prev[0]), 8, o.color);
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 2 * Math.PI); ctx.fill();
      label(ctx, `${o.name}  τ ${o.tau.toFixed(1)}`, sx + 9, sy - 7, {bold: true, color: C.ink});
    }
  }
  // Signals: short arcs of light moving along radial lines.
  for (const p of lab.pulses) {
    if (p.r < .03) continue;
    const half = Math.min(.25, 7 / (p.r * k));
    ctx.strokeStyle = p.r < 1 ? C.paper2 : p.color; ctx.lineWidth = 2.6; ctx.globalAlpha = p.dir > 0 ? 1 : .6;
    ctx.beginPath(); ctx.arc(cx, cy, p.r * k, -p.phi - half, -p.phi + half); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Probes: a diamond on its radial line; drawn in paper colour once inside the horizon.
  for (const p of lab.probes) {
    const [x0, y0] = m.to(p.R * Math.cos(p.phi), p.R * Math.sin(p.phi)), [sx, sy] = m.to(p.r * Math.cos(p.phi), p.r * Math.sin(p.phi));
    ctx.strokeStyle = p.color; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
    if (p.done) continue;
    const inside = p.r < 1, col = inside ? C.paper2 : p.color;
    if (p.r > .05) arrowHead(ctx, sx - Math.cos(p.phi) * 9, sy + Math.sin(p.phi) * 9, Math.atan2(Math.sin(p.phi), -Math.cos(p.phi)), 6, col);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = col; ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.strokeStyle = inside ? C.paper2 : C.ink; ctx.lineWidth = 1; ctx.strokeRect(-4.5, -4.5, 9, 9);
    ctx.restore();
    label(ctx, `${p.name}  τ ${p.tau.toFixed(1)}${inside ? '  inside' : ''}`, sx + 9, sy + (Math.sin(p.phi) > 0 ? -8 : 16), {bold: true});
  }
  // Clocks: a dial whose hand turns clockwise at the clock's own rate.
  for (const c of lab.clocks) {
    const [sx, sy] = m.to(c.r * Math.cos(c.phi), c.r * Math.sin(c.phi)), R = k < 30 ? 9 : 11;
    if (c.beacon) {
      ctx.strokeStyle = c.color; ctx.lineWidth = 1.2;
      for (const s of [16, 20]) { ctx.beginPath(); ctx.arc(sx, sy, s, -.6, .6); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, sy, s, Math.PI - .6, Math.PI + .6); ctx.stroke(); }
    }
    ctx.fillStyle = C.paper2; ctx.strokeStyle = c.color; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.ink3; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(sx + Math.sin(a) * (R - 3.5), sy - Math.cos(a) * (R - 3.5)); ctx.lineTo(sx + Math.sin(a) * (R - 1.5), sy - Math.cos(a) * (R - 1.5)); ctx.stroke(); }
    const a = 2 * Math.PI * c.tau / DIAL_PERIOD;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(a) * (R - 3), sy - Math.cos(a) * (R - 3)); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, 2 * Math.PI); ctx.fill();
    const right = sx < w - 120;
    label(ctx, c.name, right ? sx + 15 : sx - 15, sy - 3, {bold: true, align: right ? 'left' : 'right'});
    label(ctx, `τ ${c.tau.toFixed(1)}  ×${gr.rate(c.r).toFixed(2)}`, right ? sx + 15 : sx - 15, sy + 10, {color: C.ink3, align: right ? 'left' : 'right'});
  }
  // Aiming a new ray.
  if (aim) {
    const len = Math.hypot(aim.x1 - aim.x0, aim.y1 - aim.y0);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(aim.x0, aim.y0, 3.5, 0, 2 * Math.PI); ctx.fill();
    if (len > 4) arrowPath(ctx, [[aim.x0, aim.y0], [aim.x1, aim.y1]], C.ink, {width: 1.4, dash: [4, 4], every: 1e9});
    label(ctx, 'let go to fire', aim.x1 + 8, aim.y1 - 8, {color: C.ink3});
  }
  if (hover?.fig === 'top') { ctx.strokeStyle = C.spot; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hover.sx, hover.sy, 16, 0, 2 * Math.PI); ctx.stroke(); }
}

// ---------------------------------------------------------------- shared r axis for figures 2 and 3
const PAD = {l: 40, r: 16};
const rx = (fig, r) => PAD.l + r / lab.viewR * (fig.w - PAD.l - PAD.r);
const xr = (fig, x) => (x - PAD.l) / (fig.w - PAD.l - PAD.r) * lab.viewR;
function rAxis(ctx, fig, y0, y1) {
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
  const step = lab.viewR > 12 ? 2 : 1;
  for (let r = 0; r <= lab.viewR + 1e-9; r += step) {
    const x = rx(fig, r);
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    label(ctx, `${r}`, x, y1 + 13, {color: C.ink3, align: 'center', bg: false, size: 9.5});
  }
  label(ctx, 'r (rₛ) →', fig.w - PAD.r, y1 + 13, {color: C.ink3, align: 'right', size: 9.5});
}
function hatch(ctx, x0, y0, x1, y1, color) {
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let x = x0 - (y1 - y0); x < x1; x += 7) { ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------- figure 2: clock rate
const rateY = (fig, v) => 10 + (1 - v) * (fig.h - 10 - 26);
function movingRate(o) {
  if (o.kind === 'probe') {
    if (o.done) return null;
    const ef = o.ef0 + lab.now - o.T0, a = o.fall.atEF(ef - .05), b = o.fall.atEF(ef + .05);
    return a && b ? (b.tau - a.tau) / (b.ef - a.ef) : null;
  }
  return o.gone ? null : rateAlong(o.points, 'ef', lab.now - o.T0);
}
function drawRate() {
  const fig = figs.rate, ctx = begin(fig), {h} = fig, y1 = h - 26;
  rAxis(ctx, fig, 6, y1);
  for (const v of [0, .25, .5, .75, 1]) {
    const y = rateY(fig, v);
    ctx.strokeStyle = C.rule; ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(fig.w - PAD.r, y); ctx.stroke();
    label(ctx, v.toFixed(2).replace(/0$/, ''), PAD.l - 5, y + 4, {color: C.ink3, align: 'right', bg: false, size: 9.5});
  }
  hatch(ctx, rx(fig, 0), 6, rx(fig, 1), y1, 'rgba(200,84,31,.3)');
  if (rx(fig, 1) - rx(fig, 0) > 84) {
    label(ctx, 'no clock can', rx(fig, .5), rateY(fig, .62), {color: C.spot, align: 'center', size: 9});
    label(ctx, 'stay still here', rx(fig, .5), rateY(fig, .62) + 11, {color: C.spot, align: 'center', size: 9});
  }
  ctx.setLineDash([3, 4]);
  for (const [r, col, t, y] of [[1.5, C.spot, 'photon sphere', rateY(fig, .97) + 4], [3, C.ink4, 'ISCO', y1 - 6]]) {
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(rx(fig, r), 6); ctx.lineTo(rx(fig, r), y1); ctx.stroke();
    label(ctx, t, rx(fig, r) + 4, y, {color: col, size: 9});
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = C.olive; ctx.lineWidth = 2.4; ctx.beginPath();
  for (let i = 0; i <= 400; i++) { const r = 1 + (lab.viewR - 1) * (i / 400) ** 2; const x = rx(fig, r), y = rateY(fig, gr.rate(r)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  label(ctx, 'rate = √(1 − 1/r)', fig.w - PAD.r - 4, rateY(fig, .42), {color: C.olive, bold: true, align: 'right'});
  // Moving bodies: their own rate against t̃ (falling clocks differ from clocks held still).
  for (const o of [...lab.probes, ...lab.orbits]) {
    const v = movingRate(o);
    if (v == null) continue;
    const x = rx(fig, o.r), y = rateY(fig, Math.min(1.05, Math.max(0, v)));
    ctx.strokeStyle = o.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.stroke();
    label(ctx, `${o.name} ${o.kind === 'probe' ? 'falling' : 'orbiting'} ×${v.toFixed(2)}`, x + 8, y - 6, {color: C.ink2});
  }
  for (const c of lab.clocks) {
    const x = rx(fig, c.r), y = rateY(fig, gr.rate(c.r));
    ctx.strokeStyle = c.color; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.color; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    const right = x < fig.w - 110;
    label(ctx, `${c.name} ×${gr.rate(c.r).toFixed(2)}`, right ? x + 10 : x - 10, y + 15, {bold: true, align: right ? 'left' : 'right'});
  }
}

// ---------------------------------------------------------------- figure 3: spacetime map (EF)
function diagMap() {
  const fig = figs.diag, top = 8, bottom = fig.h - 26;
  const efTop = lab.now + lab.span * .1, efBot = efTop - lab.span;
  return {top, bottom, efTop, efBot, y: ef => bottom - (ef - efBot) / lab.span * (bottom - top), ef: y => efBot + (bottom - y) / (bottom - top) * lab.span};
}
/** A future light cone at (r, t̃): its two edges are the paths of ingoing and outgoing light, each `size` px long. */
function drawCone(ctx, fig, d, r, ef, size, {fill = 'rgba(201,201,163,.5)', stroke = C.ink4, width = 1.2, arrows = true} = {}) {
  const pxR = (fig.w - PAD.l - PAD.r) / lab.viewR, pxT = (d.bottom - d.top) / lab.span;
  const [, out] = gr.coneSlopes(r);
  const ax = rx(fig, r), ay = d.y(ef);
  // Ingoing edge: dr = −dt̃. Outgoing edge: dr = dt̃ / slope (zero at the horizon, negative inside).
  const hIn = size / Math.hypot(pxR, pxT), dOut = Math.abs(r - 1) < 1e-6 ? 0 : 1 / out;
  const hOut = size / Math.hypot(dOut * pxR, pxT), h = Math.min(hIn, hOut);
  const inX = ax - h * pxR, outX = ax + h * dOut * pxR, topY = ay - h * pxT;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(inX, topY); ctx.lineTo(outX, topY); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(inX, topY); ctx.lineTo(ax, ay); ctx.lineTo(outX, topY); ctx.stroke();
  if (arrows) {
    arrowHead(ctx, inX, topY, Math.atan2(topY - ay, inX - ax), 2.6 + width, stroke);
    arrowHead(ctx, outX, topY, Math.atan2(topY - ay, outX - ax), 2.6 + width, stroke);
  }
  ctx.fillStyle = stroke; ctx.beginPath(); ctx.arc(ax, ay, 1.4 + width * .4, 0, 2 * Math.PI); ctx.fill();
  return {ax, ay, inX, outX, topY};
}
function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function drawDiag() {
  const fig = figs.diag, ctx = begin(fig), d = diagMap(), now = lab.now;
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, d.top, fig.w - PAD.l - PAD.r, d.bottom - d.top); ctx.clip();
  ctx.fillStyle = 'rgba(233,185,154,.28)'; ctx.fillRect(PAD.l, d.top, rx(fig, 1) - PAD.l, d.bottom - d.top);
  // Time grid.
  const tStep = niceStep(lab.span / 6);
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
  for (let ef = Math.ceil(d.efBot / tStep) * tStep; ef <= d.efTop; ef += tStep) { const y = d.y(ef); ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(fig.w, y); ctx.stroke(); }
  // Light cones, fixed in spacetime (they slide down the page as time passes).
  const pxR = (fig.w - PAD.l - PAD.r) / lab.viewR, rowEF = niceStep(64 / ((d.bottom - d.top) / lab.span));
  const cols = [.3, .65, 1];
  const cStep = Math.max(.5, niceStep(64 / pxR));
  for (let r = 1.5; r < lab.viewR; r += cStep) cols.push(r);
  for (let ef = Math.floor(d.efBot / rowEF) * rowEF; ef <= d.efTop; ef += rowEF) {
    for (const [i, r] of cols.entries()) drawCone(ctx, fig, d, r, ef + (i % 2) * rowEF / 2, 19);
  }
  ctx.restore();
  // Horizon, singularity, photon sphere.
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(rx(fig, 1), d.top); ctx.lineTo(rx(fig, 1), d.bottom); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath();
  for (let y = d.top, i = 0; y <= d.bottom; y += 5, i++) { const x = rx(fig, 0) + (i % 2 ? 3 : 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
  ctx.strokeStyle = C.spot; ctx.beginPath(); ctx.moveTo(rx(fig, 1.5), d.top); ctx.lineTo(rx(fig, 1.5), d.bottom); ctx.stroke();
  ctx.setLineDash([]);
  rAxis(ctx, fig, d.bottom, d.bottom);
  for (let ef = Math.ceil(d.efBot / tStep) * tStep; ef <= d.efTop; ef += tStep) label(ctx, `${+ef.toFixed(1)}`, PAD.l - 5, d.y(ef) + 4, {color: C.ink3, align: 'right', bg: false, size: 9.5});
  label(ctx, 't̃ ↑', PAD.l - 5, d.top + 10, {color: C.ink3, align: 'right', bg: false, size: 9.5});

  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l - 2, d.top, fig.w - PAD.l - PAD.r + 4, d.bottom - d.top); ctx.clip();
  const pt = (r, ef) => [rx(fig, r), d.y(ef)];
  // Signals along radial light rays.
  for (const p of lab.pulses) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const ef = p.efe + (now - p.efe) * i / 20;
      pts.push(pt(pulseRadius(p, ef), ef));
    }
    arrowPath(ctx, pts, p.color, {width: 1, every: 1e9, head: false, alpha: .7});
  }
  // Light rays (r against t̃).
  for (const ray of lab.rays) {
    if (ray.quiet && lab.rays.length > 8) { /* the fan in "Light rays": draw thinly */ }
    const local = now - ray.T0, n = headIndex(ray.points, 'ef', local), pts = [];
    if (ray.T0 + ray.points.at(-1).ef < d.efBot) continue;
    for (let i = 0; i <= n; i += 4) pts.push(pt(ray.points[i].r, ray.T0 + ray.points[i].ef));
    const tip = atKey(ray.points, 'ef', local); pts.push(pt(tip.r, ray.T0 + tip.ef));
    arrowPath(ctx, pts, ray.color, {width: 1, every: 1e9, head: local < ray.points.at(-1).ef, alpha: .75});
  }
  // Worldlines.
  for (const c of lab.clocks) {
    const pts = c.history.filter(s => s.ef >= d.efBot - 1).map(s => pt(s.r, s.ef));
    pts.push(pt(c.r, now));
    arrowPath(ctx, pts, c.color, {width: 2.2, every: 1e9, head: false});
    ctx.fillStyle = C.paper2; ctx.strokeStyle = c.color; ctx.lineWidth = 1.5;
    for (const t of c.ticks) if (t.ef > d.efBot) { const [x, y] = pt(t.r, t.ef); ctx.beginPath(); ctx.arc(x, y, 2.8, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
  }
  for (const p of lab.probes) {
    const end = p.done ? Infinity : p.ef0 + now - p.T0, pts = [];
    for (const s of p.fall.samples) { if (s.ef > end) break; pts.push(pt(s.r, p.T0 + s.ef - p.ef0)); }
    if (!p.done) pts.push(pt(p.r, now));
    arrowPath(ctx, pts, p.color, {width: 2.2, every: 1e9, head: false});
    ctx.fillStyle = C.paper2; ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
    for (const t of p.ticks) { const [x, y] = pt(t.r, t.ef); ctx.beginPath(); ctx.arc(x, y, 2.8, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    if (p.crossed != null) {
      const ef = p.T0 + p.fall.efHorizon - p.ef0, [x, y] = pt(1, ef);
      ctx.fillStyle = C.spot; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
      label(ctx, `${p.name} crosses at τ ${p.crossed.toFixed(1)}`, x + 8, y + 4, {color: C.spot, bold: true});
    }
  }
  for (const o of lab.orbits) {
    const local = now - o.T0, n = headIndex(o.points, 'ef', local), pts = [];
    for (let i = 0; i <= n; i += 3) { const q = o.points[i]; if (o.T0 + q.ef >= d.efBot - 2) pts.push(pt(q.r, o.T0 + q.ef)); }
    if (!o.gone) pts.push(pt(o.r, now));
    arrowPath(ctx, pts, o.color, {width: 1.8, every: 1e9, head: false});
  }
  // Now.
  const yNow = d.y(now);
  ctx.strokeStyle = C.spot; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yNow); ctx.lineTo(fig.w - PAD.r, yNow); ctx.stroke(); ctx.setLineDash([]);
  for (const o of [...lab.clocks, ...lab.probes.filter(p => !p.done), ...lab.orbits.filter(o => !o.gone)]) {
    const [x, y] = pt(o.r, now);
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 2 * Math.PI); ctx.fill();
    label(ctx, o.name, x + 6, y - 6, {bold: true, size: 10});
  }
  ctx.restore();
  label(ctx, 'now', fig.w - PAD.r - 2, yNow - 5, {color: C.spot, align: 'right', bold: true});
  label(ctx, 'horizon', rx(fig, 1) + 5, d.bottom - 6, {bold: true});
  label(ctx, 'inside', PAD.l + 3, d.top + 12, {color: C.spot, size: 9.5});
  const squeeze = lab.span * pxR / (d.bottom - d.top);
  label(ctx, squeeze > 1.15 ? `time squeezed ×${squeeze.toFixed(1)} · scroll to change` : 'time 1:1 · light far away at 45°', fig.w - PAD.r - 2, d.top + 12, {color: C.ink3, align: 'right', size: 9.5});
  if (hover?.fig === 'diag' && hover.cone) {
    const c = drawCone(ctx, fig, d, hover.cone.r, hover.cone.ef, 52, {fill: 'rgba(200,84,31,.22)', stroke: C.spot, width: 1.8});
    const inside = hover.cone.r < 1;
    label(ctx, inside ? 'both edges lean in' : 'future light cone', c.ax + 8, c.ay + 14, {color: C.spot, bold: true});
  }
}

function drawAll() { if (figs.top.dpr && figs.rate.dpr && figs.diag.dpr) { drawTop(); drawRate(); drawDiag(); } }

// ---------------------------------------------------------------- notebook column
function renderScenario() {
  const s = lab.scenario;
  $('chips').innerHTML = scenarios.map((x, i) => `<button class="chip${x === s ? ' on' : ''}" data-id="${x.id}"><i>${i + 1}</i>${x.label}</button>`).join('');
  $('scenario').innerHTML = `<h1>${s.title}</h1>${s.text}<div class="formula">${s.formula}<small>${s.note}</small></div>
    <p class="eyebrow">Try</p><ul class="try">${s.tries.map(t => `<li>${t}</li>`).join('')}</ul>`;
}
function renderInstruments() {
  const rows = [];
  for (const c of lab.clocks) rows.push(`<li><span class="dot" style="--c:${c.color}"></span><span><b>${c.name}</b> held still<small>r ${formatLength(c.r)} · runs ×${gr.rate(c.r).toFixed(3)}</small></span><strong>${formatTime(c.tau)}</strong></li>`);
  for (const p of lab.probes) rows.push(`<li><span class="dot ring" style="--c:${p.color}"></span><span><b>${p.name}</b> ${p.done ? 'reached r = 0' : p.r < 1 ? 'inside the horizon' : 'falling'}<small>from ${formatLength(p.R)} · now r ${formatLength(p.r)}</small></span><strong>${formatTime(p.tau)}</strong></li>`);
  for (const o of lab.orbits) rows.push(`<li><span class="dot ring" style="--c:${o.color}"></span><span><b>${o.name}</b> ${o.gone ? (o.outcome === 'plunges' ? 'fell in' : 'escaped') : 'in orbit'}<small>launched at ${formatLength(o.r0)} · now ${formatLength(o.r)}</small></span><strong>${formatTime(o.tau)}</strong></li>`);
  $('instruments').innerHTML = rows.join('') || '<li class="empty">Nothing on the bench yet. Pick a tool and click in figure 1.</li>';
  $('insight').innerHTML = lab.scenario.insight(lab);
  $('now').textContent = `t = ${formatTime(lab.now)}`;
  $('scale-note').textContent = SCALES[lab.scale].note + ' Each τ is a body’s own elapsed time.';
}
function loadScenario(s) {
  lab.scenario = s; lab.clear(); lab.now = 0; lab.viewR = s.viewR; lab.span = s.span;
  setSpeed(s.speed ?? 2);
  s.setup(lab);
  renderScenario(); renderInstruments(); drawAll();
}

// ---------------------------------------------------------------- interaction
function setTool(tool) {
  lab.tool = tool;
  for (const b of document.querySelectorAll('[data-tool]')) { b.classList.toggle('on', b.dataset.tool === tool); b.setAttribute('aria-pressed', String(b.dataset.tool === tool)); }
  $('tool-hint').textContent = HINTS[tool];
  $('push-row').hidden = tool !== 'orbit';
  figs.top.canvas.classList.toggle('move', tool === 'move' || tool === 'beacon');
}
function local(event, canvas) { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; }
function nearestTop(sx, sy, kinds = ['clock', 'probe', 'orbit', 'ray']) {
  const m = topMap();
  let best = null, bestD = 18;
  const consider = (o, x, y) => { const [px, py] = m.to(x, y), dd = Math.hypot(px - sx, py - sy); if (dd < bestD) { bestD = dd; best = {o, sx: px, sy: py}; } };
  if (kinds.includes('clock')) for (const c of lab.clocks) consider(c, c.r * Math.cos(c.phi), c.r * Math.sin(c.phi));
  if (kinds.includes('probe')) for (const p of lab.probes) if (!p.done) consider(p, p.r * Math.cos(p.phi), p.r * Math.sin(p.phi));
  if (kinds.includes('orbit')) for (const o of lab.orbits) if (!o.gone) consider(o, o.x, o.y);
  if (kinds.includes('ray')) for (const ray of lab.rays) { const q = atKey(ray.points, 'ef', lab.now - ray.T0); consider(ray, q.x, q.y); }
  return best;
}
function describe(o) {
  if (o.kind === 'clock') return `<b>Clock ${o.name}</b>held still at r = ${formatLength(o.r)}<br>ticks at ${gr.rate(o.r).toFixed(3)} × a far clock<br>own time τ = ${formatTime(o.tau)}${o.beacon ? '<br>sending signals' : ''}`;
  if (o.kind === 'probe') return `<b>Probe ${o.name}</b>${o.r < 1 ? 'inside the horizon: it can only go inwards' : 'falling freely'}<br>r = ${formatLength(o.r)}, dropped from ${formatLength(o.R)}<br>own time τ = ${formatTime(o.tau)}<br>reaches the horizon at τ = ${formatTime(o.fall.tauHorizon)}`;
  if (o.kind === 'orbit') return `<b>Body ${o.name}</b>${o.outcome === 'bound' ? 'bound orbit' : o.outcome === 'plunges' ? 'will fall in' : 'will escape'}<br>r = ${formatLength(o.r)}<br>own time τ = ${formatTime(o.tau)}`;
  const r = Math.hypot(...(() => { const q = atKey(o.points, 'ef', lab.now - o.T0); return [q.x, q.y]; })());
  return `<b>Light</b>${o.outcome === 'captured' ? 'falls into the hole' : 'escapes'}<br>now at r = ${formatLength(r)}<br>angular momentum L = ${Math.abs(o.L).toFixed(2)} (captured below 2.60)`;
}
function showTip(event, html) {
  const tip = $('tip');
  if (!html) { tip.classList.remove('visible'); return; }
  tip.innerHTML = html; tip.classList.add('visible');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(innerWidth - w - 10, event.clientX + 16)}px, ${Math.max(10, Math.min(innerHeight - h - 10, event.clientY - h - 10))}px)`;
}

const top = figs.top.canvas;
top.addEventListener('pointerdown', event => {
  const [sx, sy] = local(event, top), m = topMap(), [x, y] = m.from(sx, sy), r = Math.hypot(x, y), phi = Math.atan2(y, x);
  top.setPointerCapture(event.pointerId);
  const tool = lab.tool, hint = $('tool-hint');
  if (tool === 'move') {
    const hit = nearestTop(sx, sy, ['clock']);
    if (hit) { dragging = {fig: 'top', o: hit.o}; top.classList.add('grab'); }
  } else if (tool === 'clock') {
    lab.addClock(r, phi);
    hint.textContent = r < 1.05 ? 'Nothing can be held still at or inside the horizon, so the clock was placed just outside, at 1.05 rₛ.' : HINTS.clock;
  } else if (tool === 'probe') {
    if (r <= 1.05) { hint.textContent = 'Drop probes from outside the horizon: nothing can rest inside it.'; return; }
    lab.dropProbe(r, phi);
  } else if (tool === 'orbit') {
    const r0 = Math.max(1.6, r), L = gr.circularL(r0) * lab.push;
    lab.addOrbit(r0, phi, L);
    hint.textContent = r0 < 3 ? 'Inside 3 rₛ even a circular orbit is unstable: the slightest nudge sends it in or out.' : HINTS.orbit;
  } else if (tool === 'ray') {
    if (r <= 1.02) { hint.textContent = 'Light starting inside the horizon cannot get out. Start the ray outside the black disc.'; return; }
    aim = {x0: sx, y0: sy, x1: sx, y1: sy};
  } else if (tool === 'beacon') {
    const hit = nearestTop(sx, sy, ['clock', 'probe', 'orbit']);
    if (hit) { hit.o.beacon = !hit.o.beacon; hint.textContent = `${hit.o.name}: signals ${hit.o.beacon ? 'on' : 'off'}. ${HINTS.beacon}`; }
  }
  renderInstruments(); drawAll();
});
top.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, top), m = topMap();
  if (dragging?.fig === 'top') {
    const [x, y] = m.from(sx, sy);
    dragging.o.r = Math.min(lab.viewR * 1.4, Math.max(1.05, Math.hypot(x, y))); dragging.o.phi = Math.atan2(y, x);
    showTip(event, describe(dragging.o)); drawAll(); return;
  }
  if (aim) { aim.x1 = sx; aim.y1 = sy; drawAll(); return; }
  const hit = nearestTop(sx, sy);
  hover = hit ? {fig: 'top', ...hit} : null;
  showTip(event, hit && describe(hit.o));
  if (!lab.playing) drawAll();
});
const endTop = event => {
  if (aim) {
    const m = topMap(), [x, y] = m.from(aim.x0, aim.y0);
    let dx = aim.x1 - aim.x0, dy = -(aim.y1 - aim.y0);
    if (Math.hypot(dx, dy) < 6) { const phi = Math.atan2(y, x); dx = -Math.sin(phi); dy = Math.cos(phi); }
    lab.addRay(x, y, dx, dy);
    aim = null;
  }
  dragging = null; top.classList.remove('grab');
  drawAll();
};
top.addEventListener('pointerup', endTop);
top.addEventListener('pointercancel', endTop);
top.addEventListener('pointerleave', () => { hover = null; showTip(null); });
const zoom = f => { lab.viewR = Math.min(18, Math.max(2.5, lab.viewR * f)); drawAll(); };
top.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.1 : 1 / 1.1); }, {passive: false});
$('zoom-in').onclick = () => zoom(1 / 1.25);
$('zoom-out').onclick = () => zoom(1.25);

const rateCanvas = figs.rate.canvas;
rateCanvas.addEventListener('pointerdown', event => {
  const [sx, sy] = local(event, rateCanvas), fig = figs.rate;
  let best = null, bestD = 20;
  for (const c of lab.clocks) { const d = Math.hypot(rx(fig, c.r) - sx, rateY(fig, gr.rate(c.r)) - sy); if (d < bestD) { bestD = d; best = c; } }
  if (!best) return;
  dragging = {fig: 'rate', o: best}; rateCanvas.setPointerCapture(event.pointerId); event.preventDefault();
});
rateCanvas.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, rateCanvas), fig = figs.rate;
  if (dragging?.fig === 'rate') { dragging.o.r = Math.min(lab.viewR, Math.max(1.05, xr(fig, sx))); showTip(event, describe(dragging.o)); drawAll(); return; }
  const r = xr(fig, sx);
  if (r < 0 || r > lab.viewR) { showTip(null); return; }
  showTip(event, r < 1 ? '<b>Inside the horizon</b>Even light is carried inwards here, so no clock can be held still.' :
    `<b>A clock held at r = ${formatLength(r)}</b>would tick at ${gr.rate(r).toFixed(3)} × a far clock: one second for it is ${(1 / gr.rate(r)).toFixed(2)} s far away.`);
});
rateCanvas.addEventListener('pointerup', () => { dragging = null; });
rateCanvas.addEventListener('pointerleave', () => showTip(null));

const diagCanvas = figs.diag.canvas;
diagCanvas.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, diagCanvas), fig = figs.diag, d = diagMap(), r = xr(fig, sx), ef = d.ef(sy);
  if (r < 0.05 || r > lab.viewR || sy < d.top || sy > d.bottom) { hover = null; showTip(null); return; }
  hover = {fig: 'diag', cone: {r, ef}};
  const [, out] = gr.coneSlopes(r);
  showTip(event, r < 1 ? `<b>r = ${r.toFixed(2)}, inside</b>Both edges of the light cone point to smaller r: even light moving “outwards” falls in. The future is r = 0.` :
    `<b>r = ${r.toFixed(2)}, t̃ = ${ef.toFixed(1)}</b>Ingoing light moves 1 rₛ per rₛ/c here; outgoing light only ${(1 / out).toFixed(2)}. ${r < 1.3 ? 'Near the horizon the outgoing edge stands almost upright.' : ''}`);
  if (!lab.playing) drawAll();
});
diagCanvas.addEventListener('pointerleave', () => { hover = null; showTip(null); });
diagCanvas.addEventListener('wheel', event => { event.preventDefault(); lab.span = Math.min(400, Math.max(4, lab.span * (event.deltaY > 0 ? 1.12 : 1 / 1.12))); drawAll(); }, {passive: false});

$('tools').addEventListener('click', event => { const b = event.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
$('chips').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) loadScenario(scenarios.find(s => s.id === b.dataset.id)); });
$('push').oninput = event => { lab.push = +event.target.value; $('out-push').textContent = `${lab.push.toFixed(2)} × circular`; };
$('clear').onclick = () => { lab.clear(); lab.now = 0; renderInstruments(); drawAll(); };
$('restart').onclick = () => loadScenario(lab.scenario);
function setSpeed(v) {
  lab.speed = v;
  for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', +x.dataset.speed === v);
}
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => setSpeed(+b.dataset.speed);
for (const b of document.querySelectorAll('[data-scale]')) b.onclick = () => {
  lab.scale = b.dataset.scale;
  for (const x of document.querySelectorAll('[data-scale]')) x.classList.toggle('on', x === b);
  renderInstruments();
};
const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';
function setPlaying(on) { lab.playing = on; $('play').innerHTML = on ? ICON_PAUSE : ICON_PLAY; $('play').setAttribute('aria-label', on ? 'Pause' : 'Play'); }
$('play').onclick = () => setPlaying(!lab.playing);

const notes = $('notes');
$('about').onclick = () => notes.showModal();
notes.querySelector('.close').onclick = () => notes.close();
notes.addEventListener('click', event => { if (event.target === notes) notes.close(); });

addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open]')) return;
  if (event.key === ' ') { event.preventDefault(); setPlaying(!lab.playing); }
  else if (event.key === 'r' || event.key === 'R') loadScenario(lab.scenario);
  else if (/^[1-6]$/.test(event.key)) loadScenario(scenarios[+event.key - 1]);
});

// ---------------------------------------------------------------- loop
let last = performance.now(), lastPanel = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (lab.playing) advance(dt * lab.speed * (reducedMotion ? .5 : 1));
  drawAll();
  if (t - lastPanel > 200) { lastPanel = t; renderInstruments(); }
  requestAnimationFrame(frame);
}
setTool('move');
setPlaying(true);
loadScenario(scenarios[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__gr = {
    lab, scenarios,
    load: id => loadScenario(scenarios.find(s => s.id === id)),
    run: seconds => { advance(seconds); renderInstruments(); drawAll(); return lab.now; },
    snap: () => ({now: lab.now, clocks: lab.clocks.map(c => ({name: c.name, r: c.r, tau: c.tau, received: c.received.length})),
      probes: lab.probes.map(p => ({name: p.name, r: p.r, tau: p.tau, crossed: p.crossed, done: p.done, sent: p.sent})),
      orbits: lab.orbits.map(o => ({name: o.name, r: o.r, outcome: o.outcome, gone: o.gone, periapses: o.periapses.length})),
      rays: lab.rays.map(r => r.outcome), pulses: lab.pulses.length, insight: $('insight').textContent}),
  };
}
