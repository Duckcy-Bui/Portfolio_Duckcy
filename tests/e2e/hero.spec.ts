import { expect, test } from '@playwright/test';

test('mobile hero exposes CV and contact directly after the heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const heading = await page.locator('.hero-intro').boundingBox();
  const actions = page.locator('.cta-group');
  const box = await actions.boundingBox();
  const portrait = await page.locator('.hero-visual').boundingBox();
  const yaml = await page.locator('.code-card').boundingBox();
  expect(heading && box && portrait && yaml).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
  expect(box!.y).toBeLessThan(heading!.y + heading!.height + 32);
  expect(box!.y + box!.height).toBeLessThan(844);
  expect(portrait!.y).toBeGreaterThan(box!.y + box!.height);
  expect(yaml!.y).toBeGreaterThan(portrait!.y);
  const cv = actions.getByRole('link', { name: /Download CV/i });
  const contact = actions.getByRole('link', { name: /Let.s Connect/i });
  const game = actions.getByRole('button', { name: /Play Game/i });
  await expect(cv).toBeInViewport();
  await expect(contact).toBeInViewport();
  await expect(game).toBeVisible();
  expect((await game.boundingBox())!.y).toBeGreaterThan((await contact.boundingBox())!.y);
  await expect(cv).toHaveAttribute('href', '/assets/CV_bui_hai_duc.pdf');
  await contact.click();
  await expect(page).toHaveURL(/\/contact\/$/);
});

test('desktop hero retains its two columns and YAML with CV and contact as primary actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const yaml = await page.locator('.code-card').boundingBox();
  const actions = page.locator('.cta-group');
  const cv = await actions.getByRole('link', { name: /Download CV/i }).boundingBox();
  const contact = await actions.getByRole('link', { name: /Let.s Connect/i }).boundingBox();
  const game = await actions.getByRole('button', { name: /Play Game/i }).boundingBox();
  const portrait = await page.locator('.hero-visual').boundingBox();
  expect(yaml && cv && contact && game && portrait).toBeTruthy();
  expect(cv!.y).toBeGreaterThan(yaml!.y + yaml!.height);
  const visualOrder = [{ name: 'cv', box: cv! }, { name: 'game', box: game! }, { name: 'contact', box: contact! }]
    .sort((a, b) => Math.abs(a.box.y - b.box.y) < 12 ? a.box.x - b.box.x : a.box.y - b.box.y)
    .map((action) => action.name);
  expect(visualOrder).toEqual(['cv', 'contact', 'game']);
  expect(portrait!.x).toBeGreaterThan(yaml!.x + yaml!.width);
  await expect(page.locator('.avatar-ring')).toBeVisible();
});
