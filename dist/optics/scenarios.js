// Plates for the drafting bench. Lengths in cm; angles in degrees, anticlockwise from +x.
// Each plate places parts and sources; after that everything can be moved, turned, re-glassed or removed.
import * as op from './physics.js';

const f1 = x => x.toFixed(1), deg = x => x * Math.PI / 180, rad = x => x * 180 / Math.PI;
const toward = ([x, y], [tx, ty]) => rad(Math.atan2(ty - y, tx - x));
const back = ([tx, ty], angle, d) => [tx - d * Math.cos(deg(angle)), ty - d * Math.sin(deg(angle))];

/** The first surface where the central ray of the first source leaves glass, or is totally reflected. */
const firstExit = lab => lab.log()?.find(e => e.kind === 'leave' || e.kind === 'tir');

export const plates = [
  {
    id: 'snell', label: 'Snell',
    title: 'Light bends where its speed changes.',
    text: `<p>A laser shines into a half disc of glass along a radius, so it goes straight in, and meets the flat face from inside. There it bends <b>away from the normal</b> as it speeds up into air.</p>
      <p>The dashed line is the normal, at right angles to the surface. The ray log on the right checks Snell’s law for every surface the ray meets.</p>`,
    formula: 'n₁ sin θ₁ = n₂ sin θ₂', note: 'θ measured from the normal',
    tries: ['Drag the laser’s round aim handle: keep the ray pointing at the centre of the flat face.', 'Change the glass to diamond in the specification.', 'Turn on Weak reflections: some light always bounces back.'],
    setup(lab) {
      const c = [0, -3];
      lab.addPart('halfdisc', c[0], c[1], -90, {size: 9});
      const a = 60;
      lab.addSource('laser', ...back(c, a, 20), a);
    },
    insight(lab) {
      const e = firstExit(lab);
      if (!e || e.kind !== 'leave') return 'The ray is totally reflected at the flat face: see the next plate.';
      return `At the flat face: <b>${e.n1.toFixed(2)}</b> × sin <b>${f1(e.thetaI)}°</b> = <b>${(e.n1 * Math.sin(deg(e.thetaI))).toFixed(3)}</b> = 1.00 × sin <b>${f1(e.thetaT)}°</b>. ${(e.R * 100).toFixed(1)}% is reflected.`;
    },
  },
  {
    id: 'tir', label: 'Trapped',
    title: 'Past the critical angle, no light gets out.',
    text: `<p>Tilt the ray further and the light leaving the flat face skims ever closer to it. Beyond the <b>critical angle</b> there is no way out: all of the light is reflected back inside.</p>
      <p>This is <b>total internal reflection</b>. No silvering is needed, and nothing is lost.</p>`,
    formula: 'sin θc = n₂ / n₁', note: 'about 41° for crown glass into air',
    tries: ['Turn the laser slowly back towards the normal and find the angle where the light escapes.', 'Change the glass: diamond traps light beyond only 24°, which is why it sparkles.', 'Put a screen where the reflected light goes.'],
    setup(lab) {
      const c = [0, -3];
      lab.addPart('halfdisc', c[0], c[1], -90, {size: 9});
      const a = 90 - 46;
      lab.addSource('laser', ...back(c, a, 20), a);
    },
    insight(lab) {
      const e = firstExit(lab), part = lab.parts[0];
      const crit = part ? op.criticalAngle(part.n) : 41.1;
      if (!e) return '';
      return `Angle at the flat face: <b>${f1(e.thetaI)}°</b>; critical angle for n = ${part.n.toFixed(2)}: <b>${f1(crit)}°</b>. ${e.kind === 'tir' ? 'All the light is reflected.' : `The light escapes, bent to ${f1(e.thetaT)}°.`}`;
    },
  },
  {
    id: 'fibre', label: 'Fibre',
    title: 'An optical fibre is a trap for light.',
    text: `<p>A long thin rod of glass keeps light inside by total internal reflection, bounce after bounce, as long as the light meets the walls beyond the critical angle.</p>
      <p>Hair-thin glass fibres like this carry most of the world’s internet traffic as pulses of light.</p>`,
    formula: 'trapped while θ > θc', note: 'at every bounce off the wall',
    tries: ['Steepen the laser until light starts to leak out of the walls.', 'Turn the fibre a little: the light follows it.', 'Change the glass to water: the critical angle grows and leaks start sooner.'],
    setup(lab) {
      lab.addPart('fibre', 0, 0, 0, {size: 40});
      const a = 14;
      lab.addSource('laser', ...back([-20, -.2], a, 4), a);
    },
    insight(lab) {
      const log = lab.log() ?? [];
      const bounces = log.filter(e => e.kind === 'tir').length, leaks = log.filter(e => e.kind === 'leave').length;
      return `The central ray bounces <b>${bounces}</b> times by total internal reflection${leaks > 1 ? `, and leaks out ${leaks - 1} time${leaks > 2 ? 's' : ''} through the wall` : ''}.`;
    },
  },
  {
    id: 'prism', label: 'Prism',
    title: 'White light splits into colours.',
    text: `<p>Glass slows violet light a little more than red, so each colour bends by a different amount. A flint-glass prism spreads white light into a <b>spectrum</b> on the screen.</p>
      <p>This is <b>dispersion</b>. It is how raindrops make rainbows, and why simple lenses give coloured fringes.</p>`,
    formula: 'n(violet) > n(red)', note: 'violet is bent the most',
    tries: ['Turn the prism and find the angle where the light is bent least (minimum deviation).', 'Change the glass to crown: the spectrum narrows.', 'Swap the white laser for a single colour in its specification.'],
    setup(lab) {
      lab.addPart('prism', 0, -2.25, 0, {size: 13, glass: 'flint'});
      lab.addPart('screen', 22, -9, -24, {size: 16});
      const a = 24;     // near minimum deviation for flint glass
      lab.addSource('laser', ...back([-3.25, -.37], a, 18), a, {white: true});
    },
    insight(lab) {
      const s = lab.screenSpread();
      return s ? `On the screen the spectrum is <b>${f1(s.width * 10)} mm</b> wide; violet lands <b>${s.violetBelow ? 'below' : 'above'}</b> red, bent the most.` : 'The light has not reached the screen.';
    },
  },
  {
    id: 'converge', label: 'Convex lens',
    title: 'A lens brings parallel light to a focus.',
    text: `<p>A convex lens is thicker in the middle. Each parallel ray is bent towards the axis by an amount that grows with its distance from it, so they all cross near one point: the <b>focus</b>.</p>
      <p>Rays through the edge cross a little short of those near the middle: <b>spherical aberration</b>, strong for so curved a lens.</p>`,
    formula: '1/f = (n − 1)(1/R₁ − 1/R₂ + …)', note: 'the lensmaker’s equation',
    tries: ['Change the lens’s curvature with its size slider, or its glass.', 'Widen the beam in its specification: the edge rays cross short of the focus.', 'Use white light: the focus splits into colours (chromatic aberration).'],
    setup(lab) {
      lab.addPart('convex', 0, 0, 0, {size: 12});
      lab.addSource('beam', -26, 0, 0, {count: 7, width: 4});
    },
    insight(lab) {
      const p = lab.parts.find(x => x.kind === 'convex'), m = lab.meet();
      if (!p || !m) return '';
      const f = p.focus();
      return `Rays meet <b>${f1(m.x - (p.x + p.el.t / 2))} cm</b> behind the lens, within ${f1(m.spread * 10)} mm; the lensmaker’s equation puts the paraxial focus at <b>${f1(f.back)} cm</b>.`;
    },
  },
  {
    id: 'image', label: 'Image',
    title: 'Every point of an object becomes a point of the image.',
    text: `<p>A lamp sends out rays in many directions. Those that pass through the lens are all bent so that they meet again at one point on the other side: a <b>real image</b> of the lamp.</p>
      <p>Move the lamp closer and the image moves further away; inside the focal length the rays never meet at all.</p>`,
    formula: '1/u + 1/v = 1/f', note: 'u, v measured from the lens’s principal planes',
    tries: ['Drag the lamp towards the lens and follow the image.', 'Drag the lamp off the axis: the image moves the other way, upside down.', 'Put a screen where the rays meet.'],
    setup(lab) {
      lab.addPart('convex', 0, 0, 0, {size: 12});
      lab.addSource('lamp', -22, 1.5, toward([-22, 1.5], [0, 0]), {count: 7, spread: 10});
    },
    insight(lab) {
      const p = lab.parts.find(x => x.kind === 'convex'), s = lab.sources[0], m = lab.meet();
      if (!p || !s) return '';
      const f = p.focus(), u = (p.x - p.el.t / 2 + f.H) - s.x;
      const v = 1 / (1 / f.f - 1 / u);
      const predicted = p.x + p.el.t / 2 + f.H2 + v;
      if (!m || m.x < p.x || v < 0) return `The lamp is ${f1(u)} cm from the lens, inside the focal length (${f1(f.f)} cm): the rays spread and never meet.`;
      return `Lamp ${f1(u)} cm in front: the formula puts the image at x = <b>${f1(predicted)} cm</b>; the traced rays meet at x = <b>${f1(m.x)} cm</b>, y = ${f1(m.y)} cm.`;
    },
  },
  {
    id: 'diverge', label: 'Concave lens',
    title: 'A concave lens spreads light out.',
    text: `<p>A concave lens is thinner in the middle, so it bends rays away from the axis. They leave as if they came from a point in front of the lens: a <b>virtual focus</b>.</p>
      <p>Spectacles for short sight use lenses like this, to spread light a little before the eye focuses it.</p>`,
    formula: 'f < 0', note: 'the focus is on the side the light comes from',
    tries: ['Put a convex lens behind it: together they can make a telescope or a beam expander.', 'Change its curvature with the size slider.', 'Use the lamp instead of the beam.'],
    setup(lab) {
      lab.addPart('concave', 0, 0, 0, {size: 12});
      lab.addSource('beam', -26, 0, 0, {count: 7, width: 4});
    },
    insight(lab) {
      const p = lab.parts.find(x => x.kind === 'concave'), m = lab.meet(true);
      if (!p || !m) return '';
      return `The rays leave as if from a point <b>${f1(p.x - m.x)} cm</b> in front of the lens; the lensmaker’s equation gives f = <b>${f1(p.focus().f)} cm</b>.`;
    },
  },
  {
    id: 'mirror', label: 'Mirrors',
    title: 'A curved mirror focuses without glass.',
    text: `<p>At a mirror the angle of reflection equals the angle of incidence. A concave mirror tilts its surface more and more away from the middle, so parallel rays all reflect towards one point, half way to its centre of curvature.</p>
      <p>Big telescopes use mirrors like this: no glass for light to pass through, so no colours split.</p>`,
    formula: 'f = R / 2', note: 'R: radius of curvature',
    tries: ['Use white light: unlike a lens, every colour meets at the same focus.', 'Add a flat mirror to fold the light sideways.', 'Turn the curved mirror and watch the focus move off the axis.'],
    setup(lab) {
      lab.addPart('cmirror', 14, 0, 0, {size: 24});
      lab.addSource('beam', -26, 0, 0, {count: 9, width: 8});
    },
    insight(lab) {
      const p = lab.parts.find(x => x.kind === 'cmirror'), m = lab.meet();
      if (!p || !m) return '';
      return `Rays meet <b>${f1(p.x - m.x)} cm</b> in front of the mirror; R/2 = <b>${f1(p.size / 2)} cm</b>.`;
    },
  },
  {
    id: 'free', label: 'Free bench',
    title: 'Your own drawing.',
    text: `<p>A beam and a block of glass. Add parts from the tray, drag and turn them, change their glass, and add more light sources.</p>
      <p>Every ray is traced exactly, whatever you build.</p>`,
    formula: 'n₁ sin θ₁ = n₂ sin θ₂', note: 'and angle in = angle out at mirrors',
    tries: ['Build a periscope from two mirrors.', 'Make a light pipe from a bent row of blocks.', 'Make a rainbow: a white laser into a water half disc.'],
    setup(lab) {
      lab.addPart('block', 0, 0, 25, {size: 10});
      lab.addSource('beam', -26, 0, 0, {count: 5, width: 6});
    },
    insight: () => '',
  },
];
