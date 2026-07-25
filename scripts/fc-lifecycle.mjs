#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { currentProvenance } from './fc-provenance.mjs';

const TARGETS = Object.freeze([
  'tests/flappy-cloud-game/mounted.test.js',
  'tests/flappy-cloud-game/properties.test.js',
  'tests/flappy-cloud-game/portfolio.test.js',
]);
const REQUIRED_ASSERTIONS = Object.freeze({
  stress20: 'repeats open/close for 20 rounds with no loops, timers, observers, listeners or DOM leaks',
  fullStress20: 'runs 20 full retry, runtime-error, close, and reopen rounds with one bootstrap listener and zero leaked resources',
  p37: 'P37 arbitrary mounted open, input, pause, error, close, and reopen sequences end with zero resources',
  p38: 'P38 overlay lifecycle and error-back commands restore generated portfolio snapshots exactly once',
  runtimeError: 'catches a runtime renderer throw, cancels rAF, freezes state, and offers Back only',
});

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolveRun({ exitCode, stdout, stderr }));
  });
}

export function summarizeLifecycleRun(report, propertiesSource) {
  const assertions = (report.testResults || []).flatMap((result) => result.assertionResults || []);
  const passedNames = new Set(assertions.filter((assertion) => assertion.status === 'passed').map((assertion) => assertion.fullName));
  const requiredAssertions = {};
  for (const [key, title] of Object.entries(REQUIRED_ASSERTIONS)) {
    requiredAssertions[key] = [...passedNames].some((name) => name.endsWith(title));
  }
  const propertyRuns = {};
  for (const property of ['P37', 'P38']) {
    const match = propertiesSource.match(new RegExp(`Property ${property}:[\\s\\S]*?numRuns:\\s*(\\d+)`));
    propertyRuns[property] = match ? Number(match[1]) : 0;
  }
  return {
    success: report.success === true && report.numFailedTests === 0 && Object.values(requiredAssertions).every(Boolean),
    totals: {
      tests: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      pending: report.numPendingTests,
    },
    requiredAssertions,
    stressRounds: requiredAssertions.stress20 ? 20 : 0,
    propertyRuns,
    assertedFinalResourceCounts: {
      loops: 0,
      timers: 0,
      observers: 0,
      gameOwnedListeners: 0,
      mediaListeners: 0,
      pointerCaptures: 0,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const repoRoot = resolve(argument('--root') || process.cwd());
  const output = argument('--output');
  if (!output) throw new Error('Usage: fc-lifecycle.mjs --output evidence/lifecycle-evidence.json [--raw-output evidence/lifecycle-vitest-raw.json] [--root repo]');
  const rawOutput = argument('--raw-output') || 'evidence/lifecycle-vitest-raw.json';
  const workspace = await mkdtemp(join(tmpdir(), 'fc-lifecycle-'));
  const reportPath = join(workspace, 'vitest.json');
  const command = resolve(repoRoot, 'node_modules/.bin/vitest');
  const args = ['--run', ...TARGETS, '--reporter=json', `--outputFile=${reportPath}`];
  try {
    const execution = await run(command, args, repoRoot);
    if (execution.exitCode !== 0) throw new Error(`Lifecycle Vitest run failed (${execution.exitCode})\n${execution.stderr.slice(-4000)}`);
    const reportBytes = await readFile(reportPath);
    const report = JSON.parse(reportBytes.toString('utf8'));
    await writeFile(resolve(rawOutput), reportBytes);
    const rawReportSha256 = createHash('sha256').update(reportBytes).digest('hex');
    const propertiesSource = await readFile(resolve(repoRoot, 'tests/flappy-cloud-game/properties.test.js'), 'utf8');
    const summary = summarizeLifecycleRun(report, propertiesSource);
    if (!summary.success || summary.propertyRuns.P37 < 100 || summary.propertyRuns.P38 < 100) {
      throw new Error(`Lifecycle evidence requirements failed: ${JSON.stringify(summary)}`);
    }
    const packageJson = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
    const artifact = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provenance: await currentProvenance(repoRoot),
      command: `${command} --run ${TARGETS.join(' ')} --reporter=json --outputFile=<temporary-json-report>`,
      rawReport: { path: relative(repoRoot, resolve(rawOutput)).replaceAll('\\', '/'), sha256: rawReportSha256 },
      runner: { name: 'vitest', version: packageJson.devDependencies?.vitest || '' },
      targets: TARGETS,
      ...summary,
    };
    await writeFile(resolve(output), `${JSON.stringify(artifact, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
