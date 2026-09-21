import { describe, it, expect } from "vitest";
import { parseFrame, decodePixels } from "../src/core/dicom/parser";
import { losslessFixture } from "./helpers/losslessFixture";
describe("JPEG Lossless CT import", () => {
  it.each([true, false])(
    "decodes exact pixels including last sample, empty offset table=%s",
    (empty) => {
      const bytes = losslessFixture(false, empty),
        f = parseFrame(bytes.buffer as ArrayBuffer, "test");
      expect(f.transferSyntax).toBe("1.2.840.10008.1.2.4.70");
      const pixels = decodePixels(bytes.buffer as ArrayBuffer, f);
      expect(pixels).toHaveLength(256);
      expect([...pixels].every((x) => x === 32768 - 1024)).toBe(true);
    },
  );
  it("joins multiple fragments and applies signed rescaling", () => {
    const b = losslessFixture(true, true, true),
      f = parseFrame(b.buffer as ArrayBuffer, "test");
    expect(
      [...decodePixels(b.buffer as ArrayBuffer, f)].every(
        (x) => x === -32768 - 1024,
      ),
    ).toBe(true);
  });
  it("rejects JPEG dimensions inconsistent with metadata before pixel allocation", () => {
    const b = losslessFixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "test");
    expect(() =>
      decodePixels(b.buffer as ArrayBuffer, { ...f, columns: 17 }),
    ).toThrow(/Unable to decode/);
  });
  it("rejects truncated compressed data", () => {
    const b = losslessFixture(),
      f = parseFrame(b.buffer as ArrayBuffer, "test");
    expect(() => decodePixels(b.slice(0, -35).buffer, f)).toThrow(
      /Unable to decode/,
    );
  });
});
