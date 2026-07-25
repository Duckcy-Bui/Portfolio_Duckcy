/*
 * Deploy Before Dawn: Cloud Rescue — deterministic core engine.
 *
 * This module deliberately performs no DOM, timer, animation-frame, storage, or
 * network work at import time. Browser integration is exposed only through
 * explicit factories and open(); pure helpers never read ambient browser state.
 */

/** @typedef {'STANDARD' | 'NO_TIMER'} GameMode */
/** @typedef {'DORMANT'|'CAPABILITY_CHECK'|'LOADING'|'UNAVAILABLE'|'INTRO'|'ACCESSIBLE_FACTS'|'READY'|'PLAYING'|'PAUSED'|'CRASHED'|'ACHIEVEMENT'|'WON'|'LOAD_ERROR'|'RUNTIME_ERROR'|'CLOSING'} Phase */
/** @typedef {{x:number,y:number,width:number,height:number,vy:number,hitboxInset:number,tilt:number}} DeploymentBot */
/** @typedef {{id:string,ordinal:number,label:string,segmentIndex:number,x:number,width:number,speed:number,gapTop:number,gapBottom:number,scored:boolean,approachAnnounced:boolean}} PipelineGate */
/** @typedef {{id:string,afterGate:number,label:string,x:number,y:number,width:number,height:number,speed:number,hitboxInsetRatio:number}} BugCloud */
/** @typedef {{id:string,gate:number,title:string,funFact:string}} AchievementConfig */
/** @typedef {{left:number,top:number,right:number,bottom:number}} Rect */
/** @typedef {{type:string,[key:string]:unknown}} CoreEvent */
/** @typedef {{dtMs:number,events?:CoreEvent[]}} Frame */

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const nonNegative = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const WORLD = deepFreeze({ width: 960, height: 540 });
export const PHYSICS = deepFreeze({
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
  safetyMargin: 18,
});

export const GAME_MODES = deepFreeze({ STANDARD: 'STANDARD', NO_TIMER: 'NO_TIMER' });
export const CHECKPOINTS = deepFreeze([0, 3, 6, 9]);
export const MILESTONES = deepFreeze([3, 6, 9, 12]);
export const CANONICAL_ACHIEVEMENT_IDS = deepFreeze([
  'code-crafter',
  'pipeline-pilot',
  'aws-community-builder',
  'midnight-bug-hunter',
]);

const gateRows = [
  [1, 'LINT', 0, 185, 230, 0.52],
  [2, 'TEST', 0, 185, 230, 0.42],
  [3, 'MERGE', 0, 185, 230, 0.57],
  [4, 'BUILD', 1, 195, 220, 0.46],
  [5, 'SCAN', 1, 195, 220, 0.62],
  [6, 'DEPLOY', 1, 195, 220, 0.50],
  [7, 'IaC', 2, 205, 210, 0.36],
  [8, 'OBSERVE', 2, 205, 210, 0.52],
  [9, 'SCALE', 2, 205, 210, 0.66],
  [10, 'LOGS', 3, 215, 200, 0.48],
  [11, 'HOTFIX', 3, 215, 200, 0.35],
  [12, 'ROLLBACK', 3, 215, 200, 0.55],
];

export const GATE_CONFIGS = deepFreeze(gateRows.map(
  ([ordinal, label, segmentIndex, speed, gap, gapCenterRatio]) => ({
    id: `gate-${ordinal}`,
    ordinal,
    label,
    segmentIndex,
    speed,
    gap,
    gapCenterRatio,
    width: PHYSICS.gateWidth,
  }),
));

export const BUG_CONFIGS = deepFreeze([
  { id: 'bug-2', afterGate: 2, label: 'BUG', segmentIndex: 0, y: 20, width: 96, height: 64, hitboxInsetRatio: 0.10 },
  { id: 'bug-5', afterGate: 5, label: '5XX', segmentIndex: 1, y: 456, width: 96, height: 64, hitboxInsetRatio: 0.10 },
  { id: 'bug-8', afterGate: 8, label: 'DRIFT', segmentIndex: 2, y: 20, width: 96, height: 64, hitboxInsetRatio: 0.10 },
  { id: 'bug-11', afterGate: 11, label: 'REGRESSION', segmentIndex: 3, y: 456, width: 96, height: 64, hitboxInsetRatio: 0.10 },
]);

/** @type {readonly AchievementConfig[]} */
export const ACHIEVEMENTS = deepFreeze([
  {
    id: 'code-crafter',
    gate: 3,
    title: 'Code Crafter',
    funFact: 'Đức lập trình với Python, Java, C++ và SQL; đồng thời phát triển backend bằng Flask và Spring Boot.',
  },
  {
    id: 'pipeline-pilot',
    gate: 6,
    title: 'Pipeline Pilot',
    funFact: 'Đức tập trung vào Docker, Linux, CI/CD và triển khai có khả năng rollback.',
  },
  {
    id: 'aws-community-builder',
    gate: 9,
    title: 'AWS Community Builder',
    funFact: 'Đức là thành viên Core Team của AWS Student Builder Group.',
  },
  {
    id: 'midnight-bug-hunter',
    gate: 12,
    title: 'Midnight Bug Hunter',
    funFact: 'Khi bug xuất hiện sát giờ deploy, Đức sẵn sàng theo dấu log và hoàn thiện hotfix trong ca debug đêm muộn.',
  },
]);

export const ACHIEVEMENT_BY_GATE = deepFreeze(Object.fromEntries(ACHIEVEMENTS.map((item) => [item.gate, item])));
export const ACHIEVEMENT_BY_ID = deepFreeze(Object.fromEntries(ACHIEVEMENTS.map((item) => [item.id, item])));

export function normalizeMode(mode) {
  return mode === GAME_MODES.NO_TIMER ? GAME_MODES.NO_TIMER : GAME_MODES.STANDARD;
}

/** @returns {DeploymentBot} */
export function createBot(overrides = {}) {
  return {
    x: Number((WORLD.width * PHYSICS.botXRatio).toFixed(10)),
    y: WORLD.height * 0.5,
    width: PHYSICS.botWidth,
    height: PHYSICS.botHeight,
    vy: 0,
    hitboxInset: PHYSICS.hitboxInset,
    tilt: 0,
    ...overrides,
  };
}

export function createLifecycleResources() {
  return {
    generation: 0,
    abortController: null,
    rafId: null,
    timeoutIds: new Set(),
    observers: new Set(),
    mediaQueryCleanup: null,
    pointerCaptureIds: new Set(),
    gameOwnedListenerCount: 0,
  };
}

export function validateGateConfig(candidate) {
  if (!Array.isArray(candidate) || candidate.length !== GATE_CONFIGS.length) return false;
  const ids = new Set();
  const labels = new Set();
  return candidate.every((entry, index) => {
    const canonical = GATE_CONFIGS[index];
    if (!entry || typeof entry !== 'object') return false;
    if (ids.has(entry.id) || labels.has(entry.label)) return false;
    ids.add(entry.id);
    labels.add(entry.label);
    return entry.id === canonical.id
      && entry.ordinal === canonical.ordinal
      && entry.label === canonical.label
      && entry.segmentIndex === canonical.segmentIndex
      && entry.speed === canonical.speed
      && entry.gap === canonical.gap
      && entry.gapCenterRatio === canonical.gapCenterRatio
      && entry.width === canonical.width;
  });
}

/** @returns {PipelineGate} */
export function generateGate(config, localIndex = (config?.ordinal - 1) % 3, options = {}) {
  if (typeof localIndex === 'object') {
    options = localIndex;
    localIndex = options.localIndex ?? ((config?.ordinal - 1) % 3);
  }
  if (!config || !GATE_CONFIGS.some((item) => item.id === config.id)) {
    throw new TypeError('generateGate requires a canonical gate config');
  }
  const index = clamp(Math.trunc(finite(localIndex, 0)), 0, 2);
  const botLeft = toBotHitbox(createBot()).left;
  const passSeconds = (PHYSICS.firstPassLeadMs + index * PHYSICS.gateCadenceMs) / 1000;
  const gapCenter = config.gapCenterRatio * WORLD.height;
  return {
    id: config.id,
    ordinal: config.ordinal,
    label: config.label,
    segmentIndex: config.segmentIndex,
    x: botLeft + config.speed * passSeconds - config.width,
    width: config.width,
    speed: config.speed,
    gapTop: gapCenter - config.gap / 2,
    gapBottom: gapCenter + config.gap / 2,
    scored: false,
    approachAnnounced: false,
  };
}

/** @returns {BugCloud} */
export function generateBug(config, gatesOrOptions = undefined) {
  if (!config || !BUG_CONFIGS.some((item) => item.id === config.id)) {
    throw new TypeError('generateBug requires a canonical bug config');
  }
  const checkpoint = config.segmentIndex * 3;
  const supplied = Array.isArray(gatesOrOptions)
    ? gatesOrOptions
    : gatesOrOptions?.gates;
  const gates = supplied || GATE_CONFIGS
    .slice(checkpoint, checkpoint + 3)
    .map((gate, index) => generateGate(gate, index, gatesOrOptions || {}));
  const before = gates.find((gate) => gate.ordinal === config.afterGate);
  const after = gates.find((gate) => gate.ordinal === config.afterGate + 1);
  if (!before || !after) throw new RangeError('Bug Cloud requires its surrounding gates');
  const corridorStart = before.x + before.width;
  const corridorWidth = after.x - corridorStart;
  const speed = GATE_CONFIGS[config.afterGate - 1].speed;
  return {
    id: config.id,
    afterGate: config.afterGate,
    label: config.label,
    x: corridorStart + (corridorWidth - config.width) / 2,
    y: config.y,
    width: config.width,
    height: config.height,
    speed,
    hitboxInsetRatio: config.hitboxInsetRatio,
  };
}

export function normalizeCheckpoint(value) {
  return CHECKPOINTS.includes(value) ? value : 0;
}

export function generateSegment(checkpoint = 0, options = {}) {
  const safeCheckpoint = normalizeCheckpoint(checkpoint);
  const configs = GATE_CONFIGS.slice(safeCheckpoint, safeCheckpoint + 3);
  const gates = configs.map((config, index) => generateGate(config, index, options));
  const bugConfig = BUG_CONFIGS.find((bug) => bug.segmentIndex === safeCheckpoint / 3);
  const bugs = bugConfig ? [generateBug(bugConfig, gates)] : [];
  return { gates, bugs, segmentIndex: safeCheckpoint / 3 };
}

export function validateLevelFairness(gates = GATE_CONFIGS.map((config) => generateGate(config)), bugs = []) {
  if (!Array.isArray(gates) || gates.length === 0) return false;
  const ordered = [...gates].sort((a, b) => a.ordinal - b.ordinal);
  const botHitboxHeight = PHYSICS.botHeight - PHYSICS.hitboxInset * 2;
  const verticalClearance = botHitboxHeight / 2 + PHYSICS.safetyMargin;
  const safeIntervals = new Map();

  for (let index = 0; index < ordered.length; index += 1) {
    const gate = ordered[index];
    const center = (gate.gapTop + gate.gapBottom) / 2;
    const ratio = center / WORLD.height;
    const safeTop = gate.gapTop + verticalClearance;
    const safeBottom = gate.gapBottom - verticalClearance;
    if (ratio < 0.30 || ratio > 0.70) return false;
    if (gate.gapTop < 0 || gate.gapBottom > WORLD.height) return false;
    if (gate.gapBottom - gate.gapTop < 200 || safeTop > safeBottom) return false;
    safeIntervals.set(gate.ordinal, { top: safeTop, bottom: safeBottom });
    if (index > 0) {
      const previous = ordered[index - 1];
      const previousCenter = (previous.gapTop + previous.gapBottom) / 2;
      if (Math.abs(center - previousCenter) > 110 + Number.EPSILON) return false;
      const previousSafe = safeIntervals.get(previous.ordinal);
      if (Math.max(previousSafe.top, safeTop) > Math.min(previousSafe.bottom, safeBottom)) return false;
    }
  }

  for (const bug of bugs) {
    if (![2, 5, 8, 11].includes(bug.afterGate) || bug.hitboxInsetRatio < 0.08) return false;
    const before = ordered.find((gate) => gate.ordinal === bug.afterGate);
    const after = ordered.find((gate) => gate.ordinal === bug.afterGate + 1);
    if (!before || !after) return false;
    const bugRect = { left: bug.x, top: bug.y, right: bug.x + bug.width, bottom: bug.y + bug.height };
    for (const gate of ordered) {
      const gateBand = { left: gate.x, top: 0, right: gate.x + gate.width, bottom: WORLD.height };
      if (checkAabbCollision(bugRect, gateBand)) return false;
    }

    const beforeSafe = safeIntervals.get(before.ordinal);
    const afterSafe = safeIntervals.get(after.ordinal);
    const corridorTop = Math.max(beforeSafe.top, afterSafe.top);
    const corridorBottom = Math.min(beforeSafe.bottom, afterSafe.bottom);
    const hitbox = toBugHitbox(bug);
    const blockedTop = hitbox.top - verticalClearance;
    const blockedBottom = hitbox.bottom + verticalClearance;
    const routeAbove = corridorTop <= Math.min(corridorBottom, blockedTop);
    const routeBelow = Math.max(corridorTop, blockedBottom) <= corridorBottom;
    if (!routeAbove && !routeBelow) return false;
  }
  return true;
}

export function createInitialState(mode = GAME_MODES.STANDARD, options = {}) {
  const segment = generateSegment(0, options);
  const performanceDegraded = Boolean(options.performanceDegraded);
  return {
    phase: options.phase || 'INTRO',
    mode: normalizeMode(mode),
    world: WORLD,
    bot: createBot(),
    gates: segment.gates,
    bugs: segment.bugs,
    gateScore: 0,
    checkpoint: 0,
    unlockedAchievementIds: [],
    activePlayMs: 0,
    attempt: 0,
    segmentIndex: 0,
    pendingAnnouncementIds: [],
    announcedEventIds: [],
    lastInputModality: null,
    lastFailure: null,
    reducedMotion: Boolean(options.reducedMotion),
    performanceDegraded,
    effectLevel: options.reducedMotion || performanceDegraded ? 'reduced' : 'baseline',
    readyElapsedMs: 0,
    achievementEffectElapsedMs: 0,
    documentVisible: options.documentVisible !== false,
    revision: 0,
  };
}

export function cloneGameState(state) {
  return {
    ...state,
    bot: { ...state.bot },
    gates: state.gates.map((gate) => ({ ...gate })),
    bugs: state.bugs.map((bug) => ({ ...bug })),
    unlockedAchievementIds: [...state.unlockedAchievementIds],
    pendingAnnouncementIds: [...(state.pendingAnnouncementIds || [])],
    announcedEventIds: [...(state.announcedEventIds || [])],
  };
}

export function applyJump(bot) {
  return { ...bot, vy: PHYSICS.jumpVelocity };
}

export function applyGravity(bot, dtSeconds) {
  const dt = nonNegative(dtSeconds);
  const vy = Math.min(PHYSICS.terminalVelocity, finite(bot.vy) + PHYSICS.gravity * dt);
  return { ...bot, vy, y: finite(bot.y) + vy * dt };
}

export function clampBotToTop(bot) {
  const inset = nonNegative(bot.hitboxInset, PHYSICS.hitboxInset);
  const minimumY = -inset;
  if (bot.y >= minimumY) return { ...bot };
  return { ...bot, y: minimumY, vy: bot.vy < 0 ? 0 : bot.vy };
}

/** @returns {Rect} */
export function toBotHitbox(bot) {
  const inset = clamp(nonNegative(bot.hitboxInset), 0, Math.min(bot.width, bot.height) / 2);
  return {
    left: bot.x + inset,
    top: bot.y + inset,
    right: bot.x + bot.width - inset,
    bottom: bot.y + bot.height - inset,
  };
}

/** @returns {[Rect, Rect]} */
export function toGateHitboxes(gate, worldHeight = WORLD.height) {
  return [
    { left: gate.x, top: 0, right: gate.x + gate.width, bottom: gate.gapTop },
    { left: gate.x, top: gate.gapBottom, right: gate.x + gate.width, bottom: worldHeight },
  ];
}

/** @returns {Rect} */
export function toBugHitbox(bug) {
  const ratio = clamp(nonNegative(bug.hitboxInsetRatio), 0, 0.49);
  const insetX = bug.width * ratio;
  const insetY = bug.height * ratio;
  return {
    left: bug.x + insetX,
    top: bug.y + insetY,
    right: bug.x + bug.width - insetX,
    bottom: bug.y + bug.height - insetY,
  };
}

export function checkAabbCollision(a, b) {
  return a.left < b.right
    && a.right > b.left
    && a.top < b.bottom
    && a.bottom > b.top;
}

export function botFellOut(bot, worldHeight = WORLD.height) {
  return toBotHitbox(bot).bottom > worldHeight;
}

export function computeCanvasSize(availableWidth, availableHeight, dpr = 1) {
  const width = Math.max(1, finite(availableWidth, 1));
  const height = Math.max(1, finite(availableHeight, 1));
  const ratio = WORLD.width / WORLD.height;
  const cssWidth = Math.min(width, height * ratio, 1100);
  const cssHeight = cssWidth / ratio;
  const pixelRatio = clamp(finite(dpr, 1), 1, 2);
  return {
    cssWidth,
    cssHeight,
    pixelRatio,
    backingWidth: Math.max(1, Math.round(cssWidth * pixelRatio)),
    backingHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
  };
}

export function worldToClient(point, rect) {
  return {
    x: rect.left + point.x * rect.width / WORLD.width,
    y: rect.top + point.y * rect.height / WORLD.height,
  };
}

export function clientToWorld(point, rect) {
  if (!(rect.width > 0) || !(rect.height > 0)) throw new RangeError('Canvas rectangle must have positive dimensions');
  return {
    x: (point.x - rect.left) * WORLD.width / rect.width,
    y: (point.y - rect.top) * WORLD.height / rect.height,
  };
}

export function getAchievementForScore(score) {
  return ACHIEVEMENT_BY_GATE[score] || null;
}

export function unlockForScore(state, score = state.gateScore) {
  if (!MILESTONES.includes(score)) return state;
  const existing = new Set(state.unlockedAchievementIds);
  const unlockedAchievementIds = ACHIEVEMENTS
    .filter((achievement) => existing.has(achievement.id) || achievement.gate <= score)
    .map((achievement) => achievement.id);
  const checkpoint = score === 12 ? state.checkpoint : Math.max(state.checkpoint, score);
  if (unlockedAchievementIds.length === state.unlockedAchievementIds.length
      && unlockedAchievementIds.every((id, index) => id === state.unlockedAchievementIds[index])
      && checkpoint === state.checkpoint) return state;
  return { ...state, unlockedAchievementIds, checkpoint, revision: state.revision + 1 };
}

export function formatActivePlayTime(activePlayMs) {
  const totalSeconds = Math.round(nonNegative(activePlayMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function projectHud(state) {
  const showElapsed = state.mode === GAME_MODES.STANDARD
    && ['READY', 'PLAYING', 'PAUSED', 'ACHIEVEMENT'].includes(state.phase);
  return {
    phase: state.phase,
    score: `Gate ${state.gateScore}/12`,
    checkpoint: state.checkpoint,
    mode: state.mode,
    showElapsed,
    elapsed: showElapsed ? formatActivePlayTime(state.activePlayMs) : null,
  };
}

export function createWonSummary(state) {
  return {
    heading: 'Production Saved!',
    gameTitle: 'Deploy Before Dawn: Cloud Rescue',
    score: `${state.gateScore}/12`,
    activePlayTime: `Active play time: ${formatActivePlayTime(state.activePlayMs)}`,
    durationNote: state.mode === GAME_MODES.NO_TIMER
      ? 'No Timer mode — duration shown for reference'
      : null,
    achievements: state.unlockedAchievementIds.map((id) => ACHIEVEMENT_BY_ID[id]).filter(Boolean),
  };
}

export function mechanicsSnapshot(state) {
  return {
    phase: state.phase,
    bot: { ...state.bot },
    gates: state.gates.map((gate) => ({ ...gate })),
    bugs: state.bugs.map((bug) => ({ ...bug })),
    gateScore: state.gateScore,
    checkpoint: state.checkpoint,
    unlockedAchievementIds: [...state.unlockedAchievementIds],
    activePlayMs: state.activePlayMs,
    attempt: state.attempt,
    segmentIndex: state.segmentIndex,
    lastFailure: state.lastFailure,
  };
}

export function withReducedMotion(state, value) {
  const reducedMotion = Boolean(value);
  const effectLevel = reducedMotion || state.performanceDegraded ? 'reduced' : 'baseline';
  if (state.reducedMotion === reducedMotion && state.effectLevel === effectLevel) return state;
  return {
    ...state,
    reducedMotion,
    effectLevel,
    revision: state.revision + 1,
  };
}

function rebuildFromCheckpoint(state, { incrementAttempt = true } = {}) {
  const checkpoint = normalizeCheckpoint(state.checkpoint);
  const segment = generateSegment(checkpoint);
  const achievementPrefix = ACHIEVEMENTS
    .filter((achievement) => achievement.gate <= checkpoint)
    .map((achievement) => achievement.id);
  return {
    ...state,
    phase: 'READY',
    bot: createBot(),
    gates: segment.gates,
    bugs: segment.bugs,
    gateScore: checkpoint,
    checkpoint,
    unlockedAchievementIds: achievementPrefix,
    segmentIndex: segment.segmentIndex,
    attempt: state.attempt + (incrementAttempt ? 1 : 0),
    lastFailure: null,
    readyElapsedMs: 0,
    achievementEffectElapsedMs: 0,
    pendingAnnouncementIds: [],
    revision: state.revision + 1,
  };
}

export function retryFromCheckpoint(state) {
  return rebuildFromCheckpoint(state);
}

export function continueFromAchievement(state) {
  if (state.phase !== 'ACHIEVEMENT') return state;
  return rebuildFromCheckpoint(state);
}

export function resetProgression(state, phase = 'INTRO', mode = state.mode) {
  const reset = createInitialState(normalizeMode(mode), {
    reducedMotion: state.reducedMotion,
    performanceDegraded: state.performanceDegraded,
    documentVisible: state.documentVisible,
  });
  return { ...reset, phase, revision: state.revision + 1 };
}

const MOUNTED_PHASES = new Set([
  'LOADING', 'INTRO', 'ACCESSIBLE_FACTS', 'READY', 'PLAYING', 'PAUSED',
  'CRASHED', 'ACHIEVEMENT', 'WON', 'LOAD_ERROR', 'RUNTIME_ERROR', 'UNAVAILABLE',
]);

export const TRANSITION_GRAPH = deepFreeze({
  DORMANT: ['CAPABILITY_CHECK'],
  CAPABILITY_CHECK: ['LOADING', 'UNAVAILABLE', 'CLOSING'],
  LOADING: ['INTRO', 'LOAD_ERROR', 'CLOSING'],
  UNAVAILABLE: ['CLOSING'],
  INTRO: ['READY', 'ACCESSIBLE_FACTS', 'CLOSING'],
  ACCESSIBLE_FACTS: ['INTRO', 'CLOSING'],
  READY: ['PLAYING', 'PAUSED', 'CLOSING'],
  PLAYING: ['PAUSED', 'CRASHED', 'ACHIEVEMENT', 'WON', 'RUNTIME_ERROR', 'CLOSING'],
  PAUSED: ['READY', 'CLOSING'],
  CRASHED: ['READY', 'CLOSING'],
  ACHIEVEMENT: ['READY', 'CLOSING'],
  WON: ['INTRO', 'CLOSING'],
  LOAD_ERROR: ['LOADING', 'CLOSING'],
  RUNTIME_ERROR: ['CLOSING'],
  CLOSING: ['DORMANT'],
});

function transition(state, phase, patch = {}) {
  if (phase !== state.phase && !(TRANSITION_GRAPH[state.phase] || []).includes(phase)) return state;
  return { ...state, ...patch, phase, revision: state.revision + 1 };
}

/** Pure lifecycle reducer. Invalid events return the same object reference. */
export function reduceGameEvent(state, event) {
  if (!state || !event || typeof event.type !== 'string') return state;
  if (event.type === 'CLOSE' && (MOUNTED_PHASES.has(state.phase) || state.phase === 'CAPABILITY_CHECK')) {
    return transition(state, 'CLOSING');
  }
  if (event.type === 'REDUCED_MOTION_CHANGED') return withReducedMotion(state, event.value);

  switch (state.phase) {
    case 'DORMANT':
      return event.type === 'ACTIVATE' ? transition(state, 'CAPABILITY_CHECK') : state;
    case 'CAPABILITY_CHECK':
      if (event.type === 'SUPPORTED') return transition(state, 'LOADING');
      if (event.type === 'UNSUPPORTED') return transition(state, 'UNAVAILABLE');
      return state;
    case 'LOADING':
      if (event.type === 'LOAD_SUCCESS') return transition(state, 'INTRO');
      if (event.type === 'LOAD_FAILURE' || event.type === 'LOAD_TIMEOUT') return transition(state, 'LOAD_ERROR');
      return state;
    case 'LOAD_ERROR':
      return event.type === 'RETRY_LOAD' ? transition(state, 'LOADING') : state;
    case 'INTRO': {
      if (event.type === 'SET_MODE') {
        const mode = normalizeMode(event.mode);
        return mode === state.mode ? state : { ...state, mode, revision: state.revision + 1 };
      }
      if (event.type === 'VIEW_FACTS') return transition(state, 'ACCESSIBLE_FACTS');
      if (event.type !== 'START') return state;
      const started = resetProgression(state, 'READY', event.mode || state.mode);
      return { ...started, attempt: 1 };
    }
    case 'ACCESSIBLE_FACTS':
      return event.type === 'BACK_FACTS' ? transition(state, 'INTRO') : state;
    case 'READY': {
      if (event.type === 'READY_TICK') {
        const readyElapsedMs = clamp(state.readyElapsedMs + nonNegative(event.dtMs), 0, PHYSICS.readyMaxMs);
        return readyElapsedMs === state.readyElapsedMs ? state : { ...state, readyElapsedMs, revision: state.revision + 1 };
      }
      if (event.type === 'JUMP' && state.readyElapsedMs >= PHYSICS.readyMinMs) {
        return transition(state, 'PLAYING', {
          bot: applyJump(state.bot),
          lastInputModality: event.source || state.lastInputModality,
        });
      }
      if (['PAUSE', 'VISIBILITY_HIDDEN', 'VIEWPORT_CHANGED', 'TAB_AWAY'].includes(event.type)) {
        return transition(state, 'PAUSED', { documentVisible: event.type === 'VISIBILITY_HIDDEN' ? false : state.documentVisible });
      }
      return state;
    }
    case 'PLAYING':
      if (['PAUSE', 'VISIBILITY_HIDDEN', 'VIEWPORT_CHANGED', 'TAB_AWAY'].includes(event.type)) {
        return transition(state, 'PAUSED', { documentVisible: event.type === 'VISIBILITY_HIDDEN' ? false : state.documentVisible });
      }
      if (event.type === 'JUMP') {
        return {
          ...state,
          bot: applyJump(state.bot),
          lastInputModality: event.source || state.lastInputModality,
          revision: state.revision + 1,
        };
      }
      if (event.type === 'RUNTIME_ERROR') return transition(state, 'RUNTIME_ERROR');
      return state;
    case 'PAUSED':
      if (event.type === 'VISIBILITY_VISIBLE') {
        return state.documentVisible ? state : { ...state, documentVisible: true, revision: state.revision + 1 };
      }
      if (event.type === 'RESIZE_COMPLETE') return state;
      if (event.type === 'RESUME' && state.documentVisible) {
        return transition(state, 'READY', { readyElapsedMs: 0 });
      }
      if (event.type === 'RESTART_CHECKPOINT') return rebuildFromCheckpoint(state);
      return state;
    case 'CRASHED':
      return event.type === 'RETRY' ? retryFromCheckpoint(state) : state;
    case 'ACHIEVEMENT':
      return event.type === 'CONTINUE' ? continueFromAchievement(state) : state;
    case 'WON':
      return event.type === 'PLAY_AGAIN' ? resetProgression(state, 'INTRO', state.mode) : state;
    case 'CLOSING':
      return event.type === 'TEARDOWN_COMPLETE' ? transition(state, 'DORMANT') : state;
    default:
      return state;
  }
}

function collisionFailure(bot, gates, bugs) {
  if (botFellOut(bot)) return 'fell-out';
  const botRect = toBotHitbox(bot);
  for (const gate of gates) {
    if (toGateHitboxes(gate).some((rect) => checkAabbCollision(botRect, rect))) return 'gate';
  }
  for (const bug of bugs) {
    if (checkAabbCollision(botRect, toBugHitbox(bug))) return 'bug';
  }
  return null;
}

export function scorePassedGates(state) {
  if (state.phase !== 'PLAYING') return state;
  const botLeft = toBotHitbox(state.bot).left;
  let gateScore = state.gateScore;
  let reachedMilestone = null;
  const gates = state.gates.map((gate) => ({ ...gate }));
  for (const gate of [...gates].sort((a, b) => a.ordinal - b.ordinal)) {
    if (reachedMilestone) break;
    if (!gate.scored && gate.x + gate.width < botLeft) {
      const target = gates.find((candidate) => candidate.id === gate.id);
      target.scored = true;
      gateScore = Math.min(12, gateScore + 1);
      if (MILESTONES.includes(gateScore)) reachedMilestone = gateScore;
    }
  }
  if (gateScore === state.gateScore) return state;
  let next = { ...state, gates, gateScore, revision: state.revision + 1 };
  if (reachedMilestone) {
    next = unlockForScore(next, reachedMilestone);
    if (reachedMilestone === 12) {
      next = transition(next, 'WON');
    } else {
      next = transition(next, 'ACHIEVEMENT', { achievementEffectElapsedMs: 0 });
    }
  }
  return next;
}

/**
 * Advance exactly one deterministic simulation step. The caller owns fixed-step
 * accumulation; dt is sanitized but never subdivided or read from a wall clock.
 */
export function stepGame(state, frame = { dtMs: PHYSICS.fixedStepMs, events: [] }) {
  const dtMs = nonNegative(frame.dtMs);
  const events = Array.isArray(frame.events) ? frame.events : [];
  const phaseAtStart = state.phase;

  if (phaseAtStart === 'READY') {
    let next = reduceGameEvent(state, { type: 'READY_TICK', dtMs });
    for (const event of events) next = reduceGameEvent(next, event);
    return next;
  }

  if (phaseAtStart === 'ACHIEVEMENT') {
    let next = {
      ...state,
      achievementEffectElapsedMs: state.achievementEffectElapsedMs + dtMs,
      revision: state.revision + (dtMs > 0 ? 1 : 0),
    };
    for (const event of events) next = reduceGameEvent(next, event);
    return next;
  }

  if (phaseAtStart !== 'PLAYING') {
    let next = state;
    for (const event of events) next = reduceGameEvent(next, event);
    return next;
  }

  let next = state;
  for (const event of events) {
    next = reduceGameEvent(next, event);
    if (next.phase !== 'PLAYING') return next;
  }

  const dtSeconds = dtMs / 1000;
  const bot = clampBotToTop(applyGravity(next.bot, dtSeconds));
  const gates = next.gates.map((gate) => ({ ...gate, x: gate.x - gate.speed * dtSeconds }));
  const bugs = next.bugs.map((bug) => ({ ...bug, x: bug.x - bug.speed * dtSeconds }));
  const moved = {
    ...next,
    bot,
    gates,
    bugs,
    activePlayMs: next.activePlayMs + dtMs,
    revision: next.revision + 1,
  };

  const failure = collisionFailure(bot, gates, bugs);
  if (failure) {
    return transition(moved, 'CRASHED', { lastFailure: failure });
  }
  return scorePassedGates(moved);
}

export function runFrames(state, frames) {
  return frames.reduce((current, frame) => stepGame(current, frame), state);
}

export function classifyOpening(gapTop, gapBottom) {
  const ratio = ((gapTop + gapBottom) / 2) / WORLD.height;
  if (ratio < 0.43) return 'high';
  if (ratio > 0.57) return 'low';
  return 'middle';
}

export function classifyBotRelative(botCenterY, gapTop, gapBottom) {
  if (botCenterY < gapTop) return 'above';
  if (botCenterY > gapBottom) return 'below';
  return 'inside';
}

export function classifyDistance(timeToPass) {
  return timeToPass <= 1.5 ? 'near' : 'far';
}

export function computeTimeToPass(gate, bot = createBot()) {
  if (!gate || !(gate.speed > 0)) return Infinity;
  return Math.max(0, (gate.x + gate.width - toBotHitbox(bot).left) / gate.speed);
}

export function getNextGate(state) {
  const botLeft = toBotHitbox(state.bot).left;
  return state.gates
    .filter((gate) => !gate.scored && gate.x + gate.width >= botLeft)
    .sort((a, b) => a.ordinal - b.ordinal)[0] || null;
}

export function describeSpatialStatus(state) {
  const gate = getNextGate(state);
  if (!gate) return { message: 'no gate remaining', gate: null };
  const timeToPass = computeTimeToPass(gate, state.bot);
  const botCenterY = (toBotHitbox(state.bot).top + toBotHitbox(state.bot).bottom) / 2;
  const opening = classifyOpening(gate.gapTop, gate.gapBottom);
  const relative = classifyBotRelative(botCenterY, gate.gapTop, gate.gapBottom);
  const distance = classifyDistance(timeToPass);
  return {
    gate: gate.ordinal,
    label: gate.label,
    opening,
    relative,
    distance,
    timeToPass,
    message: `Gate ${gate.ordinal} ${gate.label}: ${opening} opening, Bot ${relative}, ${distance}`,
  };
}

export function collectApproachAnnouncements(state) {
  const botLeft = toBotHitbox(state.bot).left;
  const announcements = [];
  const gates = state.gates.map((gate) => {
    if (gate.scored || gate.approachAnnounced) return gate;
    const timeToPass = Math.max(0, (gate.x + gate.width - botLeft) / gate.speed);
    if (timeToPass > 1.5) return gate;
    const opening = classifyOpening(gate.gapTop, gate.gapBottom);
    announcements.push({
      id: `gate-approach-${gate.ordinal}`,
      gate: gate.ordinal,
      label: gate.label,
      opening,
      message: `Gate ${gate.ordinal} ${gate.label}, ${opening} opening`,
    });
    return { ...gate, approachAnnounced: true };
  });
  if (announcements.length === 0) return { state, announcements };
  return {
    state: {
      ...state,
      gates,
      pendingAnnouncementIds: [
        ...(state.pendingAnnouncementIds || []),
        ...announcements.map((announcement) => announcement.id),
      ],
      revision: state.revision + 1,
    },
    announcements,
  };
}

export function isInteractiveControl(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'SUMMARY'].includes(tag)) return true;
  if (target.isContentEditable) return true;
  if (typeof target.closest === 'function') {
    return Boolean(target.closest('button,input,select,textarea,a[href],summary,[contenteditable="true"],[role="button"]'));
  }
  return false;
}

function gameplayPhase(phase) {
  return phase === 'READY' || phase === 'PLAYING';
}

/** Stateful physical-activation deduper; it has no browser side effects. */
export function createInputNormalizer() {
  const activePointers = new Set();
  let suppressSyntheticClicks = 0;
  let suppressPointerAfterTouch = 0;
  let sequence = 0;

  const nextId = (prefix) => `${prefix}-${++sequence}`;

  return {
    normalize(raw, phase, options = {}) {
      if (!raw || typeof raw.type !== 'string') return null;
      const targetIsControl = options.targetIsControl ?? isInteractiveControl(raw.target);

      if (raw.type === 'keydown') {
        if (targetIsControl) return null;
        const key = raw.code || raw.key;
        const normalizedKey = String(raw.key || raw.code || '').toLowerCase();
        if ((key === 'Space' || key === ' ') && gameplayPhase(phase) && !raw.repeat) {
          return { type: 'JUMP', source: 'keyboard', id: nextId('key') };
        }
        if ((key === 'Escape' || normalizedKey === 'p' || normalizedKey === 'keyp') && phase === 'PLAYING' && !raw.repeat) {
          return { type: 'PAUSE', source: 'keyboard' };
        }
        if ((normalizedKey === 's' || normalizedKey === 'keys') && phase === 'PLAYING' && !raw.repeat) {
          return { type: 'STATUS_REQUEST', source: 'keyboard' };
        }
        return null;
      }

      if (raw.type === 'touchstart') {
        const touches = raw.touches || raw.changedTouches || [];
        if (!gameplayPhase(phase) || targetIsControl || touches.length !== 1) return null;
        suppressSyntheticClicks += 1;
        suppressPointerAfterTouch += 1;
        return { type: 'JUMP', source: 'touch', id: nextId('touch') };
      }
      if (raw.type === 'pointercancel') {
        activePointers.delete(raw.pointerId);
        return null;
      }
      if (raw.type === 'pointerup') {
        activePointers.delete(raw.pointerId);
        return null;
      }
      if (raw.type === 'pointerdown') {
        if (raw.pointerType === 'touch' && suppressPointerAfterTouch > 0) {
          suppressPointerAfterTouch -= 1;
          return null;
        }
        const pointerId = raw.pointerId ?? 1;
        if (activePointers.has(pointerId)) return null;
        if (!gameplayPhase(phase) || targetIsControl || raw.button !== 0 || raw.isPrimary === false) return null;
        activePointers.add(pointerId);
        suppressSyntheticClicks += 1;
        const source = raw.pointerType === 'touch' ? 'touch' : 'mouse';
        return { type: 'JUMP', source, id: nextId(`pointer-${pointerId}`) };
      }
      if (raw.type === 'click') {
        if (suppressSyntheticClicks > 0) {
          suppressSyntheticClicks -= 1;
          return null;
        }
        if (!gameplayPhase(phase) || targetIsControl || (raw.button ?? 0) !== 0) return null;
        return { type: 'JUMP', source: 'mouse', id: nextId('click') };
      }
      return null;
    },
    reset() {
      activePointers.clear();
      suppressSyntheticClicks = 0;
      suppressPointerAfterTouch = 0;
    },
    snapshot() {
      return { activePointerCount: activePointers.size, suppressSyntheticClicks, suppressPointerAfterTouch };
    },
  };
}

/**
 * Attach input listeners to a supplied Flight Surface. The returned destroy()
 * is idempotent and exposes listenerCount for lifecycle instrumentation.
 */
export function createInputController({ surface, dispatch, getPhase, signal, registry = null } = {}) {
  if (!surface || typeof surface.addEventListener !== 'function') throw new TypeError('A Flight Surface is required');
  if (typeof dispatch !== 'function') throw new TypeError('dispatch must be a function');
  const phase = typeof getPhase === 'function' ? getPhase : () => 'PLAYING';
  const normalizer = createInputNormalizer();
  const listeners = [];
  let destroyed = false;

  const handle = (raw) => {
    if (destroyed) return;
    const event = normalizer.normalize(raw, phase());
    if (!event) return;
    if ((event.type === 'JUMP' || event.type === 'PAUSE') && typeof raw.preventDefault === 'function') raw.preventDefault();
    dispatch(event);
  };
  const add = (type) => {
    if (registry?.listen) registry.listen(surface, type, handle);
    else surface.addEventListener(type, handle);
    listeners.push([type, handle]);
  };
  const inputTypes = ['keydown'];
  if (!surface.ownerDocument?.defaultView?.PointerEvent) inputTypes.push('touchstart');
  inputTypes.push('pointerdown', 'pointerup', 'pointercancel', 'click');
  inputTypes.forEach(add);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const [type, listener] of listeners) {
      if (registry?.unlisten) registry.unlisten(surface, type, listener);
      else surface.removeEventListener(type, listener);
    }
    listeners.length = 0;
    normalizer.reset();
    if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', destroy);
  };
  if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted) destroy();

  return {
    destroy,
    get listenerCount() { return listeners.length; },
    get destroyed() { return destroyed; },
    normalizer,
  };
}

// Browser adapters below are factories only: importing this module still creates
// no DOM node, timer, listener, Canvas, observer, animation frame, or global.

export const DEFAULT_PALETTE = deepFreeze({
  accent: '#7dd3fc',
  accent2: '#c4b5fd',
  stroke: '#aab6d3',
  text: '#f8fafc',
  muted: '#c1cae0',
  bg: '#080b1b',
  card: '#11182e',
  danger: '#fb7185',
  success: '#86efac',
});

const TOKEN_NAMES = deepFreeze({
  accent: '--accent',
  accent2: '--accent-2',
  stroke: '--stroke',
  text: '--text',
  muted: '--muted',
  bg: '--bg',
  card: '--card',
});

const STAR_FIELD = deepFreeze([
  [48, 64, 2], [124, 132, 1], [207, 44, 2], [311, 94, 1], [432, 52, 2],
  [557, 126, 1], [686, 66, 2], [812, 116, 1], [902, 48, 2], [76, 426, 1],
  [182, 488, 2], [352, 448, 1], [518, 492, 2], [722, 456, 1], [884, 486, 2],
]);

const FAILURE_TEXT = deepFreeze({
  gate: 'Pipeline Gate collision',
  bug: 'Bug Cloud collision',
  'fell-out': 'Deployment Bot fell out of the flight area',
});

const RENDER_LAYER_ORDER = deepFreeze([
  'background', 'stars-clouds', 'pipeline-gates', 'bug-clouds',
  'deployment-bot', 'feedback', 'score',
]);

function normalizedCssColor(value, fallback) {
  const result = String(value || '').trim();
  if (!result || result === 'initial' || result === 'inherit' || result === 'unset') return fallback;
  return result;
}

/** Cache portfolio CSS tokens. Call invalidate() only after a theme mutation. */
export function createTokenCache({ element = null, getComputedStyleFn = null } = {}) {
  let palette = null;
  let readCount = 0;
  return Object.freeze({
    read(force = false) {
      if (palette && !force) return palette;
      const styleReader = getComputedStyleFn
        || element?.ownerDocument?.defaultView?.getComputedStyle?.bind(element.ownerDocument.defaultView);
      const style = element && styleReader ? styleReader(element) : null;
      const resolved = { ...DEFAULT_PALETTE };
      if (style?.getPropertyValue) {
        for (const [key, token] of Object.entries(TOKEN_NAMES)) {
          resolved[key] = normalizedCssColor(style.getPropertyValue(token), DEFAULT_PALETTE[key]);
        }
      }
      palette = Object.freeze(resolved);
      readCount += 1;
      return palette;
    },
    invalidate() { palette = null; },
    get readCount() { return readCount; },
  });
}

export function createRenderPlan(state, timestamp = 0) {
  const reduced = Boolean(state?.reducedMotion || state?.effectLevel === 'reduced');
  return Object.freeze({
    timestamp: finite(timestamp),
    layerOrder: RENDER_LAYER_ORDER,
    parallax: !reduced,
    starDrift: !reduced,
    trail: !reduced,
    bob: !reduced,
    pulse: !reduced,
    shake: !reduced,
    confetti: !reduced && state?.phase === 'WON',
    particles: !reduced,
    staticFeedback: true,
  });
}

function safeContextCall(context, name, ...args) {
  if (typeof context?.[name] !== 'function') return false;
  try { context[name](...args); return true; } catch { return false; }
}

function drawLayer(context, layer, draw, onLayer) {
  try {
    onLayer?.(layer);
    safeContextCall(context, 'save');
    draw();
  } catch {
    // A decorative primitive must never take down controls or game mechanics.
  } finally {
    safeContextCall(context, 'restore');
  }
}

function drawGate(context, gate, palette) {
  context.fillStyle = palette.card;
  context.strokeStyle = palette.accent;
  context.lineWidth = 4;
  safeContextCall(context, 'fillRect', gate.x, 0, gate.width, gate.gapTop);
  safeContextCall(context, 'strokeRect', gate.x, 0, gate.width, gate.gapTop);
  safeContextCall(context, 'fillRect', gate.x, gate.gapBottom, gate.width, WORLD.height - gate.gapBottom);
  safeContextCall(context, 'strokeRect', gate.x, gate.gapBottom, gate.width, WORLD.height - gate.gapBottom);
  context.fillStyle = palette.text;
  context.font = '700 16px ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const labelY = gate.gapTop > 42 ? Math.max(22, gate.gapTop - 24) : Math.min(WORLD.height - 22, gate.gapBottom + 24);
  safeContextCall(context, 'fillText', gate.label, gate.x + gate.width / 2, labelY);
}

function drawBug(context, bug, palette, bob = 0) {
  const x = bug.x;
  const y = bug.y + bob;
  context.fillStyle = palette.danger;
  context.strokeStyle = palette.text;
  context.lineWidth = 3;
  safeContextCall(context, 'beginPath');
  safeContextCall(context, 'moveTo', x + bug.width * 0.08, y + bug.height * 0.58);
  safeContextCall(context, 'lineTo', x + bug.width * 0.20, y + bug.height * 0.20);
  safeContextCall(context, 'lineTo', x + bug.width * 0.50, y + bug.height * 0.06);
  safeContextCall(context, 'lineTo', x + bug.width * 0.82, y + bug.height * 0.24);
  safeContextCall(context, 'lineTo', x + bug.width * 0.94, y + bug.height * 0.64);
  safeContextCall(context, 'lineTo', x + bug.width * 0.72, y + bug.height * 0.92);
  safeContextCall(context, 'lineTo', x + bug.width * 0.22, y + bug.height * 0.88);
  safeContextCall(context, 'closePath');
  safeContextCall(context, 'fill');
  safeContextCall(context, 'stroke');
  context.fillStyle = palette.bg;
  context.font = '800 15px ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  safeContextCall(context, 'fillText', bug.label, x + bug.width / 2, y + bug.height / 2);
}

function drawBot(context, bot, palette, tilt = 0) {
  const centerX = bot.x + bot.width / 2;
  const centerY = bot.y + bot.height / 2;
  safeContextCall(context, 'translate', centerX, centerY);
  safeContextCall(context, 'rotate', tilt);
  context.fillStyle = palette.accent2;
  context.strokeStyle = palette.text;
  context.lineWidth = 3;
  safeContextCall(context, 'fillRect', -bot.width / 2, -bot.height / 2, bot.width, bot.height);
  safeContextCall(context, 'strokeRect', -bot.width / 2, -bot.height / 2, bot.width, bot.height);
  context.fillStyle = palette.bg;
  safeContextCall(context, 'fillRect', -11, -7, 22, 9);
  context.fillStyle = palette.success;
  safeContextCall(context, 'fillRect', -7, -4, 4, 4);
  safeContextCall(context, 'fillRect', 3, -4, 4, 4);
  context.strokeStyle = palette.accent;
  safeContextCall(context, 'beginPath');
  safeContextCall(context, 'moveTo', -bot.width / 2 - 9, 0);
  safeContextCall(context, 'lineTo', -bot.width / 2, 0);
  safeContextCall(context, 'moveTo', bot.width / 2, 0);
  safeContextCall(context, 'lineTo', bot.width / 2 + 9, 0);
  safeContextCall(context, 'stroke');
}

/**
 * Render one immutable snapshot. Collision/scoring are deliberately absent;
 * callers may record layer names to assert the procedural draw order.
 */
export function renderCanvas(context, state, options = {}) {
  if (!context || !state) return { rendered: false, plan: createRenderPlan(state) };
  const palette = Object.freeze({ ...DEFAULT_PALETTE, ...(options.palette || {}) });
  const timestamp = finite(options.timestamp);
  const plan = createRenderPlan(state, timestamp);
  const scaleX = finite(options.scaleX, 1);
  const scaleY = finite(options.scaleY, 1);
  safeContextCall(context, 'setTransform', scaleX, 0, 0, scaleY, 0, 0);
  safeContextCall(context, 'clearRect', 0, 0, WORLD.width, WORLD.height);

  drawLayer(context, 'background', () => {
    context.fillStyle = palette.bg;
    safeContextCall(context, 'fillRect', 0, 0, WORLD.width, WORLD.height);
  }, options.onLayer);

  drawLayer(context, 'stars-clouds', () => {
    const drift = plan.starDrift ? (timestamp / 90) % WORLD.width : 0;
    context.fillStyle = palette.muted;
    for (const [baseX, y, radius] of STAR_FIELD) {
      const x = (baseX - drift + WORLD.width) % WORLD.width;
      safeContextCall(context, 'fillRect', x, y, radius, radius);
    }
    context.strokeStyle = palette.stroke;
    context.lineWidth = 2;
    for (const x of [150, 610]) {
      safeContextCall(context, 'beginPath');
      safeContextCall(context, 'arc', x, 190, 34, Math.PI, Math.PI * 2);
      safeContextCall(context, 'arc', x + 38, 190, 26, Math.PI, Math.PI * 2);
      safeContextCall(context, 'stroke');
    }
  }, options.onLayer);

  drawLayer(context, 'pipeline-gates', () => {
    for (const gate of state.gates || []) drawGate(context, gate, palette);
  }, options.onLayer);

  drawLayer(context, 'bug-clouds', () => {
    const bob = plan.bob ? Math.sin(timestamp / 240) * 3 : 0;
    for (const bug of state.bugs || []) drawBug(context, bug, palette, bob);
  }, options.onLayer);

  drawLayer(context, 'deployment-bot', () => {
    const tilt = plan.bob ? clamp(finite(state.bot?.vy) / 900, -0.35, 0.55) : 0;
    drawBot(context, state.bot || createBot(), palette, tilt);
  }, options.onLayer);

  drawLayer(context, 'feedback', () => {
    context.font = '700 18px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    if (state.phase === 'CRASHED') {
      const rect = toBotHitbox(state.bot);
      context.strokeStyle = palette.danger;
      context.lineWidth = 5;
      safeContextCall(context, 'strokeRect', rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      context.fillStyle = palette.text;
      safeContextCall(context, 'fillText', `✕ ${FAILURE_TEXT[state.lastFailure] || 'Deployment failed'}`, 24, 52);
    } else if ((state.gates || []).some((gate) => gate.scored)) {
      context.fillStyle = palette.success;
      safeContextCall(context, 'fillText', '✓ Gate passed', 24, 52);
    }
  }, options.onLayer);

  drawLayer(context, 'score', () => {
    context.fillStyle = palette.text;
    context.font = '800 24px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    safeContextCall(context, 'fillText', `Gate ${state.gateScore}/12`, 24, 18);
  }, options.onLayer);

  return { rendered: true, plan, layerOrder: RENDER_LAYER_ORDER };
}

function parseColor(color) {
  const value = String(color || '').trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) return [...short[1]].map((part) => parseInt(part + part, 16));
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((index) => parseInt(hex[1].slice(index, index + 2), 16));
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  if (rgb) return rgb.slice(1, 4).map((part) => clamp(Number(part), 0, 255));
  return null;
}

function relativeLuminance(color) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const channels = rgb.map((part) => {
    const value = part / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  if (first === null || second === null) return 0;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function paletteMeetsContrast(palette = DEFAULT_PALETTE) {
  return contrastRatio(palette.text, palette.bg) >= 4.5
    && contrastRatio(palette.muted, palette.bg) >= 4.5
    && contrastRatio(palette.accent, palette.bg) >= 3
    && contrastRatio(palette.accent2, palette.bg) >= 3;
}

export function projectDomStatus(state) {
  const next = ACHIEVEMENTS.find((achievement) => !state.unlockedAchievementIds.includes(achievement.id));
  const parts = [
    `Phase: ${state.phase}`,
    `Gate ${state.gateScore}/12`,
    `Checkpoint: ${state.checkpoint}`,
    `Next achievement: ${next ? `${next.title} at Gate ${next.gate}` : 'All unlocked'}`,
    `Mode: ${state.mode === GAME_MODES.NO_TIMER ? 'No Timer Mode' : 'Standard Mode'}`,
  ];
  if (state.mode === GAME_MODES.STANDARD && ['READY', 'PLAYING', 'PAUSED', 'ACHIEVEMENT'].includes(state.phase)) {
    parts.push(`Active play time: ${formatActivePlayTime(state.activePlayMs)}`);
  }
  return parts.join('. ');
}

export function createAnnouncementQueue({ write, now = () => 0, setTimer = null, clearTimer = null, throttleMs = 1000 } = {}) {
  const seen = new Set();
  const pending = [];
  let lastWrite = -Infinity;
  let timerId = null;
  let destroyed = false;

  const flush = () => {
    timerId = null;
    if (destroyed || pending.length === 0) return;
    const item = pending.shift();
    lastWrite = now();
    write?.(item.message, item.priority);
    schedule();
  };
  const schedule = () => {
    if (destroyed || pending.length === 0 || timerId !== null) return;
    const delay = Math.max(0, throttleMs - (now() - lastWrite));
    if (delay === 0 || !setTimer) flush();
    else timerId = setTimer(flush, delay);
  };
  return Object.freeze({
    enqueue(item) {
      if (destroyed || !item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      if (item.priority === 'alert') {
        if (timerId !== null && clearTimer) clearTimer(timerId);
        timerId = null;
        lastWrite = now();
        write?.(item.message, 'alert');
        schedule();
        return true;
      }
      pending.push(item);
      schedule();
      return true;
    },
    destroy() {
      destroyed = true;
      pending.length = 0;
      if (timerId !== null && clearTimer) clearTimer(timerId);
      timerId = null;
    },
    get pendingCount() { return pending.length; },
    get seenCount() { return seen.size; },
  });
}

export function createFpsSampler({ threshold = 24, windowMs = 1000, onDegrade = null } = {}) {
  let previousTimestamp = null;
  let windowStart = null;
  let frameIntervals = [];
  let consecutiveLow = 0;
  let degraded = false;
  const resetWindow = () => {
    previousTimestamp = null;
    windowStart = null;
    frameIntervals = [];
    consecutiveLow = 0;
  };
  return Object.freeze({
    sample(timestamp, phase = 'PLAYING') {
      if (phase !== 'PLAYING') {
        resetWindow();
        return null;
      }
      const current = finite(timestamp);
      if (previousTimestamp === null) {
        previousTimestamp = current;
        windowStart = current;
        frameIntervals = [];
        return null;
      }
      if (current < previousTimestamp) return null;
      const interval = current - previousTimestamp;
      previousTimestamp = current;
      if (interval > 0) frameIntervals.push(interval);
      const elapsed = current - windowStart;
      if (elapsed < windowMs) return null;
      const sorted = [...frameIntervals].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const medianInterval = sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
      const fps = medianInterval > 0 ? 1000 / medianInterval : 0;
      consecutiveLow = fps < threshold ? consecutiveLow + 1 : 0;
      windowStart = current;
      frameIntervals = [];
      if (!degraded && consecutiveLow >= 2) {
        degraded = true;
        onDegrade?.(fps);
      }
      return fps;
    },
    reset: resetWindow,
    get degraded() { return degraded; },
    get consecutiveLowWindows() { return consecutiveLow; },
  });
}

export function createLazyGenerationController() {
  let generation = 0;
  let activeToken = null;
  let overlayMounted = false;
  let requestAttempts = 0;
  return Object.freeze({
    activate({ supported = true } = {}) {
      if (!supported || activeToken !== null || overlayMounted) return null;
      activeToken = ++generation;
      requestAttempts += 1;
      return activeToken;
    },
    retry() {
      generation += 1;
      activeToken = generation;
      requestAttempts += 1;
      return activeToken;
    },
    settle(token, succeeded = true) {
      if (token !== activeToken || !succeeded || overlayMounted) return false;
      activeToken = null;
      overlayMounted = true;
      return true;
    },
    expire(token) {
      if (token !== activeToken) return false;
      generation += 1;
      activeToken = null;
      return true;
    },
    close() {
      generation += 1;
      activeToken = null;
      overlayMounted = false;
    },
    snapshot() {
      return { generation, activeToken, overlayMounted, requestAttempts };
    },
  });
}

export function createBrowserEnv(scope = globalThis) {
  const windowRef = scope?.window || scope;
  const timeout = windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout.bind(globalThis);
  const clear = windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout.bind(globalThis);
  return {
    now: () => windowRef?.performance?.now?.() ?? Date.now(),
    requestFrame: windowRef?.requestAnimationFrame?.bind(windowRef)
      || ((callback) => timeout(() => callback(windowRef?.performance?.now?.() ?? Date.now()), 16)),
    cancelFrame: windowRef?.cancelAnimationFrame?.bind(windowRef) || clear,
    setTimeout: timeout,
    clearTimeout: clear,
    matchMedia: (query) => windowRef?.matchMedia?.(query) || {
      media: query, matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    },
    createResizeObserver: (callback) => windowRef?.ResizeObserver ? new windowRef.ResizeObserver(callback) : null,
    get devicePixelRatio() { return finite(windowRef?.devicePixelRatio, 1); },
    get innerWidth() { return finite(windowRef?.innerWidth, 960); },
    get innerHeight() { return finite(windowRef?.innerHeight, 540); },
  };
}

export function createLifecycleRegistry(env = createBrowserEnv()) {
  const frames = new Set();
  const timers = new Set();
  const listeners = [];
  const observers = new Set();
  const mediaCleanups = new Set();
  const pointerCaptures = new Set();
  let tornDown = false;

  const registry = {
    listen(target, type, listener, options) {
      if (tornDown || !target?.addEventListener) return listener;
      target.addEventListener(type, listener, options);
      listeners.push({ target, type, listener, options });
      return listener;
    },
    unlisten(target, type, listener, options) {
      const index = listeners.findIndex((entry) => entry.target === target
        && entry.type === type && entry.listener === listener);
      if (index < 0) return false;
      const [entry] = listeners.splice(index, 1);
      try { entry.target.removeEventListener(entry.type, entry.listener, options ?? entry.options); } catch { /* Continue cleanup. */ }
      return true;
    },
    requestFrame(callback) {
      if (tornDown) return null;
      let id = null;
      id = env.requestFrame((timestamp) => {
        frames.delete(id);
        if (!tornDown) callback(timestamp);
      });
      frames.add(id);
      return id;
    },
    cancelFrame(id) {
      if (id === null || id === undefined) return;
      try { env.cancelFrame(id); } finally { frames.delete(id); }
    },
    cancelFrames() {
      for (const id of [...frames]) registry.cancelFrame(id);
    },
    timeout(callback, delay) {
      if (tornDown) return null;
      let id = null;
      id = env.setTimeout(() => {
        timers.delete(id);
        if (!tornDown) callback();
      }, delay);
      timers.add(id);
      return id;
    },
    clearTimeout(id) {
      if (id === null || id === undefined) return;
      try { env.clearTimeout(id); } finally { timers.delete(id); }
    },
    observe(observer, target, options) {
      if (tornDown || !observer) return null;
      observers.add(observer);
      if (target && typeof observer.observe === 'function') observer.observe(target, options);
      return observer;
    },
    addMediaCleanup(cleanup) {
      if (!tornDown && typeof cleanup === 'function') mediaCleanups.add(cleanup);
    },
    capture(surface, pointerId) {
      if (!tornDown) pointerCaptures.add({ surface, pointerId });
    },
    teardown() {
      if (tornDown) return registry.snapshot();
      tornDown = true;
      registry.cancelFrames();
      for (const id of [...timers]) registry.clearTimeout(id);
      for (const entry of [...listeners]) {
        try { entry.target.removeEventListener(entry.type, entry.listener, entry.options); } catch { /* Continue atomic cleanup. */ }
      }
      listeners.length = 0;
      for (const observer of [...observers]) {
        try { observer.disconnect?.(); } catch { /* Continue atomic cleanup. */ }
      }
      observers.clear();
      for (const cleanup of [...mediaCleanups]) {
        try { cleanup(); } catch { /* Continue atomic cleanup. */ }
      }
      mediaCleanups.clear();
      for (const capture of [...pointerCaptures]) {
        try {
          if (capture.surface?.hasPointerCapture?.(capture.pointerId)) capture.surface.releasePointerCapture(capture.pointerId);
        } catch { /* Pointer may already be gone. */ }
      }
      pointerCaptures.clear();
      return registry.snapshot();
    },
    snapshot() {
      return {
        loops: frames.size,
        timers: timers.size,
        observers: observers.size,
        gameOwnedListeners: listeners.length,
        mediaListeners: mediaCleanups.size,
        pointerCaptures: pointerCaptures.size,
        tornDown,
      };
    },
    get tornDown() { return tornDown; },
  };
  return registry;
}

function readOwnedStyle(element, properties) {
  return Object.fromEntries(properties.map((property) => [property, element?.style?.getPropertyValue(property) || '']));
}

function restoreOwnedStyle(element, snapshot) {
  if (!element?.style) return;
  for (const [property, value] of Object.entries(snapshot)) {
    if (value) element.style.setProperty(property, value);
    else element.style.removeProperty(property);
  }
  if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
}

/** Create and lock a transferable focus/scroll/inert session exactly once. */
export function createOverlaySession({ root, trigger = null, document: documentRef = root?.ownerDocument, window: windowRef = documentRef?.defaultView } = {}) {
  if (!root || !documentRef?.body || !documentRef.documentElement) throw new TypeError('OverlaySession requires a connected Game_Root.');
  const body = documentRef.body;
  const html = documentRef.documentElement;
  const styleProperties = ['position', 'top', 'left', 'right', 'width', 'overflow', 'padding-right'];
  const htmlProperties = ['overflow'];
  const activeElement = documentRef.activeElement;
  const scrollX = finite(windowRef?.scrollX);
  const scrollY = finite(windowRef?.scrollY);
  const siblingSnapshots = [...(root.parentElement?.children || [])]
    .filter((node) => node !== root)
    .map((node) => ({
      node,
      inertSupported: 'inert' in node,
      inert: 'inert' in node ? Boolean(node.inert) : undefined,
      ariaHidden: node.getAttribute('aria-hidden'),
    }));
  const snapshot = Object.freeze({
    activeElement,
    scrollX,
    scrollY,
    bodyStyles: Object.freeze(readOwnedStyle(body, styleProperties)),
    htmlStyles: Object.freeze(readOwnedStyle(html, htmlProperties)),
    bodyHadClass: body.classList.contains('cr-game-open'),
    siblingSnapshots,
  });
  let owner = 'bootstrap';
  let restoreCount = 0;
  let transferred = false;

  body.classList.add('cr-game-open');
  body.style.position = 'fixed';
  body.style.top = `${-scrollY}px`;
  body.style.left = `${-scrollX}px`;
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  const viewportWidth = finite(windowRef?.innerWidth, 0);
  const documentWidth = finite(html.clientWidth, 0);
  const scrollbarWidth = documentWidth > 0 ? Math.max(0, viewportWidth - documentWidth) : 0;
  if (scrollbarWidth > 0) {
    const currentPadding = Number.parseFloat(windowRef?.getComputedStyle?.(body)?.paddingRight || '0') || 0;
    body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
  }
  html.style.overflow = 'hidden';
  for (const entry of siblingSnapshots) {
    if (entry.inertSupported) entry.node.inert = true;
    else entry.node.setAttribute('aria-hidden', 'true');
  }

  const session = {
    snapshot,
    trigger,
    transferToEngine() {
      if (owner === 'restored') throw new Error('Cannot transfer a restored OverlaySession.');
      if (!transferred) {
        transferred = true;
        owner = 'engine';
      }
      return owner === 'engine';
    },
    restore(requester = owner) {
      if (owner === 'restored') return false;
      if (requester !== owner) return false;
      for (const entry of siblingSnapshots) {
        if (entry.inertSupported) entry.node.inert = entry.inert;
        if (entry.ariaHidden === null) entry.node.removeAttribute('aria-hidden');
        else entry.node.setAttribute('aria-hidden', entry.ariaHidden);
      }
      restoreOwnedStyle(body, snapshot.bodyStyles);
      restoreOwnedStyle(html, snapshot.htmlStyles);
      if (!snapshot.bodyHadClass) body.classList.remove('cr-game-open');
      try { windowRef?.scrollTo?.(scrollX, scrollY); } catch { /* Some embedded contexts disallow scrollTo. */ }
      const focusTarget = trigger?.isConnected ? trigger : activeElement?.isConnected ? activeElement : documentRef.querySelector('h1, h2');
      try { focusTarget?.focus?.({ preventScroll: true }); } catch { focusTarget?.focus?.(); }
      owner = 'restored';
      restoreCount += 1;
      return true;
    },
    get owner() { return owner; },
    get restoreCount() { return restoreCount; },
    get locked() { return owner !== 'restored'; },
  };
  return session;
}

function focusableElements(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

export function trapTabKey(event, container) {
  if (event?.key !== 'Tab') return false;
  const focusable = focusableElements(container);
  if (focusable.length === 0) return false;
  const current = container.ownerDocument.activeElement;
  let index = focusable.indexOf(current);
  if (index < 0) index = event.shiftKey ? 0 : -1;
  const next = (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
  event.preventDefault?.();
  focusable[next].focus();
  return true;
}

/** Fixed-step rAF adapter with one render per browser frame and event drain once. */
export function createGameLoop({
  getState,
  setState,
  step = stepGame,
  render = () => {},
  drainEvents = () => [],
  registry,
  env = createBrowserEnv(),
  onError = () => {},
  onFrame = () => {},
} = {}) {
  if (typeof getState !== 'function' || typeof setState !== 'function') throw new TypeError('Game loop requires state accessors.');
  const frames = registry || createLifecycleRegistry(env);
  let rafId = null;
  let running = false;
  let previousTimestamp = null;
  let accumulatorMs = 0;
  let lastPhase = null;

  const animated = (state) => state && state.documentVisible !== false
    && (state.phase === 'PLAYING'
      || (state.phase === 'READY' && nonNegative(state.readyElapsedMs) < PHYSICS.readyMinMs));
  const schedule = () => {
    if (!running || rafId !== null || !animated(getState())) return;
    rafId = frames.requestFrame(frame);
  };
  const stop = () => {
    running = false;
    if (rafId !== null) frames.cancelFrame(rafId);
    rafId = null;
    previousTimestamp = null;
    accumulatorMs = 0;
    lastPhase = null;
  };
  const frame = (timestamp) => {
    rafId = null;
    if (!running) return;
    try {
      let state = getState();
      if (!animated(state)) { stop(); return; }
      if (state.phase !== lastPhase) {
        previousTimestamp = timestamp;
        accumulatorMs = 0;
        lastPhase = state.phase;
      }
      const rawDelta = previousTimestamp === null ? 0 : Math.max(0, timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      accumulatorMs += Math.min(rawDelta, PHYSICS.fixedStepMs * PHYSICS.maxCatchUpSteps);
      let steps = 0;
      let firstStep = true;
      while (accumulatorMs + 1e-9 >= PHYSICS.fixedStepMs && steps < PHYSICS.maxCatchUpSteps) {
        const events = firstStep ? drainEvents() : [];
        state = step(state, { dtMs: PHYSICS.fixedStepMs, events });
        setState(state);
        accumulatorMs -= PHYSICS.fixedStepMs;
        if (Math.abs(accumulatorMs) < 1e-9) accumulatorMs = 0;
        firstStep = false;
        steps += 1;
        if (!animated(state)) break;
      }
      if (state.phase !== lastPhase) {
        previousTimestamp = timestamp;
        accumulatorMs = 0;
        lastPhase = state.phase;
      }
      render(state, accumulatorMs / PHYSICS.fixedStepMs, timestamp);
      onFrame(timestamp, state, steps);
      if (animated(state)) schedule();
      else stop();
    } catch (error) {
      stop();
      onError(error);
    }
  };
  return Object.freeze({
    start() {
      if (frames.tornDown) return false;
      const state = getState();
      if (!animated(state)) return false;
      if (running) { schedule(); return true; }
      running = true;
      previousTimestamp = env.now?.() ?? null;
      accumulatorMs = 0;
      lastPhase = state.phase;
      schedule();
      return true;
    },
    stop,
    resetTimestamp() { previousTimestamp = null; accumulatorMs = 0; lastPhase = null; },
    get running() { return running; },
    get rafId() { return rafId; },
    get accumulatorMs() { return accumulatorMs; },
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function achievementListMarkup(achievements = ACHIEVEMENTS) {
  return `<ol class="cr-fact-list">${achievements.map((achievement) => `
    <li class="cr-fact-card" data-achievement-id="${escapeHtml(achievement.id)}">
      <h3>${escapeHtml(achievement.title)}</h3><p>${escapeHtml(achievement.funFact)}</p>
    </li>`).join('')}</ol>`;
}

function statusMarkup(state) {
  const hud = projectHud(state);
  return `<div class="cr-hud" aria-hidden="true">
    <span class="cr-hud-score">${escapeHtml(hud.score)}</span>
    <span>Checkpoint ${state.checkpoint}</span>
    <span>${state.mode === GAME_MODES.NO_TIMER ? 'No Timer Mode' : `Active ${escapeHtml(hud.elapsed || formatActivePlayTime(state.activePlayMs))}`}</span>
  </div><button type="button" class="cr-control cr-pause" data-action="PAUSE">Pause</button>`;
}

function modalityHintMarkup(state) {
  const active = state.lastInputModality;
  const hint = active === 'keyboard' ? 'Space to boost' : active === 'touch' ? 'Tap to boost' : active === 'mouse' ? 'Click to boost' : 'Tap / Click / Space to boost';
  return `<p>Current control: <span class="cr-input-hint" data-input-hint aria-current="true">${escapeHtml(hint)}</span></p>
    <button type="button" class="cr-link-button" data-action="CONTROLS">Controls</button>
    <div class="cr-controls-guide" data-controls-guide hidden>
      <p><strong>Space:</strong> boost with keyboard.</p><p><strong>Click:</strong> boost with mouse.</p><p><strong>Tap:</strong> boost with touch.</p>
    </div>`;
}

function flightMarkup(state) {
  return `${statusMarkup(state)}
    <div class="cr-flight-surface" data-flight-surface tabindex="0" role="application" aria-label="Flight surface. Tap, click, or press Space to boost.">
      <canvas class="cr-canvas" data-game-canvas aria-hidden="true"></canvas>
    </div>
    <div class="cr-flight-controls">
      ${modalityHintMarkup(state)}
      <button type="button" class="cr-control" data-action="STATUS_REQUEST">Describe position</button>
    </div>`;
}

function screenMarkup(state) {
  switch (state.phase) {
    case 'INTRO':
      return `<section class="cr-screen cr-intro" data-screen="INTRO">
        <p>Guide one Deployment Bot through 12 Pipeline Gates and avoid labelled Bug Clouds. Boost to keep the deployment airborne and reach Production Saved.</p>
        <p class="cr-quick-guide"><strong>Tap / Click / Space to boost</strong><span>12 gates · 4 facts</span></p>
        <fieldset class="cr-mode-picker"><legend>Choose mode</legend>
          <label><input type="radio" name="cr-mode" value="STANDARD" ${state.mode === GAME_MODES.STANDARD ? 'checked' : ''}> Standard Mode</label>
          <label><input type="radio" name="cr-mode" value="NO_TIMER" ${state.mode === GAME_MODES.NO_TIMER ? 'checked' : ''}> No Timer — hide the live stopwatch</label>
        </fieldset>
        <div class="cr-actions"><button type="button" class="cr-primary" data-action="START">Start</button>
          <button type="button" data-action="VIEW_FACTS">View all facts</button>
          <button type="button" data-action="BACK">Back to Portfolio</button></div>
      </section>`;
    case 'ACCESSIBLE_FACTS':
      return `<section class="cr-screen" data-screen="ACCESSIBLE_FACTS"><h3 tabindex="-1" data-focus-heading>All career facts</h3>
        ${achievementListMarkup()}<button type="button" data-action="BACK_FACTS">Back to game intro</button></section>`;
    case 'READY':
    case 'PLAYING':
      return `<section class="cr-screen cr-flight" data-screen="FLIGHT"><h3 class="cr-visually-hidden" tabindex="-1" data-focus-heading>${state.phase === 'READY' ? 'Get ready' : 'Deployment in flight'}</h3>
        ${state.phase === 'READY' ? '<p class="cr-ready-feedback">Ready — tap, click or press Space</p>' : ''}${flightMarkup(state)}</section>`;
    case 'PAUSED':
      return `<section class="cr-screen" data-screen="PAUSED"><h3 tabindex="-1" data-focus-heading>Deployment Paused</h3>
        <p>${escapeHtml(projectDomStatus(state))}</p>${modalityHintMarkup(state)}
        <div class="cr-actions"><button type="button" class="cr-primary" data-action="RESUME">Resume</button>
          <button type="button" data-action="RESTART_CHECKPOINT">Restart checkpoint</button>
          <button type="button" data-action="EXIT">Exit</button></div></section>`;
    case 'CRASHED':
      return `<section class="cr-screen cr-failure" data-screen="CRASHED"><h3 tabindex="-1" data-focus-heading>Deployment Failed</h3>
        <p data-failure-cause>${escapeHtml(FAILURE_TEXT[state.lastFailure] || 'Deployment failed safely')}</p>
        <p>${escapeHtml(`Gate ${state.gateScore}/12 · Checkpoint ${state.checkpoint}`)}</p>
        <div class="cr-actions"><button type="button" class="cr-primary" data-action="RETRY">Retry from checkpoint</button>
          <button type="button" data-action="EXIT">Exit</button></div></section>`;
    case 'ACHIEVEMENT': {
      const achievement = ACHIEVEMENT_BY_ID[state.unlockedAchievementIds.at(-1)] || ACHIEVEMENTS[0];
      return `<section class="cr-screen cr-achievement" data-screen="ACHIEVEMENT"><div class="cr-badge ${state.achievementEffectElapsedMs < 3000 ? 'cr-badge--active' : ''}" aria-hidden="true">★</div>
        <h3 tabindex="-1" data-focus-heading data-achievement-title>${escapeHtml(achievement.title)}</h3>
        <p data-achievement-fact>${escapeHtml(achievement.funFact)}</p>
        <p data-achievement-progress>${state.unlockedAchievementIds.length}/4 unlocked</p>
        <button type="button" class="cr-primary" data-action="CONTINUE">Continue</button></section>`;
    }
    case 'WON': {
      const summary = createWonSummary(state);
      return `<section class="cr-screen cr-result" data-screen="WON"><h3 tabindex="-1" data-focus-heading>Production Saved!</h3>
        <p><strong>${escapeHtml(summary.gameTitle)}</strong></p><p class="cr-result-score">${escapeHtml(summary.score)}</p>
        <p>${escapeHtml(summary.activePlayTime)}</p>${summary.durationNote ? `<p>${escapeHtml(summary.durationNote)}</p>` : ''}
        ${achievementListMarkup(summary.achievements)}
        <div class="cr-actions"><button type="button" class="cr-primary" data-action="PLAY_AGAIN">Play Again</button>
          <button type="button" data-action="BACK">Back to Portfolio</button></div></section>`;
    }
    case 'RUNTIME_ERROR':
      return `<section class="cr-screen cr-error" data-screen="RUNTIME_ERROR" role="alert"><h3 tabindex="-1" data-focus-heading>Cloud Rescue stopped safely</h3>
        <p>The mini-game encountered an error. Your portfolio data is unchanged.</p>
        <button type="button" class="cr-primary" data-action="BACK">Back to Portfolio</button></section>`;
    default:
      return `<section class="cr-screen" data-screen="${escapeHtml(state.phase)}"><p>${escapeHtml(projectDomStatus(state))}</p></section>`;
  }
}

function failureAnnouncement(state) {
  return FAILURE_TEXT[state.lastFailure] || 'Deployment failed';
}

function screenKey(phase) {
  return phase === 'READY' || phase === 'PLAYING' ? 'FLIGHT' : phase;
}

function resizeCanvas(controller) {
  const canvas = controller.root.querySelector('[data-game-canvas]');
  if (!canvas) return null;
  const surface = controller.root.querySelector('[data-flight-surface]');
  const surfaceRect = surface?.getBoundingClientRect?.();
  const measuredWidth = finite(surface?.clientWidth, 0) || finite(surfaceRect?.width, 0);
  const viewportWidth = Math.max(1, finite(controller.env.innerWidth, WORLD.width));
  const fallbackGutter = viewportWidth < 480 ? 32 : viewportWidth < 768 ? 48 : 64;
  const availableWidth = measuredWidth || Math.max(1, Math.min(1100, viewportWidth - fallbackGutter));
  const availableHeight = Math.max(1, Math.min(
    finite(controller.env.innerHeight, WORLD.height) * 0.64,
    availableWidth * WORLD.height / WORLD.width,
  ));
  const size = computeCanvasSize(availableWidth, availableHeight, controller.env.devicePixelRatio);
  canvas.style.width = `${size.cssWidth}px`;
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = `${WORLD.width} / ${WORLD.height}`;
  canvas.width = size.backingWidth;
  canvas.height = size.backingHeight;
  controller.canvasSize = size;
  return size;
}

function focusForPhase(controller) {
  const target = controller.state.phase === 'INTRO'
    ? controller.title
    : controller.state.phase === 'READY'
      ? controller.root.querySelector('[data-flight-surface]')
      : controller.root.querySelector('[data-focus-heading], [data-action="BACK"], button');
  try { target?.focus?.({ preventScroll: true }); } catch { target?.focus?.(); }
}

function syncStatus(controller) {
  const status = controller.root.querySelector('[data-dom-status]');
  const projectedStatus = projectDomStatus(controller.state);
  if (status && status.textContent !== projectedStatus) status.textContent = projectedStatus;
  const score = controller.root.querySelector('.cr-hud-score');
  if (score) score.textContent = `Gate ${controller.state.gateScore}/12`;
  const hint = controller.root.querySelector('[data-input-hint]');
  if (hint) {
    hint.textContent = controller.state.lastInputModality === 'keyboard' ? 'Space to boost'
      : controller.state.lastInputModality === 'touch' ? 'Tap to boost'
        : controller.state.lastInputModality === 'mouse' ? 'Click to boost' : 'Tap / Click / Space to boost';
  }
  const surface = controller.root.querySelector('[data-flight-surface]');
  if (surface) {
    const gate = getNextGate(controller.state);
    surface.dataset.fcPhase = controller.state.phase;
    surface.dataset.fcBotY = String(controller.state.bot.y);
    surface.dataset.fcBotVy = String(controller.state.bot.vy);
    surface.dataset.fcTargetY = String(gate ? (gate.gapTop + gate.gapBottom) / 2 - controller.state.bot.height / 2 : 250);
  }
}

function installFlightInput(controller) {
  controller.inputController?.destroy?.();
  const surface = controller.root.querySelector('[data-flight-surface]');
  if (!surface) { controller.inputController = null; return; }
  controller.inputController = createInputController({
    surface,
    getPhase: () => controller.state.phase,
    dispatch: (event) => controller.dispatch(event),
    registry: controller.registry,
  });
}

function applyScreenMarkup(screen, markup) {
  screen.innerHTML = markup;
}

function renderMountedState(controller, { focus = false } = {}) {
  controller.overlay?.classList.toggle('cr-reduced-motion', Boolean(controller.state.reducedMotion));
  const key = screenKey(controller.state.phase);
  if (key !== controller.renderedScreen) {
    controller.domRenderer(controller.screen, screenMarkup(controller.state), controller.state);
    controller.renderedScreen = key;
    installFlightInput(controller);
    resizeCanvas(controller);
  }
  syncStatus(controller);
  const canvas = controller.root.querySelector('[data-game-canvas]');
  if (canvas) {
    const context = canvas.getContext?.('2d');
    const size = controller.canvasSize || resizeCanvas(controller);
    if (context && size) {
      try {
        controller.renderer(context, controller.state, {
          palette: controller.tokenCache.read(),
          timestamp: controller.lastRenderTimestamp,
          scaleX: size.backingWidth / WORLD.width,
          scaleY: size.backingHeight / WORLD.height,
        });
      } catch (error) {
        canvas.hidden = true;
        let fallback = controller.root.querySelector('[data-render-fallback]');
        if (!fallback) {
          fallback = controller.document.createElement('p');
          fallback.dataset.renderFallback = 'true';
          fallback.textContent = 'Visual effects are unavailable; controls and game status remain active.';
          canvas.insertAdjacentElement('afterend', fallback);
        }
        if (!error?.decorative) throw error;
      }
    }
  }
  if (focus) focusForPhase(controller);
}

function announceStateTransition(controller, previous, next) {
  if (previous.phase === 'ACHIEVEMENT' && next.phase !== 'ACHIEVEMENT' && controller.achievementTimer !== null) {
    controller.registry.clearTimeout(controller.achievementTimer);
    controller.achievementTimer = null;
  }
  if (previous.phase === next.phase && previous.gateScore === next.gateScore) return;
  if (next.phase === 'PAUSED') controller.announcements.enqueue({ id: `pause-${next.revision}`, message: 'Deployment paused' });
  if (next.phase === 'CRASHED') controller.announcements.enqueue({ id: `collision-${next.revision}`, message: failureAnnouncement(next), priority: 'alert' });
  if (next.phase === 'ACHIEVEMENT') {
    const item = ACHIEVEMENT_BY_ID[next.unlockedAchievementIds.at(-1)];
    if (item) controller.announcements.enqueue({ id: `achievement-${item.id}`, message: `${item.title}. ${item.funFact}` });
    if (next.checkpoint > previous.checkpoint) {
      controller.announcements.enqueue({ id: `checkpoint-${next.checkpoint}`, message: `Checkpoint ${next.checkpoint} committed` });
    }
    if (controller.achievementTimer !== null) controller.registry.clearTimeout(controller.achievementTimer);
    controller.achievementTimer = controller.registry.timeout(() => {
      controller.achievementTimer = null;
      if (controller.state.phase !== 'ACHIEVEMENT') return;
      controller.state = { ...controller.state, achievementEffectElapsedMs: 3000, revision: controller.state.revision + 1 };
      controller.root.querySelector('.cr-badge')?.classList.remove('cr-badge--active');
    }, 3000);
  }
  if (next.phase === 'WON') controller.announcements.enqueue({ id: 'production-saved', message: 'Production Saved! Gate 12 of 12. Four achievements unlocked.' });
  if (next.gateScore > previous.gateScore) controller.announcements.enqueue({ id: `gate-pass-${next.gateScore}`, message: `Gate ${next.gateScore} passed` });
}

function setupMountedObservers(controller) {
  const media = controller.env.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = (event) => controller.dispatch({ type: 'REDUCED_MOTION_CHANGED', value: event.matches }, true);
  if (media?.addEventListener) media.addEventListener('change', onMotion);
  else media?.addListener?.(onMotion);
  controller.registry.addMediaCleanup(() => {
    if (media?.removeEventListener) media.removeEventListener('change', onMotion);
    else media?.removeListener?.(onMotion);
  });

  let resizeTimer = null;
  const rootRect = controller.root.getBoundingClientRect?.();
  let lastViewportWidth = finite(rootRect?.width, 0) || finite(controller.env.innerWidth, 0);
  let lastViewportHeight = finite(rootRect?.height, 0) || finite(controller.env.innerHeight, 0);
  const onResize = (entries = []) => {
    const contentRect = entries.at?.(-1)?.contentRect;
    const currentRootRect = controller.root.getBoundingClientRect?.();
    const width = finite(contentRect?.width, 0) || finite(currentRootRect?.width, 0) || finite(controller.env.innerWidth, 0);
    const height = finite(contentRect?.height, 0) || finite(currentRootRect?.height, 0) || finite(controller.env.innerHeight, 0);
    const observerNotification = entries.length > 0;
    if (observerNotification
      && Math.abs(width - lastViewportWidth) < 0.5
      && Math.abs(height - lastViewportHeight) < 0.5) return;
    lastViewportWidth = width;
    lastViewportHeight = height;
    if (controller.state.phase === 'PLAYING' || controller.state.phase === 'READY') controller.dispatch({ type: 'VIEWPORT_CHANGED' }, true);
    if (resizeTimer !== null) controller.registry.clearTimeout(resizeTimer);
    resizeTimer = controller.registry.timeout(() => {
      resizeTimer = null;
      resizeCanvas(controller);
      controller.dispatch({ type: 'RESIZE_COMPLETE' }, true);
    }, 120);
  };
  const observer = controller.env.createResizeObserver?.(onResize);
  if (observer) controller.registry.observe(observer, controller.root);
  else controller.registry.listen(controller.window, 'resize', onResize);

  const MutationObserverCtor = controller.window?.MutationObserver;
  if (MutationObserverCtor) {
    const themeObserver = new MutationObserverCtor(() => controller.tokenCache.invalidate());
    controller.registry.observe(themeObserver, controller.document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  }
  controller.registry.listen(controller.document, 'visibilitychange', () => {
    controller.dispatch({ type: controller.document.hidden ? 'VISIBILITY_HIDDEN' : 'VISIBILITY_VISIBLE' }, true);
  });
}

function createMountedController(options, overlaySession) {
  const root = options.root;
  const documentRef = root.ownerDocument;
  const windowRef = documentRef.defaultView || globalThis;
  const env = options.env || createBrowserEnv(windowRef);
  const registry = createLifecycleRegistry(env);
  const media = env.matchMedia('(prefers-reduced-motion: reduce)');
  const state = options.state ? cloneGameState(options.state) : createInitialState(options.mode, { reducedMotion: Boolean(media?.matches) });
  const controller = {
    root,
    trigger: options.trigger || overlaySession.trigger,
    onClose: options.onClose,
    overlaySession,
    document: documentRef,
    window: windowRef,
    env,
    registry,
    state,
    eventQueue: [],
    renderer: options.renderer || renderCanvas,
    domRenderer: options.domRenderer || applyScreenMarkup,
    reducer: options.reducer || reduceGameEvent,
    tokenCache: createTokenCache({ element: documentRef.documentElement }),
    renderedScreen: null,
    canvasSize: null,
    inputController: null,
    lastRenderTimestamp: 0,
    achievementTimer: null,
    closing: false,
    generation: 1,
  };

  const writeAnnouncement = (message, priority) => {
    if (!controller.liveRegion) return;
    controller.liveRegion.setAttribute('role', priority === 'alert' ? 'alert' : 'status');
    controller.liveRegion.textContent = '';
    controller.liveRegion.textContent = message;
  };
  controller.announcements = createAnnouncementQueue({
    write: writeAnnouncement,
    now: env.now,
    setTimer: registry.timeout,
    clearTimer: registry.clearTimeout,
  });

  controller.fail = (error) => {
    if (controller.closing || controller.state.phase === 'RUNTIME_ERROR') return;
    controller.loop?.stop();
    registry.cancelFrames();
    controller.eventQueue.length = 0;
    controller.state = { ...controller.state, phase: 'RUNTIME_ERROR', runtimeError: String(error?.message || error), revision: controller.state.revision + 1 };
    controller.domRenderer = applyScreenMarkup;
    controller.renderedScreen = null;
    try { renderMountedState(controller, { focus: true }); } catch { close('runtime-error'); }
  };

  controller.commit = (next, { focus = false } = {}) => {
    const previous = controller.state;
    controller.state = next;
    announceStateTransition(controller, previous, next);
    const phaseChanged = screenKey(previous.phase) !== screenKey(next.phase);
    if (phaseChanged) controller.renderedScreen = null;
    renderMountedState(controller, { focus: focus || phaseChanged });
    if (next.phase === 'READY' || next.phase === 'PLAYING') controller.loop?.start();
    else controller.loop?.stop();
  };

  controller.dispatch = (event, immediate = false) => {
    if (controller.closing || !event) return;
    try {
      if (event.type === 'CLOSE') { close('user'); return; }
      if (event.type === 'STATUS_REQUEST') {
        const spatial = describeSpatialStatus(controller.state);
        controller.announcements.enqueue({ id: `status-${controller.state.revision}-${spatial.gate ?? 'none'}`, message: spatial.message });
        return;
      }
      if (event.type === 'JUMP' && controller.state.phase === 'READY' && !immediate) {
        const next = controller.reducer(controller.state, event);
        if (next !== controller.state) controller.commit(next);
        return;
      }
      if (event.type === 'JUMP' && controller.state.phase === 'PLAYING' && !immediate) {
        controller.eventQueue.push(event);
        controller.loop.start();
        return;
      }
      const next = controller.reducer(controller.state, event);
      if (next !== controller.state) controller.commit(next, { focus: ['RESUME', 'RETRY', 'CONTINUE'].includes(event.type) });
    } catch (error) { controller.fail(error); }
  };

  const sampler = createFpsSampler({ onDegrade: () => {
    if (!controller.state.performanceDegraded || controller.state.effectLevel !== 'reduced') {
      controller.state = {
        ...controller.state,
        performanceDegraded: true,
        effectLevel: 'reduced',
        revision: controller.state.revision + 1,
      };
    }
  } });
  controller.loop = createGameLoop({
    getState: () => controller.state,
    setState: (next) => {
      const previous = controller.state;
      controller.state = next;
      announceStateTransition(controller, previous, next);
      if (screenKey(previous.phase) !== screenKey(next.phase)) controller.renderedScreen = null;
      const approached = collectApproachAnnouncements(controller.state);
      controller.state = approached.state;
      for (const item of approached.announcements) controller.announcements.enqueue(item);
    },
    step: (current, frame) => stepGame(current, frame),
    render: (current, interpolation, timestamp) => {
      controller.lastRenderTimestamp = timestamp;
      renderMountedState(controller, { focus: screenKey(current.phase) !== controller.renderedScreen });
    },
    drainEvents: () => controller.eventQueue.splice(0),
    registry,
    env,
    onFrame: (timestamp, current) => sampler.sample(timestamp, current.phase),
    onError: controller.fail,
  });
  return controller;
}

function mountController(controller) {
  const overlay = controller.document.createElement('div');
  overlay.className = `cr-overlay${controller.state.reducedMotion ? ' cr-reduced-motion' : ''}`;
  overlay.dataset.flappyCloudGame = 'true';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cr-title');
  overlay.setAttribute('aria-describedby', 'cr-description');
  const panel = controller.document.createElement('section');
  panel.className = 'cr-panel';
  panel.innerHTML = `<header class="cr-header"><div><h2 id="cr-title" tabindex="-1">Deploy Before Dawn: Cloud Rescue</h2>
    <p id="cr-description">Fly the Deployment Bot through 12 Pipeline Gates, avoid Bug Clouds, and save production.</p></div>
    <button type="button" class="cr-close" data-action="CLOSE" aria-label="Close Deploy Before Dawn: Cloud Rescue">×</button></header>
    <main class="cr-screen-host" data-screen-host></main>
    <p class="cr-dom-status cr-visually-hidden" data-dom-status role="status" aria-live="off" aria-atomic="true"></p>
    <div class="cr-live cr-visually-hidden" data-live-region role="status" aria-live="polite" aria-atomic="true"></div>`;
  overlay.append(panel);
  controller.root.replaceChildren(overlay);
  controller.root.hidden = false;
  controller.overlay = overlay;
  controller.panel = panel;
  controller.screen = panel.querySelector('[data-screen-host]');
  controller.title = panel.querySelector('#cr-title');
  controller.liveRegion = panel.querySelector('[data-live-region]');

  controller.registry.listen(overlay, 'click', (event) => {
    const actionNode = event.target.closest?.('[data-action]');
    if (!actionNode || actionNode.disabled) return;
    const action = actionNode.dataset.action;
    if (action === 'CLOSE' || action === 'BACK' || action === 'EXIT') { close(action.toLowerCase()); return; }
    if (action === 'CONTROLS') {
      const guide = controller.root.querySelector('[data-controls-guide]');
      if (guide) guide.hidden = !guide.hidden;
      return;
    }
    if (action === 'START') {
      const selected = controller.root.querySelector('input[name="cr-mode"]:checked')?.value || controller.state.mode;
      controller.dispatch({ type: 'START', mode: selected }, true);
      return;
    }
    controller.dispatch({ type: action }, true);
  });
  controller.registry.listen(overlay, 'keydown', (event) => {
    if (event.key === 'Tab') {
      if (controller.state.phase === 'PLAYING') controller.dispatch({ type: 'TAB_AWAY' }, true);
      trapTabKey(event, controller.overlay);
      return;
    }
    const key = String(event.key || '').toLowerCase();
    if (event.key === 'Escape') {
      if (controller.state.phase === 'PLAYING') controller.dispatch({ type: 'PAUSE' }, true);
      else if (['INTRO', 'WON', 'RUNTIME_ERROR'].includes(controller.state.phase)) close('escape');
      return;
    }
    if ((key === 'p' || event.code === 'KeyP') && controller.state.phase === 'PLAYING' && !event.repeat) {
      event.preventDefault();
      controller.dispatch({ type: 'PAUSE' }, true);
    }
    if ((key === 's' || event.code === 'KeyS') && !isInteractiveControl(event.target) && !event.repeat) {
      event.preventDefault();
      controller.dispatch({ type: 'STATUS_REQUEST' }, true);
    }
  });
  renderMountedState(controller, { focus: true });
  setupMountedObservers(controller);
  controller.loop.start();
}

let activeCoreSession = null;

/**
 * Mount the canonical game. A rootless call remains a side-effect-free headless
 * facade for pure tests; production always passes Game_Root + OverlaySession.
 */
export function open(options = {}) {
  if (activeCoreSession) return activeCoreSession.state;
  if (!options.root) {
    const state = options.state ? cloneGameState(options.state) : createInitialState(options.mode, options);
    activeCoreSession = { state, headless: true, closing: false };
    return state;
  }
  const root = options.root;
  if (!root?.ownerDocument?.body) throw new TypeError('Cloud Rescue requires a valid Game_Root.');
  const session = options.overlaySession || createOverlaySession({ root, trigger: options.trigger });
  let adopted = false;
  let controller = null;
  try {
    if (typeof session.transferToEngine !== 'function' || !session.transferToEngine()) throw new TypeError('Cloud Rescue requires a transferable OverlaySession.');
    adopted = true;
    controller = createMountedController(options, session);
    activeCoreSession = controller;
    mountController(controller);
    return controller.state;
  } catch (error) {
    controller?.loop?.stop?.();
    controller?.registry?.teardown?.();
    try { root.replaceChildren(); root.hidden = true; } catch { /* Continue ownership restoration. */ }
    if (adopted) session.restore?.('engine');
    activeCoreSession = null;
    throw error;
  }
}

export function close(reason = 'user') {
  const controller = activeCoreSession;
  if (!controller || controller.closing) return false;
  controller.closing = true;
  controller.generation = (controller.generation || 0) + 1;
  if (controller.headless) {
    activeCoreSession = null;
    return true;
  }
  controller.loop?.stop?.();
  controller.registry?.cancelFrames?.();
  controller.eventQueue.length = 0;
  controller.announcements?.destroy?.();
  controller.inputController?.destroy?.();
  const result = controller.registry?.teardown?.();
  try { controller.root.replaceChildren(); controller.root.hidden = true; } catch { /* Restoration still must run. */ }
  controller.overlaySession?.restore?.('engine');
  activeCoreSession = null;
  try { controller.onClose?.(reason, result); } catch { /* Portfolio callbacks cannot break teardown. */ }
  return true;
}

export function isOpen() {
  return activeCoreSession !== null;
}

export function getStateSnapshot() {
  return activeCoreSession?.state ? cloneGameState(activeCoreSession.state) : null;
}

export function getLifecycleSnapshot() {
  return activeCoreSession?.registry?.snapshot?.() || {
    loops: 0, timers: 0, observers: 0, gameOwnedListeners: 0,
    mediaListeners: 0, pointerCaptures: 0, tornDown: !activeCoreSession,
  };
}

/**
 * Pure fixed-step adapter used by tests and the later browser loop. Events are
 * indexed by simulation step, so changing refresh-frame grouping cannot move an
 * input between physics steps. A single refresh frame performs at most five
 * catch-up steps and drops excess whole-step backlog safely.
 */
export function advanceFixedFrames(state, frameDeltas, eventsByStep = []) {
  let current = state;
  let accumulatorMs = 0;
  let simulationStep = 0;
  let droppedMs = 0;
  const fixed = PHYSICS.fixedStepMs;
  const maxFrameDelta = fixed * PHYSICS.maxCatchUpSteps;
  for (const rawDelta of frameDeltas) {
    const raw = nonNegative(rawDelta);
    const accepted = Math.min(raw, maxFrameDelta);
    droppedMs += raw - accepted;
    accumulatorMs += accepted;
    let stepsThisFrame = 0;
    while (accumulatorMs + 1e-9 >= fixed && stepsThisFrame < PHYSICS.maxCatchUpSteps) {
      current = stepGame(current, {
        dtMs: fixed,
        events: eventsByStep[simulationStep] || [],
      });
      accumulatorMs -= fixed;
      if (Math.abs(accumulatorMs) < 1e-10) accumulatorMs = 0;
      simulationStep += 1;
      stepsThisFrame += 1;
    }
    if (stepsThisFrame === PHYSICS.maxCatchUpSteps && accumulatorMs >= fixed) {
      const discarded = accumulatorMs - (accumulatorMs % fixed);
      accumulatorMs -= discarded;
      droppedMs += discarded;
    }
  }
  return { state: current, accumulatorMs, simulationStep, droppedMs };
}

export const FlappyCloudEngine = Object.freeze({ open, close, isOpen });
export const CloudRescueEngine = FlappyCloudEngine;
export default FlappyCloudEngine;
