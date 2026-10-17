// Guided tour for rays and lenses. Each step picks an experiment, its setting and the layers.
const sw = color => `<i class="swatch" style="--c:${color}"></i>`;

export const steps = [
  {
    title: 'Light slows down in glass.',
    body: `<p>A beam of light ${sw('#ffe2a8')} crosses a block of glass. Each glowing dot is a pulse of light, and the pulses in a row left together.</p>
      <p>Inside the glass they travel at <b>c / n</b>, about two-thirds of their speed in air, so they bunch up. The row of pulses, a <b>wavefront</b>, enters at a slant: one end slows first, and the whole front swings round. That is why the beam bends.</p>`,
    notice: 'The wavefronts tilt as they enter the glass, and straighten as they leave. The beam comes out parallel to how it went in.',
    maths: 'speed in glass v = c / n',
    experiment: 'slab', param: 35, layers: {pulses: true, wavefronts: true, reflections: false, angles: false},
  },
  {
    title: 'Snell’s law.',
    body: `<p>A single ray enters a half-disc of glass along its radius, so it goes straight in, and meets the flat face from inside. There it bends <b>away from the normal</b> (the dashed line at right angles to the surface) as it speeds up into the air.</p>
      <p>A little light is also reflected back. How much depends on the angle: about 4% head-on, more at a slant.</p>`,
    notice: 'Drag the angle. The readout checks n₁ sin θ₁ = n₂ sin θ₂ for the traced ray.',
    maths: 'n₁ sin θ₁ = n₂ sin θ₂',
    experiment: 'refract', param: 25, layers: {pulses: true, wavefronts: false, reflections: true, angles: true},
  },
  {
    title: 'Trapped inside.',
    body: `<p>Tilt the ray further and the light leaving the glass skims ever closer to the surface. Beyond the <b>critical angle</b>, 41.8° for glass of n = 1.5, there is no way out: all the light is reflected back inside.</p>
      <p>This is <b>total internal reflection</b>. No mirror coating is needed, and nothing is lost.</p>`,
    notice: 'At 50°, past the critical angle, the outgoing ray is gone and the reflection takes all the light.',
    maths: 'critical angle: sin θc = 1 / n',
    experiment: 'refract', param: 50, layers: {pulses: true, wavefronts: false, reflections: true, angles: true},
  },
  {
    title: 'How optical fibres work.',
    body: `<p>A thin rod of glass keeps light inside by total internal reflection, bounce after bounce, as long as it meets the walls beyond the critical angle.</p>
      <p>Hair-thin glass fibres like this carry most of the world’s internet traffic, as pulses of light.</p>`,
    notice: 'Every bounce off the wall is a total internal reflection. Raise the entry angle and the light still stays in.',
    maths: 'trapped while the angle at the wall > θc',
    experiment: 'fibre', param: 18, layers: {pulses: true, wavefronts: false, reflections: false, angles: false},
  },
  {
    title: 'A lens brings rays together.',
    body: `<p>A lens is thicker in the middle, so light through the centre is delayed the most. Every ray from one point of the object is bent so that they all meet again at one point: an <b>image</b>.</p>
      <p>Parallel light from far away meets at the <b>focus</b>. Move the object and the image moves the other way, upside down.</p>`,
    notice: 'The image forms where the traced rays cross. Rays through the edge of the lens cross a little short: spherical aberration.',
    maths: '1/u + 1/v = 1/f',
    experiment: 'lens', param: 26, layers: {pulses: true, wavefronts: false, reflections: false, angles: false},
  },
  {
    title: 'White light splits into colours.',
    body: `<p>Glass slows violet light a little more than red, so each colour bends by a different amount. A prism spreads white light ${sw('#ffffff')} into a <b>spectrum</b>.</p>
      <p>This is <b>dispersion</b>, and it is how a rainbow forms in raindrops. In lenses it causes coloured fringes, which camera lenses work hard to cancel.</p>`,
    notice: 'On the screen, violet lands lowest: it is bent the most.',
    maths: 'n depends on wavelength: n(violet) > n(red)',
    experiment: 'prism', param: 12, layers: {pulses: false, wavefronts: false, reflections: false, angles: false},
  },
  {
    eyebrow: 'Explore freely',
    title: 'Your bench.',
    body: `<p>Pick an experiment, move its slider and change the glass with <b>n</b>. Diamond is 2.4, water 1.33.</p>
      <p>Turn on partial reflections and normals under <b>Layers</b>, or look straight down with <b>Top</b>.</p>`,
    experiment: 'lens', param: 40, layers: {pulses: true, wavefronts: true, reflections: false, angles: false},
  },
];
