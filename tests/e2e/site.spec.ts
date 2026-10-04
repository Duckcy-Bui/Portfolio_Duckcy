import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/', '/about/', '/skills/', '/projects/', '/projects/sblt-cup/',
  '/projects/classes369/', '/projects/investor-ai/', '/experience/',
  '/certificate/', '/contact/',
];
const navLabels = ['Home', 'Skills', 'Projects', 'Experience', 'Contact'];
const themeLabels: Record<string, string> = { dark: 'Outer Space', light: 'Daylight', forest: 'Forest Terminal', ocean: 'Deep Ocean', sunset: 'Sunset Ember' };
async function chooseTheme(page: Page, theme: string) {
  await page.locator('#theme-pill-btn').click();
  await page.locator(`[data-theme-key="${theme}"]`).click();
}
async function certificateNavigation(page: Page, isMobile: boolean) {
  if (isMobile) await page.locator('[data-nav-toggle]').click();
  await page.locator('[data-nav-dropdown]').click();
  await page.locator('[data-nav]').getByRole('menuitem', { name: 'Certificates', exact: true }).click();
}
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
    await expect(page.locator('[data-nav] [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('[data-nav-dropdown]')).toHaveText(/About/);
    for (const label of ['Overview', 'Education', 'Certificates', 'Testimonials']) await expect(page.locator('[data-nav]').getByRole('menuitem', { name: label, exact: true, includeHidden: true })).toHaveCount(1);
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
  await certificateNavigation(page, isMobile);
  await expect(page).toHaveURL(/\/certificate\/$/);
  await expect(page.locator('[data-nav] [aria-current="page"]')).toHaveText(/Certificates|About/);
  await page.goBack();
  await expect(page).toHaveURL(/4321\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/certificate\/$/);
});

test('original hero, YAML profile and primary actions are restored', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-grid')).toBeVisible();
  await expect(page.locator('.code-card')).toContainText('software_engineering_profile.yaml');
  await expect(page.locator('.code-card')).toContainText('Backend Engineering');
  await expect(page.locator('.profile-card .avatar-ring img')).toBeVisible();
  await expect(page.locator('#starfield')).toBeVisible();
  await expect(page.locator('.orb')).toHaveCount(3);
  await expect(page.locator('.cr-cta')).toBeVisible();
  await expect(page.locator('main > section')).toHaveCount(1);
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
    await chooseTheme(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.goto('/contact/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#theme-pill-label')).toHaveText(themeLabels[theme]);
    await expect(page.locator(`[data-theme-key="${theme}"]`)).toHaveAttribute('aria-checked', 'true');
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
  await chooseTheme(page, 'ocean');
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
  await page.locator('[data-nav]').getByRole('menuitem', { name: 'Certificates', exact: true }).click();
  await expect(page).toHaveURL(/\/certificate\/$/);
  await expect(page.getByRole('link', { name: /credly|credential|badge/i }).first()).toBeVisible();
  const aboutSections = page.getByRole('navigation', { name: 'About sections' });
  await expect(aboutSections.getByRole('link')).toHaveText(['Overview', 'Education', 'Certificates', 'Testimonials']);
  await expect(aboutSections.getByRole('link', { name: 'Certificates', exact: true })).toHaveAttribute('aria-current', 'page');
  await aboutSections.getByRole('link', { name: 'Education', exact: true }).click();
  await expect(page).toHaveURL(/\/about\/#education$/);
  await expect(page.locator('#education')).toBeVisible();
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

test('About dropdown opens dedicated tabs and certificate route', async ({ page, isMobile }) => {
  for (const [label, route, panel] of [['Overview', '/about/', 'overview'], ['Education', '/about/#education', 'education'], ['Testimonials', '/about/#testimonials', 'testimonials']]) {
    await page.goto('/');
    if (isMobile) await page.locator('[data-nav-toggle]').click();
    await page.locator('[data-nav-dropdown]').click();
    await page.locator('[data-nav]').getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:4321${route}`);
    await expect(page.locator(`[data-tab-panel="${panel}"]`)).toBeVisible();
    await page.reload();
    await expect(page.locator(`[data-tab-panel="${panel}"]`)).toBeVisible();
  }
});

test('About section navigation stays visible on Certificates and returns to the right tabs', async ({ page }) => {
  await page.goto('/about/');
  const sections = page.getByRole('navigation', { name: 'About sections' });
  await sections.getByRole('link', { name: 'Certificates', exact: true }).click();
  await expect(page).toHaveURL(/\/certificate\/$/);
  const certificate = sections.getByRole('link', { name: 'Certificates', exact: true });
  const assertCertificateNavigation = async () => {
    await expect(sections).toBeVisible();
    await expect(sections.getByRole('link')).toHaveText(['Overview', 'Education', 'Certificates', 'Testimonials']);
    for (const link of await sections.getByRole('link').all()) await expect(link).toBeVisible();
    await expect(certificate).toHaveClass(/active/);
    await expect(certificate).toHaveAttribute('aria-current', 'page');
    await expect(sections.getByRole('tablist')).toHaveCount(0);
  };
  await assertCertificateNavigation();
  await page.reload();
  await assertCertificateNavigation();
  await sections.getByRole('link', { name: 'Education', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/about\/#education$/);
  await expect(page.locator('#education')).toBeVisible();
  await expect(sections.getByRole('tab', { name: 'Education', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/certificate\/$/);
  await assertCertificateNavigation();
  await page.goForward();
  await expect(page).toHaveURL(/\/about\/#education$/);
  await expect(page.locator('#education')).toBeVisible();
  for (const [label, url, panel] of [['Testimonials', /\/about\/#testimonials$/, 'testimonials'], ['Overview', /\/about\/$/, 'overview']] as const) {
    await sections.getByRole('link', { name: 'Certificates', exact: true }).click();
    await assertCertificateNavigation();
    await sections.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.locator(`[data-tab-panel="${panel}"]`)).toBeVisible();
    await expect(sections.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
});

test('theme picker and About menu are usable with keyboard and Escape', async ({ page, isMobile }) => {
  await page.goto('/');
  const theme = page.locator('#theme-pill-btn');
  await theme.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-theme-key="dark"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-theme-key="sunset"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunset');
  await expect(theme).toBeFocused();
  await theme.click();
  await page.keyboard.press('Escape');
  await expect(theme).toHaveAttribute('aria-expanded', 'false');
  if (isMobile) await page.locator('[data-nav-toggle]').click();
  const about = page.locator('[data-nav-dropdown]');
  await about.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Overview', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Testimonials', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(about).toBeFocused();
  await expect(about).toHaveAttribute('aria-expanded', 'false');
});

test('original theme scenes animate, pause for dialogs and honor reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const canvas = page.locator('#starfield');
  for (const theme of themeValues) {
    await chooseTheme(page, theme);
    await expect(canvas).toHaveAttribute('data-scene', theme);
    await expect(canvas).toHaveAttribute('data-animation-state', 'running');
    const before = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
    await expect.poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL()), { timeout: 3_000 }).not.toBe(before);
  }
  await page.getByRole('link', { name: /let.s connect/i }).click();
  await expect(page).toHaveURL(/\/contact\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/4321\/$/);
  await expect(canvas).toHaveAttribute('data-animation-state', 'running');
  const restored = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  await expect.poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL()), { timeout: 3_000 }).not.toBe(restored);
  await page.locator('#chatbot-fab').click();
  await expect(canvas).toHaveAttribute('data-animation-state', 'paused');
  const paused = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL())).toBe(paused);
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-animation-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-animation-state', 'reduced');
  const reduced = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL())).toBe(reduced);
  await expect(page.locator('.code-card')).toContainText('Linux Operations');
  await expect(page.locator('.avatar-ring')).toBeVisible();
});
