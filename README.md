# Theoria — science you can see

Theoria (θεωρία, "looking at", the root of both *theory* and *theatre*) is a collection of interactive, scientifically accurate visual models. Each concept leads with a plain-language guided tour, with the exact physics one tap away.

Play: https://georgephilippou.github.io/theoria/

Source: https://github.com/GeorgePhilippou/theoria (formerly `interval-spacetime`; the old repository link redirects, the old site address does not)

## Concepts

| Concept | Folder | Status |
|---|---|---|
| General relativity · curved spacetime | `dist/general-relativity/` | v0.4 |
| Special relativity · moving clocks | `dist/special-relativity/` | v0.3 |
| Light as a wave · electromagnetism | `dist/light/` | v0.2 |
| Quantum waves · quantum mechanics | `dist/quantum/` | v0.2 |
| Entropy and the arrow of time · thermodynamics | `dist/entropy/` | v0.1 |

`dist/index.html` is the home page, with a card per concept.

## Layout

- `dist/shared/shell.css`, `shell.js`: the common interface (top bar, guided-tour card, live readout, layers panel, timeline, notes dialog, labels).
- `dist/shared/stage.js`: the rendering stage (bloom, lighting, fog, thick anti-aliased lines with reusable buffers, sky, wavelength colours), used by every concept.
- `dist/<concept>/physics.js`: the concept's physics, with no rendering code, so it can be tested in Node.
- `dist/<concept>/story.js`: guided-tour text and which layers each step shows.
- `dist/<concept>/app.js`, `index.html`: the scene and page.
- `tests/<concept>.test.js`: physics tests against analytic results.
- `dist/vendor/`, `dist/fonts/`: self-hosted Three.js 0.186.1 (plus its line and post-processing add-ons in `vendor/jsm/`) and Inter; no CDN.

## Work locally

Requires Node.js for tests; Python 3 serves the static files.

```sh
npm test
python3 -m http.server 4188 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4188/. Pushes to `main` run the tests and a syntax check, then publish `dist/` to GitHub Pages. Pull requests run checks without publishing. Check the **Actions** tab after a push; a push alone is not proof of a working site. To undo a bad update, revert its commit and push.

## General relativity: scientific scope

Schwarzschild exterior of a non-rotating, uncharged mass; units r_s = c = 1. Everything is shown at one value of Schwarzschild coordinate time t ("far-away time").

- **Static clocks** A and B: dτ/dt = √(1 − 1/r).
- **Signals** A → B: exact radial null curves, r* = r + ln(r − 1) = ±t + const. Received spacing and wavelength scale by rate(r_B)/rate(r_A). Emitted light is 470 nm; the wavelength → screen colour mapping is approximate.
- **Light rays**: null geodesics, RK4 with a reduced step near the horizon, E = 1, L = −b; constraint p² + (1 − 1/r)L²/r² = 1 checked. Capture below b = 3√3/2. One ray starts at b_c(1 + 3×10⁻⁵) and orbits near the photon sphere.
- **Falling clock** C: exact cycloid solution for radial fall from rest at R (MTW §31.10). Finite proper time to the horizon; t → ∞ there.
- **Space view**: Flamm's paraboloid z = 2√(r − 1), unexaggerated, an equatorial constant-t slice. **Time view**: height is t. Ticks are equal steps of each clock's proper time. The morph between views is graphical only.
- Illustrative only: marker sizes, glows, line brightness, the starfield, colours. Not modelled: rotation, charge, the interior, what a camera would see (lensed images).

Tests cover analytic limits, the null constraint, capture/escape, mirror symmetry, step convergence, the post-Newtonian deflection series to third order, near-critical winding, the tortoise inverse and radial light speed, redshift spacing, the free-fall geodesic equations and the finite-τ/infinite-t horizon approach.

References: Andrew Hamilton, *General Relativity, Black Holes, and Cosmology*, https://jila.colorado.edu/~ajsh/astr3740_17/grbook.pdf ; Misner, Thorne & Wheeler, *Gravitation*, §31.10; Einstein Online, *Spacetime*, https://www.einstein-online.info/en/spacetime/ .

## Special relativity: scientific scope

Flat spacetime, c = 1, distances in light-seconds and times in seconds; motion along x only.

- **Frames**: every event is computed once in Earth's frame and shown in the chosen frame by an exact Lorentz boost. Switching frames animates the rapidity, so every intermediate picture is itself a valid inertial frame.
- **Light clock**: mirrors 0.5 ls apart across the motion, so one tick is 1 s of ship time. The photon moves at c in every frame, and its Earth-frame zig-zag gives Δt = γΔτ.
- **Flash**: emitted at the ship's centre at ship time 4 s. It reaches both ends together in the ship's frame; on Earth the back is lit first, by γvL₀.
- **Length**: L = L₀/γ, from cutting the ship's worldsheet along each frame's "now".
- **Round trip**: an instant turn at Earth time 10 s. The traveller ages 2·10/γ. The jump in the ship's "now" at the turn is 2v²·10. The ship body is drawn rigid within each leg; the instant turn itself is idealised.
- **Invariants**: the light cone and the hyperbolae t² − x² = s² are drawn once and are the same in every frame.
- Not rendered: what a camera would see (light-travel delay, Doppler shift, Terrell rotation).

Tests check γ and rapidity addition, interval invariance under boosts, light speed c in both frames, the light-clock tick, simultaneity and contraction, reciprocal dilation, the twin result and the simultaneity jump.

## Light as a wave: scientific scope

Maxwell's equations in 2D TM form (Ez out of plane, H in plane), solved with the Yee FDTD method on a 220 × 220 grid at Courant number 0.5. Normalised units: c = 1, ε₀ = μ₀ = 1, cell size 1. A cubic-graded matched conducting border (24 cells) absorbs outgoing waves. Glass has ε = n²; the slit wall is a perfect conductor.

- Experiments: a point source (antenna), a plane wave from a line source, two slits in a metal wall, and a biconvex lens (n adjustable). The marked focus uses the thick-lens formula.
- The surface height and colour are Ez (tanh-compressed and auto-scaled for display); brightness is a running time average of Ez².
- Arrows show Ez and (Hx, Hy) along one line, straight from the simulation; "E/cB" compares their peaks over a period.
- Behind two slits, a screen strip and curve show the time-averaged Ez² arriving along the far edge (auto-scaled to its own peak).
- Not modelled: 3D (2D waves fade as 1/√r), the other polarisation, dispersion in glass. The grid makes waves about 0.3% slow.

Tests check: pulse speed c and c/n, wavelength λ/n in glass, E/cB = 1 and 1/n with B ⟂ the direction of travel, energy conservation in a metal box, < 1% reflection from the border, and a dark fringe where the path difference is λ/2.

## Quantum waves: scientific scope

The time-dependent Schrödinger equation (ħ = m = 1) on a 256 × 128 grid (128 × 64 units), solved with the Strang split-step Fourier method. The FFT is a radix-2 transform; the columns are transformed row-wise so memory is read in order. A cos-shaped mask absorbs the wave at the edges.

- **Packet:** a Gaussian packet; height is |ψ|^1.4 (that is, (|ψ|²)^0.7), colour is the phase. **Measure** samples a position from |ψ|², multiplies ψ by a Gaussian of width 1.2 there and renormalises.
- **Two slits:** a V = 6 wall. Detector dots are sampled from |ψ|² along the screen line at a rate proportional to the probability there. The display is scaled beyond the wall, and the incident side is dimmed.
- **Tunnel:** a square barrier of width 1. Measured transmission is compared with the exact plane-wave formula averaged over the packet's momenta.
- **Atom:** exact hydrogen orbitals Rₙₗ·Y with real harmonics (1s to 4f), drawn as 16–26k rejection-sampled positions, coloured by the sign of ψ.

Tests check: FFT against a direct DFT, norm conservation (1e-10), packet drift ħk/m and spreading σ√(1+(t/2σ²)²), tunnelling within 1% of theory on a fine grid, radial normalisation and ⟨r⟩ for six orbitals, 1s–2s orthogonality, and the 2p node.

## Entropy and the arrow of time: scientific scope

A 2D gas of 100–600 soft discs (radius 0.16, spring repulsion k = 4000) in a 24 × 14 box, m = k_B = 1, mean kT = 1, time step 0.004. Positions and half-step velocities are integers (units of 10⁻⁷), and every force kick is rounded to an integer before it is applied (Levesque–Verlet). Each step therefore depends only on the current positions, and reversing the velocities retraces the run bit for bit.

- **Spread:** all atoms in the left half; a middle wall stands until t = 1. The wall is part of the time-dependent Hamiltonian, so it also returns during a reversed run.
- **Speeds:** every atom starts at speed √2 in a random direction; the speeds relax to the 2D Maxwell–Boltzmann distribution f(v) = (v/kT) e^(−v²/2kT).
- **Heat:** left half at kT = 2, right half at 0.25.
- **Reverse:** flips every velocity (v ← −v − a, so the next step undoes the last). The optional nudge moves one atom by 3 × 10⁻⁷ first.
- **Entropy (per atom, in k):** coarse-grained. Positions: −Σ p ln p over 8 × 5 cells. Speeds: −Σ p ln(p/A) over speed rings of area A in each of four vertical strips, weighted by each strip's share of atoms. Both terms use the Miller–Madow correction. The maximum is ln 40 + ln(2πe kT).
- **Odds of a return by chance:** e^(−N ΔS), from Boltzmann's relation.
- Illustrative only: colours, the followed atom's glow, the speed chart's height scale, and atoms drawn 1.7× larger on phones. Not modelled: 3D, quantum effects, real gas sizes (~10²² atoms).

Tests check: bit-exact reversal after 3000 steps, a failed reversal after a nudge, energy conservation within 1%, relaxation to Maxwell–Boltzmann (⟨v⁴⟩/⟨v²⟩² = 2 and ⟨v⟩ = √(πkT/2)), the free-expansion gain of ln 2 per atom, and equal final temperatures with ΔS = ln(T_f/√(T_hot T_cold)).

## Licensing

Three.js 0.186.1 (MIT), license in `dist/vendor/THREE-LICENSE.txt`. Inter variable font (SIL Open Font License), license in `dist/fonts/OFL.txt`.
