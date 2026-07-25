#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function piiFindings(value, path = '$', findings = []) {
  if (typeof value === 'string') {
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) findings.push(`${path}: email-like PII`);
    if (/\+?\d[\d\s().-]{7,}\d/.test(value) && !/^\d+(?:\.\d+)+$/.test(value)) findings.push(`${path}: phone-like PII`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => piiFindings(item, `${path}[${index}]`, findings));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:email|phone|fullName|participantName)$/i.test(key)) findings.push(`${path}.${key}: forbidden PII field`);
      piiFindings(child, `${path}.${key}`, findings);
    }
  }
  return findings;
}

function result(errors, metrics = {}) {
  return { valid: errors.length === 0, errors, metrics };
}

function validateProvenance(provenance, path, errors) {
  if (!provenance || typeof provenance !== 'object') {
    errors.push(`${path} is required`);
    return;
  }
  if (!/^[0-9a-f]{40}$/.test(provenance.commitSha || '')) errors.push(`${path}.commitSha must be a 40-character Git SHA`);
  if (!/^[0-9a-f]{64}$/.test(provenance.sourceDigest || '')) errors.push(`${path}.sourceDigest must be a SHA-256 digest`);
  if (provenance.sourceScope !== 'fc-source-v1') errors.push(`${path}.sourceScope must be fc-source-v1`);
}

function validateReferenceQualification(metadata, errors) {
  const qualification = metadata?.referenceQualification;
  if (!qualification || qualification.qualified !== true) {
    errors.push('metadata.referenceQualification.qualified must be true');
    return;
  }
  if (!['physical-reference-device', 'cdp-cpu-throttling'].includes(qualification.method)) {
    errors.push('metadata.referenceQualification.method is invalid');
    return;
  }
  if (qualification.method === 'physical-reference-device') return;
  const configuredRate = metadata?.cpuThrottleRate;
  const measuredSlowdown = metadata?.cpuCalibration?.observedSlowdown;
  if (!Number.isFinite(configuredRate) || configuredRate < 1 || qualification.cpuThrottleRate !== configuredRate
    || metadata?.cpuCalibration?.configuredRate !== configuredRate) {
    errors.push('metadata CPU throttle must match reference qualification and calibration');
  }
  if (!Number.isFinite(measuredSlowdown) || measuredSlowdown < 1
    || Math.abs((qualification.observedCpuSlowdown ?? NaN) - measuredSlowdown) > 0.001) {
    errors.push('reference qualification must retain the measured CPU slowdown');
  }
  if (!Number.isFinite(qualification.referenceRamGb) || !Number.isFinite(qualification.profileRamGb)
    || qualification.profileRamGb > qualification.referenceRamGb) errors.push('qualified profile RAM must not exceed reference RAM');
  if (!Number.isInteger(metadata?.memoryLimitMb) || metadata.memoryLimitMb <= 0
    || metadata.memoryLimitMb > qualification.profileRamGb * 1024) errors.push('metadata.memoryLimitMb must enforce the qualified profile RAM ceiling');
  if (!Array.isArray(qualification.comparisons) || qualification.comparisons.length < 1) {
    errors.push('reference qualification requires benchmark comparisons');
    return;
  }
  for (const [index, comparison] of qualification.comparisons.entries()) {
    if (typeof comparison?.metric !== 'string' || !comparison.metric) errors.push(`referenceQualification.comparisons[${index}].metric is required`);
    if (!Number.isFinite(comparison?.hostScore) || !Number.isFinite(comparison?.referenceScore)
      || comparison.hostScore <= 0 || comparison.referenceScore <= 0) errors.push(`referenceQualification.comparisons[${index}] scores must be positive`);
    const effective = comparison?.hostScore / measuredSlowdown;
    if (!Number.isFinite(comparison?.effectiveProfileScore) || !Number.isFinite(effective)
      || Math.abs(comparison.effectiveProfileScore - effective) > 0.01) {
      errors.push(`referenceQualification.comparisons[${index}].effectiveProfileScore is inconsistent with measured slowdown`);
    }
    if (!(effective <= comparison?.referenceScore)) errors.push(`referenceQualification.comparisons[${index}] measured profile is stronger than reference`);
    if (!/^https:\/\//.test(comparison?.sourceUrl || '')) errors.push(`referenceQualification.comparisons[${index}].sourceUrl is required`);
  }
}

export function validateUsabilityEvidence(value, { allowFixture = false } = {}) {
  const errors = piiFindings(value);
  if (!value || typeof value !== 'object') return result([...errors, 'Evidence must be an object']);
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  validateProvenance(value.provenance, 'provenance', errors);
  if (!allowFixture && value.isRealEvidence !== true) errors.push('Deterministic fixtures cannot be claimed as real usability evidence');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(value.studyId || '')) errors.push('studyId must be pseudonymous');
  const allowedRoot = ['schemaVersion', 'isRealEvidence', 'provenance', 'studyId', 'rawEvidence', 'participants'];
  for (const key of Object.keys(value)) if (!allowedRoot.includes(key)) errors.push(`${key} is not allowed`);
  const raw = value.rawEvidence;
  if (!raw || typeof raw !== 'object') errors.push('rawEvidence is required');
  else {
    const allowedRaw = ['bundlePath', 'bundleSha256', 'sessionCount', 'publicKeySha256'];
    for (const key of Object.keys(raw)) if (!allowedRaw.includes(key)) errors.push(`rawEvidence.${key} is not allowed`);
    if (raw.bundlePath !== 'evidence/usability-raw-bundle.json') errors.push('rawEvidence.bundlePath must be canonical');
    if (!/^[0-9a-f]{64}$/.test(raw.bundleSha256 || '')) errors.push('rawEvidence.bundleSha256 must be a SHA-256 digest');
    if (!/^[0-9a-f]{64}$/.test(raw.publicKeySha256 || '')) errors.push('rawEvidence.publicKeySha256 must be a SHA-256 digest');
    if (!Number.isInteger(raw.sessionCount) || raw.sessionCount < 5
      || (Array.isArray(value.participants) && raw.sessionCount !== value.participants.length)) errors.push('rawEvidence.sessionCount must equal participants length and be at least five');
  }
  if (!Array.isArray(value.participants) || value.participants.length < 5) errors.push('At least five participants are required');
  const ids = new Set();
  const durations = [];
  for (const [index, participant] of (value.participants || []).entries()) {
    const prefix = `participants[${index}]`;
    if (!/^P-[A-Za-z0-9_-]{2,32}$/.test(participant?.participantId || '')) errors.push(`${prefix}.participantId must be pseudonymous`);
    if (ids.has(participant?.participantId)) errors.push(`${prefix}.participantId must be unique`);
    ids.add(participant?.participantId);
    if (participant?.isDeveloper !== false) errors.push(`${prefix}.isDeveloper must be false`);
    if (participant?.completed !== true) errors.push(`${prefix}.completed must be true`);
    if (!Number.isFinite(participant?.startTimestampMs) || !Number.isFinite(participant?.wonTimestampMs)
      || participant.wonTimestampMs < participant.startTimestampMs) errors.push(`${prefix} timestamps must be finite and monotonic`);
    const calculated = participant?.wonTimestampMs - participant?.startTimestampMs;
    if (!Number.isFinite(participant?.durationMs) || Math.abs(participant.durationMs - calculated) > 1) errors.push(`${prefix}.durationMs must equal WON - Start`);
    if (!Number.isInteger(participant?.retries) || participant.retries < 0 || participant.retries > 1) errors.push(`${prefix}.retries must be 0 or 1`);
    if (Number.isFinite(participant?.durationMs)) durations.push(participant.durationMs);
    const allowed = ['participantId', 'isDeveloper', 'startTimestampMs', 'wonTimestampMs', 'durationMs', 'retries', 'completed'];
    for (const key of Object.keys(participant || {})) if (!allowed.includes(key)) errors.push(`${prefix}.${key} is not allowed`);
  }
  const medianDurationMs = median(durations);
  if (!(medianDurationMs >= 30000 && medianDurationMs <= 60000)) errors.push('Median Start → WON duration must be 30–60 seconds');
  return result(errors, { participantCount: durations.length, medianDurationMs });
}

function exactVersion(tool, path, errors) {
  if (!tool || typeof tool.name !== 'string' || !tool.name.trim()) errors.push(`${path}.name is required`);
  if (!tool || typeof tool.version !== 'string' || !/^\d+(?:\.\d+)+$/.test(tool.version)) errors.push(`${path}.version must be exact`);
}

export function validateAccessibilityEvidence(value, { allowFixture = false } = {}) {
  const errors = piiFindings(value);
  if (!value || typeof value !== 'object') return result([...errors, 'Evidence must be an object']);
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  validateProvenance(value.provenance, 'provenance', errors);
  if (!allowFixture && value.isRealEvidence !== true) errors.push('Deterministic fixtures cannot be claimed as real accessibility evidence');
  if (!Array.isArray(value.runs) || value.runs.length < 1) errors.push('At least one accessibility run is required');
  let realScreenReaderRuns = 0;
  for (const [index, run] of (value.runs || []).entries()) {
    const prefix = `runs[${index}]`;
    if (!/^A11Y-[A-Za-z0-9_-]{2,32}$/.test(run?.runId || '')) errors.push(`${prefix}.runId is invalid`);
    exactVersion(run?.os, `${prefix}.os`, errors);
    exactVersion(run?.browser, `${prefix}.browser`, errors);
    exactVersion(run?.screenReader, `${prefix}.screenReader`, errors);
    for (const field of ['realBrowserRun', 'keyboardOnly', 'announcements', 'focusTrap', 'focusRestore', 'reducedMotion', 'noTimer', 'zoomAndViewport']) {
      if (run?.[field] !== true) errors.push(`${prefix}.${field} must pass`);
    }
    if (run?.realBrowserRun === true && run?.screenReader?.name && run?.screenReader?.version) realScreenReaderRuns += 1;
  }
  if (realScreenReaderRuns < 1) errors.push('At least one real screen-reader browser run is required');
  return result(errors, { runCount: value.runs?.length || 0, realScreenReaderRuns });
}

function requiredMetadata(metadata, errors) {
  const fields = ['commit', 'sourceDigest', 'sourceScope', 'build', 'buildRoot', 'server', 'device', 'cpu', 'ramGb', 'os', 'browserVersion', 'browserMode', 'browserProduct', 'testedUrl', 'viewport', 'dpr', 'powerState', 'thermalState', 'cpuThrottleRate', 'cpuQuotaPercent', 'memoryLimitMb', 'hardwareConcurrency', 'runtimeLimits', 'cpuCalibration', 'referenceQualification'];
  for (const field of fields) {
    const value = metadata?.[field];
    if (value === undefined || value === null || value === '') errors.push(`metadata.${field} is required`);
  }
  if (!/^[0-9a-f]{40}$/.test(metadata?.commit || '')) errors.push('metadata.commit must be a 40-character Git SHA');
  if (!/^[0-9a-f]{64}$/.test(metadata?.sourceDigest || '')) errors.push('metadata.sourceDigest must be a SHA-256 digest');
  if (metadata?.sourceScope !== 'fc-source-v1') errors.push('metadata.sourceScope must be fc-source-v1');
  if (!/fc-build\.mjs/.test(metadata?.build || '') || !/fc-production/.test(metadata?.buildRoot || '')) errors.push('metadata must identify the production/minified build');
  if (metadata?.browserMode !== 'headed-foreground' || /HeadlessChrome/i.test(metadata?.browserProduct || '')) errors.push('FPS evidence requires headed foreground Chrome');
  if (!/^https?:\/\//.test(metadata?.testedUrl || '')) errors.push('metadata.testedUrl must be explicit');
  const limits = metadata?.runtimeLimits;
  if (!Number.isFinite(limits?.memoryMaxBytes) || limits.memoryMaxBytes > metadata?.ramGb * 1024 ** 3) errors.push('runtime cgroup memory limit exceeds profile RAM');
  if (!Number.isFinite(limits?.cpuQuotaPercent) || Math.abs(limits.cpuQuotaPercent - metadata?.cpuQuotaPercent) > 0.01) errors.push('runtime cgroup CPU quota does not match profile');
  const calibration = metadata?.cpuCalibration;
  if (calibration?.configuredRate !== metadata?.cpuThrottleRate || !Number.isFinite(calibration?.observedSlowdown)
    || calibration.observedSlowdown < 1) errors.push('measured CPU slowdown does not substantiate the configured profile');
  validateReferenceQualification(metadata, errors);
}

export function validatePerformanceEvidence(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['Evidence must be an object']);
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  requiredMetadata(value.metadata, errors);
  const runs = value.fps?.runs;
  if (!['desktop', 'mobile'].includes(value.fps?.profile)) errors.push('FPS profile must be desktop or mobile');
  if (!Array.isArray(runs) || runs.length !== 3) errors.push('FPS evidence requires exactly three runs');
  for (const [index, run] of (runs || []).entries()) {
    if (run.warmupPlayingMs !== 5000) errors.push(`fps.runs[${index}].warmupPlayingMs must be exactly 5000`);
    if (run.sampledPlayingMs !== 30000) errors.push(`fps.runs[${index}].sampledPlayingMs must be exactly 30000`);
    const intervals = run.frameIntervals;
    const finiteIntervals = Array.isArray(intervals) ? intervals.filter((item) => Number.isFinite(item) && item > 0) : [];
    const intervalMedian = median(finiteIntervals);
    const expectedFps = intervalMedian > 0 ? 1000 / intervalMedian : NaN;
    const intervalTotal = finiteIntervals.reduce((total, interval) => total + interval, 0);
    if (finiteIntervals.length < 300 || intervalTotal < 29750 || intervalTotal > 30050
      || !Number.isFinite(run.sampledIntervalMs) || Math.abs(run.sampledIntervalMs - intervalTotal) > 0.01) {
      errors.push(`fps.runs[${index}] raw intervals must substantiate a 30-second sample`);
    }
    if (!Number.isFinite(run.wallDurationMs) || run.wallDurationMs < 35000) errors.push(`fps.runs[${index}].wallDurationMs is too short`);
    if (run.foregroundAtActivation?.visibilityState !== 'visible' || run.foregroundAtActivation?.hasFocus !== true) errors.push(`fps.runs[${index}] was not foreground/focused`);
    if (!Array.isArray(run.preActivationGameResources) || run.preActivationGameResources.length !== 0) errors.push(`fps.runs[${index}] has pre-activation game resources`);
    if (run.retryCount !== 0) errors.push(`fps.runs[${index}] Reference_Path must complete without retry`);
    if (!Number.isFinite(run.medianFps) || !Number.isFinite(expectedFps) || Math.abs(run.medianFps - expectedFps) > 0.01) {
      errors.push(`fps.runs[${index}].medianFps is inconsistent with frame intervals`);
    }
  }
  const runMedians = (runs || []).map((run) => run.medianFps);
  const medianOfThree = median(runMedians);
  if (!Number.isFinite(value.fps?.medianOfThree) || Math.abs(value.fps.medianOfThree - medianOfThree) > 0.01) errors.push('FPS medianOfThree is inconsistent');
  const fpsThreshold = value.fps?.profile === 'mobile' ? 30 : 50;
  if (!(medianOfThree >= fpsThreshold)) errors.push(`FPS median must be at least ${fpsThreshold}`);
  const lcp = value.lighthouse?.lcpRunsMs;
  const cls = value.lighthouse?.clsRuns;
  if (!Array.isArray(lcp) || lcp.length !== 5 || !Array.isArray(cls) || cls.length !== 5) errors.push('Lighthouse evidence requires five LCP and CLS runs');
  const lighthouseProfile = value.lighthouse?.profile;
  if (lighthouseProfile?.viewport?.width !== 360 || lighthouseProfile?.viewport?.height !== 800
    || lighthouseProfile?.dpr !== 1 || lighthouseProfile?.cpuSlowdown !== 4
    || lighthouseProfile?.rttMs !== 150 || lighthouseProfile?.downlinkKbps !== 1600
    || lighthouseProfile?.uplinkKbps !== 750 || lighthouseProfile?.coldCache !== true) {
    errors.push('Lighthouse profile does not match the required mobile cold-cache contract');
  }
  if (typeof value.lighthouse?.lighthouseVersion !== 'string' || typeof value.lighthouse?.chromiumVersion !== 'string') errors.push('Exact Lighthouse/browser versions are required');
  if (value.lighthouse?.testedUrl !== value.metadata?.testedUrl) errors.push('Lighthouse and FPS tested URLs must match');
  if (!Array.isArray(value.lighthouse?.runs) || value.lighthouse.runs.length !== 5
    || value.lighthouse.runs.some((run) => !Array.isArray(run.gameplayResources) || run.gameplayResources.length !== 0 || !/^[0-9a-f]{64}$/.test(run.rawReportSha256 || ''))) {
    errors.push('Every Lighthouse run must retain a raw report hash and zero pre-activation game resources');
  }
  if (!(median(lcp || []) <= 2500)) errors.push('Median LCP must be at most 2500 ms');
  if (!(median(cls || []) <= 0.1)) errors.push('Median CLS must be at most 0.1');
  const resourceTiming = value.resourceTiming;
  if (!Array.isArray(resourceTiming?.allResources) || !Array.isArray(resourceTiming?.gameResources)
    || !Array.isArray(resourceTiming?.unexpectedGameResources) || resourceTiming.unexpectedGameResources.length !== 0
    || !Array.isArray(resourceTiming?.preActivationGameResources) || resourceTiming.preActivationGameResources.length !== 0) {
    errors.push('Resource Timing must retain the full activation ledger with zero unexpected/pre-activation game resources');
  } else {
    const fullGameUrls = resourceTiming.allResources
      .map((entry) => entry?.url)
      .filter((url) => typeof url === 'string' && /\/game\//.test(url));
    const classifiedUrls = resourceTiming.gameResources.map((entry) => entry?.url);
    if (JSON.stringify([...fullGameUrls].sort()) !== JSON.stringify([...classifiedUrls].sort())) errors.push('Resource Timing game classification is incomplete');
    if (classifiedUrls.some((url) => /\/game\/cr-|\/game\/(?!fc-(?:engine\.js|overlay\.css)$)/.test(url || ''))) errors.push('Resource Timing contains an unexpected/legacy game resource');
  }
  for (const section of ['resourceTiming', 'payload']) {
    const resources = value[section]?.resources;
    if (!Array.isArray(resources)) errors.push(`${section}.resources is required`);
    const urls = new Set();
    let total = 0;
    for (const [index, entry] of (resources || []).entries()) {
      if (!entry || typeof entry.url !== 'string' || !entry.url) errors.push(`${section}.resources[${index}].url is required`);
      if (!Number.isInteger(entry?.encodedBytes) || entry.encodedBytes <= 0) errors.push(`${section}.resources[${index}].encodedBytes must be a positive integer`);
      if (urls.has(entry?.url)) errors.push(`${section} URLs must be unique`);
      urls.add(entry?.url);
      if (Number.isInteger(entry?.encodedBytes)) total += entry.encodedBytes;
      if (/\/(?:cr-engine\.js|cr-overlay\.css)(?:$|[?#])/.test(entry?.url || '')) errors.push(`${section} contains an active legacy resource`);
    }
    for (const suffix of ['game/fc-engine.js', 'game/fc-overlay.css']) {
      if (![...urls].some((url) => String(url).replace(/[?#].*$/, '').endsWith(suffix))) errors.push(`${section} is missing ${suffix}`);
    }
    if (value[section]?.totalEncodedBytes !== total) errors.push(`${section}.totalEncodedBytes is inconsistent`);
    if (total > 150000) errors.push(`${section} exceeds 150000 bytes`);
  }
  return result(errors, { medianFps: medianOfThree, medianLcpMs: median(lcp || []), medianCls: median(cls || []) });
}

export function validateLifecycleEvidence(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['Evidence must be an object']);
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  validateProvenance(value.provenance, 'provenance', errors);
  if (value.success !== true) errors.push('Lifecycle run must pass');
  if (value.runner?.name !== 'vitest' || !/^\d+(?:\.\d+)+$/.test(value.runner?.version || '')) errors.push('Exact Vitest runner version is required');
  if (value.rawReport?.path !== 'evidence/lifecycle-vitest-raw.json' || !/^[0-9a-f]{64}$/.test(value.rawReport?.sha256 || '')) errors.push('Raw lifecycle Vitest report descriptor is required');
  if (!Number.isInteger(value.stressRounds) || value.stressRounds < 20) errors.push('Lifecycle stress requires at least 20 rounds');
  for (const property of ['P37', 'P38']) {
    if (!Number.isInteger(value.propertyRuns?.[property]) || value.propertyRuns[property] < 100) errors.push(`${property} requires at least 100 runs`);
  }
  for (const assertion of ['stress20', 'fullStress20', 'p37', 'p38', 'runtimeError']) {
    if (value.requiredAssertions?.[assertion] !== true) errors.push(`requiredAssertions.${assertion} must pass`);
  }
  if (!Number.isInteger(value.totals?.tests) || value.totals.tests < 1
    || value.totals?.passed !== value.totals.tests || value.totals?.failed !== 0 || value.totals?.pending !== 0) {
    errors.push('All lifecycle tests must pass without pending tests');
  }
  for (const resource of ['loops', 'timers', 'observers', 'gameOwnedListeners', 'mediaListeners', 'pointerCaptures']) {
    if (value.assertedFinalResourceCounts?.[resource] !== 0) errors.push(`Final ${resource} count must be zero`);
  }
  return result(errors, { tests: value.totals?.tests || 0, stressRounds: value.stressRounds || 0 });
}

export function validateEvidence(type, value, options) {
  if (type === 'usability') return validateUsabilityEvidence(value, options);
  if (type === 'accessibility') return validateAccessibilityEvidence(value, options);
  if (type === 'performance') return validatePerformanceEvidence(value, options);
  if (type === 'lifecycle') return validateLifecycleEvidence(value, options);
  return result([`Unknown evidence type: ${type}`]);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const type = argument('--type');
  const input = argument('--input');
  if (!type || !input) throw new Error('Usage: fc-evidence.mjs --type usability|accessibility|performance|lifecycle --input file.json [--allow-fixture]');
  const value = JSON.parse(await readFile(resolve(input), 'utf8'));
  const validation = validateEvidence(type, value, { allowFixture: process.argv.includes('--allow-fixture') });
  process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
  if (!validation.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
