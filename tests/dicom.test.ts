import { describe, it, expect } from "vitest";
import dicomParser from "dicom-parser";
import {
  parseFrame,
  decodePixels,
  windowPixel,
} from "../src/core/dicom/parser";
import { syntheticDicom } from "../src/core/dicom/demo";
function fixture() {
  return syntheticDicom(2, 5, 16);
}
function patchText(bytes: Uint8Array, tag: string, text: string) {
  const ds = dicomParser.parseDicom(bytes);
  const e = ds.elements[tag];
  bytes.fill(32, e.dataOffset, e.dataOffset + e.length);
  bytes.set(new TextEncoder().encode(text), e.dataOffset);
  return bytes;
}
function patchUS(bytes: Uint8Array, tag: string, n: number) {
  const e = dicomParser.parseDicom(bytes).elements[tag];
  new DataView(bytes.buffer).setUint16(e.dataOffset, n, true);
  return bytes;
}
describe("DICOM parsing / calibrated pixels", () => {
  it("reads patient, acquisition, geometry and study identifiers", () => {
    const f = parseFrame(fixture().buffer as ArrayBuffer, "a");
    expect(f.modality).toBe("CT");
    expect(f.patientName).toBe("SYNTHETIC DEMO");
    expect(f.spacing).toEqual([20, 20]);
    expect(f.calibratedHU).toBe(true);
    expect(f.slope).toBe(1);
    expect(f.intercept).toBe(-1024);
    expect(f.spacingBetween).toBe(1);
  });
  it("applies per-frame HU slope/intercept", () => {
    const b = fixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "a");
    const v = new DataView(b.buffer);
    v.setInt16(f.pixelOffset, -100, true);
    v.setInt16(f.pixelOffset + 2, 1500, true);
    const p = decodePixels(b.buffer as ArrayBuffer, {
      ...f,
      slope: 2,
      intercept: -1024,
    });
    expect(p[0]).toBe(-1224);
    expect(p[1]).toBe(1976);
  });
  it("sign extends 12-bit stored pixels and handles shifted high bits", () => {
    const b = fixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "a");
    new DataView(b.buffer).setUint16(f.pixelOffset, 0xfff0, true);
    expect(
      decodePixels(b.buffer as ArrayBuffer, {
        ...f,
        bitsStored: 12,
        highBit: 15,
        slope: 1,
        intercept: 0,
      })[0],
    ).toBe(-1);
  });
  it("handles unsigned and big endian pixel buffers", () => {
    const b = fixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "a");
    new DataView(b.buffer).setUint16(f.pixelOffset, 65000, false);
    expect(
      decodePixels(b.buffer as ArrayBuffer, {
        ...f,
        transferSyntax: "1.2.840.10008.1.2.2",
        signed: false,
        slope: 1,
        intercept: 0,
      })[0],
    ).toBe(65000);
  });
  it("decodes 8-bit pixels", () => {
    const b = fixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "a");
    new DataView(b.buffer).setUint8(f.pixelOffset, 250);
    expect(
      decodePixels(b.buffer as ArrayBuffer, {
        ...f,
        bitsAllocated: 8,
        bitsStored: 8,
        highBit: 7,
        signed: false,
        slope: 1,
        intercept: 0,
      })[0],
    ).toBe(250);
  });
  it("excludes padding from intensity inspection", () => {
    const b = fixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "a");
    expect(
      decodePixels(b.buffer as ArrayBuffer, { ...f, padding: 24 })[0],
    ).toBeNaN();
  });
  it("never labels MR intensity as HU", () => {
    const b = patchText(fixture(), "x00080060", "MR");
    expect(parseFrame(b.buffer as ArrayBuffer, "a").calibratedHU).toBe(false);
  });
  it("does not infer HU for missing slope or non-HU units", () => {
    const b = patchText(fixture(), "x00281053", "");
    const f = parseFrame(b.buffer as ArrayBuffer, "a");
    expect(f.calibratedHU).toBe(false);
    expect(f.warnings.join()).toMatch(/calibration/);
    const c = patchText(fixture(), "x00281054", "OD");
    expect(parseFrame(c.buffer as ArrayBuffer, "a").calibratedHU).toBe(false);
  });
  it("rejects unsupported transfer syntax", () => {
    const b = patchText(fixture(), "x00020010", "1.2.840.10008.1.2.5");
    expect(() => parseFrame(b.buffer as ArrayBuffer, "a")).toThrow(
      /Unsupported transfer syntax/,
    );
  });
  it("rejects missing geometry rather than guessing", () => {
    const b = patchText(fixture(), "x00200037", "");
    expect(() => parseFrame(b.buffer as ArrayBuffer, "a")).toThrow(/Missing/);
  });
  it("rejects non-monochrome formats", () => {
    const b = patchText(fixture(), "x00280004", "RGB");
    expect(() => parseFrame(b.buffer as ArrayBuffer, "a")).toThrow(
      /monochrome/,
    );
  });
  it("rejects truncated and non-DICOM files", () => {
    const b = fixture();
    expect(() => parseFrame(b.slice(0, -100).buffer, "a")).toThrow();
    expect(() => parseFrame(new ArrayBuffer(16), "a")).toThrow(
      /Unable to read/,
    );
  });
  it("rejects invalid bit packing and rescale", () => {
    const b = patchUS(fixture(), "x00280102", 0);
    expect(() => parseFrame(b.buffer as ArrayBuffer, "a")).toThrow(
      /pixel encoding/,
    );
    const c = patchText(fixture(), "x00281053", "0");
    expect(() => parseFrame(c.buffer as ArrayBuffer, "a")).toThrow(/rescale/);
  });
  it("implements DICOM LINEAR window and MONOCHROME1 inversion", () => {
    expect(windowPixel(-160, 40, 400)).toBe(0);
    expect(windowPixel(239, 40, 400)).toBe(255);
    expect(windowPixel(40, 40, 400)).toBe(128);
    expect(windowPixel(-160, 40, 400, true)).toBe(255);
    expect(windowPixel(10, 10, 1)).toBe(255);
    expect(windowPixel(9, 10, 1)).toBe(0);
    expect(windowPixel(NaN, 40, 400, true)).toBe(0);
  });
});
