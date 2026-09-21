import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
test("300-slice folder import, calibrated display, controls, privacy and errors", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(r.url());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /A clearer view/ }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/01-empty.png", fullPage: true });
  await page
    .getByTestId("folder-input")
    .setInputFiles(path.resolve(".fixtures/ct-300"));
  await expect(page.getByTestId("slice-label")).toHaveText("Image 151 / 300", {
    timeout: 90000,
  });
  await expect(page.getByText("Decoding locally…")).toHaveCount(0);
  const canvas = page.getByTestId("image-canvas");
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 !== 3 && v > 80);
    }),
  ).toBe(true);
  await expect(page.locator(".orientation.west")).toHaveText("R");
  await expect(page.locator(".orientation.east")).toHaveText("L");
  await canvas.hover();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId("slice-label")).toHaveText("Image 152 / 300");
  await page.getByRole("button", { name: "Bone", exact: true }).click();
  await expect(page.getByTestId("window-label")).toHaveText("WL 400 / WW 1800");
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("zoom-label")).not.toHaveText("Zoom 100%");
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(before);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("zoom-label")).toHaveText("Zoom 100%");
  await expect(page.getByTestId("window-label")).toHaveText("WL 40 / WW 400");
  await page
    .getByRole("button", { name: "Window / level", exact: true })
    .click();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 15, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("window-label")).toHaveText("WL 70 / WW 460");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId("probe")).toContainText("HU");
  await page.screenshot({
    path: "test-results/02-ct-viewer.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /LOCAL PROCESSING/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Nothing is uploaded");
  await page.getByRole("button", { name: "Back to workspace" }).click();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  const names = await readdir(".fixtures/second-series");
  await page
    .getByTestId("file-input")
    .setInputFiles([
      path.resolve(".fixtures/ct-300/nested/slice-000.dcm"),
      ...names.map((n) => path.resolve(".fixtures/second-series", n)),
    ]);
  await expect(page.locator(".series-card")).toHaveCount(2);
  await page
    .locator(".series-card")
    .filter({ hasText: "Synthetic soft reconstruction" })
    .click();
  await expect(page.getByTestId("slice-label")).toHaveText("Image 5 / 8");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve(".fixtures/not-dicom.txt"));
  await expect(page.getByRole("alert")).toContainText("No supported images");
  await expect(
    page
      .locator(".import-problems")
      .getByText("Unable to read this DICOM file.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("synthetic demo uses importer, supports keyboard scrolling and clear", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: /Explore synthetic demo/ }).click();
  await expect(page.getByTestId("slice-label")).toHaveText("Image 161 / 320", {
    timeout: 90000,
  });
  await expect(page.locator(".series-card")).toHaveCount(2);
  await page.getByLabel("DICOM image viewport.", { exact: false }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("slice-label")).toHaveText("Image 162 / 320");
  await page.getByRole("button", { name: "Clear study", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /A clearer view/ }),
  ).toBeVisible();
});
test("file drag-and-drop imports through the real worker", async ({ page }) => {
  await page.goto("./");
  const bytes = [...(await readFile(".fixtures/ct-300/nested/slice-000.dcm"))];
  const transfer = await page.evaluateHandle((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array(bytes)], "dropped.dcm", {
        type: "application/dicom",
      }),
    );
    return dt;
  }, bytes);
  await page.locator(".app").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByTestId("slice-label")).toHaveText("Image 1 / 1");
  await expect(page.getByText("Decoding locally…")).toHaveCount(0);
});
