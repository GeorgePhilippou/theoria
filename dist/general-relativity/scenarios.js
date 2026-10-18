// Plates for the chart table. Positions are given as a distance r (in rₛ) and a bearing in degrees,
// anticlockwise from the right; lasers and beams by x, y and an aim in degrees.
import * as gr from './physics.js';

const f2 = x => x.toFixed(2), f1 = x => x.toFixed(1);

export const plates = [
  {
    id: 'clocks', label: 'Two clocks', viewR: 9,
    title: 'Time runs slower near the hole.',
    text: `<p>Clock <b>C1</b> is held still just outside the horizon and <b>C2</b> far out. Both are perfect clocks, yet C1’s hand turns at about half C2’s rate.</p>
      <p>It is not an illusion of signal delays: bring them together later and C1 has aged less. Select a clock to read its rate exactly; the rings are labelled with the rate of a clock held at each one.</p>`,
    formula: 'dτ = dt √(1 − rₛ / r)', note: 'τ: time on a clock held still at r',
    tries: ['Drag C1 towards the horizon and watch its rate fall.', 'Add a third clock from the tray at 1.05 rₛ.', 'Switch the units to Sun to see real times.'],
    setup(lab) { lab.addClock(1.3, -30); lab.addClock(8, -30); },
    insight(lab) {
      const [a, b] = lab.clocks;
      if (!a || !b) return '';
      return `While C2 ages <b>${lab.time(b.tau)}</b>, C1 ages <b>${lab.time(a.tau)}</b>: a ratio of <b>${f2(gr.rate(lab.radius(a)) / gr.rate(lab.radius(b)))}</b>.`;
    },
  },
  {
    id: 'river', label: 'River of space', viewR: 5, view: 'river',
    title: 'Space flows into the hole like a river.',
    text: `<p>Here is the same spacetime pictured another, exact, way. Space itself flows inwards, like a river, faster and faster as it nears the hole: at √(rₛ / r) times the speed of light, as measured by anyone held still. At the horizon it reaches the speed of light.</p>
      <p>Light always moves at <b>c through the flowing space</b>. So each flash spreads at c but is carried downstream. Far out it escapes easily; near the horizon light aimed outwards barely makes headway; inside, even outward light is swept in.</p>
      <p>A clock held still is <b>swimming upstream</b> at the river’s speed, so, just as in special relativity, it runs slow, by √(1 − v²). That is the slowing of time near the hole. Time and space are not bent separately: it is one flow.</p>`,
    formula: 'v = √(rₛ / r) · c,  rate = √(1 − v²/c²)', note: 'the river speed, and the slowing of a clock held still',
    tries: ['Watch the flash just outside the horizon: its outer edge hardly moves.', 'Click anywhere to set off your own flash; try inside 1.2 rₛ.', 'Drag a clock in and read its swimming speed and its rate.'],
    setup(lab) {
      lab.addClock(1.15, 205); lab.addClock(2, 205); lab.addClock(4.5, 205);
      lab.flashSite(1.12, -40); lab.flashSite(2.8, 60);
      lab.select(lab.clocks[0]);
    },
    insight(lab) {
      const c = lab.clocks[0];
      if (!c) return '';
      const r = lab.radius(c), v = gr.riverSpeed(r);
      return `C1 at ${f2(r)} rₛ swims against a river of <b>${f2(v)}c</b>, so it ticks at √(1 − ${f2(v)}²) = <b>${f2(gr.rate(r))}</b> of a far clock’s rate.`;
    },
  },
  {
    id: 'signal', label: 'Signals home', viewR: 9,
    title: 'Light climbing out arrives stretched.',
    text: `<p>Clock <b>C1</b>, held at 1.2 rₛ, sends a flash every 2 units of its own time. The flashes climb out to <b>C2</b> at 8 rₛ and arrive further apart than they were sent, by exactly the ratio of the two clock rates.</p>
      <p>Every wave in the light is stretched the same way: <b>gravitational redshift</b>.</p>`,
    formula: 'ν_far / ν_near = √(1 − 1/r_near) / √(1 − 1/r_far)', note: 'frequency received ÷ frequency sent',
    tries: ['Select C2 and read the gap between arrivals.', 'Drag C1 closer to the horizon: the gaps grow without limit.', 'Turn on signals for C2 to send light down: it arrives bunched up (blueshift).'],
    setup(lab) { lab.addClock(1.2, 150, {beacon: true}); lab.addClock(8, 150); lab.select(lab.clocks[1]); },
    insight(lab) {
      const [a, b] = lab.clocks;
      if (!a || !b) return '';
      const gaps = lab.gaps(b, a);
      return `C1 sends every <b>${lab.time(2)}</b> of its own time; C2 receives one every <b>${gaps.length ? lab.time(gaps.at(-1)) : '…'}</b> of its own time (exact: ${lab.time(2 * gr.rate(lab.radius(b)) / gr.rate(lab.radius(a)))}).`;
    },
  },
  {
    id: 'bending', label: 'Bending light', viewR: 8,
    title: 'Gravity bends light, and can capture it.',
    text: `<p>A beam of parallel light passes the hole. Far out it barely bends; closer in it swings round; inside a critical distance it falls in.</p>
      <p>Select the beam to read each ray’s impact parameter, how close it came, and how much it was bent.</p>`,
    formula: 'captured if b < 3√3/2 rₛ ≈ 2.60 rₛ', note: 'b: how far off-centre the ray is aimed',
    tries: ['Drag the beam up and down: watch which rays are captured.', 'Widen the beam in its specification.', 'Add a laser and aim it just past the photon sphere.'],
    setup(lab) { lab.addBeam(-11, 0, 0, {count: 13, width: 10}); },
    insight(lab) {
      const s = lab.sources[0];
      if (!s?.rays) return '';
      const caught = s.rays.filter(r => r.outcome === 'captured').length;
      const bent = s.rays.filter(r => r.outcome === 'escapes').map(r => r.bend);
      return `<b>${caught}</b> of ${s.rays.length} rays are captured; the escaping rays turn through up to <b>${f1(Math.max(0, ...bent))}°</b> while on the chart.`;
    },
  },
  {
    id: 'sphere', label: 'Photon sphere', viewR: 4.5,
    title: 'At 1.5 rₛ light can go round in a circle.',
    text: `<p>Two lasers aim sideways, at right angles to the hole. The one at 1.5 rₛ, the <b>photon sphere</b>, circles before it falls in or escapes; nudge it outwards by a hair and it spirals out.</p>
      <p>Standing at the photon sphere you could, in principle, see the back of your own head.</p>`,
    formula: 'r = 3/2 rₛ', note: 'light’s only circular orbit, and an unstable one',
    tries: ['Drag the laser at 1.5 rₛ slightly in or out.', 'Count the laps in the readings.', 'Turn it a few degrees outwards.'],
    setup(lab) { lab.addLaser(0, -1.5, 0); lab.addLaser(0, 2.4, 180); },
    insight(lab) {
      const s = lab.sources[0];
      if (!s?.rays) return '';
      const r = s.rays[0];
      return `Laser L1’s light goes round <b>${f2(r.turns)}</b> times before it ${r.outcome === 'captured' ? 'falls in' : 'escapes'}.`;
    },
  },
  {
    id: 'fall', label: 'Falling in', viewR: 9,
    title: 'Falling through the horizon.',
    text: `<p>Probe <b>P1</b> is let go from rest at 6 rₛ and sends a signal every 2 units of its own time. On its own clock it crosses the horizon after a short, finite time; nothing special happens there.</p>
      <p>Seen from far away the signals arrive further and further apart, and none sent from inside ever comes out. Open the <b>Spacetime map</b> to see its path cross the horizon.</p>`,
    formula: 'τ to the horizon from 6 rₛ = ' + f1(gr.freeFall(6).tauHorizon) + ' rₛ/c', note: 'on the probe’s own clock',
    tries: ['Switch to the Spacetime map and watch the light cones tip over.', 'Select C1 to read the growing gaps between signals.', 'Drop a second probe from further out.'],
    setup(lab) { lab.addClock(8, 25); lab.addProbe(6, 25, {beacon: true}); lab.select(lab.probes[0]); },
    insight(lab) {
      const p = lab.probes[0], c = lab.clocks[0];
      if (!p || !c) return '';
      const got = lab.received(c, p);
      return `P1 has sent <b>${p.sent}</b> signals; C1 has received <b>${got}</b>${p.crossed != null ? `. P1 crossed the horizon at τ = <b>${lab.time(p.crossed)}</b> on its own clock` : ''}.`;
    },
  },
  {
    id: 'orbits', label: 'Orbits', viewR: 9,
    title: 'Orbits that precess, and orbits that cannot last.',
    text: `<p>Three bodies, launched sideways. <b>O1</b> at 6 rₛ goes round in a circle. <b>O2</b>, a little too slow from 7 rₛ, swings in and out, and its closest point moves on each lap: the orbit <b>precesses</b>, as Mercury’s does, but far more.</p>
      <p><b>O3</b> at 2.8 rₛ is inside 3 rₛ, where no circle is stable: it goes round once and spirals in.</p>`,
    formula: 'stable circles only for r > 3 rₛ', note: 'the innermost stable circular orbit',
    tries: ['Select O2 and read its precession per lap.', 'Raise a launch speed above 1.4 × circular: it escapes.', 'Drag an orbiter in to 3.2 rₛ and see how slowly it settles.'],
    speed: 5,
    setup(lab) {
      lab.addOrbiter(6, 0, {push: 1});
      lab.addOrbiter(7, 120, {push: .9});
      lab.addOrbiter(2.8, 240, {push: .999});
      lab.select(lab.orbiters[1]);
    },
    insight(lab) {
      const o = lab.orbiters[1];
      return o?.precession ? `O2’s closest point moves on by <b>${f1(o.precession)}°</b> each lap.` : 'Each orbit’s full path is drawn faintly ahead of the body.';
    },
  },
  {
    id: 'free', label: 'Free chart', viewR: 10,
    title: 'Your own experiment.',
    text: `<p>An empty chart with one clock far away. Add clocks, lasers, beams, probes and orbiters from the tray, drag them anywhere, and read every number in the specification and readings.</p>`,
    formula: 'geodesics of the Schwarzschild metric', note: 'light and free fall follow the straightest paths there are',
    tries: ['Drop a probe and aim a laser after it.', 'Put a clock at 1.5 rₛ next to a sideways laser.', 'Launch orbiters at the same radius with different speeds.'],
    setup(lab) { lab.addClock(9, 200); },
    insight: () => '',
  },
];
