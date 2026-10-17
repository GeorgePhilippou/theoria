// Special relativity: a ship with a light clock, Earth, a flash, and switchable frames.
// Every event is computed once in Earth's frame (physics.js) and drawn in the chosen frame.
import * as THREE from 'three';
import {createStage, INK, inkFade} from '../shared/stage.js';
import {$, toast, setPressed, reducedMotion, createTransport, createStory, bindDialog, positionLabel, bindKeys, showTip} from '../shared/shell.js';
import * as sr from './physics.js';
import {steps} from './story.js';

const T_MAX = 26;          // timeline length in the chosen frame, s
const L0 = 4;              // ship rest length, ls
const CLOCK_L = .5;        // light-clock mirror separation: one tick = 1 s of ship time
const FLASH_TAU = 4;       // ship time of the flash
const TURN_AT = 10;        // Earth time of the turnaround on a round trip
const DECK = .2;           // height of the ship's deck, where the light clock sits
const EARTH_R = .42;       // drawn radius of Earth (not to scale)
const COLOR = {
  // Paper palette: Earth burnt orange, the ship olive, light (photon, flash, light cone) in dark ink.
  earth: INK.spot, ship: INK.olive, photon: INK.dark, flash: INK.dark, grid: INK.olive, cone: INK.dark, hull: INK.paper2,
};

const settings = {v: .6, roundTrip: false};
const layers = {clock: false, flash: false, simultaneity: false, invariants: false};
const narrow = () => innerWidth <= 720;
let blend = 0, targetBlend = 0;    // 0 = Space view, 1 = Time view
let phi = 0, targetPhi = 0;        // rapidity of the frame we are viewing from
let frameName = 'earth', spaceFraming = 'overview';
let trip, centreEvents, centreTaus, photonEvents, flash, backEvents, frontEvents, candidates = [];
const earthEvents = [[0, 0, 0], [400, 0, 0]];

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'), theme: 'paper',
  viewShift: () => {
    if (!narrow()) return [24, 0];
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 3, maxDistance: 140});
const group = {};
for (const name of ['base', 'time', 'bodies', ...Object.keys(layers)]) scene.add(group[name] = new THREE.Group());

// Display coordinates [t′, x′, y] → world [x, height, depth]. Space view flattens time.
const toWorld = (t, x, y, lift = 0) => [x, t * blend + lift, y];
const display = e => sr.boost(e, phi);
const shipFrame = e => sr.boost(e, sr.rapidity(settings.v));

// ---------------------------------------------------------------- the floor and the time axis
function thinLines(flat, color, opacity, parent) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color, transparent: true, opacity, depthWrite: false}));
  lines.userData.opacity = opacity;
  parent.add(lines);
  return lines;
}
// Space of the chosen frame: a band along the line of motion. In Time view it rides up with "now".
const floor = new THREE.Group();
group.base.add(floor);
{
  const minor = [], major = [];
  for (let x = -40; x <= 40; x++) (x % 5 ? minor : major).push(x, 0, -3, x, 0, 3);
  for (const y of [-3, 3]) major.push(-40, 0, y, 40, 0, y);
  thinLines(minor, COLOR.grid, .09, floor);
  thinLines(major, COLOR.grid, .26, floor);
}
// Time axis on a back wall, in Time view.
thinLines(Array.from({length: 5}, (_, i) => [-60, (i + 1) * 5, -3, 60, (i + 1) * 5, -3]).flat(), COLOR.grid, .22, group.time);

// ---------------------------------------------------------------- invariants (the same in every frame)
const CONE_H = 18;
const coneMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: {color: {value: new THREE.Color(INK.oliveTint)}, strength: {value: 0}},
  vertexShader: 'varying float vH; void main() { vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 color; uniform float strength; varying float vH;
    void main() { float h = vH / ${CONE_H.toFixed(1)};
      float a = strength * (0.22 * (1.0 - h) + 0.12 * smoothstep(0.9, 1.0, fract(vH / 2.0)) * (1.0 - h));
      gl_FragColor = vec4(pow(color, vec3(2.2)), a); }`,
});
{
  const geometry = new THREE.ConeGeometry(CONE_H, CONE_H, 128, 12, true);
  geometry.rotateX(Math.PI);
  geometry.translate(0, CONE_H / 2, 0);
  group.invariants.add(new THREE.Mesh(geometry, coneMaterial));
}
const nullLines = stage.line({color: COLOR.cone, width: 1.6, opacity: .55, dashed: true, dash: [.45, .3], segments: true, parent: group.invariants})
  .set([0, 0, 0, -T_MAX, T_MAX, 0, 0, 0, 0, T_MAX, T_MAX, 0]);
const hyperbolae = [4, 8, 12, 16, 20].map(s => {
  const pts = [];
  for (let x = -40; x <= 40; x += .2) { const t = Math.hypot(s, x); if (t <= T_MAX + 2) pts.push(x, t, 0); }
  // τ = 8 s is drawn brightest: the tour compares the clocks' 8th ticks on it.
  return stage.line({color: s === 8 ? INK.spot : COLOR.cone, width: s === 8 ? 2.6 : s % 8 === 0 ? 1.8 : 1.2, opacity: s === 8 ? .85 : s % 8 === 0 ? .6 : .32, parent: group.invariants}).set(pts);
});

// ---------------------------------------------------------------- Earth
function earthTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const sea = ctx.createLinearGradient(0, 0, 0, 256);
  // Printed in two inks: an olive-tint sea with burnt-orange land.
  sea.addColorStop(0, '#b9bb8e'); sea.addColorStop(.5, '#a9ac7b'); sea.addColorStop(1, '#b9bb8e');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, 512, 256);
  let seed = 3;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 26; i++) {
    const x = random() * 512, y = 50 + random() * 156, r = 14 + random() * 40;
    for (let j = 0; j < 9; j++) {
      ctx.fillStyle = j % 3 ? '#d98a5f' : '#c8541f';
      ctx.beginPath();
      ctx.ellipse(x + (random() - .5) * r * 1.6, y + (random() - .5) * r, r * (.3 + random() * .5), r * (.2 + random() * .35), random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(244,238,224,.95)';
  ctx.fillRect(0, 0, 512, 16);
  ctx.fillRect(0, 240, 512, 16);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const earth = {group: new THREE.Group()};
earth.globe = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 32), new THREE.MeshStandardMaterial({map: earthTexture(), roughness: .85}));
earth.globe.rotation.z = .41;
// On paper there is no glowing atmosphere: the globe is printed flat in two inks.
earth.atmosphere = new THREE.Group();
// Earth's clock: a bead that goes once round the ring per second of Earth's own time.
earth.ring = new THREE.Mesh(new THREE.RingGeometry(EARTH_R * 1.45, EARTH_R * 1.55, 96), new THREE.MeshBasicMaterial({
  color: COLOR.earth, side: THREE.DoubleSide, transparent: true, opacity: .75, depthWrite: false,
}));
earth.ring.rotation.x = -Math.PI / 2;
earth.bead = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 8), new THREE.MeshBasicMaterial({color: INK.dark}));
earth.beadGlow = stage.sprite(COLOR.earth, .45, earth.group);
earth.group.add(earth.globe, earth.atmosphere, earth.ring, earth.bead);
group.bodies.add(earth.group);

// ---------------------------------------------------------------- the ship
const ship = {group: new THREE.Group(), hull: new THREE.Group()};
{
  const shape = new THREE.Shape();
  shape.moveTo(2.1, 0);
  shape.bezierCurveTo(1.9, .34, 1.25, .5, .6, .52);
  shape.lineTo(-1.6, .56);
  shape.lineTo(-2, .44);
  shape.lineTo(-2, -.44);
  shape.lineTo(-1.6, -.56);
  shape.lineTo(.6, -.52);
  shape.bezierCurveTo(1.25, -.5, 1.9, -.34, 2.1, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: .14, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 4, curveSegments: 32});
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, .1, 0);
  ship.hull.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: COLOR.hull, metalness: .6, roughness: .32})));
  const outline = shape.getPoints(40).flatMap(p => [p.x, DECK - .03, p.y]);
  stage.line({color: COLOR.ship, width: 1.6, opacity: .9, parent: ship.hull}).set([...outline, ...outline.slice(0, 3)]);
  for (const z of [-.26, .26]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .18, 24), new THREE.MeshStandardMaterial({
      color: INK.oliveTint, metalness: 0, roughness: .9,
    }));
    engine.rotation.z = Math.PI / 2;
    engine.position.set(-2.06, .02, z);
    ship.hull.add(engine);
  }
  // The light clock on deck: two mirrors facing each other across the ship.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(.8, .02, CLOCK_L + .22), new THREE.MeshStandardMaterial({color: INK.oliveTint, metalness: 0, roughness: .9}));
  plate.position.y = DECK;
  ship.hull.add(plate);
  for (const z of [-CLOCK_L / 2 - .03, CLOCK_L / 2 + .03]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(.62, .16, .04), new THREE.MeshStandardMaterial({
      color: INK.dark, metalness: 0, roughness: .6,
    }));
    mirror.position.set(0, DECK + .08, z);
    ship.hull.add(mirror);
  }
  ship.group.add(ship.hull);
  group.bodies.add(ship.group);
}
const photon = {
  core: new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 8), new THREE.MeshBasicMaterial({color: INK.dark})),
  glow: stage.sprite(COLOR.photon, .9, group.clock),
  trail: stage.line({width: 2.6, vertexColors: true, additive: true, parent: group.clock}),
};
group.clock.add(photon.core);

// ---------------------------------------------------------------- worldlines, ticks, flash, "now" sheets
const worldline = {
  earth: stage.line({color: COLOR.earth, width: 3, parent: group.bodies}),
  ship: stage.line({color: COLOR.ship, width: 3, parent: group.bodies}),
  earthFuture: stage.line({color: COLOR.earth, width: 1.4, opacity: .3, dashed: true, dash: [.4, .35], parent: group.time}),
  shipFuture: stage.line({color: COLOR.ship, width: 1.4, opacity: .3, dashed: true, dash: [.4, .35], parent: group.time}),
};
function tickMesh(color) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.11, 16, 8), new THREE.MeshBasicMaterial({color, transparent: true}), 64);
  mesh.count = 0;
  mesh.frustumCulled = false;
  group.time.add(mesh);
  return mesh;
}
const ticks = {earth: tickMesh(INK.spot), ship: tickMesh(INK.olive)};
const inked = new THREE.Color();
const hover = stage.sprite(INK.spot, 1.1, scene, {opacity: 0});

const flashView = {
  ring: stage.line({color: COLOR.flash, width: 2.6, additive: true, parent: group.flash}),
  rays: stage.line({color: COLOR.flash, width: 2, opacity: .85, segments: true, dashed: true, dash: [.25, .15], parent: group.flash}),
  emit: stage.sprite(COLOR.flash, 1.2, group.flash),
  back: stage.sprite(INK.dark, 1.4, group.flash),
  front: stage.sprite(INK.dark, 1.4, group.flash),
};

const sheetAlpha = (() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 4;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#000'); g.addColorStop(.35, '#fff'); g.addColorStop(.65, '#fff'); g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 4);
  return new THREE.CanvasTexture(c);
})();
function sheet(color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color, alphaMap: sheetAlpha, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.frustumCulled = false;
  group.simultaneity.add(mesh);
  return {mesh, edge: stage.line({color, width: 2.2, opacity: .9, parent: group.simultaneity})};
}
const sheets = {earth: sheet(COLOR.earth), ship: sheet(COLOR.ship)};

// The ship's band in spacetime (its back and front worldlines), and the two ways of cutting it:
// along Earth's "now" and along the ship's own "now". Their lengths are what each frame calls the ship's length.
const band = {
  back: stage.line({color: COLOR.ship, width: 1.4, opacity: .55, parent: group.simultaneity}),
  front: stage.line({color: COLOR.ship, width: 1.4, opacity: .55, parent: group.simultaneity}),
  cutEarth: stage.line({color: COLOR.earth, width: 4.5, parent: group.simultaneity}),
  cutShip: stage.line({color: COLOR.ship, width: 4.5, parent: group.simultaneity}),
};
const cutLabelAt = {earth: new THREE.Vector3(), ship: new THREE.Vector3()};

// Lamps at the ship's two ends that light when the flash reaches them, and stay lit.
const lamps = {back: stage.sprite(COLOR.flash, 1, group.flash), front: stage.sprite(COLOR.flash, 1, group.flash)};

// Tick 8 of each clock, highlighted on the τ = 8 s curve they share.
const eight = {earth: stage.sprite(INK.spot, 1.7, group.invariants), ship: stage.sprite(INK.spot, 1.7, group.invariants)};

// ---------------------------------------------------------------- physics
function rebuild() {
  trip = sr.journey({v: settings.v, roundTrip: settings.roundTrip, turnAt: TURN_AT});
  centreTaus = [...new Set([0, ...trip.legs.map(l => l.tau0), 60])].sort((a, b) => a - b);
  centreEvents = centreTaus.map(tau => trip.centreAt(tau));
  photonEvents = sr.lightClock(trip, {L: CLOCK_L, tauMax: 40});
  flash = sr.shipFlash(trip, {L0, tauEmit: FLASH_TAU});
  backEvents = centreTaus.map(tau => sr.shipEvent(trip, tau, [0, -L0 / 2]));
  frontEvents = centreTaus.map(tau => sr.shipEvent(trip, tau, [0, L0 / 2]));
  candidates = [
    ...Array.from({length: 40}, (_, n) => ({e: [n + 1, 0, 0], kind: 'earth', title: `Earth’s clock reads ${n + 1} s`})),
    ...Array.from({length: 40}, (_, n) => ({e: trip.centreAt(n + 1), kind: 'ship', title: `Ship’s clock reads ${n + 1} s`})),
    {e: flash.emit, title: 'Flash leaves the centre', layer: 'flash'},
    {e: flash.back, title: 'Light reaches the back', layer: 'flash', light: true},
    {e: flash.front, title: 'Light reaches the front', layer: 'flash', light: true},
  ];
  if (settings.roundTrip) candidates.push({e: trip.centreAt(trip.legs[1].tau0), title: 'The ship turns around'});
  const g = sr.gamma(settings.v);
  $('out-v').innerHTML = `${settings.v.toFixed(2)} c<span class="wide-only"> · γ ${g.toFixed(2)}</span>`;
  $('speed').value = settings.v;
  $('speed').style.setProperty('--progress', `${(settings.v - .1) / .88 * 100}%`);
  $('round-trip').checked = settings.roundTrip;
  $('frame-return').hidden = !settings.roundTrip;
  if (!settings.roundTrip && frameName === 'return') frameName = 'earth';
  setFrame(frameName);
}

/** Display events of a worldline up to t′ = now (clipped exactly at now). */
function pastOf(events, now) {
  const out = [];
  for (let i = 0; i < events.length; i++) {
    const d = display(events[i]);
    if (d[0] <= now) { out.push(d); continue; }
    if (i > 0) { const cut = sr.sliceAt([events[i - 1], events[i]], phi, now); if (cut) out.push(cut.slice(0, 3)); }
    break;
  }
  return out;
}
/** Display events of a worldline from now to t′ = until. */
function futureOf(events, now, until) {
  const out = [], start = sr.sliceAt(events, phi, now), end = sr.sliceAt(events, phi, until);
  if (!start) return out;
  out.push(start.slice(0, 3));
  for (const e of events) { const d = display(e); if (d[0] > now && d[0] < until) out.push(d); }
  if (end) out.push(end.slice(0, 3));
  return out;
}
const flatWorld = (points, lift = 0) => points.flatMap(([t, x, y]) => toWorld(t, x, y, lift));
const shipTauAt = index => {
  const i = Math.min(Math.floor(index), centreTaus.length - 2), f = index - i;
  return centreTaus[i] + f * (centreTaus[i + 1] - centreTaus[i]);
};

function setQuad(geometry, corners) {
  const a = geometry.attributes.position;
  corners.forEach((c, i) => a.array.set(c, i * 3));
  a.needsUpdate = true;
}
const matrix = new THREE.Matrix4();
function setTicks(mesh, events, now) {
  let n = 0;
  for (const e of events) {
    const d = display(e);
    if (d[0] > now || n >= mesh.instanceMatrix.count) continue;
    mesh.setMatrixAt(n++, matrix.makeTranslation(...toWorld(d[0], d[1], 0)));
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.material.opacity = blend;
  mesh.visible = blend > .02;
}

// ---------------------------------------------------------------- per-frame update
const state = {now: 0, cx: 0, ex: 0};
function update(now) {
  const viewU = Math.tanh(phi);

  // Earth: contracted along x when it moves; its spin and bead follow its own clock.
  const e = sr.sliceAt(earthEvents, phi, now);
  const earthTau = e ? sr.boost(e.slice(0, 3), -phi)[0] : 0;
  const earthU = sr.relativeVelocity(0, viewU), ex = e ? e[1] : 0;
  earth.group.position.set(ex, now * blend + EARTH_R, 0);
  earth.group.scale.set(1 / sr.gamma(earthU), 1, 1);
  earth.globe.rotation.y = earthTau * .6;
  const beadAngle = -earthTau * Math.PI * 2;
  earth.bead.position.set(Math.cos(beadAngle) * EARTH_R * 1.5, 0, Math.sin(beadAngle) * EARTH_R * 1.5);
  earth.beadGlow.position.copy(earth.bead.position);

  // Ship: its rest-frame shape, contracted along the motion, facing the way it travels.
  const c = sr.sliceAt(centreEvents, phi, now);
  const shipTau = c ? shipTauAt(c[3]) : 0;
  const leg = trip.legAt(shipTau), u = sr.relativeVelocity(leg.u, viewU), cx = c ? c[1] : 0;
  ship.group.position.set(cx, now * blend, 0);
  ship.group.scale.set(1 / sr.gamma(u), 1, 1);
  ship.hull.rotation.y = leg.u < 0 ? Math.PI : 0;

  // Worldlines (Time view) and the path traced on the floor (Space view).
  worldline.earth.set(flatWorld(pastOf(earthEvents, now), .01));
  worldline.ship.set(flatWorld(pastOf(centreEvents, now), .01));
  for (const w of [worldline.earth, worldline.ship]) w.material.opacity = .22 + .78 * blend;
  worldline.earthFuture.set(flatWorld(futureOf(earthEvents, now, T_MAX)));
  worldline.shipFuture.set(flatWorld(futureOf(centreEvents, now, T_MAX)));
  for (const w of [worldline.earthFuture, worldline.shipFuture]) w.material.opacity = .32 * blend;
  setTicks(ticks.earth, Array.from({length: 40}, (_, n) => [n + 1, 0, 0]), now);
  setTicks(ticks.ship, Array.from({length: 40}, (_, n) => trip.centreAt(n + 1)), now);

  // Light clock: the photon and its fading trail.
  if (layers.clock) {
    const p = sr.sliceAt(photonEvents, phi, now);
    const pos = p ? toWorld(now, p[1], p[2], DECK + .08) : [cx, DECK, 0];
    photon.core.position.set(...pos);
    photon.glow.position.set(...pos);
    const past = pastOf(photonEvents, now), colors = [], col = new THREE.Color(COLOR.photon);
    for (const [t] of past) {
      const k = Math.max(.3 + .7 * Math.exp(-(now - t) / 3), .7 * blend);
      inkFade(col, k, inked);
      colors.push(inked.r, inked.g, inked.b);
    }
    photon.trail.set(flatWorld(past, DECK + .08), colors);
  }

  // The flash from the ship's centre.
  const fe = display(flash.emit), fb = display(flash.back), ff = display(flash.front);
  if (layers.flash) {
    const age = now - fe[0], lastHit = Math.max(fb[0], ff[0]);
    if (age >= 0 && now <= lastHit + .9) {
      const r = Math.min(age, lastHit - fe[0] + .9), ring = [];
      for (let i = 0; i <= 120; i++) {
        const a = i / 120 * Math.PI * 2;
        ring.push(fe[1] + r * Math.cos(a), now * blend + DECK + .1, r * Math.sin(a));
      }
      flashView.ring.set(ring);
      flashView.ring.material.opacity = Math.min(1, (lastHit + .9 - now) / .9);
    } else flashView.ring.set([]);
    const pop = (sprite, event, base) => {
      const since = now - event[0];
      sprite.visible = since >= 0;
      sprite.position.set(...toWorld(event[0], event[1], 0, DECK + .1));
      const k = Math.exp(-Math.max(since, 0) / .5);
      sprite.scale.setScalar(base * (.6 + 1.6 * k) * (blend > .5 ? .7 : 1));
      sprite.material.opacity = Math.max(blend > .5 ? .9 : .15, k);
    };
    pop(flashView.emit, fe, 1.2);
    pop(flashView.back, fb, 1.4);
    pop(flashView.front, ff, 1.4);
    // Lamps ride on the ship's ends (Space view): dim until the light arrives, then lit.
    for (const [lamp, events, hit] of [[lamps.back, backEvents, fb], [lamps.front, frontEvents, ff]]) {
      const end = sr.sliceAt(events, phi, now), lit = now >= hit[0];
      lamp.visible = !!end && blend < .5;
      if (end) lamp.position.set(...toWorld(now, end[1], 0, DECK + .15));
      lamp.material.color.set(lit ? INK.spot : INK.oliveTint);
      lamp.material.opacity = lit ? 1 : .25;
      lamp.scale.setScalar(lit ? 1.1 : .7);
    }
    state.lit = {back: now >= fb[0], front: now >= ff[0]};
    const rays = [];
    for (const target of [flash.back, flash.front]) {
      const past = pastOf([flash.emit, target], now);
      if (past.length === 2) rays.push(...flatWorld(past, .03));
    }
    flashView.rays.set(rays);
    flashView.rays.material.opacity = .85 * blend;
  }

  // "Now" sheets: Earth's (t = Earth's reading) and the ship's (its rest frame, through its centre).
  if (layers.simultaneity) {
    const extent = 32, w = 2.4;
    const corners = eventAt => [[-extent, -w], [extent, -w], [extent, w], [-extent, w]]
      .map(([x, y]) => { const d = display(eventAt(x, y)); return toWorld(d[0], d[1], y); });
    setQuad(sheets.earth.mesh.geometry, corners((x, y) => [earthTau, x, y]));
    setQuad(sheets.ship.mesh.geometry, corners((x, y) => sr.shipEvent(trip, shipTau, [0, x, y])));
    const edge = eventAt => {
      const a = display(eventAt(-extent)), b = display(eventAt(extent));
      return [...toWorld(a[0], a[1], 0, .02), ...toWorld(b[0], b[1], 0, .02)];
    };
    sheets.earth.edge.set(edge(x => [earthTau, x, 0]));
    sheets.ship.edge.set(edge(x => sr.shipEvent(trip, shipTau, [0, x])));
    for (const s of Object.values(sheets)) {
      s.mesh.material.opacity = .07 * blend;
      s.edge.material.opacity = .9 * blend;
      s.mesh.visible = blend > .02;
    }
    band.back.set(flatWorld(pastOf(backEvents, now), .01));
    band.front.set(flatWorld(pastOf(frontEvents, now), .01));
    // Earth's cut: where the two ends are at one Earth time. The ship's cut: one moment of ship time.
    const earthCut = [sr.sliceAt(backEvents, 0, earthTau), sr.sliceAt(frontEvents, 0, earthTau)];
    const shipCut = [sr.shipEvent(trip, shipTau, [0, -L0 / 2]), sr.shipEvent(trip, shipTau, [0, L0 / 2])];
    const segment = (line, ends, key, lift) => {
      if (!ends[0] || !ends[1]) { line.set([]); return; }
      const a = display(ends[0].slice(0, 3)), b = display(ends[1].slice(0, 3));
      line.set([...toWorld(a[0], a[1], 0, lift), ...toWorld(b[0], b[1], 0, lift)]);
      cutLabelAt[key].set(...toWorld((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, lift));
    };
    segment(band.cutEarth, earthCut, 'earth', .06);
    segment(band.cutShip, shipCut, 'ship', .1);
    state.cuts = {earth: earthCut[0] && earthCut[1] ? Math.abs(earthCut[1][1] - earthCut[0][1]) : null, ship: L0};
    // The band and its cuts belong to the one-way cruise; the round trip has its own story.
    for (const line of Object.values(band)) line.material.opacity = settings.roundTrip ? 0 : (line === band.back || line === band.front ? .55 : 1) * blend;
  }

  // Tick 8 of each clock: both lie on the τ = 8 s curve, whatever the frame.
  for (const [sprite, event] of [[eight.earth, [8, 0, 0]], [eight.ship, trip.centreAt(8)]]) {
    const d = display(event);
    sprite.visible = blend > .5 && d[0] <= now;
    sprite.position.set(...toWorld(d[0], d[1], 0));
    sprite.material.opacity = blend;
  }

  // Floor rides with "now" in Time view; time furniture fades in with Time view.
  floor.position.y = now * blend;
  for (const lines of floor.children) lines.material.opacity = lines.userData.opacity * (1 - .55 * blend);
  for (const obj of group.time.children) if (obj.userData.opacity) obj.material.opacity = obj.userData.opacity * blend;
  coneMaterial.uniforms.strength.value = blend;
  for (const h of [nullLines, ...hyperbolae]) h.material.opacity = (h.material.userData.base ??= h.material.opacity) * blend;

  Object.assign(state, {
    now, earthTau, shipTau, u, earthU, fe, fb, ff, ex, cx,
    home: settings.roundTrip && shipTau >= trip.legs[2].tau0,
  });
}

// ---------------------------------------------------------------- readout, markers and labels
const fmt = x => x.toFixed(2);
function updateReadout() {
  const {earthTau, shipTau, u, earthU, now} = state;
  $('earth-tau').textContent = `${fmt(earthTau)} s`;
  $('ship-tau').textContent = `${fmt(shipTau)} s`;
  $('earth-where').textContent = Math.abs(earthU) < 1e-4 ? 'at rest in this frame' : `moving at ${fmt(Math.abs(earthU))} c · ticks ${fmt(sr.gamma(earthU))}× slower`;
  $('ship-where').textContent = Math.abs(u) < 1e-4 ? 'at rest in this frame' : `moving at ${fmt(Math.abs(u))} c · ticks ${fmt(sr.gamma(u))}× slower`;
  const lag = earthTau - shipTau;
  const lagText = who => `${fmt(Math.abs(lag))} s behind ${who}, in this frame`;
  $('earth-sub').textContent = lag < -.005 ? lagText('the ship’s clock') : '';
  $('earth-sub').hidden = !(lag < -.005);
  $('ship-sub').innerHTML = state.home
    ? `home again: the trip took ${trip.legs[2].tau0.toFixed(1)} s of ship time and ${(2 * TURN_AT).toFixed(1)} s of Earth time`
    : `${lag > .005 ? `${lagText('Earth’s clock')}<br>` : ''}length here ${fmt(sr.contractedLength(L0, u))} ls (${L0.toFixed(2)} at rest)`;
  // Bars: time each clock has lived, as a share of this frame's time.
  const share = tau => now > .01 ? Math.min(1, tau / now) : 1;
  $('bar-earth').style.width = `${share(earthTau) * 100}%`;
  $('bar-ship').style.width = `${share(shipTau) * 100}%`;
  $('row-flash').hidden = !layers.flash;
  if (layers.flash) {
    const gap = state.ff[0] - state.fb[0];
    $('flash-gap').textContent = Math.abs(gap) < .005 ? 'both ends together' : gap > 0 ? `back first, by ${fmt(gap)} s` : `front first, by ${fmt(-gap)} s`;
    const lit = t => now >= t ? 'lit' : 'not yet';
    $('flash-sub').textContent = `back at ${fmt(state.fb[0])} s (${lit(state.fb[0])}) · front at ${fmt(state.ff[0])} s (${lit(state.ff[0])})`;
  }
  const marks = [];
  if (layers.flash) {
    marks.push({t: state.fe[0], label: 'flash', color: '#2f3614'});
    marks.push({t: state.fb[0], label: Math.abs(state.ff[0] - state.fb[0]) > .4 ? 'back lit' : 'both lit', color: '#c8541f'});
    if (Math.abs(state.ff[0] - state.fb[0]) > .4) marks.push({t: state.ff[0], label: 'front lit', color: '#c8541f'});
  }
  if (settings.roundTrip) {
    marks.push({t: display(trip.centreAt(trip.legs[1].tau0))[0], label: 'turn', color: '#56612a'});
    marks.push({t: display(trip.centreAt(trip.legs[2].tau0))[0], label: 'home', color: '#c8541f'});
  }
  transport.setMarkers(marks);
}

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
function hidePool(kind, from) { for (const el of (pool[kind] ?? []).slice(from)) el.style.visibility = 'hidden'; }

function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  const pin = (el, x, y, z, show = true) => positionLabel(el, labelPoint.set(x, y, z), camera, {show, avoid: rects});
  const cutsOn = layers.simultaneity && blend > .6 && state.cuts && !settings.roundTrip;
  // On phones the cut labels need the room, so the name labels step aside while they show.
  const names = !(cutsOn && narrow());
  pin($('label-earth'), state.ex + EARTH_R, state.now * blend + EARTH_R * 2.2, 0, names);
  // When Earth and ship meet (the end of a round trip), drop the ship's label below Earth's.
  const together = Math.abs(state.ex - state.cx) < 1.5;
  pin($('label-ship'), state.cx, state.now * blend + (together ? -.9 : DECK + .5), .55, names);
  $('label-cut-earth-text').textContent = state.cuts?.earth ? `Earth’s cut ${fmt(state.cuts.earth)} ls` : '';
  $('label-cut-ship-text').textContent = `Ship’s cut ${fmt(L0)} ls`;
  // Earth's cut is labelled below its segment, the ship's above, so the two never collide.
  positionLabel($('label-cut-earth'), labelPoint.copy(cutLabelAt.earth).setY(cutLabelAt.earth.y - 1.1), camera, {show: cutsOn && !!state.cuts?.earth, avoid: rects});
  positionLabel($('label-cut-ship'), labelPoint.copy(cutLabelAt.ship).setY(cutLabelAt.ship.y + 1.5), camera, {show: cutsOn, avoid: rects});
  const lampsOn = layers.flash && blend < .5 && state.lit;
  $('label-back-text').textContent = state.lit?.back ? 'Back · lit' : 'Back · not yet';
  $('label-front-text').textContent = state.lit?.front ? 'Front · lit' : 'Front · not yet';
  positionLabel($('label-back'), labelPoint.copy(lamps.back.position).setY(lamps.back.position.y + .7), camera, {show: lampsOn, avoid: rects});
  positionLabel($('label-front'), labelPoint.copy(lamps.front.position).setY(lamps.front.position.y + .7), camera, {show: lampsOn, avoid: rects});
  pin($('label-cone'), -10, 10, 0, layers.invariants && blend > .6);

  // Time view: tick numbers every 4 s, times on the axis, and the invariant curves.
  let n = 0;
  const showTicks = blend > .6;
  for (const [kind, events] of [['earth', i => [i, 0, 0]], ['ship', i => trip.centreAt(i)]]) {
    for (let i = 4; i <= 24; i += 4) {
      const d = display(events(i));
      if (!showTicks || d[0] > state.now) continue;
      const el = poolLabel('tick', n++), name = el.querySelector('.name');
      name.textContent = `${i} s`;
      name.style.color = kind === 'earth' ? '#c8541f' : '#56612a';
      pin(el, ...toWorld(d[0], d[1], 0));
    }
  }
  hidePool('tick', n);
  // The time axis sits just left of the leftmost worldline, clear of the tour card.
  const axisX = Math.min(state.ex, state.cx) - (narrow() ? 3 : 4.5);
  for (let i = 0; i < 5; i++) {
    const el = poolLabel('axis', i);
    el.querySelector('.name').textContent = `${(i + 1) * 5} s`;
    pin(el, axisX, (i + 1) * 5, -3, blend > .6);
  }
  // Curve labels on the left branch, away from the clocks' own tick labels.
  [4, 8, 12, 16, 20].forEach((s, i) => {
    // On the right branch, between the ship's worldline and the light cone.
    const el = poolLabel('curve', i), xl = s * 1.1;
    el.querySelector('.name').textContent = s === 8 ? 'τ = 8 s: tick 8 of both clocks' : `τ = ${s} s`;
    pin(el, xl, Math.hypot(s, xl), 0, layers.invariants && blend > .6 && s % 8 === 0);
  });
}

// ---------------------------------------------------------------- event inspector (Time view)
const projected = new THREE.Vector3();
function pick(clientX, clientY) {
  if (blend < .6) return null;
  let best = null, bestD = narrow() ? 22 : 16;
  for (const k of candidates) {
    if (k.layer && !layers[k.layer]) continue;
    const d = display(k.e);
    if (d[0] > state.now) continue;
    projected.set(...toWorld(d[0], d[1], 0)).project(camera);
    if (projected.z > 1) continue;
    const sx = (projected.x * .5 + .5) * innerWidth, sy = (-projected.y * .5 + .5) * innerHeight;
    const dist = Math.hypot(sx - clientX, sy - clientY);
    if (dist < bestD) { bestD = dist; best = {...k, d}; }
  }
  return best;
}
function describe(k) {
  const [t, x] = k.e, [ts, xs] = shipFrame(k.e), s2 = sr.interval(k.e);
  const note = k.light ? 'Reached by the flash: on the flash’s light cone.'
    : s2 > 1e-9 ? `Time from launch along a straight path: √(t² − x²) = ${fmt(Math.sqrt(s2))} s, in every frame.`
      : 'On the light cone of the launch.';
  return `<h4>${k.title}</h4>
    <div class="row"><span>Earth frame</span><span>t = ${fmt(t)} s · x = ${fmt(x)} ls</span></div>
    <div class="row"><span>Ship frame${settings.roundTrip ? ' (out)' : ''}</span><span>t′ = ${fmt(ts)} s · x′ = ${fmt(xs)} ls</span></div>
    <div class="note">${note}</div>`;
}
function inspect(x, y) {
  const k = pick(x, y);
  $('scene').classList.toggle('pointing', !!k);
  showTip(x, y, k && describe(k));
  hover.material.opacity = k ? .9 : 0;
  if (k) hover.position.set(...toWorld(k.d[0], k.d[1], 0));
}
let downAt = null;
$('scene').addEventListener('pointermove', event => { if (event.pointerType === 'mouse' && !event.buttons) inspect(event.clientX, event.clientY); });
$('scene').addEventListener('pointerdown', event => { downAt = [event.clientX, event.clientY]; });
$('scene').addEventListener('pointerup', event => {
  if (downAt && Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) < 6) inspect(event.clientX, event.clientY);
});
$('scene').addEventListener('pointerleave', () => { showTip(0, 0, null); hover.material.opacity = 0; });

// ---------------------------------------------------------------- camera
// The camera orbits an anchor that follows the action; each framing sets the offset.
const FRAMING = {
  follow: () => narrow() ? [-1, 10, 11] : [-1.6, 5.4, 7.2],
  overview: () => narrow() ? [0, 30, 21] : [0, 15, 11.5],
  time: () => narrow() ? [-7, 6, 70] : [-10, 5, 47],
};
let framing = 'overview', offsetTween = null;
const anchor = new THREE.Vector3(), anchorGoal = new THREE.Vector3(), offset = new THREE.Vector3();
function computeAnchorGoal() {
  if (framing === 'follow' && targetBlend < .5) return anchorGoal.set(state.cx, state.now * blend, 0);
  const mid = T_MAX / 2, a = sr.sliceAt(earthEvents, phi, mid), b = sr.sliceAt(centreEvents, phi, mid);
  return anchorGoal.set(((a?.[1] ?? 0) + (b?.[1] ?? 0)) / 2, blend * (mid - 1), 0);
}
function setFraming(name, animate = true) {
  framing = name;
  const to = new THREE.Vector3(...FRAMING[name]());
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
  $('view-note').textContent = isTime ? 'Time view · tap a tick to inspect it' : 'Space view · where everything is, now';
  if (announce) {
    toast(isTime ? 'Time runs upward. Light travels at 45°.' : 'Positions at this moment, in the chosen frame.');
    setFraming(isTime ? 'time' : spaceFraming);
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
const cycleFrame = () => {
  const order = settings.roundTrip ? ['earth', 'ship', 'return'] : ['earth', 'ship'];
  setFrame(order[(order.indexOf(frameName) + 1) % order.length], true);
};

const transport = createTransport({max: T_MAX, speed: 1.6});

$('view-space').onclick = () => setView(false, true);
$('view-time').onclick = () => setView(true, true);
$('reset-camera').onclick = () => setFraming(targetBlend > .5 ? 'time' : spaceFraming);
for (const id of ['earth', 'ship', 'return']) $('frame-' + id).onclick = () => setFrame(id, true);
for (const chip of document.querySelectorAll('.chip')) {
  chip.onclick = () => { layers[chip.dataset.layer] = !layers[chip.dataset.layer]; applyLayers(); };
}
// Speed changes take effect immediately, without restarting the run.
$('speed').addEventListener('input', event => {
  settings.v = +event.target.value;
  rebuild();
  phi = targetPhi;
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
const toggleView = () => setView(targetBlend < .5, true);
bindKeys({
  ' ': () => transport.toggle(),
  ArrowRight: () => transport.nudge(.5),
  ArrowLeft: () => transport.nudge(-.5),
  f: cycleFrame, F: cycleFrame, t: toggleView, T: toggleView,
  r: () => transport.restart(), R: () => transport.restart(),
});

const story = createStory({
  steps,
  onEnter(step, index) {
    settings.roundTrip = step.trip === 'round';
    frameName = step.frame;
    rebuild();
    spaceFraming = step.camera ?? 'overview';
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
offset.set(...FRAMING.overview());
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

let lastFrame = performance.now();
function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((time - lastFrame) / 1000, .08));
  lastFrame = time;
  if (!document.hidden) transport.tick(dt);
  const ease = Math.min(1, dt * 3.5);
  if (blend !== targetBlend) { blend += (targetBlend - blend) * ease; if (Math.abs(blend - targetBlend) < 1e-3) blend = targetBlend; }
  if (phi !== targetPhi) { phi += (targetPhi - phi) * ease; if (Math.abs(phi - targetPhi) < 1e-4) phi = targetPhi; }

  update(transport.t);

  controls.update();
  offset.copy(camera.position).sub(controls.target);
  if (offsetTween) {
    offsetTween.u = Math.min(1, offsetTween.u + dt / 1.3);
    const k = offsetTween.u < .5 ? 2 * offsetTween.u ** 2 : 1 - (-2 * offsetTween.u + 2) ** 2 / 2;
    offset.lerpVectors(offsetTween.from, offsetTween.to, k);
    if (offsetTween.u === 1) offsetTween = null;
  }
  anchor.lerp(computeAnchorGoal(), reducedMotion ? 1 : Math.min(1, dt * 5));
  controls.target.copy(anchor);
  camera.position.copy(anchor).add(offset);
  stage.setFogFor(offset.length());

  updateReadout();
  updateLabels();
  stage.render();
}
requestAnimationFrame(frame);

// With ?debug in the URL, expose hooks for checks: jump to a time and finish camera and frame moves at once.
if (new URLSearchParams(location.search).has('debug')) {
  window.__sr = {
    settings, story,
    at(t) { const s = $('scrub'); s.value = t; s.dispatchEvent(new Event('input')); },
    snap() { if (offsetTween) offsetTween.u = .999; blend = targetBlend; phi = targetPhi; update(transport.t); anchor.copy(computeAnchorGoal()); },
  };
}
