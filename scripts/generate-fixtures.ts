import { mkdir, writeFile } from "node:fs/promises";
import { syntheticDicom } from "../src/core/dicom/demo";
import { losslessFixture } from "../tests/helpers/losslessFixture";
await mkdir(".fixtures/ct-300/nested", { recursive: true });
await writeFile(".fixtures/jpeg-lossless.dcm", losslessFixture());
for (let i = 0; i < 300; i++)
  await writeFile(
    `.fixtures/ct-300/nested/slice-${String(299 - i).padStart(3, "0")}.dcm`,
    syntheticDicom(i, 300, 512),
  );
await mkdir(".fixtures/second-series", { recursive: true });
for (let i = 0; i < 8; i++)
  await writeFile(
    `.fixtures/second-series/image-${i}.dcm`,
    syntheticDicom(i, 8, 128, 1),
  );
await writeFile(".fixtures/not-dicom.txt", "This is not a DICOM image.");
console.log(
  "Created 300 × 512 × 512 CT series, a second series, and an invalid input. All data is synthetic.",
);
