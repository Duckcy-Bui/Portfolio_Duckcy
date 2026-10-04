import { expect, test, type Page } from '@playwright/test';

const originalFacts = [
  { name: 'SBLT CUP', slug: 'sblt-cup', role: 'Software engineering', highlight: 'SSE and Redis Pub/Sub', query: 'PM2 cluster', hiddenTechnology: 'Web Push', technologyCount: 9 },
  { name: 'Classes369', slug: 'classes369', role: 'Backend & DevOps', highlight: 'Transactional enrollment', query: 'schema seeding', hiddenTechnology: 'GenAI', technologyCount: 6 },
  { name: 'Investor AI', slug: 'investor-ai', role: 'DevOps', highlight: 'Airflow and CI/CD rollback', query: 'centralized logging', hiddenTechnology: 'CUDA', technologyCount: 9 },
];
const cardFor = (page: Page, name: string) => page.locator('[data-project]').filter({ has: page.locator('.project-showcase-title').getByRole('link', { name, exact: true }) });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('project list cards stay concise while showing the actual role and a factual highlight', async ({ page }) => {
  await page.goto('/projects/');
  await page.evaluate(() => document.fonts.ready.then(() => {}));
  await expect(page.locator('[data-project]:visible')).toHaveCount(3);
  for (const fact of originalFacts) {
    const card = cardFor(page, fact.name);
    const description = card.locator('.project-showcase-desc');
    await expect(description).toBeVisible();
    const dimensions = await description.evaluate((node) => ({ height: node.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight) }));
    expect(dimensions.height, `${fact.name} should not require more than three description lines`).toBeLessThanOrEqual(dimensions.lineHeight * 3 + 1);
    await expect(card.locator('.project-card-role')).toContainText('My role');
    await expect(card.locator('.project-card-role')).toContainText(fact.role);
    await expect(card.locator('.project-card-highlight')).toContainText(fact.highlight);
    await expect(card.locator('.project-showcase-tags > span')).toHaveCount(4);
    const more = card.getByRole('link', { name: `View all ${fact.technologyCount} technologies for ${fact.name}`, exact: true });
    await expect(more).toHaveText(`+${fact.technologyCount - 4} technologies →`);
    await expect(more).toHaveAttribute('href', `/projects/${fact.slug}/`);
    await expect(card.getByRole('link', { name: `Explore ${fact.name}`, exact: true })).toHaveAttribute('href', `/projects/${fact.slug}/`);
    await expect(card.getByRole('link', { name: 'View on GitHub', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

test('search still finds original description facts moved off the concise card', async ({ page }) => {
  for (const fact of originalFacts) {
    await page.goto('/projects/');
    await page.locator('[data-project-search]').fill(fact.query);
    await expect(page.locator('[data-project]:visible')).toHaveCount(1);
    const card = cardFor(page, fact.name);
    await expect(card).toBeVisible();
    await expect(card.locator('.project-showcase-desc')).not.toContainText(fact.query);
    await card.getByRole('link', { name: `Explore ${fact.name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${fact.slug}/$`));
    await expect(page.locator('main')).toContainText(fact.query);
  }
});

test('search also finds the visible role and new concise highlight', async ({ page }) => {
  await page.goto('/projects/');
  const search = page.locator('[data-project-search]');
  await search.fill('DevOps');
  await expect(page.locator('[data-project]:visible .project-showcase-title')).toHaveText(['Classes369', 'Investor AI']);
  await search.fill('Daily data processing');
  await expect(page.locator('[data-project]:visible')).toHaveCount(1);
  await expect(cardFor(page, 'Investor AI')).toBeVisible();
});

test('technologies hidden from the short card remain filterable and available through native detail links', async ({ page, browser }) => {
  for (const fact of originalFacts) {
    await page.goto(`/projects/?tech=${encodeURIComponent(fact.hiddenTechnology)}`);
    await expect(page.locator('[data-project]:visible')).toHaveCount(1);
    const card = cardFor(page, fact.name);
    await expect(card.locator('.project-showcase-tags > span')).not.toContainText([fact.hiddenTechnology]);
    await card.getByRole('link', { name: `View all ${fact.technologyCount} technologies for ${fact.name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${fact.slug}/$`));
    await expect(page.locator('main .project-showcase-tags > span')).toHaveCount(fact.technologyCount);
    await expect(page.locator('main .project-showcase-tags')).toContainText(fact.hiddenTechnology);
  }
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: page.viewportSize() || undefined });
  const nativePage = await context.newPage();
  await nativePage.goto('http://127.0.0.1:4321/projects/');
  await cardFor(nativePage, 'SBLT CUP').getByRole('link', { name: 'View all 9 technologies for SBLT CUP', exact: true }).click();
  await expect(nativePage).toHaveURL(/\/projects\/sblt-cup\/$/);
  await expect(nativePage.locator('main .project-showcase-tags > span')).toHaveCount(9);
  await expect(nativePage.locator('main')).toContainText('PM2 cluster');
  await context.close();
});
