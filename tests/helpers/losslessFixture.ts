import dicomParser from "dicom-parser";
import { syntheticDicom } from "../../src/core/dicom/demo";
export function losslessFixture(
  signed = false,
  emptyOffsetTable = true,
  split = false,
) {
  let bytes = syntheticDicom(0, 1, 16);
  let ds = dicomParser.parseDicom(bytes);
  const syntax = ds.elements.x00020010;
  const uid = new TextEncoder().encode("1.2.840.10008.1.2.4.70\0");
  const header = bytes.slice(syntax.dataOffset - 8, syntax.dataOffset);
  new DataView(header.buffer).setUint16(6, uid.length, true);
  const concat = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of parts) {
      out.set(p, i);
      i += p.length;
    }
    return out;
  };
  bytes = concat([
    bytes.slice(0, syntax.dataOffset - 8),
    header,
    uid,
    bytes.slice(syntax.dataOffset + syntax.length),
  ]);
  ds = dicomParser.parseDicom(bytes);
  new DataView(bytes.buffer).setUint16(
    ds.elements.x00280103.dataOffset,
    signed ? 1 : 0,
    true,
  );
  // Minimal lossless JPEG: 16x16 constant 32768, predictor 1, category-zero Huffman code.
  // Exactly byte-aligned entropy tests the last-sample regression in older decoders.
  const jpeg = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc3,
    0,
    11,
    16,
    0,
    16,
    0,
    16,
    1,
    1,
    0x11,
    0,
    0xff,
    0xc4,
    0,
    20,
    0,
    1,
    ...new Array(15).fill(0),
    0,
    0xff,
    0xda,
    0,
    8,
    1,
    1,
    0,
    1,
    0,
    0,
    ...new Array(32).fill(0),
    0xff,
    0xd9,
  ]);
  const item = (element: number, payload: Uint8Array) => {
    const h = new Uint8Array(8),
      v = new DataView(h.buffer);
    v.setUint16(0, 0xfffe, true);
    v.setUint16(2, element, true);
    v.setUint32(4, payload.length, true);
    return concat([h, payload]);
  };
  const pixelHeader = new Uint8Array([
    0xe0, 0x7f, 0x10, 0, 79, 66, 0, 0, 255, 255, 255, 255,
  ]);
  const fragments = split
    ? [item(0xe000, jpeg.slice(0, 20)), item(0xe000, jpeg.slice(20))]
    : [item(0xe000, jpeg)];
  return concat([
    bytes.slice(0, ds.elements.x7fe00010.dataOffset - 12),
    pixelHeader,
    item(0xe000, new Uint8Array(emptyOffsetTable ? 0 : 4)),
    ...fragments,
    item(0xe0dd, new Uint8Array()),
  ]);
}
