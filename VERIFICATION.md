# General relativity 0.2 verification (16 Oct 2026)

- `npm test`: 9 tests pass. They cover analytic clock and embedding limits; the null constraint below 1e-6; capture/escape on either side of b_c; mirror symmetry; step convergence; deflection at b = 7 against the third-order post-Newtonian series (within 0.0015 rad); near-critical winding with closest approach at 1.5 r_s; the tortoise inverse and dr/dt = 1 − 1/r; redshift spacing; free fall obeying dr/dτ and dt/dτ; and finite proper time with unbounded coordinate time at the horizon.
- `node --check` passes for all shared and concept modules.
- Rendered in the Claude in-app browser at 1440×900, 1280×800, 800×600 and 375×812 (phone). No console errors.
- Every guided-tour step was exercised, plus explore mode, the Space/Time switch, timeline scrubbing, the layers panel and the notes dialog. Camera framings (wide, close, time) and the phone layout were checked.
- Frame rate in the in-app browser was about 118 fps with all layers on.
- Not yet tested: physical iPad or iPhone Safari, multi-touch gestures, sustained mobile performance, screen readers.

# Special relativity 0.1 verification (17 Oct 2026)

- `npm test`: 8 special relativity tests pass, alongside the 9 general relativity tests.
- Rendered in the in-app browser at 1440×900 and 375×812, with no console errors.
- Checked: the Earth-frame clocks (9.00 against 7.20 s at 0.6 c), the 3.20 ls contracted length, and the ship-frame reciprocity (Earth 11.20 at ship 14.00). The flash reaches both ends at 6.00 s in the ship's frame. The round trip gives 22.0 against 18.0 at t = 22. The frame transition shows valid intermediate frames.
- Not yet tested: physical iPad or iPhone, multi-touch, screen readers.

# Special relativity 0.2 refinement (17 Oct 2026)

- New rendering stage: bloom, lighting, fog, and thick lines that reuse their GPU buffers.
- New objects: a lit Earth with a clock bead, and a 3D ship that contracts along its motion, with the light clock on deck.
- New interaction: speed and "Seen from" in the bottom bar (speed changes are live, with no restart), timeline markers, keyboard shortcuts, and a Time-view event inspector.
- Checked in the in-app browser at 1440×900 and 375×812, with no console errors. Inspector values were verified on ship tick 8: Earth (t = 10, x = 6), ship (t′ = 8, x′ = 0), interval 8.
- All 17 physics tests pass. Physics is unchanged.
- Not yet tested: a real iPad (bloom cost on mobile GPUs in particular), screen readers.

# General relativity 0.3: new renderer (17 Oct 2026)

- Ported to shared/stage.js, and shared/scene.js removed. The page now has a lit Flamm surface, a black horizon sphere with a rim glow and a horizon tube in Time view, 3D clocks with own-time beads, glowing ray trails, and a flash ladder coloured by wavelength.
- Bottom bar: Clock A and Drop C sliders change the scene live, with timeline markers for the first flash at B, C freezing, and the violet ray escaping. Keyboard shortcuts work, and the Time-view inspector covers 103 events at t = 40.
- Inspector checked by hand: flash 1 reaches B at t = 7.21 (r* difference), with B reading 6.74 τ.
- Fixed in the shared line code: a buffer that grew kept its first size limit, so only the first segments drew. Special relativity also benefits.
- Every tour step was checked at 1440×900, and the phone layout at 375×812, with no console errors. All 17 tests pass.

# Light as a wave 0.1 verification (17 Oct 2026)

- `npm test`: 6 light tests pass (23 in total). Measured: speed 0.997 c in vacuum and 0.663 c at n = 1.5 (0.667 expected); E/cB = 1.01.
- Rendered in the in-app browser at 1440×900 and 375×812, with no console errors. All four experiments were run (with `?debug` stepping): antenna rings, plane wave with live E/cB ≈ 1.04 at the arrows, two-slit fringes, and lens focusing.
- Performance: 500 simulation steps of the 220 × 220 grid took about 0.26 s in the browser (≈0.5 ms per step).
- Not yet tested: a real iPad, screen readers.

# Quantum waves 0.1 verification (17 Oct 2026)

- `npm test`: 6 quantum tests pass (29 in total). The fine-grid tunnelling simulation gives 38.8% against 39.3% from theory.
- Performance: the column FFT rewrite cut a 256² step from 11.2 ms to 3.6 ms in Node. The app uses 256 × 128 (about 1.7 ms per step; about 4 ms per step in the browser including drawing).
- Rendered at 1440×900 and 375×812, with no console errors. Packet and Measure collapse, two-slit fringes building from dots, tunnelling (37.0% on the coarse on-screen grid against 39.3% from theory), and 2p and 4f orbitals were all checked.
- Known to refine: the scene is cramped on a phone while the tour card is open.

# Entropy 0.1, light 0.2, quantum 0.2 (17 Oct 2026)

- `npm test`: 6 entropy tests pass (35 in total). Across three seeds: free expansion gains 0.67–0.71 per atom (ln 2 = 0.693); heat flow gains 0.45–0.51 against the textbook 0.44–0.48; equal-speed starts reach S within 0.05 of the maximum.
- Reversal: exact (every integer position matches) after 16 time units forwards and back, both in tests and in the app ("Back to the start, exactly"). With the nudge, 68% of atoms are in the left half when the clock returns to zero. Note: reversing early (before about t = 12) brings most of the gas back even with a nudge, because the bulk flow has not yet thermalised; the tour reverses at t = 16.
- The heat run sloshes (a sound wave) before settling, so the test averages over 10 time units.
- Light 0.2: the camera is fitted to the window's shape, there is a visible antenna or emitter, and a screen strip and curve show the two-slit fringes; the wave in front of the slit wall is drawn smaller.
- Quantum 0.2: a lab-grid sheet and a rim give the wave context, and the camera is fitted to the window.
- Shared: on phones the tour card shows only its first paragraph (Read more for the rest), which fixes the cramped phone layouts. The home page Light and Quantum cards were links closed with the wrong tag; fixed.
- Checked in the in-app browser at 1440×900 and 375×812, with no console errors.
- Not yet tested: a real iPad or iPhone, screen readers.

# Interface polish pass (17 Oct 2026)

- Reviewed all five pages and the home page at 1440×900 and 375×812.
- Fixed: the readout now spans the full width on phones (a desktop width rule was overriding the phone layout); special relativity's ship-speed label no longer runs into Layers on phones (γ is shown on wider screens only); the home page now scrolls the window rather than the body.
- Added: a "Next concept" link at the end of each tour (in the order curved spacetime → special relativity → light → quantum → entropy, then round again); a favicon and share titles and descriptions on every page; subject names in place of version numbers on the home cards; a redrawn entropy card; a slightly wider readout on desktop; a closer hydrogen-atom camera on phones.
- No console errors on any page. All 35 tests pass; physics is unchanged.

# Curved spacetime 0.4: clarity pass (17 Oct 2026)

- Every tour step was reviewed at 1440×900 and 375×812.
- Clocks are now dials with a hand that turns once per unit of their own time, tilted towards the camera, with their own-time reading next to them in the scene.
- The readout has bars of time lived (each clock's τ as a share of far-away time), and says how far A is behind B.
- The redshift step names the sent and received colours and wavelengths (470 nm → 576 nm for A at 2.4 rₛ and B at 8 rₛ).
- The light-ray and falling steps hide the innermost-stable-orbit ring, which concerns matter, not light.
- Time view: a labelled far-away-time axis; the camera looks between the A–B line and C's path, so C's worldline stands beside the horizon tube rather than behind it; the horizon tube is labelled. Physics is unchanged, and all 35 tests pass.

# Special relativity 0.3: clarity pass (17 Oct 2026)

- Every tour step was reviewed at 1440×900 and 375×812.
- Readout: bars of time lived (each clock's reading as a share of this frame's time), and a plain statement of which clock is behind and by how much, in this frame (1.60 s at t = 8 s, 0.6 c).
- Time view: the τ = 8 s curve is drawn brightest, and tick 8 of Earth and of the ship are highlighted on it; curve labels moved to the right branch; larger tick dots; the time axis now sits beside the worldlines instead of behind the tour card.
- Simultaneity: lamps at the ship's back and front light when the flash reaches them and stay lit ("Back · lit", "Front · not yet").
- Length: the ship's front and back worldlines are drawn as a band, with the two cuts marked: Earth's "now" gives 3.20 ls and the ship's "now" 4.00 ls at 0.6 c. Hidden on the round trip.
- Twin paradox: Earth and Ship labels no longer collide at the reunion. Physics is unchanged, and all 35 tests pass. No console errors.

# Light as a wave 0.3: clarity pass (17 Oct 2026)

- Every tour step was reviewed at 1440×900 and 375×812.
- Step 1 no longer shows the E and B arrows (introduced in step 2). A "one wavelength" bracket is measured crest to crest on the live wave (parabolic peak fit); it reads 20 cells at the default setting.
- Step 2 marks the direction of travel at the end of the arrow line; E/cB read 1.03.
- Step 3 opens in Top view, where the brightness map shows the fan of bright and dark bands landing on the screen. Brightness colours were toned down (they saturated to white), and Top view pulls back so the screen is not under the readout.
- Physics is unchanged, and all 35 tests pass. No console errors.

# Quantum waves 0.3: clarity pass (17 Oct 2026)

- Every tour step was reviewed at 1440×900 and 375×812.
- Packet: a bracket of ±1 standard deviation rides above the wave (following its mean x and y), so the spreading is visible; it reads ±1.7 shortly after a measurement. Measure now leaves a "Found here" marker for a few seconds.
- Two slits: a running tally of detections (lightly smoothed over neighbouring bins) is drawn on the screen, so the stripes show as bumps after about 100 dots; dots arrive three times faster than before.
- Tunnelling: "Reflected" and "Tunnelled through" labels give the measured split (63% / 37% at V₀ = 1.6); the energy label sits beside the barrier.
- Phones: toasts appear above the dock instead of over the tour card (all pages).
- Physics is unchanged, and all 35 tests pass. No console errors.
