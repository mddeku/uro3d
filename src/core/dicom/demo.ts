// A Part 10 writer used ONLY to generate explicitly synthetic development data.
// Patient files are parsed by dicom-parser, never by this fixture writer.
export function syntheticDicom(
  slice: number,
  count = 320,
  size = 256,
  phase = 0,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const add = (
    group: number,
    element: number,
    vr: string,
    value: string | number | Uint8Array,
  ) => {
    let bytes: Uint8Array;
    if (typeof value === "number") {
      bytes = new Uint8Array(2);
      new DataView(bytes.buffer).setUint16(0, value, true);
    } else if (typeof value === "string") {
      const s = value.length % 2 ? value + (vr === "UI" ? "\0" : " ") : value;
      bytes = new TextEncoder().encode(s);
    } else bytes = value;
    const long = ["OW", "OB", "SQ", "UN", "UT"].includes(vr),
      header = new Uint8Array(long ? 12 : 8),
      v = new DataView(header.buffer);
    v.setUint16(0, group, true);
    v.setUint16(2, element, true);
    header[4] = vr.charCodeAt(0);
    header[5] = vr.charCodeAt(1);
    if (long) v.setUint32(8, bytes.length, true);
    else v.setUint16(6, bytes.length, true);
    chunks.push(header, bytes);
  };
  const preamble = new Uint8Array(132);
  preamble.set(new TextEncoder().encode("DICM"), 128);
  chunks.push(preamble);
  const root = "1.2.826.0.1.3680043.10.543.99";
  add(2, 0x10, "UI", "1.2.840.10008.1.2.1");
  add(8, 0x16, "UI", "1.2.840.10008.5.1.4.1.1.2");
  add(8, 0x18, "UI", `${root}.${phase + 1}.${slice + 1}`);
  add(8, 0x20, "DA", "20260101");
  add(8, 0x60, "CS", "CT");
  add(8, 0x1030, "LO", "Synthetic abdomen - NOT patient anatomy");
  add(
    8,
    0x103e,
    "LO",
    phase ? "Synthetic soft reconstruction" : "Synthetic non-contrast",
  );
  add(0x10, 0x10, "PN", "SYNTHETIC^DEMO");
  add(0x10, 0x20, "LO", "DEMO-NO-PHI");
  add(0x18, 0x50, "DS", "1");
  add(0x18, 0x88, "DS", "1");
  add(0x18, 0x1210, "SH", phase ? "SOFT" : "STANDARD");
  add(0x20, 0xd, "UI", root);
  add(0x20, 0xe, "UI", `${root}.${phase + 1}`);
  add(0x20, 0x13, "IS", String(count - slice));
  add(0x20, 0x32, "DS", `-160\\-160\\${slice - count / 2}`);
  add(0x20, 0x37, "DS", "1\\0\\0\\0\\1\\0");
  add(0x28, 2, "US", 1);
  add(0x28, 4, "CS", "MONOCHROME2");
  add(0x28, 0x10, "US", size);
  add(0x28, 0x11, "US", size);
  add(0x28, 0x30, "DS", `${320 / size}\\${320 / size}`);
  add(0x28, 0x100, "US", 16);
  add(0x28, 0x101, "US", 16);
  add(0x28, 0x102, "US", 15);
  add(0x28, 0x103, "US", 1);
  add(0x28, 0x1050, "DS", "40");
  add(0x28, 0x1051, "DS", "400");
  add(0x28, 0x1052, "DS", "-1024");
  add(0x28, 0x1053, "DS", "1");
  add(0x28, 0x1054, "LO", "HU");
  const pixels = new Uint8Array(size * size * 2),
    pv = new DataView(pixels.buffer),
    z = ((slice - count / 2) * 320) / count;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size - 0.5) * 320,
        py = (y / size - 0.5) * 320;
      let hu = -1000;
      const body = (px * px) / (132 * 132) + (py * py) / (100 * 100);
      if (body < 1) {
        hu = body > 0.91 ? -80 : 35 + 12 * Math.sin(x * 1.7 + y * 2.4 + slice);
        if (body > 0.7 && body < 0.87) hu = -90;
      }
      if ((px * px) / 380 + (py - 53) ** 2 / 270 < 1) hu = 700;
      if ((px * px) / 100 + (py - 53) ** 2 / 90 < 1) hu = 90;
      for (const side of [-1, 1]) {
        const k =
          (px - side * 61) ** 2 / 600 + (py - 20) ** 2 / 380 + (z * z) / 4200;
        if (k < 1) hu = 46 + phase * 35;
        if (
          (px - side * 56) ** 2 / 90 + (py - 17) ** 2 / 120 + (z * z) / 2500 <
          1
        )
          hu = -30;
      }
      if ((px - 67) ** 2 / 20 + (py - 29) ** 2 / 15 + (z + 18) ** 2 / 45 < 1)
        hu = 1120;
      if ((px + 55) ** 2 / 1300 + (py + 40) ** 2 / 600 + (z * z) / 8500 < 1)
        hu = 65;
      if ((px - 16) ** 2 / 60 + (py - 9) ** 2 / 75 < 1 && body < 1) hu = 45;
      pv.setInt16((y * size + x) * 2, Math.round(hu + 1024), true);
    }
  add(0x7fe0, 0x10, "OW", pixels);
  const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
