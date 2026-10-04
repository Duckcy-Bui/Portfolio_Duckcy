#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { artifactManifest } from './verify-site.mjs';

const origin = 'http://127.0.0.1:4323';
const chromePath = process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
if (!existsSync(chromePath)) throw new Error('Install Chromium with npx playwright install chromium, or set CHROME_PATH.');
await mkdir('artifacts/lighthouse', { recursive: true });
const before = await artifactManifest('dist');
const server = spawn(process.execPath, [resolve('node_modules/astro/bin/astro.mjs'), 'preview', '--host', '127.0.0.1', '--port', '4323', '--ignore-lock'], { stdio: 'ignore' });
let serverError;
server.on('error', (error) => { serverError = error; });
const stopServer = () => server.kill('SIGTERM');
process.once('SIGINT', () => { stopServer(); process.exit(130); });
process.once('SIGTERM', () => { stopServer(); process.exit(143); });

function runLighthouse(url, output) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [
      resolve('node_modules/lighthouse/cli/index.js'), url,
      '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json', '--output=html', `--output-path=${output}`, '--quiet',
    ], { env: { ...process.env, CHROME_PATH: chromePath }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`Lighthouse exited ${code ?? signal}`)));
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverError || server.exitCode !== null) throw serverError || new Error('Performance preview server exited.');
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Wait for preview. */ }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error('Performance preview did not start within ten seconds.');
  const pages = [];
  for (const [name, route] of [['home', '/'], ['projects', '/projects/']]) {
    const runs = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const output = `artifacts/lighthouse/${name}-${attempt}`;
      console.log(`Cold mobile Lighthouse: ${route}, run ${attempt}/3`);
      await runLighthouse(`${origin}${route}`, output);
      const result = JSON.parse(await readFile(`${output}.report.json`, 'utf8'));
      if (result.runtimeError) throw new Error(result.runtimeError.message);
      const scores = Object.fromEntries(Object.entries(result.categories).map(([category, value]) => [category, Math.round(value.score * 100)]));
      runs.push({
        report: `${output}.report.json`, fetchedAt: result.fetchTime, lighthouseVersion: result.lighthouseVersion,
        scores, metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time'].map((key) => [key, result.audits[key]?.numericValue])),
      });
      console.log(JSON.stringify(scores));
    }
    const medianPerformance = runs.map((run) => run.scores.performance).sort((a, b) => a - b)[1];
    const minimumAccessibility = Math.min(...runs.map((run) => run.scores.accessibility));
    pages.push({ route, runs, medianPerformance, minimumAccessibility, passed: medianPerformance >= 90 && minimumAccessibility >= 95 });
  }
  const after = await artifactManifest('dist');
  const report = {
    generatedAt: new Date().toISOString(), artifactDigest: before.digest,
    artifactMatches: before.digest === after.digest, origin, liveProduction: false,
    method: 'Three independent cold mobile Lighthouse runs per page, default simulated throttling; median performance >= 90 and accessibility >= 95 on every run.',
    pages, passed: before.digest === after.digest && pages.every((page) => page.passed),
  };
  await writeFile('artifacts/lighthouse-summary.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Performance acceptance ${report.passed ? 'PASS' : 'FAIL'}: artifacts/lighthouse-summary.json`);
  if (!report.passed) process.exitCode = 1;
} finally {
  stopServer();
}
