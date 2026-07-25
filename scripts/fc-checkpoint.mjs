#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { currentProvenance } from './fc-provenance.mjs';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run(command, args, cwd, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolveRun({ exitCode, stdout, stderr }));
  });
}

export function propertyCoverage(source) {
  const labels = [...source.matchAll(/\/\/ Feature: flappy-cloud-game, Property (P\d{2}): ([^\n]+)/g)]
    .map((match) => ({ id: match[1], description: match[2].trim() }));
  const expected = Array.from({ length: 38 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
  const ids = labels.map((entry) => entry.id);
  const assertCount = (source.match(/fc\.assert\s*\(\s*fc\.property\s*\(/g) || []).length;
  const runCounts = [...source.matchAll(/numRuns:\s*(\d+)/g)].map((match) => Number(match[1]));
  const errors = [];
  if (JSON.stringify(ids) !== JSON.stringify(expected)) errors.push('Property labels must be exactly P01-P38 in order');
  if (assertCount !== 38) errors.push('Every property must use fc.assert(fc.property)');
  if (runCounts.length !== 38 || runCounts.some((count) => count < 100)) errors.push('Every property requires numRuns >= 100');
  if (/\.(?:skip|only)\s*\(|\b(?:it|test|describe)\.(?:skip|only)\b/.test(source)) errors.push('Focused/skipped property tests are forbidden');
  return {
    valid: errors.length === 0,
    errors,
    properties: labels.map((entry, index) => ({ ...entry, testFile: 'tests/flappy-cloud-game/properties.test.js', numRuns: runCounts[index] })),
  };
}

async function main() {
  const root = resolve(argument('--root', process.cwd()));
  const rawOutput = resolve(argument('--raw-output', 'evidence/full-vitest-raw.json'));
  const coverageOutput = resolve(argument('--coverage-output', 'evidence/property-coverage.json'));
  const seed = Number(argument('--seed', '20260725'));
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  const workspace = await mkdtemp(join(tmpdir(), 'fc-checkpoint-'));
  const tempReport = join(workspace, 'vitest.json');
  const executable = resolve(root, 'node_modules/.bin/vitest');
  try {
    const execution = await run(executable, ['--run', '--reporter=json', `--outputFile=${tempReport}`], root, { ...process.env, FC_SEED: String(seed) });
    if (execution.exitCode !== 0) throw new Error(`Full Vitest checkpoint failed (${execution.exitCode})\n${execution.stderr.slice(-4000)}`);
    const reportBytes = await readFile(tempReport);
    const report = JSON.parse(reportBytes.toString('utf8'));
    if (!report.success || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numTodoTests !== 0) {
      throw new Error(`Full checkpoint has failed/pending/todo tests: ${JSON.stringify({ success: report.success, failed: report.numFailedTests, pending: report.numPendingTests, todo: report.numTodoTests })}`);
    }
    const source = await readFile(resolve(root, 'tests/flappy-cloud-game/properties.test.js'), 'utf8');
    const coverage = propertyCoverage(source);
    if (!coverage.valid) throw new Error(coverage.errors.join('\n'));
    await writeFile(rawOutput, reportBytes);
    const artifact = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provenance: await currentProvenance(root),
      seed,
      totals: {
        testFiles: report.testResults?.length || 0,
        tests: report.numTotalTests,
        passed: report.numPassedTests,
        failed: report.numFailedTests,
        pending: report.numPendingTests,
        todo: report.numTodoTests,
      },
      ...coverage,
    };
    await writeFile(coverageOutput, `${JSON.stringify(artifact, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ totals: artifact.totals, propertyCount: artifact.properties.length, seed }, null, 2)}\n`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
