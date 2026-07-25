#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { median } from './fc-evidence.mjs';

const RUN_COUNT = 5;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function command(executable, args) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveCommand({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${executable} exited ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

export function summarizeLighthouseRuns(runs) {
  const lcpRunsMs = runs.map((run) => run.lcpMs);
  const clsRuns = runs.map((run) => run.cls);
  return {
    runs,
    lcpRunsMs,
    clsRuns,
    medianLcpMs: median(lcpRunsMs),
    medianCls: median(clsRuns),
  };
}

async function main() {
  const url = argument('--url');
  const chromium = argument('--chromium');
  const lighthouse = argument('--lighthouse');
  const output = argument('--output');
  const rawDir = argument('--raw-dir');
  if (!url || !chromium || !lighthouse || !output) {
    throw new Error('Usage: fc-lighthouse.mjs --url production-url --chromium executable --lighthouse executable --output report.json [--raw-dir evidence/lighthouse-raw]');
  }
  if (rawDir) await mkdir(resolve(rawDir), { recursive: true });
  const workspace = await mkdtemp(join(tmpdir(), 'fc-lighthouse-'));
  const configPath = join(workspace, 'lighthouse.config.cjs');
  const config = `module.exports = {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: ['performance'],
      throttlingMethod: 'devtools',
      throttling: {
        rttMs: 150,
        throughputKbps: 1600,
        requestLatencyMs: 150,
        downloadThroughputKbps: 1600,
        uploadThroughputKbps: 750,
        cpuSlowdownMultiplier: 4
      },
      screenEmulation: { mobile: true, width: 360, height: 800, deviceScaleFactor: 1, disabled: false },
      formFactor: 'mobile',
      disableStorageReset: false
    }
  };\n`;
  await writeFile(configPath, config);
  process.env.CHROME_PATH = chromium;
  const lighthouseVersion = (await command(lighthouse, ['--version'])).stdout;
  const chromiumVersion = (await command(chromium, ['--version'])).stdout;
  const runs = [];
  try {
    for (let index = 0; index < RUN_COUNT; index += 1) {
      const reportPath = join(workspace, `run-${index + 1}.json`);
      await command(lighthouse, [
        url,
        `--chrome-path=${chromium}`,
        `--config-path=${configPath}`,
        '--output=json',
        `--output-path=${reportPath}`,
        '--quiet',
        '--chrome-flags=--headless=new --incognito --no-first-run --no-sandbox --disable-gpu --disable-dev-shm-usage',
      ]);
      const rawReport = await readFile(reportPath);
      const rawReportSha256 = createHash('sha256').update(rawReport).digest('hex');
      if (rawDir) await writeFile(resolve(rawDir, `run-${index + 1}.json`), rawReport);
      const report = JSON.parse(rawReport.toString('utf8'));
      const lcpMs = report.audits?.['largest-contentful-paint']?.numericValue;
      const cls = report.audits?.['cumulative-layout-shift']?.numericValue;
      if (!Number.isFinite(lcpMs) || !Number.isFinite(cls)) throw new Error(`Run ${index + 1} lacks numeric LCP/CLS`);
      const requests = report.audits?.['network-requests']?.details?.items || [];
      const gameplayResources = requests.map((request) => request.url).filter((requestUrl) => /\/game\//.test(requestUrl));
      if (gameplayResources.length > 0) throw new Error(`CTA/game resource loaded during pre-activation Lighthouse run: ${gameplayResources.join(', ')}`);
      runs.push({ run: index + 1, lcpMs, cls, gameplayResources, rawReportSha256 });
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
  const summary = summarizeLighthouseRuns(runs);
  const result = {
    ...summary,
    profile: {
      viewport: { width: 360, height: 800 }, dpr: 1, cpuSlowdown: 4,
      rttMs: 150, downlinkKbps: 1600, uplinkKbps: 750, coldCache: true,
    },
    lighthouseVersion,
    chromiumVersion,
    testedUrl: url,
    rawReportDirectory: rawDir || null,
    passed: summary.medianLcpMs <= 2500 && summary.medianCls <= 0.1,
  };
  await writeFile(resolve(output), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
