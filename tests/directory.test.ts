import { describe, it, expect } from "vitest";
import { droppedFiles } from "../src/core/dicom/client";
const file = (name: string) => ({
  isFile: true,
  file: (done: (f: File) => void) => done(new File(["test"], name)),
});
describe("recursive directory drop", () => {
  it("reads nested folders and all directory batches, including beyond the first 100 entries", async () => {
    const batches: unknown[][] = [
      Array.from({ length: 100 }, (_, i) => file(`${i}.dcm`)),
      [
        {
          isFile: false,
          createReader: () => {
            let read = false;
            return {
              readEntries: (done: (x: unknown[]) => void) => {
                done(read ? [] : [file("nested.dcm")]);
                read = true;
              },
            };
          },
        },
      ],
      [],
    ];
    const root = {
      isFile: false,
      createReader: () => ({
        readEntries: (done: (x: unknown[]) => void) => done(batches.shift()!),
      }),
    };
    const transfer = {
      items: [{ kind: "file", webkitGetAsEntry: () => root }],
      files: [],
    };
    const result = await droppedFiles(transfer as unknown as DataTransfer);
    expect(result).toHaveLength(101);
    expect(result[100].name).toBe("nested.dcm");
  });
  it("falls back to the file list when directory-entry API is absent", async () => {
    const f = new File(["x"], "a.dcm");
    expect(
      await droppedFiles({ items: [], files: [f] } as unknown as DataTransfer),
    ).toEqual([f]);
  });
});
