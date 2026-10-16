# General relativity 0.2 verification (16 Oct 2026)

- `npm test`: 9 tests pass. They cover analytic clock and embedding limits; the null constraint below 1e-6; capture/escape on either side of b_c; mirror symmetry; step convergence; deflection at b = 7 against the third-order post-Newtonian series (within 0.0015 rad); near-critical winding with closest approach at 1.5 r_s; the tortoise inverse and dr/dt = 1 − 1/r; redshift spacing; free fall obeying dr/dτ and dt/dτ; and finite proper time with unbounded coordinate time at the horizon.
- `node --check` passes for all shared and concept modules.
- Rendered in the Claude in-app browser at 1440×900, 1280×800, 800×600 and 375×812 (phone). No console errors.
- Every guided-tour step was exercised, plus explore mode, the Space/Time switch, timeline scrubbing, the layers panel and the notes dialog. Camera framings (wide, close, time) and the phone layout were checked.
- Frame rate in the in-app browser was about 118 fps with all layers on.
- Not yet tested: physical iPad or iPhone Safari, multi-touch gestures, sustained mobile performance, screen readers.
