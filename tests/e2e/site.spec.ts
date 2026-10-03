import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/', '/about/', '/skills/', '/projects/', '/projects/sblt-cup/',
  '/projects/classes369/', '/projects/investor-ai/', '/experience/',
  '/certificate/', '/contact/',
];
const navLabels = ['Home', 'About', 'Skills', 'Projects', 'Experience', 'Certificates', 'Contact'];
const themeValues = ['dark', 'light', 'forest', 'ocean', 'sunset'];
const routeName = (route: string) => route === '/' ? 'home' : route.replaceAll('/', '-').replace(/^-|-$/g, '');

async function screenshot(page: Page, name: string, project: string) {
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: `artifacts/screenshots/${project}-${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  // External embeds/proxy are verified separately. Keep UI acceptance deterministic.
  await page.route('https://cdn.credly.com/assets/utilities/embed.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const route of routes) {
  test(`direct route, refresh, semantics and layout: ${route}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const missing: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:4321/') && response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
    });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://duckcy.me${route}`);
    await expect(page.locator('[data-nav] a[aria-current="page"]')).toHaveCount(1);
    for (const label of navLabels) await expect(page.locator('[data-nav]').getByRole('link', { name: label, exact: true, includeHidden: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const unloadedImages = await page.locator('img').evaluateAll((images) => images.filter((node) => {
      const image = node as HTMLImageElement;
      return image.loading !== 'lazy' && (!image.complete || !image.naturalWidth);
    }).map((node) => (node as HTMLImageElement).src));
    expect(unloadedImages).toEqual([]);
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(route);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || '')), JSON.stringify(axe.violations, null, 2)).toEqual([]);
    await screenshot(page, routeName(route), testInfo.project.name);
    expect(errors).toEqual([]);
    expect(missing).toEqual([]);
  });
}

test('canonical clean paths work and unknown paths stay 404', async ({ page }) => {
  for (const route of ['/certificate/', '/projects/sblt-cup/', '/contact/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(route);
  }
  const response = await page.goto('/this-page-does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText(/404|not found/i);
  await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible();
});

test('navigation changes pages and native Back/Forward restore them', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.locator('[data-nav-toggle]').click();
  await page.locator('[data-nav]').getByRole('link', { name: 'Certificates', exact: true }).click();
  await expect(page).toHaveURL(/\/certificate\/$/);
  await expect(page.locator('[data-nav] a[aria-current="page"]')).toHaveText('Certificates');
  await page.goBack();
  await expect(page).toHaveURL(/4321\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/certificate\/$/);
});

test('home primary links remain reachable beside the floating assistant', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    const link = await page.getByRole('link', { name: 'All projects', exact: true }).boundingBox();
    const widget = await page.locator('#chatbot-fab').boundingBox();
    expect(link).not.toBeNull();
    expect(widget).not.toBeNull();
    const separated = link!.x + link!.width <= widget!.x || link!.x >= widget!.x + widget!.width
      || link!.y + link!.height <= widget!.y || link!.y >= widget!.y + widget!.height;
    expect(separated, 'The full All projects link must be visible beside the assistant').toBe(true);
  }
  await page.getByRole('link', { name: 'All projects', exact: true }).click({ timeout: 3_000 });
  await expect(page).toHaveURL(/\/projects\/$/);
  await page.goto('/');
  await page.getByRole('link', { name: /let.s connect/i }).click({ timeout: 3_000 });
  await expect(page).toHaveURL(/\/contact\/$/);
});

test('legacy section links migrate to their dedicated pages', async ({ page }) => {
  for (const [hash, route] of [['#about', '/about/'], ['#projects', '/projects/'], ['#contact', '/contact/'], ['#certificates', '/certificate/']]) {
    await page.goto(`/${hash}`);
    await expect(page).toHaveURL(`http://127.0.0.1:4321${route}`);
    await expect(page.locator('h1')).toBeVisible();
  }
  await page.goto('/#home');
  await expect(page).toHaveURL('http://127.0.0.1:4321/');
});

test('mobile navigation keyboard, Escape, resize and focus restoration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('[data-nav-toggle]');
  const nav = page.locator('[data-nav]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav).toHaveAttribute('aria-hidden', 'false');
  await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeFocused();
  await nav.getByRole('link', { name: 'Contact', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(nav.getByRole('link', { name: 'Contact', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).not.toHaveAttribute('aria-hidden');
});

test('all themes persist across pages and pass serious accessibility checks', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const theme of themeValues) {
    await page.locator('#theme-select').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.goto('/contact/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#theme-select')).toHaveValue(theme);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || '')), JSON.stringify(axe.violations, null, 2)).toEqual([]);
    await page.goto('/');
    await screenshot(page, `home-theme-${theme}`, testInfo.project.name);
  }
});

test('reduced motion and denied storage preserve usable navigation', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#theme-select').selectOption('ocean');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  if (isMobile) await page.locator('[data-nav-toggle]').click();
  await page.locator('[data-nav]').getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await expect(page.locator('[data-project]')).toHaveCount(3);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(errors).toEqual([]);
});

test('core pages, assets and native links remain useful without JavaScript', async ({ browser }, testInfo) => {
  const viewport = testInfo.project.name.startsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('h1')).toBeVisible();
  const cv = page.getByRole('link', { name: /Download CV/i }).first();
  await expect(cv).toHaveAttribute('href', '/assets/CV_bui_hai_duc.pdf');
  const cvResponse = await page.request.get('/assets/CV_bui_hai_duc.pdf');
  expect(cvResponse.status()).toBe(200);
  expect(cvResponse.headers()['content-type']).toContain('application/pdf');
  await page.locator('[data-nav]').getByRole('link', { name: 'Certificates', exact: true }).click();
  await expect(page).toHaveURL(/\/certificate\/$/);
  await expect(page.getByRole('link', { name: /credly|credential|badge/i }).first()).toBeVisible();
  await page.goto('http://127.0.0.1:4321/contact/');
  await expect(page.locator('a[href="mailto:duckcy.work@gmail.com"]').first()).toBeVisible();
  await screenshot(page, 'contact-no-javascript', testInfo.project.name);
  await context.close();
});

test('200 percent text scale stays within viewport', async ({ page }) => {
  for (const route of ['/', '/projects/', '/certificate/', '/contact/']) {
    await page.goto(route);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true);
    await expect(page.locator('h1')).toBeVisible();
  }
});
