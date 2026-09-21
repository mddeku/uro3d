# Local AI segmentation

Uro3D keeps segmentation local. The browser talks to a future local Python/MONAI runner through the `SegmentationProvider` contract in `src/core/segmentation/provider.ts`.

The runner must return binary masks with patient-volume dimensions and spacing. Every result is labelled `ai-draft` and `confirmed: false`; the planner must not treat an unconfirmed mask as a safe tract.

Recommended first integration:

1. Install Python 3.11+, PyTorch and TotalSegmentator/MONAI on the workstation.
2. Export the selected DICOM series to a temporary local NIfTI volume.
3. Run the model for kidneys, bowel, ribs, lungs/pleura, liver, spleen and vessels.
4. Convert masks back to patient-space voxel arrays.
5. Expose the runner through a loopback-only bridge and connect it to `TotalSegmentatorProvider`.

No patient images or masks should be uploaded to a remote API. Model output must be reviewed and confirmed by the physician before it participates in candidate-trajectory intersection checks.
