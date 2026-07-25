import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACHIEVEMENTS,
  BUG_CONFIGS,
  CANONICAL_ACHIEVEMENT_IDS,
  CHECKPOINTS,
  GAME_MODES,
  GATE_CONFIGS,
  PHYSICS,
  TRANSITION_GRAPH,
  WORLD,
  applyGravity,
  applyJump,
  botFellOut,
  checkAabbCollision,
  classifyBotRelative,
  classifyDistance,
  classifyOpening,
  clientToWorld,
  close,
  collectApproachAnnouncements,
  computeCanvasSize,
  continueFromAchievement,
  createBot,
  createInitialState,
  createInputController,
  createLifecycleResources,
  createWonSummary,
  describeSpatialStatus,
  formatActivePlayTime,
  generateBug,
  generateGate,
  generateSegment,
  getAchievementForScore,
  isOpen,
  open,
  projectHud,
  reduceGameEvent,
  retryFromCheckpoint,
  stepGame,
  toBotHitbox,
  toBugHitbox,
  toGateHitboxes,
  unlockForScore,
  validateGateConfig,
  validateLevelFairness,
  worldToClient,
} from '../../game/fc-engine.js';
import {
  createFakeClock,
  createFakeMediaQueryList,
  createFakeResizeObserver,
  createInstrumentedSurface,
  makePlayingState,
} from './test-helpers.js';

afterEach(() => close('test-cleanup'));

describe('Flappy Cloud canonical models and configuration', () => {
  it('defines the exact world and baseline physics constants', () => {
    expect(WORLD).toEqual({ width: 960, height: 540 });
    expect(PHYSICS).toMatchObject({
      fixedStepMs: 1000 / 60,
      maxCatchUpSteps: 5,
      botXRatio: 0.24,
      botWidth: 48,
      botHeight: 36,
      hitboxInset: 4,
      gravity: 1450,
      jumpVelocity: -430,
      terminalVelocity: 700,
      gateWidth: 82,
      firstPassLeadMs: 3200,
      gateCadenceMs: 2350,
      readyMinMs: 600,
      readyMaxMs: 1500,
    });
    expect(Object.isFrozen(WORLD)).toBe(true);
    expect(Object.isFrozen(PHYSICS)).toBe(true);
  });

  it('creates independent canonical initial state and lifecycle models', () => {
    const one = createInitialState(GAME_MODES.STANDARD);
    const two = createInitialState(GAME_MODES.NO_TIMER);
    expect(one).toMatchObject({
      phase: 'INTRO', mode: 'STANDARD', gateScore: 0, checkpoint: 0,
      activePlayMs: 0, attempt: 0, segmentIndex: 0,
    });
    expect(two.mode).toBe('NO_TIMER');
    expect(one.bot).toEqual({ x: 230.4, y: 270, width: 48, height: 36, vy: 0, hitboxInset: 4, tilt: 0 });
    expect(one.gates).not.toBe(two.gates);
    expect(one.bugs).not.toBe(two.bugs);
    expect(one.unlockedAchievementIds).not.toBe(two.unlockedAchievementIds);

    const a = createLifecycleResources();
    const b = createLifecycleResources();
    expect(a.timeoutIds).toBeInstanceOf(Set);
    expect(a.timeoutIds).not.toBe(b.timeoutIds);
    expect(a.pointerCaptureIds).not.toBe(b.pointerCaptureIds);
  });

  it('defines all twelve gates and four bugs exactly', () => {
    expect(GATE_CONFIGS.map(({ ordinal, label }) => [ordinal, label])).toEqual([
      [1, 'LINT'], [2, 'TEST'], [3, 'MERGE'], [4, 'BUILD'], [5, 'SCAN'], [6, 'DEPLOY'],
      [7, 'IaC'], [8, 'OBSERVE'], [9, 'SCALE'], [10, 'LOGS'], [11, 'HOTFIX'], [12, 'ROLLBACK'],
    ]);
    expect(GATE_CONFIGS.map((gate) => gate.speed)).toEqual([185, 185, 185, 195, 195, 195, 205, 205, 205, 215, 215, 215]);
    expect(GATE_CONFIGS.map((gate) => gate.gap)).toEqual([230, 230, 230, 220, 220, 220, 210, 210, 210, 200, 200, 200]);
    expect(BUG_CONFIGS.map(({ afterGate, label }) => [afterGate, label])).toEqual([
      [2, 'BUG'], [5, '5XX'], [8, 'DRIFT'], [11, 'REGRESSION'],
    ]);
    expect(validateGateConfig(GATE_CONFIGS)).toBe(true);
  });

  it('stores all four canonical achievements byte-for-byte and frozen', () => {
    expect(ACHIEVEMENTS).toEqual([
      {
        id: 'code-crafter', gate: 3, title: 'Code Crafter',
        funFact: 'Đức lập trình với Python, Java, C++ và SQL; đồng thời phát triển backend bằng Flask và Spring Boot.',
      },
      {
        id: 'pipeline-pilot', gate: 6, title: 'Pipeline Pilot',
        funFact: 'Đức tập trung vào Docker, Linux, CI/CD và triển khai có khả năng rollback.',
      },
      {
        id: 'aws-community-builder', gate: 9, title: 'AWS Community Builder',
        funFact: 'Đức là thành viên Core Team của AWS Student Builder Group.',
      },
      {
        id: 'midnight-bug-hunter', gate: 12, title: 'Midnight Bug Hunter',
        funFact: 'Khi bug xuất hiện sát giờ deploy, Đức sẵn sàng theo dấu log và hoàn thiện hotfix trong ca debug đêm muộn.',
      },
    ]);
    expect(ACHIEVEMENTS.every(Object.isFrozen)).toBe(true);
    expect(CANONICAL_ACHIEVEMENT_IDS).toEqual(ACHIEVEMENTS.map((item) => item.id));
  });
});

describe('Flappy Cloud pure geometry and helpers', () => {
  it('applies jump, gravity, and hitbox insets without mutation', () => {
    const bot = createBot({ vy: 123 });
    const jumped = applyJump(bot);
    const fallen = applyGravity(bot, 0.1);
    expect(bot.vy).toBe(123);
    expect(jumped.vy).toBe(-430);
    expect(fallen.vy).toBe(268);
    expect(fallen.y).toBeCloseTo(296.8, 10);
    expect(toBotHitbox(bot)).toEqual({ left: 234.4, top: 274, right: 274.4, bottom: 302 });
  });

  it('uses positive-area AABB overlap and derives obstacle hitboxes', () => {
    const gate = generateGate(GATE_CONFIGS[0], 0);
    const bug = generateBug(BUG_CONFIGS[0], generateSegment(0).gates);
    const [top, bottom] = toGateHitboxes(gate);
    expect(top.bottom).toBe(gate.gapTop);
    expect(bottom.top).toBe(gate.gapBottom);
    const bugHitbox = toBugHitbox(bug);
    expect(bugHitbox.left).toBeGreaterThan(bug.x);
    expect(bugHitbox.right).toBeLessThan(bug.x + bug.width);
    expect(checkAabbCollision({ left: 0, top: 0, right: 1, bottom: 1 }, { left: 1, top: 0, right: 2, bottom: 1 })).toBe(false);
    expect(checkAabbCollision({ left: 0, top: 0, right: 1.01, bottom: 1 }, { left: 1, top: 0, right: 2, bottom: 1 })).toBe(true);
  });

  it('generates every deterministic segment with a fair corridor', () => {
    for (const checkpoint of CHECKPOINTS) {
      const first = generateSegment(checkpoint, { cosmeticSeed: 1 });
      const second = generateSegment(checkpoint, { cosmeticSeed: 999 });
      expect(first).toEqual(second);
      expect(first.gates).toHaveLength(3);
      expect(first.bugs).toHaveLength(1);
      expect(validateLevelFairness(first.gates, first.bugs)).toBe(true);
    }
    const blocked = generateSegment(0);
    blocked.bugs[0] = { ...blocked.bugs[0], y: 180, height: 180 };
    expect(validateLevelFairness(blocked.gates, blocked.bugs)).toBe(false);
  });

  it('fits a 16:9 canvas and maps coordinates round-trip', () => {
    const size = computeCanvasSize(360, 800, 3);
    expect(size).toEqual({ cssWidth: 360, cssHeight: 202.5, pixelRatio: 2, backingWidth: 720, backingHeight: 405 });
    const rect = { left: 20, top: 30, width: 360, height: 202.5 };
    const client = worldToClient({ x: 480, y: 270 }, rect);
    expect(client).toEqual({ x: 200, y: 131.25 });
    expect(clientToWorld(client, rect)).toEqual({ x: 480, y: 270 });
  });

  it('classifies all spatial status boundaries exactly', () => {
    expect(classifyOpening(0.43 * 540 - 50, 0.43 * 540 + 50)).toBe('middle');
    expect(classifyOpening(0.57 * 540 - 50, 0.57 * 540 + 50)).toBe('middle');
    expect(classifyOpening(100, 200)).toBe('high');
    expect(classifyOpening(350, 450)).toBe('low');
    expect(classifyBotRelative(100, 100, 200)).toBe('inside');
    expect(classifyBotRelative(200, 100, 200)).toBe('inside');
    expect(classifyBotRelative(99, 100, 200)).toBe('above');
    expect(classifyBotRelative(201, 100, 200)).toBe('below');
    expect(classifyDistance(1.5)).toBe('near');
    expect(classifyDistance(1.500001)).toBe('far');
  });
});

describe('Flappy Cloud step ordering, scoring, checkpoint, and time', () => {
  it('resolves a collision before a simultaneous gate pass', () => {
    const bot = createBot();
    const hitbox = toBotHitbox(bot);
    const passedGate = {
      ...generateGate(GATE_CONFIGS[0], 0),
      x: hitbox.left - PHYSICS.gateWidth - 0.1,
    };
    const collidingGate = {
      ...generateGate(GATE_CONFIGS[1], 1),
      x: hitbox.left + 1,
      gapTop: hitbox.top + 10,
      gapBottom: hitbox.bottom + 100,
    };
    const state = makePlayingState({ gates: [passedGate, collidingGate], bugs: [] });
    const next = stepGame(state, { dtMs: 0, events: [] });
    expect(next.phase).toBe('CRASHED');
    expect(next.lastFailure).toBe('gate');
    expect(next.gateScore).toBe(0);
    expect(next.gates[0].scored).toBe(false);
  });

  it('scores each passed gate once and enters milestone states', () => {
    const botLeft = toBotHitbox(createBot()).left;
    let state = makePlayingState({
      gateScore: 2,
      gates: [{ ...generateGate(GATE_CONFIGS[2], 2), x: botLeft - PHYSICS.gateWidth - 1 }],
      bugs: [],
    });
    state = stepGame(state, { dtMs: 0, events: [] });
    expect(state.phase).toBe('ACHIEVEMENT');
    expect(state.gateScore).toBe(3);
    expect(state.checkpoint).toBe(3);
    expect(state.unlockedAchievementIds).toEqual(['code-crafter']);
    expect(stepGame(state, { dtMs: 5000, events: [] }).gateScore).toBe(3);
  });

  it('retries from checkpoint while preserving active time and committed prefix', () => {
    const failed = {
      ...makePlayingState({ checkpoint: 6, gateScore: 8, activePlayMs: 12345, attempt: 4 }),
      phase: 'CRASHED',
      unlockedAchievementIds: ['code-crafter', 'pipeline-pilot'],
      lastFailure: 'bug',
    };
    const next = retryFromCheckpoint(failed);
    expect(next).toMatchObject({ phase: 'READY', checkpoint: 6, gateScore: 6, activePlayMs: 12345, attempt: 5, lastFailure: null });
    expect(next.bot).toEqual(createBot());
    expect(next.gates.map((gate) => gate.ordinal)).toEqual([7, 8, 9]);
    expect(next.unlockedAchievementIds).toEqual(['code-crafter', 'pipeline-pilot']);
  });

  it('counts active time only during an alive PLAYING step', () => {
    const playing = makePlayingState({ gates: [], bugs: [], activePlayMs: 100 });
    expect(stepGame(playing, { dtMs: 17, events: [] }).activePlayMs).toBe(117);
    const paused = { ...playing, phase: 'PAUSED' };
    expect(stepGame(paused, { dtMs: 10000, events: [] }).activePlayMs).toBe(100);
    expect(stepGame(playing, { dtMs: 17, events: [{ type: 'PAUSE' }] }).activePlayMs).toBe(100);
  });

  it('clamps top safely and crashes once after bottom loss', () => {
    const top = makePlayingState({ bot: createBot({ y: -20, vy: -300 }), gates: [], bugs: [] });
    const topNext = stepGame(top, { dtMs: PHYSICS.fixedStepMs, events: [] });
    expect(toBotHitbox(topNext.bot).top).toBe(0);
    expect(topNext.phase).toBe('PLAYING');

    const bottom = makePlayingState({ bot: createBot({ y: 520, vy: 700 }), gates: [], bugs: [] });
    expect(botFellOut(bottom.bot)).toBe(true);
    const crashed = stepGame(bottom, { dtMs: 0, events: [] });
    expect(crashed.phase).toBe('CRASHED');
    const frozen = stepGame(crashed, { dtMs: 1000, events: [{ type: 'JUMP', source: 'keyboard' }] });
    expect(frozen.bot).toEqual(crashed.bot);
    expect(frozen.activePlayMs).toBe(crashed.activePlayMs);
  });
});

describe('Flappy Cloud reducer and achievement units', () => {
  it('implements the explicit startup, ready, pause, retry, and close graph', () => {
    let state = { ...createInitialState(), phase: 'DORMANT' };
    state = reduceGameEvent(state, { type: 'ACTIVATE' });
    expect(state.phase).toBe('CAPABILITY_CHECK');
    state = reduceGameEvent(state, { type: 'SUPPORTED' });
    expect(state.phase).toBe('LOADING');
    state = reduceGameEvent(state, { type: 'LOAD_SUCCESS' });
    expect(state.phase).toBe('INTRO');
    state = reduceGameEvent(state, { type: 'START', mode: 'NO_TIMER' });
    expect(state).toMatchObject({ phase: 'READY', mode: 'NO_TIMER', attempt: 1, readyElapsedMs: 0 });
    const early = reduceGameEvent(state, { type: 'JUMP', source: 'keyboard' });
    expect(early).toBe(state);
    state = reduceGameEvent(state, { type: 'READY_TICK', dtMs: 600 });
    state = reduceGameEvent(state, { type: 'JUMP', source: 'keyboard' });
    expect(state).toMatchObject({ phase: 'PLAYING', lastInputModality: 'keyboard' });
    state = reduceGameEvent(state, { type: 'PAUSE' });
    expect(state.phase).toBe('PAUSED');
    state = reduceGameEvent(state, { type: 'RESUME' });
    expect(state.phase).toBe('READY');
    state = reduceGameEvent(state, { type: 'CLOSE' });
    expect(state.phase).toBe('CLOSING');
    state = reduceGameEvent(state, { type: 'TEARDOWN_COMPLETE' });
    expect(state.phase).toBe('DORMANT');
  });

  it('has no transition edge outside the declared graph', () => {
    for (const [from, tos] of Object.entries(TRANSITION_GRAPH)) {
      expect(new Set(tos).size).toBe(tos.length);
      expect(tos).not.toContain(from);
    }
  });

  it('does not auto-resume or auto-dismiss achievements', () => {
    const paused = { ...makePlayingState(), phase: 'PAUSED', documentVisible: false };
    const visible = reduceGameEvent(paused, { type: 'VISIBILITY_VISIBLE' });
    expect(visible.phase).toBe('PAUSED');
    expect(reduceGameEvent(visible, { type: 'RESIZE_COMPLETE' }).phase).toBe('PAUSED');
    expect(reduceGameEvent(visible, { type: 'RESUME' }).phase).toBe('READY');

    const achievement = {
      ...makePlayingState({ checkpoint: 3, gateScore: 3 }),
      phase: 'ACHIEVEMENT',
      unlockedAchievementIds: ['code-crafter'],
    };
    const afterThirtySeconds = stepGame(achievement, { dtMs: 30000, events: [] });
    expect(afterThirtySeconds.phase).toBe('ACHIEVEMENT');
    expect(afterThirtySeconds.activePlayMs).toBe(achievement.activePlayMs);
    expect(continueFromAchievement(afterThirtySeconds).phase).toBe('READY');
  });

  it('unlocks canonical prefixes idempotently and never checkpoints gate 12', () => {
    let state = makePlayingState();
    expect(getAchievementForScore(2)).toBeNull();
    expect(getAchievementForScore(3)).toBe(ACHIEVEMENTS[0]);
    state = unlockForScore({ ...state, gateScore: 6 }, 6);
    expect(state.unlockedAchievementIds).toEqual(['code-crafter', 'pipeline-pilot']);
    expect(state.checkpoint).toBe(6);
    expect(unlockForScore(state, 6)).toBe(state);
    state = unlockForScore({ ...state, gateScore: 12 }, 12);
    expect(state.unlockedAchievementIds).toEqual(CANONICAL_ACHIEVEMENT_IDS);
    expect(state.checkpoint).toBe(6);
  });

  it('formats nearest-second boundaries and No Timer result annotation', () => {
    expect(formatActivePlayTime(499)).toBe('00:00');
    expect(formatActivePlayTime(500)).toBe('00:01');
    expect(formatActivePlayTime(59499)).toBe('00:59');
    expect(formatActivePlayTime(59500)).toBe('01:00');
    const won = {
      ...makePlayingState({ mode: GAME_MODES.NO_TIMER, gateScore: 12, activePlayMs: 59500 }),
      phase: 'WON',
      unlockedAchievementIds: [...CANONICAL_ACHIEVEMENT_IDS],
    };
    expect(projectHud(won).showElapsed).toBe(false);
    expect(createWonSummary(won)).toMatchObject({
      heading: 'Production Saved!', score: '12/12', activePlayTime: 'Active play time: 01:00',
      durationNote: 'No Timer mode — duration shown for reference',
    });
    expect(createWonSummary(won).achievements).toEqual(ACHIEVEMENTS);
  });

  it('resets all progression on Play Again but preserves mode preselection', () => {
    const won = {
      ...makePlayingState({ mode: GAME_MODES.NO_TIMER, checkpoint: 9, gateScore: 12, activePlayMs: 9876, attempt: 9 }),
      phase: 'WON',
      unlockedAchievementIds: [...CANONICAL_ACHIEVEMENT_IDS],
      lastFailure: 'gate',
    };
    const replay = reduceGameEvent(won, { type: 'PLAY_AGAIN' });
    expect(replay).toMatchObject({
      phase: 'INTRO', mode: 'NO_TIMER', gateScore: 0, checkpoint: 0,
      activePlayMs: 0, attempt: 0, lastFailure: null,
    });
    expect(replay.unlockedAchievementIds).toEqual([]);
    expect(replay.bot).toEqual(createBot());
    expect(replay.gates.map((gate) => gate.ordinal)).toEqual([1, 2, 3]);
  });
});

describe('Flappy Cloud input and harness units', () => {
  it('maps surface inputs, prevents only accepted gameplay input, and removes every listener on abort', () => {
    const { target, count } = createInstrumentedSurface();
    document.body.append(target);
    const events = [];
    let phase = 'PLAYING';
    const abortController = new AbortController();
    const controller = createInputController({
      surface: target,
      dispatch: (event) => events.push(event),
      getPhase: () => phase,
      signal: abortController.signal,
    });
    expect(controller.listenerCount).toBe(6);
    expect(count()).toBe(6);

    const space = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    target.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'JUMP', source: 'keyboard' });

    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
    expect(events.at(-1)).toMatchObject({ type: 'STATUS_REQUEST' });
    phase = 'PAUSED';
    const ignored = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true });
    target.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);

    abortController.abort();
    expect(controller.destroyed).toBe(true);
    expect(controller.listenerCount).toBe(0);
    expect(count()).toBe(0);
    const before = events.length;
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(events).toHaveLength(before);
  });

  it('provides reliable fake clock, media-query, and observer adapters', () => {
    const clock = createFakeClock(10);
    const calls = [];
    clock.setTimeout(() => calls.push('timeout'), 50);
    clock.requestAnimationFrame((time) => calls.push(time));
    clock.advance(49);
    expect(calls).toEqual([]);
    clock.advance(1);
    expect(calls).toEqual(['timeout']);
    clock.flushFrame(16);
    expect(calls).toEqual(['timeout', 76]);

    const media = createFakeMediaQueryList();
    const listener = vi.fn();
    media.addEventListener('change', listener);
    media.set(true);
    expect(listener).toHaveBeenCalledWith({ matches: true });
    expect(media.listenerCount).toBe(1);
    media.removeEventListener('change', listener);
    expect(media.listenerCount).toBe(0);

    const { FakeResizeObserver } = createFakeResizeObserver();
    const callback = vi.fn();
    const observer = new FakeResizeObserver(callback);
    observer.observe(targetFixture());
    observer.emit([{ contentRect: { width: 100 } }]);
    expect(callback).toHaveBeenCalledOnce();
    observer.disconnect();
    observer.emit([]);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('keeps the module lifecycle facade isolated and idempotent', () => {
    expect(isOpen()).toBe(false);
    const first = open({ mode: GAME_MODES.STANDARD });
    const second = open({ mode: GAME_MODES.NO_TIMER });
    expect(second).toBe(first);
    expect(isOpen()).toBe(true);
    expect(close()).toBe(true);
    expect(close()).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('announces each approaching gate once and reports no remaining gate', () => {
    const state = makePlayingState({
      gates: [{ ...generateGate(GATE_CONFIGS[0], 0), x: toBotHitbox(createBot()).left + 185 - 82 }],
      bugs: [],
    });
    const first = collectApproachAnnouncements(state);
    expect(first.announcements).toHaveLength(1);
    expect(first.announcements[0]).toMatchObject({ id: 'gate-approach-1', gate: 1, label: 'LINT' });
    const second = collectApproachAnnouncements(first.state);
    expect(second.announcements).toEqual([]);
    expect(describeSpatialStatus({ ...state, gates: [] })).toEqual({ message: 'no gate remaining', gate: null });
  });
});

function targetFixture() {
  return document.createElement('div');
}
