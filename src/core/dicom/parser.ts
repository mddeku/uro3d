import dicomParser from "dicom-parser";
import type { Frame, Vec3 } from "../../types/imaging";
import { validateGeometry } from "../geometry";
import { Decoder } from "@cornerstonejs/jpeg-lossless-decoder-js";
export const losslessSyntaxes = [
  "1.2.840.10008.1.2.4.57",
  "1.2.840.10008.1.2.4.70",
];
const syntaxes = [
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
  ...losslessSyntaxes,
];
export function parseFrame(buffer: ArrayBuffer, id: string): Frame {
  let ds: dicomParser.DataSet;
  try {
    ds = dicomParser.parseDicom(new Uint8Array(buffer), {
      untilTag: "x7fe00010",
    });
  } catch {
    throw new Error(
      "Unable to read this DICOM file. It may be malformed, non-DICOM, or use an unsupported transfer syntax.",
    );
  }
  const str = (tag: string) => ds.string(tag)?.trim() ?? "";
  const charset = str("x00080005");
  const encoding: Record<string, string> = {
    "": "ascii",
    "ISO_IR 6": "ascii",
    "ISO_IR 100": "iso-8859-1",
    "ISO_IR 192": "utf-8",
  };
  const text = (tag: string) => {
    const e = ds.elements[tag];
    return e
      ? new TextDecoder(encoding[charset] ?? "ascii")
          .decode(ds.byteArray.subarray(e.dataOffset, e.dataOffset + e.length))
          .replace(/\0/g, "")
          .trim()
      : "";
  };
  const nums = (tag: string) => str(tag).split("\\").map(Number);
  const num = (tag: string, fallback?: number) => {
    const s = str(tag);
    return s ? Number(s.split("\\")[0]) : fallback;
  };
  const transferSyntax = str("x00020010");
  if (!syntaxes.includes(transferSyntax))
    throw new Error(
      `Unsupported transfer syntax ${transferSyntax || "(missing)"}. Supported: uncompressed or JPEG Lossless single-frame DICOM. JPEG 2000, JPEG-LS and multiframe need a different export format.`,
    );
  if ((num("x00280008", 1) ?? 1) !== 1)
    throw new Error(
      "Enhanced / multiframe DICOM is not supported in Milestone 1. Export a classic single-frame series.",
    );
  if (str("x00102210") && str("x00102210") !== "BIPED")
    throw new Error("Non-biped anatomical orientation is not supported.");
  if (
    (ds.uint16("x00280002") ?? 1) !== 1 ||
    !["MONOCHROME1", "MONOCHROME2"].includes(str("x00280004"))
  )
    throw new Error(
      "Only monochrome single-sample CT/MR images are supported.",
    );
  if (!["CT", "MR"].includes(str("x00080060")))
    throw new Error("This milestone supports CT and MR image series only.");
  if (ds.elements.x00283000)
    throw new Error(
      "Modality LUT sequences are not supported. Export images with linear rescale slope/intercept.",
    );
  const bitsAllocated = ds.uint16("x00280100") ?? 0,
    bitsStored = ds.uint16("x00280101") ?? 0,
    highBit = ds.uint16("x00280102") ?? -1;
  const representation = ds.uint16("x00280103");
  if (
    ![8, 16].includes(bitsAllocated) ||
    bitsStored < 1 ||
    bitsStored > bitsAllocated ||
    highBit < bitsStored - 1 ||
    highBit >= bitsAllocated ||
    ![0, 1].includes(representation ?? -1)
  )
    throw new Error(
      "Unsupported pixel encoding. This version requires 8/16-bit integer pixels with valid bit depth and signedness.",
    );
  const pixel = ds.elements.x7fe00010;
  const rows = ds.uint16("x00280010") ?? 0,
    columns = ds.uint16("x00280011") ?? 0;
  if (!rows || !columns || rows * columns > 16777216)
    throw new Error(
      "Invalid or oversized image dimensions (maximum 16 megapixels per frame).",
    );
  const bytes = (rows * columns * bitsAllocated) / 8;
  if (
    !pixel ||
    (losslessSyntaxes.includes(transferSyntax)
      ? pixel.length !== 0xffffffff || pixel.dataOffset >= buffer.byteLength
      : pixel.encapsulatedPixelData ||
        pixel.length < bytes ||
        pixel.dataOffset + bytes > buffer.byteLength)
  )
    throw new Error(
      "Pixel data is missing, truncated, or encapsulated. This image cannot be displayed.",
    );
  const slope = num("x00281053", 1)!,
    intercept = num("x00281052", 0)!;
  if (!Number.isFinite(slope) || slope === 0 || !Number.isFinite(intercept))
    throw new Error(
      "Invalid rescale slope/intercept. Intensities cannot be calibrated.",
    );
  const modality = str("x00080060"),
    units = str("x00281054");
  const calibratedHU =
    modality === "CT" &&
    !!str("x00281053") &&
    !!str("x00281052") &&
    (!units || units === "HU");
  const warnings: string[] = [];
  if (!Object.hasOwn(encoding, charset))
    warnings.push(
      "Patient text uses an unsupported character set. Text may be displayed incorrectly; image geometry is unaffected.",
    );
  if (modality === "CT" && !calibratedHU)
    warnings.push(
      "HU calibration unavailable: missing rescale metadata or non-HU rescale type. Values are labeled intensity.",
    );
  if (
    str("x00280030") === "" ||
    str("x00200032") === "" ||
    str("x00200037") === ""
  )
    throw new Error(
      "Missing Image Position Patient, Image Orientation Patient, or Pixel Spacing. Patient orientation cannot be established.",
    );
  const f: Frame = {
    id,
    studyUID: str("x0020000d"),
    seriesUID: str("x0020000e"),
    sopUID: str("x00080018"),
    patientName: str("x00100010").replaceAll("^", " ") || "Unnamed patient",
    patientID: str("x00100020"),
    studyDate: str("x00080020"),
    studyDescription: str("x00081030") || "Untitled study",
    seriesDescription: str("x0008103e") || "Unnamed series",
    modality,
    kernel: str("x00181210"),
    instance: num("x00200013", 0)!,
    rows,
    columns,
    position: nums("x00200032") as Vec3,
    orientation: nums("x00200037"),
    spacing: nums("x00280030") as [number, number],
    thickness: num("x00180050"),
    spacingBetween: num("x00180088"),
    slope,
    intercept,
    calibratedHU,
    center: num("x00281050", modality === "CT" ? 40 : 500)!,
    width: num("x00281051", modality === "CT" ? 400 : 1000)!,
    photo: str("x00280004"),
    bitsAllocated,
    bitsStored,
    highBit,
    signed: representation === 1,
    transferSyntax,
    pixelOffset: pixel.dataOffset,
    pixelLength: pixel.length,
    padding: ds.elements.x00280120
      ? representation === 1
        ? ds.int16("x00280120")
        : ds.uint16("x00280120")
      : undefined,
    warnings,
  };
  if (!f.studyUID || !f.seriesUID || !f.sopUID)
    throw new Error(
      "Study, series, or instance UID is missing. This image cannot be grouped reliably.",
    );
  f.patientName = text("x00100010").replaceAll("^", " ") || "Unnamed patient";
  f.patientID = text("x00100020");
  f.studyDescription = text("x00081030") || "Untitled study";
  f.seriesDescription = text("x0008103e") || "Unnamed series";
  validateGeometry(f);
  if (!Number.isFinite(f.center) || !Number.isFinite(f.width) || f.width < 1) {
    f.center = modality === "CT" ? 40 : 500;
    f.width = modality === "CT" ? 400 : 1000;
    warnings.push("Invalid window preset; using an adjustable default.");
  }
  return f;
}
export function decodePixels(buffer: ArrayBuffer, f: Frame): Float32Array {
  let decompressed: Uint8Array | Uint16Array | undefined;
  if (losslessSyntaxes.includes(f.transferSyntax)) {
    try {
      const ds = dicomParser.parseDicom(new Uint8Array(buffer));
      const pixel = ds.elements.x7fe00010;
      if (!pixel?.fragments?.length)
        throw new Error("Missing compressed fragments.");
      if ((pixel.basicOffsetTable?.length ?? 0) > 1)
        throw new Error("Multiple frames in single-frame image.");
      // All fragments belong to the sole frame, including exports with an empty offset table.
      const jpeg = dicomParser.readEncapsulatedPixelDataFromFragments(
        ds,
        pixel,
        0,
        pixel.fragments.length,
      );
      const decoder = new Decoder(); // No mutable decoder shared between requests.
      const readHeader = decoder.frame.read.bind(decoder.frame);
      decoder.frame.read = (stream) => {
        const result = readHeader(stream);
        if (
          decoder.frame.dimX !== f.columns ||
          decoder.frame.dimY !== f.rows ||
          decoder.frame.numComp !== 1 ||
          decoder.frame.precision !== f.bitsStored
        )
          throw new Error(
            "JPEG dimensions or precision differ from the DICOM metadata.",
          );
        return result;
      };
      decompressed = decoder.decode(
        jpeg.buffer as ArrayBuffer,
        jpeg.byteOffset,
        jpeg.byteLength,
        f.bitsAllocated / 8,
      );
      if (decompressed.length !== f.rows * f.columns || decoder.yLoc !== f.rows)
        throw new Error("Incomplete JPEG frame.");
    } catch {
      throw new Error(
        "Unable to decode this JPEG Lossless image: compressed data is incomplete or disagrees with DICOM dimensions/precision. Try a fresh uncompressed export.",
      );
    }
  }
  const view = new DataView(buffer),
    values = new Float32Array(f.rows * f.columns),
    little = f.transferSyntax !== "1.2.840.10008.1.2.2";
  const shift = f.highBit + 1 - f.bitsStored,
    range = 2 ** f.bitsStored,
    sign = range / 2;
  for (let i = 0; i < values.length; i++) {
    const raw = decompressed
      ? decompressed[i]
      : f.bitsAllocated === 8
        ? view.getUint8(f.pixelOffset + i)
        : view.getUint16(f.pixelOffset + i * 2, little);
    let value = (raw >>> (decompressed ? 0 : shift)) & (range - 1);
    if (f.signed && value >= sign) value -= range;
    values[i] = value === f.padding ? NaN : value * f.slope + f.intercept;
  }
  return values;
}
// DICOM LINEAR window, including width=1, before presentation inversion.
export function windowPixel(
  value: number,
  center: number,
  width: number,
  invert = false,
) {
  if (!Number.isFinite(value)) return 0;
  const gray =
    width <= 1
      ? value > center - 0.5
        ? 255
        : 0
      : Math.round(
          Math.max(
            0,
            Math.min(255, ((value - (center - 0.5)) / (width - 1) + 0.5) * 255),
          ),
        );
  return invert ? 255 - gray : gray;
}
