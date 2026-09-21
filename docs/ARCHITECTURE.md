# Architecture and geometry decisions

## Milestone boundary

Milestone 1 is an acquired-image viewer, not a reconstructed-volume viewer. Canvas 2D keeps the first deliverable inspectable and allows deterministic pixel tests. `dicom-parser` handles the DICOM binary format; the adapter validates supported representations and decodes only native integer pixels. No handwritten DICOM reader is used. The synthetic Part 10 writer is strictly a test-data generator.

Cornerstone3D is the preferred evaluation target for subsequent stack/MPR tools and compressed-codec integration; vtk.js is a candidate for volume/surface rendering. ITK-Wasm is a candidate for registration and local segmentation. Those engines are deliberately not bundled before their milestones. Electron/Tauri packaging can wrap the same application later; a loopback web server is sufficient now. There are no server-side patient-data endpoints.

## Coordinate contract

All physical coordinates are DICOM patient **LPS**, millimeters: +X left, +Y posterior, +Z superior. Coordinates locate pixel centers. For pixel column `i`, row `j`:

```text
P(i,j) = ImagePositionPatient
       + i * PixelSpacing[1] * ImageOrientationPatient[0:3]
       + j * PixelSpacing[0] * ImageOrientationPatient[3:6]
```

The first orientation triplet follows increasing columns across the first row; the second follows increasing rows down the first column. Pixel Spacing is **row spacing, column spacing**. The slice normal is the cross product of the first and second orientation vectors. Sorting uses `dot(ImagePositionPatient, normal)`, ascending. Reversed instance numbers cannot reverse the anatomy accidentally.

`worldToImage` projects the physical displacement onto the orthonormal in-plane basis. It returns in-plane coordinates, not a 3D voxel index. There is no uniform-volume voxel transform yet: introducing one before an irregular-spacing/tilt policy would imply invalid geometry.

The canvas draws acquired pixels without flips or fabricated axial reorientation. Right/left/top/bottom labels follow the actual DICOM basis. For standard axial orientation this gives R on screen-left, L on screen-right, A above, P below. Oblique labels list direction components by descending magnitude (components below 0.05 omitted). Anisotropic pixels use distinct horizontal/vertical display scales. Pan/zoom never change physical metadata or intensity values.

Geometry validation requires finite position/spacing, positive spacing, and approximately unit orthogonal direction vectors. Mixed orientations/dimensions/spacings are visibly warned. Irregular gaps, duplicate positions, and in-plane translation are detected; no interpolation or repair is performed. The panel distinguishes pixel field of view from the span between slice centers. Full volume size is intentionally not asserted.

References: [DICOM Image Plane Module](https://dicom.nema.org/medical/DICOM/current/output/chtml/part03/sect_C.7.6.2.html), [dicom-parser documentation](https://github.com/cornerstonejs/dicomParser).

## JPEG Lossless support added after the first milestone

Transfer syntaxes `.57` and `.70` use the Cornerstone JPEG Lossless decoder (2.2.1, including the byte-aligned last-sample fix). DICOM encapsulation is parsed by dicom-parser; the sole frame's fragments are joined regardless of basic offset table presence. Each decode uses a new decoder instance. A header validation hook rejects dimension, component-count, or precision mismatches before output allocation. Completed sample count is checked before signed conversion and per-frame HU scaling. Native bit shifting is not applied a second time to decompressed samples. No remote codecs or image services are used.

## Pixel contract

Native byte order follows Transfer Syntax UID. Stored bits are extracted using High Bit / Bits Stored; signed values are sign-extended from Bits Stored, not Bits Allocated. Modality intensity is `stored * slope + intercept` per frame. Padding is excluded from the hover readout. CT gets the HU label only with explicit rescale metadata and absent/HU rescale type; MR is always intensity. DICOM LINEAR window uses the standard `center - 0.5` and `width - 1` boundaries. MONOCHROME1 inverts presentation only, never HU.

## Data lifetime and threading

The UI sends local File handles to a dedicated worker. Import reads files sequentially, parses metadata, then performs a second sequential pass that decodes every accepted frame before making the viewer available. Source File handles stay in worker memory. Decode returns transferable Float32Arrays. Full preload is bounded at 2 GB of estimated decoded pixels; if that threshold is exceeded, the study is still opened with the bounded neighborhood warmer/LRU fallback. Changing/clearing studies terminates the worker and invalidates pending requests and cache. Import cancellation uses the same path.

Worker errors are converted into physician-readable messages. Expected unsupported files appear as import notices. The application does not log raw DICOM datasets or pixel data. A worker crash reports a reload/smaller-study recovery path.

## State and future extension points

The MPR view resamples the validated acquired stack in patient LPS coordinates with trilinear interpolation. It uses a bounded preview volume (at most 256 samples per axis) to keep browser memory predictable; 2D measurements remain on full-resolution acquired pixels. Axial, coronal, and sagittal canvases share one patient-space crosshair point. A stack cache warms the current neighborhood in a worker and keeps up to 512 MB of decoded data, yielding instant revisits when memory allows.

The PCNL planner overlays a VTK line and tube on the same physical volume. Skin-entry and target-calyx handles are editable in LPS bounds; tract length and axis-relative angles are derived from world coordinates. Its virtual corridor is visualized, but structure intersections are intentionally not declared because no colon, pleura, vessel, kidney, or collecting-system masks exist yet. The UI explicitly states that the result is a planning aid, not a safe/best recommendation.

Domain types (`Frame`, `Series`) are separate from `ViewState`. Zustand centralizes study selection and viewport controls; canvas resources are local rendering state. Future segmentation should own independent patient-space masks with a provider contract (manual, threshold, region growing, future local AI). Planning calculations must consume patient coordinates, not screen pixels. Persistence should store references plus explicit geometry/version information, not silently duplicate source images. Neither provider stubs nor trajectory calculations are implemented in Milestone 1.

## Privacy boundary

Dependencies are downloaded during development setup; patient images never enter that process. The runtime has no upload, analytics, external fonts, AI requests, persistence, or backend. Vite serves code and uses loopback WebSocket hot reload. Production preview only serves the built static app. Content Security Policy restricts scripts/workers/connections to the local origin (and development loopback WebSockets). Runtime browser tests capture requests and reject external hosts. This is a technical local-processing boundary, not DICOM anonymization.
