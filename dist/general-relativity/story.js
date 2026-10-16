// Guided tour for curved spacetime. Each step sets the view and which layers are shown.
const sw = color => `<i class="swatch" style="--c:${color}"></i>`;
export const SWATCH = {a: '#f0bd86', b: '#9fe3ef', c: '#f4a3c8', escape: '#cdefff', capture: '#ff9b73', photon: '#c9b8ff'};

export const steps = [
  {
    title: 'Gravity slows time.',
    body: `<p>Two clocks hover above a black hole. Clock ${sw(SWATCH.a)} A is held close in; clock ${sw(SWATCH.b)} B is further out.</p>
      <p>Each one ticks perfectly normally to anyone beside it. But put their readings side by side and <b>the lower clock has lived through less time</b>.</p>`,
    notice: 'The two counters drift apart, and keep drifting.',
    maths: 'dτ/dt = √(1 − rₛ/r)',
    view: 'space', layers: {clocks: true},
  },
  {
    title: 'Light climbs out stretched.',
    body: `<p>Clock A now sends a flash of light every two of its ticks. The flashes reach B <b>further apart</b> than they were sent.</p>
      <p>The light’s waves stretch the same way, so it arrives redder. This <b>gravitational redshift</b> is the slowing of time, seen through light.</p>`,
    notice: 'Each flash shifts from blue towards yellow as it climbs.',
    maths: 'λ<sub>B</sub> / λ<sub>A</sub> = √(1 − rₛ/r<sub>B</sub>) / √(1 − rₛ/r<sub>A</sub>)',
    view: 'space', layers: {clocks: true, signals: true},
  },
  {
    title: 'Light follows curved spacetime.',
    body: `<p>Parallel rays of light arrive from far away. Each one travels as straight as spacetime allows, and near the mass that path bends.</p>
      <p>Aim inside a sharp threshold and the light is <b>captured</b> ${sw(SWATCH.capture)}. Just outside it, light can <b>circle the photon sphere</b> ${sw(SWATCH.photon)} before escaping.</p>`,
    notice: 'The violet ray loops around the dashed photon sphere before it escapes.',
    maths: 'capture if impact parameter b < 3√3/2 · rₛ ≈ 2.6 rₛ',
    view: 'space', camera: 'close', layers: {light: true, landmarks: true},
  },
  {
    title: 'Falling in.',
    body: `<p>Clock ${sw(SWATCH.c)} C is let go and falls freely. By its own clock it reaches the event horizon in a <b>finite time</b>, and the centre soon after.</p>
      <p>Measured by distant time, it slows and <b>freezes just above the horizon</b>, its clock creeping towards a value it never quite shows.</p>`,
    notice: 'C’s counter stalls, while far-away time keeps running.',
    maths: 'proper time to the horizon is finite; coordinate time t → ∞',
    view: 'space', camera: 'follow', layers: {falling: true, landmarks: true},
  },
  {
    title: 'Time as a direction.',
    body: `<p>Now time runs upward. Each clock traces a <b>worldline</b>, and each tick mark is one unit of that clock’s own time.</p>
      <p>Lower clocks’ ticks are spaced further apart. Every flash’s path has the same shape, so flashes arrive as far apart as they left, but more of B’s faster ticks fit between them. C’s worldline turns vertical at the horizon.</p>`,
    notice: 'Drag to look along the time axis. The flat sheet is the moment shown on the timeline.',
    maths: 'height = coordinate time t',
    view: 'time', camera: 'time', layers: {clocks: true, signals: true, falling: true},
  },
  {
    eyebrow: 'Explore freely',
    title: 'Your experiment.',
    body: `<p>Turn layers on and off, switch between <b>Space</b> and <b>Time</b>, and move the clocks under <b>Settings</b>.</p>
      <p>Try a clock very close to the horizon, or drop C from further away. The <b>i</b> button explains exactly what is calculated.</p>`,
    view: 'space', layers: {clocks: true, signals: true, light: true, falling: true, landmarks: true},
  },
];
