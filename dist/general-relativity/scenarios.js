// Starting set-ups for the black-hole lab. Each one places a few things and explains what to look for;
// after that everything is live: drag, add, aim and drop with the tools.
import * as gr from './physics.js';

const f = (x, d = 2) => x.toFixed(d);

export const scenarios = [
  {
    id: 'clocks', label: 'Two clocks',
    title: 'Time runs slower near the hole.',
    text: `<p>Clock <b>A</b> is held still just outside the horizon, clock <b>B</b> far out. Both are perfect clocks, yet A’s hand turns at about half B’s rate.</p>
      <p>It is not an illusion of signal delays: bring them together later and A has aged less. In figure 3 both are vertical lines; the dots are their ticks, spaced wider on A.</p>`,
    formula: 'τ = t √(1 − 1/r)', note: 'r in units of the horizon radius rₛ',
    tries: ['Drag A towards the horizon, in figure 1 or along the curve in figure 2.', 'Put a third clock at 1.05 rₛ.', 'Switch to Sun-mass to see the real times.'],
    viewR: 8.6, span: 18,
    setup(lab) { lab.addClock(1.3, -.6, {name: 'A'}); lab.addClock(8, -.6, {name: 'B'}); },
    insight(lab) {
      const [a, b] = lab.clocks;
      if (!a || !b) return '';
      return `While B has aged <b>${lab.time(b.tau)}</b>, A has aged <b>${lab.time(a.tau)}</b>: A runs at <b>${f(gr.rate(a.r) / gr.rate(b.r))}</b> of B’s rate.`;
    },
  },
  {
    id: 'light', label: 'Light rays',
    title: 'Gravity bends light.',
    text: `<p>Parallel rays of light come in from the left. Far out they barely bend; closer in they swing round the hole. Inside a critical distance they are captured, and near it they loop round <b>the photon sphere</b> before escaping.</p>
      <p>The arrows point along each ray’s travel. In figure 3 every ray climbs at the slope of a light-cone edge.</p>`,
    formula: 'captured if b < 3√3/2 rₛ ≈ 2.60 rₛ', note: 'b: how far off-centre the ray is aimed',
    tries: ['Choose + Light, then press and drag in figure 1 to aim your own ray.', 'Aim one sideways from just outside 1.5 rₛ: it circles the hole.', 'Aim straight outwards from 1.1 rₛ: it escapes, but slowly.'],
    viewR: 8, span: 14,
    setup(lab) {
      for (let y = -4.2; y <= 4.21; y += .6) lab.addRay(-11.5, y, 1, 0, {quiet: true});
      lab.addRay(-11.5, 2.62, 1, 0, {quiet: true});
    },
    insight(lab) {
      const caught = lab.rays.filter(r => r.outcome === 'captured').length;
      return lab.rays.length ? `<b>${caught}</b> of ${lab.rays.length} rays fall in; the rest escape, bent by up to <b>${lab.maxBend()}°</b>.` : '';
    },
  },
  {
    id: 'fall', label: 'Fall in',
    title: 'Falling through the horizon.',
    text: `<p>Probe <b>C</b> is let go from rest at 6 rₛ and sends a signal every 2 units of its own time. On its own clock it crosses the horizon after a short, finite time, and nothing special happens there.</p>
      <p>Watch the signals reach <b>B</b>: further and further apart, and none from inside ever arrives. In figure 3, see C’s path cross r = 1 while the light cones tip over.</p>`,
    formula: 'τ to the horizon ≈ ' + f(gr.freeFall(6).tauHorizon, 1) + ' rₛ/c', note: 'on C’s own clock, dropped from 6 rₛ',
    tries: ['Watch figure 3 after C crosses: its signals lean inwards too.', 'Drop more probes from further out with Drop probe.', 'Turn on Signals for B and see them fall in to meet C.'],
    viewR: 8.4, span: 22,
    setup(lab) { lab.addClock(8, .4, {name: 'B'}); lab.dropProbe(6, .4, {name: 'C', beacon: true}); },
    insight(lab) {
      const c = lab.probes[0], b = lab.clocks[0];
      if (!c || !b) return '';
      const got = b.received.filter(x => x.from === c);
      const gaps = got.slice(1).map((x, i) => x.tau - got[i].tau);
      const parts = [`C has sent <b>${c.sent}</b> signals; B has received <b>${got.length}</b>.`];
      if (gaps.length) parts.push(`The latest arrived <b>${lab.time(gaps.at(-1))}</b> after the one before (sent ${lab.time(2)} apart).`);
      if (c.crossed != null) parts.push(`C crossed the horizon at <b>τ = ${lab.time(c.crossed)}</b> on its own clock.`);
      if (c.done) parts.push(`It reached r = 0 at τ = ${lab.time(c.fall.tauCentre)}.`);
      return parts.join(' ');
    },
  },
  {
    id: 'orbits', label: 'Orbits',
    title: 'Orbits that precess, and orbits that cannot last.',
    text: `<p>Three bodies are launched sideways. One at 6 rₛ moves in a circle. One launched a little too slowly from 7 rₛ swings in and out, and its closest point creeps round: the orbit <b>precesses</b>, as Mercury’s does, but much more.</p>
      <p>Inside 3 rₛ no circle is stable: the body at 2.8 rₛ, launched at 99.9% of circular speed, goes round once and then spirals in. Time runs fast here, so laps pass quickly.</p>`,
    formula: 'stable circles only for r > 3 rₛ', note: 'the innermost stable circular orbit (ISCO)',
    tries: ['Choose + Orbit and click anywhere; set the launch speed first.', 'Launch at 1.35 × circular speed: it escapes.', 'Compare the clocks of the orbiting bodies in Instruments.'],
    viewR: 9, span: 120, speed: 7,
    setup(lab) {
      lab.addOrbit(6, 0, gr.circularL(6), {name: 'D'});
      lab.addOrbit(7, 2.1, gr.circularL(7) * .9, {name: 'E'});
      lab.addOrbit(2.8, 4.2, gr.circularL(2.8) * .999, {name: 'F'});
    },
    insight(lab) {
      const e = lab.orbits.find(o => o.name === 'E'), fo = lab.orbits.find(o => o.name === 'F');
      const parts = [];
      if (e?.periapses?.length > 1) {
        const p = e.periapses, shift = ((p.at(-1) - p.at(-2)) * 180 / Math.PI - 360);
        parts.push(`E’s closest point moves on by <b>${f(shift, 0)}°</b> each lap.`);
      }
      if (fo?.outcome === 'plunges') parts.push(fo.gone ? 'F has fallen in.' : 'F is unstable and will fall in.');
      return parts.join(' ') || 'Each orbit traces its path as it goes; the arrows show its direction.';
    },
  },
  {
    id: 'signal', label: 'Signal home',
    title: 'Light climbing out loses energy.',
    text: `<p>Clock <b>A</b>, held at 1.2 rₛ, flashes a signal every 2 units of its own time. The flashes climb out to <b>B</b> at 8 rₛ.</p>
      <p>B receives them further apart than they were sent, by exactly the ratio of the two clock rates: every wave in the light is stretched the same way. This is <b>gravitational redshift</b>.</p>`,
    formula: 'ν<sub>B</sub> / ν<sub>A</sub> = √(1 − 1/r<sub>A</sub>) / √(1 − 1/r<sub>B</sub>)', note: 'frequency received ÷ frequency sent',
    tries: ['Drag A closer to the horizon and watch the gaps grow.', 'Use Signals on B to send light down to A: it arrives bunched up (blueshift).', 'Move B in close too: the shift shrinks.'],
    viewR: 8.6, span: 20,
    setup(lab) { lab.addClock(1.2, 2.6, {name: 'A', beacon: true}); lab.addClock(8, 2.6, {name: 'B'}); },
    insight(lab) {
      const [a, b] = lab.clocks;
      if (!a || !b) return '';
      const got = b.received.filter(x => x.from === a), gaps = got.slice(1).map((x, i) => x.tau - got[i].tau);
      const expect = 2 * gr.rate(b.r) / gr.rate(a.r);
      return `A sends every <b>${lab.time(2)}</b> of its time. B receives one every <b>${gaps.length ? lab.time(gaps.at(-1)) : '…'}</b> of its time (predicted ${lab.time(expect)}): a factor <b>${f(gr.rate(b.r) / gr.rate(a.r))}</b> in frequency.`;
    },
  },
  {
    id: 'free', label: 'Free bench',
    title: 'Your own experiment.',
    text: `<p>An empty bench with one reference clock far away. Place clocks, aim light, drop probes and launch orbits with the tools; everything you add moves by the same exact laws.</p>
      <p>Hover over anything for its numbers. Figure 3 records the history of everything you add.</p>`,
    formula: 'geodesics of the Schwarzschild metric', note: 'free fall and light follow the straightest paths in curved spacetime',
    tries: ['Drop a probe and send light down after it.', 'Put a clock at 1.5 rₛ and aim light sideways from it.', 'Turn on Signals for several clocks at once.'],
    viewR: 9, span: 20,
    setup(lab) { lab.addClock(8.4, -2.4, {name: 'Far'}); },
    insight: () => '',
  },
];
