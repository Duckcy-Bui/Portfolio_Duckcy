import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { aggregateUsabilitySessions } from '../../evidence/tools/fc-usability-aggregate.mjs';
import { summarizeObservation } from '../../evidence/tools/fc-usability-record.mjs';
import { buildPayloadLedger, PAYLOAD_LIMIT_BYTES } from '../../scripts/fc-payload.mjs';
import {
  validateAccessibilityEvidence,
  validateLifecycleEvidence,
  validatePerformanceEvidence,
  validateUsabilityEvidence,
} from '../../scripts/fc-evidence.mjs';
import { FINAL_SUPPORTING_PATHS, validateFinalManifestShape, validateProductionBuildEvidence } from '../../scripts/fc-finalize.mjs';
import { computeSourceDigest, currentProvenance, readCommitSha } from '../../scripts/fc-provenance.mjs';
import { CORE_BUILD_ASSETS, canonicalJson, sha256, verifyUsabilityBundle } from '../../scripts/fc-usability-chain.mjs';
import { collectActivationResourceTiming, collectUniqueResourceTiming, fpsFromFrameIntervals } from '../../scripts/fc-performance.mjs';
import { summarizeLighthouseRuns } from '../../scripts/fc-lighthouse.mjs';
import { createStaticServer, isCompressible } from '../../scripts/fc-serve.mjs';

const readJson = (path) => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));

function provenance() {
  return {
    commitSha: 'a'.repeat(40),
    sourceDigest: 'b'.repeat(64),
    sourceScope: 'fc-source-v1',
  };
}

function usabilityFixture() {
  return {
    schemaVersion: 1,
    isRealEvidence: false,
    provenance: provenance(),
    studyId: 'fixture-study',
    rawEvidence: {
      bundlePath: 'evidence/usability-raw-bundle.json',
      bundleSha256: 'd'.repeat(64),
      sessionCount: 5,
      publicKeySha256: 'e'.repeat(64),
    },
    participants: [38, 42, 45, 49, 55].map((seconds, index) => ({
      participantId: `P-${index + 1}X`,
      isDeveloper: false,
      startTimestampMs: index * 100000,
      wonTimestampMs: index * 100000 + seconds * 1000,
      durationMs: seconds * 1000,
      retries: index % 2,
      completed: true,
    })),
  };
}

function accessibilityFixture() {
  return {
    schemaVersion: 1,
    isRealEvidence: false,
    provenance: provenance(),
    runs: [{
      runId: 'A11Y-FIXTURE-01',
      os: { name: 'Example OS', version: '14.5.1' },
      browser: { name: 'Example Browser', version: '126.0.6478.127' },
      screenReader: { name: 'Example Reader', version: '2026.1.0' },
      realBrowserRun: true,
      keyboardOnly: true,
      announcements: true,
      focusTrap: true,
      focusRestore: true,
      reducedMotion: true,
      noTimer: true,
      zoomAndViewport: true,
    }],
  };
}

function metadata() {
  return {
    commit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), sourceScope: 'fc-source-v1',
    build: 'node scripts/fc-build.mjs --minify', buildRoot: 'build/fc-production', server: 'fixture-server',
    device: 'fixture-device', cpu: 'fixture-cpu', ramGb: 4,
    os: 'Example OS 14.5.1', browserVersion: 'Example Browser 126.0.6478.127',
    browserMode: 'headed-foreground', browserProduct: 'Chrome/126.0.6478.127', testedUrl: 'https://site.test/',
    viewport: { width: 360, height: 800 }, dpr: 1,
    powerState: 'plugged-in', thermalState: 'nominal',
    cpuThrottleRate: 2, cpuQuotaPercent: 200, memoryLimitMb: 3072, hardwareConcurrency: 8,
    runtimeLimits: { cgroupPath: '/fixture', memoryMaxBytes: 4 * 1024 ** 3, cpuQuotaMicros: 200000, cpuPeriodMicros: 100000, cpuQuotaPercent: 200 },
    cpuCalibration: { configuredRate: 2, baselineDurationMs: 10, throttledDurationMs: 20, observedSlowdown: 2 },
    referenceQualification: {
      qualified: true,
      method: 'cdp-cpu-throttling',
      referenceProfile: 'fixture reference',
      cpuThrottleRate: 2,
      observedCpuSlowdown: 2,
      referenceRamGb: 4,
      profileRamGb: 4,
      comparisons: [{
        metric: 'fixture benchmark', hostScore: 200, referenceScore: 110,
        effectiveProfileScore: 100, sourceUrl: 'https://example.test/benchmark',
      }],
    },
  };
}

function performanceRun(fps) {
  const frameIntervals = Array.from({ length: fps * 30 }, () => 1000 / fps);
  return {
    medianFps: fps,
    frameIntervals,
    warmupPlayingMs: 5000,
    sampledPlayingMs: 30000,
    sampledIntervalMs: frameIntervals.reduce((total, interval) => total + interval, 0),
    wallDurationMs: 40000,
    foregroundAtActivation: { visibilityState: 'visible', hasFocus: true },
    preActivationGameResources: [],
    retryCount: 0,
  };
}

function lighthouseFixture() {
  const lcpRunsMs = [2000, 2100, 2200, 2300, 2400];
  const clsRuns = [0.02, 0.03, 0.04, 0.05, 0.06];
  return {
    runs: lcpRunsMs.map((lcpMs, index) => ({
      run: index + 1,
      lcpMs,
      cls: clsRuns[index],
      gameplayResources: [],
      rawReportSha256: String(index + 1).repeat(64),
    })),
    lcpRunsMs,
    clsRuns,
    medianLcpMs: 2200,
    medianCls: 0.04,
    profile: { viewport: { width: 360, height: 800 }, dpr: 1, cpuSlowdown: 4, rttMs: 150, downlinkKbps: 1600, uplinkKbps: 750, coldCache: true },
    lighthouseVersion: '13.4.1',
    chromiumVersion: 'Chrome 126.0.6478.127',
    testedUrl: 'https://site.test/',
  };
}

function resourceTimingFixture(payload) {
  const resources = payload.resources.map((entry) => ({ url: `https://site.test/${entry.url}`, encodedBytes: entry.encodedBytes }));
  return {
    allResources: resources,
    gameResources: resources,
    unexpectedGameResources: [],
    preActivationGameResources: [],
    resources,
    totalEncodedBytes: payload.totalEncodedBytes,
  };
}

function signedUsabilityChainFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const build = {
    digest: 'f'.repeat(64),
    files: CORE_BUILD_ASSETS.map((path, index) => ({ path, bytes: index + 10, sha256: String(index + 1).repeat(64) })),
  };
  const buildBytes = Buffer.from(JSON.stringify(build));
  const servedAssets = Object.fromEntries(build.files.map((entry) => [entry.path, { bytes: entry.bytes, sha256: entry.sha256 }]));
  const sessions = [38, 42, 45, 49, 55].map((seconds, index) => {
    const startTimestampMs = 1_000_000 + index * 100_000;
    const payload = {
      schemaVersion: 1,
      kind: 'flappy-cloud-human-usability-session',
      studyId: 'fixture-study',
      participantId: `P-${index + 1}X`,
      capturedAt: new Date(index * 1000).toISOString(),
      provenance: provenance(),
      attestation: { realHuman: true, nonDeveloper: true, facilitatorPresent: true, interactiveBeginAndComplete: true },
      browser: { mode: 'headed-foreground', product: 'Chrome/149.0', userAgent: 'Chrome/149.0', protocolVersion: '1.3' },
      testedUrl: 'https://site.test/',
      productionBuild: { manifestSha256: sha256(buildBytes), digest: build.digest, servedAssets },
      observation: {
        startTimestampMs,
        wonTimestampMs: startTimestampMs + seconds * 1000,
        durationMs: seconds * 1000,
        retries: index % 2,
        trustedInputCount: 3,
        trustedGameplayInputCount: 2,
        startTrustedInputAgeMs: 12,
        trustedEventTypeCounts: { pointerdown: 1, keydown: 2, touchstart: 0 },
        attentionViolationCount: 0,
        startForeground: true,
        wonForeground: true,
        transitions: [
          { phase: 'READY', atMs: startTimestampMs - 100, reason: 'mutation', visibility: 'visible', focused: true },
          { phase: 'PLAYING', atMs: startTimestampMs, reason: 'mutation', visibility: 'visible', focused: true },
          { phase: 'WON', atMs: startTimestampMs + seconds * 1000, reason: 'mutation', visibility: 'visible', focused: true },
        ],
        protocolMethods: ['Page.enable', 'Runtime.evaluate'],
        inputProtocolCallCount: 0,
      },
    };
    const payloadBytes = Buffer.from(canonicalJson(payload));
    return {
      ...payload,
      integrity: {
        algorithm: 'sha256+Ed25519',
        payloadSha256: sha256(payloadBytes),
        signatureBase64: sign(null, payloadBytes, privateKey).toString('base64'),
      },
    };
  });
  const participants = sessions.map((session) => ({
    participantId: session.participantId,
    isDeveloper: false,
    startTimestampMs: session.observation.startTimestampMs,
    wonTimestampMs: session.observation.wonTimestampMs,
    durationMs: session.observation.durationMs,
    retries: session.observation.retries,
    completed: true,
  }));
  const publicKeySha256 = sha256(Buffer.from(publicKeyPem));
  const evidence = {
    schemaVersion: 1,
    isRealEvidence: true,
    provenance: provenance(),
    studyId: 'fixture-study',
    rawEvidence: { bundlePath: 'evidence/usability-raw-bundle.json', bundleSha256: 'd'.repeat(64), sessionCount: 5, publicKeySha256 },
    participants,
  };
  const bundle = {
    schemaVersion: 1,
    kind: 'flappy-cloud-human-usability-bundle',
    createdAt: new Date(0).toISOString(),
    provenance: provenance(),
    studyId: 'fixture-study',
    publicKeyPem,
    publicKeySha256,
    sessions,
  };
  return { bundle, evidence, build, buildBytes };
}

describe('payload and performance evidence tooling', () => {
  it('serves active assets with reproducible production-like gzip encoding', async () => {
    expect(isCompressible('text/css; charset=utf-8')).toBe(true);
    expect(isCompressible('image/png')).toBe(false);
    const staticServer = createStaticServer({ root: process.cwd(), port: 0 });
    const address = await staticServer.listen();
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/game/fc-engine.js`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(response.headers.get('vary')).toBe('Accept-Encoding');
      expect(await response.text()).toContain('createOverlaySession');
    } finally {
      await staticServer.close();
    }
  });

  it('measures deterministic unique active resources under the 150KB budget', async () => {
    const first = await buildPayloadLedger(process.cwd());
    const second = await buildPayloadLedger(process.cwd());
    expect(second).toEqual(first);
    expect(first.passed).toBe(true);
    expect(first.limitBytes).toBe(PAYLOAD_LIMIT_BYTES);
    expect(first.totalEncodedBytes).toBeLessThanOrEqual(150000);
    expect(first.resources.map((entry) => entry.url)).toEqual(['game/fc-engine.js', 'game/fc-overlay.css']);
    expect(first.resources.every((entry) => entry.measurement === 'gzip-9-n-equivalent')).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/cr-engine\.js|cr-overlay\.css|https?:\/\//);
  });

  it('deduplicates Resource Timing URLs and rejects active legacy paths by construction', () => {
    const resources = collectUniqueResourceTiming([
      { url: 'https://site.test/game/fc-engine.js', encodedBytes: 21000 },
      { url: 'https://site.test/game/fc-engine.js?retry=2', encodedBytes: 22000 },
      { url: 'https://site.test/game/fc-overlay.css#loaded', encodedBytes: 2500 },
      { url: 'https://site.test/game/cr-engine.js', encodedBytes: 99999 },
      { url: 'https://site.test/styles.css', encodedBytes: 5000 },
    ]);
    expect(resources).toEqual([
      { url: 'https://site.test/game/fc-engine.js', encodedBytes: 22000 },
      { url: 'https://site.test/game/fc-overlay.css', encodedBytes: 2500 },
    ]);
    const full = collectActivationResourceTiming([
      { url: 'https://site.test/game/fc-engine.js', encodedBytes: 22000 },
      { url: 'https://site.test/game/fc-overlay.css', encodedBytes: 2500 },
      { url: 'https://site.test/game/cr-engine.js', encodedBytes: 99999 },
      { url: 'https://site.test/styles.css', encodedBytes: 5000 },
    ]);
    expect(full.allResources).toHaveLength(4);
    expect(full.unexpectedGameResources.map((entry) => entry.url)).toEqual(['https://site.test/game/cr-engine.js']);
  });

  it('computes FPS as 1000 divided by median frame interval rather than median instantaneous FPS', () => {
    expect(fpsFromFrameIntervals([10, 20, 30])).toBe(50);
    expect(fpsFromFrameIntervals([10, 20, 30, 40])).toBe(40);
    expect(fpsFromFrameIntervals([])).toBe(0);
  });

  it('computes absolute five-run Lighthouse medians and threshold state', () => {
    const summary = summarizeLighthouseRuns([
      { lcpMs: 2200, cls: 0.05 }, { lcpMs: 2400, cls: 0.08 }, { lcpMs: 2100, cls: 0.03 },
      { lcpMs: 2300, cls: 0.06 }, { lcpMs: 2000, cls: 0.04 },
    ]);
    expect(summary.lcpRunsMs).toHaveLength(5);
    expect(summary.clsRuns).toHaveLength(5);
    expect(summary.medianLcpMs).toBe(2200);
    expect(summary.medianCls).toBe(0.05);
  });

  it('ships parseable schemas with the required participant/run/performance constraints', () => {
    const usability = readJson('evidence/usability-evidence.schema.json');
    const accessibility = readJson('evidence/accessibility-evidence.schema.json');
    const performance = readJson('evidence/performance-evidence.schema.json');
    const lifecycle = readJson('evidence/lifecycle-evidence.schema.json');
    const manifest = readJson('evidence/final-evidence-manifest.schema.json');
    expect(usability.required).toContain('provenance');
    expect(usability.required).toContain('rawEvidence');
    expect(usability.properties.rawEvidence.properties.bundlePath.const).toBe('evidence/usability-raw-bundle.json');
    expect(usability.properties.participants.minItems).toBe(5);
    expect(usability.properties.participants.items.properties.isDeveloper.const).toBe(false);
    expect(accessibility.required).toContain('provenance');
    expect(accessibility.properties.runs.minItems).toBe(1);
    expect(accessibility.properties.runs.items.required).toContain('noTimer');
    expect(accessibility.properties.runs.items.properties.realBrowserRun.const).toBe(true);
    expect(accessibility.$defs.versionedTool.properties.version.pattern).toBe('^[0-9]+(?:\\.[0-9]+)+$');
    expect(performance.properties.metadata.required).toContain('referenceQualification');
    expect(performance.properties.lighthouse.properties.lcpRunsMs.minItems).toBe(5);
    expect(performance.properties.fps.properties.runs.items.properties.warmupPlayingMs.const).toBe(5000);
    expect(performance.properties.fps.properties.runs.items.properties.sampledPlayingMs.const).toBe(30000);
    expect(performance.$defs.resourceLedger.properties.resources.minItems).toBe(2);
    expect(performance.$defs.resourceLedger.properties.totalEncodedBytes.maximum).toBe(150000);
    expect(lifecycle.properties.stressRounds.minimum).toBe(20);
    expect(lifecycle.properties.propertyRuns.properties.P37.minimum).toBe(100);
    expect(manifest.properties.artifacts.required).toEqual([
      'usability', 'accessibility', 'performanceDesktop', 'performanceMobile', 'payload', 'lifecycle',
    ]);
    expect(manifest.properties.supportingArtifacts.minItems).toBe(14);
  });
});

describe('Definition of Done evidence validation', () => {
  it('accepts a deterministic usability fixture only in fixture mode and calculates a 30–60s median', () => {
    const fixture = usabilityFixture();
    const fixtureResult = validateUsabilityEvidence(fixture, { allowFixture: true });
    expect(fixtureResult.valid).toBe(true);
    expect(fixtureResult.metrics).toEqual({ participantCount: 5, medianDurationMs: 45000 });
    expect(validateUsabilityEvidence(fixture).errors).toContain('Deterministic fixtures cannot be claimed as real usability evidence');
  });

  it('cryptographically derives usability participants from the signed raw bundle and rejects tampering', () => {
    const fixture = signedUsabilityChainFixture();
    expect(verifyUsabilityBundle(fixture.bundle, fixture.evidence, {
      provenance: provenance(), build: fixture.build, buildBytes: fixture.buildBytes,
    })).toMatchObject({ participantCount: 5 });
    const tampered = structuredClone(fixture.bundle);
    tampered.sessions[0].observation.durationMs += 1;
    expect(() => verifyUsabilityBundle(tampered, fixture.evidence, {
      provenance: provenance(), build: fixture.build, buildBytes: fixture.buildBytes,
    })).toThrow(/duration|checksum|signature/);
  });

  it('records only a focused trusted READY → PLAYING → WON observation and derives exact timing', () => {
    const snapshot = {
      visibility: 'visible', focused: true,
      trustedInputs: [{ type: 'pointerdown', atMs: 990 }, { type: 'keydown', atMs: 1500 }],
      attention: [],
      transitions: [
        { phase: 'READY', atMs: 900, visibility: 'visible', focused: true },
        { phase: 'PLAYING', atMs: 1000, visibility: 'visible', focused: true },
        { phase: 'WON', atMs: 41000, visibility: 'visible', focused: true },
      ],
    };
    expect(summarizeObservation(snapshot, ['Page.enable', 'Runtime.evaluate'])).toMatchObject({
      startTimestampMs: 1000, wonTimestampMs: 41000, durationMs: 40000, retries: 0,
      trustedInputCount: 2, trustedGameplayInputCount: 1, inputProtocolCallCount: 0,
    });
    expect(() => summarizeObservation({ ...snapshot, trustedInputs: [] }, ['Page.enable'])).toThrow(/trusted participant input/);
  });

  it('aggregator refuses before producing artifacts when fewer than five signed sessions exist', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fc-usability-empty-'));
    try {
      await expect(aggregateUsabilitySessions({ sessions: directory })).rejects.toThrow('At least five signed session files are required');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects developer participants, retries over one, non-monotonic times, bad median, and PII', () => {
    const fixture = usabilityFixture();
    fixture.participants[0] = {
      ...fixture.participants[0],
      participantId: 'person@example.com',
      isDeveloper: true,
      wonTimestampMs: -1,
      durationMs: 1000,
      retries: 2,
    };
    for (const participant of fixture.participants) {
      participant.wonTimestampMs = participant.startTimestampMs + 10000;
      participant.durationMs = 10000;
    }
    const validation = validateUsabilityEvidence(fixture, { allowFixture: true });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toMatch(/PII|isDeveloper|retries|Median/);
  });

  it('requires exact OS/browser/screen-reader versions and every accessibility outcome', () => {
    const fixture = accessibilityFixture();
    const accepted = validateAccessibilityEvidence(fixture, { allowFixture: true });
    expect(accepted.valid).toBe(true);
    expect(accepted.metrics.realScreenReaderRuns).toBe(1);
    fixture.runs[0].screenReader.version = 'latest';
    fixture.runs[0].focusRestore = false;
    const rejected = validateAccessibilityEvidence(fixture, { allowFixture: true });
    expect(rejected.valid).toBe(false);
    expect(rejected.errors.join('\n')).toMatch(/version must be exact|focusRestore must pass/);
  });

  it('validates combined FPS/Lighthouse/Resource Timing/payload thresholds and metadata', async () => {
    const payload = await buildPayloadLedger(process.cwd());
    const resourceTiming = resourceTimingFixture(payload);
    const report = {
      schemaVersion: 1,
      metadata: metadata(),
      fps: {
        profile: 'mobile',
        runs: [performanceRun(35), performanceRun(37), performanceRun(36)],
        medianOfThree: 36,
      },
      lighthouse: lighthouseFixture(),
      resourceTiming,
      payload,
    };
    expect(validatePerformanceEvidence(report)).toMatchObject({ valid: true });
    report.fps.runs = [performanceRun(20), performanceRun(21), performanceRun(22)];
    report.fps.medianOfThree = 21;
    expect(validatePerformanceEvidence(report).errors.join('\n')).toContain('FPS median must be at least 30');
    report.resourceTiming = { resources: [], totalEncodedBytes: 0 };
    expect(validatePerformanceEvidence(report).errors.join('\n')).toMatch(/resourceTiming is missing game\/fc-engine|resourceTiming is missing game\/fc-overlay/);
  });

  it('returns deterministic CLI exit 0 for an allowed valid fixture and exit 1 for invalid evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fc-evidence-test-'));
    try {
      const validPath = join(directory, 'valid.json');
      const invalidPath = join(directory, 'invalid.json');
      writeFileSync(validPath, JSON.stringify(usabilityFixture()));
      const invalid = usabilityFixture();
      invalid.participants = invalid.participants.slice(0, 4);
      writeFileSync(invalidPath, JSON.stringify(invalid));
      const script = resolve(process.cwd(), 'scripts/fc-evidence.mjs');
      const validRun = spawnSync(process.execPath, [script, '--type', 'usability', '--input', validPath, '--allow-fixture'], { encoding: 'utf8' });
      const invalidRun = spawnSync(process.execPath, [script, '--type', 'usability', '--input', invalidPath, '--allow-fixture'], { encoding: 'utf8' });
      expect(validRun.status).toBe(0);
      expect(JSON.parse(validRun.stdout).valid).toBe(true);
      expect(invalidRun.status).toBe(1);
      expect(JSON.parse(invalidRun.stdout).valid).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});


describe('final evidence provenance and manifest gates', () => {
  it('computes a deterministic source digest bound to the current 40-character commit', async () => {
    const first = await computeSourceDigest(process.cwd());
    const second = await computeSourceDigest(process.cwd());
    expect(second).toEqual(first);
    expect(first.scope).toBe('fc-source-v1');
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.files.some((entry) => entry.path === 'game/fc-engine.js')).toBe(true);
    expect(first.files.some((entry) => entry.path === 'evidence/tools/fc-usability-record.mjs')).toBe(true);
    expect(first.files.some((entry) => entry.path === 'evidence/usability-evidence.schema.json')).toBe(true);
    expect(first.files.some((entry) => entry.path === 'evidence/usability-evidence.template.json')).toBe(true);
    expect(first.files.some((entry) => entry.path === 'CNAME')).toBe(true);
    expect(first.files.some((entry) => entry.path.startsWith('assets/'))).toBe(true);
    expect(readCommitSha(process.cwd())).toMatch(/^[0-9a-f]{40}$/);
  });

  it('requires benchmark qualification to be mathematically no stronger than the reference profile', async () => {
    const payload = await buildPayloadLedger(process.cwd());
    const report = {
      schemaVersion: 1,
      metadata: metadata(),
      fps: {
        profile: 'mobile',
        runs: [performanceRun(35), performanceRun(36), performanceRun(37)],
        medianOfThree: 36,
      },
      lighthouse: lighthouseFixture(),
      resourceTiming: resourceTimingFixture(payload),
      payload,
    };
    expect(validatePerformanceEvidence(report).valid).toBe(true);
    const underCalibrated = structuredClone(report);
    underCalibrated.metadata.cpuCalibration.observedSlowdown = 1.5;
    underCalibrated.metadata.referenceQualification.observedCpuSlowdown = 1.5;
    underCalibrated.metadata.referenceQualification.comparisons[0].effectiveProfileScore = 200 / 1.5;
    expect(validatePerformanceEvidence(underCalibrated).errors.join('\n')).toContain('measured profile is stronger than reference');
    report.metadata.referenceQualification.comparisons[0].referenceScore = 50;
    expect(validatePerformanceEvidence(report).errors.join('\n')).toContain('measured profile is stronger than reference');
  });

  it('validates lifecycle evidence only with stress, P37/P38 and zero final resources', () => {
    const artifact = {
      schemaVersion: 1,
      generatedAt: new Date(0).toISOString(),
      provenance: provenance(),
      command: 'vitest --run',
      rawReport: { path: 'evidence/lifecycle-vitest-raw.json', sha256: 'd'.repeat(64) },
      runner: { name: 'vitest', version: '3.2.4' },
      targets: ['mounted', 'properties', 'portfolio'],
      success: true,
      totals: { tests: 82, passed: 82, failed: 0, pending: 0 },
      requiredAssertions: { stress20: true, fullStress20: true, p37: true, p38: true, runtimeError: true },
      stressRounds: 20,
      propertyRuns: { P37: 150, P38: 150 },
      assertedFinalResourceCounts: {
        loops: 0, timers: 0, observers: 0, gameOwnedListeners: 0, mediaListeners: 0, pointerCaptures: 0,
      },
    };
    expect(validateLifecycleEvidence(artifact).valid).toBe(true);
    artifact.assertedFinalResourceCounts.timers = 1;
    expect(validateLifecycleEvidence(artifact).errors).toContain('Final timers count must be zero');
  });

  it('replays the complete production build ledger, marker, provenance, and aggregate digest', async () => {
    const validation = await validateProductionBuildEvidence(process.cwd(), await currentProvenance());
    expect(validation.files).toBe(42);
    expect(validation.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(validation.reportSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires every exact artifact role, safe unique paths, hashes and provenance in the final manifest', () => {
    const descriptor = (name) => ({ path: `evidence/${name}.json`, bytes: 10, sha256: 'c'.repeat(64) });
    const manifest = {
      schemaVersion: 1,
      kind: 'flappy-cloud-game-final-evidence',
      createdAt: new Date(0).toISOString(),
      provenance: provenance(),
      artifacts: {
        usability: descriptor('usability'),
        accessibility: descriptor('accessibility'),
        performanceDesktop: descriptor('performance-desktop'),
        performanceMobile: descriptor('performance-mobile'),
        payload: descriptor('payload'),
        lifecycle: descriptor('lifecycle'),
      },
      supportingArtifacts: FINAL_SUPPORTING_PATHS.map((path) => ({ path, bytes: 10, sha256: 'e'.repeat(64) })),
    };
    expect(FINAL_SUPPORTING_PATHS).toContain('evidence/usability-raw-bundle.json');
    expect(validateFinalManifestShape(manifest).valid).toBe(true);
    delete manifest.artifacts.usability;
    expect(validateFinalManifestShape(manifest).errors.join('\n')).toMatch(/exactly|usability/);
  });
});
