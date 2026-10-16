# Interval — a spacetime playground

Play: https://georgephilippou.github.io/interval-spacetime/

Source: https://github.com/GeorgePhilippou/interval-spacetime

Drag the scene to orbit; use a wheel or pinch to zoom. Switch **Space / Time** to unfold histories. Pause and scrub the timeline, or choose **Send light** to start a new pulse at time zero. **Move the clocks** changes the supported clocks' radii and starts a fresh comparison. The information button explains the model.

Interval is the active project. The earlier Atlas experiment is retired, with a recoverable local archive.

## Continue working locally

Requires Node.js for tests; Python 3 can serve the self-contained static files.

```sh
git clone https://github.com/GeorgePhilippou/interval-spacetime.git
cd interval-spacetime
python3 -m http.server 4188 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4188/ on this Mac. On iPad, open the public Play link in Safari. No account or installation is required. Local loopback does not reach the Mac from an iPad. Actual iPad hardware testing remains to be done.

- `dist/app.js`: Three.js scene, animation and interactions.
- `dist/physics.js`: independent, dimensionless Schwarzschild physics.
- `dist/style.css` and `dist/index.html`: layout and interface.
- `tests/physics.test.js`: analytic limits, null constraint, capture/escape, symmetry and integration convergence.
- `.github/workflows/pages.yml`: tests and GitHub Pages deployment.
- `.openai/hosting.json`: retained identity of the earlier private Sites preview; not used by GitHub Pages.

Run `npm test`. Runtime libraries and fonts are self-hosted in `dist/`; no CDN is required. `npm ci` is only needed to refresh the pinned Three.js source dependency. GitHub is the source of truth. Pushes to `main` run the physics tests and syntax check, then publish only `dist/` to GitHub Pages. Pull requests run checks without publishing. GitHub Actions uses pinned official actions and the built-in deployment token; no manually maintained hosting secret is needed. The earlier ChatGPT-hosted preview is a separate snapshot and is not updated by this workflow.

## Make a change later

1. Edit the files locally and run `npm test`.
2. Preview with the Python command above.
3. Commit and push to `main` for small approved changes, or use a branch and pull request for larger experiments.
4. Check the **Actions** tab on GitHub. A successful deployment publishes the new version; a push by itself is not evidence of a working site.
5. Reload the Play link on the target device and check the changed behavior.

The previous commits remain recoverable. To undo a bad update, revert its commit and push the revert. A custom domain can be added later without changing the app. GitHub Pages suits the current browser-only model; server accounts, private data or a backend would need a separate hosting decision.

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
