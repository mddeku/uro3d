# Milestone 1 validation

Validated locally on Windows with installed Microsoft Edge, 20 September 2026.

## Results

- TypeScript check and Vite production build: passed.
- Vitest: **36 tests passed**, covering DICOM geometry, coordinate transforms, rounded/oblique direction cosines, pixel-to-mm mapping, geometric slice sorting, reversed instance numbering, left/right labels, spacing/tilt/duplicate warnings, signed/unsigned pixels, bit extraction, HU rescaling, padding, MR intensity semantics, windowing/inversion, invalid input, recursive directory reading, and the file-list fallback.
- Playwright: **3 end-to-end tests passed** in Edge. The main scenario imported a nested folder containing **300 synthetic slices at 512 × 512**, confirmed nonempty rendered pixels, then tested scrolling, zoom, pan, reset, window/level drag and presets, HU hover readout, privacy controls, series switching, and invalid-file notices. Additional scenarios exercised the 344-image demo, keyboard scrolling, clearing a study, and file drag-and-drop through the worker.
- The main scenario recorded **zero external network requests and zero console/page errors**. The initial missing favicon was fixed before the final successful run.
- Empty and loaded workstation screenshots were visually inspected. The acquired axial fixture displays R on screen-left, L on screen-right, A above and P below.
- Agent-browser additionally confirmed the running page, rendered controls, and no recorded page errors.

## Evidence and reproduction

Run the commands in README.md. Browser screenshots are regenerated under `test-results/01-empty.png` and `test-results/02-ct-viewer.png`; these are intentionally excluded from Git. Synthetic input data is generated under `.fixtures/`, also excluded from Git. The demo has no dependency on those files.

## Limits of this validation

These are software tests with synthetic data, not clinical validation. No patient images were available or used. The 300-slice fixture tests realistic matrix/stack size but does not establish compatibility with every scanner or export profile. The native directory-picker path was tested with nested folders; recursive directory-drop batching was unit-tested, and browser file drop was end-to-end tested. A native OS folder-drag gesture was not manually exercised. Pixel byte-order tests cover both endiannesses; the 300-slice browser fixture uses explicit VR little endian. GPU rendering is not involved in this milestone.

Milestone 2 has not been started.
