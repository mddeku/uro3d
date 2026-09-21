export type Vec3 = [number, number, number];
export interface Frame {
  id: string;
  studyUID: string;
  seriesUID: string;
  sopUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  kernel: string;
  instance: number;
  rows: number;
  columns: number;
  position: Vec3;
  orientation: number[];
  spacing: [number, number];
  thickness?: number;
  spacingBetween?: number;
  slope: number;
  intercept: number;
  calibratedHU: boolean;
  center: number;
  width: number;
  photo: string;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  signed: boolean;
  transferSyntax: string;
  pixelOffset: number;
  pixelLength: number;
  padding?: number;
  warnings: string[];
}
export interface Series {
  id: string;
  frames: Frame[];
  warnings: string[];
  sliceSpacing?: number;
  plane: string;
}
export interface ImportIssue {
  file: string;
  message: string;
}
export type Tool = "window" | "pan" | "zoom" | "probe";
export interface ViewState {
  slice: number;
  center: number;
  width: number;
  zoom: number;
  pan: [number, number];
  tool: Tool;
}
