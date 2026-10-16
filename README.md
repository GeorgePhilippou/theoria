# Theoria — science you can see

Theoria (θεωρία, "looking at", the root of both *theory* and *theatre*) is a collection of interactive, scientifically accurate visual models. Each concept leads with a plain-language guided tour, with the exact physics one tap away.

Play: https://georgephilippou.github.io/interval-spacetime/ (the repository and URL will be renamed to Theoria once the home page exists)

Source: https://github.com/GeorgePhilippou/interval-spacetime

## Concepts

| Concept | Folder | Status |
|---|---|---|
| General relativity · curved spacetime | `dist/general-relativity/` | v0.2 |
| Special relativity | — | planned |
| Electromagnetic waves | — | planned |
| Quantum wavefunctions | — | planned |
| Entropy and the arrow of time | — | planned |

`dist/index.html` currently redirects to general relativity; it becomes the home page next.

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

## Licensing

Three.js 0.186.1 (MIT), license in `dist/vendor/THREE-LICENSE.txt`. Inter variable font (SIL Open Font License), license in `dist/fonts/OFL.txt`.
