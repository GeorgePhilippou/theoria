// Guided tour for special relativity. Each step sets the frame, the trip, the view and the layers.
const sw = color => `<i class="swatch" style="--c:${color}"></i>`;
export const SWATCH = {earth: '#f0bd86', ship: '#9fe3ef', photon: '#fff3c4', flash: '#c9b8ff'};

export const steps = [
  {
    title: 'A clock made of light.',
    body: `<p>A ship ${sw(SWATCH.ship)} carries the simplest possible clock: a pulse of light ${sw(SWATCH.photon)} bouncing between two mirrors. Each round trip is one tick.</p>
      <p>Seen from Earth ${sw(SWATCH.earth)}, the ship moves, so the light runs along a <b>longer, slanted path</b>. Light’s speed is the same for everyone, so each tick must take longer.</p>`,
    notice: 'The zig-zag trail, and the ship’s clock falling behind Earth’s.',
    maths: 'Δt = γ Δτ,  γ = 1 / √(1 − v²/c²)',
    frame: 'earth', trip: 'cruise', view: 'space', camera: 'follow', layers: {clock: true},
  },
  {
    title: 'Time as a direction.',
    body: `<p>Now time runs upward and each object draws a <b>worldline</b>. Ticks mark each clock’s own seconds; the ship’s are stretched out.</p>
      <p>Light always travels at 45°, along the <b>light cone</b>. The curved lines are the same in every frame: ticks of equal own-time from Earth and ship land on the same curve.</p>`,
    notice: 'Tick 8 of the ship and tick 8 of Earth sit on the same hyperbola.',
    maths: 'τ² = t² − x²/c²  is the same for every observer',
    frame: 'earth', trip: 'cruise', view: 'time', layers: {clock: true, invariants: true},
  },
  {
    title: 'Simultaneous for whom?',
    body: `<p>A flash ${sw(SWATCH.flash)} goes off in the middle of the ship. For the crew it reaches the back and the front together.</p>
      <p>From Earth, the back is rushing towards the light and the front is running away from it, so <b>the back is lit first</b>. Both views are right: “at the same time” depends on who is asking.</p>`,
    notice: 'The readout shows when each end is lit, in this frame.',
    maths: 'Earth: Δt = γ v L₀ / c²   Ship: Δt′ = 0',
    frame: 'earth', trip: 'cruise', view: 'space', camera: 'follow', layers: {flash: true},
  },
  {
    title: 'Change your point of view.',
    body: `<p>Now the same events are seen from the ship. The whole diagram <b>tilts</b>: every event slides along its curve, and the light cone stays put.</p>
      <p>The ship is at rest and its ends are lit together. Earth now moves, and <b>Earth’s clock runs slow</b>. Each sees the other’s clock lagging.</p>`,
    notice: 'Earth’s “now” (amber sheet) is tilted, the ship’s (cyan) is flat.',
    maths: 't′ = γ (t − v x / c²),  x′ = γ (x − v t)',
    frame: 'ship', trip: 'cruise', view: 'time', layers: {flash: true, simultaneity: true, invariants: true},
  },
  {
    title: 'Moving things are shorter.',
    body: `<p>To measure a moving ship, you mark where its front and back are <b>at the same moment</b>. But moments differ between frames.</p>
      <p>Cut the ship’s worldline band along Earth’s “now” and it is shorter than along its own “now”. Nothing is squeezed; the two cuts simply measure different things.</p>`,
    notice: 'Compare the length in the readout as you switch “Seen from”.',
    maths: 'L = L₀ / γ',
    frame: 'earth', trip: 'cruise', view: 'time', layers: {simultaneity: true},
  },
  {
    title: 'The twin paradox.',
    body: `<p>The ship flies out and comes home. Back on Earth, <b>the traveller is younger</b>: its clock shows 16 against Earth’s 20 at 0.6 c. Make the units years and nothing changes.</p>
      <p>The trip is not symmetric: only the ship turns around. At the turn its “now” swings, and the Earth time it regards as “now” jumps forward. The straight worldline always has the most time.</p>`,
    notice: 'The cyan “now” sheet sweeps across Earth’s worldline at the turn.',
    maths: 'τ = ∫ √(1 − v²/c²) dt',
    frame: 'earth', trip: 'round', view: 'time', layers: {clock: true, simultaneity: true},
  },
  {
    eyebrow: 'Explore freely',
    title: 'Your experiment.',
    body: `<p>Drag the <b>ship speed</b>, switch <b>Seen from</b>, and turn layers on and off. In Time view, tap any tick to see its coordinates in both frames.</p>
      <p>Try 0.95 c, where γ is over 3, or a round trip seen from the returning ship. The <b>i</b> button explains what is calculated.</p>`,
    frame: 'earth', trip: 'cruise', view: 'space', camera: 'overview', layers: {clock: true, flash: true, simultaneity: true, invariants: true},
  },
];
