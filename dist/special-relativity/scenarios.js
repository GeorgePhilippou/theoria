// Routes on the relativity railway. Each sets up trains, structures and events in the platform frame S;
// after that it is a sandbox: ride any train, scrub time, add trains, flashes and events.
import * as sr from './physics.js';

const f = (x, d = 2) => (Math.abs(x) < 5e-3 ? 0 : x).toFixed(d);

export const routes = [
  {
    id: 'clock', label: 'Light clock',
    title: 'A moving clock runs slow.',
    text: `<p>Train <b>A</b> carries a <b>light clock</b>: a pulse of light bouncing between two mirrors. Ride with A and the pulse goes straight up and down.</p>
      <p>From the platform the same pulse zigzags: a longer path at the same speed, c. So each tick takes longer, and every clock on A, of any kind, keeps pace with it.</p>`,
    formula: 'Δt = γ Δτ,  γ = 1/√(1 − v²)', note: 'Δτ: time on the moving clock',
    tries: ['Switch between Platform and A, and watch the zigzag straighten.', 'Drag the lever: the faster A moves past you, the slower its clock.', 'Compare A’s centre clock with the station clocks it passes.'],
    range: [0, 12], frame: 0,
    setup(lab) { lab.addTrain({name: 'A', v: .6, L0: 6, x0: -3.6, lightClock: true}); },
    insight(lab) {
      const a = lab.find('A'), u = lab.rel(a), now = lab.bodyNow(a);
      if (!now) return '';
      return `In your frame A moves at <b>${f(u)} c</b>, so its clocks run at <b>${f(1 / sr.gamma(u), 3)}</b> of yours. A’s centre clock reads <b>${f(now.tau, 1)} s</b>.`;
    },
  },
  {
    id: 'simul', label: 'Same moment?',
    title: 'Simultaneous for one, not for another.',
    text: `<p>A flash goes off in the middle of train <b>A</b>. Riding with A, the light reaches the back and the front at the same moment: both are 5 ls away.</p>
      <p>From the platform the back moves towards the light and the front away from it, so the back is lit first. Neither view is wrong: “at the same time” depends on who is asking.</p>`,
    formula: 'Δt = γ v Δx′', note: 'events Δx′ apart and simultaneous on the train',
    tries: ['Ride with A, then the Platform, and read the two times on the board.', 'Drag the lever the other way: now the front is lit first.', 'Turn on Other frames’ “now” to see A’s tilted slices.'],
    range: [-1, 10], frame: 0,
    setup(lab) {
      const u = .6, L0 = 10;
      lab.addTrain({name: 'A', v: u, L0, x0: 0});
      const flash = [1, u * 1], [tp] = sr.toFrame(flash, u);
      lab.addEvent({name: 'Flash', t: flash[0], x: flash[1], light: true});
      const back = sr.fromFrame([tp + L0 / 2, -L0 / 2], u), front = sr.fromFrame([tp + L0 / 2, L0 / 2], u);
      lab.addEvent({name: 'Back lit', t: back[0], x: back[1]});
      lab.addEvent({name: 'Front lit', t: front[0], x: front[1]});
      lab.select = ['Back lit', 'Front lit'];
    },
    insight(lab) {
      const b = lab.eventIn('Back lit'), fr = lab.eventIn('Front lit');
      if (!b || !fr) return '';
      const d = fr[0] - b[0];
      return Math.abs(d) < .01 ? 'In your frame the back and front are lit at <b>the same moment</b>.' :
        `In your frame the <b>${d > 0 ? 'back' : 'front'}</b> is lit first, <b>${f(Math.abs(d))} s</b> before the ${d > 0 ? 'front' : 'back'}.`;
    },
  },
  {
    id: 'tunnel', label: 'Tunnel paradox',
    title: 'Does the long train fit in the short tunnel?',
    text: `<p>Train <b>A</b> is 10 ls long, the tunnel 6.4 ls. At 0.8 c the train is shortened to 6 ls in the platform frame, so both doors can shut for a moment, at once, with the train inside.</p>
      <p>Ride with A: now the <b>tunnel</b> is shortened, to 3.84 ls. Yet nothing collides, because the doors no longer shut together: the exit shuts and reopens before the back of the train arrives.</p>`,
    formula: 'L = L₀ / γ', note: 'a moving object is shorter along its motion',
    tries: ['Ride with A and read the two door times on the board.', 'Scrub to t = 0 on the platform: the train exactly fills the tunnel.', 'Slow A down with the Move tool (drag its handle in the diagram).'],
    range: [-6, 6], frame: 0,
    setup(lab) {
      lab.addTunnel({name: 'Tunnel', a: -3.2, b: 3.2});
      lab.addTrain({name: 'A', v: .8, L0: 10, x0: 0});
      lab.addEvent({name: 'Entrance shuts', t: 0, x: -3.2});
      lab.addEvent({name: 'Exit shuts', t: 0, x: 3.2});
      lab.select = ['Entrance shuts', 'Exit shuts'];
    },
    insight(lab) {
      const a = lab.find('A'), u = lab.rel(a), tunnelV = lab.relV(0);
      const i = lab.eventIn('Entrance shuts'), e = lab.eventIn('Exit shuts');
      const doors = Math.abs(i[0] - e[0]) < .01 ? 'shut at the same moment' : `shut ${f(Math.abs(i[0] - e[0]))} s apart, the ${i[0] < e[0] ? 'entrance' : 'exit'} first`;
      return `In your frame the train is <b>${f(10 / sr.gamma(u))} ls</b> long and the tunnel <b>${f(6.4 / sr.gamma(tunnelV))} ls</b>. The doors <b>${doors}</b>.`;
    },
  },
  {
    id: 'mutual', label: 'Who is slow?',
    title: 'Each train sees the other’s clocks run slow.',
    text: `<p>Trains <b>A</b> and <b>B</b> pass each other at 0.5 c each way, at 0.8 c relative to each other. Ride with A: B’s clocks run slow. Ride with B: A’s run slow.</p>
      <p>There is no contradiction, because they compare clocks at different places, and disagree about which readings happen “at the same time”.</p>`,
    formula: 'v_rel = (u + v)/(1 + uv) = 0.8 c', note: 'not 1.0 c: speeds do not simply add',
    tries: ['Ride with A, then B: whose clock is behind each time?', 'Turn on Other frames’ “now”: each slice cuts the other’s worldline at a different tick.', 'Ride with the Platform: both are slow, equally.'],
    range: [-7, 7], frame: 0,
    setup(lab) {
      lab.addTrain({name: 'A', v: .5, L0: 5, x0: 0});
      lab.addTrain({name: 'B', v: -.5, L0: 5, x0: 0});
      lab.addEvent({name: 'Fronts meet', t: 0, x: 0});
    },
    insight(lab) {
      const a = lab.find('A'), b = lab.find('B');
      return `In your frame A runs at <b>${f(1 / sr.gamma(lab.rel(a)), 3)}</b> and B at <b>${f(1 / sr.gamma(lab.rel(b)), 3)}</b> of your clocks’ rate.`;
    },
  },
  {
    id: 'twins', label: 'The twins',
    title: 'The traveller comes home younger.',
    text: `<p>One twin rides the <b>Traveller</b> at 0.8 c to a point 8 ls away and straight back; the other stays at the station. Home clocks show 20 s on the return, the traveller’s only 12 s.</p>
      <p>The trip is not symmetric: only the traveller changes frame. Ride with it and see its “now” swing at the turn, sweeping the home clock forward.</p>`,
    formula: 'τ = ∫ √(1 − v²) dt', note: 'each path through spacetime has its own length in time',
    tries: ['Ride with Traveller, out and then back, and watch the station clock at x = 0 at the turn.', 'Turn on Other frames’ “now” and scrub through t = 10.', 'Compare the two clocks at Return on the board.'],
    range: [-1, 24], frame: 0,
    setup(lab) {
      const v = .8;
      lab.addTrain({name: 'Traveller', L0: 1.4, ship: true, legs: [
        {t0: -60, x0: 0, u: 0, tau0: -60, label: 'at home', forever: true},
        {t0: 0, x0: 0, u: v, tau0: 0, label: 'out'},
        {t0: 10, x0: 8, u: -v, tau0: 6, label: 'back'},
        {t0: 20, x0: 0, u: 0, tau0: 12, label: 'home'}]});
      lab.addEvent({name: 'Departure', t: 0, x: 0});
      lab.addEvent({name: 'Turnaround', t: 10, x: 8});
      lab.addEvent({name: 'Return', t: 20, x: 0});
      lab.select = ['Departure', 'Return'];
    },
    insight(lab) {
      const s = lab.find('Traveller'), now = lab.bodyNow(s);
      if (!now) return '';
      if (now.t >= 20) return `Back home: the traveller’s clock reads <b>${f(now.tau, 1)} s</b>, the station clock <b>${f(now.t, 1)} s</b>. The traveller is <b>${f(now.t - now.tau, 1)} s</b> younger.`;
      return `Traveller’s clock: <b>${f(now.tau, 1)} s</b>. The home clock (x = 0) at this moment of your frame: <b>${f(lab.stationAt(0), 1)} s</b>.`;
    },
  },
  {
    id: 'add', label: 'Adding speeds',
    title: 'Speeds do not simply add, and light is always c.',
    text: `<p>Train <b>A</b> moves at 0.6 c. At <b>Launch</b> it fires probe <b>P</b> forwards at 0.6 c, measured on A, and a pulse of light.</p>
      <p>On the platform P moves at 0.88 c, not 1.2 c. And the light, fired from a moving train, still moves at exactly c, in every frame you choose.</p>`,
    formula: 'w = (u + v) / (1 + uv)', note: 'speeds in units of c',
    tries: ['Ride with A: P moves at 0.6 c and the light at c.', 'Ride with “P, flying”: A falls back at 0.6 c, the light still moves at c.', 'Add a fast train with + Train and ride with it.'],
    range: [-3, 9], frame: 0,
    setup(lab) {
      lab.addTrain({name: 'A', v: .6, L0: 6, x0: 0});
      lab.addTrain({name: 'P', L0: 1, ship: true, legs: [
        {t0: -60, x0: -36, u: .6, tau0: -48, label: 'on A', forever: true},
        {t0: 0, x0: 0, u: sr.addVelocities(.6, .6), tau0: 0, label: 'flying'}]});
      lab.addEvent({name: 'Launch', t: 0, x: 0, light: true});
    },
    insight(lab) {
      const p = lab.find('P'), a = lab.find('A');
      return `In your frame A moves at <b>${f(lab.rel(a))} c</b>, P at <b>${f(lab.rel(p))} c</b>, and the light at <b>1.00 c</b>.`;
    },
  },
  {
    id: 'free', label: 'Free line',
    title: 'Your own timetable.',
    text: `<p>An empty line with one train. Add trains at any speed, set off flashes and mark events, then ride with whatever you like.</p>
      <p>Every number on the board comes from the Lorentz transformation; the interval between two events never changes.</p>`,
    formula: 's² = Δt² − Δx²', note: 'the same in every frame',
    tries: ['Place two events, compare them, then change frames.', 'Can you find a frame where your two events happen at the same time? (Only if s² < 0.)', 'Fire a flash, then ride at 0.9 c: the light still moves at c.'],
    range: [-2, 12], frame: 0,
    setup(lab) { lab.addTrain({name: 'A', v: .5, L0: 5, x0: -4}); },
    insight: () => '',
  },
];
