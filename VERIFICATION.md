# Prototype 0.1 verification

- `npm test`: 3 test groups pass. Analytic clock/embedding limits; photon null-constraint error below 1e-6 for tested impact parameters; correct capture/escape on either side of the critical impact parameter; increasing coordinate time, mirror symmetry and convergence against half-step integration.
- `node --check dist/app.js`: passed.
- Actual WebGL rendering inspected in the Codex in-app browser.
- Layout inspected at 1024×768 (tablet landscape), 820×1180 (tablet portrait), and 390×844 (narrow screen). Both default clocks visible in the revised narrow framing; no horizontal document overflow.
- Browser controls exercised: Space/Time, play/pause, timeline scrub including t=60, clock-radius changes, model notes open/close, reset camera and pointer orbit drag.
- An early dynamic tick-buffer warning was repaired by preallocating the tick geometry. No later rendering warnings were observed after reload; browser logs retain the earlier warnings.
- Touch uses Three.js OrbitControls' one-finger orbit / two-finger zoom conventions. Physical iPad Safari, multi-touch gestures and sustained mobile performance have not been tested.
