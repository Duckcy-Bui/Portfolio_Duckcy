import { expect, test } from '@playwright/test';

const credentialUrl = 'https://www.credly.com/badges/73787dad-002a-4cce-b49d-011b40587df9';

test('certificate badge stays large and readable with Credly unavailable, in the responsive original interface', async ({ page, isMobile }) => {
  const providerRequests: string[] = [];
  await page.route('https://**.credly.com/**', (route) => {
    providerRequests.push(route.request().url());
    return route.abort();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/certificate/');
  const image = page.locator('[data-certificate-image]');
  const details = page.locator('.cert-details');
  await expect(image).toBeVisible();
  expect(await image.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const imageBox = (await image.boundingBox())!;
  const detailsBox = (await details.boundingBox())!;
  expect(imageBox.width).toBeGreaterThanOrEqual(220);
  if (isMobile) expect(imageBox.y + imageBox.height).toBeLessThan(detailsBox.y);
  else expect(imageBox.x + imageBox.width).toBeLessThan(detailsBox.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const name of ['Overview', 'Education', 'Certificates', 'Testimonials']) {
    await expect(page.getByRole('navigation', { name: 'About sections' }).getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator(`main a[href="${credentialUrl}"]`)).toBeVisible();
  await expect(page.locator('[data-certificate-image-unavailable]')).toBeHidden();
  expect(providerRequests).toEqual([]);
});

test('certificate remains useful when its local badge asset fails', async ({ page }) => {
  await page.route('**/assets/certificates/aws-sbg-core-team.png', (route) => route.abort());
  await page.goto('/certificate/');
  await expect(page.locator('[data-certificate-image-unavailable]')).toContainText(/image is unavailable/i);
  await expect(page.locator('[data-certificate-image]')).toBeHidden();
  await expect(page.locator(`main a[href="${credentialUrl}"]`)).toBeVisible();
  await expect(page.locator('.cert-details')).toContainText('AWS Community');
});

test('authentic certificate artwork and verification link work without JavaScript', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: testInfo.project.use.viewport });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4321/certificate/');
    const image = page.locator('[data-certificate-image]');
    await expect(image).toBeVisible();
    expect(await image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(`main a[href="${credentialUrl}"]`)).toBeVisible();
    await expect(page.locator('[data-about-navigation] a[aria-current="page"]')).toHaveText('Certificates');
  } finally { await context.close(); }
});
