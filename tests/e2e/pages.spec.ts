import { test, expect } from '@playwright/test';

test('production assets, DICOM worker and lazy MPR/3D work under a subpath', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  await page.getByRole('button', { name: /Explore synthetic demo/ }).click();
  await expect(page.getByTestId('slice-label')).toHaveText('Image 161 / 320', { timeout: 90000 });
  for (const orientation of ['coronal', 'sagittal']) {
    await page.getByLabel('2D viewer orientation').selectOption(orientation);
    const canvas = page.getByTestId(`mpr-${orientation}`);
    await expect(canvas).toBeVisible({ timeout: 60000 });
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
      const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
      return pixels.some((value, index) => index % 4 !== 3 && value > 80);
    })).toBe(true);
  }
  await page.getByRole('button', { name: '3D Volume', exact: true }).click();
  await expect(page.locator('.volume-canvas canvas')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.volume-caption')).toContainText('voxels', { timeout: 60000 });
  await page.getByRole('button', { name: 'PCNL Planner', exact: true }).click();
  await expect(page.locator('.pcnl-controls')).toBeVisible({ timeout: 60000 });
  expect(failures).toEqual([]);
});
