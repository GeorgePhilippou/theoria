// Rays and lenses: the drafting bench. Parts and light sources on a 2D bench, every ray traced exactly
// (physics.js), drawn as a technical drawing with a specification sheet and a log of each surface the light meets.
import * as op from './physics.js';
import {plates} from './scenarios.js';

const $ = id => document.getElementById(id);
const C = {ink: '#2f3614', ink2: '#454d22', ink3: '#6a6f45', ink4: '#8a8c68', olive: '#56612a', oliveDark: '#3b4419', spot: '#c8541f',
  tint: '#c9c9a3', paper: '#ece4d2', paper2: '#f4eee0', mat: '#dfe0c6'};
const RAY = '#3b4419';                                     // single-colour light, printed in dark ink
const WHITE_NM = [405, 445, 490, 530, 575, 615, 660];
const GLASS = {crown: {n: 1.52, disp: 1, label: 'Crown'}, flint: {n: 1.62, disp: 2.6, label: 'Flint'}, water: {n: 1.33, disp: 1.1, label: 'Water'}, diamond: {n: 2.42, disp: 5, label: 'Diamond'}};
const KINDS = {
  block: {name: 'Block', tag: 'B', glass: true, size: [4, 20, 10]},
  prism: {name: 'Prism', tag: 'P', glass: true, size: [6, 20, 13]},
  convex: {name: 'Convex lens', tag: 'L', glass: true, size: [6, 30, 10], label: 'Radius of curvature'},
  concave: {name: 'Concave lens', tag: 'L', glass: true, size: [6, 30, 10], label: 'Radius of curvature'},
  halfdisc: {name: 'Half disc', tag: 'H', glass: true, size: [4, 14, 9], label: 'Radius'},
  fibre: {name: 'Fibre', tag: 'F', glass: true, size: [10, 56, 40], label: 'Length'},
  mirror: {name: 'Mirror', tag: 'M', size: [4, 30, 10], label: 'Length'},
  cmirror: {name: 'Curved mirror', tag: 'C', size: [10, 60, 24], label: 'Radius of curvature'},
  screen: {name: 'Screen', tag: 'S', size: [6, 34, 20], label: 'Length'},
};
const BENCH = {w: 64, h: 36};
const deg = x => x * Math.PI / 180, rad = x => x * 180 / Math.PI, f1 = x => x.toFixed(1);

// ---------------------------------------------------------------- the bench
const lab = {
  plate: null, parts: [], sources: [], selected: null, show: {angles: true, reflect: false, pulses: true}, time: 0, counter: {},
  addPart(kind, x, y, angle = 0, {size, glass = 'crown', n} = {}) {
    const k = KINDS[kind], g = GLASS[glass];
    const p = {type: 'part', kind, x, y, angle, size: size ?? k.size[2], glass, n: n ?? g.n, disp: g.disp};
    this.counter[k.tag] = (this.counter[k.tag] ?? 0) + 1;
    p.label = `${k.tag}${this.counter[k.tag]}`;
    p.focus = () => focusOf(p);
    build(p); this.parts.push(p); return p;
  },
  addSource(kind, x, y, angle = 0, {white = false, count, width = 6, spread = 20} = {}) {
    this.counter[kind] = (this.counter[kind] ?? 0) + 1;
    const s = {type: 'source', kind, x, y, angle, white, count: count ?? (kind === 'laser' ? 1 : kind === 'beam' ? 7 : 9), width, spread,
      label: `${kind[0].toUpperCase() + kind.slice(1)} ${this.counter[kind]}`};
    this.sources.push(s); return s;
  },
  /** The surfaces met by the central ray of the selected (or first) source. */
  log() { return logSource()?.central?.segments.events; },
  /** Least-squares meeting point of the outgoing rays of the first source (extended both ways). */
  meet() {
    const s = this.sources[0];
    if (!s?.rays) return null;
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    const lines = [];
    for (const r of s.rays) {
      const main = r.segments.filter(g => g.depth === 0);
      if (main.length < 2) continue;
      const g = main.at(-1), d = [g.b[0] - g.a[0], g.b[1] - g.a[1]], len = Math.hypot(...d);
      if (len < 1e-6) continue;
      const u = [d[0] / len, d[1] / len], m11 = 1 - u[0] * u[0], m12 = -u[0] * u[1], m22 = 1 - u[1] * u[1];
      a11 += m11; a12 += m12; a22 += m22; b1 += m11 * g.a[0] + m12 * g.a[1]; b2 += m12 * g.a[0] + m22 * g.a[1];
      lines.push([g.a, u]);
    }
    const det = a11 * a22 - a12 * a12;
    if (lines.length < 2 || Math.abs(det) < 1e-9) return null;
    const x = (a22 * b1 - a12 * b2) / det, y = (a11 * b2 - a12 * b1) / det;
    const spread = Math.sqrt(lines.reduce((sum, [p, u]) => { const dx = x - p[0], dy = y - p[1], t = dx * u[0] + dy * u[1]; return sum + (dx - t * u[0]) ** 2 + (dy - t * u[1]) ** 2; }, 0) / lines.length);
    return {x, y, spread};
  },
  screenSpread() {
    const s = this.sources.find(x => x.white);
    if (!s?.rays) return null;
    const hits = s.rays.map(r => ({nm: r.nm, ev: r.segments.events.find(e => e.kind === 'stop')})).filter(h => h.ev);
    const v = hits.find(h => h.nm === WHITE_NM[0]), red = hits.find(h => h.nm === WHITE_NM.at(-1));
    if (!v || !red) return null;
    return {width: Math.hypot(v.ev.at[0] - red.ev.at[0], v.ev.at[1] - red.ev.at[1]), violetBelow: v.ev.at[1] < red.ev.at[1]};
  },
};

function local(p) {
  const o = {nd: p.n, dispersion: p.disp}, s = p.size;
  switch (p.kind) {
    case 'block': return op.slab(-s * .3, s * .3, -s / 2, s / 2, o);
    case 'prism': { const h = s * Math.cos(deg(30)); return op.prism(0, -h / 3, s, 60, o); }
    case 'convex': { const h = Math.min(5, s * .9), t = 2 * (s - Math.sqrt(s * s - h * h)) + .4; return op.lens(0, t, h, s, -s, o); }
    case 'concave': return op.lens(0, 1, Math.min(5, s * .9), -s, s, o);
    case 'halfdisc': return op.semicircle(0, 0, s, o);
    case 'fibre': return op.slab(-s / 2, s / 2, -.75, .75, o);
    case 'mirror': return op.flatMirror(s);
    case 'cmirror': return op.curvedMirror(s, Math.min(7, s * .45));
    case 'screen': return op.screen(s);
  }
}
function build(p) { p.el = op.place(local(p), p.x, p.y, deg(p.angle)); p.el.part = p; }
function focusOf(p) {
  if (p.kind === 'cmirror') return {f: p.size / 2};
  const L = p.el;
  return op.lensFocus(p.n, L.R1, L.R2, L.t);
}

function raysOf(s) {
  const d = [Math.cos(deg(s.angle)), Math.sin(deg(s.angle))], perp = [-d[1], d[0]], list = [];
  const n = s.kind === 'laser' ? 1 : Math.max(2, s.count);
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0 : k / (n - 1) - .5;
    let start = [s.x, s.y], dir = d;
    if (s.kind === 'beam') start = [s.x + perp[0] * u * s.width, s.y + perp[1] * u * s.width];
    if (s.kind === 'lamp') { const a = deg(s.angle + u * s.spread); dir = [Math.cos(a), Math.sin(a)]; }
    for (const nm of s.white ? WHITE_NM : [587.6]) list.push({start, dir, nm, central: Math.abs(u) < 1e-9 || (n % 2 === 0 && k === n / 2), k});
  }
  return list;
}
function traceAll() {
  const elements = lab.parts.map(p => p.el);
  for (const s of lab.sources) {
    s.rays = raysOf(s).map(r => ({...r, segments: op.trace(r.start, r.dir, elements, {nm: r.nm, maxLength: 140, maxEvents: 90, reflections: lab.show.reflect, minWeight: .02})}));
    for (const r of s.rays) r.length = Math.max(0, ...r.segments.filter(g => g.depth === 0).map(g => g.t1));
    s.central = s.rays.find(r => r.central && (!s.white || r.nm === 575)) ?? s.rays[0];
  }
}
const logSource = () => (lab.selected?.type === 'source' ? lab.selected : null) ?? lab.sources[0];

// ---------------------------------------------------------------- drawing
const canvas = $('c-bench'), ctx = canvas.getContext('2d');
let W = 1, H = 1, dpr = 1;
new ResizeObserver(() => {
  const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); draw();
}).observe(canvas);
const k = () => Math.min(W / BENCH.w, H / BENCH.h);
const S = (x, y) => [W / 2 + x * k(), H / 2 - y * k()];
const Wd = (sx, sy) => [(sx - W / 2) / k(), (H / 2 - sy) / k()];
function wavelengthColor(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else r = 1;
  // Deepened a little so the colours read on paper.
  return `rgb(${[r, g, b].map(v => Math.round(210 * v ** .8 + 10)).join(',')})`;
}
function letter(s, x, y, {color = C.ink, align = 'left', size = 10, bg = 'rgba(223,224,198,.9)'} = {}) {
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
function drawGrid() {
  ctx.fillStyle = C.mat; ctx.fillRect(0, 0, W, H);
  const [x0] = Wd(0, 0), [x1] = Wd(W, 0), [, y1] = Wd(0, 0), [, y0] = Wd(0, H);
  for (let x = Math.ceil(x0); x <= x1; x++) {
    const [sx] = S(x, 0); ctx.strokeStyle = x % 5 ? 'rgba(86,97,42,.1)' : 'rgba(86,97,42,.24)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    ctx.strokeStyle = C.ink2; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, x % 5 ? 4 : 9); ctx.stroke();
    if (x % 10 === 0) letter(`${x}`, sx + 3, 17, {size: 9, color: C.ink3, bg: null});
  }
  for (let y = Math.ceil(y0); y <= y1; y++) {
    const [, sy] = S(0, y); ctx.strokeStyle = y % 5 ? 'rgba(86,97,42,.1)' : 'rgba(86,97,42,.24)';
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    ctx.strokeStyle = C.ink2; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(y % 5 ? 4 : 9, sy); ctx.stroke();
    if (y % 10 === 0 && y) letter(`${y}`, 12, sy + 4, {size: 9, color: C.ink3, bg: null});
  }
  // The optical axis.
  ctx.strokeStyle = 'rgba(47,54,20,.35)'; ctx.setLineDash([14, 4, 2, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
}
function drawTitleBlock() {
  if (W < 520) return;      // no room on a phone; the sheet below says the same
  const w = Math.min(250, W * .4), h = 50, x = W - w - 8, y = H - h - 8;
  ctx.fillStyle = C.paper2; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.lineTo(x + w, y + 17); ctx.moveTo(x, y + 34); ctx.lineTo(x + w, y + 34); ctx.stroke();
  const i = plates.indexOf(lab.plate) + 1;
  letter('THEORIA · RAYS AND LENSES', x + 6, y + 13, {size: 9, bg: null});
  letter(`PLATE ${String(i).padStart(2, '0')} · ${lab.plate.label.toUpperCase()}`, x + 6, y + 30, {size: 9, bg: null, color: C.spot});
  letter('1 SQUARE = 1 cm', x + 6, y + 46, {size: 9, bg: null, color: C.ink3});
}
function outlinePath(el) { ctx.beginPath(); el.outline.forEach(([x, y], i) => { const [sx, sy] = S(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); }
function drawPart(p) {
  const el = p.el;
  if (KINDS[p.kind].glass) {
    outlinePath(el); ctx.closePath();
    ctx.fillStyle = 'rgba(244,238,224,.62)'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(86,97,42,.28)'; ctx.lineWidth = 1;
    // Denser hatching for denser glass, as in technical drawings.
    const step = Math.max(3, 14 - 4.5 * p.n);
    for (let x = -H; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
    ctx.restore();
    outlinePath(el); ctx.closePath(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.stroke();
  } else {
    outlinePath(el);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3.2; ctx.setLineDash(p.kind === 'screen' ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    if (p.kind !== 'screen') {
      // Hatching on the back of the mirror.
      const a = deg(p.angle), back = [Math.cos(a), Math.sin(a)], pts = p.kind === 'mirror'
        ? Array.from({length: Math.round(p.size) + 1}, (_, i) => { const t = i / Math.round(p.size) - .5; return [p.x - Math.sin(a) * t * p.size, p.y + Math.cos(a) * t * p.size]; })
        : el.outline.filter((_, i) => i % 3 === 0);
      ctx.lineWidth = 1;
      for (const [x, y] of pts) {
        const [sx, sy] = S(x, y), [tx, ty] = S(x + back[0] * .6 + back[1] * .3, y + back[1] * .6 - back[0] * .3);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
      }
    }
  }
  const ys = el.outline.map(q => q[1]), xs = el.outline.map(q => q[0]);
  const [lx, ly] = S((Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys));
  letter(p.label, lx, ly + 15, {align: 'center', size: 10, color: lab.selected === p ? C.spot : C.ink});
}
function partRadius(p) { return Math.max(...p.el.outline.map(([x, y]) => Math.hypot(x - p.x, y - p.y))); }
function handleOf(o) {
  if (o.type === 'source') { const a = deg(o.angle); return [o.x + Math.cos(a) * 3.2, o.y + Math.sin(a) * 3.2]; }
  const a = deg(o.angle + 90), r = partRadius(o) + 1.6;
  return [o.x + Math.cos(a) * r, o.y + Math.sin(a) * r];
}
function drawSource(s) {
  const a = deg(s.angle), [sx, sy] = S(s.x, s.y), sel = lab.selected === s;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(-a);
  ctx.fillStyle = C.ink;
  if (s.kind === 'laser') { ctx.fillRect(-26, -6, 26, 12); ctx.fillStyle = s.white ? C.paper2 : C.spot; ctx.fillRect(-4, -2, 4, 4); }
  else if (s.kind === 'beam') { const h = s.width * k() / 2 + 6; ctx.fillRect(-10, -h, 10, 2 * h); }
  else { ctx.beginPath(); ctx.arc(0, 0, 8, 0, 2 * Math.PI); ctx.fill(); ctx.fillStyle = s.white ? C.paper2 : C.spot; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 2 * Math.PI); ctx.fill(); }
  ctx.restore();
  if (sel) { ctx.strokeStyle = C.spot; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(sx, sy, 18, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
  const [hx, hy] = S(...handleOf(s));
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = C.paper2; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  arrowHead(hx + Math.cos(a) * 9, hy - Math.sin(a) * 9, -a, 5, C.ink);
  letter(s.label.toUpperCase(), sx, sy + 26, {align: 'center', size: 9.5, color: sel ? C.spot : C.ink});
}
function drawRays() {
  for (const s of lab.sources) for (const r of s.rays) {
    const col = s.white ? wavelengthColor(r.nm) : RAY;
    let first = true;
    for (const g of r.segments) {
      const main = g.depth === 0;
      // White light is a single ray until it first meets a surface: print that stretch once, in ink.
      if (s.white && main && first) {
        first = false;
        if (r.nm !== WHITE_NM[3]) continue;
      }
      const c = s.white && main && g === r.segments[0] ? C.ink : col;
      const [ax, ay] = S(...g.a), [bx, by] = S(...g.b);
      ctx.strokeStyle = c; ctx.globalAlpha = main ? (s.white ? .9 : 1) : Math.max(.15, Math.min(.8, g.weight * 3));
      ctx.lineWidth = main ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.globalAlpha = 1;
      if (main && Math.hypot(bx - ax, by - ay) > 60) arrowHead((ax + bx) / 2, (ay + by) / 2, Math.atan2(by - ay, bx - ax), 4.5, c);
      first = false;
    }
    // Where light lands on a screen, a dot of its colour.
    const stop = r.segments.events.find(e => e.kind === 'stop');
    if (stop) { const [x, y] = S(...stop.at); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill(); }
  }
}
function drawPulses() {
  const speed = 6, gap = 7;
  for (const s of lab.sources) for (const r of s.rays) {
    if (s.white && r.nm !== WHITE_NM[0] && r.nm !== WHITE_NM.at(-1) && r.nm !== WHITE_NM[3]) continue;
    const col = s.white ? wavelengthColor(r.nm) : C.ink;
    for (let t = (lab.time * speed) % gap; t < r.length; t += gap) {
      const p = op.pointAtTime(r.segments, t);
      if (!p) continue;
      const [x, y] = S(...p); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 2 * Math.PI); ctx.fill();
    }
  }
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** Screen angle of a world direction (screen y points down). */
const scr = ([x, y]) => Math.atan2(-y, x);
function arcBetween(x, y, r, a, b) { const d = wrap(b - a); ctx.strokeStyle = C.spot; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, a, a + d, d < 0); ctx.stroke(); }
function drawAngles() {
  const src = logSource();
  if (!src?.central) return;
  const ev = src.central.segments.events, main = src.central.segments.filter(g => g.depth === 0);
  ev.forEach((e, i) => {
    if (e.kind === 'stop') return;
    let n = e.normal;
    if (n[0] * e.dir[0] + n[1] * e.dir[1] > 0) n = [-n[0], -n[1]];      // the normal on the side the light comes from
    const [px, py] = S(...e.at), L = 2.4;
    const [ax, ay] = S(e.at[0] + n[0] * L, e.at[1] + n[1] * L), [bx, by] = S(e.at[0] - n[0] * L, e.at[1] - n[1] * L);
    ctx.strokeStyle = C.spot; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    // In: between the normal and the incoming ray, both on the incoming side.
    const nIn = scr(n), rayIn = scr([-e.dir[0], -e.dir[1]]);
    arcBetween(px, py, 22, nIn, rayIn);
    const m1 = nIn + wrap(rayIn - nIn) / 2;
    letter(`${Math.round(e.thetaI)}°`, px + Math.cos(m1) * 36, py + Math.sin(m1) * 36 + 4, {align: 'center', size: 10, color: C.spot});
    // Out: between the normal and the outgoing ray (the next main segment), on whichever side it leaves.
    const next = main[i + 1];
    if (!next || e.kind === 'mirror' || e.kind === 'tir') return;
    const out = [next.b[0] - next.a[0], next.b[1] - next.a[1]], nOut = scr([-n[0], -n[1]]), rayOut = scr(out);
    arcBetween(px, py, 22, nOut, rayOut);
    const m2 = nOut + wrap(rayOut - nOut) / 2;
    letter(`${Math.round(e.thetaT)}°`, px + Math.cos(m2) * 36, py + Math.sin(m2) * 36 + 4, {align: 'center', size: 10, color: C.spot});
  });
}

function draw() {
  if (!lab.plate) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawGrid();
  for (const p of lab.parts) drawPart(p);
  drawRays();
  if (lab.show.pulses) drawPulses();
  if (lab.show.angles) drawAngles();
  for (const s of lab.sources) drawSource(s);
  const sel = lab.selected;
  if (sel?.type === 'part') {
    const [cx, cy] = S(sel.x, sel.y), [hx, hy] = S(...handleOf(sel)), r = partRadius(sel) * k() + 6;
    ctx.strokeStyle = C.spot; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = C.paper2; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.spot; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(hx, hy, 3.5, -2.4, 1.4); ctx.stroke();
    letter(`${Math.round(((sel.angle % 360) + 360) % 360)}°`, hx + 10, hy - 8, {size: 9.5, color: C.spot});
  }
  drawTitleBlock();
}

// ---------------------------------------------------------------- the specification sheet
function renderPlate() {
  const pl = lab.plate;
  $('plates').innerHTML = plates.map((x, i) => `<button class="tab${x === pl ? ' on' : ''}" data-id="${x.id}"><b>${String(i + 1).padStart(2, '0')}</b>${x.label}</button>`).join('');
  $('note').innerHTML = `<p class="letter"><span>Plate ${String(plates.indexOf(pl) + 1).padStart(2, '0')} · notes</span></p><h1>${pl.title}</h1>${pl.text}
    <div class="formula">${pl.formula}<small>${pl.note}</small></div><p class="letter">Try</p><ul class="try">${pl.tries.map(t => `<li>${t}</li>`).join('')}</ul><div class="insight" id="insight"></div>`;
}
const wrapDeg = a => ((a + 180) % 360 + 360) % 360 - 180;
function renderSelected() {
  const o = lab.selected, el = $('selected');
  if (!o) { el.innerHTML = '<p class="letter"><span>Specification</span></p><p class="empty">Select a part or a light source on the bench to see and change its specification.</p>'; return; }
  if (o.type === 'part') {
    const kd = KINDS[o.kind], [min, max] = kd.size;
    let rows = `<tr><th>Part</th><td>${o.label} · ${kd.name}</td></tr><tr><th>Position</th><td class="num">${f1(o.x)}, ${f1(o.y)} cm</td></tr><tr><th>Turned</th><td class="num">${Math.round(o.angle)}°</td></tr>`;
    if (kd.glass) rows += `<tr><th>Glass</th><td>${GLASS[o.glass]?.label ?? 'Custom'}, n = ${o.n.toFixed(2)}: light moves at ${(1 / o.n).toFixed(2)} c</td></tr><tr><th>Critical angle</th><td class="num">${f1(op.criticalAngle(o.n))}°</td></tr>`;
    if (o.kind === 'convex' || o.kind === 'concave') rows += `<tr><th>Focal length</th><td class="num">${f1(o.focus().f)} cm</td></tr>`;
    if (o.kind === 'cmirror') rows += `<tr><th>Focal length</th><td class="num">${f1(o.size / 2)} cm (R/2)</td></tr>`;
    el.innerHTML = `<p class="letter"><span>Specification · ${o.label}</span></p><table class="spec">${rows}</table>
      <div class="controls">
        ${kd.glass ? `<div class="row" role="group" aria-label="Glass">${Object.entries(GLASS).map(([key, g]) => `<button class="tab${o.glass === key ? ' on' : ''}" data-glass="${key}">${g.label}</button>`).join('')}</div>
        <label><span>Refractive index n <output>${o.n.toFixed(2)}</output></span><input type="range" id="sel-n" min="1.0" max="2.5" step="0.01" value="${o.n}"></label>` : ''}
        <label><span>${kd.label ?? 'Size'} <output>${f1(o.size)} cm</output></span><input type="range" id="sel-size" min="${min}" max="${max}" step="0.5" value="${o.size}"></label>
        <label><span>Turned <output>${Math.round(o.angle)}°</output></span><input type="range" id="sel-angle" min="-180" max="180" step="1" value="${Math.round(wrapDeg(o.angle))}"></label>
        <div class="row"><button class="tab" id="sel-remove">Remove ${o.label}</button></div>
      </div>`;
  } else {
    const rows = `<tr><th>Source</th><td>${o.label}</td></tr><tr><th>Position</th><td class="num">${f1(o.x)}, ${f1(o.y)} cm</td></tr><tr><th>Aimed</th><td class="num">${Math.round(o.angle)}°</td></tr><tr><th>Light</th><td>${o.white ? 'White: seven colours, 405–660 nm' : 'One colour, 588 nm (yellow), printed in ink'}</td></tr>`;
    el.innerHTML = `<p class="letter"><span>Specification · ${o.label}</span></p><table class="spec">${rows}</table>
      <div class="controls">
        <div class="row" role="group" aria-label="Light"><button class="tab${o.white ? '' : ' on'}" data-white="0">One colour</button><button class="tab${o.white ? ' on' : ''}" data-white="1">White</button></div>
        ${o.kind !== 'laser' ? `<label><span>Rays <output>${o.count}</output></span><input type="range" id="sel-count" min="2" max="21" step="1" value="${o.count}"></label>` : ''}
        ${o.kind === 'beam' ? `<label><span>Beam width <output>${f1(o.width)} cm</output></span><input type="range" id="sel-width" min="1" max="20" step="0.5" value="${o.width}"></label>` : ''}
        ${o.kind === 'lamp' ? `<label><span>Spread <output>${Math.round(o.spread)}°</output></span><input type="range" id="sel-spread" min="4" max="120" step="1" value="${o.spread}"></label>` : ''}
        <label><span>Aimed <output>${Math.round(o.angle)}°</output></span><input type="range" id="sel-angle" min="-180" max="180" step="1" value="${Math.round(wrapDeg(o.angle))}"></label>
        <div class="row"><button class="tab" id="sel-remove">Remove ${o.label}</button></div>
      </div>`;
  }
  bindSelected();
}
function bindSelected() {
  const o = lab.selected;
  const fmt = {'sel-angle': v => `${v}°`, 'sel-spread': v => `${v}°`, 'sel-count': v => `${v}`, 'sel-n': v => (+v).toFixed(2)};
  const on = (id, fn) => {
    const e = $(id);
    if (e) e.oninput = ev => { fn(+ev.target.value); ev.target.previousElementSibling.querySelector('output').textContent = (fmt[id] ?? (v => `${f1(+v)} cm`))(ev.target.value); changed(false); renderSelectedQuiet(); };
  };
  on('sel-n', v => { o.n = v; o.glass = Object.keys(GLASS).find(g => Math.abs(GLASS[g].n - v) < .005) ?? 'custom'; o.disp = GLASS[o.glass]?.disp ?? o.disp; });
  on('sel-size', v => { o.size = v; });
  on('sel-angle', v => { o.angle = v; });
  on('sel-count', v => { o.count = v; });
  on('sel-width', v => { o.width = v; });
  on('sel-spread', v => { o.spread = v; });
  for (const b of document.querySelectorAll('[data-glass]')) b.onclick = () => { const g = GLASS[b.dataset.glass]; o.glass = b.dataset.glass; o.n = g.n; o.disp = g.disp; changed(); };
  for (const b of document.querySelectorAll('[data-white]')) b.onclick = () => { o.white = b.dataset.white === '1'; changed(); };
  if ($('sel-remove')) $('sel-remove').onclick = () => remove(o);
}
function renderSelectedQuiet() {
  // While dragging, keep the sheet's numbers current without rebuilding its controls.
  const o = lab.selected;
  if (!o) return;
  const cells = document.querySelectorAll('#selected table.spec td.num');
  if (cells[0]) cells[0].textContent = `${f1(o.x)}, ${f1(o.y)} cm`;
  if (cells[1]) cells[1].textContent = `${Math.round(o.angle)}°`;
}
function renderLog() {
  const s = logSource(), el = $('log');
  $('log-who').textContent = s ? `${s.label}, central ray` : '';
  const events = s?.central?.segments.events ?? [];
  if (!events.length) { el.innerHTML = '<p class="empty">The light meets nothing yet. Aim a source at a part.</p>'; return; }
  const what = e => ({enter: 'enters', leave: 'leaves', tir: 'total reflection', mirror: 'mirror', stop: 'lands on'})[e.kind];
  el.innerHTML = `<table class="spec"><tr><th>#</th><th>Surface</th><th>In</th><th>Out</th><th>Refl.</th></tr>${events.slice(0, 14).map((e, i) =>
    `<tr><td class="num">${i + 1}</td><td>${e.element.part?.label ?? ''} ${what(e)}${e.n1 ? ` <small>(n ${e.n1.toFixed(2)}→${e.n2.toFixed(2)})</small>` : ''}</td>
    <td class="num">${e.thetaI != null ? `${f1(e.thetaI)}°` : '–'}</td><td class="num">${e.kind === 'mirror' ? `${f1(e.thetaI)}°` : e.thetaT != null ? `${f1(e.thetaT)}°` : '–'}</td>
    <td class="num">${e.kind === 'tir' || e.kind === 'mirror' ? '100%' : e.R != null ? `${(e.R * 100).toFixed(1)}%` : '–'}</td></tr>`).join('')}</table>
    ${events.length > 14 ? `<p class="hint">…and ${events.length - 14} more.</p>` : ''}<p class="hint">Angles from the normal, the line at right angles to the surface.</p>`;
}
function renderInsight() { const el = $('insight'); if (el) el.innerHTML = lab.plate.insight(lab); }

function changed(full = true) {
  for (const p of lab.parts) build(p);
  traceAll();
  if (full) renderSelected();
  renderLog(); renderInsight(); draw();
}
function select(o) { lab.selected = o; renderSelected(); renderLog(); draw(); }
function remove(o) {
  lab.parts = lab.parts.filter(p => p !== o); lab.sources = lab.sources.filter(s => s !== o);
  lab.selected = null; changed();
}
function load(pl) {
  lab.plate = pl; lab.parts = []; lab.sources = []; lab.selected = null; lab.counter = {};
  pl.setup(lab);
  renderPlate(); changed();
}

// ---------------------------------------------------------------- hands
function pointInPolygon([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function nearPolyline(p, pts, tol) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy) < tol) return true;
  }
  return false;
}
function hit(w) {
  const tol = 10 / k(), sel = lab.selected;
  if (sel) { const h = handleOf(sel); if (Math.hypot(w[0] - h[0], w[1] - h[1]) < tol * 1.2) return {o: sel, mode: 'turn'}; }
  for (const s of lab.sources) { const h = handleOf(s); if (Math.hypot(w[0] - h[0], w[1] - h[1]) < tol * 1.1) return {o: s, mode: 'turn'}; }
  for (const s of [...lab.sources].reverse()) if (Math.hypot(w[0] - s.x, w[1] - s.y) < tol * 2) return {o: s, mode: 'move'};
  for (const p of [...lab.parts].reverse()) {
    const ring = [...p.el.outline, p.el.outline[0]];
    if (KINDS[p.kind].glass ? pointInPolygon(w, p.el.outline) || nearPolyline(w, ring, tol * .6) : nearPolyline(w, p.el.outline, tol)) return {o: p, mode: 'move'};
  }
  return null;
}
let drag = null;
const at = event => { const r = canvas.getBoundingClientRect(); return Wd(event.clientX - r.left, event.clientY - r.top); };
const snap = (v, s) => Math.round(v / s) * s;
canvas.addEventListener('pointerdown', event => {
  const w = at(event), h = hit(w);
  canvas.setPointerCapture(event.pointerId);
  if (!h) { select(null); return; }
  if (lab.selected !== h.o) select(h.o);
  drag = {...h, dx: h.o.x - w[0], dy: h.o.y - w[1]};
});
canvas.addEventListener('pointermove', event => {
  const w = at(event);
  if (drag) {
    const o = drag.o;
    if (drag.mode === 'move') { o.x = snap(Math.max(-31, Math.min(31, w[0] + drag.dx)), .25); o.y = snap(Math.max(-17, Math.min(17, w[1] + drag.dy)), .25); }
    else { let a = rad(Math.atan2(w[1] - o.y, w[0] - o.x)) - (o.type === 'part' ? 90 : 0); a = Math.abs(a - snap(a, 5)) < 1.5 ? snap(a, 5) : a; o.angle = Math.round(a * 10) / 10; }
    changed(false); renderSelectedQuiet(); return;
  }
  const h = hit(w);
  canvas.style.cursor = h ? (h.mode === 'turn' ? 'alias' : 'grab') : 'default';
  showTip(event, h && (h.mode === 'turn' ? `<b>${h.o.label}</b>Drag to ${h.o.type === 'source' ? 'aim' : 'turn'} it.` :
    h.o.type === 'source' ? `<b>${h.o.label}</b>Drag to move. ${h.o.white ? 'White light.' : 'One colour.'}` :
    `<b>${h.o.label} · ${KINDS[h.o.kind].name}</b>${KINDS[h.o.kind].glass ? `${GLASS[h.o.glass]?.label ?? 'Custom'} glass, n = ${h.o.n.toFixed(2)}. ` : ''}Drag to move; select it to change it.`));
});
const end = () => { if (drag) renderSelected(); drag = null; };
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('pointerleave', () => showTip(null));
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
  const kind = b.dataset.add;
  // New things go near the middle, nudged so repeated additions do not stack exactly.
  const n = lab.parts.length + lab.sources.length, x = ((n * 7) % 20) - 10, y = ((n * 5) % 12) - 6;
  const o = KINDS[kind] ? lab.addPart(kind, x, y, 0) : lab.addSource(kind, -24, y, 0);
  changed(); select(o);
});
$('plates').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) load(plates.find(p => p.id === b.dataset.id)); });
for (const [id, key] of [['t-angles', 'angles'], ['t-reflect', 'reflect'], ['t-pulses', 'pulses']]) $(id).onclick = () => {
  lab.show[key] = !lab.show[key]; $(id).classList.toggle('on', lab.show[key]); $(id).setAttribute('aria-pressed', String(lab.show[key]));
  if (key === 'reflect') changed(false); else draw();
};
$('restart').onclick = () => load(lab.plate);
const notes = $('notes');
$('about').onclick = () => notes.showModal();
notes.querySelector('.close').onclick = () => notes.close();
notes.addEventListener('click', event => { if (event.target === notes) notes.close(); });
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open]')) return;
  const o = lab.selected, nudge = {ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, .5], ArrowDown: [0, -.5]}[event.key];
  if (o && nudge) { event.preventDefault(); o.x += nudge[0]; o.y += nudge[1]; changed(false); renderSelectedQuiet(); }
  else if (o && (event.key === '[' || event.key === ']')) { o.angle += event.key === '[' ? 5 : -5; changed(); }
  else if (o && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); remove(o); }
  else if (/^[1-9]$/.test(event.key)) load(plates[+event.key - 1]);
  else if (event.key === 'Escape') select(null);
});

// ---------------------------------------------------------------- loop (only the pulses move)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (lab.show.pulses && !reducedMotion) { lab.time += dt; draw(); }
  requestAnimationFrame(frame);
}
load(plates[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__optics = {
    lab, plates, load: id => load(plates.find(p => p.id === id)), select: i => select(lab.parts[i] ?? null), changed,
    snap: () => ({plate: lab.plate.id, parts: lab.parts.map(p => `${p.label}@${f1(p.x)},${f1(p.y)}/${p.angle}`), insight: $('insight')?.textContent,
      log: (lab.log() ?? []).map(e => `${e.kind} ${e.thetaI?.toFixed(1)}→${e.thetaT?.toFixed(1)}`)}),
  };
}
