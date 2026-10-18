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

// ---------------------------------------------------------------- the world
const lab = {
  bodies: [], tunnels: [], events: [], route: null, select: [],
  w: 0, wTarget: 0, ride: 'Platform', T: 0, playing: true, speed: 1.5, cx: 0, selected: null,
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
  if (lab.selected?.ref === b) { ctx.save(); ctx.strokeStyle = C.spot; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(left - 6, top - 6, right - left + 12, bottom - top + 12); ctx.restore(); }
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
      ctx.strokeStyle = b.color; ctx.lineWidth = lab.selected?.ref === b ? 4 : 2.4; ctx.beginPath(); ctx.moveTo(...c1); ctx.lineTo(...c2); ctx.stroke();
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

// ---------------------------------------------------------------- the sheet
const fmt = (x, d = 2) => (Math.abs(x) < 5e-3 ? 0 : x).toFixed(d);
const row = (k, v) => `<tr><th>${k}</th><td class="num">${v}</td></tr>`;
function renderPlate() {
  const r = lab.route;
  $('plates').innerHTML = routes.map((x, i) => `<button class="tab${x === r ? ' on' : ''}" data-id="${x.id}"><b>${String(i + 1).padStart(2, '0')}</b>${x.label}</button>`).join('');
  $('note').innerHTML = `<p class="letter"><span>Plate ${String(routes.indexOf(r) + 1).padStart(2, '0')} · notes</span></p><h1>${r.title}</h1>${r.text}
    <div class="formula">${r.formula}<small>${r.note}</small></div><p class="letter">Try</p><ul class="try">${r.tries.map(t => `<li>${t}</li>`).join('')}</ul><div class="insight" id="insight"></div>`;
  renderRide();
}
function renderRide() {
  $('ride').innerHTML = lab.frames().map(fr => `<button class="tab${fr.name === lab.ride ? ' on' : ''}" data-frame="${fr.name}"><i style="--c:${fr.body?.color ?? C.ink4}"></i>${fr.name}</button>`).join('') +
    `<label class="lever wide-only">or <input id="lever" type="range" min="-0.95" max="0.95" step="0.01" value="${lab.wTarget}" aria-label="Your speed relative to the platform"><output id="out-lever">${fmt(lab.wTarget)} c</output></label>`;
  $('lever').oninput = event => { setFrame(+event.target.value, 'Custom', false); renderReadings(); };
}
const sel = () => lab.selected;
function renderSelected() {
  const o = sel(), el = $('selected');
  if (!o) { el.innerHTML = '<p class="letter"><span>Specification</span></p><p class="empty">Select a train, traveller, tunnel or event on the board, or add one from the tray.</p>'; return; }
  let rows = '', controls = '';
  if (o.kind === 'body' && !o.ref.ship) {
    const b = o.ref, leg = b.legs.at(-1);
    rows = row('Train', b.name) + row('Speed on the platform', `${fmt(leg.u)} c`) + row('Length (its own)', `${fmt(b.L0, 1)} ls`) + row('Light clock', b.lightClock ? 'on board' : 'none');
    controls = `<label><span>Speed on the platform <output>${fmt(leg.u)} c</output></span><input type="range" id="sel-u" min="-0.95" max="0.95" step="0.01" value="${leg.u}"></label>
      <label><span>Length <output>${fmt(b.L0, 1)} ls</output></span><input type="range" id="sel-L" min="1" max="14" step="0.5" value="${b.L0}"></label>
      <div class="row"><button class="tab" id="sel-ride">Ride with ${b.name}</button><button class="tab${b.lightClock ? ' on' : ''}" id="sel-lc">Light clock</button></div>`;
  } else if (o.kind === 'body') {
    const b = o.ref, out = b.legs.find(l => l.label === 'out');
    rows = row('Traveller', b.name) + (out ? row('Speed out and back', `${fmt(out.u)} c`) + row('Turns round at', `t = ${fmt(b.legs.find(l => l.label === 'back')?.t0 ?? 0, 1)} s (platform)`) : row('Path', 'carried along'));
    if (out) controls = `<label><span>Speed <output>${fmt(out.u)} c</output></span><input type="range" id="sel-tu" min="0.1" max="0.95" step="0.01" value="${out.u}"></label>
      <label><span>Turn after <output>${fmt(b.turn, 1)} s</output></span><input type="range" id="sel-turn" min="2" max="14" step="0.5" value="${b.turn}"></label>
      <div class="row"><button class="tab" id="sel-ride">Ride with it, out</button></div>`;
  } else if (o.kind === 'event') {
    const e = o.ref, [tp, xp] = sr.toFrame([e.t, e.x], lab.w);
    rows = row('Event', `${e.name}${e.light ? ', a flash of light' : ''}`) + row('In your frame', `t = ${fmt(tp)} s, x = ${fmt(xp)} ls`) + row('On the platform', `t = ${fmt(e.t)} s, x = ${fmt(e.x)} ls`);
    controls = `<label><span>Your time t <output>${fmt(tp)} s</output></span><input type="range" id="sel-t" min="${lab.route.range[0]}" max="${lab.route.range[1]}" step="0.05" value="${tp}"></label>
      <label><span>Your x <output>${fmt(xp)} ls</output></span><input type="range" id="sel-x" min="-16" max="16" step="0.05" value="${xp}"></label>
      <div class="row"><button class="tab${e.light ? ' on' : ''}" id="sel-light">${e.light ? 'Flash of light' : 'Plain event'}</button></div>`;
  } else {
    const tn = o.ref;
    rows = row('Tunnel', tn.name) + row('Length (its own)', `${fmt(tn.b - tn.a, 1)} ls, at rest on the platform`);
    controls = `<label><span>Length <output>${fmt(tn.b - tn.a, 1)} ls</output></span><input type="range" id="sel-tl" min="2" max="14" step="0.1" value="${tn.b - tn.a}"></label>`;
  }
  el.innerHTML = `<p class="letter"><span>Specification · ${o.ref.name}</span></p><table class="spec">${rows}</table><div class="controls">${controls}<div class="row"><button class="tab" id="sel-remove">Remove ${o.ref.name}</button></div></div>`;
  bindSelected();
}
function rebuildTrain(b, u) {
  // Change speed from now on, keeping the train's clock and position at this moment of your time.
  const p = lab.bodyNow(b) ?? lab.bodyNow(b, 0, lab.route.range[0]);
  b.legs = sr.chainLegs([{t0: p.t, x0: p.x, u, tau0: p.tau, forever: true, label: b.name}]);
}
function travellerLegs(b) {
  const v = b.speed, T = b.turn, t0 = b.start, x0 = b.home;
  return sr.chainLegs([{t0: t0 - 60, x0, u: 0, tau0: -60, label: 'at home', forever: true}, {t0, x0, u: v, tau0: 0, label: 'out'},
    {t0: t0 + T, x0: x0 + v * T, u: -v, tau0: T / sr.gamma(v), label: 'back'}, {t0: t0 + 2 * T, x0, u: 0, tau0: 2 * T / sr.gamma(v), label: 'home'}]);
}
function bindSelected() {
  const o = sel(), on = (id, fn, f) => { const e = $(id); if (e) e.oninput = ev => { fn(+ev.target.value); ev.target.previousElementSibling.querySelector('output').textContent = f(+ev.target.value); renderRide(); renderReadings(); draw(); }; };
  on('sel-u', v => rebuildTrain(o.ref, v), v => `${fmt(v)} c`);
  on('sel-L', v => { o.ref.L0 = v; }, v => `${fmt(v, 1)} ls`);
  on('sel-tu', v => { o.ref.speed = v; o.ref.legs = travellerLegs(o.ref); }, v => `${fmt(v)} c`);
  on('sel-turn', v => { o.ref.turn = v; o.ref.legs = travellerLegs(o.ref); }, v => `${fmt(v, 1)} s`);
  on('sel-t', v => { const [, xp] = sr.toFrame([o.ref.t, o.ref.x], lab.w); [o.ref.t, o.ref.x] = sr.fromFrame([v, xp], lab.w); }, v => `${fmt(v)} s`);
  on('sel-x', v => { const [tp] = sr.toFrame([o.ref.t, o.ref.x], lab.w); [o.ref.t, o.ref.x] = sr.fromFrame([tp, v], lab.w); }, v => `${fmt(v)} ls`);
  on('sel-tl', v => { const c = (o.ref.a + o.ref.b) / 2; o.ref.a = c - v / 2; o.ref.b = c + v / 2; }, v => `${fmt(v, 1)} ls`);
  const click = (id, fn) => { const e = $(id); if (e) e.onclick = () => { fn(); renderSelected(); renderReadings(); draw(); }; };
  click('sel-ride', () => { const fr = lab.frames().find(f => f.body === o.ref); if (fr) setFrame(fr.w, fr.name); });
  click('sel-lc', () => { o.ref.lightClock = !o.ref.lightClock; });
  click('sel-light', () => { o.ref.light = !o.ref.light; });
  click('sel-remove', () => removeSelected());
}
function removeSelected() {
  const o = sel();
  if (!o) return;
  if (o.kind === 'body') { lab.bodies = lab.bodies.filter(b => b !== o.ref); if (lab.follow === o.ref) setFrame(0, 'Platform'); }
  if (o.kind === 'event') { lab.events = lab.events.filter(e => e !== o.ref); lab.select = lab.select.filter(n => n !== o.ref.name); }
  if (o.kind === 'tunnel') lab.tunnels = lab.tunnels.filter(t => t !== o.ref);
  lab.selected = null; renderRide(); renderSelected(); renderReadings(); draw();
}
function intervalText(a, b) {
  const [ta, xa] = sr.toFrame([a.t, a.x], lab.w), [tb, xb] = sr.toFrame([b.t, b.x], lab.w), dt = tb - ta, dx = xb - xa, s2 = dt * dt - dx * dx;
  const kind = Math.abs(s2) < 1e-3 ? 'light-like: one light ray joins them' : s2 > 0 ? `time-like: ${fmt(Math.sqrt(s2))} s apart for a traveller at ${fmt(dx / dt)} c, who is at both` :
    Math.abs(dt) < .005 ? `space-like: at the same moment for you, ${fmt(Math.sqrt(-s2))} ls apart` : `space-like: simultaneous for a frame at ${fmt(dt / dx)} c; no signal links them`;
  return {dt, dx, s2, kind};
}
/** Exact readings in your frame for the selected thing (or a summary of the board). */
function renderReadings() {
  const o = sel(), el = $('log');
  $('log-who').textContent = o ? o.ref.name : 'the board';
  $('clockface').textContent = `t = ${fmt(lab.T)} s`;
  $('frame-name').textContent = `riding with ${lab.ride}${lab.ride === 'Custom' ? ` (${fmt(lab.w)} c)` : ''}`;
  let rows = '';
  if (!o) {
    for (const b of lab.bodies) { const p = lab.bodyNow(b); if (p) rows += row(b.name, `${fmt(sr.relativeVelocity(p.leg.u, lab.w))} c · clock ${fmt(p.tau)} s`); }
    rows += row('Platform clock at x = 0', `${fmt(lab.stationAt(0))} s`);
  } else if (o.kind === 'body') {
    const b = o.ref, p = lab.bodyNow(b);
    if (!p) { el.innerHTML = '<p class="empty">Not on the board at this moment.</p>'; return; }
    const u = sr.relativeVelocity(p.leg.u, lab.w), g = sr.gamma(u);
    rows = row('Speed in your frame', `${fmt(u)} c`) + row('γ = 1/√(1 − v²)', fmt(g, 3)) + row('Its clocks run at', `${fmt(1 / g, 3)} of yours`) + row('Its centre clock now', `${fmt(p.tau)} s`);
    if (!b.ship) rows += row('Length in your frame', `${fmt(b.L0 / g)} ls (its own: ${fmt(b.L0, 1)})`) + row('Front clock behind the back by', `v L₀ = ${fmt(Math.abs(u) * b.L0)} s`);
    else if (b.turn != null) rows += row('Home clock at this moment', `${fmt(lab.stationAt(b.home))} s`) + row('Ages at the return', `traveller ${fmt(2 * b.turn / sr.gamma(b.speed))} s, home ${fmt(2 * b.turn)} s`);
  } else if (o.kind === 'event') {
    const e = o.ref, [tp, xp] = sr.toFrame([e.t, e.x], lab.w);
    rows = row('In your frame', `t = ${fmt(tp)} s, x = ${fmt(xp)} ls`);
    for (const other of lab.events) {
      if (other === e) continue;
      const iv = intervalText(e, other);
      rows += row(`to ${other.name}`, `Δt ${fmt(iv.dt)}, Δx ${fmt(iv.dx)}, s² ${fmt(iv.s2)}<br><small>${iv.kind}</small>`);
    }
  } else {
    const tn = o.ref, g = sr.gamma(lab.w);
    rows = row('Length in your frame', `${fmt((tn.b - tn.a) / g)} ls (its own: ${fmt(tn.b - tn.a, 1)})`) + row('Moving at', `${fmt(-lab.w)} c in your frame`);
    const doors = lab.events.filter(e => /shuts/.test(e.name));
    if (doors.length === 2) { const iv = intervalText(doors[0], doors[1]); rows += row('Doors shut', Math.abs(iv.dt) < .01 ? 'at the same moment' : `${fmt(Math.abs(iv.dt))} s apart`); }
  }
  el.innerHTML = `<table class="spec readings">${rows}</table>`;
  const ins = $('insight'); if (ins) ins.innerHTML = lab.route.insight(lab);
  $('scrub').value = lab.T;
}

// ---------------------------------------------------------------- frames and plates
let tween = null;
function setFrame(w, name, animate = true) {
  lab.ride = name; lab.wTarget = w; lab.follow = null;
  const fr = lab.frames().find(x => x.name === name);
  let cx = 0;
  if (fr?.body) { const p = sr.bodyAtNow(fr.body.legs, w, lab.T); cx = p ? p.xp : 0; lab.follow = fr.body; }
  else if (name === 'Custom') cx = lab.cx;
  if (!animate) { lab.w = w; lab.cx = cx; tween = null; }
  else tween = {from: sr.rapidity(lab.w), to: sr.rapidity(w), cx0: lab.cx, cx1: cx, t0: performance.now()};
  for (const b of document.querySelectorAll('[data-frame]')) b.classList.toggle('on', b.dataset.frame === name);
  if (name !== 'Custom' && $('lever')) $('lever').value = w;
}
function loadRoute(r) {
  lab.route = r; lab.clear(); lab.T = r.range[0]; lab.w = lab.wTarget = 0; lab.ride = 'Platform'; lab.cx = 0; lab.follow = null; tween = null; lab.selected = null;
  r.setup(lab);
  for (const b of lab.bodies) if (b.ship && b.legs.some(l => l.label === 'out')) { const out = b.legs.find(l => l.label === 'out'), back = b.legs.find(l => l.label === 'back'); Object.assign(b, {speed: out.u, turn: back.t0 - out.t0, start: out.t0, home: out.x0}); }
  for (const t of lab.tunnels) t.name ??= 'Tunnel';
  if (!lab.select.length) lab.select = lab.events.slice(0, 2).map(e => e.name);
  const first = lab.select[0] && lab.events.find(e => e.name === lab.select[0]);
  lab.selected = first ? {kind: 'event', ref: first} : lab.bodies[0] ? {kind: 'body', ref: lab.bodies[0]} : null;
  $('scrub').min = r.range[0]; $('scrub').max = r.range[1];
  setPlaying(true);
  renderPlate(); renderSelected(); renderReadings(); draw();
}

// ---------------------------------------------------------------- hands
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
  let i = 1; while (lab.events.some(e => e.name === `${prefix} ${i}`) || lab.tunnels.some(t => t.name === `${prefix} ${i}`)) i++;
  return `${prefix} ${i}`;
}
function select(o) {
  lab.selected = o;
  if (o?.kind === 'event' && !lab.select.includes(o.ref.name)) lab.select = [...lab.select, o.ref.name].slice(-2);
  renderSelected(); renderReadings(); draw();
}
function hitDiag(sx, sy) {
  const fig = figs.diag;
  for (const e of lab.events) { const [t, x] = sr.toFrame([e.t, e.x], lab.w); if (Math.hypot(X(fig, x) - sx, Y(t) - sy) < 11) return {kind: 'event', e, px: X(fig, x), py: Y(t)}; }
  for (const b of lab.bodies) if (b.legs.length === 1 && !b.ship) { const h = handleOf(b); if (h && Math.hypot(h.px - sx, h.py - sy) < 12) return {kind: 'handle', b, ...h}; }
  const t = tOf(sy), x = xOf(fig, sx);
  for (const b of lab.bodies) { const p = lab.bodyNow(b, 0, t); if (p && Math.abs(X(fig, p.xp) - sx) < 9) return {kind: 'body', b, p, px: X(fig, p.xp), py: sy}; }
  return {kind: 'space', t, x};
}

const diag = figs.diag.canvas;
diag.addEventListener('pointerdown', event => {
  const [sx, sy] = local(event, diag), hit = hitDiag(sx, sy);
  diag.setPointerCapture(event.pointerId);
  if (hit.kind === 'event') { select({kind: 'event', ref: hit.e}); drag = {kind: 'event', e: hit.e}; }
  else if (hit.kind === 'handle') { select({kind: 'body', ref: hit.b}); drag = {kind: 'handle', b: hit.b, pivot: hit.pivot}; }
  else if (hit.kind === 'body') select({kind: 'body', ref: hit.b});
  else { drag = {kind: 'pan', sx, cx: lab.cx}; lab.follow = null; }
});
diag.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, diag), fig = figs.diag;
  if (drag?.kind === 'event') { [drag.e.t, drag.e.x] = sr.fromFrame([tOf(sy), xOf(fig, sx)], lab.w); renderReadings(); draw(); return; }
  if (drag?.kind === 'handle') {
    const piv = drag.pivot, dtp = Math.max(.5, tOf(sy) - piv.tp);
    const up = Math.max(-.95, Math.min(.95, (xOf(fig, sx) - piv.xp) / dtp)), u = sr.addVelocities(up, lab.w);
    drag.b.legs = sr.chainLegs([{t0: piv.t, x0: piv.x, u, tau0: piv.tau, forever: true, label: drag.b.name}]);
    renderRide(); setFrame(lab.wTarget, lab.ride, false);
    showTip(event, `<b>${drag.b.name}</b>${fmt(up)} c in your frame · ${fmt(u)} c on the platform`); renderReadings(); draw(); return;
  }
  if (drag?.kind === 'pan') { lab.cx = drag.cx - (sx - drag.sx) / scale(); draw(); return; }
  const hit = hitDiag(sx, sy);
  hover = null;
  if (hit.kind === 'event') { const [t, x] = sr.toFrame([hit.e.t, hit.e.x], lab.w); hover = {tip: true, px: hit.px, py: hit.py}; showTip(event, `<b>${hit.e.name}</b>your frame: t = ${fmt(t)} s, x = ${fmt(x)} ls<br>platform: t = ${fmt(hit.e.t)} s, x = ${fmt(hit.e.x)} ls`); }
  else if (hit.kind === 'handle') showTip(event, `<b>${hit.b.name}: speed handle</b>Drag sideways to change its speed. Its clocks carry on from now.`);
  else if (hit.kind === 'body') showTip(event, `<b>${hit.b.name}</b>its own clock reads ${hit.p.tau.toFixed(2)} s here<br>moving at ${fmt(sr.relativeVelocity(hit.p.leg.u, lab.w))} c in your frame`);
  else { const s2 = hit.t * hit.t - hit.x * hit.x; showTip(event, `<b>t = ${fmt(hit.t)} s, x = ${fmt(hit.x)} ls</b>${Math.abs(s2) < .3 ? 'On the light cone of the origin.' : s2 > 0 ? `${hit.t > 0 ? 'In the future' : 'In the past'} of the origin: s² = ${fmt(s2)} in every frame.` : `Elsewhere: no signal from the origin can reach here. s² = ${fmt(s2)}.`}`); }
  if (!lab.playing) draw();
});
const endDrag = () => { if (drag && drag.kind !== 'pan') renderSelected(); drag = null; };
diag.addEventListener('pointerup', endDrag);
diag.addEventListener('pointercancel', endDrag);
diag.addEventListener('pointerleave', () => { hover = null; showTip(null); });

const track = figs.track.canvas;
function hitTrack(sx, sy) {
  const fig = figs.track;
  for (const b of lab.bodies) {
    const p = lab.bodyNow(b, 0);
    if (!p) continue;
    const half = (b.ship ? 1 : b.L0 / 2) / sr.gamma(sr.relativeVelocity(p.leg.u, lab.w)) * scale() + 8;
    if (Math.abs(X(fig, p.xp) - sx) < half && sy > TRACK.roof - 34 && sy < TRACK.floor + 4) return {kind: 'body', b, p};
  }
  for (const tn of lab.tunnels) {
    const at = xs => X(fig, sr.toFrame(sr.lineMeetsNow(0, xs, 0, lab.w, lab.T), lab.w)[1]);
    if (sx > at(tn.a) && sx < at(tn.b) && sy < TRACK.rail) return {kind: 'tunnel', tn};
  }
  return null;
}
track.addEventListener('pointerdown', event => {
  const [sx, sy] = local(event, track), h = hitTrack(sx, sy);
  if (!h) return;
  track.setPointerCapture(event.pointerId);
  select(h.kind === 'body' ? {kind: 'body', ref: h.b} : {kind: 'tunnel', ref: h.tn});
  drag = {kind: 'slide', o: h.kind === 'body' ? h.b : h.tn, tunnel: h.kind === 'tunnel', sx};
});
track.addEventListener('pointermove', event => {
  const [sx, sy] = local(event, track), fig = figs.track;
  if (drag?.kind === 'slide') {
    // Slide along the track in your frame: a shift of d in x′ at fixed t′.
    const d = (sx - drag.sx) / scale(), [dt, dx] = sr.fromFrame([0, d], lab.w); drag.sx = sx;
    if (drag.tunnel) { drag.o.a += dx; drag.o.b += dx; }
    else drag.o.legs = sr.chainLegs(drag.o.legs.map(l => ({...l, t0: l.t0 + dt, x0: l.x0 + dx})));
    renderReadings(); draw(); return;
  }
  if (sy > TRACK.clocks - 14) {
    const xs = Math.round(sr.fromFrame([lab.T, xOf(fig, sx)], lab.w)[1] / 2) * 2;
    if (Math.abs(xs) <= 10) return showTip(event, `<b>Platform clock at x = ${xs} ls</b>reads ${lab.stationAt(xs).toFixed(2)} s at this moment of your frame.${Math.abs(lab.w) > 1e-3 ? ' The platform clocks are synchronised for the platform, so to you they are out of step.' : ''}`);
  }
  const h = hitTrack(sx, sy);
  track.style.cursor = h ? 'grab' : 'default';
  if (h?.kind === 'body') { const u = sr.relativeVelocity(h.p.leg.u, lab.w); return showTip(event, `<b>${h.b.name}</b>${h.b.ship ? '' : `${h.b.L0} ls long in its own frame, ${(h.b.L0 / sr.gamma(u)).toFixed(2)} ls in yours<br>`}moving at ${fmt(u)} c; its clocks run at ${(1 / sr.gamma(u)).toFixed(3)} of yours. Drag to slide it.`); }
  if (h?.kind === 'tunnel') return showTip(event, `<b>${h.tn.name}</b>At rest on the platform. Drag to slide it.`);
  showTip(null);
});
track.addEventListener('pointerup', endDrag);
track.addEventListener('pointercancel', endDrag);
track.addEventListener('pointerleave', () => showTip(null));

document.querySelector('.tray').addEventListener('click', event => {
  const b = event.target.closest('[data-add]');
  if (!b) return;
  const kind = b.dataset.add, here = sr.fromFrame([lab.T, lab.cx], lab.w);
  let o;
  if (kind === 'train') {
    const name = nextName('train'), u = sr.addVelocities(.5, lab.w);
    const body = lab.addTrain({name, L0: 4, legs: [{t0: here[0], x0: here[1] - 6 * Math.sign(u || 1), u, tau0: 0, forever: true, label: name}]});
    o = {kind: 'body', ref: body};
  } else if (kind === 'traveller') {
    const name = nextName('train'), body = lab.addTrain({name, L0: 1.2, ship: true, legs: [{t0: 0, x0: 0, u: 0, tau0: 0, forever: true, label: 'at home'}]});
    Object.assign(body, {speed: .8, turn: 5, start: here[0], home: here[1]}); body.legs = travellerLegs(body);
    o = {kind: 'body', ref: body};
  } else if (kind === 'tunnel') {
    const tn = {name: nextName('Tunnel'), a: here[1] - 3, b: here[1] + 3}; lab.addTunnel(tn); o = {kind: 'tunnel', ref: tn};
  } else {
    const [t, x] = sr.fromFrame([lab.T + (kind === 'flash' ? 1 : 2), lab.cx + (kind === 'flash' ? 0 : 2)], lab.w), name = nextName(kind === 'flash' ? 'Flash' : 'Event');
    lab.addEvent({name, t, x, light: kind === 'flash'}); o = {kind: 'event', ref: lab.events.at(-1)};
  }
  renderRide(); select(o);
});
$('ride').addEventListener('click', event => {
  const b = event.target.closest('[data-frame]');
  if (!b) return;
  const fr = lab.frames().find(x => x.name === b.dataset.frame);
  setFrame(fr.w, fr.name); renderReadings();
});
$('plates').addEventListener('click', event => { const b = event.target.closest('[data-id]'); if (b) loadRoute(routes.find(r => r.id === b.dataset.id)); });
$('scrub').oninput = event => { lab.T = +event.target.value; setPlaying(false); renderReadings(); draw(); };
$('restart').onclick = () => loadRoute(lab.route);
const toggle = (id, key) => { $(id).onclick = () => { lab.show[key] = !lab.show[key]; $(id).classList.toggle('on', lab.show[key]); $(id).setAttribute('aria-pressed', String(lab.show[key])); draw(); }; };
toggle('t-nows', 'nows'); toggle('t-hyper', 'hyper');
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => { lab.speed = +b.dataset.speed; for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', x === b); };
function setPlaying(on) {
  if (on && lab.route && lab.T >= lab.route.range[1] - 1e-6) lab.T = lab.route.range[0];
  lab.playing = on; $('play').textContent = on ? 'Pause' : 'Play';
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
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
  else if (event.key === 'Escape') select(null);
  else if (/^[1-7]$/.test(event.key)) loadRoute(routes[+event.key - 1]);
  else if (event.key === 'f' || event.key === 'F') { const list = lab.frames(), i = list.findIndex(x => x.name === lab.ride), fr = list[(i + 1) % list.length]; setFrame(fr.w, fr.name); renderReadings(); }
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
  } else if (lab.follow) { const p = lab.bodyNow(lab.follow); if (p) lab.cx = p.xp; }
  if (lab.playing) { lab.T += dt * lab.speed; if (lab.T >= lab.route.range[1]) { lab.T = lab.route.range[1]; setPlaying(false); } }
  draw();
  if (now - lastBoard > 200) { lastBoard = now; renderReadings(); }
  requestAnimationFrame(frame);
}
loadRoute(routes[0]);
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__sr = {
    lab, routes, select,
    load: id => loadRoute(routes.find(r => r.id === id)),
    at: T => { lab.T = T; setPlaying(false); renderReadings(); draw(); return T; },
    ride: name => { const fr = lab.frames().find(x => x.name === name); setFrame(fr.w, fr.name, false); renderReadings(); draw(); return fr; },
    snap: () => ({T: lab.T, w: lab.w, ride: lab.ride, insight: $('insight')?.textContent, log: $('log').textContent.slice(0, 300)}),
  };
}
