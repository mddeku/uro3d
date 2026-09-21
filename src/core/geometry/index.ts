import type { Frame, Series, Vec3 } from "../../types/imaging";
export const dot = (a: number[], b: number[]) =>
  a.reduce((v, x, i) => v + x * b[i], 0);
export const cross = (a: number[], b: number[]): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const subtract = (a: number[], b: number[]): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const distance3D = (a: Vec3, b: Vec3) => Math.hypot(...subtract(a, b));
export function validateGeometry(
  f: Pick<Frame, "orientation" | "position" | "spacing">,
) {
  if (
    f.orientation.length !== 6 ||
    f.position.length !== 3 ||
    f.spacing.length !== 2 ||
    ![...f.orientation, ...f.position, ...f.spacing].every(Number.isFinite)
  )
    throw new Error(
      "Missing or invalid image position, orientation, or pixel spacing. Patient orientation cannot be established.",
    );
  const x = f.orientation.slice(0, 3),
    y = f.orientation.slice(3);
  if (
    Math.abs(dot(x, x) - 1) > 0.002 ||
    Math.abs(dot(y, y) - 1) > 0.002 ||
    Math.abs(dot(x, y)) > 0.002 ||
    f.spacing.some((v) => v <= 0)
  )
    throw new Error(
      "Invalid orientation matrix or pixel spacing. This image cannot be positioned reliably.",
    );
}
// DICOM LPS: +X left, +Y posterior, +Z superior. i is column, j is row.
export function imageToWorld(
  f: Pick<Frame, "position" | "orientation" | "spacing">,
  i: number,
  j: number,
): Vec3 {
  return f.position.map(
    (p, k) =>
      p +
      i * f.spacing[1] * f.orientation[k] +
      j * f.spacing[0] * f.orientation[k + 3],
  ) as Vec3;
}
export function worldToImage(
  f: Pick<Frame, "position" | "orientation" | "spacing">,
  point: Vec3,
): [number, number] {
  const d = subtract(point, f.position),
    x = f.orientation.slice(0, 3),
    y = f.orientation.slice(3);
  const xx = dot(x, x),
    yy = dot(y, y),
    xy = dot(x, y),
    det = xx * yy - xy * xy;
  // Invert the in-plane Gram matrix, retaining round-trip accuracy for rounded DICOM cosines.
  return [
    (dot(d, x) * yy - dot(d, y) * xy) / det / f.spacing[1],
    (dot(d, y) * xx - dot(d, x) * xy) / det / f.spacing[0],
  ];
}
export function orientationLabel(vector: number[]) {
  const labels = [
    ["R", "L"],
    ["A", "P"],
    ["I", "S"],
  ];
  return vector
    .map((v, i) => ({ m: Math.abs(v), label: labels[i][v >= 0 ? 1 : 0] }))
    .filter((v) => v.m > 0.05)
    .sort((a, b) => b.m - a.m)
    .map((v) => v.label)
    .join("");
}
export function buildSeries(frames: Frame[]): Series[] {
  const groups = new Map<string, Frame[]>();
  for (const f of frames) {
    const id = f.studyUID + "|" + f.seriesUID;
    const group = groups.get(id);
    if (group) group.push(f);
    else groups.set(id, [f]);
  }
  return [...groups].map(([id, items]) => {
    const f = items[0],
      normal = cross(f.orientation.slice(0, 3), f.orientation.slice(3));
    const warnings = [...new Set(items.flatMap((x) => x.warnings))];
    const consistent = items.every(
      (x) =>
        x.rows === f.rows &&
        x.columns === f.columns &&
        x.modality === f.modality &&
        x.orientation.every((v, i) => Math.abs(v - f.orientation[i]) < 0.001) &&
        x.spacing.every((v, i) => Math.abs(v - f.spacing[i]) < 0.001),
    );
    if (!consistent)
      warnings.push(
        "Inconsistent orientation, dimensions, modality, or pixel spacing. Acquired images remain individually viewable; volume reconstruction is blocked.",
      );
    items.sort(
      (a, b) =>
        dot(a.position, normal) - dot(b.position, normal) ||
        a.instance - b.instance,
    );
    const gaps = items
      .slice(1)
      .map((x, i) => dot(subtract(x.position, items[i].position), normal));
    const positive = gaps.filter((g) => g > 0.01).sort((a, b) => a - b);
    const sliceSpacing = positive.length
      ? positive[Math.floor(positive.length / 2)]
      : undefined;
    if (gaps.some((g) => Math.abs(g) < 0.01))
      warnings.push(
        "Duplicate slice positions detected. All images are retained; review for repeated acquisitions.",
      );
    if (
      sliceSpacing &&
      gaps.some(
        (g) =>
          g > 0.01 &&
          Math.abs(g - sliceSpacing) > Math.max(0.1, sliceSpacing * 0.05),
      )
    )
      warnings.push(
        "Irregular slice spacing / possible missing slices. No interpolation has been applied.",
      );
    if (
      consistent &&
      items.slice(1).some((x, i) => {
        const d = subtract(x.position, items[i].position);
        return (
          Math.hypot(
            dot(d, f.orientation.slice(0, 3)),
            dot(d, f.orientation.slice(3)),
          ) > 0.1
        );
      })
    )
      warnings.push(
        "In-plane slice displacement / possible gantry tilt detected. Acquired images are displayed without resampling.",
      );
    if (new Set(items.map((x) => x.kernel)).size > 1)
      warnings.push("Multiple reconstruction kernels in this series.");
    const a = normal.map(Math.abs),
      axis = a.indexOf(Math.max(...a));
    const plane =
      (a[axis] > 0.999 ? "" : "Oblique ") +
      ["Sagittal", "Coronal", "Axial"][axis];
    return { id, frames: items, warnings, sliceSpacing, plane };
  });
}
