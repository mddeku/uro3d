import { describe, it, expect } from "vitest";
import {
  buildSeries,
  distance3D,
  imageToWorld,
  worldToImage,
  orientationLabel,
  validateGeometry,
  cross,
  dot,
} from "../src/core/geometry";
import { parseFrame } from "../src/core/dicom/parser";
import { syntheticDicom } from "../src/core/dicom/demo";
const base = parseFrame(syntheticDicom(0, 5, 16).buffer as ArrayBuffer, "0");
describe("DICOM geometry in patient LPS millimeters", () => {
  it("round trips slightly rounded direction cosines without losing physical position", () => {
    const f = { ...base, orientation: [0.7071, 0.7071, 0, -0.7071, 0.7071, 0] };
    validateGeometry(f);
    const result = worldToImage(f, imageToWorld(f, 511.5, 117.25));
    expect(result[0]).toBeCloseTo(511.5, 8);
    expect(result[1]).toBeCloseTo(117.25, 8);
  });
  it("uses column spacing for i and row spacing for j", () => {
    expect(
      imageToWorld({ ...base, position: [10, 20, 30], spacing: [2, 3] }, 4, 5),
    ).toEqual([22, 30, 30]);
  });
  it("round trips rotated oblique anisotropic geometry", () => {
    const a = Math.PI / 6,
      f = {
        ...base,
        position: [-50, 37, 128] as [number, number, number],
        orientation: [Math.cos(a), Math.sin(a), 0, 0, 0, 1],
        spacing: [0.7, 1.3] as [number, number],
      };
    validateGeometry(f);
    const p = worldToImage(f, imageToWorld(f, 17.25, 39.5));
    expect(p[0]).toBeCloseTo(17.25);
    expect(p[1]).toBeCloseTo(39.5);
  });
  it("computes physical distance", () =>
    expect(distance3D([0, 0, 0], [3, 4, 12])).toBe(13));
  it.each([
    [[1, 0, 0], "L"],
    [[-1, 0, 0], "R"],
    [[0, 1, 0], "P"],
    [[0, -1, 0], "A"],
    [[0, 0, 1], "S"],
    [[0, 0, -1], "I"],
    [[0.8, 0, 0.6], "LS"],
  ] as [number[], string][])("labels patient direction %j", (v, label) =>
    expect(orientationLabel(v)).toBe(label),
  );
  it("uses a right-handed slice normal", () => {
    const n = cross([1, 0, 0], [0, 1, 0]);
    expect(n).toEqual([0, 0, 1]);
    expect(dot(n, [0, 0, 1])).toBe(1);
  });
  it("sorts geometrically despite reversed instances/input", () => {
    const frames = [4, 0, 3, 1, 2].map((i) =>
      parseFrame(syntheticDicom(i, 5, 16).buffer as ArrayBuffer, String(i)),
    );
    const s = buildSeries(frames)[0];
    expect(s.frames.map((f) => f.id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(s.sliceSpacing).toBe(1);
    expect(s.warnings).toEqual([]);
  });
  it("sorts reversed patient Z orientation along its own normal", () => {
    const frames = [0, 2, 1].map((i) => ({
      ...base,
      id: String(i),
      orientation: [-1, 0, 0, 0, 1, 0],
      position: [0, 0, i] as [number, number, number],
    }));
    expect(buildSeries(frames)[0].frames.map((f) => f.id)).toEqual([
      "2",
      "1",
      "0",
    ]);
  });
  it("detects duplicate positions, missing slices, tilt and inconsistent geometry", () => {
    const frames = [0, 1, 1, 2, 4].map((z, i) => ({
      ...base,
      id: String(i),
      position: [i, 0, z] as [number, number, number],
    }));
    const warnings = buildSeries(frames)[0].warnings.join(" ");
    expect(warnings).toMatch(/Duplicate/);
    expect(warnings).toMatch(/missing/);
    expect(warnings).toMatch(/gantry tilt/);
    frames[1].orientation = [0, 1, 0, 1, 0, 0];
    expect(buildSeries(frames)[0].warnings.join()).toMatch(/Inconsistent/);
  });
  it("groups by study and series UIDs", () => {
    expect(
      buildSeries([
        base,
        { ...base, seriesUID: "other" },
        { ...base, studyUID: "other" },
      ]),
    ).toHaveLength(3);
  });
  it.each([
    { orientation: [1, 0, 0, 1, 0, 0] },
    { spacing: [0, 1] },
    { position: [NaN, 0, 0] },
    { orientation: [1, 0, 0] },
  ])("rejects malformed geometry %j", (patch) =>
    expect(() =>
      validateGeometry({ ...base, ...patch } as typeof base),
    ).toThrow(),
  );
});
