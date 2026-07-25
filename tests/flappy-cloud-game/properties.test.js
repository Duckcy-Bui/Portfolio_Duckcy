import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACHIEVEMENTS,
  BUG_CONFIGS,
  CANONICAL_ACHIEVEMENT_IDS,
  CHECKPOINTS,
  GAME_MODES,
  GATE_CONFIGS,
  MILESTONES,
  PHYSICS,
  TRANSITION_GRAPH,
  WORLD,
  advanceFixedFrames,
  applyGravity,
  applyJump,
  checkAabbCollision,
  classifyBotRelative,
  classifyDistance,
  classifyOpening,
  clientToWorld,
  collectApproachAnnouncements,
  close,
  computeCanvasSize,
  createBot,
  createInitialState,
  createInputNormalizer,
  createLazyGenerationController,
  createLifecycleRegistry,
  createOverlaySession,
  createWonSummary,
  generateGate,
  generateSegment,
  getAchievementForScore,
  getLifecycleSnapshot,
  getStateSnapshot,
  isOpen,
  mechanicsSnapshot,
  open,
  projectHud,
  reduceGameEvent,
  retryFromCheckpoint,
  stepGame,
  toBotHitbox,
  toBugHitbox,
  unlockForScore,
  validateGateConfig,
  validateLevelFairness,
  withReducedMotion,
  worldToClient,
} from '../../game/fc-engine.js';
import {
  botArb,
  checkpointArb,
  modalityArb,
  modeArb,
  positiveDtArb,
  rectArb,
  viewportArb,
  createFakeClock,
  createFakeMediaQueryList,
  makePlayingState,
} from './test-helpers.js';

const configuredSeed = Number(process.env.FC_SEED);
if (process.env.FC_SEED && Number.isInteger(configuredSeed)) {
  fc.configureGlobal({ seed: configuredSeed });
}

const closeTo = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance;
const achievementPrefixFor = (checkpoint) => ACHIEVEMENTS.filter((item) => item.gate <= checkpoint).map((item) => item.id);

const safeGate = (config, localIndex = 0) => ({
  ...generateGate(config, localIndex),
  gapTop: 0,
  gapBottom: WORLD.height,
});

describe('Flappy Cloud physics and geometry properties', () => {
  // Feature: flappy-cloud-game, Property P01: Gravity pulls downward
  it('P01 gravity strictly increases sub-terminal velocity and clamps at terminal velocity', () => {
    fc.assert(fc.property(
      fc.double({ min: PHYSICS.jumpVelocity, max: PHYSICS.terminalVelocity - 1e-6, noNaN: true, noDefaultInfinity: true }),
      positiveDtArb,
      (vy, dt) => {
        const bot = createBot({ vy });
        const next = applyGravity(bot, dt);
        expect(next.vy).toBeGreaterThan(vy);
        expect(next.vy).toBeLessThanOrEqual(PHYSICS.terminalVelocity);
        expect(next.vy).toBeCloseTo(Math.min(PHYSICS.terminalVelocity, vy + PHYSICS.gravity * dt), 10);
        expect(bot.vy).toBe(vy);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P02: Jump normalizes velocity
  it('P02 every jump sets exactly -430 independently of prior velocity', () => {
    fc.assert(fc.property(botArb, (bot) => {
      const once = applyJump(bot);
      const twice = applyJump(once);
      expect(once.vy).toBe(PHYSICS.jumpVelocity);
      expect(twice.vy).toBe(PHYSICS.jumpVelocity);
      expect(bot).not.toBe(once);
      expect({ ...bot, vy: PHYSICS.jumpVelocity }).toEqual(once);
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P03: Terminal velocity is invariant
  it('P03 arbitrary no-jump sequences never exceed and eventually reach terminal velocity', () => {
    fc.assert(fc.property(
      fc.double({ min: PHYSICS.jumpVelocity, max: PHYSICS.terminalVelocity, noNaN: true, noDefaultInfinity: true }),
      fc.array(fc.double({ min: 0.001, max: 0.05, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 100 }),
      (initialVy, dts) => {
        let bot = createBot({ vy: initialVy });
        for (const dt of dts) {
          bot = applyGravity(bot, dt);
          expect(bot.vy).toBeLessThanOrEqual(PHYSICS.terminalVelocity);
        }
        bot = applyGravity(bot, 2);
        expect(bot.vy).toBe(PHYSICS.terminalVelocity);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P04: Vertical boundaries clamp or crash exactly
  it('P04 clamps the top without loss and freezes after a bottom crash', () => {
    fc.assert(fc.property(
      fc.double({ min: -200, max: -4.000001, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 508.000001, max: 700, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 0, max: 10000 }),
      (topY, bottomY, laterMs) => {
        const top = makePlayingState({ bot: createBot({ y: topY, vy: -100 }), gates: [], bugs: [] });
        const clamped = stepGame(top, { dtMs: 0, events: [] });
        expect(clamped.phase).toBe('PLAYING');
        expect(toBotHitbox(clamped.bot).top).toBe(0);
        expect(clamped.bot.vy).toBe(0);

        const bottom = makePlayingState({ bot: createBot({ y: bottomY, vy: 0 }), gates: [], bugs: [] });
        const crashed = stepGame(bottom, { dtMs: 0, events: [] });
        expect(crashed.phase).toBe('CRASHED');
        expect(crashed.lastFailure).toBe('fell-out');
        const frozen = stepGame(crashed, { dtMs: laterMs, events: [{ type: 'JUMP', source: 'keyboard' }] });
        expect(frozen.bot).toEqual(crashed.bot);
        expect(frozen.activePlayMs).toBe(crashed.activePlayMs);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P05: Fixed-step simulation is deterministic
  it('P05 equal fixed steps and event placement are deep-equal across refresh-frame grouping', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 40 }),
      fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
      fc.array(fc.integer({ min: 1, max: PHYSICS.maxCatchUpSteps }), { minLength: 1, maxLength: 40 }),
      (stepCount, flapFlags, chunkHints) => {
        const individual = Array.from({ length: stepCount }, () => PHYSICS.fixedStepMs);
        const grouped = [];
        let remaining = stepCount;
        let hintIndex = 0;
        while (remaining > 0) {
          const count = Math.min(remaining, chunkHints[hintIndex % chunkHints.length]);
          grouped.push(count * PHYSICS.fixedStepMs);
          remaining -= count;
          hintIndex += 1;
        }
        const events = Array.from({ length: stepCount }, (_, index) => flapFlags[index]
          ? [{ type: 'JUMP', source: 'keyboard', id: `step-${index}` }]
          : []);
        const initial = makePlayingState({ gates: [], bugs: [], bot: createBot({ y: 200 }) });
        const one = advanceFixedFrames(initial, individual, events);
        const two = advanceFixedFrames(initial, grouped, events);
        expect(two.simulationStep).toBe(stepCount);
        expect(two.state).toEqual(one.state);
        expect(two.accumulatorMs).toBeCloseTo(one.accumulatorMs, 8);
        expect(initial.bot).toEqual(createBot({ y: 200 }));
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P06: Gate config is canonically complete
  it('P06 accepts the canonical twelve rows and rejects every generated field mutation', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 11 }),
      fc.constantFrom('id', 'ordinal', 'label', 'segmentIndex', 'speed', 'gap', 'gapCenterRatio', 'width'),
      fc.integer({ min: 1, max: 1000 }),
      (index, field, salt) => {
        expect(validateGateConfig(GATE_CONFIGS)).toBe(true);
        const candidate = GATE_CONFIGS.map((gate) => ({ ...gate }));
        const value = candidate[index][field];
        candidate[index][field] = typeof value === 'number' ? value + salt : `${value}-${salt}`;
        expect(validateGateConfig(candidate)).toBe(false);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P07: Generated gate geometry stays valid
  it('P07 every generated gate uses its exact gap within the 30-70 percent band', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 11 }),
      fc.integer({ min: -1000, max: 1000 }),
      (index, cosmeticSeed) => {
        const config = GATE_CONFIGS[index];
        const gate = generateGate(config, index % 3, { cosmeticSeed });
        const center = (gate.gapTop + gate.gapBottom) / 2;
        expect(center / WORLD.height).toBeGreaterThanOrEqual(0.30);
        expect(center / WORLD.height).toBeLessThanOrEqual(0.70);
        expect(gate.gapTop).toBeGreaterThanOrEqual(0);
        expect(gate.gapBottom).toBeLessThanOrEqual(WORLD.height);
        expect(gate.gapBottom - gate.gapTop).toBeCloseTo(config.gap, 10);
        expect(config.gap).toBeGreaterThanOrEqual(200);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P08: Gate lead, cadence, and center spacing are bounded
  it('P08 every segment has 3.2-second lead, 2.35-second cadence, and <=110 center delta', () => {
    fc.assert(fc.property(checkpointArb, (checkpoint) => {
      const { gates } = generateSegment(checkpoint);
      const botLeft = toBotHitbox(createBot()).left;
      const passTimes = gates.map((gate) => (gate.x + gate.width - botLeft) / gate.speed);
      expect(passTimes[0]).toBeCloseTo(3.2, 10);
      expect(passTimes[1] - passTimes[0]).toBeGreaterThanOrEqual(2.25);
      expect(passTimes[1] - passTimes[0]).toBeLessThanOrEqual(2.55);
      expect(passTimes[2] - passTimes[1]).toBeGreaterThanOrEqual(2.25);
      expect(passTimes[2] - passTimes[1]).toBeLessThanOrEqual(2.55);
      for (let index = 1; index < GATE_CONFIGS.length; index += 1) {
        const prior = GATE_CONFIGS[index - 1].gapCenterRatio * WORLD.height;
        const current = GATE_CONFIGS[index].gapCenterRatio * WORLD.height;
        expect(Math.abs(current - prior)).toBeLessThanOrEqual(110);
      }
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P09: Collider generation is deterministic
  it('P09 checkpoint generation is deep-equal and cosmetic seed cannot alter colliders', () => {
    fc.assert(fc.property(
      checkpointArb,
      fc.integer(),
      fc.integer(),
      (checkpoint, seedA, seedB) => {
        expect(generateSegment(checkpoint, { cosmeticSeed: seedA }))
          .toEqual(generateSegment(checkpoint, { cosmeticSeed: seedB }));
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P10: Bug Clouds preserve a safe corridor
  it('P10 bugs only occupy canonical between-gate slots with inset and no gate overlap', () => {
    fc.assert(fc.property(checkpointArb, fc.integer(), (checkpoint, cosmeticSeed) => {
      const segment = generateSegment(checkpoint, { cosmeticSeed });
      expect(validateLevelFairness(segment.gates, segment.bugs)).toBe(true);
      expect(segment.bugs).toHaveLength(1);
      const bug = segment.bugs[0];
      expect([2, 5, 8, 11]).toContain(bug.afterGate);
      expect(bug.hitboxInsetRatio).toBeGreaterThanOrEqual(0.08);
      const hitbox = toBugHitbox(bug);
      expect(hitbox.right - hitbox.left).toBeLessThan(bug.width * 0.84);
      expect(hitbox.bottom - hitbox.top).toBeLessThan(bug.height * 0.84);
      for (const gate of segment.gates) {
        const gateBand = { left: gate.x, top: 0, right: gate.x + gate.width, bottom: WORLD.height };
        const visual = { left: bug.x, top: bug.y, right: bug.x + bug.width, bottom: bug.y + bug.height };
        expect(checkAabbCollision(visual, gateBand)).toBe(false);
      }
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P11: AABB is deterministic and symmetric
  it('P11 collision is symmetric, repeatable, and false for translated separated rectangles', () => {
    fc.assert(fc.property(rectArb, rectArb, (a, b) => {
      const first = checkAabbCollision(a, b);
      expect(checkAabbCollision(b, a)).toBe(first);
      expect(checkAabbCollision(a, b)).toBe(first);
      const separated = { ...b, left: a.right + 1, right: a.right + 1 + (b.right - b.left) };
      expect(checkAabbCollision(a, separated)).toBe(false);
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P12: Edge contact is not an AABB collision
  it('P12 edge and corner touches are safe while every positive-area overlap collides', () => {
    fc.assert(fc.property(
      fc.double({ min: 0.001, max: 500, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.001, max: 500, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1e-6, max: 0.0001, noNaN: true, noDefaultInfinity: true }),
      (width, height, overlap) => {
        const a = { left: 0, top: 0, right: width, bottom: height };
        const edge = { left: width, top: 0, right: width + 10, bottom: height };
        const corner = { left: width, top: height, right: width + 10, bottom: height + 10 };
        const positive = { left: width - overlap, top: height - overlap, right: width + 10, bottom: height + 10 };
        expect(checkAabbCollision(a, edge)).toBe(false);
        expect(checkAabbCollision(a, corner)).toBe(false);
        expect(checkAabbCollision(a, positive)).toBe(true);
      },
    ), { numRuns: 150 });
  });
});

describe('Flappy Cloud score, checkpoint, and time properties', () => {
  // Feature: flappy-cloud-game, Property P13: Collision has priority over scoring
  it('P13 a passed gate never scores when any collision occurs in the same step', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 11 }),
      fc.constantFrom('gate', 'bug'),
      (score, collisionType) => {
        const bot = createBot();
        const hitbox = toBotHitbox(bot);
        const passed = { ...safeGate(GATE_CONFIGS[Math.min(score, 11)]), x: hitbox.left - PHYSICS.gateWidth - 1 };
        const collidingGate = {
          ...generateGate(GATE_CONFIGS[(Math.min(score, 10) + 1) % 12]),
          x: hitbox.left + 1,
          gapTop: hitbox.top + 1,
          gapBottom: WORLD.height,
        };
        const collidingBug = {
          id: 'test-bug', afterGate: 2, label: 'BUG', x: hitbox.left - 10, y: hitbox.top - 10,
          width: 60, height: 50, speed: 0, hitboxInsetRatio: 0.08,
        };
        const state = makePlayingState({
          gateScore: score,
          gates: collisionType === 'gate' ? [passed, collidingGate] : [passed],
          bugs: collisionType === 'bug' ? [collidingBug] : [],
          bot,
        });
        const next = stepGame(state, { dtMs: 0, events: [] });
        expect(next.phase).toBe('CRASHED');
        expect(next.gateScore).toBe(score);
        expect(next.gates[0].scored).toBe(false);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P14: Score is monotonic during an attempt
  it('P14 score never decreases, increases only by newly passed gates, and never exceeds twelve', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1 }), { minLength: 0, maxLength: 30 }), (passes) => {
      const botLeft = toBotHitbox(createBot()).left;
      let state = makePlayingState({
        gates: [safeGate(GATE_CONFIGS[0], 0), safeGate(GATE_CONFIGS[1], 1)],
        bugs: [],
      });
      for (const selected of passes) {
        if (selected < state.gates.length) {
          state = {
            ...state,
            gates: state.gates.map((gate, index) => index === selected
              ? { ...gate, x: botLeft - gate.width - 1 }
              : gate),
          };
        }
        const beforeScore = state.gateScore;
        const beforeScored = state.gates.filter((gate) => gate.scored).length;
        const next = stepGame(state, { dtMs: 0, events: [] });
        const newlyScored = next.gates.filter((gate) => gate.scored).length - beforeScored;
        expect(next.gateScore).toBeGreaterThanOrEqual(beforeScore);
        expect(next.gateScore - beforeScore).toBeLessThanOrEqual(Math.max(0, newlyScored));
        expect(next.gateScore).toBeLessThanOrEqual(12);
        state = next;
      }
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P15: A gate scores at most once
  it('P15 a scored gate remains idempotent through arbitrary repeated steps', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 12 }),
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 50 }),
      (score, dts) => {
        const botLeft = toBotHitbox(createBot()).left;
        let state = makePlayingState({
          gateScore: score,
          gates: [{ ...safeGate(GATE_CONFIGS[0]), x: botLeft - PHYSICS.gateWidth - 20, scored: true }],
          bugs: [],
        });
        for (const dtMs of dts) state = stepGame(state, { dtMs, events: [] });
        expect(state.gateScore).toBe(score);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P16: Only gate passes produce score
  it('P16 jump, time, Bug passage, pause, and status events cannot change score', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 11 }),
      fc.array(fc.constantFrom('JUMP', 'PAUSE', 'STATUS_REQUEST', 'REDUCED_MOTION_CHANGED'), { minLength: 0, maxLength: 30 }),
      fc.integer({ min: 0, max: 1000 }),
      (score, eventTypes, dtMs) => {
        let state = makePlayingState({
          gateScore: score,
          gates: [],
          bugs: [{ id: 'passed-bug', afterGate: 2, label: 'BUG', x: -100, y: 0, width: 20, height: 20, speed: 10, hitboxInsetRatio: 0.1 }],
        });
        for (const type of eventTypes) {
          state = stepGame(state, {
            dtMs,
            events: [{ type, source: 'keyboard', value: true }],
          });
        }
        expect(state.gateScore).toBe(score);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P17: Checkpoints are valid and monotonic
  it('P17 checkpoints stay in 0/3/6/9, never decrease, and gate 12 is not a checkpoint', () => {
    fc.assert(fc.property(
      fc.subarray(MILESTONES, { minLength: 0, maxLength: 4 }),
      (milestones) => {
        let state = makePlayingState();
        let prior = 0;
        for (const score of [...milestones].sort((a, b) => a - b)) {
          state = unlockForScore({ ...state, gateScore: score }, score);
          expect(CHECKPOINTS).toContain(state.checkpoint);
          expect(state.checkpoint).toBeGreaterThanOrEqual(prior);
          if (score === 12) expect(state.checkpoint).not.toBe(12);
          prior = state.checkpoint;
        }
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P18: Retry restores the deterministic checkpoint segment
  it('P18 retry resets Bot, score, and segment while preserving time and achievement prefix', () => {
    fc.assert(fc.property(
      checkpointArb,
      fc.integer({ min: 0, max: 2 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 0, max: 100 }),
      (checkpoint, offset, activePlayMs, attempt) => {
        const failed = {
          ...makePlayingState({ checkpoint, gateScore: Math.min(11, checkpoint + offset), activePlayMs, attempt }),
          phase: 'CRASHED',
          unlockedAchievementIds: achievementPrefixFor(checkpoint),
          lastFailure: 'gate',
        };
        const retry = retryFromCheckpoint(failed);
        expect(retry.phase).toBe('READY');
        expect(retry.gateScore).toBe(checkpoint);
        expect(retry.checkpoint).toBe(checkpoint);
        expect(retry.bot).toEqual(createBot());
        expect(retry.gates.map((gate) => gate.ordinal)).toEqual([checkpoint + 1, checkpoint + 2, checkpoint + 3]);
        expect(retry.unlockedAchievementIds).toEqual(achievementPrefixFor(checkpoint));
        expect(retry.activePlayMs).toBe(activePlayMs);
        expect(retry.attempt).toBe(attempt + 1);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P19: Active time accrues only in PLAYING
  it('P19 total time increases exactly by dt for steps beginning and remaining PLAYING', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        phase: fc.constantFrom('PLAYING', 'READY', 'PAUSED', 'ACHIEVEMENT', 'CRASHED', 'WON', 'INTRO'),
        dtMs: fc.integer({ min: 0, max: 20 }),
      }), { minLength: 0, maxLength: 100 }),
      (timeline) => {
        let state = makePlayingState({ gates: [], bugs: [], activePlayMs: 0 });
        let expected = 0;
        for (const item of timeline) {
          state = { ...state, phase: item.phase, bot: createBot() };
          state = stepGame(state, { dtMs: item.dtMs, events: [] });
          if (item.phase === 'PLAYING') expected += item.dtMs;
        }
        expect(state.activePlayMs).toBe(expected);
        const failed = { ...state, phase: 'CRASHED' };
        expect(retryFromCheckpoint(failed).activePlayMs).toBe(expected);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P20: No Timer changes projection only
  it('P20 Standard and No Timer produce identical mechanics for identical input', () => {
    fc.assert(fc.property(
      fc.array(fc.boolean(), { minLength: 0, maxLength: 30 }),
      fc.integer({ min: 0, max: 20 }),
      (flaps, dtMs) => {
        let standard = makePlayingState({ mode: GAME_MODES.STANDARD, gates: [], bugs: [] });
        let noTimer = { ...standard, mode: GAME_MODES.NO_TIMER };
        for (const flap of flaps) {
          const events = flap ? [{ type: 'JUMP', source: 'keyboard' }] : [];
          standard = stepGame(standard, { dtMs, events });
          noTimer = stepGame(noTimer, { dtMs, events });
        }
        expect(mechanicsSnapshot(noTimer)).toEqual(mechanicsSnapshot(standard));
        expect(projectHud(standard).showElapsed).toBe(standard.phase !== 'CRASHED');
        expect(projectHud(noTimer).showElapsed).toBe(false);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P21: Score and spawn terminate at twelve
  it('P21 gate twelve enters WON and later gameplay events cannot add score or entities', () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom('JUMP', 'PAUSE', 'STATUS_REQUEST'), { minLength: 0, maxLength: 30 }),
      fc.integer({ min: 0, max: 1000 }),
      (eventTypes, dtMs) => {
        const botLeft = toBotHitbox(createBot()).left;
        const gate12 = { ...safeGate(GATE_CONFIGS[11], 2), x: botLeft - PHYSICS.gateWidth - 1 };
        let state = makePlayingState({
          checkpoint: 9,
          gateScore: 11,
          gates: [gate12],
          bugs: [],
          unlockedAchievementIds: CANONICAL_ACHIEVEMENT_IDS.slice(0, 3),
        });
        state = stepGame(state, { dtMs: 0, events: [] });
        expect(state.phase).toBe('WON');
        expect(state.gateScore).toBe(12);
        const entityIds = [...state.gates, ...state.bugs].map((item) => item.id);
        for (const type of eventTypes) state = stepGame(state, { dtMs, events: [{ type, source: 'keyboard' }] });
        expect(state.phase).toBe('WON');
        expect(state.gateScore).toBe(12);
        expect([...state.gates, ...state.bugs].map((item) => item.id)).toEqual(entityIds);
      },
    ), { numRuns: 150 });
  });
});

describe('Flappy Cloud achievement and state-machine properties', () => {
  // Feature: flappy-cloud-game, Property P22: Milestone mapping is exact
  it('P22 only 3/6/9/12 map to the four canonical achievements', () => {
    fc.assert(fc.property(fc.integer({ min: -100, max: 100 }), (score) => {
      const achievement = getAchievementForScore(score);
      const index = MILESTONES.indexOf(score);
      if (index === -1) expect(achievement).toBeNull();
      else expect(achievement).toBe(ACHIEVEMENTS[index]);
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P23: Achievement unlock is ordered and idempotent
  it('P23 arbitrary milestone/retry sequences always retain a unique canonical prefix', () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom(3, 6, 9, 12), { minLength: 0, maxLength: 50 }),
      (scores) => {
        let state = makePlayingState();
        for (const score of scores) {
          state = unlockForScore({ ...state, gateScore: score }, score);
          const ids = state.unlockedAchievementIds;
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids).toEqual(CANONICAL_ACHIEVEMENT_IDS.slice(0, ids.length));
          const again = unlockForScore(state, score);
          expect(again).toBe(state);
        }
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P24: Achievement phase freezes gameplay
  it('P24 milestones 3/6/9 freeze physics, score, and active time until Continue', () => {
    fc.assert(fc.property(
      fc.constantFrom(3, 6, 9),
      fc.array(fc.record({ dtMs: fc.integer({ min: 0, max: 5000 }), jump: fc.boolean() }), { minLength: 0, maxLength: 30 }),
      (milestone, frames) => {
        let state = {
          ...makePlayingState({ checkpoint: milestone, gateScore: milestone, activePlayMs: 1234 }),
          phase: 'ACHIEVEMENT',
          unlockedAchievementIds: achievementPrefixFor(milestone),
        };
        const before = mechanicsSnapshot(state);
        for (const frame of frames) {
          state = stepGame(state, {
            dtMs: frame.dtMs,
            events: frame.jump ? [{ type: 'JUMP', source: 'keyboard' }] : [],
          });
        }
        expect(state.phase).toBe('ACHIEVEMENT');
        expect(mechanicsSnapshot(state)).toEqual(before);
        expect(reduceGameEvent(state, { type: 'CONTINUE' }).phase).toBe('READY');
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P25: Achievements never auto-advance
  it('P25 every elapsed sequence without Continue remains ACHIEVEMENT beyond three seconds', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 0, max: 30000 }), { minLength: 1, maxLength: 50 }),
      (elapsed) => {
        let state = {
          ...makePlayingState({ checkpoint: 3, gateScore: 3, activePlayMs: 999 }),
          phase: 'ACHIEVEMENT',
          unlockedAchievementIds: ['code-crafter'],
        };
        for (const dtMs of elapsed) state = stepGame(state, { dtMs, events: [] });
        expect(state.phase).toBe('ACHIEVEMENT');
        expect(state.activePlayMs).toBe(999);
        expect(state.achievementEffectElapsedMs).toBe(elapsed.reduce((sum, value) => sum + value, 0));
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P26: Gate twelve commits directly to WON
  it('P26 final pass atomically commits the fourth fact and a complete WON summary', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000_000 }), modeArb, (activePlayMs, mode) => {
      const botLeft = toBotHitbox(createBot()).left;
      const gate12 = { ...safeGate(GATE_CONFIGS[11], 2), x: botLeft - PHYSICS.gateWidth - 1 };
      const state = makePlayingState({
        mode,
        checkpoint: 9,
        gateScore: 11,
        gates: [gate12],
        bugs: [],
        activePlayMs,
        unlockedAchievementIds: CANONICAL_ACHIEVEMENT_IDS.slice(0, 3),
      });
      const won = stepGame(state, { dtMs: 0, events: [] });
      expect(won.phase).toBe('WON');
      expect(won.unlockedAchievementIds).toEqual(CANONICAL_ACHIEVEMENT_IDS);
      const summary = createWonSummary(won);
      expect(summary.achievements.map((item) => item.funFact)).toEqual(ACHIEVEMENTS.map((item) => item.funFact));
      expect(summary.score).toBe('12/12');
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P27: Reducer only follows legal graph edges
  it('P27 arbitrary events can only produce a declared state-graph edge', () => {
    const eventArb = fc.oneof(
      fc.constantFrom(
        { type: 'ACTIVATE' }, { type: 'SUPPORTED' }, { type: 'UNSUPPORTED' },
        { type: 'LOAD_SUCCESS' }, { type: 'LOAD_FAILURE' }, { type: 'LOAD_TIMEOUT' },
        { type: 'RETRY_LOAD' }, { type: 'START' }, { type: 'VIEW_FACTS' },
        { type: 'BACK_FACTS' }, { type: 'JUMP', source: 'keyboard' }, { type: 'PAUSE' },
        { type: 'VISIBILITY_HIDDEN' }, { type: 'VISIBILITY_VISIBLE' },
        { type: 'VIEWPORT_CHANGED' }, { type: 'RESIZE_COMPLETE' }, { type: 'RESUME' },
        { type: 'RETRY' }, { type: 'CONTINUE' }, { type: 'PLAY_AGAIN' },
        { type: 'RUNTIME_ERROR' }, { type: 'CLOSE' }, { type: 'TEARDOWN_COMPLETE' },
      ),
      fc.record({ type: fc.constant('READY_TICK'), dtMs: fc.integer({ min: 0, max: 2000 }) }),
      fc.record({ type: fc.constant('REDUCED_MOTION_CHANGED'), value: fc.boolean() }),
      fc.record({ type: fc.constant('UNKNOWN'), value: fc.anything() }),
    );
    fc.assert(fc.property(fc.array(eventArb, { minLength: 0, maxLength: 100 }), (events) => {
      let state = { ...createInitialState(), phase: 'DORMANT' };
      for (const event of events) {
        const before = state;
        state = reduceGameEvent(state, event);
        if (state.phase !== before.phase) {
          expect(TRANSITION_GRAPH[before.phase]).toContain(state.phase);
        }
      }
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P28: Pause freezes all gameplay data
  it('P28 arbitrary gameplay frames and non-resume inputs cannot mutate paused mechanics', () => {
    fc.assert(fc.property(
      botArb,
      fc.array(fc.oneof(
        fc.record({ type: fc.constant('JUMP'), source: modalityArb }),
        fc.constant({ type: 'STATUS_REQUEST' }),
        fc.constant({ type: 'VISIBILITY_VISIBLE' }),
        fc.constant({ type: 'RESIZE_COMPLETE' }),
      ), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 0, max: 10000 }),
      (bot, events, dtMs) => {
        const state = { ...makePlayingState({ bot }), phase: 'PAUSED' };
        const next = stepGame(state, { dtMs, events });
        expect(next.phase).toBe('PAUSED');
        expect(mechanicsSnapshot(next)).toEqual(mechanicsSnapshot(state));
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P29: Visibility and resize never auto-resume
  it('P29 only explicit Resume can move a visible PAUSED state into READY', () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom('VISIBILITY_VISIBLE', 'RESIZE_COMPLETE', 'READY_TICK', 'JUMP'), { minLength: 0, maxLength: 50 }),
      (types) => {
        let state = { ...makePlayingState(), phase: 'PAUSED', documentVisible: false };
        for (const type of types) state = reduceGameEvent(state, { type, dtMs: 1000, source: 'keyboard' });
        expect(state.phase).toBe('PAUSED');
        state = reduceGameEvent(state, { type: 'VISIBILITY_VISIBLE' });
        expect(state.phase).toBe('PAUSED');
        expect(reduceGameEvent(state, { type: 'RESUME' }).phase).toBe('READY');
      },
    ), { numRuns: 150 });
  });
});

describe('Flappy Cloud input, responsive, and status properties', () => {
  // Feature: flappy-cloud-game, Property P30: One valid activation produces one jump
  it('P30 valid Space/click/primary pointer activations map to one JUMP and invalid ones to none', () => {
    fc.assert(fc.property(
      fc.constantFrom('space', 'click', 'pointer'),
      fc.boolean(),
      fc.constantFrom('READY', 'PLAYING', 'PAUSED', 'INTRO'),
      (kind, structurallyValid, phase) => {
        const normalizer = createInputNormalizer();
        let raw;
        if (kind === 'space') raw = { type: 'keydown', code: 'Space', repeat: !structurallyValid };
        if (kind === 'click') raw = { type: 'click', button: structurallyValid ? 0 : 2 };
        if (kind === 'pointer') raw = {
          type: 'pointerdown', pointerId: 7, pointerType: 'touch',
          button: structurallyValid ? 0 : 2, isPrimary: structurallyValid,
        };
        const event = normalizer.normalize(raw, phase, { targetIsControl: false });
        const shouldJump = structurallyValid && (phase === 'READY' || phase === 'PLAYING');
        expect(event?.type === 'JUMP').toBe(shouldJump);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P31: Input dedup rejects repeats and synthetic pairs
  it('P31 key repeat, repeated pointer id, synthetic click, secondary and non-primary touch add no jumps', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 1, max: 30 }),
      (pointerId, repeats) => {
        const normalizer = createInputNormalizer();
        const results = [];
        results.push(normalizer.normalize({ type: 'keydown', code: 'Space', repeat: false }, 'PLAYING', { targetIsControl: false }));
        for (let index = 0; index < repeats; index += 1) {
          results.push(normalizer.normalize({ type: 'keydown', code: 'Space', repeat: true }, 'PLAYING', { targetIsControl: false }));
        }
        results.push(normalizer.normalize({ type: 'pointerdown', pointerId, pointerType: 'touch', button: 0, isPrimary: true }, 'PLAYING', { targetIsControl: false }));
        for (let index = 0; index < repeats; index += 1) {
          results.push(normalizer.normalize({ type: 'pointerdown', pointerId, pointerType: 'touch', button: 0, isPrimary: true }, 'PLAYING', { targetIsControl: false }));
        }
        results.push(normalizer.normalize({ type: 'click', button: 0 }, 'PLAYING', { targetIsControl: false }));
        results.push(normalizer.normalize({ type: 'pointerdown', pointerId: pointerId + 1, pointerType: 'touch', button: 2, isPrimary: true }, 'PLAYING', { targetIsControl: false }));
        results.push(normalizer.normalize({ type: 'pointerdown', pointerId: pointerId + 2, pointerType: 'touch', button: 0, isPrimary: false }, 'PLAYING', { targetIsControl: false }));
        expect(results.filter((event) => event?.type === 'JUMP')).toHaveLength(2);
        normalizer.normalize({ type: 'pointerup', pointerId }, 'PLAYING');
        expect(normalizer.normalize({ type: 'pointerdown', pointerId, pointerType: 'touch', button: 0, isPrimary: true }, 'PLAYING', { targetIsControl: false })?.type).toBe('JUMP');

        const fallback = createInputNormalizer();
        const touchSequence = [
          fallback.normalize({ type: 'touchstart', touches: [{}] }, 'PLAYING', { targetIsControl: false }),
          fallback.normalize({ type: 'pointerdown', pointerId, pointerType: 'touch', button: 0, isPrimary: true }, 'PLAYING', { targetIsControl: false }),
          fallback.normalize({ type: 'click', button: 0 }, 'PLAYING', { targetIsControl: false }),
        ];
        expect(touchSequence.filter((event) => event?.type === 'JUMP')).toHaveLength(1);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P32: Canvas contain ratio and DPR are bounded
  it('P32 every supported viewport fits, stays 16:9, and clamps backing DPR to 1-2', () => {
    fc.assert(fc.property(viewportArb, ({ width, height, dpr }) => {
      const size = computeCanvasSize(width, height, dpr);
      expect(size.cssWidth).toBeLessThanOrEqual(width + 1e-9);
      expect(size.cssHeight).toBeLessThanOrEqual(height + 1e-9);
      expect(Math.abs(size.cssWidth / size.cssHeight - 16 / 9) / (16 / 9)).toBeLessThanOrEqual(0.01);
      expect(size.pixelRatio).toBeGreaterThanOrEqual(1);
      expect(size.pixelRatio).toBeLessThanOrEqual(2);
      expect(size.backingWidth).toBeGreaterThan(0);
      expect(size.backingHeight).toBeGreaterThan(0);
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P33: Pointer coordinate mapping round-trips
  it('P33 every world point round-trips through an arbitrary valid Canvas rect within one unit', () => {
    fc.assert(fc.property(
      fc.record({
        x: fc.double({ min: 0, max: WORLD.width, noNaN: true, noDefaultInfinity: true }),
        y: fc.double({ min: 0, max: WORLD.height, noNaN: true, noDefaultInfinity: true }),
      }),
      fc.record({
        left: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        top: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        width: fc.double({ min: 1, max: 2000, noNaN: true, noDefaultInfinity: true }),
        height: fc.double({ min: 1, max: 2000, noNaN: true, noDefaultInfinity: true }),
      }),
      (point, rect) => {
        const result = clientToWorld(worldToClient(point, rect), rect);
        expect(Math.abs(result.x - point.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.y - point.y)).toBeLessThanOrEqual(1);
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P34: Reduced Motion does not alter mechanics
  it('P34 toggling Reduced Motion changes effect projection only, including after a physics step', () => {
    fc.assert(fc.property(
      botArb.filter((bot) => bot.y >= 50 && bot.y <= 400),
      fc.integer({ min: 0, max: 20 }),
      fc.boolean(),
      (bot, dtMs, jump) => {
        const baseline = makePlayingState({ bot, gates: [], bugs: [], reducedMotion: false });
        const reduced = withReducedMotion(baseline, true);
        expect(mechanicsSnapshot(reduced)).toEqual(mechanicsSnapshot(baseline));
        const events = jump ? [{ type: 'JUMP', source: 'keyboard' }] : [];
        const baselineNext = stepGame(baseline, { dtMs, events });
        const reducedNext = stepGame(reduced, { dtMs, events });
        expect(mechanicsSnapshot(reducedNext)).toEqual(mechanicsSnapshot(baselineNext));
        expect(reducedNext.effectLevel).toBe('reduced');
      },
    ), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P35: Spatial status boundaries and approach dedup are exact
  it('P35 classifies opening/relative/distance boundaries and announces each approach once', () => {
    fc.assert(fc.property(
      fc.double({ min: 0.30, max: 0.70, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: WORLD.height, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 3, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 0, max: 11 }),
      (centerRatio, botCenter, timeToPass, gateIndex) => {
        const opening = classifyOpening(centerRatio * WORLD.height - 100, centerRatio * WORLD.height + 100);
        expect(opening).toBe(centerRatio < 0.43 ? 'high' : centerRatio > 0.57 ? 'low' : 'middle');
        const relative = classifyBotRelative(botCenter, 200, 300);
        expect(relative).toBe(botCenter < 200 ? 'above' : botCenter > 300 ? 'below' : 'inside');
        expect(classifyDistance(timeToPass)).toBe(timeToPass <= 1.5 ? 'near' : 'far');

        const config = GATE_CONFIGS[gateIndex];
        const bot = createBot();
        const botLeft = toBotHitbox(bot).left;
        const gate = {
          ...generateGate(config, gateIndex % 3),
          x: botLeft + config.speed - config.width,
          gapTop: centerRatio * WORLD.height - 100,
          gapBottom: centerRatio * WORLD.height + 100,
        };
        const state = makePlayingState({ bot, gates: [gate], bugs: [] });
        const first = collectApproachAnnouncements(state);
        expect(first.announcements).toHaveLength(1);
        expect(first.announcements[0].opening).toBe(opening);
        const second = collectApproachAnnouncements(first.state);
        expect(second.announcements).toHaveLength(0);
      },
    ), { numRuns: 150 });
  });
});

describe('Flappy Cloud loader and lifecycle properties', () => {
  // Feature: flappy-cloud-game, Property P36: Lazy generation safety
  it('P36 only the active load generation can mount and unsupported pre-activation never requests resources', () => {
    const operationArb = fc.array(fc.constantFrom(
      'activate', 'unsupported', 'retry', 'settle-current', 'settle-stale', 'reject-current', 'expire', 'close',
    ), { minLength: 1, maxLength: 80 });
    fc.assert(fc.property(operationArb, (operations) => {
      const controller = createLazyGenerationController();
      const issued = [];
      let successfulMountsSinceClose = 0;
      expect(controller.snapshot().requestAttempts).toBe(0);

      for (const operation of operations) {
        const before = controller.snapshot();
        if (operation === 'activate') {
          const token = controller.activate({ supported: true });
          if (token !== null) issued.push(token);
        } else if (operation === 'unsupported') {
          const requests = controller.snapshot().requestAttempts;
          expect(controller.activate({ supported: false })).toBeNull();
          expect(controller.snapshot().requestAttempts).toBe(requests);
        } else if (operation === 'retry') {
          issued.push(controller.retry());
        } else if (operation === 'settle-current') {
          const token = controller.snapshot().activeToken;
          if (token !== null && controller.settle(token, true)) successfulMountsSinceClose += 1;
        } else if (operation === 'settle-stale') {
          const stale = issued.find((token) => token !== controller.snapshot().activeToken) ?? -1;
          expect(controller.settle(stale, true)).toBe(false);
        } else if (operation === 'reject-current') {
          const token = controller.snapshot().activeToken;
          if (token !== null) expect(controller.settle(token, false)).toBe(false);
        } else if (operation === 'expire') {
          const token = controller.snapshot().activeToken;
          if (token !== null) controller.expire(token);
        } else if (operation === 'close') {
          controller.close();
          successfulMountsSinceClose = 0;
        }
        const after = controller.snapshot();
        expect(Number(after.overlayMounted)).toBeLessThanOrEqual(1);
        expect(successfulMountsSinceClose).toBeLessThanOrEqual(1);
        if (after.overlayMounted) expect(after.activeToken === null || after.generation >= after.activeToken).toBe(true);
        expect(after.generation).toBeGreaterThanOrEqual(before.generation);
      }
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P37: Atomic teardown
  it('P37 arbitrary mounted open, input, pause, error, close, and reopen sequences end with zero resources', () => {
    const operationArb = fc.array(fc.constantFrom(
      'open', 'frame', 'jump', 'pause', 'runtime-error', 'close', 'reopen',
    ), { minLength: 1, maxLength: 18 });
    fc.assert(fc.property(operationArb, (operations) => {
      close('p37-reset');
      document.body.innerHTML = '<button id="p37-trigger">Play</button><main id="p37-portfolio"></main><div id="cloud-rescue-root" hidden></div>';
      const root = document.getElementById('cloud-rescue-root');
      const trigger = document.getElementById('p37-trigger');
      const clock = createFakeClock();
      const media = createFakeMediaQueryList(false);
      const sessions = [];
      let throwOnRender = false;
      const env = {
        now: clock.now,
        requestFrame: clock.requestAnimationFrame,
        cancelFrame: clock.cancelAnimationFrame,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        matchMedia: () => media,
        createResizeObserver: () => null,
        devicePixelRatio: 1,
        innerWidth: 960,
        innerHeight: 540,
      };
      const renderer = () => {
        if (throwOnRender) {
          throwOnRender = false;
          throw new Error('P37 injected runtime failure');
        }
        return { rendered: true };
      };
      const mount = () => {
        if (isOpen()) return;
        trigger.focus();
        const overlaySession = createOverlaySession({ root, trigger });
        sessions.push(overlaySession);
        open({ root, trigger, state: makePlayingState(), env, overlaySession, renderer });
      };

      try {
        mount();
        for (const operation of operations) {
          if (operation === 'open') mount();
          else if (operation === 'frame' && isOpen()) clock.flushFrame(PHYSICS.fixedStepMs);
          else if (operation === 'jump' && isOpen()) {
            root.querySelector('[data-flight-surface]')?.dispatchEvent(new KeyboardEvent('keydown', {
              key: ' ', code: 'Space', bubbles: true, cancelable: true,
            }));
            clock.flushFrame(PHYSICS.fixedStepMs);
          } else if (operation === 'pause' && isOpen()) {
            root.querySelector('.cr-overlay')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          } else if (operation === 'runtime-error') {
            if (isOpen() && getStateSnapshot()?.phase !== 'PLAYING') close('p37-error-remount');
            mount();
            throwOnRender = true;
            clock.flushFrame(PHYSICS.fixedStepMs);
            expect(getStateSnapshot()?.phase).toBe('RUNTIME_ERROR');
          } else if (operation === 'close') close('p37-command');
          else if (operation === 'reopen') {
            close('p37-reopen');
            mount();
          }
          expect(document.querySelectorAll('#cloud-rescue-root')).toHaveLength(1);
          if (!isOpen()) {
            expect(root.hidden).toBe(true);
            expect(root.children).toHaveLength(0);
            expect(getLifecycleSnapshot()).toMatchObject({
              loops: 0, timers: 0, observers: 0, gameOwnedListeners: 0,
              mediaListeners: 0, pointerCaptures: 0,
            });
          }
        }
      } finally {
        close('p37-final');
      }
      expect(close('p37-idempotent')).toBe(false);
      expect(root.hidden).toBe(true);
      expect(root.children).toHaveLength(0);
      expect(clock.frames.size).toBe(0);
      expect(clock.timers.size).toBe(0);
      expect(sessions.every((session) => session.restoreCount === 1)).toBe(true);
      expect(getLifecycleSnapshot()).toMatchObject({
        loops: 0, timers: 0, observers: 0, gameOwnedListeners: 0,
        mediaListeners: 0, pointerCaptures: 0, tornDown: true,
      });
    }), { numRuns: 150 });
  });

  // Feature: flappy-cloud-game, Property P38: Portfolio preservation
  it('P38 overlay lifecycle and error-back commands restore generated portfolio snapshots exactly once', () => {
    fc.assert(fc.property(
      fc.record({
        theme: fc.stringMatching(/^[a-z]{1,12}$/),
        formValue: fc.string({ maxLength: 40 }),
        chatValue: fc.string({ maxLength: 40 }),
        navigationValue: fc.string({ maxLength: 30 }),
        scrollX: fc.integer({ min: 0, max: 2000 }),
        scrollY: fc.integer({ min: 0, max: 5000 }),
        transferred: fc.boolean(),
      }),
      (sample) => {
        document.body.innerHTML = `<button id="fc-property-trigger">Play</button>
          <main id="fc-property-portfolio" aria-hidden="false">
            <input id="fc-property-form"><div id="fc-property-chat"></div><a id="fc-property-nav" href="#contact">Contact</a>
          </main><div id="cloud-rescue-root" hidden></div>`;
        document.body.className = `portfolio ${sample.theme}`;
        document.body.style.setProperty('--portfolio-theme', sample.theme);
        const trigger = document.getElementById('fc-property-trigger');
        const portfolio = document.getElementById('fc-property-portfolio');
        const input = document.getElementById('fc-property-form');
        const chat = document.getElementById('fc-property-chat');
        const navigation = document.getElementById('fc-property-nav');
        const root = document.getElementById('cloud-rescue-root');
        input.value = sample.formValue;
        chat.dataset.history = sample.chatValue;
        navigation.dataset.state = sample.navigationValue;
        trigger.focus();
        let restoredScroll = null;
        const windowAdapter = {
          scrollX: sample.scrollX,
          scrollY: sample.scrollY,
          scrollTo(x, y) { restoredScroll = [x, y]; },
        };
        const before = {
          bodyClass: document.body.className,
          bodyStyle: document.body.getAttribute('style'),
          form: input.value,
          chat: chat.dataset.history,
          navigation: navigation.dataset.state,
          ariaHidden: portfolio.getAttribute('aria-hidden'),
        };
        const session = createOverlaySession({ root, trigger, document, window: windowAdapter });
        const requester = sample.transferred && session.transferToEngine() ? 'engine' : 'bootstrap';
        expect(session.restore(requester)).toBe(true);
        expect(session.restore(requester)).toBe(false);
        expect(session.restoreCount).toBe(1);
        expect({
          bodyClass: document.body.className,
          bodyStyle: document.body.getAttribute('style'),
          form: input.value,
          chat: chat.dataset.history,
          navigation: navigation.dataset.state,
          ariaHidden: portfolio.getAttribute('aria-hidden'),
        }).toEqual(before);
        expect(restoredScroll).toEqual([sample.scrollX, sample.scrollY]);
        expect(document.activeElement).toBe(trigger);
      },
    ), { numRuns: 150 });
  });
});
