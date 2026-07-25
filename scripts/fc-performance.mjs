#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildPayloadLedger } from './fc-payload.mjs';
import { median, validatePerformanceEvidence } from './fc-evidence.mjs';
import { currentProvenance } from './fc-provenance.mjs';

const WARMUP_PLAYING_MS = 5000;
const SAMPLE_PLAYING_MS = 30000;
const RUN_COUNT = 3;

export function fpsFromFrameIntervals(frameIntervals) {
  const intervalMedian = median((frameIntervals || []).filter((value) => Number.isFinite(value) && value > 0));
  return intervalMedian > 0 ? 1000 / intervalMedian : 0;
}

function delay(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve: resolveRequest, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolveRequest(message.result);
    });
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveRequest, reject) => {
      this.pending.set(id, { resolve: resolveRequest, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket?.close(); }
}

async function waitForFile(path, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(path)) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for Chromium endpoint: ${path}`);
}

async function launchChromium(executable, viewport, memoryLimitMb) {
  const profile = await mkdtemp(join(tmpdir(), 'fc-performance-'));
  const processHandle = spawn(executable, [
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--force-renderer-accessibility', '--disable-extensions',
    `--js-flags=--max-old-space-size=${memoryLimitMb}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--window-size=${viewport.width},${viewport.height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' } });
  let stderr = '';
  processHandle.stderr.on('data', (chunk) => { stderr += chunk; });
  const portFile = join(profile, 'DevToolsActivePort');
  try {
    await waitForFile(portFile);
    const [port] = (await readFile(portFile, 'utf8')).trim().split('\n');
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    if (!response.ok) throw new Error(`Chromium target creation failed: ${response.status}`);
    const target = await response.json();
    const client = await new CdpClient(target.webSocketDebuggerUrl).connect();
    return {
      client,
      processHandle,
      profile,
      async close() {
        const exited = processHandle.exitCode !== null
          ? Promise.resolve()
          : new Promise((resolveExit) => processHandle.once('exit', resolveExit));
        try { await client.send('Browser.close'); } catch { /* Fall back to process signals below. */ }
        client.close();
        if (processHandle.exitCode === null) processHandle.kill('SIGTERM');
        const stopped = await Promise.race([exited.then(() => true), delay(3000).then(() => false)]);
        if (!stopped && processHandle.exitCode === null) {
          processHandle.kill('SIGKILL');
          await Promise.race([exited, delay(2000)]);
        }
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            await rm(profile, { recursive: true, force: true });
            break;
          } catch (error) {
            if (!['EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 4) throw error;
            await delay(100 * (attempt + 1));
          }
        }
      },
    };
  } catch (error) {
    processHandle.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true });
    throw new Error(`${error.message}${stderr ? `\n${stderr.slice(-2000)}` : ''}`);
  }
}

async function evaluate(client, expression, awaitPromise = true) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
  return response.result.value;
}

const REFERENCE_PATH_EXPRESSION = `(${async function collectReferencePath(config) {
  const waitFor = async (predicate, timeoutMs = 20000) => {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
    throw new Error('Reference_Path timed out waiting for UI');
  };
  const buttonByText = (text) => [...document.querySelectorAll('#cloud-rescue-root button')]
    .find((button) => button.textContent.trim().includes(text));
  const cta = await waitFor(() => document.querySelector('.cr-cta'));
  const preActivationGameResources = performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((resourceUrl) => /\/game\//.test(resourceUrl));
  const foregroundAtActivation = { visibilityState: document.visibilityState, hasFocus: document.hasFocus() };
  if (foregroundAtActivation.visibilityState !== 'visible' || !foregroundAtActivation.hasFocus) {
    throw new Error(`Reference_Path requires a focused foreground document: ${JSON.stringify(foregroundAtActivation)}`);
  }
  performance.clearResourceTimings();
  cta.click();
  await waitFor(() => buttonByText('Start'));

  const frameIntervals = [];
  let warmupMs = 0;
  let sampledMs = 0;
  let previousPlayingTimestamp = null;
  let lastBoost = -Infinity;
  let retryCount = 0;
  const startedAt = performance.now();

  return new Promise((resolveRun, reject) => {
    const deadline = setTimeout(() => reject(new Error('Reference_Path exceeded 120 seconds')), 120000);
    const tick = (timestamp) => {
      try {
        const start = buttonByText('Start');
        if (start) start.click();
        const continueButton = buttonByText('Continue');
        if (continueButton) continueButton.click();
        const retry = buttonByText('Retry from checkpoint');
        if (retry) { retryCount += 1; retry.click(); }
        const playAgain = buttonByText('Play Again');
        if (playAgain) playAgain.click();

        const surface = document.querySelector('#cloud-rescue-root [data-flight-surface]');
        if (surface) {
          const phase = surface.dataset.fcPhase;
          const botY = Number(surface.dataset.fcBotY);
          const botVy = Number(surface.dataset.fcBotVy);
          const targetY = Number(surface.dataset.fcTargetY);
          const readyBoost = phase === 'READY' && timestamp - lastBoost >= 250;
          const guidedBoost = phase === 'PLAYING'
            && timestamp - lastBoost >= 200
            && Number.isFinite(botY) && Number.isFinite(botVy) && Number.isFinite(targetY)
            && botVy > -200 && botY > targetY + 30;
          if (readyBoost || guidedBoost) {
            surface.dispatchEvent(new KeyboardEvent('keydown', {
              key: ' ', code: 'Space', bubbles: true, cancelable: true,
            }));
            lastBoost = timestamp;
          }
        }

        const status = document.querySelector('#cloud-rescue-root [data-dom-status]')?.textContent || '';
        const playing = status.includes('Phase: PLAYING');
        if (playing && previousPlayingTimestamp !== null) {
          const interval = timestamp - previousPlayingTimestamp;
          if (interval > 0 && interval < 250) {
            let remaining = interval;
            if (warmupMs < config.warmupMs) {
              const warmupSlice = Math.min(remaining, config.warmupMs - warmupMs);
              warmupMs += warmupSlice;
              remaining -= warmupSlice;
            }
            if (remaining > 0 && sampledMs < config.sampleMs) {
              const sampleSlice = Math.min(remaining, config.sampleMs - sampledMs);
              sampledMs += sampleSlice;
              if (sampleSlice === interval) frameIntervals.push(interval);
            }
          }
        }
        previousPlayingTimestamp = playing ? timestamp : null;
        if (sampledMs >= config.sampleMs) {
          clearTimeout(deadline);
          const fpsSamples = frameIntervals.map((interval) => 1000 / interval);
          resolveRun({
            frameIntervals,
            fpsSamples,
            medianFps: (() => {
              const sorted = [...frameIntervals].sort((a, b) => a - b);
              const middle = Math.floor(sorted.length / 2);
              const medianInterval = sorted.length % 2
                ? sorted[middle]
                : (sorted[middle - 1] + sorted[middle]) / 2;
              return medianInterval > 0 ? 1000 / medianInterval : 0;
            })(),
            warmupPlayingMs: warmupMs,
            sampledPlayingMs: sampledMs,
            sampledIntervalMs: frameIntervals.reduce((total, interval) => total + interval, 0),
            retryCount,
            wallDurationMs: performance.now() - startedAt,
            foregroundAtActivation,
            preActivationGameResources,
          });
          return;
        }
        requestAnimationFrame(tick);
      } catch (error) {
        clearTimeout(deadline);
        reject(error);
      }
    };
    requestAnimationFrame(tick);
  });
}})(${JSON.stringify({ warmupMs: WARMUP_PLAYING_MS, sampleMs: SAMPLE_PLAYING_MS })})`;

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await evaluate(client, `new Promise((resolve) => {
    if (document.readyState === 'complete') resolve(true);
    else addEventListener('load', () => resolve(true), { once: true });
  })`);
}

export function collectActivationResourceTiming(entries) {
  const unique = new Map();
  for (const entry of entries || []) {
    const canonicalUrl = String(entry.url || '').replace(/[?#].*$/, '');
    if (!canonicalUrl) continue;
    const candidate = { ...entry, url: canonicalUrl };
    const current = unique.get(canonicalUrl);
    if (!current || candidate.encodedBytes > current.encodedBytes) unique.set(canonicalUrl, candidate);
  }
  const allResources = [...unique.values()].sort((a, b) => a.url.localeCompare(b.url));
  const gameResources = allResources.filter((entry) => {
    try { return new URL(entry.url).pathname.startsWith('/game/'); } catch { return /\/game\//.test(entry.url); }
  });
  const resources = gameResources.filter((entry) => /\/game\/fc-(?:engine\.js|overlay\.css)$/.test(entry.url));
  const unexpectedGameResources = gameResources.filter((entry) => !resources.includes(entry));
  return { allResources, gameResources, resources, unexpectedGameResources };
}

export function collectUniqueResourceTiming(entries) {
  return collectActivationResourceTiming(entries).resources;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function executableVersion(executable) {
  return new Promise((resolveVersion, reject) => {
    const child = spawn(executable, ['--version']);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveVersion(output.trim()) : reject(new Error(`Could not read browser version (${code})`)));
  });
}

async function runtimeCgroupLimits() {
  const membership = await readFile('/proc/self/cgroup', 'utf8');
  const unified = membership.split('\n').find((line) => line.startsWith('0::'));
  if (!unified) throw new Error('A unified cgroup v2 membership is required for profile evidence');
  const cgroupPath = unified.slice(3);
  const base = resolve('/sys/fs/cgroup', `.${cgroupPath}`);
  const [memoryMaxRaw, cpuMaxRaw] = await Promise.all([
    readFile(resolve(base, 'memory.max'), 'utf8'),
    readFile(resolve(base, 'cpu.max'), 'utf8'),
  ]);
  const [quotaRaw, periodRaw] = cpuMaxRaw.trim().split(/\s+/);
  return {
    cgroupPath,
    memoryMaxBytes: memoryMaxRaw.trim() === 'max' ? null : Number(memoryMaxRaw.trim()),
    cpuQuotaMicros: quotaRaw === 'max' ? null : Number(quotaRaw),
    cpuPeriodMicros: Number(periodRaw),
    cpuQuotaPercent: quotaRaw === 'max' ? null : (Number(quotaRaw) / Number(periodRaw)) * 100,
  };
}

async function cpuCalibration(client, rate) {
  const benchmark = `(() => { const start=performance.now(); const data=new Float64Array(750000); let value=0; for(let i=0;i<data.length;i+=1)data[i]=Math.sin(i*0.017)*Math.cos(i*0.013); for(let i=0;i<data.length;i+=1)value+=Math.sqrt(Math.abs(data[i])); return {durationMs:performance.now()-start,value}; })()`;
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const baseline = await evaluate(client, benchmark);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const throttled = await evaluate(client, benchmark);
  const observedSlowdown = throttled.durationMs / Math.max(0.001, baseline.durationMs);
  if (rate > 1 && observedSlowdown <= 1) throw new Error(`Configured CPU throttling did not produce a measured slowdown: ${observedSlowdown.toFixed(2)}x`);
  return { configuredRate: rate, baselineDurationMs: baseline.durationMs, throttledDurationMs: throttled.durationMs, observedSlowdown };
}

export function qualifyReferenceProfile(metadata, calibration) {
  const qualification = metadata?.referenceQualification;
  if (qualification?.method !== 'cdp-cpu-throttling') return qualification;
  const observedCpuSlowdown = calibration?.observedSlowdown;
  if (!Number.isFinite(observedCpuSlowdown) || observedCpuSlowdown < 1) throw new Error('Measured CPU slowdown is required for reference qualification');
  if (qualification.cpuThrottleRate !== metadata.cpuThrottleRate || calibration.configuredRate !== metadata.cpuThrottleRate) {
    throw new Error('Configured CPU throttle does not match reference qualification/calibration');
  }
  const comparisons = (qualification.comparisons || []).map((comparison) => ({
    ...comparison,
    effectiveProfileScore: comparison.hostScore / observedCpuSlowdown,
  }));
  const profileRamQualified = Number.isFinite(qualification.profileRamGb)
    && qualification.profileRamGb <= qualification.referenceRamGb
    && metadata.memoryLimitMb <= qualification.profileRamGb * 1024;
  const stronger = comparisons.filter((comparison) => !Number.isFinite(comparison.effectiveProfileScore)
    || !Number.isFinite(comparison.referenceScore) || comparison.effectiveProfileScore > comparison.referenceScore);
  if (!profileRamQualified || stronger.length > 0) {
    const metrics = stronger.map((comparison) => `${comparison.metric}: ${comparison.effectiveProfileScore.toFixed(2)} > ${comparison.referenceScore}`).join(', ');
    throw new Error(`Measured profile is stronger than reference${metrics ? ` (${metrics})` : ''}`);
  }
  return { ...qualification, qualified: true, observedCpuSlowdown, comparisons };
}

async function main() {
  const url = argument('--url');
  const chromium = argument('--chromium');
  const metadataPath = argument('--metadata');
  const output = argument('--output');
  if (!url || !chromium || !metadataPath || !output) {
    throw new Error('Usage: fc-performance.mjs --url production-url --chromium executable --metadata profile.json --output report.json [--lighthouse report.json]');
  }
  const metadataInput = JSON.parse(await readFile(resolve(metadataPath), 'utf8'));
  const requiredMetadata = ['build', 'buildRoot', 'server', 'device', 'cpu', 'ramGb', 'os', 'viewport', 'dpr', 'powerState', 'thermalState', 'cpuThrottleRate', 'cpuQuotaPercent', 'memoryLimitMb', 'hardwareConcurrency', 'referenceQualification'];
  const missingMetadata = requiredMetadata.filter((field) => metadataInput[field] === undefined || metadataInput[field] === null || metadataInput[field] === '');
  if (missingMetadata.length > 0) throw new Error(`Missing required metadata: ${missingMetadata.join(', ')}`);
  if (!Number.isFinite(metadataInput.cpuThrottleRate) || metadataInput.cpuThrottleRate < 1) throw new Error('cpuThrottleRate must be at least 1');
  if (!Number.isInteger(metadataInput.memoryLimitMb) || metadataInput.memoryLimitMb <= 0) throw new Error('memoryLimitMb must be a positive integer');
  if (!Number.isInteger(metadataInput.hardwareConcurrency) || metadataInput.hardwareConcurrency <= 0) throw new Error('hardwareConcurrency must be a positive integer');
  const viewport = metadataInput.viewport || { width: 1366, height: 768 };
  const browserVersion = await executableVersion(chromium);
  const provenance = await currentProvenance(process.cwd());
  const runtimeLimits = await runtimeCgroupLimits();
  const maximumMemoryBytes = metadataInput.ramGb * 1024 ** 3;
  if (!Number.isFinite(runtimeLimits.memoryMaxBytes) || runtimeLimits.memoryMaxBytes > maximumMemoryBytes) {
    throw new Error(`Run must use aggregate cgroup MemoryMax <= ${metadataInput.ramGb} GB; got ${runtimeLimits.memoryMaxBytes}`);
  }
  if (!Number.isFinite(runtimeLimits.cpuQuotaPercent)
    || Math.abs(runtimeLimits.cpuQuotaPercent - metadataInput.cpuQuotaPercent) > 0.01) {
    throw new Error(`Run must use cgroup CPUQuota ${metadataInput.cpuQuotaPercent}%; got ${runtimeLimits.cpuQuotaPercent}`);
  }
  const browser = await launchChromium(chromium, viewport, metadataInput.memoryLimitMb);
  const runs = [];
  const timingEntries = [];
  let cpuCalibrationEvidence = null;
  let measuredReferenceQualification = null;
  let browserIdentity = null;
  try {
    await browser.client.send('Page.enable');
    await browser.client.send('Runtime.enable');
    await browser.client.send('Network.enable');
    await browser.client.send('Network.setCacheDisabled', { cacheDisabled: true });
    browserIdentity = await browser.client.send('Browser.getVersion');
    if (/HeadlessChrome/i.test(browserIdentity.product || '')) throw new Error(`FPS evidence must use headed Chrome, got ${browserIdentity.product}`);
    cpuCalibrationEvidence = await cpuCalibration(browser.client, metadataInput.cpuThrottleRate);
    measuredReferenceQualification = qualifyReferenceProfile(metadataInput, cpuCalibrationEvidence);
    await browser.client.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: metadataInput.hardwareConcurrency });
    await browser.client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: metadataInput.dpr,
      mobile: metadataInput.profile === 'mobile',
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    for (let run = 0; run < RUN_COUNT; run += 1) {
      await browser.client.send('Page.bringToFront');
      await navigate(browser.client, url);
      await browser.client.send('Page.bringToFront');
      runs.push(await evaluate(browser.client, REFERENCE_PATH_EXPRESSION));
      const entries = await evaluate(browser.client, `performance.getEntriesByType('resource').map((entry) => ({
        url: entry.name,
        initiatorType: entry.initiatorType,
        encodedBytes: entry.encodedBodySize || 0,
        transferBytes: entry.transferSize || 0,
        startTimeMs: entry.startTime,
        durationMs: entry.duration
      }))`);
      timingEntries.push(...entries);
    }
  } finally {
    await browser.close();
  }
  const resourceEvidence = collectActivationResourceTiming(timingEntries);
  const resources = resourceEvidence.resources;
  const requiredResourceSuffixes = ['/game/fc-engine.js', '/game/fc-overlay.css'];
  const missingResources = requiredResourceSuffixes.filter((suffix) => !resources.some((entry) => entry.url.endsWith(suffix)));
  const invalidEncodedResources = resources.filter((entry) => !Number.isFinite(entry.encodedBytes) || entry.encodedBytes <= 0);
  if (missingResources.length > 0) throw new Error(`Resource Timing is missing active resources: ${missingResources.join(', ')}`);
  if (resourceEvidence.unexpectedGameResources.length > 0) {
    throw new Error(`Resource Timing contains unexpected/legacy game resources: ${resourceEvidence.unexpectedGameResources.map((entry) => entry.url).join(', ')}`);
  }
  const preActivationGameResources = [...new Set(runs.flatMap((run) => run.preActivationGameResources || []))];
  if (preActivationGameResources.length > 0) throw new Error(`Pre-activation game resources detected: ${preActivationGameResources.join(', ')}`);
  if (invalidEncodedResources.length > 0) throw new Error(`Resource Timing has non-positive encodedBodySize: ${invalidEncodedResources.map((entry) => entry.url).join(', ')}`);
  const totalEncodedBytes = resources.reduce((total, entry) => total + entry.encodedBytes, 0);
  const payload = await buildPayloadLedger(resolve(process.cwd(), metadataInput.buildRoot));
  const fpsMedians = runs.map((run) => run.medianFps);
  const profile = metadataInput.profile === 'mobile' ? 'mobile' : 'desktop';
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      ...metadataInput,
      commit: provenance.commitSha,
      sourceDigest: provenance.sourceDigest,
      sourceScope: provenance.sourceScope,
      browserVersion,
      browserMode: 'headed-foreground',
      browserProduct: browserIdentity?.product,
      testedUrl: url,
      viewport,
      dpr: metadataInput.dpr,
      runtimeLimits,
      cpuCalibration: cpuCalibrationEvidence,
      referenceQualification: measuredReferenceQualification,
    },
    fps: { profile, warmupPlayingMs: WARMUP_PLAYING_MS, samplePlayingMs: SAMPLE_PLAYING_MS, runs, medianOfThree: median(fpsMedians) },
    resourceTiming: {
      allResources: resourceEvidence.allResources,
      gameResources: resourceEvidence.gameResources,
      unexpectedGameResources: resourceEvidence.unexpectedGameResources,
      preActivationGameResources,
      resources,
      totalEncodedBytes,
    },
    payload,
  };
  const lighthousePath = argument('--lighthouse');
  if (lighthousePath) report.lighthouse = JSON.parse(await readFile(resolve(lighthousePath), 'utf8'));
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const threshold = profile === 'mobile' ? 30 : 50;
  if (report.fps.medianOfThree < threshold || totalEncodedBytes > 150000 || !payload.passed) process.exitCode = 1;
  if (report.lighthouse) {
    const validation = validatePerformanceEvidence(report);
    if (!validation.valid) { console.error(validation.errors.join('\n')); process.exitCode = 1; }
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
