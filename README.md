# Uro3D — Milestone 1

A runnable, local-first CT/MR acquired-slice viewer. **Milestone 1 only.**

**Research / educational / planning use only. Not a substitute for diagnostic radiology software or intraoperative navigation.**

## Run locally

On this Windows computer, double-click **Start-Uro3D.cmd**, then open the localhost URL it prints (normally http://127.0.0.1:5173) in Edge or Chrome. The launcher finds a standard Node/npm/pnpm installation or the existing Codex Node runtime. Keep the terminal open; Ctrl+C stops the server.

On other computers, install Node.js 22 LTS or newer, then:

```sh
npm install
npm run dev
```

Or use `pnpm install` and `pnpm dev`. The checked-in pnpm lockfile pins the tested dependencies. An internet connection is needed for initial dependency installation, not for reading studies. The local server binds to loopback. The same static application can run on GitHub Pages; DICOM processing remains in the browser with no backend or image uploads.

## GitHub Pages

The `Test and deploy Uro3D to GitHub Pages` workflow publishes changes pushed to `main` or `master`. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. The site address is shown by the completed deployment.

Before publishing, CI installs the locked dependencies, runs the unit tests, builds the production bundle, and tests it in Chromium under `/uro3d/`. Browser checks cover local file import, the DICOM worker, 2D controls, MPR and the lazy-loaded 3D/PCNL renderer. Only `dist/` is published. Synthetic fixtures and real DICOM files are excluded from Git.

Vite uses relative resource URLs so the app, favicon, worker and lazy chunks load correctly under a repository subdirectory. No API keys or environment secrets are required by the application. A browser with WebGL2 is required for 3D, just as locally; hosting does not change existing imaging-format or MPR limitations.

To repeat the production browser checks locally after a build:

```sh
pnpm fixtures
pnpm exec playwright install chromium
pnpm exec playwright test --config playwright.pages.config.ts
```

Alternatively, set `URO3D_BROWSER` to an installed Edge/Chromium executable.

For a production build without development live updates:

```sh
npm run build
npm run preview
```

## First use

1. Select **Explore synthetic demo** to open 344 synthetic DICOM images in two series, with no patient data.
2. Or drag a DICOM folder onto the workspace, select **Open folder**, or select multiple files with **Open files**. Nested folders and extensionless DICOM files are read. Each import replaces the current study collection.
3. Select a series in the study browser.
4. Scroll to change slices; the slider and up/down arrow keys also work.
5. Select Window / level, Pan, or Zoom, then drag in the image. Horizontal window drag adjusts width; vertical drag adjusts level. Ctrl + wheel zooms.
6. Hover to inspect calibrated CT HU (or MR/uncalibrated intensity) and patient LPS coordinates in millimeters.
7. Fit restores zoom/pan; Reset also restores the DICOM window. The trash icon releases the loaded study.
8. Open **LOCAL PROCESSING** for privacy details and patient-identifier visibility. Review **Geometry validation** and **Import notices** in the right panel.

The UI is intended for a desktop screen (recommended 1280 × 800 or larger).

## Implemented

- Individual / multi-file / recursive folder import and drag-and-drop.
- Background-worker parsing with progress, cancellation, and readable per-file rejection notices.
- Study and series grouping using Study/Series Instance UIDs; duplicate SOP instances skipped.
- Slice sorting from Image Position Patient projected onto the Image Orientation Patient normal, never from instance order alone.
- An acquired-stack viewport with wheel/keyboard/slider scrolling, physical pixel aspect ratio, pan, zoom, fit/reset, CT windows, manual WW/WL, MONOCHROME1 inversion, and hover intensity inspection.
- Full-resolution nearest-frame cache warming for responsive stack scrolling, with an explicit smooth/native-pixels display toggle.
- Import now performs a full sequential local pixel decode before showing the 2D viewer. The progress screen distinguishes metadata parsing from `Decoding all slices locally`; after a successful preload, slice scrolling uses the in-memory cache without foreground decoding.
- Patient-space MPR mode with synchronized axial, coronal, and sagittal planes plus a linked crosshair and position sliders.
- GPU volume rendering through VTK.js with patient LPS orientation cube, threshold/opacity/clipping controls, and a PCNL Planner mode with target calyx/skin-entry points, tract, configurable corridor, angle/length metrics, and conservative segmentation warning.
- Distance/polyline/angle/rectangle/ellipse tools with physical millimeter geometry and CT ROI statistics.
- Per-frame signed/unsigned pixel decoding and slope/intercept calibration; MR is never labeled HU. Missing CT calibration is explicitly labeled intensity.
- DICOM-derived patient direction labels, including compound oblique labels; non-axial acquisitions are labeled accurately rather than called axial.
- Metadata and geometry panel, missing/irregular-spacing warnings, duplicates, inconsistent frames, and possible gantry displacement warnings.
- Required research-use notice, local processing indicator, privacy panel, no telemetry/cloud calls, and a restrictive content security policy.
- Synthetic DICOM demo, unit tests, and browser acceptance tests with a 300 × 512 × 512 synthetic CT stack.

## Architecture and libraries

React + TypeScript + Vite, Zustand state, `dicom-parser` for Part 10 parsing, Canvas 2D for this acquired-stack milestone, and Lucide icons. Vitest tests physical geometry/pixels; Playwright and agent-browser verify the application in Edge.

```text
src/
  components/         App shell, study browser, properties
  core/dicom/         Maintained parser adapter, worker client, demo writer
  core/geometry/      DICOM LPS geometry, sorting, validation
  viewer/             Acquired-stack rendering and interactions
  stores/             Study/series and viewport state (Zustand)
  types/              Typed imaging domain objects
  workers/            DICOM import and lazy decoding
scripts/              Windows launcher and synthetic fixture generator
tests/                Geometry/pixel tests and browser acceptance tests
docs/                 Architecture and geometry decisions
```

See [architecture and geometry decisions](docs/ARCHITECTURE.md). Future modules will be added as functioning milestones; there are no placeholder planning or segmentation controls presented as working features.

## Supported data and limitations

- Classic single-frame monochrome CT and MR Part 10 DICOM, 8/16-bit integer pixels. Explicit/implicit VR little endian and explicit VR big endian are supported. Required image position, orientation, spacing, and identifiers must exist.
- JPEG Lossless single-frame transfer syntaxes `1.2.840.10008.1.2.4.57` and `.70` are decoded locally in the worker using `@cornerstonejs/jpeg-lossless-decoder-js`. Empty offset tables and fragmented single frames are supported; decoded dimensions and precision must match DICOM metadata.
- Other compressed formats (lossy JPEG, JPEG-LS, JPEG 2000, RLE, deflated), enhanced multiframe, color, float pixel data, non-biped orientation, and Modality LUT sequences are rejected with an explanation. Failed imports show grouped reasons in the center workspace, including narrow screens.
- Oblique/tilted images are shown in their **acquired planes**, with their own orientation labels. There is no axial reformat, tilt correction, interpolation, MPR, 3D, registration, segmentation, distance/ROI tool, PCNL planner, export, or project persistence yet.
- Irregular or inconsistent geometry remains individually viewable with warnings; it is not treated as a valid reconstructed volume. Missing slices cannot always be inferred (for example, uniformly missing every other slice).
- A manual DICOM LINEAR display window is used. Scanner VOI LUT sequences, sigmoid VOI functions, presentation states, and hanging protocols are not applied.
- 128 MB single-file and 16-megapixel single-frame limits. Source File references remain in the worker; only the current frame is decoded on demand. Decoded cache is capped at eight frames and 64 MB, except a single maximum-sized frame. Large-study throughput depends on disk/browser memory. Import completes before displaying the stack; it is not progressively browseable during metadata scanning.
- No original images or identifiers are persisted to localStorage or uploaded. Reloading clears the study. Hiding identifiers is not anonymization; free-text descriptions and burned-in pixel text may contain PHI. Anonymized export is outside Milestone 1.
- This is a development/research prototype, not a validated diagnostic product. Browser acceptance uses synthetic CT data at realistic dimensions, **not a clinically validated collection of scanner datasets**. Real scanner compatibility remains to be tested with appropriately authorized data.

## Tests

```sh
npm test
npm run fixtures
npm run dev
# In a second terminal, while the server runs:
npm run test:e2e
npm run build
```

The browser suite uses installed Windows Edge. On another platform, set `URO3D_BROWSER` to a compatible Chromium executable. Fixtures are generated locally under `.fixtures/` and excluded from Git; all are synthetic. Screenshots are written under `test-results/`.

## Current planning boundary

MPR, GPU 3D preview, measurements, and the PCNL Planner planning aid are now available. The next clinical module is physician-confirmed structure segmentation (kidneys, stones, collecting system, ribs, vessels, and adjacent organs), followed by intersection analysis. Until those masks exist, the planner deliberately cannot call a trajectory safe or best.
