/// <reference lib="webworker" />
import { parseFrame, decodePixels } from "../core/dicom/parser";
import { syntheticDicom } from "../core/dicom/demo";
import type { Frame, ImportIssue } from "../types/imaging";
const files = new Map<string, File>();
self.onmessage = async (event: MessageEvent) => {
  const m = event.data;
  if (m.type === "import") {
    const frames: Frame[] = [],
      issues: ImportIssue[] = [],
      seen = new Set<string>();
    const count = m.demo ? 344 : m.files.length;
    files.clear();
    for (let i = 0; i < count; i++) {
      const file: File = m.demo
        ? new File(
            [
              syntheticDicom(
                i < 320 ? i : (i - 320) * 13,
                320,
                256,
                i < 320 ? 0 : 1,
              ) as BlobPart,
            ],
            `synthetic-${i}.dcm`,
          )
        : m.files[i];
      try {
        if (file.size > 128 * 1024 * 1024)
          throw new Error(
            "File exceeds the 128 MB single-frame limit. Multiframe objects are unsupported.",
          );
        const buffer = await file.arrayBuffer(),
          id = String(i),
          frame = parseFrame(buffer, id);
        if (seen.has(frame.sopUID)) {
          issues.push({
            file: file.name,
            message: "Duplicate instance UID skipped.",
          });
        } else {
          seen.add(frame.sopUID);
          files.set(id, file);
          frames.push(frame);
        }
      } catch (e) {
        issues.push({
          file: file.name,
          message: e instanceof Error ? e.message : "Unable to read this file.",
        });
      }
      if (i % 8 === 0 || i === count - 1)
        self.postMessage({ type: "progress", done: i + 1, total: count });
    }
    self.postMessage({ type: "imported", frames, issues });
  }
  if (m.type === "decode") {
    try {
      const file = files.get(m.frame.id);
      if (!file)
        throw new Error(
          "Source file is no longer available. Import the study again.",
        );
      const pixels = decodePixels(await file.arrayBuffer(), m.frame);
      self.postMessage({ type: "decoded", request: m.request, pixels }, [
        pixels.buffer,
      ]);
    } catch (e) {
      self.postMessage({
        type: "decodeError",
        request: m.request,
        message:
          e instanceof Error ? e.message : "Unable to decode image pixels.",
      });
    }
  }
};
