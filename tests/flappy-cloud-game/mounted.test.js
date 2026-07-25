import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACHIEVEMENTS,
  CANONICAL_ACHIEVEMENT_IDS,
  DEFAULT_PALETTE,
  GAME_MODES,
  PHYSICS,
  WORLD,
  close,
  contrastRatio,
  createAnnouncementQueue,
  createBot,
  createFpsSampler,
  createGameLoop,
  createInitialState,
  createLifecycleRegistry,
  createOverlaySession,
  createRenderPlan,
  createTokenCache,
  generateGate,
  getLifecycleSnapshot,
  getStateSnapshot,
  isOpen,
  open,
  paletteMeetsContrast,
  projectDomStatus,
  reduceGameEvent,
  renderCanvas,
  toBotHitbox,
} from '../../game/fc-engine.js';
import {
  createCanvasRecorder,
  createFakeClock,
  createFakeMediaQueryList,
  createFakeResizeObserver,
  makePlayingState,
} from './test-helpers.js';

function mountFixture() {
  document.body.innerHTML = `<button id="before">Before</button><button class="cr-cta">Play Game</button>
    <main id="portfolio"><input id="contact" value="preserved"><div id="chat" data-history="hello"></div></main>
    <div id="cloud-rescue-root" hidden></div>`;
  const root = document.getElementById('cloud-rescue-root');
  const trigger = document.querySelector('.cr-cta');
  trigger.focus();
  return { root, trigger, portfolio: document.getElementById('portfolio') };
}

function browserHarness() {
  const clock = createFakeClock(100);
  const media = createFakeMediaQueryList(false);
  const resize = createFakeResizeObserver();
  const env = {
    now: clock.now,
    requestFrame: clock.requestAnimationFrame,
    cancelFrame: clock.cancelAnimationFrame,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    matchMedia: () => media,
    createResizeObserver: (callback) => new resize.FakeResizeObserver(callback),
    devicePixelRatio: 3,
    innerWidth: 960,
    innerHeight: 720,
  };
  return { clock, media, resize, env };
}

function openMounted(state, options = {}) {
  const fixture = mountFixture();
  const harness = browserHarness();
  const overlaySession = createOverlaySession({ root: fixture.root, trigger: fixture.trigger });
  open({ ...fixture, state, env: harness.env, overlaySession, ...options });
  return { ...fixture, ...harness, overlaySession };
}

afterEach(() => {
  close('mounted-test-cleanup');
  document.body.innerHTML = '';
});

describe('Canvas renderer and presentation projections', () => {
  it('draws canonical layers in order, labels every entity and score, and never mutates state', () => {
    const state = makePlayingState();
    const before = structuredClone(state);
    const recorder = createCanvasRecorder();
    const layers = [];
    const result = renderCanvas(recorder.context, state, {
      palette: DEFAULT_PALETTE,
      timestamp: 1234,
      onLayer: (layer) => layers.push(layer),
    });
    expect(layers).toEqual([
      'background', 'stars-clouds', 'pipeline-gates', 'bug-clouds',
      'deployment-bot', 'feedback', 'score',
    ]);
    const text = recorder.commands.filter(([name]) => name === 'fillText').map(([, value]) => value);
    for (const gate of state.gates) expect(text).toContain(gate.label);
    for (const bug of state.bugs) expect(text).toContain(bug.label);
    expect(text).toContain('Gate 0/12');
    expect(result.rendered).toBe(true);
    expect(state).toEqual(before);
  });

  it('renders collision outline/pass feedback while keeping Canvas score redundant to DOM status', () => {
    const recorder = createCanvasRecorder();
    const crash = makePlayingState({ phase: 'CRASHED', lastFailure: 'gate' });
    renderCanvas(recorder.context, crash);
    expect(recorder.commands.some(([name]) => name === 'strokeRect')).toBe(true);
    expect(recorder.commands.some(([name, value]) => name === 'fillText' && String(value).includes('Pipeline Gate collision'))).toBe(true);
    expect(projectDomStatus(crash)).toContain('Gate 0/12');
  });

  it('turns off every nonessential effect without changing mechanics', () => {
    const state = makePlayingState();
    const baseline = createRenderPlan(state, 50);
    const reduced = createRenderPlan({ ...state, reducedMotion: true, effectLevel: 'reduced' }, 50);
    expect(baseline).toMatchObject({ parallax: true, starDrift: true, trail: true, bob: true, particles: true });
    expect(reduced).toMatchObject({
      parallax: false, starDrift: false, trail: false, bob: false, pulse: false,
      shake: false, confetti: false, particles: false, staticFeedback: true,
    });
    expect(state.bot).toEqual(makePlayingState().bot);
  });

  it('caches theme tokens until invalidation and supplies a contrast-safe fallback palette', () => {
    const element = document.documentElement;
    let reads = 0;
    const style = { getPropertyValue: (token) => ({ '--accent': '#80d8ff', '--text': '#ffffff' })[token] || '' };
    const cache = createTokenCache({ element, getComputedStyleFn: () => { reads += 1; return style; } });
    const first = cache.read();
    expect(cache.read()).toBe(first);
    expect(reads).toBe(1);
    cache.invalidate();
    expect(cache.read()).not.toBe(first);
    expect(reads).toBe(2);
    expect(DEFAULT_PALETTE.bg).toBe('#080b1b');
    expect(paletteMeetsContrast(DEFAULT_PALETTE)).toBe(true);
    expect(contrastRatio(DEFAULT_PALETTE.text, DEFAULT_PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DEFAULT_PALETTE.accent, DEFAULT_PALETTE.bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('semantic DOM screens and achievements', () => {
  const screenCases = [
    ['INTRO', {}],
    ['ACCESSIBLE_FACTS', {}],
    ['READY', {}],
    ['PLAYING', {}],
    ['PAUSED', {}],
    ['CRASHED', { lastFailure: 'gate' }],
    ['ACHIEVEMENT', { gateScore: 3, checkpoint: 3, unlockedAchievementIds: [CANONICAL_ACHIEVEMENT_IDS[0]] }],
    ['WON', { gateScore: 12, checkpoint: 9, unlockedAchievementIds: [...CANONICAL_ACHIEVEMENT_IDS] }],
    ['RUNTIME_ERROR', {}],
  ];

  for (const [phase, patch] of screenCases) {
    it(`${phase} has a named modal and the exact globally available Close control`, () => {
      const state = { ...createInitialState(), ...patch, phase };
      const { root } = openMounted(state);
      const dialog = root.querySelector('[role="dialog"]');
      const closeButton = root.querySelector('.cr-close');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('cr-title');
      expect(dialog?.getAttribute('aria-describedby')).toBe('cr-description');
      expect(root.querySelector('#cr-title')?.textContent).toBe('Deploy Before Dawn: Cloud Rescue');
      expect(closeButton?.getAttribute('aria-label')).toBe('Close Deploy Before Dawn: Cloud Rescue');
      expect(closeButton?.tagName).toBe('BUTTON');
      closeButton.click();
      expect(isOpen()).toBe(false);
    });
  }

  it('shows the required static READY feedback outside Canvas', () => {
    const state = { ...createInitialState(), phase: 'READY', readyElapsedMs: 0 };
    const { root } = openMounted(state);
    expect(root.querySelector('.cr-ready-feedback')?.textContent).toBe('Ready — tap, click or press Space');
  });

  it('keeps Canvas out of the accessibility tree and mirrors complete state in DOM_Status', () => {
    const { root } = openMounted(makePlayingState({ activePlayMs: 1500 }));
    expect(root.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
    const status = root.querySelector('[data-dom-status]').textContent;
    expect(status).toContain('Phase: PLAYING');
    expect(status).toContain('Gate 0/12');
    expect(status).toContain('Checkpoint: 0');
    expect(status).toContain('Next achievement: Code Crafter at Gate 3');
    expect(status).toContain('Mode: Standard Mode');
    expect(status).toContain('Active play time: 00:02');
  });

  it('omits live elapsed time in No Timer Mode but labels result duration as reference', () => {
    const intro = openMounted(createInitialState()).root;
    const noTimerControl = intro.querySelector('input[value="NO_TIMER"]');
    expect(noTimerControl.closest('label').textContent.trim()).toBe('No Timer — hide the live stopwatch');
    close('no-timer-intro-label');
    const noTimer = createInitialState(GAME_MODES.NO_TIMER, { phase: 'PLAYING' });
    expect(projectDomStatus(noTimer)).not.toContain('Active play time');
    const won = { ...noTimer, phase: 'WON', gateScore: 12, checkpoint: 9, activePlayMs: 59500, unlockedAchievementIds: [...CANONICAL_ACHIEVEMENT_IDS] };
    const { root } = openMounted(won);
    expect(root.textContent).toContain('Active play time: 01:00');
    expect(root.textContent).toContain('No Timer mode — duration shown for reference');
  });

  it('renders all exact facts without altering score or WON state when View all facts is used', () => {
    const { root } = openMounted(createInitialState());
    root.querySelector('[data-action="VIEW_FACTS"]').click();
    expect(getStateSnapshot()).toMatchObject({ phase: 'ACCESSIBLE_FACTS', gateScore: 0, unlockedAchievementIds: [] });
    for (const achievement of ACHIEVEMENTS) {
      expect(root.textContent).toContain(achievement.title);
      expect(root.textContent).toContain(achievement.funFact);
    }
  });

  it.each([
    ['gate', 'Pipeline Gate collision'],
    ['bug', 'Bug Cloud collision'],
    ['fell-out', 'Deployment Bot fell out of the flight area'],
  ])('maps %s failure to the exact accessible cause', (lastFailure, text) => {
    const { root } = openMounted({ ...createInitialState(), phase: 'CRASHED', lastFailure });
    expect(root.querySelector('h3').textContent).toBe('Deployment Failed');
    expect(root.querySelector('[data-failure-cause]').textContent).toBe(text);
    expect(getLifecycleSnapshot().loops).toBe(0);
  });

  it('announces a newly committed checkpoint exactly once at a milestone', () => {
    const gate = {
      ...generateGate({ id: 'gate-3', ordinal: 3, label: 'MERGE', segmentIndex: 0, speed: 185, gap: 230, gapCenterRatio: 0.5, width: 82 }, 0),
      gapTop: 0,
      gapBottom: WORLD.height,
    };
    const bot = createBot({ y: 250, vy: 0 });
    gate.x = toBotHitbox(bot).left - gate.width + 1;
    const { root, clock } = openMounted(makePlayingState({ gateScore: 2, bot, gates: [gate], bugs: [] }));
    clock.flushFrame(PHYSICS.fixedStepMs);
    clock.advance(1000);
    expect(root.querySelector('[data-live-region]').textContent).toBe('Checkpoint 3 committed');
    clock.advance(1000);
    expect(root.querySelector('[data-live-region]').textContent).not.toBe('Checkpoint 3 committed');
  });

  it('keeps achievement text/Continue visible after 3 seconds and only removes its badge effect', () => {
    const gate = {
      ...generateGate({ id: 'gate-3', ordinal: 3, label: 'MERGE', segmentIndex: 0, speed: 185, gap: 230, gapCenterRatio: 0.5, width: 82 }, 0),
      gapTop: 0,
      gapBottom: WORLD.height,
    };
    const bot = createBot({ y: 250, vy: 0 });
    gate.x = toBotHitbox(bot).left - gate.width + 1;
    const state = makePlayingState({ gateScore: 2, bot, gates: [gate], bugs: [] });
    const { root, clock } = openMounted(state);
    clock.flushFrame(PHYSICS.fixedStepMs);
    expect(getStateSnapshot().phase).toBe('ACHIEVEMENT');
    const activeMs = getStateSnapshot().activePlayMs;
    expect(root.textContent).toContain('Code Crafter');
    expect(root.textContent).toContain('1/4 unlocked');
    expect(root.querySelector('[data-action="CONTINUE"]')).not.toBeNull();
    clock.advance(2999);
    expect(getStateSnapshot()).toMatchObject({ phase: 'ACHIEVEMENT', activePlayMs: activeMs });
    expect(root.querySelector('.cr-badge').classList.contains('cr-badge--active')).toBe(true);
    clock.advance(1);
    expect(getStateSnapshot()).toMatchObject({ phase: 'ACHIEVEMENT', activePlayMs: activeMs });
    expect(root.querySelector('.cr-badge').classList.contains('cr-badge--active')).toBe(false);
  });
});

describe('OverlaySession, focus, input and atomic lifecycle', () => {
  it('adopts one bootstrap snapshot, traps focus, pauses before Tab, and restores once', () => {
    const state = makePlayingState();
    const { root, trigger, portfolio, overlaySession } = openMounted(state);
    expect(overlaySession.owner).toBe('engine');
    expect(document.body.style.position).toBe('fixed');
    expect(portfolio.getAttribute('aria-hidden')).toBe('true');
    const surface = root.querySelector('[data-flight-surface]');
    surface.focus();
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(getStateSnapshot().phase).toBe('PAUSED');
    expect(root.contains(document.activeElement)).toBe(true);
    root.querySelector('.cr-close').click();
    expect(overlaySession.owner).toBe('restored');
    expect(overlaySession.restoreCount).toBe(1);
    expect(portfolio.getAttribute('aria-hidden')).toBeNull();
    expect(document.body.style.position).toBe('');
    expect(document.activeElement).toBe(trigger);
    expect(root.hidden).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(close()).toBe(false);
    expect(overlaySession.restoreCount).toBe(1);
  });

  it('compensates an actual scrollbar width and restores the original body padding', () => {
    document.body.innerHTML = '<button id="scroll-trigger">Play</button><main></main><div id="cloud-rescue-root" hidden></div>';
    const root = document.getElementById('cloud-rescue-root');
    const trigger = document.getElementById('scroll-trigger');
    const originalDescriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 980 });
    document.body.style.paddingRight = '5px';
    const windowAdapter = {
      innerWidth: 1000, scrollX: 0, scrollY: 0,
      getComputedStyle: () => ({ paddingRight: '5px' }),
      scrollTo() {},
    };
    try {
      const session = createOverlaySession({ root, trigger, window: windowAdapter });
      expect(document.body.style.paddingRight).toBe('25px');
      expect(session.restore('bootstrap')).toBe(true);
      expect(document.body.style.paddingRight).toBe('5px');
    } finally {
      if (originalDescriptor) Object.defineProperty(document.documentElement, 'clientWidth', originalDescriptor);
      else delete document.documentElement.clientWidth;
    }
  });

  it('supports keyboard-only Start, ready delay, Space jump, Escape pause, and Resume', () => {
    const { root, clock } = openMounted(createInitialState());
    root.querySelector('[data-action="START"]').click();
    expect(getStateSnapshot().phase).toBe('READY');
    for (let index = 0; index < 40; index += 1) clock.flushFrame(PHYSICS.fixedStepMs);
    const surface = root.querySelector('[data-flight-surface]');
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    clock.flushFrame(PHYSICS.fixedStepMs);
    expect(getStateSnapshot()).toMatchObject({ phase: 'PLAYING', lastInputModality: 'keyboard' });
    root.querySelector('.cr-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getStateSnapshot().phase).toBe('PAUSED');
    root.querySelector('[data-action="RESUME"]').click();
    expect(getStateSnapshot().phase).toBe('READY');
    expect(document.activeElement).toBe(root.querySelector('[data-flight-surface]'));
  });

  it('stops the READY animation loop once input is enabled and restarts only on an explicit jump', () => {
    const { root, clock } = openMounted(createInitialState());
    root.querySelector('[data-action="START"]').click();
    for (let index = 0; index < 50; index += 1) clock.flushFrame(PHYSICS.fixedStepMs);
    expect(getStateSnapshot()).toMatchObject({ phase: 'READY', readyElapsedMs: PHYSICS.readyMinMs });
    expect(getLifecycleSnapshot().loops).toBe(0);
    root.querySelector('[data-flight-surface]').dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ', code: 'Space', bubbles: true, cancelable: true,
    }));
    expect(getStateSnapshot().phase).toBe('PLAYING');
    expect(getLifecycleSnapshot().loops).toBe(1);
  });

  it('updates the highlighted input hint for touch fallback and exposes all control methods', () => {
    const state = { ...createInitialState(), phase: 'READY', readyElapsedMs: PHYSICS.readyMinMs };
    const { root, clock } = openMounted(state);
    const surface = root.querySelector('[data-flight-surface]');
    const touch = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touch, 'touches', { value: [{}] });
    surface.dispatchEvent(touch);
    clock.flushFrame(PHYSICS.fixedStepMs);
    expect(root.querySelector('[data-input-hint]').textContent).toBe('Tap to boost');
    root.querySelector('[data-action="CONTROLS"]').click();
    const guide = root.querySelector('[data-controls-guide]');
    expect(guide.hidden).toBe(false);
    expect(guide.textContent).toContain('Space:');
    expect(guide.textContent).toContain('Click:');
    expect(guide.textContent).toContain('Tap:');
  });

  it('updates reduced-motion within one frame without resetting mechanics', () => {
    const state = makePlayingState();
    const before = { score: state.gateScore, bot: structuredClone(state.bot), gates: structuredClone(state.gates) };
    const { root, media } = openMounted(state);
    media.set(true);
    expect(getStateSnapshot()).toMatchObject({ reducedMotion: true, effectLevel: 'reduced', gateScore: before.score });
    expect(getStateSnapshot().bot).toEqual(before.bot);
    expect(getStateSnapshot().gates).toEqual(before.gates);
    expect(root.querySelector('.cr-overlay').classList.contains('cr-reduced-motion')).toBe(true);
  });

  it('keeps an FPS-triggered effect downgrade after Reduced Motion is toggled off', () => {
    const state = makePlayingState({ gates: [], bugs: [] });
    const { root, clock, media } = openMounted(state);
    const surface = root.querySelector('[data-flight-surface]');
    for (let frame = 1; frame <= 42; frame += 1) {
      if (frame % 5 === 0) surface.dispatchEvent(new KeyboardEvent('keydown', {
        key: ' ', code: 'Space', bubbles: true, cancelable: true,
      }));
      clock.flushFrame(50);
    }
    expect(getStateSnapshot()).toMatchObject({ performanceDegraded: true, effectLevel: 'reduced' });
    media.set(true);
    media.set(false);
    expect(getStateSnapshot()).toMatchObject({ reducedMotion: false, performanceDegraded: true, effectLevel: 'reduced' });
  });

  it('survives a decorative renderer failure with DOM controls and status intact', () => {
    const decorativeError = Object.assign(new Error('particle failed'), { decorative: true });
    const { root } = openMounted(makePlayingState(), { renderer: () => { throw decorativeError; } });
    expect(root.querySelector('[data-render-fallback]').textContent).toContain('controls and game status remain active');
    expect(root.querySelector('[data-action="PAUSE"]')).not.toBeNull();
    expect(root.querySelector('[data-dom-status]').textContent).toContain('Gate 0/12');
  });

  it('catches a runtime renderer throw, cancels rAF, freezes state, and offers Back only', () => {
    let renders = 0;
    const renderer = (...args) => {
      renders += 1;
      if (renders > 1) throw new Error('renderer exploded');
      return renderCanvas(...args);
    };
    const { root, clock } = openMounted(makePlayingState(), { renderer });
    clock.flushFrame(PHYSICS.fixedStepMs);
    expect(getStateSnapshot().phase).toBe('RUNTIME_ERROR');
    expect(getLifecycleSnapshot().loops).toBe(0);
    expect(root.querySelector('[data-action="RESUME"]')).toBeNull();
    expect(root.querySelector('[data-action="BACK"]')).not.toBeNull();
    root.querySelector('[data-action="BACK"]').click();
    expect(isOpen()).toBe(false);
  });

  it('repeats open/close for 20 rounds with no loops, timers, observers, listeners or DOM leaks', () => {
    for (let round = 0; round < 20; round += 1) {
      const { root, trigger, overlaySession } = openMounted(makePlayingState());
      expect(isOpen()).toBe(true);
      expect(getLifecycleSnapshot().gameOwnedListeners).toBeGreaterThanOrEqual(9);
      close(`stress-${round}`);
      expect(overlaySession.restoreCount).toBe(1);
      expect(root.hidden).toBe(true);
      expect(root.children).toHaveLength(0);
      expect(document.activeElement).toBe(trigger);
      expect(getLifecycleSnapshot()).toMatchObject({
        loops: 0, timers: 0, observers: 0, gameOwnedListeners: 0, mediaListeners: 0, pointerCaptures: 0,
      });
    }
  });

  it('runs 20 full retry, runtime-error, close, and reopen rounds with one bootstrap listener and zero leaked resources', () => {
    const { root, trigger, portfolio } = mountFixture();
    const { clock, env } = browserHarness();
    const bootstrapListeners = new Set();
    const nativeAdd = trigger.addEventListener.bind(trigger);
    const nativeRemove = trigger.removeEventListener.bind(trigger);
    trigger.addEventListener = (type, listener, options) => {
      if (type === 'click') bootstrapListeners.add(listener);
      nativeAdd(type, listener, options);
    };
    trigger.removeEventListener = (type, listener, options) => {
      if (type === 'click') bootstrapListeners.delete(listener);
      nativeRemove(type, listener, options);
    };
    const bootstrapListener = () => {};
    trigger.addEventListener('click', bootstrapListener);
    const portfolioSnapshot = portfolio.innerHTML;

    const assertAtomicClose = (session) => {
      expect(session.restoreCount).toBe(1);
      expect(root.hidden).toBe(true);
      expect(root.children).toHaveLength(0);
      expect(document.querySelectorAll('#cloud-rescue-root')).toHaveLength(1);
      expect(document.activeElement).toBe(trigger);
      expect(portfolio.innerHTML).toBe(portfolioSnapshot);
      expect(bootstrapListeners.size).toBe(1);
      expect(getLifecycleSnapshot()).toMatchObject({
        loops: 0, timers: 0, observers: 0, gameOwnedListeners: 0,
        mediaListeners: 0, pointerCaptures: 0, tornDown: true,
      });
    };

    for (let round = 0; round < 20; round += 1) {
      const retrySession = createOverlaySession({ root, trigger });
      open({
        root,
        trigger,
        env,
        overlaySession: retrySession,
        state: { ...createInitialState(), phase: 'CRASHED', gateScore: 2, lastFailure: 'gate', activePlayMs: round * 100 },
      });
      root.querySelector('[data-action="RETRY"]').click();
      expect(getStateSnapshot()).toMatchObject({ phase: 'READY', gateScore: 0, lastFailure: null });
      close(`full-stress-retry-${round}`);
      assertAtomicClose(retrySession);

      let renders = 0;
      const runtimeSession = createOverlaySession({ root, trigger });
      open({
        root,
        trigger,
        env,
        overlaySession: runtimeSession,
        state: makePlayingState(),
        renderer: (...args) => {
          renders += 1;
          if (renders > 1) throw new Error(`stress runtime ${round}`);
          return renderCanvas(...args);
        },
      });
      clock.flushFrame(PHYSICS.fixedStepMs);
      expect(getStateSnapshot().phase).toBe('RUNTIME_ERROR');
      root.querySelector('[data-action="BACK"]').click();
      assertAtomicClose(runtimeSession);

      const reopenSession = createOverlaySession({ root, trigger });
      open({ root, trigger, env, overlaySession: reopenSession, state: makePlayingState() });
      expect(isOpen()).toBe(true);
      close(`full-stress-reopen-${round}`);
      expect(close(`full-stress-idempotent-${round}`)).toBe(false);
      assertAtomicClose(reopenSession);
    }

    trigger.removeEventListener('click', bootstrapListener);
    expect(bootstrapListeners.size).toBe(0);
  });
});

describe('rAF, announcements, FPS and performance behavior', () => {
  it('caps catch-up at five, drains events only in the first step, and renders once per frame', () => {
    const clock = createFakeClock();
    const registry = createLifecycleRegistry({
      requestFrame: clock.requestAnimationFrame,
      cancelFrame: clock.cancelAnimationFrame,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    let state = { phase: 'PLAYING', documentVisible: true, steps: 0, eventCount: 0 };
    const drain = vi.fn(() => [{ type: 'JUMP' }]);
    const render = vi.fn();
    const loop = createGameLoop({
      getState: () => state,
      setState: (next) => { state = next; },
      step: (current, frame) => ({ ...current, steps: current.steps + 1, eventCount: current.eventCount + frame.events.length }),
      render,
      drainEvents: drain,
      registry,
      env: {
        requestFrame: clock.requestAnimationFrame,
        cancelFrame: clock.cancelAnimationFrame,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
      },
    });
    loop.start();
    clock.flushFrame(0);
    clock.flushFrame(PHYSICS.fixedStepMs * 10);
    expect(state.steps).toBe(PHYSICS.maxCatchUpSteps);
    expect(state.eventCount).toBe(1);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
    loop.stop();
    expect(clock.frames.size).toBe(0);
  });

  it('throttles polite announcements, deduplicates ids, and lets alerts bypass the queue', () => {
    const clock = createFakeClock();
    const writes = [];
    const queue = createAnnouncementQueue({
      write: (message, priority) => writes.push([message, priority]),
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
    });
    expect(queue.enqueue({ id: 'gate-1', message: 'Gate one' })).toBe(true);
    expect(queue.enqueue({ id: 'gate-1', message: 'duplicate' })).toBe(false);
    queue.enqueue({ id: 'gate-2', message: 'Gate two' });
    expect(writes).toEqual([['Gate one', undefined]]);
    clock.advance(999);
    expect(writes).toHaveLength(1);
    queue.enqueue({ id: 'collision', message: 'Collision', priority: 'alert' });
    expect(writes.at(-1)).toEqual(['Collision', 'alert']);
    clock.advance(1000);
    expect(writes.some(([message]) => message === 'Gate two')).toBe(true);
    queue.destroy();
    expect(clock.timers.size).toBe(0);
  });

  it('degrades effects exactly once after two consecutive median sub-24 FPS windows and resets across pause', () => {
    const burstDegrade = vi.fn();
    const burstSampler = createFpsSampler({ onDegrade: burstDegrade });
    burstSampler.sample(0, 'PLAYING');
    for (let time = 20; time <= 300; time += 20) burstSampler.sample(time, 'PLAYING');
    burstSampler.sample(1000, 'PLAYING');
    for (let time = 1020; time <= 1300; time += 20) burstSampler.sample(time, 'PLAYING');
    burstSampler.sample(2000, 'PLAYING');
    expect(burstDegrade).not.toHaveBeenCalled();

    const degrade = vi.fn();
    const sampler = createFpsSampler({ onDegrade: degrade });
    sampler.sample(0, 'PLAYING');
    for (let time = 50; time <= 1000; time += 50) sampler.sample(time, 'PLAYING');
    expect(degrade).not.toHaveBeenCalled();
    for (let time = 1050; time <= 2000; time += 50) sampler.sample(time, 'PLAYING');
    expect(degrade).toHaveBeenCalledTimes(1);
    for (let time = 2050; time <= 4000; time += 50) sampler.sample(time, 'PLAYING');
    expect(degrade).toHaveBeenCalledTimes(1);
    sampler.sample(10000, 'PAUSED');
    expect(sampler.consecutiveLowWindows).toBe(0);
  });

  it('keeps the first jump-to-render response within 100ms under a valid scheduler profile', () => {
    const state = { ...createInitialState(), phase: 'READY', readyElapsedMs: PHYSICS.readyMinMs };
    const { root, clock } = openMounted(state);
    const start = clock.now();
    root.querySelector('[data-flight-surface]').dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ', code: 'Space', bubbles: true, cancelable: true,
    }));
    clock.flushFrame(16.7);
    expect(getStateSnapshot().bot.vy).toBeLessThan(0);
    expect(clock.now() - start).toBeLessThanOrEqual(100);
  });
});


describe('procedural render budget', () => {
  it('keeps one-segment entity and command counts bounded without offscreen surfaces', () => {
    const state = makePlayingState();
    const recorder = createCanvasRecorder();
    renderCanvas(recorder.context, state, { timestamp: 1000 });
    expect(state.gates.length + state.bugs.length + 1).toBeLessThanOrEqual(5);
    expect(recorder.commands.length).toBeLessThan(400);
    expect(recorder.commands.some(([name]) => name === 'drawImage')).toBe(false);
  });
});


describe('runtime dependency boundaries', () => {
  it('freezes safely when an injected reducer throws after mount', () => {
    const reducer = (state, event) => {
      if (event.type === 'PAUSE') throw new Error('reducer failure');
      return reduceGameEvent(state, event);
    };
    const { root } = openMounted(makePlayingState(), { reducer });
    root.querySelector('[data-action="PAUSE"]').click();
    expect(getStateSnapshot().phase).toBe('RUNTIME_ERROR');
    expect(getLifecycleSnapshot().loops).toBe(0);
    expect(root.querySelector('[data-action="BACK"]')).not.toBeNull();
  });

  it('switches to the native error renderer when an injected DOM adapter throws', () => {
    let calls = 0;
    const domRenderer = (screen, markup) => {
      calls += 1;
      if (calls > 1) throw new Error('DOM adapter failure');
      screen.innerHTML = markup;
    };
    const { root } = openMounted(makePlayingState(), { domRenderer });
    root.querySelector('[data-action="PAUSE"]').click();
    expect(getStateSnapshot().phase).toBe('RUNTIME_ERROR');
    expect(root.textContent).toContain('Cloud Rescue stopped safely');
    expect(root.querySelector('[data-action="RESUME"]')).toBeNull();
    expect(root.querySelector('[data-action="BACK"]')).not.toBeNull();
  });
});
