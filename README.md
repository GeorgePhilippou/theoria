# Theoria — science you can see

Theoria (θεωρία, "looking at", the root of both *theory* and *theatre*) is a collection of interactive, scientifically accurate visual models. Each concept leads with a plain-language guided tour, with the exact physics one tap away.

Play: https://georgephilippou.github.io/theoria/

Source: https://github.com/GeorgePhilippou/theoria (formerly `interval-spacetime`; the old repository link redirects, the old site address does not)

## Concepts

| Concept | Folder | Status |
|---|---|---|
| General relativity · curved spacetime | `dist/general-relativity/` | v0.2 |
| Special relativity · moving clocks | `dist/special-relativity/` | v0.1 |
| Electromagnetic waves | — | next |
| Quantum wavefunctions | — | planned |
| Entropy and the arrow of time | — | planned |

`dist/index.html` is the home page, with a card per concept.

## Layout

- `dist/shared/shell.css`, `shell.js`: the common interface (top bar, guided-tour card, live readout, layers panel, timeline, notes dialog, labels).
- `dist/shared/scene.js`: Three.js stage, starfield, glow sprites, dynamic lines, wavelength colours.
- `dist/<concept>/physics.js`: the concept's physics, with no rendering code, so it can be tested in Node.
- `dist/<concept>/story.js`: guided-tour text and which layers each step shows.
- `dist/<concept>/app.js`, `index.html`: the scene and page.
- `tests/<concept>.test.js`: physics tests against analytic results.
- `dist/vendor/`, `dist/fonts/`: self-hosted Three.js 0.186.1 and Inter; no CDN.

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

## Licensing

Three.js 0.186.1 (MIT), license in `dist/vendor/THREE-LICENSE.txt`. Inter variable font (SIL Open Font License), license in `dist/fonts/OFL.txt`.
