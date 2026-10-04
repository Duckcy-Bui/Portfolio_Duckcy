import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://cdn.credly.com/assets/utilities/embed.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
});

test('projects search, empty state, clear and URL restoration', async ({ page }) => {
  await page.goto('/projects/');
  const search = page.locator('[data-project-search]');
  await expect(page.locator('[data-project]:visible')).toHaveCount(3);
  await search.fill('sblt');
  await expect(page.locator('[data-project]:visible')).toHaveCount(1);
  await expect(page.locator('[data-project]:visible')).toContainText('SBLT CUP');
  await expect(page.locator('[data-project-count]')).toContainText('1 of 3');
  expect(new URL(page.url()).searchParams.get('q')).toBe('sblt');
  await page.reload();
  await expect(search).toHaveValue('sblt');
  await expect(page.locator('[data-project]:visible')).toHaveCount(1);
  await search.fill('zz-no-such-project');
  await expect(page.locator('[data-project]:visible')).toHaveCount(0);
  await expect(page.locator('[data-project-empty]')).toBeVisible();
  await page.locator('[data-project-clear]').click();
  await expect(page.locator('[data-project]:visible')).toHaveCount(3);
  await expect(page.locator('[data-project-empty]')).toBeHidden();
  await expect(search).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
});

test('project technology OR and search AND combinations work from a direct URL', async ({ page }) => {
  await page.goto('/projects/?tech=Docker');
  const docker = page.locator('input[data-tech][value="Docker"]');
  const typescript = page.locator('input[data-tech][value="TypeScript"]');
  await expect(docker).toBeChecked();
  await expect(page.locator('[data-project]:visible')).toHaveCount(2);
  const category = typescript.locator('xpath=ancestor::details');
  const summary = category.locator('summary');
  await summary.click();
  await expect(category).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(category).not.toHaveAttribute('open');
  await expect(summary).toBeFocused();
  await summary.click();
  await page.locator('h1').click();
  await expect(category).not.toHaveAttribute('open');
  await summary.click();
  await typescript.check();
  await expect(category).not.toHaveAttribute('open');
  await expect(page.locator('[data-project]:visible')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(typescript.locator('xpath=ancestor::details')).not.toHaveAttribute('open');
  await page.locator('[data-project-search]').fill('sblt');
  await expect(page.locator('[data-project]:visible')).toHaveCount(1);
  await typescript.locator('xpath=ancestor::details').locator('summary').click();
  await typescript.uncheck();
  await page.keyboard.press('Escape');
  await expect(typescript.locator('xpath=ancestor::details')).not.toHaveAttribute('open');
  await expect(page.locator('[data-project]:visible')).toHaveCount(0);
  await page.locator('[data-project-clear]').click();
  await expect(docker).not.toBeChecked();
  await expect(typescript).not.toBeChecked();
  await expect(page.locator('[data-project]:visible')).toHaveCount(3);
});

test('two original skills groups keep independent keyboard tabs', async ({ page }) => {
  await page.goto('/skills/');
  const groups = page.locator('[data-skill-group]');
  await expect(groups).toHaveCount(2);
  for (const group of await groups.all()) {
    const tabs = group.locator('[data-skill-tab]');
    expect(await tabs.count()).toBeGreaterThan(1);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(tabs.last()).toBeFocused();
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.last()).toBeFocused();
    await tabs.nth(1).click();
    const target = await tabs.nth(1).getAttribute('data-skill-tab');
    await expect(group.locator(`[data-skill-panel="${target}"]`)).toBeVisible();
    await expect(group.locator('[data-skill-panel]:visible')).toHaveCount(1);
  }
  await expect(page.locator('[data-skill-panel]:visible')).toHaveCount(2);
});

test('contact invalid fields get focus and clear keeps submission honest', async ({ page }) => {
  await page.goto('/contact/');
  await page.locator('#contact-form button[type="submit"]').click();
  await expect(page.locator('#cf-name')).toBeFocused();
  await expect(page.locator('#cf-name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-contact-status]')).toContainText(/correct/i);
  await page.locator('#cf-name').fill('Portfolio tester');
  await page.locator('#cf-email').fill('wrong');
  await page.locator('#cf-message').fill('A valid message for the portfolio owner.');
  await page.locator('#contact-form button[type="submit"]').click();
  await expect(page.locator('#cf-email')).toBeFocused();
  await expect(page.locator('#cf-email')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#cf-email').fill('tester@example.com');
  await page.reload();
  await expect(page.locator('#cf-name')).toHaveValue('Portfolio tester');
  await expect(page.locator('#cf-email')).toHaveValue('tester@example.com');
  await expect(page.locator('#cf-message')).toHaveValue('A valid message for the portfolio owner.');
  await page.locator('[data-contact-clear]').click();
  await expect(page.locator('#cf-name')).toHaveValue('');
  await expect(page.locator('#cf-name')).toBeFocused();
  await page.reload();
  await expect(page.locator('#cf-message')).toHaveValue('');
});

test('original contact actions and Home profile preserve all social channels', async ({ page }) => {
  await page.goto('/contact/');
  const linkedin = page.locator('main a[href="https://www.linkedin.com/in/duckcy/"]');
  await expect(linkedin).toBeVisible();
  await expect(linkedin).toContainText('LinkedIn');
  await expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('a[href="mailto:duckcy.work@gmail.com"]').first()).toBeVisible();
  await expect(page.locator('a[href="tel:+84976795113"]')).toBeVisible();
  await expect(page.getByRole('link', { name: /Download CV/ })).toHaveAttribute('href', '/assets/CV_bui_hai_duc.pdf');
  await page.goto('/');
  for (const [label, href] of [
    ['LinkedIn', 'https://www.linkedin.com/in/duckcy/'],
    ['Facebook', 'https://www.facebook.com/HaiDuc12528/'],
    ['GitHub', 'https://github.com/Duckcy-Bui'],
  ]) {
    const link = page.locator('.profile-actions').getByRole('link', { name: label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

test('contact copies a draft and opens encoded mailto without claiming delivery', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/contact/');
  await page.locator('#cf-name').fill('Portfolio Tester');
  await page.locator('#cf-email').fill('tester@example.com');
  await page.locator('#cf-message').fill('Please discuss your backend and deployment experience.');
  await page.locator('[data-contact-copy]').click();
  await expect(page.locator('[data-contact-status]')).toContainText(/draft copied/i);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Portfolio Tester (tester@example.com)');
  expect(copied).toContain('Please discuss your backend');
  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      const anchor = (event.target as Element)?.closest('a[href^="mailto:"]');
      if (anchor) {
        event.preventDefault();
        document.documentElement.dataset.testMailto = anchor.getAttribute('href') || '';
      }
    }, true);
  });
  await page.locator('#contact-form button[type="submit"]').click();
  await expect(page.locator('[data-contact-status]')).toContainText(/draft|email app/i);
  await expect(page.locator('[data-contact-status]')).not.toContainText(/message sent|successfully sent/i);
  await expect(page.locator('#cf-message')).toHaveValue('Please discuss your backend and deployment experience.');
  const intercepted = await page.locator('html').getAttribute('data-test-mailto');
  expect(intercepted).toBeTruthy();
  const draft = new URL(intercepted!);
  expect(draft.pathname).toBe('duckcy.work@gmail.com');
  expect(draft.searchParams.get('subject')).toContain('Portfolio Tester');
  expect(draft.searchParams.get('body')).toContain('tester@example.com');
});

test('certificate keeps official credential link when its optional embed fails', async ({ page }) => {
  await page.unroute('https://cdn.credly.com/assets/utilities/embed.js');
  await page.route('https://cdn.credly.com/assets/utilities/embed.js', (route) => route.abort());
  await page.goto('/certificate/');
  const badge = page.locator('[data-credly-badge]');
  await expect(badge).toHaveCount(1);
  await badge.scrollIntoViewIfNeeded();
  await expect(page.locator('a[href="https://www.credly.com/badges/73787dad-002a-4cce-b49d-011b40587df9"]').first()).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
});
