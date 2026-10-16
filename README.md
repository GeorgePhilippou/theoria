# Interval — a spacetime playground

Open the published prototype: https://interval-spacetime.gap2000.chatgpt.site/

Drag the scene to orbit; use a wheel or pinch to zoom. Switch **Space / Time** to unfold histories. Pause and scrub the timeline, or choose **Send light** to start a new pulse at time zero. **Move the clocks** changes the supported clocks' radii and starts a fresh comparison. The information button explains the model.

This is a separate experiment. The earlier Atlas project is preserved.

## Continue working locally

Requires Node.js for tests; Python 3 can serve the self-contained static files.

```sh
cd /Users/georgephilippou/Developer/IntervalSpacetime
python3 -m http.server 4188 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4188/ on this Mac. For iPad, use the published HTTPS link while signed into the owning ChatGPT account; local loopback does not reach the Mac from an iPad. Actual iPad hardware testing remains to be done.

- `dist/app.js`: Three.js scene, animation and interactions.
- `dist/physics.js`: independent, dimensionless Schwarzschild physics.
- `dist/style.css` and `dist/index.html`: layout and interface.
- `tests/physics.test.js`: analytic limits, null constraint, capture/escape, symmetry and integration convergence.
- `.openai/hosting.json`: private Sites project identity.

Run `npm test`. Runtime libraries and fonts are self-hosted in `dist/`; no CDN is required. `npm ci` is only needed to refresh the pinned Three.js source dependency. The source is synchronized to the Sites-managed Git repository during publication; no separate GitHub repository was created.

## Scientific scope

Schwarzschild exterior, non-rotating spherical central mass; units r_s = c = 1. Static clocks are supported, not free-falling. Their proper-time rate is sqrt(1 - 1/r). The spatial surface is Flamm's isometric embedding z = 2 sqrt(r - 1), shifted vertically without exaggeration. It represents a constant-time equatorial spatial slice, not literal spacetime.

Null geodesics use an affine parameter and conserved E = 1, L = -b:

- r' = p
- p' = L²/r³ - 3L²/(2r⁴)
- phi' = L/r²
- t' = 1/(1 - 1/r)
- constraint p² + (1 - 1/r)L²/r² = 1

RK4 with a reduced step near the horizon. Captured traces terminate at r < 1.015; the horizon is not crossed in finite Schwarzschild coordinate time. Faint guides show computed paths; bright points and traces show elapsed coordinate time. Photons are projected onto the embedding for the Space view, rather than calculated as geodesics of the spatial surface alone.

In Time view, height is coordinate time, with two spatial coordinates retained. Clock worldlines have ticks at equal proper-time intervals. The moving grid represents the selected coordinate-time slice. The morph between views is graphical and has no independent physical meaning. Marker sizes, glow, stars and line brightness are illustrative; no astrophysical background-star data or lensing image is implied. This is a pedagogical numerical prototype, not a precision relativity solver.

References: Andrew Hamilton, *General Relativity, Black Holes, and Cosmology*, https://jila.colorado.edu/~ajsh/astr3740_17/grbook.pdf ; Einstein Online, *Spacetime*, https://www.einstein-online.info/en/spacetime/ .

## Licensing

Three.js 0.186.1 (MIT), license in `dist/vendor/THREE-LICENSE.txt`. Inter variable font (SIL Open Font License), license in `dist/fonts/OFL.txt`.
