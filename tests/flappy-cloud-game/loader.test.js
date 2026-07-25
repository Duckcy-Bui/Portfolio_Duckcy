import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptSource = readFileSync(resolve(process.cwd(), 'script.js'), 'utf8');
const marker = '// FLAPPY CLOUD — isolated lazy bootstrap (resources load on activation)';
const bootstrapSource = scriptSource.slice(scriptSource.lastIndexOf('// ============================================================', scriptSource.indexOf(marker)));

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flushPromises(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function fixture() {
  document.body.innerHTML = `<a id="cv" href="cv.pdf" target="_blank" rel="noreferrer">Download CV</a>
    <button type="button" class="cr-cta">Play Game</button><main id="portfolio"><input value="keep"></main>
    <div id="cloud-rescue-root" hidden></div>`;
  const moduleLoad = deferred();
  const calls = [];
  const importAdapter = vi.fn(() => moduleLoad.promise);
  const executable = bootstrapSource.replace('import(MODULE_PATH)', '__fcImport(MODULE_PATH)');
  new Function('__fcImport', executable)(importAdapter);
  return {
    cta: document.querySelector('.cr-cta'),
    root: document.getElementById('cloud-rescue-root'),
    portfolio: document.getElementById('portfolio'),
    moduleLoad,
    importAdapter,
    calls,
  };
}

function fakeEngine(calls) {
  return {
    isOpen: vi.fn(() => false),
    open: vi.fn((options) => {
      calls.push(options);
      options.overlaySession.transferToEngine();
      options.root.innerHTML = '<div class="cr-overlay" role="dialog">INTRO</div>';
      options.root.hidden = false;
    }),
  };
}

function stylesheet() {
  return document.head.querySelector('link[data-fc-game-resource="styles"]');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.head.querySelectorAll('[data-fc-game-resource], [data-fc-loading-critical]').forEach((node) => node.remove());
  document.documentElement.removeAttribute('style');
  document.body.innerHTML = '';
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
  sessionStorage.clear();
});

describe('fc lazy bootstrap behavior', () => {
  it('does no capability Canvas or Gameplay_Resource work before native activation', () => {
    const createElement = vi.spyOn(document, 'createElement');
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const setup = fixture();
    expect(setup.importAdapter).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
    expect(stylesheet()).toBeNull();
    expect(document.querySelector('[data-fc-loading-critical]')).toBeNull();
    expect(setup.root.hidden).toBe(true);
    expect(createElement.mock.calls.some(([tag]) => String(tag).toLowerCase() === 'canvas')).toBe(false);
  });

  it('shows one locked, focused, accessible loading dialog then hands the same session to INTRO', async () => {
    const setup = fixture();
    const engine = fakeEngine(setup.calls);
    setup.cta.focus();
    setup.cta.click();

    const loading = setup.root.querySelector('.cr-loading-shell');
    expect(loading).not.toBeNull();
    expect(loading.getAttribute('role')).toBe('dialog');
    expect(loading.getAttribute('aria-modal')).toBe('true');
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.querySelector('h2').textContent).toBe('Deploy Before Dawn: Cloud Rescue');
    expect(loading.querySelector('.cr-close').getAttribute('aria-label')).toBe('Close Deploy Before Dawn: Cloud Rescue');
    expect(document.activeElement).toBe(loading.querySelector('h2'));
    expect(document.body.style.position).toBe('fixed');
    expect(setup.portfolio.getAttribute('aria-hidden')).toBe('true');
    expect(setup.importAdapter).toHaveBeenCalledOnce();
    expect(setup.importAdapter).toHaveBeenCalledWith('./game/fc-engine.js');
    expect(stylesheet().getAttribute('href')).toBe('./game/fc-overlay.css');
    expect(document.querySelectorAll('link[data-fc-game-resource="styles"]')).toHaveLength(1);

    setup.moduleLoad.resolve(engine);
    stylesheet().dispatchEvent(new Event('load'));
    await flushPromises();
    expect(engine.open).toHaveBeenCalledOnce();
    expect(setup.root.textContent).toContain('INTRO');
    expect(setup.calls[0].overlaySession.owner).toBe('engine');
    expect(setup.portfolio.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.style.position).toBe('fixed');
    expect(document.querySelector('[data-fc-loading-critical]')).toBeNull();

    setup.calls[0].overlaySession.restore('engine');
    setup.root.replaceChildren();
    setup.root.hidden = true;
    setup.calls[0].onClose();
    expect(setup.calls[0].overlaySession.restoreCount).toBe(1);
    expect(setup.portfolio.getAttribute('aria-hidden')).toBeNull();
    expect(document.body.style.position).toBe('');
    expect(document.activeElement).toBe(setup.cta);
  });

  it('traps Tab/Shift+Tab during loading and Back restores the original snapshot exactly once', () => {
    const setup = fixture();
    setup.cta.focus();
    setup.cta.click();
    const shell = setup.root.querySelector('.cr-loading-shell');
    const close = shell.querySelector('.cr-close');
    const back = shell.querySelector('[data-loading-action="back"]');
    back.focus();
    shell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);
    shell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(back);
    back.click();
    expect(setup.root.hidden).toBe(true);
    expect(setup.root.children).toHaveLength(0);
    expect(document.body.style.position).toBe('');
    expect(setup.portfolio.getAttribute('aria-hidden')).toBeNull();
    expect(document.activeElement).toBe(setup.cta);
  });

  it('invalidates a pending generation on Close so late module/CSS completion cannot mount', async () => {
    const setup = fixture();
    const engine = fakeEngine(setup.calls);
    setup.cta.click();
    const link = stylesheet();
    setup.root.querySelector('[data-loading-action="close"]').click();
    expect(setup.root.hidden).toBe(true);
    setup.moduleLoad.resolve(engine);
    link.dispatchEvent(new Event('load'));
    await flushPromises();
    expect(engine.open).not.toHaveBeenCalled();
    expect(setup.root.hidden).toBe(true);
    expect(document.body.style.position).toBe('');
  });

  it('isolates a detached stylesheet completion from a newer active load attempt', async () => {
    const setup = fixture();
    const engine = fakeEngine(setup.calls);
    setup.cta.click();
    const staleLink = stylesheet();
    setup.root.querySelector('[data-loading-action="close"]').click();
    setup.cta.click();
    const currentLink = stylesheet();
    expect(currentLink).not.toBe(staleLink);
    staleLink.dispatchEvent(new Event('error'));
    await flushPromises();
    expect(stylesheet()).toBe(currentLink);
    expect(currentLink.isConnected).toBe(true);
    setup.moduleLoad.resolve(engine);
    currentLink.dispatchEvent(new Event('load'));
    await flushPromises();
    expect(engine.open).toHaveBeenCalledOnce();
    setup.calls[0].overlaySession.restore('engine');
    setup.calls[0].onClose();
  });

  it('enforces the monotonic 10-second deadline, preserves lock through Retry, and reuses resources', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
    const setup = fixture();
    const engine = fakeEngine(setup.calls);
    setup.cta.click();
    const firstLink = stylesheet();
    const originalBodyTop = document.body.style.top;

    monotonicNow = 10000;
    await vi.advanceTimersByTimeAsync(10000);
    await flushPromises();
    const errorShell = setup.root.querySelector('.cr-loading-shell');
    expect(errorShell.textContent).toContain('could not finish loading in 10 seconds');
    expect(errorShell.querySelectorAll('[data-loading-action="retry"]')).toHaveLength(1);
    expect(errorShell.querySelectorAll('[data-loading-action="back"]')).toHaveLength(1);
    expect(errorShell.querySelector('.cr-close').getAttribute('aria-label')).toBe('Close Deploy Before Dawn: Cloud Rescue');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe(originalBodyTop);

    errorShell.querySelector('[data-loading-action="retry"]').click();
    expect(setup.root.getAttribute('hidden')).toBeNull();
    expect(document.querySelectorAll('link[data-fc-game-resource="styles"]')).toHaveLength(1);
    expect(stylesheet()).toBe(firstLink);
    setup.moduleLoad.resolve(engine);
    firstLink.dispatchEvent(new Event('load'));
    await flushPromises();
    expect(engine.open).toHaveBeenCalledOnce();
    expect(setup.importAdapter).toHaveBeenCalledOnce();
    expect(setup.calls[0].overlaySession.owner).toBe('engine');
    setup.calls[0].overlaySession.restore('engine');
    setup.calls[0].onClose();
  });

  it('performs the Canvas capability check after click and requests no resources when unsupported', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const setup = fixture();
    setup.cta.click();
    expect(setup.cta.disabled).toBe(true);
    expect(setup.cta.getAttribute('aria-disabled')).toBe('true');
    expect(setup.cta.nextElementSibling.textContent).toBe('Mini-game không khả dụng trên trình duyệt này');
    expect(setup.importAdapter).not.toHaveBeenCalled();
    expect(stylesheet()).toBeNull();
    expect(setup.root.hidden).toBe(true);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('has one native click listener path and no bootstrap keydown activation path', () => {
    const tail = bootstrapSource;
    expect((tail.match(/cta\.addEventListener\("click", activate\)/g) || [])).toHaveLength(1);
    expect(tail).not.toMatch(/cta\.addEventListener\(["']keydown/);
    expect(tail).toContain('const LOAD_TIMEOUT_MS = 10000');
    expect(tail).toContain('const MODULE_PATH = "./game/fc-engine.js"');
    expect(tail).toContain('const STYLESHEET_PATH = "./game/fc-overlay.css"');
    expect(tail).not.toContain('./game/cr-engine.js');
    expect(tail).not.toContain('./game/cr-overlay.css');
  });
});


describe('fc loader reopen and open-error ownership', () => {
  it('reopens with cached module/CSS without duplicate requests, links, roots, or listeners', async () => {
    const setup = fixture();
    const engine = fakeEngine(setup.calls);
    setup.cta.click();
    const link = stylesheet();
    setup.moduleLoad.resolve(engine);
    link.dispatchEvent(new Event('load'));
    await flushPromises();
    expect(engine.open).toHaveBeenCalledTimes(1);
    setup.calls[0].overlaySession.restore('engine');
    setup.root.replaceChildren();
    setup.root.hidden = true;
    setup.calls[0].onClose();

    setup.cta.click();
    await flushPromises();
    expect(engine.open).toHaveBeenCalledTimes(2);
    expect(setup.importAdapter).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('link[data-fc-game-resource="styles"]')).toHaveLength(1);
    expect(document.querySelectorAll('#cloud-rescue-root')).toHaveLength(1);
    setup.calls[1].overlaySession.restore('engine');
    setup.calls[1].onClose();
  });

  it('restores the bootstrap owner once when engine open throws before adoption, then keeps one error session locked', async () => {
    const setup = fixture();
    let failedSession;
    const engine = {
      isOpen: () => false,
      open(options) { failedSession = options.overlaySession; throw new Error('construction failed'); },
    };
    setup.cta.click();
    setup.moduleLoad.resolve(engine);
    stylesheet().dispatchEvent(new Event('load'));
    await flushPromises();
    expect(failedSession.owner).toBe('restored');
    expect(failedSession.restoreCount).toBe(1);
    expect(setup.root.textContent).toContain('temporarily unavailable');
    expect(document.body.style.position).toBe('fixed');
    setup.root.querySelector('[data-loading-action="back"]').click();
    expect(document.body.style.position).toBe('');
    expect(setup.root.hidden).toBe(true);
  });
});


describe('fc bootstrap atomic pending cleanup', () => {
  it('cancels its deadline timer and removes a pending stylesheet on Close', () => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const setup = fixture();
    setup.cta.click();
    const deadlineIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 10000);
    expect(deadlineIndex).toBeGreaterThanOrEqual(0);
    const deadlineId = setTimeoutSpy.mock.results[deadlineIndex].value;
    expect(stylesheet()).not.toBeNull();
    setup.root.querySelector('[data-loading-action="close"]').click();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(deadlineId);
    expect(stylesheet()).toBeNull();
    expect(setup.root.hidden).toBe(true);
  });
});
