/** Local-first segmentation contracts.
 * Model output is always a draft until the physician confirms the mask.
 */
export type StructureLabel =
  | 'kidney-left' | 'kidney-right' | 'stone' | 'collecting-system'
  | 'rib' | 'colon' | 'pleura' | 'lung' | 'liver' | 'spleen'
  | 'major-vessel' | 'skin';

export type SegmentationMask = {
  id: string;
  label: StructureLabel;
  source: 'ai-draft' | 'manual' | 'threshold';
  confidence?: number;
  confirmed: boolean;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  /** Binary voxel data in patient-volume order. */
  voxels: Uint8Array;
};

export type SegmentationRequest = {
  studyId: string;
  seriesId: string;
  labels: StructureLabel[];
  /** Optional path passed to a local TotalSegmentator/MONAI runner. */
  modelPath?: string;
};

export interface SegmentationProvider {
  readonly name: string;
  readonly localOnly: true;
  segment(request: SegmentationRequest, onProgress?: (percent: number) => void): Promise<SegmentationMask[]>;
}

/** Adapter boundary for a future ONNX Runtime Web or Python bridge. */
export class TotalSegmentatorProvider implements SegmentationProvider {
  readonly name = 'TotalSegmentator / MONAI (local)';
  readonly localOnly = true as const;
  constructor(private readonly runner?: (request: SegmentationRequest, onProgress?: (percent: number) => void) => Promise<SegmentationMask[]>) {}
  async segment(request: SegmentationRequest, onProgress?: (percent: number) => void) {
    if (!this.runner) throw new Error('Local TotalSegmentator runner is not installed. Configure the Python/MONAI bridge before running AI segmentation.');
    return this.runner(request, onProgress);
  }
}
