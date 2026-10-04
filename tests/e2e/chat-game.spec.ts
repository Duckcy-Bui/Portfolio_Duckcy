import { expect, test, type Route } from '@playwright/test';

const proxy = 'https://chatbot-proxy.ducbanca1604.workers.dev/';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('chatbot modal, safe links, response and session history survive native navigation', async ({ page }) => {
  let requests = 0;
  await page.route(proxy, async (route) => {
    requests += 1;
    const body = route.request().postDataJSON();
    expect(body.system).toContain('https://github.com/Duckcy-Bui');
    expect(body.messages.at(-1).content).toBe('How can I contact Duc?');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'Visit [Contact](/contact/) or [GitHub](https://github.com/Duckcy-Bui). <img src=x onerror=alert(1)> [unsafe](javascript:alert(1))' }] }) });
  });
  await page.goto('/');
  const launch = page.locator('#chatbot-fab');
  const dialog = page.locator('#chatbot-window');
  await launch.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#chatbot-input')).toBeFocused();
  await page.locator('#chatbot-input').fill('How can I contact Duc?');
  await page.locator('#chatbot-send').click();
  await expect(page.locator('.chatbot-msg.ai').last()).toContainText('Visit Contact');
  expect(requests).toBe(1);
  await expect(dialog.locator('.chatbot-bubble img')).toHaveCount(0);
  await expect(dialog.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
  await dialog.getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page).toHaveURL(/\/contact\/$/);
  await page.locator('#chatbot-fab').click();
  await expect(page.locator('.chatbot-messages')).toContainText('How can I contact Duc?');
  await expect(page.locator('.chatbot-messages')).toContainText('Visit Contact');
  await page.keyboard.press('Escape');
  await expect(page.locator('#chatbot-window')).toBeHidden();
  await expect(page.locator('#chatbot-fab')).toBeFocused();
  await page.locator('#chatbot-fab').click();
  await page.locator('#chatbot-reset').click();
  await expect(page.locator('.chatbot-messages')).not.toContainText('Visit Contact');
  await expect(page.locator('#chatbot-input')).toBeFocused();
  await page.locator('#chatbot-minimize').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#chatbot-minimize')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#chatbot-input')).toBeHidden();
  await page.locator('#chatbot-minimize').click();
  await expect(page.locator('#chatbot-minimize')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#chatbot-input')).toBeVisible();
  await expect(page.locator('#chatbot-input')).toBeFocused();
});

test('chat proxy failure gives published portfolio facts and working page links', async ({ page }) => {
  await page.route(proxy, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/projects/');
  await page.locator('#chatbot-fab').click();
  await page.locator('#chatbot-input').fill('Tell me about your certificates');
  await page.locator('#chatbot-send').click();
  const answer = page.locator('.chatbot-msg.ai').last();
  await expect(answer).toContainText(/temporarily unavailable/i);
  await expect(answer).toContainText('AWS SBG Core Team Member Badge');
  await expect(answer).not.toContainText(/Google Cloud|Advanced Golang|Docker & Kubernetes/);
  await answer.getByRole('link', { name: 'Certificates', exact: true }).click();
  await expect(page).toHaveURL(/\/certificate\/$/);
});

test('chat timeout reenables input and keeps a useful fallback', async ({ page }) => {
  await page.route(proxy, () => { /* Deliberately hold the request until AbortController times out. */ });
  await page.goto('/');
  await page.clock.install();
  await page.locator('#chatbot-fab').click();
  await page.locator('#chatbot-input').fill('What are your projects?');
  await page.locator('#chatbot-send').click();
  await expect(page.locator('#chatbot-send')).toBeDisabled();
  await page.clock.fastForward(15_001);
  await expect(page.locator('#chatbot-send')).toBeEnabled();
  await expect(page.locator('.chatbot-msg.ai').last()).toContainText('SBLT CUP');
  await expect(page.locator('.chatbot-msg.ai').last().getByRole('link', { name: 'Classes369', exact: true })).toHaveAttribute('href', '/projects/classes369/');
});

test('chat rate limit survives reload and does not issue another proxy request', async ({ page }) => {
  let requests = 0;
  await page.route(proxy, (route) => { requests += 1; return route.fulfill({ status: 503, body: '{}' }); });
  await page.addInitScript(() => {
    sessionStorage.setItem('chatbot-timestamps', JSON.stringify(Array.from({ length: 10 }, () => Date.now())));
  });
  await page.goto('/');
  await page.locator('#chatbot-fab').click();
  await page.locator('#chatbot-input').fill('More questions about your work');
  await page.locator('#chatbot-send').click();
  await expect(page.locator('.chatbot-messages')).toContainText(/wait a minute/i);
  expect(requests).toBe(0);
});

test('game resources are lazy and modal close restores page, theme and focus', async ({ page }) => {
  const gameRequests: string[] = [];
  page.on('request', (request) => {
    if (/fc-(?:engine|overlay)[^/]*\.(?:js|css)(?:\?|$)/.test(request.url())) gameRequests.push(request.url());
  });
  await page.goto('/');
  await page.locator('#theme-pill-btn').click();
  await page.locator('[data-theme-key="forest"]').click();
  expect(gameRequests).toEqual([]);
  await expect(page.locator('link[data-fc-game-resource]')).toHaveCount(0);
  const trigger = page.locator('.cr-cta');
  await trigger.click();
  const root = page.locator('#cloud-rescue-root');
  await expect(root.locator('[data-screen="INTRO"]')).toBeVisible();
  expect(gameRequests.some((url) => /fc-engine/.test(url))).toBe(true);
  expect(gameRequests.some((url) => /fc-overlay/.test(url))).toBe(true);
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await page.keyboard.press('Escape');
  await expect(root).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');
  await trigger.click();
  await expect(root.locator('[data-screen="INTRO"]')).toBeVisible();
  await root.locator('.cr-close').click();
  await expect(root).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('failed game stylesheet retries without losing modal lock and recovers', async ({ page }) => {
  let attempts = 0;
  await page.route(/fc-overlay[^/]*\.css(?:\?|$)/, async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  await page.goto('/');
  await page.locator('.cr-cta').click();
  const root = page.locator('#cloud-rescue-root');
  const retry = root.locator('[data-loading-action="retry"]');
  await expect(retry).toBeVisible();
  await expect(retry).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await retry.click();
  await expect(root.locator('[data-screen="INTRO"]')).toBeVisible();
  expect(attempts).toBe(2);
  await root.locator('.cr-close').click();
  await expect(page.locator('.cr-cta')).toBeFocused();
});

test('closing a pending game load ignores late completion and restores focus', async ({ page }) => {
  const pending: Route[] = [];
  await page.route(/fc-overlay[^/]*\.css(?:\?|$)/, (route) => { pending.push(route); });
  await page.goto('/');
  await page.locator('.cr-cta').click();
  await expect.poll(() => pending.length).toBe(1);
  const root = page.locator('#cloud-rescue-root');
  await expect(root.locator('.cr-loading-shell')).toBeVisible();
  await root.locator('[data-loading-action="close"]').click();
  await pending[0].continue();
  await expect(root).toBeHidden();
  await expect(page.locator('.cr-cta')).toBeFocused();
  await expect(root.locator('.cr-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
});
