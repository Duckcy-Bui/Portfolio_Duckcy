import { expect, test, type Page } from '@playwright/test';

const frameImage = (page: Page) => page.locator('#starfield').evaluate((node) => (node as HTMLCanvasElement).toDataURL());
const afterTwoFrames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('motion pause is keyboard accessible, freezes decorations, and persists across routes', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('[data-motion-toggle]');
  const canvas = page.locator('#starfield');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).toHaveAttribute('data-animation-state', 'running');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-label', 'Resume background animation');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-animation-state', 'paused');
  expect(await page.evaluate(() => localStorage.getItem('portfolio-motion'))).toBe('paused');
  for (const selector of ['.avatar-ring', '.hero h1']) expect(await page.locator(selector).evaluate((node) => getComputedStyle(node).animationPlayState)).toBe('paused');
  const still = await frameImage(page);
  await afterTwoFrames(page);
  expect(await frameImage(page)).toBe(still);
  await page.goto('/contact/');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-animation-state', 'paused');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(canvas).toHaveAttribute('data-animation-state', 'paused');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).toHaveAttribute('data-animation-state', 'running');
  expect(await page.evaluate(() => localStorage.getItem('portfolio-motion'))).toBe('running');
});

test('saved pause is applied before the body is painted and survives theme changes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('portfolio-motion', 'paused');
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      (window as unknown as { motionAtBody: string | undefined }).motionAtBody = document.documentElement.dataset.motionState;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  expect(await page.evaluate(() => (window as unknown as { motionAtBody: string }).motionAtBody)).toBe('paused');
  await expect(page.locator('html')).toHaveAttribute('data-effects-paused', '');
  await page.locator('#theme-pill-btn').click();
  await page.locator('[data-theme-key="forest"]').click();
  await expect(page.locator('#starfield')).toHaveAttribute('data-scene', 'forest');
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'paused');
  const still = await frameImage(page);
  await afterTwoFrames(page);
  expect(await frameImage(page)).toBe(still);
  await page.locator('#chatbot-fab').click();
  await page.locator('#chatbot-close').click();
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'paused');
});

test('resuming respects OS reduced motion, including a system preference change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const toggle = page.locator('[data-motion-toggle]');
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'reduced');
  await expect(page.locator('[data-motion-status]')).toContainText("system's reduced motion");
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'running');
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'reduced');
  const still = await frameImage(page);
  await afterTwoFrames(page);
  expect(await frameImage(page)).toBe(still);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'reduced');
});

test('pause control works with denied storage and fits a narrow header in every theme', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const toggle = page.locator('[data-motion-toggle]');
  await toggle.click();
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'paused');
  await toggle.click();
  await expect(page.locator('#starfield')).toHaveAttribute('data-animation-state', 'running');
  for (const width of [320, 390, 768, 981, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['dark', 'light', 'forest', 'ocean', 'sunset']) {
      await page.locator('#theme-pill-btn').click();
      await page.locator(`[data-theme-key="${theme}"]`).click();
      await expect(toggle).toBeVisible();
      const bounds = await toggle.boundingBox();
      expect(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width, `${width}px ${theme}`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${theme}`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('motion control stays hidden without JavaScript while navigation remains native', async ({ browser }, testInfo) => {
  const viewport = testInfo.project.name.startsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('[data-motion-toggle]')).toBeHidden();
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('[data-nav]').getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await context.close();
});
