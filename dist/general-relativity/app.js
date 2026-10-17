// Curved spacetime: the scene, its layers and the guided tour.
import * as THREE from 'three';
import {createStage, spectrumColor, INK, inkFade} from '../shared/stage.js';
import {$, toast, setPressed, reducedMotion, createTransport, createStory, bindDialog, positionLabel, bindKeys, showTip} from '../shared/shell.js';
import * as gr from './physics.js';
import {steps} from './story.js';

const T_MAX = 60;              // timeline length, in r_s/c
const R_MAX = 14;              // outer edge of the drawn surface, in r_s
const FLASH_INTERVAL = 2;      // clock A flashes every 2 units of its own time
const EMITTED_NM = 470;        // wavelength of A's flashes as A measures it
const STATIC_ANGLE = -0.62;    // A and B sit on one radial line, so flashes travel radially
const FALL_ANGLE = -2.3;       // C falls on the far side, away from A, B and the horizon label
const CLOCK_LIFT = .16;        // clocks sit just above the surface
// Paper palette: clock A burnt orange, B olive, C dark ink; escaping light olive, captured light orange.
const COLOR = {
  a: INK.spot, b: INK.olive, c: INK.dark,
  escape: INK.olive, capture: INK.spot, photon: INK.dark, isco: INK.oliveTint, grid: INK.olive,
};
const CSS = {a: '#c8541f', b: '#56612a', c: '#2f3614', signal: '#8a8c68', photon: '#2f3614'};
/** Spectral colours (the physics of redshift) deepened a little so they read on paper. */
const printed = (nm, target) => spectrumColor(nm, target).multiplyScalar(.82);

const settings = {rA: 2.4, rB: 8, drop: 6};
const layers = {clocks: false, signals: false, light: false, falling: false, landmarks: false};
const narrow = () => innerWidth <= 720;
let blend = 0, targetBlend = 0;

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'), theme: 'paper',
  viewShift: () => {
    if (!narrow()) return [24, 0]; // tour card on the left, readout on the right
    // Phones: centre the scene in the gap between the tour card and the readings.
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 4, maxDistance: 100, minPolarAngle: .08, maxPolarAngle: Math.PI * .49});
const group = {};
for (const name of ['base', 'time', 'isco', ...Object.keys(layers)]) scene.add(group[name] = new THREE.Group());
let iscoOn = true;   // the innermost stable orbit is about matter, so the light-ray step hides it

// In Space view a point sits on Flamm's surface; in Time view its height is coordinate time.
const BOTTOM = -gr.embedding(R_MAX);
const timeY = t => -4 + t * .22;
const surfaceY = r => gr.embedding(Math.max(r, 1)) + BOTTOM;
const blendY = (r, t, lift = 0) => (surfaceY(r) + lift) * (1 - blend) + (timeY(t) + lift) * blend;
const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];
const at = (r, angle, t, lift = 0) => { const [x, z] = polar(r, angle); return [x, blendY(r, t, lift), z]; };

// ---------------------------------------------------------------- the spatial slice
// Everything drawn on the slice rides up to the "now" plane in Time view.
const slice = [];   // {set: (now) => void}
const ring = (r, n = 180) => Array.from({length: n + 1}, (_, j) => [...polar(r, j / n * Math.PI * 2), r]);
const spoke = (angle, r0, r1, n = 100) => Array.from({length: n + 1}, (_, j) => {
  const r = r0 + (r1 - r0) * (j / n) ** 1.5;
  return [...polar(r, angle), r];
});

// Flamm's paraboloid, exactly to scale, as a faint surface and a thin grid.
const surfaceRadii = [], surfaceVertices = [], surfaceIndex = [];
{
  const nr = 90, na = 160;
  for (let i = 0; i <= nr; i++) {
    const r = 1.001 + (R_MAX - 1.001) * (i / nr) ** 1.6;
    for (let j = 0; j <= na; j++) {
      const [x, z] = polar(r, j / na * Math.PI * 2);
      surfaceVertices.push(x, surfaceY(r), z);
      surfaceRadii.push(r);
    }
  }
  for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) {
    const a = i * (na + 1) + j, b = a + na + 1;
    surfaceIndex.push(a, b, a + 1, b, b + 1, a + 1);
  }
}
const surfaceGeometry = new THREE.BufferGeometry();
surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfaceVertices, 3));
surfaceGeometry.setIndex(surfaceIndex);
surfaceGeometry.computeVertexNormals();
const surface = new THREE.Mesh(surfaceGeometry, new THREE.MeshStandardMaterial({
  color: INK.oliveTint, roughness: .95, metalness: 0, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false,
}));
group.base.add(surface);

function thinGrid(lines, color, opacity) {
  const positions = [], radii = [];
  for (const pts of lines) for (let i = 0; i < pts.length - 1; i++) {
    for (const p of [pts[i], pts[i + 1]]) { positions.push(p[0], surfaceY(p[2]), p[1]); radii.push(p[2]); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color, transparent: true, opacity, depthWrite: false}));
  group.base.add(mesh);
  slice.push({set(now) {
    const a = geometry.attributes.position;
    for (let i = 0; i < radii.length; i++) a.array[i * 3 + 1] = blendY(radii[i], now);
    a.needsUpdate = true;
    mesh.material.opacity = opacity * (1 - .45 * blend);
  }});
}
const rings = r => ring(r);
thinGrid(Array.from({length: 13}, (_, i) => rings(2 + i)), COLOR.grid, .34);
thinGrid(Array.from({length: 13}, (_, i) => rings(1.5 + i)), COLOR.grid, .14);
thinGrid(Array.from({length: 16}, (_, i) => spoke(i / 16 * Math.PI * 2, 1.003, R_MAX)), COLOR.grid, .3);
thinGrid(Array.from({length: 64}, (_, i) => spoke(i / 64 * Math.PI * 2, 1.003, R_MAX)).filter((_, i) => i % 4), COLOR.grid, .1);

/** A thick line lying on the slice (rings, paths), recomputed when the slice moves. */
function sliceLine(points, options, lift = 0) {
  const handle = stage.line(options);
  const entry = {points, set(now) {
    handle.set(entry.points.flatMap(([x, z, r]) => [x, blendY(r, now, lift), z]));
  }};
  slice.push(entry);
  return Object.assign(handle, {entry});
}

// The horizon: a solid ink ball where the funnel ends, with an orange ring at its edge.
const horizon = new THREE.Group();
horizon.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({color: INK.dark})));
group.base.add(horizon);
sliceLine(ring(1.003), {color: INK.spot, width: 2.6, opacity: 1, parent: group.base}, .01);
// In Time view the horizon is a surface in spacetime: a cylinder rising with far-away time.
const horizonTube = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), new THREE.MeshBasicMaterial({
  color: INK.dark, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
}));
group.time.add(horizonTube);

// Landmarks.
sliceLine(ring(gr.PHOTON_SPHERE), {color: COLOR.photon, width: 2, opacity: .9, dashed: true, dash: [.22, .16], parent: group.landmarks}, .01);
sliceLine(ring(gr.ISCO), {color: COLOR.isco, width: 1.6, opacity: .6, dashed: true, dash: [.3, .22], parent: group.isco}, .01);

// ---------------------------------------------------------------- clocks
// A small lit clock: a dark puck with a coloured rim and a bead that circles once per unit of its own time.
function makeClock(color, parent) {
  const body = new THREE.Group();
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(.26, .28, .1, 48), new THREE.MeshStandardMaterial({color: INK.paper2, metalness: 0, roughness: .9}));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.29, .028, 12, 64), new THREE.MeshBasicMaterial({color}));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .05;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 8), new THREE.MeshBasicMaterial({color: INK.dark}));
  // A clock hand from the centre to the bead, so each clock reads as a clock face.
  const hand = new THREE.Group(), stick = new THREE.Mesh(new THREE.BoxGeometry(.25, .018, .035), new THREE.MeshBasicMaterial({color: INK.dark}));
  stick.position.x = .125;
  hand.position.y = .06;
  hand.add(stick);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .03, 16), new THREE.MeshBasicMaterial({color}));
  pin.position.y = .065;
  body.add(puck, rim, bead, hand, pin);
  body.scale.setScalar(1.8);
  parent.add(body);
  return {
    body, bead, hand,
    glow: Object.assign(stage.sprite(color, 1.1, parent), {visible: false}),   // no glow on paper
    worldline: stage.line({color, width: 3, parent}),
    ticks: tickMesh(color, parent),
  };
}
function tickMesh(color, parent) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.07, 12, 8),
    new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(.75), transparent: true}), 128);
  mesh.count = 0;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}
const clockA = makeClock(COLOR.a, group.clocks);
const clockB = makeClock(COLOR.b, group.clocks);
const clockC = makeClock(COLOR.c, group.falling);
const fallPath = sliceLine(spoke(FALL_ANGLE, 1, 12, 160), {color: COLOR.c, width: 1.6, opacity: .6, dashed: true, dash: [.25, .18], parent: group.falling}, .02);

function placeClock(clock, [x, y, z], tau, boost = 0) {
  clock.body.position.set(x, y, z);
  clock.glow.position.set(x, y + .05, z);
  const a = -tau * Math.PI * 2;
  clock.bead.position.set(Math.cos(a) * .29, .06, Math.sin(a) * .29);
  clock.hand.rotation.y = -a;
  const tick = Math.exp(-(tau % 1) * 5);
  clock.glow.material.opacity = Math.min(1, .35 + .3 * tick + boost);
  clock.glow.scale.setScalar(1.1 + 1.1 * boost);
}

const matrix = new THREE.Matrix4();
function setTicks(mesh, points) {
  points.slice(0, mesh.instanceMatrix.count).forEach((p, i) => mesh.setMatrixAt(i, matrix.makeTranslation(...p)));
  mesh.count = Math.min(points.length, mesh.instanceMatrix.count);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.material.opacity = blend;
  mesh.visible = blend > .02;
}

/** Events on a static clock's worldline: its ticks every unit of its own time. */
const staticTickEvents = r => Array.from({length: 100}, (_, n) => ({tau: n + 1, t: (n + 1) / gr.rate(r), r}));

function updateStaticClock(clock, r, now, boost) {
  const tau = now * gr.rate(r), [x, z] = polar(r, STATIC_ANGLE);
  placeClock(clock, at(r, STATIC_ANGLE, now, CLOCK_LIFT), tau, boost);
  clock.worldline.set([x, timeY(0), z, x, timeY(now), z]);
  clock.worldline.material.opacity = .95 * blend;
  setTicks(clock.ticks, staticTickEvents(r).filter(e => e.t <= now).map(e => [x, timeY(e.t), z]));
  return tau;
}

let fall = gr.freeFall(settings.drop);
function fallTickEvents() {
  const out = [];
  for (let n = 1; n < fall.tauHorizon; n++) {
    const e = fall.etaAtTau(n);
    out.push({tau: n, t: fall.t(e), r: fall.r(e)});
  }
  return out;
}
let fallTicks = [];
function updateFallingClock(now) {
  const eta = fall.etaAtT(now), r = fall.r(eta), tau = fall.tau(eta);
  placeClock(clockC, at(r, FALL_ANGLE, now, CLOCK_LIFT), tau);
  // Seen from afar its light is ever more redshifted; fade its glow as it nears the horizon.
  clockC.glow.material.opacity *= Math.min(1, .2 + (r - 1) / .4);

  const flat = [], samples = 160;
  for (let i = 0; i <= samples; i++) {
    const t = now * i / samples, [xi, zi] = polar(fall.r(fall.etaAtT(t)), FALL_ANGLE);
    flat.push(xi, timeY(t), zi);
  }
  clockC.worldline.set(flat);
  clockC.worldline.material.opacity = .95 * blend;
  setTicks(clockC.ticks, fallTicks.filter(e => e.t <= now).map(e => { const [xi, zi] = polar(e.r, FALL_ANGLE); return [xi, timeY(e.t), zi]; }));
  fallPath.material.opacity = .6 * (1 - blend);
  return {r, tau};
}

// ---------------------------------------------------------------- signals from A to B
let schedule;
const pulses = Array.from({length: 32}, () => stage.sprite(0xffffff, 1, group.signals));
const signalWorldlines = stage.line({width: 1.6, segments: true, vertexColors: true, additive: true, parent: group.signals});
const signalGuide = stage.line({color: INK.grey, width: 1.2, opacity: .6, dashed: true, dash: [.2, .2], parent: group.signals});
const colorScratch = new THREE.Color();

function updateSignals(now) {
  const {rA, rB} = settings;
  let inFlight = 0, sinceEmit = Infinity, sinceArrive = Infinity;
  const flat = [], colors = [];
  for (const flash of schedule.flashes) {
    if (flash.tEmit > now) break;
    sinceEmit = now - flash.tEmit;
    if (flash.tArrive <= now) sinceArrive = now - flash.tArrive;
    else if (inFlight < pulses.length) {
      const r = gr.signalRadius(rA, rB, now - flash.tEmit), pulse = pulses[inFlight++];
      pulse.visible = true;
      pulse.position.set(...at(r, STATIC_ANGLE, now, .2));
      printed(EMITTED_NM * gr.wavelengthFactor(rA, r), pulse.material.color);
    }
    if (blend > .01) {
      const span = Math.min(now - flash.tEmit, schedule.delay), steps = 20;
      let previous = null;
      for (let j = 0; j <= steps; j++) {
        const s = span * j / steps, r = gr.signalRadius(rA, rB, s), [x, z] = polar(r, STATIC_ANGLE);
        const point = [x, timeY(flash.tEmit + s), z];
        inkFade(printed(EMITTED_NM * gr.wavelengthFactor(rA, r), colorScratch), .85 * blend, colorScratch);
        const c = [colorScratch.r, colorScratch.g, colorScratch.b];
        if (previous) { flat.push(...previous[0], ...point); colors.push(...previous[1], ...c); }
        previous = [point, c];
      }
    }
  }
  for (let i = inFlight; i < pulses.length; i++) pulses[i].visible = false;
  signalWorldlines.set(flat, colors);
  const guide = [];
  for (let j = 0; j <= 60; j++) guide.push(...at(rA + (rB - rA) * j / 60, STATIC_ANGLE, now, .05));
  signalGuide.set(guide);
  signalGuide.material.opacity = .3 * (1 - blend);
  return {
    boostA: layers.signals ? .7 * Math.exp(-sinceEmit * 5) : 0,
    boostB: layers.signals ? .9 * Math.exp(-sinceArrive * 4) : 0,
  };
}

// ---------------------------------------------------------------- light rays
const critical = gr.criticalImpact * (1 + 3e-5);
const IMPACTS = [-6, -4.3, -3.2, -2.3, -1.1, 1.1, 2.2, 2.52, 2.85, 3.7, 5.2, critical];
// Turn the rays so they cross the screen from left to right in the default framing.
const RAY_TURN = .6;
const rays = IMPACTS.map(b => {
  const data = gr.tracePhoton(b, b === critical ? {stepSize: .015} : {});
  const stride = Math.ceil(data.points.length / 700);
  const points = data.points.filter((_, i) => i % stride === 0);
  if (points.at(-1) !== data.points.at(-1)) points.push(data.points.at(-1));
  for (const p of points) { const a = Math.atan2(p.z, p.x) - RAY_TURN; p.wx = p.r * Math.cos(a); p.wz = p.r * Math.sin(a); }
  const isCritical = b === critical;
  const color = new THREE.Color(isCritical ? COLOR.photon : data.outcome === 'captured' ? COLOR.capture : COLOR.escape);
  return {
    data, points, color, isCritical,
    guide: stage.line({color, width: 1, opacity: .08, parent: group.light}),
    trail: stage.line({width: isCritical ? 3 : 2.2, vertexColors: true, additive: true, parent: group.light}),
    head: stage.sprite(color, isCritical ? .95 : .7, group.light),
  };
});

function updateRays(now) {
  for (const ray of rays) {
    const flat = [], colors = [], guide = [];
    for (const p of ray.points) {
      const pos = [p.wx, blendY(p.r, p.t, .04), p.wz];
      guide.push(...pos);
      const age = now - p.t;
      if (age < 0) continue;
      // Fresh light is printed at full strength; older parts of the trail fade towards the paper.
      const k = Math.min(1, (ray.isCritical ? 1.2 : 1) * (.62 + .15 * blend + .4 * Math.exp(-age / 2.5)));
      flat.push(...pos);
      inkFade(ray.color, k, colorScratch);
      colors.push(colorScratch.r, colorScratch.g, colorScratch.b);
    }
    ray.guide.set(guide);
    ray.guide.material.opacity = .14 * (1 - blend) + .08 * blend;
    ray.trail.set(flat, colors);
    const p = gr.sampleAt(ray.data.points, now);
    ray.head.visible = !!p;
    if (p) {
      const a = Math.atan2(p.z, p.x) - RAY_TURN;
      ray.head.position.set(p.r * Math.cos(a), blendY(p.r, now, .06), p.r * Math.sin(a));
      ray.head.material.opacity = p.r < 1.1 ? (p.r - 1.015) / .085 : 1;
    }
  }
}

// ---------------------------------------------------------------- time axis (Time view)
const AXIS_ANGLE = FALL_ANGLE - .42, AXIS_R = 6.2;   // to the right of C in Time view
const timeAxis = stage.line({color: INK.dark, width: 1.4, opacity: .7, parent: group.time});
const axisTicks = stage.line({color: INK.dark, width: 1.4, opacity: .7, segments: true, parent: group.time});
function updateTimeAxis(now) {
  const [x, z] = polar(AXIS_R, AXIS_ANGLE), [dx, dz] = polar(.35, AXIS_ANGLE);
  timeAxis.set([x, timeY(0), z, x, timeY(Math.max(now, .01)), z]);
  const flat = [];
  for (let t = 10; t <= now; t += 10) flat.push(x, timeY(t), z, x + dx, timeY(t), z + dz);
  axisTicks.set(flat);
  timeAxis.material.opacity = axisTicks.material.opacity = .7 * blend;
  group.time.visible = blend > .02;
}

// ---------------------------------------------------------------- labels, readout, markers
const labelPoint = new THREE.Vector3();
const pool = {};
function poolLabel(kind, i) {
  pool[kind] ??= [];
  let el = pool[kind][i];
  if (!el) {
    el = document.createElement('div');
    el.className = `scene-label ${kind}`;
    el.innerHTML = '<div class="tag"><span class="name"></span></div>';
    $('dynamic-labels').append(el);
    pool[kind][i] = el;
  }
  return el;
}

function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  const pin = (el, p, show = true) => positionLabel(el, labelPoint.set(...p), camera, {show, avoid: rects});
  const above = clock => [clock.body.position.x, clock.body.position.y + .25, clock.body.position.z];
  pin($('label-a'), above(clockA), layers.clocks);
  pin($('label-b'), above(clockB), layers.clocks);
  pin($('label-c'), above(clockC), layers.falling);
  $('label-a-tau').textContent = `${state.tauA.toFixed(1)} τ`;
  $('label-b-tau').textContent = `${state.tauB.toFixed(1)} τ`;
  $('label-c-tau').textContent = `${state.fall.tau.toFixed(1)} τ`;
  const front = Math.atan2(camera.position.z - anchor.z, camera.position.x - anchor.x);
  // In Space view the horizon label sits on the rim; in Time view, at the top of the horizon tube.
  $('label-horizon-text').textContent = blend < .5 ? 'Event horizon · 1 rₛ' : 'Event horizon, through time';
  const [hx, hz] = polar(1.02, front);
  pin($('label-horizon'), blend < .5 ? at(1.02, front, state.now, .02) : [hx, timeY(state.now * .45), hz], blend < .5 || layers.falling);
  pin($('label-photon'), at(gr.PHOTON_SPHERE, front + Math.PI, state.now, .02), layers.landmarks && blend < .5);
  pin($('label-isco'), at(gr.ISCO, front - Math.PI / 2, state.now, .02), layers.landmarks && iscoOn && blend < .5);

  // Time view: own-time labels every 10 on the static clocks.
  let n = 0;
  if (blend > .6 && layers.clocks) {
    for (const [r, color] of [[settings.rA, CSS.a], [settings.rB, CSS.b]]) {
      const [x, z] = polar(r, STATIC_ANGLE);
      for (let tau = 10; tau / gr.rate(r) <= state.now; tau += 10) {
        const el = poolLabel('tick', n++), name = el.querySelector('.name');
        name.textContent = `${tau} τ`;
        name.style.color = color;
        pin(el, [x, timeY(tau / gr.rate(r)), z]);
      }
    }
  }
  for (const el of (pool.tick ?? []).slice(n)) el.style.visibility = 'hidden';

  // Time view: the far-away time axis.
  let m = 0;
  if (blend > .6) {
    const [x, z] = polar(AXIS_R, AXIS_ANGLE);
    for (let t = 10; t <= state.now; t += 10) {
      const el = poolLabel('axis-tick', m++);
      el.querySelector('.name').textContent = `t = ${t}`;
      pin(el, [x, timeY(t), z]);
    }
    const el = poolLabel('axis-title', 0);
    el.querySelector('.name').textContent = 'far-away time ↑';
    pin(el, [x, timeY(state.now) + .9, z]);
  } else if (pool['axis-title']) pool['axis-title'][0].style.visibility = 'hidden';
  for (const el of (pool['axis-tick'] ?? []).slice(m)) el.style.visibility = 'hidden';
}

function updateReadout() {
  const {rA, rB} = settings;
  $('row-a').hidden = $('row-b').hidden = !layers.clocks;
  $('row-c').hidden = !layers.falling;
  $('readout').hidden = !layers.clocks && !layers.falling;
  $('far-tau').textContent = `${state.now.toFixed(2)} τ`;
  $('a-where').textContent = `held at ${rA.toFixed(1)} rₛ`;
  $('b-where').textContent = `held at ${rB.toFixed(1)} rₛ`;
  $('a-tau').textContent = `${state.tauA.toFixed(2)} τ`;
  $('b-tau').textContent = `${state.tauB.toFixed(2)} τ`;
  const behind = state.tauB - state.tauA;
  $('a-sub').textContent = `runs at ${(gr.rate(rA) * 100).toFixed(1)}% of the far-away rate${behind > .05 ? ` · ${Math.abs(behind).toFixed(2)} τ ${behind > 0 ? 'behind' : 'ahead of'} B` : ''}`;
  if (layers.signals) {
    const received = EMITTED_NM * gr.wavelengthFactor(rA, rB);
    const key = `${received.toFixed(0)}|${schedule.receivedInterval.toFixed(2)}`;
    if ($('b-sub').dataset.key !== key) {
      $('b-sub').dataset.key = key;
      const hex = nm => `#${spectrumColor(nm, colorScratch).getHexString()}`;
      $('b-sub').innerHTML = `A’s flashes: sent every ${FLASH_INTERVAL} τ <i class="swatch" style="--c:${hex(EMITTED_NM)}"></i> ${EMITTED_NM} nm, arrive every ${schedule.receivedInterval.toFixed(2)} τ <i class="swatch" style="--c:${hex(received)}"></i> ${received.toFixed(0)} nm`;
    }
  } else {
    delete $('b-sub').dataset.key;
    $('b-sub').textContent = `runs at ${(gr.rate(rB) * 100).toFixed(1)}% of the far-away rate`;
  }
  // Bars: time lived by each clock, as a share of far-away time.
  const share = (tau, rate) => state.now > .01 ? tau / state.now : rate;
  $('bar-far').style.width = '100%';
  $('bar-a').style.width = `${share(state.tauA, gr.rate(rA)) * 100}%`;
  $('bar-b').style.width = `${share(state.tauB, gr.rate(rB)) * 100}%`;
  $('bar-c').style.width = `${Math.min(1, share(state.fall.tau, 1)) * 100}%`;
  const r = state.fall.r;
  $('c-where').textContent = r < 1.001 ? 'at the horizon' : `falling · now ${r.toFixed(r < 1.1 ? 3 : 1)} rₛ`;
  $('c-tau').textContent = `${state.fall.tau.toFixed(2)} τ`;
  $('c-sub').textContent = r < 1.05
    ? `seen from afar, frozen at the horizon; its own clock reaches ${fall.tauHorizon.toFixed(1)} τ there`
    : `dropped from ${settings.drop.toFixed(1)} rₛ; reaches the horizon at ${fall.tauHorizon.toFixed(1)} τ of its own time`;

  const marks = [];
  if (layers.signals && schedule.flashes.length) marks.push({t: schedule.flashes[0].tArrive, label: 'first flash at B', color: CSS.signal});
  if (layers.falling) {
    // Far-away time when C is within 1% of the horizon: from here on it looks frozen.
    const eta = Math.acos(2 * 1.01 / settings.drop - 1);
    if (Number.isFinite(eta)) marks.push({t: fall.t(eta), label: 'C freezes', color: CSS.c});
  }
  if (layers.light) marks.push({t: rays.at(-1).data.points.at(-1).t, label: 'dark ray escapes', color: CSS.photon});
  transport.setMarkers(marks);
}

// ---------------------------------------------------------------- event inspector (Time view)
function candidates() {
  const list = [];
  if (layers.clocks) {
    for (const [name, r] of [['A', settings.rA], ['B', settings.rB]]) {
      for (const e of staticTickEvents(r)) if (e.t <= state.now) list.push({...e, angle: STATIC_ANGLE, title: `Clock ${name} reads ${e.tau} τ`, kind: 'static'});
    }
  }
  if (layers.falling) for (const e of fallTicks) if (e.t <= state.now) list.push({...e, angle: FALL_ANGLE, title: `Clock C reads ${e.tau} τ`, kind: 'fall'});
  if (layers.signals) {
    for (const f of schedule.flashes) {
      if (f.tArrive <= state.now) list.push({t: f.tArrive, r: settings.rB, angle: STATIC_ANGLE, title: `Flash ${f.n + 1} reaches B`, kind: 'arrive', f});
      if (f.tEmit <= state.now) list.push({t: f.tEmit, r: settings.rA, angle: STATIC_ANGLE, title: `Flash ${f.n + 1} leaves A`, kind: 'emit', f});
    }
  }
  return list;
}
const projected = new THREE.Vector3();
function pick(clientX, clientY) {
  if (blend < .6) return null;
  let best = null, bestD = narrow() ? 22 : 16;
  for (const k of candidates()) {
    const [x, z] = polar(k.r, k.angle);
    projected.set(x, timeY(k.t), z).project(camera);
    if (projected.z > 1) continue;
    const d = Math.hypot((projected.x * .5 + .5) * innerWidth - clientX, (-projected.y * .5 + .5) * innerHeight - clientY);
    if (d < bestD) { bestD = d; best = {...k, pos: [x, timeY(k.t), z]}; }
  }
  return best;
}
const fmt = x => x.toFixed(2);
function describe(k) {
  const rows = [`<div class="row"><span>Far-away time</span><span>t = ${fmt(k.t)} rₛ/c</span></div>`,
    `<div class="row"><span>Height</span><span>r = ${fmt(k.r)} rₛ</span></div>`];
  let note = '';
  if (k.kind === 'static') note = `Held still here, this clock runs at ${(gr.rate(k.r) * 100).toFixed(1)}% of the far-away rate.`;
  if (k.kind === 'fall') note = `Falling from ${fmt(settings.drop)} rₛ. Its own time to the horizon is ${fmt(fall.tauHorizon)} τ, but far-away time to get there is infinite.`;
  if (k.kind === 'emit') note = `Sent when A reads ${fmt(k.f.tauEmit)} τ. It takes ${fmt(schedule.delay)} rₛ/c of far-away time to climb to B.`;
  if (k.kind === 'arrive') note = `Arrives when B reads ${fmt(k.f.tauArrive)} τ. Flashes leave A every ${FLASH_INTERVAL} τ and arrive every ${fmt(schedule.receivedInterval)} τ of B’s time.`;
  return `<h4>${k.title}</h4>${rows.join('')}<div class="note">${note}</div>`;
}
const hover = stage.sprite(INK.spot, 1, scene, {opacity: 0});
function inspect(x, y) {
  const k = pick(x, y);
  $('scene').classList.toggle('pointing', !!k);
  showTip(x, y, k && describe(k));
  hover.material.opacity = k ? .9 : 0;
  if (k) hover.position.set(...k.pos);
}
let downAt = null;
$('scene').addEventListener('pointermove', event => { if (event.pointerType === 'mouse' && !event.buttons) inspect(event.clientX, event.clientY); });
$('scene').addEventListener('pointerdown', event => { downAt = [event.clientX, event.clientY]; });
$('scene').addEventListener('pointerup', event => {
  if (downAt && Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) < 6) inspect(event.clientX, event.clientY);
});
$('scene').addEventListener('pointerleave', () => { showTip(0, 0, null); hover.material.opacity = 0; });

// ---------------------------------------------------------------- per-frame update
const state = {now: 0, tauA: 0, tauB: 0, fall: {r: settings.drop, tau: 0}};
let last = {now: -1, blend: -1, version: -1}, version = 0;
function update(now) {
  const changed = now !== last.now || blend !== last.blend || version !== last.version;
  if (!changed) return;
  last = {now, blend, version};
  for (const s of slice) s.set(now);
  const a = surface.geometry.attributes.position;
  for (let i = 0; i < surfaceRadii.length; i++) a.array[i * 3 + 1] = blendY(surfaceRadii[i], now);
  a.needsUpdate = true;
  surface.material.opacity = .32 * (1 - blend);
  horizon.position.y = blendY(1, now) - .02;
  horizon.scale.set(1, 1 - .92 * blend, 1);
  horizonTube.scale.set(1, Math.max(.001, timeY(now) - timeY(0)), 1);
  horizonTube.position.y = (timeY(now) + timeY(0)) / 2;
  horizonTube.material.opacity = .06 * blend;
  horizonTube.visible = blend > .02;

  const boosts = updateSignals(now);
  state.now = now;
  state.tauA = updateStaticClock(clockA, settings.rA, now, boosts.boostA);
  state.tauB = updateStaticClock(clockB, settings.rB, now, boosts.boostB);
  state.fall = updateFallingClock(now);
  if (layers.light) updateRays(now);
  updateTimeAxis(now);
}

// ---------------------------------------------------------------- camera
// The camera orbits an anchor; each framing sets the anchor and the offset from it.
// Phones look along A and B's radial line from the far side, so A and B stack upward on a portrait screen.
const PHONE_AZ = STATIC_ANGLE + Math.PI, PHONE_CENTRE = polar(3, STATIC_ANGLE);
// Time view looks along the line halfway between A and B's direction and C's, so both worldlines stand in front of the horizon.
const TIME_AZ = (STATIC_ANGLE + FALL_ANGLE) / 2;
const offsetAt = (az, d, h) => [d * Math.cos(az), h, d * Math.sin(az)];
const FRAMING = {
  wide: () => narrow()
    ? {anchor: [PHONE_CENTRE[0] * 1.3, -4, PHONE_CENTRE[1] * 1.3], offset: offsetAt(PHONE_AZ, 38, 26)}
    : {anchor: [0, -2, 0], offset: offsetAt(.97, 26.6, 16)},
  close: () => narrow()
    ? {anchor: [0, -5.6, 0], offset: offsetAt(PHONE_AZ, 17, 12.6)}
    : {anchor: [0, -5.6, 0], offset: offsetAt(.99, 16.1, 8.2)},
  follow: () => ({anchor: null, offset: narrow() ? offsetAt(FALL_ANGLE + Math.PI + .6, 13, 9) : offsetAt(FALL_ANGLE + Math.PI + .9, 9.5, 5.5)}),
  time: () => narrow()
    ? {anchor: [0, .6, 0], offset: offsetAt(TIME_AZ, 50, 9)}
    : {anchor: [0, 2.6, 0], offset: offsetAt(TIME_AZ, 31.6, 4)},
};
let framing = 'wide', spaceFraming = 'wide', offsetTween = null;
const anchor = new THREE.Vector3(), anchorGoal = new THREE.Vector3(), offset = new THREE.Vector3();
function computeAnchorGoal() {
  const f = FRAMING[framing]();
  if (f.anchor) return anchorGoal.set(...f.anchor);
  // Follow C, and look a little towards the hole so the horizon stays in view.
  const p = clockC.body.position;
  return anchorGoal.set(p.x * .6, p.y - .5, p.z * .6);
}
function setFraming(name, animate = true) {
  framing = name;
  const to = new THREE.Vector3(...FRAMING[name]().offset);
  if (animate && !reducedMotion) offsetTween = {from: offset.clone(), to, u: 0};
  else { offset.copy(to); offsetTween = null; }
}
controls.addEventListener('start', () => { offsetTween = null; });

// ---------------------------------------------------------------- controls
function applyLayers(next) {
  if (next) for (const key of Object.keys(layers)) layers[key] = !!next[key];
  for (const [key, on] of Object.entries(layers)) group[key].visible = on;
  group.isco.visible = layers.landmarks && iscoOn;
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
  version++;
}

function setView(isTime, announce = false) {
  targetBlend = isTime ? 1 : 0;
  if (reducedMotion) blend = targetBlend;
  setPressed($('view-space'), !isTime);
  setPressed($('view-time'), isTime);
  $('view-note').textContent = isTime ? 'Time view · tap a tick to inspect it' : 'Space view · curved space, drawn to scale';
  if (announce) {
    toast(isTime ? 'Time runs upward. Tick marks are equal steps of each clock’s own time.'
      : 'The surface’s depth shows how space is curved, not time.');
    setFraming(isTime ? 'time' : spaceFraming);
  }
}

function rebuild() {
  schedule = gr.signalSchedule(settings.rA, settings.rB, {interval: FLASH_INTERVAL, tMax: T_MAX});
  fall = gr.freeFall(settings.drop);
  fallTicks = fallTickEvents();
  // Only the part of C's path below its release point is drawn.
  fallPath.entry.points = spoke(FALL_ANGLE, 1, settings.drop, 120);
  $('out-a').textContent = `${settings.rA.toFixed(1)} rₛ`;
  $('out-b').textContent = `${settings.rB.toFixed(1)} rₛ`;
  $('out-c').textContent = `${settings.drop.toFixed(1)} rₛ`;
  for (const [id, key] of [['radius-a', 'rA'], ['radius-b', 'rB'], ['radius-c', 'drop']]) {
    const input = $(id);
    input.value = settings[key];
    input.style.setProperty('--progress', `${(settings[key] - input.min) / (input.max - input.min) * 100}%`);
  }
  version++;
}

const transport = createTransport({max: T_MAX, speed: 2});

$('view-space').onclick = () => setView(false, true);
$('view-time').onclick = () => setView(true, true);
$('reset-camera').onclick = () => setFraming(targetBlend > .5 ? 'time' : spaceFraming);
for (const chip of document.querySelectorAll('.chip')) {
  chip.onclick = () => { layers[chip.dataset.layer] = !layers[chip.dataset.layer]; applyLayers(); };
}
// Heights change live, without restarting the run.
for (const [id, key] of [['radius-a', 'rA'], ['radius-b', 'rB'], ['radius-c', 'drop']]) {
  $(id).addEventListener('input', event => {
    settings[key] = +event.target.value;
    const layer = key === 'drop' ? 'falling' : 'clocks';
    if (!layers[layer]) applyLayers({...layers, [layer]: true});
    rebuild();
  });
}
function showPanel(open) {
  $('panel').classList.toggle('sheet-closed', !open);
  $('panel-toggle').setAttribute('aria-expanded', String(open));
}
$('panel-toggle').onclick = () => showPanel($('panel').classList.contains('sheet-closed'));
bindDialog($('notes'), $('about'), () => transport.setPlaying(false));
stage.onContextLost = () => transport.setPlaying(false);
const toggleView = () => setView(targetBlend < .5, true);
bindKeys({
  ' ': () => transport.toggle(),
  ArrowRight: () => transport.nudge(1),
  ArrowLeft: () => transport.nudge(-1),
  t: toggleView, T: toggleView,
  r: () => transport.restart(), R: () => transport.restart(),
});

const story = createStory({
  steps,
  onEnter(step, index) {
    spaceFraming = step.camera ?? 'wide';
    iscoOn = step.isco ?? true;
    setView(step.view === 'time');
    applyLayers(step.layers);
    showPanel(index === steps.length - 1 && !narrow());
    setFraming(step.view === 'time' ? 'time' : spaceFraming);
    showTip(0, 0, null);
    transport.restart();
  },
});

rebuild();
update(0);
offset.set(...FRAMING.wide().offset);
anchor.copy(computeAnchorGoal());
controls.target.copy(anchor);
camera.position.copy(anchor).add(offset);
controls.update();
story.show(0);
new ResizeObserver(() => stage.resize()).observe($('story'));
new ResizeObserver(() => stage.resize()).observe($('readout'));
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--dock-h', `${$('transport').offsetHeight}px`);
  stage.resize();
}).observe($('transport'));

const UP = new THREE.Vector3(0, 1, 0), faceDir = new THREE.Vector3(), faceQuat = new THREE.Quaternion(), IDENTITY = new THREE.Quaternion();
let lastFrame = performance.now();
function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((time - lastFrame) / 1000, .08));
  lastFrame = time;
  if (!document.hidden) transport.tick(dt);
  if (blend !== targetBlend) {
    blend += (targetBlend - blend) * Math.min(1, dt * 3.5);
    if (Math.abs(blend - targetBlend) < 1e-3) blend = targetBlend;
  }
  update(transport.t);

  controls.update();
  offset.copy(camera.position).sub(controls.target);
  if (offsetTween) {
    offsetTween.u = Math.min(1, offsetTween.u + dt / 1.3);
    const k = offsetTween.u < .5 ? 2 * offsetTween.u ** 2 : 1 - (-2 * offsetTween.u + 2) ** 2 / 2;
    offset.lerpVectors(offsetTween.from, offsetTween.to, k);
    if (offsetTween.u === 1) offsetTween = null;
  }
  anchor.lerp(computeAnchorGoal(), reducedMotion ? 1 : Math.min(1, dt * 4));
  // Tilt each clock face most of the way towards the camera, so it reads as a dial.
  for (const clock of [clockA, clockB, clockC]) {
    faceDir.copy(camera.position).sub(clock.body.position).normalize();
    faceQuat.setFromUnitVectors(UP, faceDir);
    clock.body.quaternion.copy(IDENTITY).slerp(faceQuat, .7);
    clock.body.scale.setScalar(1.8 - .9 * blend);   // smaller in Time view, where the worldlines matter
  }
  controls.target.copy(anchor);
  camera.position.copy(anchor).add(offset);
  stage.setFogFor(offset.length());

  updateReadout();
  updateLabels();
  stage.render();
}
requestAnimationFrame(frame);

// With ?debug in the URL, expose hooks for checks: jump to a time and finish camera moves at once.
if (new URLSearchParams(location.search).has('debug')) {
  window.__gr = {
    settings, story,
    at(t) { const s = $('scrub'); s.value = t; s.dispatchEvent(new Event('input')); },
    snap() { if (offsetTween) offsetTween.u = .999; blend = targetBlend; anchor.copy(computeAnchorGoal()); },
  };
}
