// Curved spacetime: the scene, its layers and the guided tour.
import * as THREE from 'three';
import {createStage, addStarfield, setPoints, spectrumColor} from '../shared/scene.js';
import {$, toast, setPressed, reducedMotion, createTransport, createStory, bindDialog, positionLabel} from '../shared/shell.js';
import * as gr from './physics.js';
import {steps} from './story.js';

const T_MAX = 60;              // timeline length, in r_s/c
const R_MAX = 14;              // outer edge of the drawn surface, in r_s
const FLASH_INTERVAL = 2;      // clock A flashes every 2 units of its own time
const EMITTED_NM = 470;        // wavelength of A's flashes as A measures it
const STATIC_ANGLE = -0.62;    // A and B sit on one radial line, so flashes travel radially
const FALL_ANGLE = -2.3;       // C falls on the far side, away from A, B and the horizon label
const COLOR = {
  a: 0xf0bd86, b: 0x9fe3ef, c: 0xf4a3c8,
  escape: 0xcdefff, capture: 0xff9b73, photon: 0xc9b8ff, isco: 0x9cc3dd, grid: 0x7d9cb6,
};

const settings = {rA: 2.4, rB: 8, drop: 6};
const layers = {clocks: false, signals: false, light: false, falling: false, landmarks: false};
const narrow = () => innerWidth <= 720;
let blend = 0, targetBlend = 0, needsUpdate = true;

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'),
  viewShift: () => {
    if (!narrow()) return [24, 0]; // tour card on the left, readout on the right
    // Phones: centre the scene in the gap between the tour card and the readings.
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 5, maxDistance: 90, minPolarAngle: .1, maxPolarAngle: Math.PI * .49});
addStarfield(scene);
const group = {};
for (const name of ['base', ...Object.keys(layers)]) scene.add(group[name] = new THREE.Group());

// In Space view a point sits on Flamm's surface; in Time view its height is coordinate time.
const BOTTOM = -gr.embedding(R_MAX);
const timeY = t => -4 + t * .22;
const surfaceY = r => gr.embedding(Math.max(r, 1)) + BOTTOM;
const blendY = (r, t, lift = 0) => (surfaceY(r) + lift) * (1 - blend) + (timeY(t) + lift) * blend;
const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];

// Camera framings: the whole scene, or close in on the photon sphere and horizon.
const orbit = (azimuth, distance, height, targetY, [cx, cz] = [0, 0]) => ({
  position: [cx + distance * Math.cos(azimuth), height, cz + distance * Math.sin(azimuth)], target: [cx, targetY, cz],
});
const PHONE_CENTRE = polar(3, STATIC_ANGLE); // between the hole and clock B
// Phones look along A and B's radial line from the far side, so A and B stack upward on a portrait screen.
// Time-view heights are given before the Time-view lift of 3.5.
const FRAMING = {
  wide: () => narrow() ? orbit(STATIC_ANGLE + Math.PI, 31, 19, -4.5, PHONE_CENTRE) : orbit(.97, 26.6, 14, -2),
  close: () => narrow() ? orbit(STATIC_ANGLE + Math.PI, 17, 7, -5.6) : orbit(.99, 16.1, 2.6, -5.6),
  time: () => narrow() ? orbit(STATIC_ANGLE + Math.PI - 1.1, 40, 8, -1.5) : orbit(.965, 31.6, 2.5, -1.5),
};
let framing = 'wide', cameraTween = null;
function home(name = framing, animate = false) {
  framing = name;
  const {position, target} = FRAMING[name](), lift = blend * 3.5;
  const to = {position: new THREE.Vector3(position[0], position[1] + lift, position[2]), target: new THREE.Vector3(target[0], target[1] + lift, target[2])};
  if (animate && !reducedMotion) {
    cameraTween = {from: {position: camera.position.clone(), target: controls.target.clone()}, to, u: 0};
  } else {
    cameraTween = null;
    camera.position.copy(to.position);
    controls.target.copy(to.target);
    controls.update();
  }
}
function stepCameraTween(dt) {
  if (!cameraTween) return;
  cameraTween.u = Math.min(1, cameraTween.u + dt / 1.2);
  const e = cameraTween.u < .5 ? 2 * cameraTween.u ** 2 : 1 - (-2 * cameraTween.u + 2) ** 2 / 2;
  camera.position.lerpVectors(cameraTween.from.position, cameraTween.to.position, e);
  controls.target.lerpVectors(cameraTween.from.target, cameraTween.to.target, e);
  if (cameraTween.u === 1) cameraTween = null;
}
controls.addEventListener('start', () => { cameraTween = null; });

// ---------------------------------------------------------------- the spatial slice
// Lines drawn on the slice. In Time view they all ride up to the "now" plane.
const sliceLines = [];
function sliceLine(points, color, opacity, {parent = group.base, dashed = false} = {}) {
  const positions = new Float32Array(points.length * 3);
  points.forEach(([x, z, r], i) => positions.set([x, surfaceY(r), z], i * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const options = {color, transparent: true, opacity, depthWrite: false};
  const line = new THREE.Line(geometry, dashed
    ? new THREE.LineDashedMaterial({...options, dashSize: .2, gapSize: .16})
    : new THREE.LineBasicMaterial(options));
  if (dashed) line.computeLineDistances();
  line.frustumCulled = false;
  parent.add(line);
  sliceLines.push({line, radii: points.map(p => p[2]), opacity});
  return line;
}
const ring = (r, n = 180) => Array.from({length: n + 1}, (_, j) => [...polar(r, j / n * Math.PI * 2), r]);
const spoke = (angle, r0, r1, n = 100) => Array.from({length: n + 1}, (_, j) => {
  const r = r0 + (r1 - r0) * (j / n) ** 1.5;
  return [...polar(r, angle), r];
});

// Flamm's paraboloid, exactly to scale.
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
const surface = new THREE.Mesh(surfaceGeometry, new THREE.MeshBasicMaterial({
  color: 0x8bbed2, transparent: true, opacity: .035, side: THREE.DoubleSide, depthWrite: false,
}));
group.base.add(surface);

for (let r = 1.5; r <= R_MAX; r += .5) sliceLine(ring(r), COLOR.grid, r % 1 === 0 ? .3 : .13);
for (let i = 0; i < 64; i++) sliceLine(spoke(i / 64 * Math.PI * 2, 1.003, R_MAX), COLOR.grid, i % 4 ? .1 : .26);

// The horizon: a dark aperture with a bright rim, not an accretion disc.
const aperture = new THREE.Mesh(new THREE.CircleGeometry(1, 120), new THREE.MeshBasicMaterial({
  color: 0x010204, side: THREE.DoubleSide, transparent: true,
}));
aperture.rotation.x = -Math.PI / 2;
group.base.add(aperture);
sliceLine(ring(1.003), 0xd6e3ee, .7);

// Landmarks.
sliceLine(ring(gr.PHOTON_SPHERE), COLOR.photon, .8, {parent: group.landmarks, dashed: true});
sliceLine(ring(gr.ISCO), COLOR.isco, .5, {parent: group.landmarks, dashed: true});

// ---------------------------------------------------------------- clocks
function makeClock(color, parent) {
  const marker = new THREE.Group();
  const face = new THREE.Mesh(new THREE.RingGeometry(.26, .32, 64), new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide, transparent: true, opacity: .95, depthWrite: false,
  }));
  face.rotation.x = -Math.PI / 2;
  const hand = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .01, 0), new THREE.Vector3(.22, .01, 0)]),
    new THREE.LineBasicMaterial({color}));
  marker.add(face, hand);
  parent.add(marker);
  return {
    marker, hand,
    glow: stage.sprite(color, 1.1, parent),
    worldline: stage.dynamicLine(240, color, 0, {parent}),
    ticks: stage.dynamicLine(600, color, 0, {parent, segments: true}),
  };
}
const clockA = makeClock(COLOR.a, group.clocks);
const clockB = makeClock(COLOR.b, group.clocks);
const clockC = makeClock(COLOR.c, group.falling);
const fallPath = sliceLine(spoke(FALL_ANGLE, 1, 12, 160), COLOR.c, .45, {parent: group.falling, dashed: true});
const fallPathRadii = sliceLines.at(-1).radii;

function placeClock(clock, x, y, z, tau, boost = 0) {
  clock.marker.position.set(x, y, z);
  clock.glow.position.set(x, y, z);
  clock.hand.rotation.y = -tau * Math.PI;
  const tick = Math.exp(-(tau % 1) * 5);
  clock.glow.material.opacity = Math.min(1, .45 + .3 * tick + boost);
  clock.glow.scale.setScalar(1.1 + .9 * boost);
}

function tickMarks(x, z, times) {
  const flat = [];
  for (const t of times) { const y = timeY(t); flat.push(x - .17, y, z, x + .17, y, z); }
  return flat;
}

function updateStaticClock(clock, r, now, boost) {
  const [x, z] = polar(r, STATIC_ANGLE), tau = now * gr.rate(r);
  placeClock(clock, x, blendY(r, now, .14), z, tau, boost);
  setPoints(clock.worldline, [x, timeY(0), z, x, timeY(now), z]);
  clock.worldline.material.opacity = .8 * blend;
  const times = [];
  for (let n = 0; n <= tau; n++) times.push(n / gr.rate(r));
  setPoints(clock.ticks, tickMarks(x, z, times));
  clock.ticks.material.opacity = .85 * blend;
  return tau;
}

let fall = gr.freeFall(settings.drop);
function updateFallingClock(now) {
  const eta = fall.etaAtT(now), r = fall.r(eta), tau = fall.tau(eta);
  const [x, z] = polar(r, FALL_ANGLE);
  placeClock(clockC, x, blendY(r, now, .14), z, tau);
  // Seen from afar its light is ever more redshifted; fade the glow as it nears the horizon.
  clockC.glow.material.opacity *= Math.min(1, .25 + (r - 1) / .4);

  const flat = [], samples = 160;
  for (let i = 0; i <= samples; i++) {
    const t = now * i / samples, ri = fall.r(fall.etaAtT(t)), [xi, zi] = polar(ri, FALL_ANGLE);
    flat.push(xi, timeY(t), zi);
  }
  setPoints(clockC.worldline, flat);
  clockC.worldline.material.opacity = .85 * blend;

  const ticks = [];
  for (let n = 1; n < fall.tauHorizon; n++) {
    const e = fall.etaAtTau(n), t = fall.t(e);
    if (t > now) break;
    const [xi, zi] = polar(fall.r(e), FALL_ANGLE), y = timeY(t);
    ticks.push(xi - .17, y, zi, xi + .17, y, zi);
  }
  setPoints(clockC.ticks, ticks);
  clockC.ticks.material.opacity = .9 * blend;

  let shown = 0;
  while (shown < fallPathRadii.length && fallPathRadii[shown] <= settings.drop) shown++;
  fallPath.geometry.setDrawRange(0, shown);
  fallPath.material.opacity = .45 * (1 - blend);
  return {r, tau, x, z};
}

// ---------------------------------------------------------------- signals from A to B
let schedule;
const pulses = Array.from({length: 32}, () => stage.sprite(0xffffff, .95, group.signals));
const signalWorldlines = stage.dynamicLine(32 * 25 * 2, 0xffffff, 0, {parent: group.signals, segments: true, vertexColors: true, additive: true});
const signalGuide = stage.dynamicLine(80, 0x8fb6ff, .22, {parent: group.signals});
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
      const r = gr.signalRadius(rA, rB, now - flash.tEmit), [x, z] = polar(r, STATIC_ANGLE), pulse = pulses[inFlight++];
      pulse.visible = true;
      pulse.position.set(x, blendY(r, now, .16), z);
      spectrumColor(EMITTED_NM * gr.wavelengthFactor(rA, r), pulse.material.color);
    }
    if (blend > .01) {
      const span = Math.min(now - flash.tEmit, schedule.delay), steps = 24;
      let previous = null;
      for (let j = 0; j <= steps; j++) {
        const s = span * j / steps, r = gr.signalRadius(rA, rB, s), [x, z] = polar(r, STATIC_ANGLE);
        const point = [x, timeY(flash.tEmit + s), z];
        spectrumColor(EMITTED_NM * gr.wavelengthFactor(rA, r), colorScratch);
        const c = [colorScratch.r * blend, colorScratch.g * blend, colorScratch.b * blend];
        if (previous) flat.push(...previous[0], ...point), colors.push(...previous[1], ...c);
        previous = [point, c];
      }
    }
  }
  for (let i = inFlight; i < pulses.length; i++) pulses[i].visible = false;
  setPoints(signalWorldlines, flat, colors);
  signalWorldlines.material.opacity = .9;

  const guide = [];
  for (let j = 0; j <= 60; j++) {
    const r = rA + (rB - rA) * j / 60, [x, z] = polar(r, STATIC_ANGLE);
    guide.push(x, blendY(r, now, .05), z);
  }
  setPoints(signalGuide, guide);
  signalGuide.material.opacity = .22 * (1 - blend);
  return {
    boostA: layers.signals ? .7 * Math.exp(-sinceEmit * 5) : 0,
    boostB: layers.signals ? .9 * Math.exp(-sinceArrive * 4) : 0,
  };
}

// ---------------------------------------------------------------- light rays
const critical = gr.criticalImpact * (1 + 3e-5);
const IMPACTS = [-6, -4.3, -3.2, -2.3, -1.1, 1.1, 2.2, 2.52, 2.85, 3.7, 5.2, critical];
const rays = IMPACTS.map(b => {
  const data = gr.tracePhoton(b, b === critical ? {stepSize: .015} : {});
  const stride = Math.ceil(data.points.length / 900);
  const points = data.points.filter((_, i) => i % stride === 0);
  if (points.at(-1) !== data.points.at(-1)) points.push(data.points.at(-1));
  const color = new THREE.Color(b === critical ? COLOR.photon : data.outcome === 'captured' ? COLOR.capture : COLOR.escape);
  const guide = stage.dynamicLine(points.length, color, .1, {parent: group.light});
  const trail = stage.dynamicLine(points.length, color, 1, {parent: group.light, vertexColors: true, additive: true});
  const head = stage.sprite(color, b === critical ? .75 : .55, group.light);
  return {data, points, color, guide, trail, head, bright: b === critical ? 1.25 : 1};
});
// Turn the rays so they cross the screen from left to right in the default framing.
group.light.rotation.y = .6;

function updateRays(now) {
  for (const ray of rays) {
    const {points, color, bright} = ray, flat = new Float32Array(points.length * 3), colors = new Float32Array(points.length * 3);
    let visible = 0;
    points.forEach((p, i) => {
      flat.set([p.x, blendY(p.r, p.t, .04), p.z], i * 3);
      const age = now - p.t;
      if (age >= 0) visible = i + 1;
      const glow = age >= 0 ? bright * (.16 + .3 * blend + .9 * Math.exp(-age / 2.5)) : 0;
      colors.set([color.r * glow, color.g * glow, color.b * glow], i * 3);
    });
    setPoints(ray.guide, flat);
    ray.guide.material.opacity = .11 * (1 - blend) + .04 * blend;
    setPoints(ray.trail, flat, colors);
    ray.trail.geometry.setDrawRange(0, visible);
    const p = gr.sampleAt(ray.data.points, now);
    ray.head.visible = !!p;
    if (p) {
      ray.head.position.set(p.x, blendY(p.r, now, .06), p.z);
      ray.head.material.opacity = p.r < 1.1 ? (p.r - 1.015) / .085 : 1;
    }
  }
}

// ---------------------------------------------------------------- labels
const labelPoint = new THREE.Vector3();
const avoid = () => [$('story'), $('panel'), $('readout'), document.querySelector('.transport')]
  .filter(el => el.offsetParent).map(el => el.getBoundingClientRect());

function updateLabels(state) {
  const rects = avoid();
  const pin = (id, x, y, z, show) => positionLabel($(id), labelPoint.set(x, y, z), camera, {show, avoid: rects});
  pin('label-a', ...clockPosition(clockA), layers.clocks);
  pin('label-b', ...clockPosition(clockB), layers.clocks);
  pin('label-c', ...clockPosition(clockC), layers.falling);
  const front = Math.atan2(camera.position.z, camera.position.x);
  const at = (r, da) => { const [x, z] = polar(r, front + da); return [x, blendY(r, state.now, .02), z]; };
  pin('label-horizon', ...at(1, 0), blend < .5);
  pin('label-photon', ...at(gr.PHOTON_SPHERE, Math.PI), layers.landmarks && blend < .5);
  pin('label-isco', ...at(gr.ISCO, -Math.PI / 2), layers.landmarks && blend < .5);
}
const clockPosition = clock => clock.marker.position.toArray();

function updateReadout(state) {
  const {rA, rB} = settings;
  $('row-a').hidden = $('row-b').hidden = !layers.clocks;
  $('row-c').hidden = !layers.falling;
  $('readout').hidden = !layers.clocks && !layers.falling;
  $('far-tau').textContent = `${state.now.toFixed(2)} τ`;
  $('a-where').textContent = `held at ${rA.toFixed(1)} rₛ`;
  $('b-where').textContent = `held at ${rB.toFixed(1)} rₛ`;
  $('a-tau').textContent = `${state.tauA.toFixed(2)} τ`;
  $('b-tau').textContent = `${state.tauB.toFixed(2)} τ`;
  $('a-sub').textContent = `runs at ${(gr.rate(rA) * 100).toFixed(1)}% of the far-away rate`;
  $('b-sub').textContent = layers.signals
    ? `A’s flashes arrive every ${schedule.receivedInterval.toFixed(2)} τ, sent every ${FLASH_INTERVAL}`
    : `runs at ${(gr.rate(rB) * 100).toFixed(1)}% of the far-away rate`;
  const r = state.fall.r;
  $('c-where').textContent = r < 1.001 ? 'at the horizon' : `falling · now ${r.toFixed(r < 1.1 ? 3 : 1)} rₛ`;
  $('c-tau').textContent = `${state.fall.tau.toFixed(2)} τ`;
  $('c-sub').textContent = r < 1.05
    ? `seen from afar, frozen at the horizon; its own clock reaches ${fall.tauHorizon.toFixed(1)} τ there`
    : `dropped from ${settings.drop.toFixed(1)} rₛ; reaches the horizon at ${fall.tauHorizon.toFixed(1)} τ of its own time`;
}

// ---------------------------------------------------------------- frame update
function updateSlice(now) {
  for (const {line, radii, opacity} of sliceLines) {
    const a = line.geometry.attributes.position;
    for (let i = 0; i < radii.length; i++) a.array[i * 3 + 1] = blendY(radii[i], now);
    a.needsUpdate = true;
    line.material.opacity = opacity * (1 - .45 * blend);
  }
  const a = surface.geometry.attributes.position;
  for (let i = 0; i < surfaceRadii.length; i++) a.array[i * 3 + 1] = blendY(surfaceRadii[i], now);
  a.needsUpdate = true;
  surface.material.opacity = .035 * (1 - blend);
  aperture.position.y = blendY(1, now) - .01;
  aperture.material.opacity = 1 - .65 * blend;
}

let last = {now: -1, blend: -1};
function update(now) {
  if (!needsUpdate && now === last.now && blend === last.blend) return;
  const sliceMoved = blend !== last.blend || (blend > 0 && now !== last.now) || needsUpdate;
  needsUpdate = false;
  last = {now, blend};
  if (sliceMoved) updateSlice(now);
  const boosts = updateSignals(now);
  const state = {
    now,
    tauA: updateStaticClock(clockA, settings.rA, now, boosts.boostA),
    tauB: updateStaticClock(clockB, settings.rB, now, boosts.boostB),
    fall: updateFallingClock(now),
  };
  if (layers.light) updateRays(now);
  updateReadout(state);
  update.state = state;
}

// ---------------------------------------------------------------- controls
function applyLayers(next) {
  if (next) for (const key of Object.keys(layers)) layers[key] = !!next[key];
  for (const [key, on] of Object.entries(layers)) group[key].visible = on;
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
  needsUpdate = true;
}

function setView(isTime, announce = false) {
  targetBlend = isTime ? 1 : 0;
  if (reducedMotion) blend = targetBlend;
  setPressed($('view-space'), !isTime);
  setPressed($('view-time'), isTime);
  $('view-note').textContent = isTime
    ? 'Time view · height is far-away time'
    : 'Space view · curved space, drawn to scale';
  if (announce) toast(isTime ? 'Time runs upward. Tick marks are equal steps of each clock’s own time.'
    : 'The surface’s depth shows how space is curved, not time.');
  needsUpdate = true;
}

function rebuild() {
  schedule = gr.signalSchedule(settings.rA, settings.rB, {interval: FLASH_INTERVAL, tMax: T_MAX});
  fall = gr.freeFall(settings.drop);
  $('out-a').textContent = `${settings.rA.toFixed(1)} rₛ`;
  $('out-b').textContent = `${settings.rB.toFixed(1)} rₛ`;
  $('out-c').textContent = `${settings.drop.toFixed(1)} rₛ`;
  for (const [id, key] of [['radius-a', 'rA'], ['radius-b', 'rB'], ['radius-c', 'drop']]) {
    const input = $(id);
    input.style.setProperty('--progress', `${(settings[key] - input.min) / (input.max - input.min) * 100}%`);
  }
  needsUpdate = true;
}

const transport = createTransport({max: T_MAX, speed: 2, onChange: () => { needsUpdate = true; }});

$('view-space').onclick = () => setView(false, true);
$('view-time').onclick = () => setView(true, true);
$('reset-camera').onclick = () => home(framing, true);
for (const chip of document.querySelectorAll('.chip')) {
  chip.onclick = () => {
    layers[chip.dataset.layer] = !layers[chip.dataset.layer];
    applyLayers();
  };
}
for (const [id, key] of [['radius-a', 'rA'], ['radius-b', 'rB'], ['radius-c', 'drop']]) {
  $(id).addEventListener('input', event => {
    settings[key] = +event.target.value;
    // Make sure the clock being moved is on screen.
    const layer = key === 'drop' ? 'falling' : 'clocks';
    if (!layers[layer]) applyLayers({...layers, [layer]: true});
    rebuild();
    transport.restart();
  });
}
function showPanel(open) {
  $('panel').classList.toggle('sheet-closed', !open);
  $('panel-toggle').setAttribute('aria-expanded', String(open));
}
$('panel-toggle').onclick = () => showPanel($('panel').classList.contains('sheet-closed'));
bindDialog($('notes'), $('about'), () => transport.setPlaying(false));
stage.onContextLost = () => transport.setPlaying(false);
addEventListener('resize', () => { needsUpdate = true; });
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });

const story = createStory({
  steps,
  onEnter(step, index) {
    if (step.view) setView(step.view === 'time');
    applyLayers(step.layers);
    home(step.camera ?? 'wide', true);
    showPanel(index === steps.length - 1 && !narrow());
    transport.restart();
  },
});

rebuild();
home('wide');
story.show(0);
// Panels change size with each tour step; keep the scene centred in the free space.
new ResizeObserver(() => stage.resize()).observe($('story'));
new ResizeObserver(() => stage.resize()).observe($('readout'));

let lastFrame = performance.now(), cameraBlend = blend;
function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((time - lastFrame) / 1000, .08));
  lastFrame = time;
  if (!document.hidden) transport.tick(dt);
  if (blend !== targetBlend) {
    blend += (targetBlend - blend) * Math.min(1, dt * 4);
    if (Math.abs(blend - targetBlend) < 1e-3) blend = targetBlend;
  }
  // Rise with the "now" plane so Time view stays framed.
  const lift = (blend - cameraBlend) * 3.5;
  camera.position.y += lift;
  controls.target.y += lift;
  if (cameraTween) for (const v of [cameraTween.to.position, cameraTween.to.target]) v.y += lift;
  cameraBlend = blend;
  stepCameraTween(dt);
  controls.update();
  update(transport.t);
  updateLabels(update.state);
  stage.render();
}
requestAnimationFrame(frame);
