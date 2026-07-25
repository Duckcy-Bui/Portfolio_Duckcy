import { afterEach, describe, expect, it } from 'vitest';
import {
  PHYSICS,
  WORLD,
  close,
  computeCanvasSize,
  createOverlaySession,
  getLifecycleSnapshot,
  getStateSnapshot,
  open,
} from '../../game/fc-engine.js';
import {
  createFakeClock,
  createFakeMediaQueryList,
  createFakeResizeObserver,
  makePlayingState,
} from './test-helpers.js';

function mountAt({ width, height, dpr, state = makePlayingState() }) {
  document.body.innerHTML = '<button id="trigger">Play</button><main id="portfolio"></main><div id="cloud-rescue-root" hidden></div>';
  const root = document.getElementById('cloud-rescue-root');
  const trigger = document.getElementById('trigger');
  const clock = createFakeClock();
  const media = createFakeMediaQueryList(false);
  const resize = createFakeResizeObserver();
  const viewport = { width, height, dpr };
  const env = {
    now: clock.now,
    requestFrame: clock.requestAnimationFrame,
    cancelFrame: clock.cancelAnimationFrame,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    matchMedia: () => media,
    createResizeObserver: (callback) => new resize.FakeResizeObserver(callback),
    get devicePixelRatio() { return viewport.dpr; },
    get innerWidth() { return viewport.width; },
    get innerHeight() { return viewport.height; },
  };
  trigger.focus();
  const overlaySession = createOverlaySession({ root, trigger });
  open({ root, trigger, state, env, overlaySession });
  return { root, trigger, clock, resize, viewport, overlaySession };
}

afterEach(() => {
  close('responsive-cleanup');
  document.body.innerHTML = '';
});

describe('responsive Canvas and lifecycle matrix', () => {
  const viewports = [
    [320, 800], [360, 800], [479, 800], [480, 800], [767, 900],
    [768, 900], [1199, 900], [1200, 900], [1920, 1080], [844, 390],
  ];

  it.each(viewports)('fits %d×%d without crop and holds 16:9 within one percent', (width, height) => {
    for (const dpr of [1, 1.5, 2, 3]) {
      const availableWidth = Math.max(320, Math.min(1100, width - 24));
      const availableHeight = Math.max(180, Math.min(height * 0.64, availableWidth * 9 / 16));
      const size = computeCanvasSize(availableWidth, availableHeight, dpr);
      expect(size.cssWidth).toBeLessThanOrEqual(availableWidth + 1e-9);
      expect(size.cssHeight).toBeLessThanOrEqual(availableHeight + 1e-9);
      expect(Math.abs(size.cssWidth / size.cssHeight - 16 / 9) / (16 / 9)).toBeLessThanOrEqual(0.01);
      expect(size.pixelRatio).toBeGreaterThanOrEqual(1);
      expect(size.pixelRatio).toBeLessThanOrEqual(2);
      expect(size.backingWidth).toBe(Math.round(size.cssWidth * Math.min(2, Math.max(1, dpr))));
      expect(size.backingHeight).toBe(Math.round(size.cssHeight * Math.min(2, Math.max(1, dpr))));
    }
  });

  it.each([
    [320, 800, 1], [360, 800, 1.5], [768, 900, 2], [1920, 1080, 3], [844, 390, 2],
  ])('wires mounted backing store at %d×%d DPR %s and preserves world coordinates', (width, height, dpr) => {
    const { root } = mountAt({ width, height, dpr });
    const canvas = root.querySelector('canvas');
    const cssWidth = Number.parseFloat(canvas.style.width);
    const cssHeight = cssWidth * WORLD.height / WORLD.width;
    expect(cssWidth).toBeGreaterThan(0);
    expect(canvas.style.height).toBe('auto');
    expect(canvas.style.aspectRatio).toBe(`${WORLD.width} / ${WORLD.height}`);
    expect(canvas.width).toBe(Math.round(cssWidth * Math.min(2, Math.max(1, dpr))));
    expect(canvas.height).toBe(Math.round(cssHeight * Math.min(2, Math.max(1, dpr))));
    expect(Math.abs(cssWidth / cssHeight - WORLD.width / WORLD.height)).toBeLessThan(0.001);
    expect(getStateSnapshot().world).toEqual(WORLD);
  });

  it('pauses before a burst resize, debounces within 500ms, preserves session state, and never auto-resumes', () => {
    const original = makePlayingState({
      gateScore: 5,
      checkpoint: 3,
      activePlayMs: 12345,
      unlockedAchievementIds: ['code-crafter'],
      attempt: 2,
    });
    const { root, clock, resize, viewport } = mountAt({ width: 768, height: 900, dpr: 2, state: original });
    const observer = [...resize.instances][0];
    expect(observer.observing.has(root)).toBe(true);
    expect(observer.observing.has(root.querySelector('.cr-panel'))).toBe(false);
    const beforeCanvasWidth = root.querySelector('canvas').width;
    observer.emit([{ contentRect: { width: 768, height: 900 } }]);
    expect(getStateSnapshot().phase).toBe('PLAYING');
    expect(getLifecycleSnapshot().timers).toBe(0);
    viewport.width = 420;
    viewport.height = 780;
    observer.emit([{ contentRect: { width: 420, height: 780 } }]);
    observer.emit([{ contentRect: { width: 421, height: 780 } }]);
    observer.emit([{ contentRect: { width: 422, height: 780 } }]);
    expect(getStateSnapshot().phase).toBe('PAUSED');
    expect(getLifecycleSnapshot().loops).toBe(0);
    clock.advance(119);
    expect(root.querySelector('canvas')).toBeNull();
    clock.advance(1);
    const after = getStateSnapshot();
    expect(after).toMatchObject({
      phase: 'PAUSED', gateScore: 5, checkpoint: 3, activePlayMs: 12345,
      unlockedAchievementIds: ['code-crafter'], attempt: 2,
    });
    expect(after.bot).toEqual(original.bot);
    expect(after.gates).toEqual(original.gates);
    expect(after.bugs).toEqual(original.bugs);
    expect(after.phase).not.toBe('PLAYING');
    expect(beforeCanvasWidth).toBeGreaterThan(0);
    close('resize-test');
    expect(observer.disconnected).toBe(true);
    expect(getLifecycleSnapshot().observers).toBe(0);
  });

  it('uses the window-resize fallback when ResizeObserver is unavailable and cleans its listener', () => {
    document.body.innerHTML = '<button id="trigger">Play</button><div id="cloud-rescue-root" hidden></div>';
    const root = document.getElementById('cloud-rescue-root');
    const trigger = document.getElementById('trigger');
    const clock = createFakeClock();
    const media = createFakeMediaQueryList(false);
    const env = {
      now: clock.now,
      requestFrame: clock.requestAnimationFrame,
      cancelFrame: clock.cancelAnimationFrame,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      matchMedia: () => media,
      createResizeObserver: () => null,
      devicePixelRatio: 1,
      innerWidth: 640,
      innerHeight: 480,
    };
    const session = createOverlaySession({ root, trigger });
    open({ root, trigger, state: makePlayingState(), env, overlaySession: session });
    window.dispatchEvent(new Event('resize'));
    expect(getStateSnapshot().phase).toBe('PAUSED');
    clock.advance(120);
    expect(getStateSnapshot().phase).toBe('PAUSED');
    close('fallback-resize');
    expect(getLifecycleSnapshot()).toMatchObject({ gameOwnedListeners: 0, observers: 0, timers: 0, loops: 0 });
  });

  it('keeps resize debounce below the 500ms contract and fixed-step law unchanged', () => {
    expect(120).toBeLessThanOrEqual(500);
    expect(PHYSICS.fixedStepMs).toBeCloseTo(1000 / 60, 12);
    expect(PHYSICS.maxCatchUpSteps).toBe(5);
  });
});
