// Special relativity: a ship with a light clock, Earth, a flash, and switchable frames.
import * as THREE from 'three';
import {createStage, addStarfield, setPoints} from '../shared/scene.js';
import {$, toast, setPressed, reducedMotion, createTransport, createStory, bindDialog, positionLabel} from '../shared/shell.js';
import * as sr from './physics.js';
import {steps} from './story.js';

const T_MAX = 26;          // timeline length in the chosen frame, s
const L0 = 4;              // ship rest length, ls
const BODY_W = 1.1;        // ship width (across the motion), ls
const CLOCK_L = .5;        // light-clock mirror separation: one tick = 1 s of ship time
const FLASH_TAU = 4;       // ship time of the flash
const TURN_AT = 10;        // Earth time of the turnaround on a round trip
const X_RANGE = 26;        // half-width of the drawn grid, ls
const COLOR = {earth: 0xf0bd86, ship: 0x9fe3ef, photon: 0xfff3c4, flash: 0xc9b8ff, grid: 0x7d9cb6, cone: 0xd8e2ea};

const settings = {v: .6, roundTrip: false};
const layers = {clock: false, flash: false, simultaneity: false, invariants: false};
const narrow = () => innerWidth <= 720;
let blend = 0, targetBlend = 0;    // 0 = Space view, 1 = Time view
let phi = 0, targetPhi = 0;        // rapidity of the frame we are viewing from
let frameName = 'earth';
let trip, centreEvents, centreTaus, photonEvents, flash;
const earthEvents = [[0, 0, 0], [400, 0, 0]];

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'),
  viewShift: () => {
    if (!narrow()) return [24, 0];
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 6, maxDistance: 120});
addStarfield(scene, {radius: 110});
const group = {};
for (const name of ['base', 'bodies', ...Object.keys(layers)]) scene.add(group[name] = new THREE.Group());

// Display coordinates [t′, x′, y] → world. Time rises in Time view; Space view flattens it.
const toWorld = (t, x, y, lift = 0) => [x, t * blend + lift, y];
const display = e => sr.boost(e, phi);

// ---------------------------------------------------------------- static drawing helpers
function staticLine(points, color, opacity, parent, {dashed = false} = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const options = {color, transparent: true, opacity, depthWrite: false};
  const line = new THREE.Line(geometry, dashed
    ? new THREE.LineDashedMaterial({...options, dashSize: .35, gapSize: .25}) : new THREE.LineBasicMaterial(options));
  if (dashed) line.computeLineDistances();
  line.frustumCulled = false;
  line.userData.opacity = opacity;
  parent.add(line);
  return line;
}

// Floor: the viewing frame's own space, a band along the line of motion. It rides up with "now".
const floor = new THREE.Group();
group.base.add(floor);
for (let x = -X_RANGE; x <= X_RANGE; x += 1) staticLine([[x, 0, -2.5], [x, 0, 2.5]], COLOR.grid, x % 5 ? .1 : .28, floor);
for (const y of [-2.5, 2.5]) staticLine([[-X_RANGE, 0, y], [X_RANGE, 0, y]], COLOR.grid, .3, floor);
staticLine([[-X_RANGE, 0, 0], [X_RANGE, 0, 0]], COLOR.grid, .18, floor, {dashed: true});

// Back wall: graph paper of the viewing frame (x across, t up). Only in Time view.
const wall = new THREE.Group();
group.base.add(wall);
for (let t = 0; t <= T_MAX; t += 2) staticLine([[-X_RANGE, t, -2.5], [X_RANGE, t, -2.5]], COLOR.grid, t % 10 ? .1 : .25, wall);
for (let x = -X_RANGE; x <= X_RANGE; x += 2) staticLine([[x, 0, -2.5], [x, T_MAX, -2.5]], COLOR.grid, x % 10 ? .08 : .2, wall);

// Invariants: the light cone of the departure event, and hyperbolae t² − x² = s². Both look the same in every frame.
const coneGeometry = new THREE.ConeGeometry(14, 14, 96, 1, true);
coneGeometry.rotateX(Math.PI);
coneGeometry.translate(0, 7, 0);
const cone = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({
  color: COLOR.cone, transparent: true, opacity: .03, side: THREE.DoubleSide, depthWrite: false,
}));
cone.userData.opacity = .03;
group.invariants.add(cone);
for (const sign of [-1, 1]) staticLine([[0, 0, 0], [sign * T_MAX, T_MAX, 0]], COLOR.cone, .4, group.invariants, {dashed: true});
for (const s of [4, 8, 12, 16, 20]) {
  const points = [];
  for (let x = -X_RANGE; x <= X_RANGE; x += .25) {
    const t = Math.sqrt(s * s + x * x);
    if (t <= T_MAX + 2) points.push([x, t, 0]);
  }
  staticLine(points, COLOR.cone, s % 8 === 0 ? .5 : .28, group.invariants);
}

// ---------------------------------------------------------------- dynamic objects
function marker(color, parent, size = 1.1) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(.22, .28, 48), new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide, transparent: true, opacity: .95, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  parent.add(ring);
  return {ring, glow: stage.sprite(color, size, parent)};
}
const earth = {
  ...marker(COLOR.earth, group.bodies),
  worldline: stage.dynamicLine(8, COLOR.earth, 0, {parent: group.bodies}),
  ticks: stage.dynamicLine(200, COLOR.earth, 0, {parent: group.bodies, segments: true}),
};
const ship = {
  ...marker(COLOR.ship, group.bodies, .8),
  worldline: stage.dynamicLine(16, COLOR.ship, 0, {parent: group.bodies}),
  ticks: stage.dynamicLine(200, COLOR.ship, 0, {parent: group.bodies, segments: true}),
  outline: stage.dynamicLine(5, COLOR.ship, .9, {parent: group.bodies}),
  edges: stage.dynamicLine(24, COLOR.ship, 0, {parent: group.bodies, segments: true}),
};
const hullGeometry = new THREE.BufferGeometry();
hullGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
hullGeometry.setIndex([0, 1, 2, 0, 2, 3]);
const hull = new THREE.Mesh(hullGeometry, new THREE.MeshBasicMaterial({
  color: COLOR.ship, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false,
}));
hull.frustumCulled = false;
group.bodies.add(hull);

const photon = {
  glow: stage.sprite(COLOR.photon, .7, group.clock),
  trail: stage.dynamicLine(400, COLOR.photon, .85, {parent: group.clock}),
  mirrors: stage.dynamicLine(4, 0xe8eef3, .9, {parent: group.clock, segments: true}),
};

const ringPoints = 96;
const flashView = {
  ring: stage.dynamicLine(ringPoints + 1, COLOR.flash, .9, {parent: group.flash}),
  rays: stage.dynamicLine(4, COLOR.flash, .7, {parent: group.flash, segments: true}),
  emit: stage.sprite(COLOR.flash, .9, group.flash),
  back: stage.sprite(0xffffff, 1.2, group.flash),
  front: stage.sprite(0xffffff, 1.2, group.flash),
};

function sheet(color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.frustumCulled = false;
  group.simultaneity.add(mesh);
  return {mesh, line: stage.dynamicLine(2, color, .8, {parent: group.simultaneity})};
}
const earthNow = sheet(COLOR.earth), shipNow = sheet(COLOR.ship);

// ---------------------------------------------------------------- physics → display
function rebuild() {
  trip = sr.journey({v: settings.v, roundTrip: settings.roundTrip, turnAt: TURN_AT});
  centreTaus = [...new Set([0, ...trip.legs.map(l => l.tau0), 60])].sort((a, b) => a - b);
  centreEvents = centreTaus.map(tau => trip.centreAt(tau));
  photonEvents = sr.lightClock(trip, {L: CLOCK_L, tauMax: 40});
  flash = sr.shipFlash(trip, {L0, tauEmit: FLASH_TAU});
  $('out-v').textContent = `${settings.v.toFixed(2)} c · γ = ${sr.gamma(settings.v).toFixed(2)}`;
  $('speed').style.setProperty('--progress', `${(settings.v - .1) / .88 * 100}%`);
  $('round-trip').checked = settings.roundTrip;
  $('frame-return').hidden = !settings.roundTrip;
  if (!settings.roundTrip && frameName === 'return') setFrame('earth');
  else setFrame(frameName);
}

/** Polyline of display events up to t′ = now, as world coordinates. */
function pastOf(events, now, lift = 0) {
  const flat = [];
  for (let i = 0; i < events.length; i++) {
    const d = display(events[i]);
    if (d[0] <= now) { flat.push(...toWorld(d[0], d[1], d[2], lift)); continue; }
    if (i > 0) {
      const cut = sr.sliceAt([events[i - 1], events[i]], phi, now);
      if (cut) flat.push(...toWorld(cut[0], cut[1], cut[2], lift));
    }
    break;
  }
  return flat;
}

/** Ship time at a point given as a fractional index into centreEvents. */
const shipTauAt = index => {
  const i = Math.min(Math.floor(index), centreTaus.length - 2), f = index - i;
  return centreTaus[i] + f * (centreTaus[i + 1] - centreTaus[i]);
};

function tickMarks(events, now) {
  const flat = [];
  for (const e of events) {
    const [t, x] = display(e);
    if (t > now) continue;
    const y = t * blend;
    flat.push(x - .2, y, 0, x + .2, y, 0);
  }
  return flat;
}

function setQuad(geometry, corners) {
  const a = geometry.attributes.position;
  corners.forEach((c, i) => a.array.set(c, i * 3));
  a.needsUpdate = true;
}

const state = {};
function update(now) {
  const viewU = Math.tanh(phi);

  // Earth
  const e = sr.sliceAt(earthEvents, phi, now);
  const earthTau = e ? sr.boost(e.slice(0, 3), -phi)[0] : 0;
  const ePos = e ? toWorld(now, e[1], 0, .02) : [0, 0, 0];
  earth.ring.position.set(...ePos);
  earth.glow.position.set(...ePos);
  earth.glow.material.opacity = .5 + .35 * Math.exp(-(earthTau % 1) * 5);
  setPoints(earth.worldline, pastOf(earthEvents, now));
  earth.worldline.material.opacity = .85 * blend;
  setPoints(earth.ticks, tickMarks(Array.from({length: 40}, (_, n) => [n, 0, 0]), now));
  earth.ticks.material.opacity = .9 * blend;

  // Ship centre, its clock and body
  const c = sr.sliceAt(centreEvents, phi, now);
  const shipTau = c ? shipTauAt(c[3]) : 0;
  const leg = trip.legAt(shipTau), u = sr.relativeVelocity(leg.u, viewU);
  const half = sr.contractedLength(L0, u) / 2, cx = c ? c[1] : 0;
  const cPos = toWorld(now, cx, 0, .03);
  ship.ring.position.set(...cPos);
  ship.glow.position.set(...cPos);
  ship.glow.material.opacity = .45 + .35 * Math.exp(-(shipTau % 1) * 5);
  setPoints(ship.worldline, pastOf(centreEvents, now));
  ship.worldline.material.opacity = .85 * blend;
  setPoints(ship.ticks, tickMarks(Array.from({length: 40}, (_, n) => trip.centreAt(n)), now));
  ship.ticks.material.opacity = .9 * blend;
  const y0 = now * blend + .01, w = BODY_W / 2;
  const corners = [[cx - half, y0, -w], [cx + half, y0, -w], [cx + half, y0, w], [cx - half, y0, w]];
  setPoints(ship.outline, [...corners.flat(), ...corners[0]]);
  setQuad(hullGeometry, corners);

  // Worldsheet edges (front and back of the ship) for each leg, in Time view.
  const edges = [];
  for (let i = 0; i < trip.legs.length; i++) {
    const tauA = trip.legs[i].tau0, tauB = trip.legs[i + 1]?.tau0 ?? 60;
    for (const side of [-1, 1]) {
      const line = [sr.shipEvent(trip, tauA, [0, side * L0 / 2]), sr.shipEvent(trip, tauB - 1e-9, [0, side * L0 / 2])];
      const flat = pastOf(line, now);
      if (flat.length === 6) edges.push(...flat);
    }
  }
  setPoints(ship.edges, edges);
  ship.edges.material.opacity = .45 * blend;

  // Light clock
  if (layers.clock) {
    const p = sr.sliceAt(photonEvents, phi, now);
    photon.glow.visible = !!p;
    if (p) photon.glow.position.set(...toWorld(now, p[1], p[2], .05));
    setPoints(photon.trail, pastOf(photonEvents, now, .02));
    const m = .3;
    setPoints(photon.mirrors, [
      cx - m, y0 + .03, -CLOCK_L / 2, cx + m, y0 + .03, -CLOCK_L / 2,
      cx - m, y0 + .03, CLOCK_L / 2, cx + m, y0 + .03, CLOCK_L / 2,
    ]);
  }

  // The flash from the ship's centre
  const fe = display(flash.emit), fb = display(flash.back), ff = display(flash.front);
  if (layers.flash) {
    const age = now - fe[0], lastHit = Math.max(fb[0], ff[0]);
    const ringOn = age >= 0 && now <= lastHit + .8;
    flashView.ring.visible = ringOn;
    if (ringOn) {
      const r = Math.min(age, lastHit - fe[0] + .8), ring = [];
      for (let i = 0; i <= ringPoints; i++) {
        const a = i / ringPoints * Math.PI * 2;
        ring.push(fe[1] + r * Math.cos(a), now * blend + .04, r * Math.sin(a));
      }
      setPoints(flashView.ring, ring);
      flashView.ring.material.opacity = .9 * Math.min(1, (lastHit + .8 - now) / .8);
    }
    flashView.emit.visible = age >= 0;
    flashView.emit.position.set(...toWorld(fe[0], fe[1], 0, .05));
    flashView.emit.material.opacity = blend > .5 ? .9 : Math.max(0, 1 - age / 1.5);
    const hit = (sprite, event) => {
      sprite.visible = now >= event[0];
      sprite.position.set(...toWorld(event[0], event[1], 0, .06));
      sprite.material.opacity = blend > .5 ? 1 : Math.max(.15, 1 - (now - event[0]) / 2);
    };
    hit(flashView.back, fb);
    hit(flashView.front, ff);
    const rays = [];
    for (const target of [flash.back, flash.front]) rays.push(...pastOf([flash.emit, target], now, .03));
    setPoints(flashView.rays, rays);
    flashView.rays.material.opacity = .75 * blend;
  }

  // "Now" sheets: Earth's (t = Earth's reading) and the ship's (its rest frame, through its centre).
  if (layers.simultaneity && blend > .01) {
    const extent = 30, wy = 2.5;
    const earthT = earthTau;
    const earthCorners = [[-extent, -wy], [extent, -wy], [extent, wy], [-extent, wy]]
      .map(([x, y]) => { const d = display([earthT, x, y]); return toWorld(d[0], d[1], y); });
    setQuad(earthNow.mesh.geometry, earthCorners);
    const shipCorners = [[-extent, -wy], [extent, -wy], [extent, wy], [-extent, wy]]
      .map(([x, y]) => { const d = display(sr.shipEvent(trip, shipTau, [0, x, y])); return toWorld(d[0], d[1], y); });
    setQuad(shipNow.mesh.geometry, shipCorners);
    const e1 = display([earthT, -extent, 0]), e2 = display([earthT, extent, 0]);
    setPoints(earthNow.line, [e1[1], e1[0] * blend, 0, e2[1], e2[0] * blend, 0]);
    const s1 = display(sr.shipEvent(trip, shipTau, [0, -extent])), s2 = display(sr.shipEvent(trip, shipTau, [0, extent]));
    setPoints(shipNow.line, [s1[1], s1[0] * blend, 0, s2[1], s2[0] * blend, 0]);
  }
  for (const s of [earthNow, shipNow]) {
    s.mesh.material.opacity = .07 * blend;
    s.line.material.opacity = .85 * blend;
  }

  // Floor rides with now; the wall, cone and hyperbolae only belong to Time view.
  floor.position.y = now * blend;
  for (const line of floor.children) line.material.opacity = line.userData.opacity * (1 - .5 * blend);
  for (const line of wall.children) line.material.opacity = line.userData.opacity * blend;
  for (const obj of group.invariants.children) obj.material.opacity = (obj.userData.opacity ?? .05) * blend;

  Object.assign(state, {now, earthTau, shipTau, u, half, fe, fb, ff, ePos, cPos, home: c && trip.roundTrip && shipTau > trip.legs[2].tau0});
}

// ---------------------------------------------------------------- readout and labels
const fmt = x => x.toFixed(2);
function updateReadout() {
  const {earthTau, shipTau, u, now} = state, viewU = Math.tanh(phi);
  $('earth-tau').textContent = `${fmt(earthTau)} s`;
  $('ship-tau').textContent = `${fmt(shipTau)} s`;
  const earthU = sr.relativeVelocity(0, viewU);
  $('earth-where').textContent = Math.abs(earthU) < 1e-4 ? 'at rest in this frame' : `moving at ${fmt(Math.abs(earthU))} c`;
  $('ship-where').textContent = Math.abs(u) < 1e-4 ? 'at rest in this frame' : `moving at ${fmt(Math.abs(u))} c · γ = ${fmt(sr.gamma(u))}`;
  $('ship-sub').textContent = state.home
    ? `home again: the trip took ${trip.legs[2].tau0.toFixed(1)} s of ship time and ${(2 * TURN_AT).toFixed(1)} s of Earth time`
    : `length here ${fmt(2 * state.half)} ls (${L0.toFixed(2)} at rest)`;
  $('row-flash').hidden = !layers.flash;
  if (layers.flash) {
    const gap = state.ff[0] - state.fb[0];
    $('flash-gap').textContent = Math.abs(gap) < .005 ? 'both ends together' : gap > 0 ? `back first, by ${fmt(gap)} s` : `front first, by ${fmt(-gap)} s`;
    const lit = t => now >= t ? 'lit' : 'not yet';
    $('flash-sub').textContent = `back at ${fmt(state.fb[0])} s (${lit(state.fb[0])}) · front at ${fmt(state.ff[0])} s (${lit(state.ff[0])})`;
  }
}

const labelPoint = new THREE.Vector3();
function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  positionLabel($('label-earth'), labelPoint.set(state.ePos[0], state.ePos[1] + .3, state.ePos[2]), camera, {avoid: rects});
  positionLabel($('label-ship'), labelPoint.set(state.cPos[0], state.cPos[1] + .3, BODY_W / 2), camera, {avoid: rects});
  positionLabel($('label-cone'), labelPoint.set(-9, 9, 0), camera, {show: layers.invariants && blend > .5, avoid: rects});
}

// ---------------------------------------------------------------- camera
// The camera orbits an anchor that follows the action: midway between Earth and the ship
// halfway through the run, and halfway up the time axis in Time view.
const FRAMING = {
  space: () => new THREE.Vector3(...(narrow() ? [0, 30, 20] : [0, 14.5, 10.5])),
  time: () => new THREE.Vector3(...(narrow() ? [-7, 6, 66] : [-9, 5, 42])),
};
const anchor = new THREE.Vector3(), offset = new THREE.Vector3();
let offsetTween = null;
function computeAnchor(target) {
  const mid = T_MAX / 2, a = sr.sliceAt(earthEvents, phi, mid), b = sr.sliceAt(centreEvents, phi, mid);
  return target.set(((a?.[1] ?? 0) + (b?.[1] ?? 0)) / 2, blend * mid, 0);
}
function frameCamera(animate = true) {
  const to = FRAMING[targetBlend > .5 ? 'time' : 'space']();
  if (animate && !reducedMotion) offsetTween = {from: offset.clone(), to, u: 0};
  else { offset.copy(to); offsetTween = null; }
}
controls.addEventListener('start', () => { offsetTween = null; });

// ---------------------------------------------------------------- controls
function applyLayers(next) {
  if (next) for (const key of Object.keys(layers)) layers[key] = !!next[key];
  for (const [key, on] of Object.entries(layers)) group[key].visible = on;
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
}

function setView(isTime, announce = false) {
  targetBlend = isTime ? 1 : 0;
  if (reducedMotion) blend = targetBlend;
  setPressed($('view-space'), !isTime);
  setPressed($('view-time'), isTime);
  $('view-note').textContent = isTime ? 'Time view · height is time in this frame' : 'Space view · where everything is, now';
  if (announce) {
    toast(isTime ? 'Time runs upward. Light travels at 45°.' : 'Positions at this moment, in the chosen frame.');
    frameCamera();
  }
}

function setFrame(name, announce = false) {
  frameName = name;
  const w = sr.rapidity(settings.v);
  targetPhi = name === 'ship' ? w : name === 'return' ? -w : 0;
  if (reducedMotion) phi = targetPhi;
  for (const id of ['earth', 'ship', 'return']) setPressed($('frame-' + id), id === name);
  if (announce) toast(name === 'earth' ? 'Seen from Earth.' : name === 'ship' ? 'Seen from the ship: now Earth is the one moving.' : 'Seen from the ship on its way home.');
}

const transport = createTransport({max: T_MAX, speed: 1.6});

$('view-space').onclick = () => setView(false, true);
$('view-time').onclick = () => setView(true, true);
$('reset-camera').onclick = () => frameCamera();
for (const id of ['earth', 'ship', 'return']) $('frame-' + id).onclick = () => setFrame(id, true);
for (const chip of document.querySelectorAll('.chip')) {
  chip.onclick = () => { layers[chip.dataset.layer] = !layers[chip.dataset.layer]; applyLayers(); };
}
$('speed').addEventListener('input', event => {
  settings.v = +event.target.value;
  rebuild();
  transport.restart();
});
$('round-trip').addEventListener('change', event => {
  settings.roundTrip = event.target.checked;
  rebuild();
  transport.restart();
});
function showPanel(open) {
  $('panel').classList.toggle('sheet-closed', !open);
  $('panel-toggle').setAttribute('aria-expanded', String(open));
}
$('panel-toggle').onclick = () => showPanel($('panel').classList.contains('sheet-closed'));
bindDialog($('notes'), $('about'), () => transport.setPlaying(false));
stage.onContextLost = () => transport.setPlaying(false);

const story = createStory({
  steps,
  onEnter(step, index) {
    settings.roundTrip = step.trip === 'round';
    frameName = step.frame;
    rebuild();
    setView(step.view === 'time');
    applyLayers(step.layers);
    showPanel(index === steps.length - 1 && !narrow());
    frameCamera();
    transport.restart();
  },
});

rebuild();
offset.copy(FRAMING.space());
computeAnchor(anchor);
controls.target.copy(anchor);
camera.position.copy(anchor).add(offset);
controls.update();
story.show(0);
new ResizeObserver(() => stage.resize()).observe($('story'));
new ResizeObserver(() => stage.resize()).observe($('readout'));

let lastFrame = performance.now();
function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((time - lastFrame) / 1000, .08));
  lastFrame = time;
  if (!document.hidden) transport.tick(dt);
  const ease = Math.min(1, dt * 3.5);
  if (blend !== targetBlend) { blend += (targetBlend - blend) * ease; if (Math.abs(blend - targetBlend) < 1e-3) blend = targetBlend; }
  if (phi !== targetPhi) { phi += (targetPhi - phi) * ease; if (Math.abs(phi - targetPhi) < 1e-4) phi = targetPhi; }

  controls.update();
  offset.copy(camera.position).sub(controls.target);
  if (offsetTween) {
    offsetTween.u = Math.min(1, offsetTween.u + dt / 1.2);
    const k = offsetTween.u < .5 ? 2 * offsetTween.u ** 2 : 1 - (-2 * offsetTween.u + 2) ** 2 / 2;
    offset.lerpVectors(offsetTween.from, offsetTween.to, k);
    if (offsetTween.u === 1) offsetTween = null;
  }
  computeAnchor(anchor);
  controls.target.copy(anchor);
  camera.position.copy(anchor).add(offset);

  update(transport.t);
  updateReadout();
  updateLabels();
  stage.render();
}
requestAnimationFrame(frame);
