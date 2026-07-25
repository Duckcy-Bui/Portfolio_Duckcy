import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  CANONICAL_ACHIEVEMENT_IDS,
  GAME_MODES,
  PHYSICS,
  advanceFixedFrames,
  createBot,
  createInitialState,
  createWonSummary,
  getNextGate,
  projectHud,
  reduceGameEvent,
  stepGame,
  toBotHitbox,
} from '../../game/fc-engine.js';

describe('Flappy Cloud pure-core integration paths', () => {
  it('runs INTRO → READY delay → first flap → PLAYING without falling early', () => {
    let state = createInitialState(GAME_MODES.STANDARD);
    state = reduceGameEvent(state, { type: 'START' });
    expect(state.phase).toBe('READY');
    expect(state.activePlayMs).toBe(0);

    state = stepGame(state, {
      dtMs: PHYSICS.readyMinMs - 1,
      events: [{ type: 'JUMP', source: 'keyboard' }],
    });
    expect(state.phase).toBe('READY');
    expect(state.bot).toEqual(createBot());

    state = stepGame(state, { dtMs: 1, events: [] });
    state = stepGame(state, { dtMs: 0, events: [{ type: 'JUMP', source: 'keyboard' }] });
    expect(state.phase).toBe('PLAYING');
    expect(state.bot.vy).toBe(PHYSICS.jumpVelocity);
    expect(state.activePlayMs).toBe(0);
  });

  it('completes all twelve gates with score 1…12, manual interstitials, and canonical result', () => {
    let state = reduceGameEvent(createInitialState(GAME_MODES.NO_TIMER), { type: 'START' });
    state = stepGame(state, { dtMs: PHYSICS.readyMinMs, events: [] });
    state = stepGame(state, { dtMs: 0, events: [{ type: 'JUMP', source: 'keyboard' }] });
    const scores = [];
    const achievementSnapshots = [];

    for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
      expect(state.phase).toBe('PLAYING');
      const botLeft = toBotHitbox(state.bot).left;
      state = {
        ...state,
        bugs: [],
        gates: state.gates.map((gate) => ({
          ...gate,
          gapTop: 0,
          gapBottom: state.world.height,
          x: gate.ordinal === ordinal ? botLeft - gate.width - 1 : gate.x,
        })),
      };
      state = stepGame(state, { dtMs: PHYSICS.fixedStepMs, events: [] });
      scores.push(state.gateScore);

      if ([3, 6, 9].includes(ordinal)) {
        expect(state.phase).toBe('ACHIEVEMENT');
        achievementSnapshots.push([...state.unlockedAchievementIds]);
        const timeAtReveal = state.activePlayMs;
        state = stepGame(state, { dtMs: 30_000, events: [] });
        expect(state.phase).toBe('ACHIEVEMENT');
        expect(state.activePlayMs).toBe(timeAtReveal);
        state = reduceGameEvent(state, { type: 'CONTINUE' });
        state = stepGame(state, { dtMs: PHYSICS.readyMinMs, events: [] });
        state = stepGame(state, { dtMs: 0, events: [{ type: 'JUMP', source: 'keyboard' }] });
      }
    }

    expect(scores).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(achievementSnapshots).toEqual([
      ['code-crafter'],
      ['code-crafter', 'pipeline-pilot'],
      ['code-crafter', 'pipeline-pilot', 'aws-community-builder'],
    ]);
    expect(state.phase).toBe('WON');
    expect(state.checkpoint).toBe(9);
    expect(state.unlockedAchievementIds).toEqual(CANONICAL_ACHIEVEMENT_IDS);
    expect(projectHud(state).showElapsed).toBe(false);
    const summary = createWonSummary(state);
    expect(summary.heading).toBe('Production Saved!');
    expect(summary.score).toBe('12/12');
    expect(summary.durationNote).toBe('No Timer mode — duration shown for reference');
    expect(summary.achievements).toEqual(ACHIEVEMENTS);
  });

  it('keeps failed-attempt time and unlocked facts when retrying a deterministic segment', () => {
    let state = {
      ...createInitialState(),
      phase: 'CRASHED',
      checkpoint: 6,
      gateScore: 8,
      activePlayMs: 42_500,
      attempt: 3,
      unlockedAchievementIds: ['code-crafter', 'pipeline-pilot'],
      lastFailure: 'bug',
    };
    state = reduceGameEvent(state, { type: 'RETRY' });
    expect(state).toMatchObject({
      phase: 'READY', checkpoint: 6, gateScore: 6,
      activePlayMs: 42_500, attempt: 4, lastFailure: null,
    });
    expect(state.gates.map((gate) => gate.ordinal)).toEqual([7, 8, 9]);
    expect(state.bugs.map((bug) => bug.afterGate)).toEqual([8]);
    expect(state.unlockedAchievementIds).toEqual(['code-crafter', 'pipeline-pilot']);
  });

  it('caps catch-up at five steps per refresh frame and records dropped stall time', () => {
    const state = {
      ...createInitialState(),
      phase: 'PLAYING',
      gates: [],
      bugs: [],
    };
    const result = advanceFixedFrames(state, [PHYSICS.fixedStepMs * 100], []);
    expect(result.simulationStep).toBe(PHYSICS.maxCatchUpSteps);
    expect(result.state.activePlayMs).toBeCloseTo(PHYSICS.fixedStepMs * PHYSICS.maxCatchUpSteps, 8);
    expect(result.droppedMs).toBeCloseTo(PHYSICS.fixedStepMs * 95, 8);
  });

  it('pauses before a frame update and requires an explicit READY path to resume', () => {
    const playing = {
      ...createInitialState(),
      phase: 'PLAYING',
      gates: [],
      bugs: [],
      activePlayMs: 1000,
    };
    const paused = stepGame(playing, {
      dtMs: PHYSICS.fixedStepMs,
      events: [{ type: 'VIEWPORT_CHANGED', source: 'system' }],
    });
    expect(paused.phase).toBe('PAUSED');
    expect(paused.activePlayMs).toBe(1000);
    expect(reduceGameEvent(paused, { type: 'RESIZE_COMPLETE' }).phase).toBe('PAUSED');
    const ready = reduceGameEvent(paused, { type: 'RESUME' });
    expect(ready.phase).toBe('READY');
    expect(ready.bot).toEqual(paused.bot);
    expect(ready.gates).toEqual(paused.gates);
  });
});


describe('Flappy Cloud authored Reference_Path timing', () => {
  it('places the no-collision 12-gate path within 30–60 seconds including typical fact reading', () => {
    const segmentFlightMs = PHYSICS.firstPassLeadMs + 2 * PHYSICS.gateCadenceMs;
    const activeFlightMs = segmentFlightMs * 4;
    const readyMs = PHYSICS.readyMinMs * 4;
    const typicalFactReadingMs = 3000 * 3;
    const startToWonMs = activeFlightMs + readyMs + typicalFactReadingMs;
    expect(activeFlightMs).toBe(31600);
    expect(startToWonMs).toBe(43000);
    expect(startToWonMs).toBeGreaterThanOrEqual(30000);
    expect(startToWonMs).toBeLessThanOrEqual(60000);
  });

  it('resets every progression field on Play Again while preserving only mode preference', () => {
    const won = {
      ...createInitialState(GAME_MODES.NO_TIMER),
      phase: 'WON',
      gateScore: 12,
      checkpoint: 9,
      unlockedAchievementIds: [...CANONICAL_ACHIEVEMENT_IDS],
      activePlayMs: 43000,
      attempt: 4,
      lastFailure: null,
    };
    const replay = reduceGameEvent(won, { type: 'PLAY_AGAIN' });
    expect(replay).toMatchObject({
      phase: 'INTRO', mode: GAME_MODES.NO_TIMER, gateScore: 0, checkpoint: 0,
      unlockedAchievementIds: [], activePlayMs: 0, attempt: 0, segmentIndex: 0, lastFailure: null,
    });
    expect(replay.bot).toEqual(createBot());
  });
});


describe('Flappy Cloud executable Reference_Path controller', () => {
  it('clears all 12 authored gates without collision using only public JUMP and CONTINUE events', () => {
    let state = reduceGameEvent(createInitialState(), { type: 'START' });
    let elapsedMs = 0;
    let lastBoostMs = -Infinity;
    let factReadingMs = 0;
    const scores = [];
    const failures = [];

    while (elapsedMs < 60000 && state.phase !== 'WON') {
      if (state.phase === 'ACHIEVEMENT') {
        factReadingMs += 3000;
        elapsedMs += 3000;
        state = reduceGameEvent(state, { type: 'CONTINUE' });
        lastBoostMs = -Infinity;
        continue;
      }
      if (state.phase === 'CRASHED') {
        failures.push(state.lastFailure);
        break;
      }
      const events = [];
      if (state.phase === 'READY' && elapsedMs - lastBoostMs >= 250) {
        events.push({ type: 'JUMP', source: 'keyboard' });
        lastBoostMs = elapsedMs;
      } else if (state.phase === 'PLAYING') {
        const gate = getNextGate(state);
        const targetY = gate ? (gate.gapTop + gate.gapBottom) / 2 - state.bot.height / 2 : 250;
        if (elapsedMs - lastBoostMs >= 200 && state.bot.vy > -200 && state.bot.y > targetY + 30) {
          events.push({ type: 'JUMP', source: 'keyboard' });
          lastBoostMs = elapsedMs;
        }
      }
      const previousScore = state.gateScore;
      state = stepGame(state, { dtMs: PHYSICS.fixedStepMs, events });
      if (state.gateScore > previousScore) scores.push(state.gateScore);
      elapsedMs += PHYSICS.fixedStepMs;
    }

    expect(failures).toEqual([]);
    expect(state.phase).toBe('WON');
    expect(scores).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(state.unlockedAchievementIds).toEqual(CANONICAL_ACHIEVEMENT_IDS);
    expect(factReadingMs).toBe(9000);
    expect(elapsedMs).toBeGreaterThanOrEqual(30000);
    expect(elapsedMs).toBeLessThanOrEqual(60000);
    expect(state.activePlayMs).toBeGreaterThan(30000);
    expect(state.activePlayMs).toBeLessThan(35000);
  });
});
