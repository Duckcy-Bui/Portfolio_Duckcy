import fc from 'fast-check';
import {
  GAME_MODES,
  PHYSICS,
  WORLD,
  createBot,
  createInitialState,
  generateSegment,
} from '../../game/fc-engine.js';

export const NUM_RUNS = 150;

export function makePlayingState(overrides = {}) {
  const checkpoint = [0, 3, 6, 9].includes(overrides.checkpoint) ? overrides.checkpoint : 0;
  const segment = generateSegment(checkpoint);
  const base = createInitialState(overrides.mode || GAME_MODES.STANDARD, {
    reducedMotion: overrides.reducedMotion,
    phase: 'PLAYING',
  });
  return {
    ...base,
    phase: 'PLAYING',
    checkpoint,
    gateScore: overrides.gateScore ?? checkpoint,
    segmentIndex: checkpoint / 3,
    gates: overrides.gates || segment.gates,
    bugs: overrides.bugs || segment.bugs,
    bot: overrides.bot || createBot(),
    unlockedAchievementIds: overrides.unlockedAchievementIds || [],
    activePlayMs: overrides.activePlayMs ?? 0,
    attempt: overrides.attempt ?? 1,
    ...overrides,
  };
}

export function createFakeClock(start = 0) {
  let now = start;
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();

  const schedule = (callback, delay, interval = false) => {
    const id = nextId++;
    const normalizedDelay = interval ? Math.max(1, delay || 0) : Math.max(0, delay || 0);
    timers.set(id, { callback, at: now + normalizedDelay, delay: normalizedDelay, interval });
    return id;
  };

  const runDue = () => {
    let ran = true;
    while (ran) {
      ran = false;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, timer] of due) {
        if (!timers.has(id)) continue;
        if (timer.interval) timer.at += timer.delay;
        else timers.delete(id);
        timer.callback();
        ran = true;
      }
    }
  };

  return {
    now: () => now,
    timers,
    frames,
    setTimeout: (callback, delay) => schedule(callback, delay, false),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    advance(ms) {
      now += Math.max(0, ms);
      runDue();
    },
    flushFrame(delta = PHYSICS.fixedStepMs) {
      now += delta;
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(now);
      runDue();
    },
    clear() { timers.clear(); frames.clear(); },
  };
}

export function createCanvasRecorder() {
  const commands = [];
  const method = (name) => (...args) => commands.push([name, ...args]);
  return {
    commands,
    context: {
      save: method('save'), restore: method('restore'), beginPath: method('beginPath'),
      closePath: method('closePath'), moveTo: method('moveTo'), lineTo: method('lineTo'),
      arc: method('arc'), rect: method('rect'), fill: method('fill'), stroke: method('stroke'),
      fillRect: method('fillRect'), strokeRect: method('strokeRect'), fillText: method('fillText'),
      clearRect: method('clearRect'), setTransform: method('setTransform'), translate: method('translate'),
      rotate: method('rotate'), scale: method('scale'), measureText: (text) => ({ width: String(text).length * 8 }),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    },
  };
}

export function createFakeResizeObserver() {
  const instances = new Set();
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; this.observing = new Set(); this.disconnected = false; instances.add(this); }
    observe(target) { this.observing.add(target); }
    unobserve(target) { this.observing.delete(target); }
    disconnect() { this.observing.clear(); this.disconnected = true; }
    emit(entries = []) { if (!this.disconnected) this.callback(entries, this); }
  }
  return { FakeResizeObserver, instances };
}

export function createFakeMediaQueryList(initial = false) {
  let matches = initial;
  const listeners = new Set();
  return {
    media: '(prefers-reduced-motion: reduce)',
    get matches() { return matches; },
    addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); },
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    set(value) { matches = Boolean(value); for (const listener of listeners) listener({ matches }); },
    get listenerCount() { return listeners.size; },
  };
}

export function createInstrumentedSurface() {
  const target = document.createElement('div');
  target.tabIndex = 0;
  const listeners = new Map();
  const nativeAdd = target.addEventListener.bind(target);
  const nativeRemove = target.removeEventListener.bind(target);
  target.addEventListener = (type, listener, options) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    nativeAdd(type, listener, options);
  };
  target.removeEventListener = (type, listener, options) => {
    listeners.get(type)?.delete(listener);
    nativeRemove(type, listener, options);
  };
  return {
    target,
    listeners,
    count: () => [...listeners.values()].reduce((total, group) => total + group.size, 0),
  };
}

export const finiteDoubleArb = fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true });
export const positiveDtArb = fc.double({ min: 1e-6, max: 0.25, noNaN: true, noDefaultInfinity: true });
export const botArb = fc.record({
  x: fc.double({ min: -100, max: WORLD.width, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: -100, max: WORLD.height + 100, noNaN: true, noDefaultInfinity: true }),
  width: fc.constant(PHYSICS.botWidth),
  height: fc.constant(PHYSICS.botHeight),
  vy: fc.double({ min: PHYSICS.jumpVelocity, max: PHYSICS.terminalVelocity, noNaN: true, noDefaultInfinity: true }),
  hitboxInset: fc.constant(PHYSICS.hitboxInset),
  tilt: fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
});

export const rectArb = fc.record({
  x: finiteDoubleArb,
  y: finiteDoubleArb,
  width: fc.double({ min: 0.001, max: 500, noNaN: true, noDefaultInfinity: true }),
  height: fc.double({ min: 0.001, max: 500, noNaN: true, noDefaultInfinity: true }),
}).map(({ x, y, width, height }) => ({ left: x, top: y, right: x + width, bottom: y + height }));

export const viewportArb = fc.record({
  width: fc.integer({ min: 320, max: 1920 }),
  height: fc.integer({ min: 180, max: 2160 }),
  dpr: fc.double({ min: 0.25, max: 5, noNaN: true, noDefaultInfinity: true }),
});

export const modalityArb = fc.constantFrom('keyboard', 'mouse', 'touch');
export const checkpointArb = fc.constantFrom(0, 3, 6, 9);
export const modeArb = fc.constantFrom(GAME_MODES.STANDARD, GAME_MODES.NO_TIMER);
