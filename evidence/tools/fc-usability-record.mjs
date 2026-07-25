#!/usr/bin/env node
import { createHash, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { currentProvenance } from '../../scripts/fc-provenance.mjs';

const HUMAN_ATTESTATION = 'I_OBSERVED_A_REAL_NON_DEVELOPER';
const CORE_ASSETS = ['index.html', 'script.js', 'styles.css', 'game/fc-engine.js', 'game/fc-overlay.css'];
const ALLOWED_PROTOCOL_PREFIXES = ['Browser.', 'Page.', 'Runtime.'];

function fail(message) { throw new Error(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function parseArgs(argv) {
  const options = { timeoutMs: 20 * 60_000, noSandbox: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--no-sandbox') options.noSandbox = true;
    else if (key.startsWith('--')) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail(`Missing value for ${key}`);
      options[key.slice(2)] = value;
    } else fail(`Unexpected argument: ${key}`);
  }
  if (options['timeout-ms']) options.timeoutMs = Number(options['timeout-ms']);
  for (const key of ['url', 'chromium', 'participant', 'study-id', 'output', 'signing-key', 'human-attestation']) {
    if (!options[key]) fail(`--${key} is required`);
  }
  if (!/^P-[A-Za-z0-9_-]{2,32}$/.test(options.participant)) fail('--participant must match P-[A-Za-z0-9_-]{2,32}');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(options['study-id'])) fail('--study-id must be pseudonymous');
  if (options['human-attestation'] !== HUMAN_ATTESTATION) fail(`--human-attestation must equal ${HUMAN_ATTESTATION}`);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) fail('--timeout-ms must be at least 30000');
  return options;
}
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
async function waitFor(read, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await read(); if (value) return value; } catch (error) { lastError = error; }
    await sleep(100);
  }
  fail(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}
async function interactiveAttestation(participantId, stage) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('A real facilitator must run this recorder in an interactive terminal (TTY)');
  const expected = `${stage} ${participantId}`;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Type ${JSON.stringify(expected)} to attest that a real non-developer ${stage === 'BEGIN' ? 'is at the device' : 'personally completed this observed run'}: `);
    if (answer.trim() !== expected) fail('Interactive facilitator attestation did not match');
  } finally { rl.close(); }
}
async function verifyServedBuild(url, provenance) {
  const reportBytes = await readFile('evidence/production-build.json');
  const report = JSON.parse(reportBytes);
  if (JSON.stringify(report.provenance) !== JSON.stringify(provenance)) fail('Production build provenance is stale');
  const servedAssets = {};
  for (const path of CORE_ASSETS) {
    const expected = report.files.find((file) => file.path === path);
    if (!expected) fail(`Production manifest lacks ${path}`);
    const response = await fetch(new URL(path === 'index.html' ? './' : path, url), { cache: 'no-store' });
    if (!response.ok) fail(`Could not fetch production asset ${path}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = sha256(bytes);
    if (actual !== expected.sha256 || bytes.byteLength !== expected.bytes) fail(`Served asset does not match production manifest: ${path}`);
    servedAssets[path] = { bytes: bytes.byteLength, sha256: actual };
  }
  return { manifestSha256: sha256(reportBytes), digest: report.digest, servedAssets };
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.methods = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }
  static async connect(url) {
    if (typeof WebSocket !== 'function') fail('This recorder requires Node.js with global WebSocket support');
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), { once: true });
    });
    return new CdpClient(socket);
  }
  send(method, params = {}) {
    if (method.startsWith('Input.')) fail(`Forbidden automation protocol call: ${method}`);
    if (!ALLOWED_PROTOCOL_PREFIXES.some((prefix) => method.startsWith(prefix))) fail(`Protocol method is not observation/setup allowlisted: ${method}`);
    this.methods.push(method);
    const id = ++this.sequence;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { method, resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

const MONITOR_SOURCE = String.raw`(() => {
  const key = '__fcHumanEvidenceV1';
  if (globalThis[key]) return;
  const state = { version: 1, transitions: [], trustedInputs: [], attention: [], phase: null };
  const now = () => performance.timeOrigin + performance.now();
  const readPhase = () => document.querySelector('[data-flight-surface]')?.dataset.fcPhase
    || document.querySelector('[data-screen]')?.dataset.screen || null;
  const attention = (reason) => state.attention.push({ atMs: now(), reason, visibility: document.visibilityState, focused: document.hasFocus() });
  const sample = (reason) => {
    const phase = readPhase();
    if (!phase || phase === state.phase) return;
    state.phase = phase;
    state.transitions.push({ phase, atMs: now(), reason, visibility: document.visibilityState, focused: document.hasFocus() });
  };
  const boot = () => {
    for (const type of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(type, (event) => {
      if (!event.isTrusted || !event.target?.closest?.('[data-flappy-cloud-game]')) return;
      state.trustedInputs.push({ type, atMs: now() });
    }, { capture: true, passive: true });
    new MutationObserver(() => sample('mutation')).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-fc-phase', 'data-screen'] });
    document.addEventListener('visibilitychange', () => attention('visibilitychange'), true);
    window.addEventListener('focus', () => attention('focus'), true);
    window.addEventListener('blur', () => attention('blur'), true);
    attention('monitor-start');
    sample('monitor-start');
  };
  Object.defineProperty(globalThis, key, { value: state, configurable: false, enumerable: false, writable: false });
  if (document.documentElement) boot(); else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();`;

async function monitorRun(client, targetUrl, timeoutMs) {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  const version = await client.send('Browser.getVersion');
  if (/Headless/i.test(`${version.product} ${version.userAgent}`)) fail('Headless browsers are forbidden for human usability evidence');
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: MONITOR_SOURCE });
  await client.send('Page.navigate', { url: targetUrl });
  await client.send('Page.bringToFront');
  const evaluate = async () => {
    const response = await client.send('Runtime.evaluate', {
      expression: `(() => { const s=globalThis.__fcHumanEvidenceV1; if(!s)return null; return {url:location.href, title:document.title, phase:s.phase, transitions:s.transitions, trustedInputs:s.trustedInputs, attention:s.attention, visibility:document.visibilityState, focused:document.hasFocus()}; })()`,
      returnByValue: true,
    });
    if (response.exceptionDetails) fail('Browser monitor evaluation failed');
    return response.result?.value || null;
  };
  await waitFor(async () => { const state = await evaluate(); return state?.url === targetUrl || state?.url === new URL(targetUrl).href ? state : null; }, 'the production page monitor');
  process.stdout.write('\nRecorder is observation-only. Give the participant the keyboard/mouse now.\nThey must open Play Game, select Start, and reach Production Saved! with no more than one retry.\n\n');
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await evaluate();
    if (snapshot?.phase === 'WON' || snapshot?.transitions?.some((transition) => transition.phase === 'WON')) break;
    await sleep(100);
  }
  if (!snapshot?.transitions?.some((transition) => transition.phase === 'WON')) fail('Timed out before the participant reached WON');
  await sleep(250);
  snapshot = await evaluate();
  return { version, snapshot };
}

export function summarizeObservation(snapshot, protocolMethods) {
  const transitions = snapshot.transitions;
  const startIndex = transitions.findIndex((transition, index) => transition.phase === 'PLAYING'
    && transitions.slice(0, index).some((prior) => prior.phase === 'READY'));
  const wonIndex = transitions.findIndex((transition, index) => index > startIndex && transition.phase === 'WON');
  if (startIndex < 0 || wonIndex < 0) fail('Could not observe a READY → PLAYING → WON session');
  const start = transitions[startIndex];
  const won = transitions[wonIndex];
  const trustedBeforeStart = snapshot.trustedInputs.filter((input) => input.atMs <= start.atMs);
  const latestBeforeStart = trustedBeforeStart.at(-1);
  const trustedAfterStart = snapshot.trustedInputs.filter((input) => input.atMs > start.atMs && input.atMs <= won.atMs);
  const retries = transitions.slice(startIndex + 1, wonIndex).filter((transition) => transition.phase === 'CRASHED').length;
  const attentionViolations = snapshot.attention.filter((entry) => entry.atMs >= start.atMs && entry.atMs <= won.atMs
    && (entry.visibility !== 'visible' || entry.focused !== true));
  if (!latestBeforeStart || start.atMs - latestBeforeStart.atMs > 2_000 || start.atMs < latestBeforeStart.atMs - 100) fail('Start was not preceded by a trusted participant input');
  if (trustedAfterStart.length < 1) fail('No trusted gameplay input was observed after Start');
  if (retries > 1) fail('Participant exceeded one retry');
  if (attentionViolations.length) fail('The page lost foreground/focus during the measured session');
  if (snapshot.visibility !== 'visible' || snapshot.focused !== true) fail('WON was not observed in a focused foreground page');
  return {
    startTimestampMs: start.atMs,
    wonTimestampMs: won.atMs,
    durationMs: won.atMs - start.atMs,
    retries,
    trustedInputCount: snapshot.trustedInputs.length,
    trustedGameplayInputCount: trustedAfterStart.length,
    startTrustedInputAgeMs: start.atMs - latestBeforeStart.atMs,
    trustedEventTypeCounts: Object.fromEntries(['pointerdown', 'keydown', 'touchstart'].map((type) => [type, snapshot.trustedInputs.filter((input) => input.type === type).length])),
    attentionViolationCount: attentionViolations.length,
    startForeground: start.visibility === 'visible' && start.focused === true,
    wonForeground: snapshot.visibility === 'visible' && snapshot.focused === true,
    transitions,
    protocolMethods: [...new Set(protocolMethods)],
    inputProtocolCallCount: protocolMethods.filter((method) => method.startsWith('Input.')).length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await interactiveAttestation(options.participant, 'BEGIN');
  const provenance = await currentProvenance();
  const build = await verifyServedBuild(options.url, provenance);
  const profileDir = await mkdtemp(join(tmpdir(), 'fc-human-profile-'));
  const chromeArgs = [
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-features=Translate',
  ];
  if (options.noSandbox) chromeArgs.push('--no-sandbox');
  chromeArgs.push('about:blank');
  const browser = spawn(resolve(options.chromium), chromeArgs, { stdio: ['ignore', 'ignore', 'ignore'] });
  let client;
  try {
    const activePort = await waitFor(async () => {
      const text = await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8');
      const port = Number(text.split(/\r?\n/)[0]);
      return Number.isInteger(port) && port > 0 ? port : null;
    }, 'headed Chrome DevTools port');
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${activePort}/json/list`);
      const targets = await response.json();
      return targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
    }, 'headed Chrome page target');
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    const { version, snapshot } = await monitorRun(client, new URL(options.url).href, options.timeoutMs);
    const observation = summarizeObservation(snapshot, client.methods);
    client.close(); client = null;
    browser.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => browser.once('exit', resolveExit)), sleep(3_000)]);
    await interactiveAttestation(options.participant, 'COMPLETE');
    const payload = {
      schemaVersion: 1,
      kind: 'flappy-cloud-human-usability-session',
      studyId: options['study-id'],
      participantId: options.participant,
      capturedAt: new Date().toISOString(),
      provenance,
      attestation: { realHuman: true, nonDeveloper: true, facilitatorPresent: true, interactiveBeginAndComplete: true },
      browser: { mode: 'headed-foreground', product: version.product, userAgent: version.userAgent, protocolVersion: version.protocolVersion },
      testedUrl: new URL(options.url).href,
      productionBuild: build,
      observation,
    };
    const payloadBytes = Buffer.from(canonical(payload));
    const privateKey = await readFile(resolve(options['signing-key']));
    const session = {
      ...payload,
      integrity: { algorithm: 'sha256+Ed25519', payloadSha256: sha256(payloadBytes), signatureBase64: sign(null, payloadBytes, privateKey).toString('base64') },
    };
    await writeFile(resolve(options.output), `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`Recorded signed human session ${options.participant} to ${options.output}\n`);
  } finally {
    try { client?.close(); } catch {}
    if (browser.exitCode === null) browser.kill('SIGTERM');
    await rm(profileDir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(`Usability recorder refused evidence: ${error.message}`); process.exitCode = 1; });
}
