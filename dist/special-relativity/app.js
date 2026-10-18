// Special relativity: the relativity railway. One world, described in the platform frame S, shown from any frame w:
// the track (everything at one moment of your time) above a spacetime diagram that shares its x axis.
import * as sr from './physics.js';
import {routes} from './scenarios.js';

const $ = id => document.getElementById(id);
const C = {
  ink: '#2f3614', ink2: '#454d22', ink3: '#6a6f45', ink4: '#8a8c68', olive: '#56612a', oliveDark: '#3b4419', spot: '#c8541f',
  spotTint: '#e9b99a', oliveTint: '#c9c9a3', paper: '#ece4d2', paper2: '#f4eee0', board: '#262b12', flap: '#f0a35e', rule: 'rgba(86,97,42,.14)',
};
const PALETTE = [C.spot, C.olive, '#9a5a1c', C.oliveDark, C.ink3, '#a8432b'];
const PAD = {l: 36, r: 12};
const HINTS = {
  move: 'Drag an event to move it, or a train’s round handle to change its speed. Drag empty space to pan.',
  train: 'Click in the diagram: a new train passes that event at the speed below, measured in your frame.',
  flash: 'Click in the diagram to set off a flash of light there. It spreads both ways at c.',
  mark: 'Click in the diagram to mark an event, then tap two events on the board to compare them.',
};

// ---------------------------------------------------------------- the world
const lab = {
  bodies: [], tunnels: [], events: [], route: null, select: [],
  w: 0, wTarget: 0, ride: 'Platform', T: 0, playing: true, speed: 1.5, tool: 'move', cx: 0, cxTarget: 0, newV: .6,
  show: {nows: true, hyper: true}, colorIndex: 0,

  addTrain({name, v = 0, L0 = 4, x0 = 0, legs, lightClock = false, ship = false}) {
    legs ??= [{t0: 0, x0, u: v, tau0: 0, forever: true, label: name}];
    const body = {name, L0, ship, lightClock, color: PALETTE[this.colorIndex++ % PALETTE.length], legs: sr.chainLegs(legs)};
    this.bodies.push(body);
    return body;
  },
  addTunnel(t) { this.tunnels.push(t); },
  addEvent(e) { this.events.push({light: false, ...e}); },
  find(name) { return this.bodies.find(b => b.name === name); },
  /** A body's velocity relative to your frame, on the leg it is on now. */
  rel(body) { const now = this.bodyNow(body); return sr.relativeVelocity((now?.leg ?? body.legs.at(-1)).u, this.w); },
  relV(u) { return sr.relativeVelocity(u, this.w); },
  bodyNow(body, xi = 0, T = this.T) { return sr.bodyAtNow(body.legs, this.w, T, xi); },
  eventIn(name) { const e = this.events.find(x => x.name === name); return e && sr.toFrame([e.t, e.x], this.w); },
  /** Reading of the platform clock at S position x, at this moment of your frame. */
  stationAt(x, T = this.T) { return T / sr.gamma(this.w) + this.w * x; },
  frames() {
    const list = [{name: 'Platform', w: 0}];
    for (const b of this.bodies) {
      const moving = b.legs.filter(l => l.u !== 0);
      for (const l of moving) if (!list.some(x => Math.abs(x.w - l.u) < 1e-9)) list.push({name: moving.length > 1 ? `${b.name}, ${l.label}` : b.name, w: l.u, body: b, leg: l});
    }
    return list;
  },
  clear() { this.bodies = []; this.tunnels = []; this.events = []; this.select = []; this.colorIndex = 0; },
};
const f2 = x => (Math.abs(x) < 5e-3 ? 0 : x).toFixed(2);

// ---------------------------------------------------------------- canvases and the shared x axis
const figs = {};
for (const id of ['track', 'diag']) {
  const canvas = $(`c-${id}`);
  figs[id] = {canvas, ctx: canvas.getContext('2d'), w: 1, h: 1};
  new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    Object.assign(figs[id], {w: r.width, h: r.height, dpr});
    draw();
  }).observe(canvas);
}
const DIAG = {top: 12, bottom: 26};
/** Pixels per second (and per light-second): set by the diagram's height, so light is at 45°. */
function scale() {
  const [t0, t1] = lab.route.range;
  return (figs.diag.h - DIAG.top - DIAG.bottom) / (t1 - t0);
}
const X = (fig, x) => PAD.l + (fig.w - PAD.l - PAD.r) / 2 + (x - lab.cx) * scale();
const xOf = (fig, px) => lab.cx + (px - PAD.l - (fig.w - PAD.l - PAD.r) / 2) / scale();
const Y = t => figs.diag.h - DIAG.bottom - (t - lab.route.range[0]) * scale();
const tOf = py => lab.route.range[0] + (figs.diag.h - DIAG.bottom - py) / scale();

function begin(fig) {
  const {ctx, dpr, w, h} = fig;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  return ctx;
}
function text(ctx, s, x, y, {color = C.ink, align = 'left', weight = 600, size = 11, mono = false, bg = null} = {}) {
  ctx.font = `${weight} ${size}px ${mono ? '"Space Mono", monospace' : 'Inter, system-ui, sans-serif'}`;
  const w = ctx.measureText(s).width, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(x0 - 3, y - size, w + 6, size + 4); }
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x0, y);
  return w;
}
function arrowHead(ctx, x, y, angle, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .8, size * .6); ctx.lineTo(-size * .45, 0); ctx.lineTo(-size * .8, -size * .6); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function dial(ctx, x, y, r, reading, color, {period = 4} = {}) {
  ctx.fillStyle = C.paper2; ctx.strokeStyle = color; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  const a = 2 * Math.PI * reading / period;     // clockwise from twelve
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * (r - 2.5), y - Math.cos(a) * (r - 2.5)); ctx.stroke();
}

// ---------------------------------------------------------------- the track
const TRACK = {roof: 72, floor: 138, rail: 144, platform: 154, clocks: 186};
function drawTrack() {
  const fig = figs.track, ctx = begin(fig), {w} = fig, T = lab.T, k = scale();
  // Distance ruler in your frame.
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
  const x0 = Math.floor(xOf(fig, 0)), x1 = Math.ceil(xOf(fig, w));
  for (let x = x0; x <= x1; x++) { const px = X(fig, x); ctx.beginPath(); ctx.moveTo(px, 8); ctx.lineTo(px, TRACK.rail - 4); ctx.stroke(); }
  for (let x = Math.ceil(x0 / 2) * 2; x <= x1; x += 2) text(ctx, `${x}`, X(fig, x), 14, {color: C.ink4, size: 9.5, mono: true, align: 'center', weight: 400});
  // Sleepers (at rest on the platform, one per light-second) and rails.
  ctx.strokeStyle = C.ink3; ctx.lineWidth = 3;
  const sMin = Math.floor(sr.fromFrame([T, xOf(fig, 0)], lab.w)[1]) - 30, sMax = sMin + 90;
  for (let s = sMin; s <= sMax; s++) {
    const [t, x] = sr.lineMeetsNow(0, s, 0, lab.w, T), px = X(fig, sr.toFrame([t, x], lab.w)[1]);
    if (px < -10 || px > w + 10) continue;
    ctx.beginPath(); ctx.moveTo(px, TRACK.rail - 3); ctx.lineTo(px + 1, TRACK.rail + 8); ctx.stroke();
  }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  for (const y of [TRACK.rail, TRACK.rail + 5]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  // Platform from −12 to 12 ls (its own frame), with station clocks every 2 ls.
  const at = xs => X(fig, sr.toFrame(sr.lineMeetsNow(0, xs, 0, lab.w, T), lab.w)[1]);
  ctx.fillStyle = C.oliveTint; ctx.fillRect(at(-12), TRACK.platform, at(12) - at(-12), 10);
  ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.2; ctx.strokeRect(at(-12), TRACK.platform, at(12) - at(-12), 10);
  let every = 2;
  while ((at(every) - at(0)) < 46 && every < 12) every += 2;
  for (let xs = -10; xs <= 10; xs += 2) {
    if (xs % every !== 0) continue;
    const px = at(xs);
    if (px < -20 || px > w + 20) continue;
    const reading = lab.stationAt(xs);
    ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, TRACK.platform + 10); ctx.lineTo(px, TRACK.clocks - 9); ctx.stroke();
    dial(ctx, px, TRACK.clocks, 8.5, reading, C.ink);
    text(ctx, reading.toFixed(1), px, TRACK.clocks + 22, {mono: true, size: 10, align: 'center', color: C.ink2, weight: 700});
  }
  // Tunnels (at rest on the platform). Doors are shut for 0.4 s of platform time around t = 0.
  for (const tn of lab.tunnels) {
    const a = at(tn.a), b = at(tn.b);
    ctx.fillStyle = 'rgba(47,54,20,.08)'; ctx.fillRect(a, TRACK.roof - 4, b - a, TRACK.rail - TRACK.roof + 4);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a, TRACK.rail); ctx.lineTo(a, TRACK.roof - 4); ctx.lineTo(b, TRACK.roof - 4); ctx.lineTo(b, TRACK.rail); ctx.stroke();
    text(ctx, tn.name.toUpperCase(), a + 6, TRACK.roof + 9, {align: 'left', size: 9.5, weight: 800, color: C.ink2});
    for (const [xs, px] of [[tn.a, a], [tn.b, b]]) {
      const s = lab.stationAt(xs);
      if (Math.abs(s) <= .2) {
        ctx.fillStyle = C.spot; ctx.fillRect(px - 4, TRACK.roof - 4, 8, TRACK.rail - TRACK.roof + 4);
      }
    }
  }
  // Trains and ships.
  for (const b of lab.bodies) drawBodyOnTrack(ctx, fig, b);
  // Light: pulses moving out from each flash at c, in every frame.
  for (const e of lab.events) {
    const [te, xe] = sr.toFrame([e.t, e.x], lab.w);
    if (Math.abs(T - te) < .18) {
      const px = X(fig, xe);
      ctx.strokeStyle = C.spot; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * 6, TRACK.floor - 10 + Math.sin(a) * 6); ctx.lineTo(px + Math.cos(a) * 12, TRACK.floor - 10 + Math.sin(a) * 12); ctx.stroke(); }
      text(ctx, e.name, px, 30, {align: 'center', size: 11, weight: 800, color: C.spot, bg: 'rgba(244,238,224,.9)'});
    }
    if (!e.light || T < te) continue;
    for (const dir of [-1, 1]) {
      const px = X(fig, xe + dir * (T - te));
      if (px < -10 || px > w + 10) continue;
      ctx.fillStyle = C.spot; ctx.beginPath(); ctx.arc(px, TRACK.floor - 10, 4.5, 0, 2 * Math.PI); ctx.fill();
      arrowHead(ctx, px + dir * 9, TRACK.floor - 10, dir > 0 ? 0 : Math.PI, 5, C.spot);
    }
  }
  if (k < 6) text(ctx, 'zoomed out', w - 8, 14, {align: 'right', size: 9.5, color: C.ink4});
}
function drawBodyOnTrack(ctx, fig, b) {
  const centre = lab.bodyNow(b);
  if (!centre) return;
  const riding = lab.ride === b.name || lab.ride.startsWith(`${b.name},`);
  const u = sr.relativeVelocity(centre.leg.u, lab.w), dirS = Math.sign(centre.leg.u) || 1;
  let back, front;
  if (b.ship || b.legs.length > 1) {
    const half = b.L0 / 2 / sr.gamma(u);
    back = {xp: centre.xp - half * dirS}; front = {xp: centre.xp + half * dirS};
  } else {
    back = lab.bodyNow(b, -dirS * b.L0 / 2); front = lab.bodyNow(b, dirS * b.L0 / 2);
  }
  const xb = X(fig, back.xp), xf = X(fig, front.xp), left = Math.min(xb, xf), right = Math.max(xb, xf);
  const top = b.ship ? TRACK.floor - 24 : TRACK.roof, bottom = TRACK.floor;
  // Body with a nose at the front.
  const nose = Math.min(12, (right - left) * .25), fwd = xf > xb ? 1 : -1;
  ctx.beginPath();
  if (fwd > 0) { ctx.moveTo(left, top); ctx.lineTo(right - nose, top); ctx.quadraticCurveTo(right, top, right, top + (bottom - top) * .55); ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); }
  else { ctx.moveTo(right, top); ctx.lineTo(left + nose, top); ctx.quadraticCurveTo(left, top, left, top + (bottom - top) * .55); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); }
  ctx.closePath();
  ctx.fillStyle = riding ? b.color : C.paper2; ctx.fill();
  ctx.strokeStyle = b.color; ctx.lineWidth = 2.4; ctx.stroke();
  // Windows: evenly spaced along the train in its own frame, so they bunch up with it.
  if (!b.ship && b.legs.length === 1 && right - left > 30) {
    ctx.fillStyle = riding ? 'rgba(244,238,224,.75)' : 'rgba(86,97,42,.22)';
    const n = Math.max(2, Math.round(b.L0));
    for (let i = 0; i < n; i++) {
      const xi = -b.L0 / 2 + (i + .5) * b.L0 / n, p = lab.bodyNow(b, xi);
      const ww = (right - left) / n * .5;
      ctx.fillRect(X(fig, p.xp) - ww / 2, top + 7, ww, 13);
    }
  }
  // Light clock: a pulse bouncing between mirrors at the centre, with its recent path.
  if (b.lightClock) {
    const m0 = top + 27, m1 = bottom - 6, yOf = tau => { const ph = ((tau % 1) + 1) % 1; return m1 - (m1 - m0) * (ph < .5 ? ph * 2 : 2 - ph * 2); };
    const cxp = X(fig, centre.xp);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    for (const y of [m0 - 2, m1 + 2]) { ctx.beginPath(); ctx.moveTo(cxp - 9, y); ctx.lineTo(cxp + 9, y); ctx.stroke(); }
    ctx.strokeStyle = C.spot; ctx.lineWidth = 1.6; ctx.beginPath();
    let first = true;
    for (let d = 1.6; d >= 0; d -= .02) {
      const p = lab.bodyNow(b, 0, lab.T - d);
      if (!p) continue;
      const x = X(fig, p.xp), y = yOf(p.tau);
      first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false;
    }
    ctx.stroke();
    ctx.fillStyle = C.spot; ctx.beginPath(); ctx.arc(cxp, yOf(centre.tau), 4, 0, 2 * Math.PI); ctx.fill();
  }
  // Clocks: back, middle and front (they disagree when the train moves past you).
  const clocks = b.ship || b.legs.length > 1 || right - left < 60 ? [[0, centre]] :
    [[-1, lab.bodyNow(b, -b.L0 / 2 + .5)], [0, centre], [1, lab.bodyNow(b, b.L0 / 2 - .5)]];
  for (const [, p] of clocks) {
    const px = X(fig, p.xp);
    dial(ctx, px, top - 15, 9, p.tau, b.color);
    text(ctx, p.tau.toFixed(1), px + 12, top - 11, {mono: true, size: 10, weight: 700, color: C.ink2, bg: 'rgba(236,228,210,.85)'});
  }
  const name = riding ? `${b.name} · YOU` : `${b.name}  ${u >= 0 ? '→' : '←'} ${Math.abs(u).toFixed(2)} c`;
  text(ctx, name, (left + right) / 2, top - 31, {align: 'center', size: 11, weight: 800, color: riding ? C.spot : C.ink, bg: 'rgba(236,228,210,.9)'});
}

// ---------------------------------------------------------------- the spacetime diagram
let hover = null, drag = null;
function worldPath(ctx, fig, leg, xi, tFrom, tTo) {
  // Straight in every frame: transform two S events on this point's worldline.
  const g = sr.gamma(leg.u), x0 = leg.x0 + xi / g;
  const a = sr.toFrame([tFrom, x0 + leg.u * (tFrom - leg.t0)], lab.w), b = sr.toFrame([tTo, x0 + leg.u * (tTo - leg.t0)], lab.w);
  return [[X(fig, a[1]), Y(a[0])], [X(fig, b[1]), Y(b[0])]];
}
function legSpan(leg, i) { return [leg.forever && i === 0 ? -400 : leg.t0, Math.min(leg.tEnd, 400)]; }
function drawDiag() {
  const fig = figs.diag, ctx = begin(fig), {w, h} = fig, [tMin, tMax] = lab.route.range, k = scale();
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, DIAG.top, w - PAD.l - PAD.r, h - DIAG.top - DIAG.bottom); ctx.clip();
  // Your grid.
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
  for (let x = Math.floor(xOf(fig, 0)); x <= xOf(fig, w); x++) { ctx.beginPath(); ctx.moveTo(X(fig, x), 0); ctx.lineTo(X(fig, x), h); ctx.stroke(); }
  for (let t = Math.ceil(tMin); t <= tMax; t++) { ctx.beginPath(); ctx.moveTo(0, Y(t)); ctx.lineTo(w, Y(t)); ctx.stroke(); }
  // Invariant hyperbolae t² − x² = ±k²: unchanged by any change of frame.
  if (lab.show.hyper) {
    ctx.strokeStyle = 'rgba(86,97,42,.32)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    for (let s = 3; s <= 30; s += 3) {
      for (const [sx, st] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        ctx.beginPath();
        for (let i = -40; i <= 40; i++) {
          const eta = i / 10, a = s * Math.cosh(eta), b = s * Math.sinh(eta);
          const [t, x] = sx === 1 ? [st * a, b] : [b, st * a];
          i === -40 ? ctx.moveTo(X(fig, x), Y(t)) : ctx.lineTo(X(fig, x), Y(t));
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(200,84,31,.35)'; ctx.lineWidth = 1;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(fig, -100 * d), Y(-100)); ctx.lineTo(X(fig, 100 * d), Y(100)); ctx.stroke(); }
  }
  // Platform axes, when you ride something else.
  if (Math.abs(lab.w) > 1e-3) {
    ctx.strokeStyle = C.ink3; ctx.lineWidth = 1.2;
    const ta = sr.toFrame([-200, 0], lab.w), tb = sr.toFrame([200, 0], lab.w), xa = sr.toFrame([0, -200], lab.w), xb = sr.toFrame([0, 200], lab.w);
    ctx.beginPath(); ctx.moveTo(X(fig, ta[1]), Y(ta[0])); ctx.lineTo(X(fig, tb[1]), Y(tb[0])); ctx.stroke();
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(X(fig, xa[1]), Y(xa[0])); ctx.lineTo(X(fig, xb[1]), Y(xb[0])); ctx.stroke(); ctx.setLineDash([]);
  }
  // Tunnels: bands between their two ends.
  for (const tn of lab.tunnels) {
    const p = [[-200, tn.a], [200, tn.a], [200, tn.b], [-200, tn.b]].map(e => sr.toFrame(e, lab.w)).map(([t, x]) => [X(fig, x), Y(t)]);
    ctx.fillStyle = 'rgba(47,54,20,.1)'; ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(...p[0]); ctx.lineTo(...p[1]); ctx.moveTo(...p[2]); ctx.lineTo(...p[3]); ctx.stroke();
  }
  // Trains: a band from back to front, the centre's worldline, and its clock's ticks.
  for (const b of lab.bodies) {
    b.legs.forEach((leg, i) => {
      const [ta, tb] = legSpan(leg, i);
      if (!b.ship && b.legs.length === 1) {
        const d = Math.sign(leg.u) || 1, [p1, p2] = worldPath(ctx, fig, leg, -d * b.L0 / 2, ta, tb), [p3, p4] = worldPath(ctx, fig, leg, d * b.L0 / 2, ta, tb);
        ctx.fillStyle = b.color; ctx.globalAlpha = .13;
        ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p4); ctx.lineTo(...p3); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = b.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.moveTo(...p3); ctx.lineTo(...p4); ctx.stroke();
      }
      const [c1, c2] = worldPath(ctx, fig, leg, 0, ta, tb);
      ctx.strokeStyle = b.color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(...c1); ctx.lineTo(...c2); ctx.stroke();
      // Ticks every second of the body's own time.
      const g = sr.gamma(leg.u), tauA = leg.tau0 + (ta - leg.t0) / g, tauB = leg.tau0 + (tb - leg.t0) / g;
      for (let tau = Math.ceil(Math.max(tauA, -60)); tau <= Math.min(tauB, 120); tau++) {
        const t = leg.t0 + g * (tau - leg.tau0), [tp, xp] = sr.toFrame([t, leg.x0 + leg.u * (t - leg.t0)], lab.w);
        if (tp < tMin - 1 || tp > tMax + 1) continue;
        const big = tau % 5 === 0;
        ctx.fillStyle = big ? b.color : C.paper2; ctx.strokeStyle = b.color; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(X(fig, xp), Y(tp), big ? 3.4 : 2.4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        if (big && k > 14) text(ctx, `${tau}`, X(fig, xp) + 6, Y(tp) + 4, {size: 9.5, mono: true, color: b.color, weight: 700});
      }
    });
    // Speed handle above the present, on single-leg trains.
    if (b.legs.length === 1 && !b.ship) {
      const hnd = handleOf(b);
      if (hnd) {
        ctx.fillStyle = C.paper2; ctx.strokeStyle = b.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hnd.px, hnd.py, 6.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        arrowHead(ctx, hnd.px + 9, hnd.py, 0, 4, b.color); arrowHead(ctx, hnd.px - 9, hnd.py, Math.PI, 4, b.color);
      }
    }
  }
  // Light from flashes: forward light cones at 45°.
  for (const e of lab.events) {
    if (!e.light) continue;
    const [te, xe] = sr.toFrame([e.t, e.x], lab.w);
    for (const d of [-1, 1]) {
      const span = Math.max(0, tMax + 2 - te);
      ctx.strokeStyle = C.spot; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(X(fig, xe), Y(te)); ctx.lineTo(X(fig, xe + d * span), Y(te + span)); ctx.stroke();
      const tA = Math.min(lab.T, tMax) - te;
      if (tA > .6) arrowHead(ctx, X(fig, xe + d * tA), Y(te + tA), Math.atan2(-1, d), 6, C.spot);
    }
  }
  // Other frames' "now": the lines each train calls simultaneous, through where it is now.
  if (lab.show.nows) {
    const lines = [];
    if (Math.abs(lab.w) > 1e-3) lines.push({name: 'Platform', color: C.ink2, u: lab.relV(0), at: [lab.T, lab.cx]});
    for (const b of lab.bodies) {
      const now = lab.bodyNow(b);
      if (!now) continue;
      const u = sr.relativeVelocity(now.leg.u, lab.w);
      if (Math.abs(u) > 1e-3) lines.push({name: b.name, color: b.color, u, at: [now.tp, now.xp]});
    }
    for (const l of lines) {
      const [t0, x0] = l.at, span = 60;
      ctx.strokeStyle = l.color; ctx.lineWidth = 1.3; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(X(fig, x0 - span), Y(t0 - l.u * span)); ctx.lineTo(X(fig, x0 + span), Y(t0 + l.u * span)); ctx.stroke(); ctx.setLineDash([]);
      const lx = Math.min(xOf(fig, w - 70), x0 + 4.5);
      text(ctx, `${l.name}’s now`, X(fig, lx), Y(t0 + l.u * (lx - x0)) - 5, {size: 10, weight: 700, color: l.color, bg: 'rgba(236,228,210,.85)'});
    }
  }
  // Your now.
  ctx.strokeStyle = C.spot; ctx.lineWidth = 2; ctx.setLineDash([9, 5]);
  ctx.beginPath(); ctx.moveTo(0, Y(lab.T)); ctx.lineTo(w, Y(lab.T)); ctx.stroke(); ctx.setLineDash([]);
  text(ctx, 'NOW', w - PAD.r - 4, Y(lab.T) - 5, {align: 'right', size: 10.5, weight: 800, color: C.spot, bg: 'rgba(236,228,210,.85)'});
  // Events.
  for (const e of lab.events) {
    const [te, xe] = sr.toFrame([e.t, e.x], lab.w), px = X(fig, xe), py = Y(te), sel = lab.select.includes(e.name);
    if (sel) { ctx.strokeStyle = C.spot; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.fillStyle = e.light ? C.spot : C.ink; ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.fill();
    text(ctx, e.name, px + 11, py + 4, {size: 11, weight: 800, bg: 'rgba(236,228,210,.85)'});
  }
  // Body labels at the top of the diagram.
  for (const b of lab.bodies) {
    const p = lab.bodyNow(b, 0, tMax - .6);
    if (p) text(ctx, b.name, X(fig, p.xp) + 6, DIAG.top + 14, {size: 11.5, weight: 800, color: b.color, bg: 'rgba(236,228,210,.85)'});
  }
  if (hover?.tip && hover.px != null) { ctx.strokeStyle = C.spot; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hover.px, hover.py, 11, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.restore();
  // Axes.
  for (let t = Math.ceil(tMin / 2) * 2; t <= tMax; t += 2) text(ctx, `${t}`, PAD.l - 6, Y(t) + 4, {align: 'right', size: 9.5, mono: true, color: C.ink3, weight: 400});
  for (let x = Math.ceil(xOf(fig, PAD.l) / 2) * 2; x <= xOf(fig, w - PAD.r); x += 2) text(ctx, `${x}`, X(fig, x), h - 10, {align: 'center', size: 9.5, mono: true, color: C.ink3, weight: 400});
  text(ctx, 't (s) ↑', 4, DIAG.top + 2, {size: 9.5, color: C.ink3, weight: 700});
  text(ctx, 'x (ls) →', w - PAD.r, h - 10, {align: 'right', size: 9.5, color: C.ink3, weight: 700, bg: C.paper});
}
function handleOf(b) {
  const now = lab.bodyNow(b);
  if (!now) return null;
  const dt = 3, p = lab.bodyNow(b, 0, lab.T + dt);
  return p && {px: X(figs.diag, p.xp), py: Y(lab.T + dt), pivot: now};
}

function draw() { if (lab.route && figs.track.dpr && figs.diag.dpr) { drawTrack(); drawDiag(); } }

// ---------------------------------------------------------------- side column
function flaps(el, s, n) {
  const str = s.toUpperCase().padEnd(n).slice(0, n);
  el.innerHTML = [...str].map(c => `<span class="${c === ' ' ? 'blank' : ''}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  el.setAttribute('aria-label', s);
}
function renderRoute() {
  const r = lab.route;
  $('routes').innerHTML = routes.map((x, i) => `<button class="route${x === r ? ' on' : ''}" data-id="${x.id}"><i>${String(i + 1).padStart(2, '0')}</i>${x.label}</button>`).join('');
  $('ticket').innerHTML = `<h1>${r.title}</h1>${r.text}<div class="formula">${r.formula}<small>${r.note}</small></div>
    <p class="label">Try</p><ul class="try">${r.tries.map(t => `<li>${t}</li>`).join('')}</ul>`;
  renderRide();
}
function renderRide() {
  const ride = $('ride');
  ride.innerHTML = '<span>Ride with</span>' + lab.frames().map(fr =>
    `<button class="btn${fr.name === lab.ride ? ' on' : ''}" data-frame="${fr.name}"><i style="--c:${fr.body?.color ?? C.ink4}"></i>${fr.name}</button>`).join('') +
    `<label class="lever">Any speed <input id="lever" type="range" min="-0.95" max="0.95" step="0.01" value="${lab.wTarget}" aria-label="Your speed relative to the platform"><output id="out-lever">${f2(lab.wTarget)} c</output></label>`;
  $('lever').oninput = event => { setFrame(+event.target.value, 'Custom', false); };
}
function renderBoard() {
  flaps($('flap-frame'), lab.ride, 16);
  flaps($('flap-time'), `${lab.T < 0 ? '-' : ' '}${Math.abs(lab.T).toFixed(2).padStart(5, '0')}`, 6);
  $('scrub').value = lab.T;
  $('out-lever') && ($('out-lever').textContent = `${f2(lab.w)} c`);
  const rows = lab.events.map(e => {
    const [t, x] = sr.toFrame([e.t, e.x], lab.w);
    return `<tr class="${lab.select.includes(e.name) ? 'sel' : ''}" data-name="${e.name}"><td>${e.name}</td><td>${f2(t)}</td><td>${f2(x)}</td></tr>`;
  });
  $('events').innerHTML = rows.join('') || '<tr><td colspan="3">No events yet: use + Flash or + Event.</td></tr>';
  const [a, b] = lab.select.map(n => lab.eventIn(n));
  if (a && b) {
    const dt = b[0] - a[0], dx = b[1] - a[1], s2 = dt * dt - dx * dx;
    const kind = Math.abs(s2) < 1e-3 ? 'Light-like: one light ray joins them, in every frame.' :
      s2 > 0 ? `Time-like: a traveller at ${f2(dx / dt)} c relative to you is at both; for it they happen at the same place, ${Math.sqrt(s2).toFixed(2)} s apart.` :
      (Math.abs(dt) < .005 ? `Space-like: you see them at the same moment, ${Math.sqrt(-s2).toFixed(2)} ls apart. No signal can link them.` : `Space-like: a frame moving at ${f2(dt / dx)} c relative to you sees them at the same moment, ${Math.sqrt(-s2).toFixed(2)} ls apart. No signal can link them.`);
    $('pair').innerHTML = `${lab.select[0]} → ${lab.select[1]}: Δt <b>${f2(dt)}</b> s, Δx <b>${f2(dx)}</b> ls, s² = Δt² − Δx² = <b>${f2(s2)}</b> in every frame. ${kind}`;
  } else $('pair').textContent = '';
  $('insight').innerHTML = lab.route.insight(lab);
}

// ---------------------------------------------------------------- frames and routes
let tween = null;
function setFrame(w, name, animate = true) {
  lab.ride = name; lab.wTarget = w; lab.follow = null;
  const fr = lab.frames().find(x => x.name === name);
  let cx = 0;
  if (fr?.body) {
    const p = sr.bodyAtNow(fr.body.legs, w, lab.T);
    cx = p ? p.xp : 0;
    lab.follow = fr.body;
  } else if (name === 'Custom') cx = lab.cx;
  if (!animate) { lab.w = w; lab.cx = cx; tween = null; }
  else tween = {from: sr.rapidity(lab.w), to: sr.rapidity(w), cx0: lab.cx, cx1: cx, t0: performance.now()};
  for (const b of document.querySelectorAll('[data-frame]')) b.classList.toggle('on', b.dataset.frame === name);
  if (name !== 'Custom' && $('lever')) $('lever').value = w;
}
function loadRoute(r) {
  lab.route = r; lab.clear(); lab.T = r.range[0]; lab.w = lab.wTarget = 0; lab.ride = 'Platform'; lab.cx = 0; lab.follow = null; tween = null;
  r.setup(lab);
  if (!lab.select.length) lab.select = lab.events.slice(0, 2).map(e => e.name);
  $('scrub').min = r.range[0]; $('scrub').max = r.range[1];
  setPlaying(true);
  renderRoute(); renderBoard(); draw();
}

// ---------------------------------------------------------------- interaction
function setTool(tool) {
  lab.tool = tool;
  for (const b of document.querySelectorAll('[data-tool]')) { b.classList.toggle('on', b.dataset.tool === tool); b.setAttribute('aria-pressed', String(b.dataset.tool === tool)); }
  $('tool-hint').textContent = HINTS[tool];
  $('speed-row').hidden = tool !== 'train';
  figs.diag.canvas.classList.toggle('move', tool === 'move');
}
const local = (event, canvas) => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
function showTip(event, html) {
  const tip = $('tip');
  if (!html) { tip.classList.remove('visible'); return; }
  tip.innerHTML = html; tip.classList.add('visible');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(innerWidth - w - 10, event.clientX + 16)}px, ${Math.max(10, Math.min(innerHeight - h - 10, event.clientY - h - 12))}px)`;
}
function nextName(prefix) {
  if (prefix === 'train') { for (const n of 'ABCDEFGHJKLMN') if (!lab.find(n)) return n; return '?'; }
  let i = 1; while (lab.events.some(e => e.name === `${prefix} ${i}`)) i++;
  return `${prefix} ${i}`;
}
function hitDiag(sx, sy) {
  const fig = figs.diag;
  for (const e of lab.events) { const [t, x] = sr.toFrame([e.t, e.x], lab.w); if (Math.hypot(X(fig, x) - sx, Y(t) - sy) < 11) return {kind: 'event', e, px: X(fig, x), py: Y(t)}; }
  for (const b of lab.bodies) if (b.legs.length === 1 && !b.ship) { const h = handleOf(b); if (h && Math.hypot(h.px - sx, h.py - sy) < 12) return {kind: 'handle', b, ...h}; }
  const t = tOf(sy), x = xOf(fig, sx);
  for (const b of lab.bodies) {
    const p = lab.bodyNow(b, 0, t);
    if (p && Math.abs(X(fig, p.xp) - sx) < 8) return {kind: 'body', b, p, px: X(fig, p.xp), py: sy};
  }
  return {kind: 'space', t, x};
}
const diag = figs.diag.canvas;
diag.addEventListener('pointerdown', event => {
  const [sx, sy] = local(event, diag), hit = hitDiag(sx, sy), fig = figs.diag;
  const [tS, xS] = sr.fromFrame([tOf(sy), xOf(fig, sx)], lab.w);
  diag.setPointerCapture(event.pointerId);
  if (lab.tool === 'move') {
    if (hit.kind === 'event') drag = {kind: 'event', e: hit.e};
    else if (hit.kind === 'handle') drag = {kind: 'handle', b: hit.b, pivot: hit.pivot};
    else { drag = {kind: 'pan', sx, cx: lab.cx}; lab.follow = null; }
  } else if (lab.tool === 'train') {
    const u = sr.addVelocities(lab.newV, lab.w), name = nextName('train');
    lab.addTrain({name, L0: 4, legs: [{t0: tS, x0: xS, u, tau0: 0, forever: true, label: name}]});
    renderRide();
  } else if (lab.tool === 'flash' || lab.tool === 'mark') {
    const name = nextName(lab.tool === 'flash' ? 'Flash' : 'Event');
    lab.addEvent({name, t: tS, x: xS, light: lab.tool === 'flash'});
    lab.select = [...lab.select, name].slice(-2);
  }
  renderBoard(); draw();
});
diag.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, diag), fig = figs.diag;
  if (drag?.kind === 'event') {
    [drag.e.t, drag.e.x] = sr.fromFrame([tOf(sy), xOf(fig, sx)], lab.w); renderBoard(); draw(); return;
  }
  if (drag?.kind === 'handle') {
    const piv = drag.pivot, dtp = Math.max(.5, tOf(sy) - piv.tp);
    const up = Math.max(-.95, Math.min(.95, (xOf(fig, sx) - piv.xp) / dtp)), u = sr.addVelocities(up, lab.w);
    drag.b.legs = sr.chainLegs([{t0: piv.t, x0: piv.x, u, tau0: piv.tau, forever: true, label: drag.b.name}]);
    renderRide(); setFrame(lab.wTarget, lab.ride, false);
    showTip(event, `<b>${drag.b.name}</b>${f2(up)} c in your frame · ${f2(u)} c on the platform`); draw(); return;
  }
  if (drag?.kind === 'pan') { lab.cx = drag.cx - (sx - drag.sx) / scale(); draw(); return; }
  const hit = hitDiag(sx, sy);
  hover = null;
  if (hit.kind === 'event') {
    const [t, x] = sr.toFrame([hit.e.t, hit.e.x], lab.w);
    hover = {tip: true, px: hit.px, py: hit.py};
    showTip(event, `<b>${hit.e.name}</b>your frame: t = ${f2(t)} s, x = ${f2(x)} ls<br>platform: t = ${f2(hit.e.t)} s, x = ${f2(hit.e.x)} ls`);
  } else if (hit.kind === 'handle') showTip(event, `<b>${hit.b.name}: speed handle</b>Drag sideways to change its speed. Its clocks carry on from now.`);
  else if (hit.kind === 'body') showTip(event, `<b>${hit.b.name}</b>its own clock reads ${hit.p.tau.toFixed(2)} s here<br>moving at ${f2(sr.relativeVelocity(hit.p.leg.u, lab.w))} c in your frame`);
  else {
    const s2 = hit.t * hit.t - hit.x * hit.x;
    showTip(event, `<b>t = ${f2(hit.t)} s, x = ${f2(hit.x)} ls</b>${Math.abs(s2) < .3 ? 'On the light cone of the origin.' : s2 > 0 ? `${hit.t > 0 ? 'In the future' : 'In the past'} of the origin: s² = ${f2(s2)} in every frame.` : `Elsewhere: no signal from the origin can reach here. s² = ${f2(s2)}.`}`);
  }
  if (!lab.playing) draw();
});
const endDrag = () => { drag = null; };
diag.addEventListener('pointerup', endDrag);
diag.addEventListener('pointercancel', endDrag);
diag.addEventListener('pointerleave', () => { hover = null; showTip(null); });

const track = figs.track.canvas;
track.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, track), fig = figs.track;
  if (sy > TRACK.clocks - 14) {
    const xs = Math.round(sr.fromFrame([lab.T, xOf(fig, sx)], lab.w)[1] / 2) * 2;
    if (Math.abs(xs) <= 10) return showTip(event, `<b>Platform clock at x = ${xs} ls</b>reads ${lab.stationAt(xs).toFixed(2)} s at this moment of your frame.${Math.abs(lab.w) > 1e-3 ? ' The platform clocks are synchronised for the platform, so to you they are out of step.' : ''}`);
  }
  for (const b of lab.bodies) {
    const p = lab.bodyNow(b, 0);
    if (!p) continue;
    const half = b.L0 / 2 / sr.gamma(sr.relativeVelocity(p.leg.u, lab.w)) * scale() + 8;
    if (Math.abs(X(fig, p.xp) - sx) < half && sy > TRACK.roof - 30 && sy < TRACK.floor + 4) {
      const u = sr.relativeVelocity(p.leg.u, lab.w);
      return showTip(event, `<b>${b.name}</b>${b.L0} ls long in its own frame, ${(b.L0 / sr.gamma(u)).toFixed(2)} ls in yours<br>moving at ${f2(u)} c; its clocks run at ${(1 / sr.gamma(u)).toFixed(3)} of yours`);
    }
  }
  showTip(null);
});
track.addEventListener('pointerleave', () => showTip(null));

$('events').addEventListener('click', event => {
  const row = event.target.closest('[data-name]');
  if (!row) return;
  const n = row.dataset.name;
  lab.select = lab.select.includes(n) ? lab.select.filter(x => x !== n) : [...lab.select, n].slice(-2);
  renderBoard(); draw();
});
$('ride').addEventListener('click', event => {
  const b = event.target.closest('[data-frame]');
  if (!b) return;
  const fr = lab.frames().find(x => x.name === b.dataset.frame);
  setFrame(fr.w, fr.name);
});
$('routes').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) loadRoute(routes.find(r => r.id === b.dataset.id)); });
$('tools').addEventListener('click', event => { const b = event.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
$('new-v').oninput = event => { lab.newV = +event.target.value; $('out-v').textContent = `${f2(lab.newV)} c`; };
$('scrub').oninput = event => { lab.T = +event.target.value; setPlaying(false); renderBoard(); draw(); };
$('restart').onclick = () => loadRoute(lab.route);
$('clear').onclick = () => { lab.clear(); setFrame(0, 'Platform', false); renderRide(); renderBoard(); draw(); };
$('t-nows').onclick = event => { lab.show.nows = !lab.show.nows; event.currentTarget.setAttribute('aria-pressed', lab.show.nows); draw(); };
$('t-hyper').onclick = event => { lab.show.hyper = !lab.show.hyper; event.currentTarget.setAttribute('aria-pressed', lab.show.hyper); draw(); };
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => {
  lab.speed = +b.dataset.speed;
  for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', x === b);
};
const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';
function setPlaying(on) {
  if (on && lab.route && lab.T >= lab.route.range[1] - 1e-6) lab.T = lab.route.range[0];
  lab.playing = on; $('play').innerHTML = on ? ICON_PAUSE : ICON_PLAY; $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
}
$('play').onclick = () => setPlaying(!lab.playing);
const notes = $('notes');
$('about').onclick = () => notes.showModal();
notes.querySelector('.close').onclick = () => notes.close();
notes.addEventListener('click', event => { if (event.target === notes) notes.close(); });
addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, dialog[open]')) return;
  if (event.key === ' ') { event.preventDefault(); setPlaying(!lab.playing); }
  else if (event.key === 'r' || event.key === 'R') loadRoute(lab.route);
  else if (/^[1-7]$/.test(event.key)) loadRoute(routes[+event.key - 1]);
  else if (event.key === 'f' || event.key === 'F') {
    const list = lab.frames(), i = list.findIndex(x => x.name === lab.ride), fr = list[(i + 1) % list.length];
    setFrame(fr.w, fr.name);
  }
});

// ---------------------------------------------------------------- loop
let last = performance.now(), lastBoard = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (tween) {
    const u = Math.min(1, (now - tween.t0) / 700), e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    lab.w = Math.tanh(tween.from + (tween.to - tween.from) * e);
    lab.cx = tween.cx0 + (tween.cx1 - tween.cx0) * e;
    if (u >= 1) tween = null;
  } else if (lab.follow) {
    const p = lab.bodyNow(lab.follow);
    if (p) lab.cx = p.xp;
  }
  if (lab.playing) {
    lab.T += dt * lab.speed;
    if (lab.T >= lab.route.range[1]) { lab.T = lab.route.range[1]; setPlaying(false); }
  }
  draw();
  if (now - lastBoard > 120) { lastBoard = now; renderBoard(); }
  requestAnimationFrame(frame);
}
setTool('move');
loadRoute(routes[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__sr = {
    lab, routes,
    load: id => loadRoute(routes.find(r => r.id === id)),
    at: T => { lab.T = T; setPlaying(false); renderBoard(); draw(); return T; },
    ride: name => { const fr = lab.frames().find(x => x.name === name); setFrame(fr.w, fr.name, false); renderBoard(); draw(); return fr; },
    snap: () => ({T: lab.T, w: lab.w, ride: lab.ride, insight: $('insight').textContent, pair: $('pair').textContent,
      bodies: lab.bodies.map(b => { const p = lab.bodyNow(b); return p && {name: b.name, xp: +p.xp.toFixed(3), tau: +p.tau.toFixed(3)}; })}),
  };
}
