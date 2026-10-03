#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { artifactManifest } from './verify-site.mjs';

async function readEvidence(file) {
  try {
    const bytes = await readFile(file);
    return { path: file, sha256: createHash('sha256').update(bytes).digest('hex'), value: JSON.parse(bytes) };
  } catch (error) {
    return { path: file, unavailable: error.code || error.message };
  }
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const verification = await readEvidence('artifacts/site-verification.json');
const browser = await readEvidence('artifacts/playwright.json');
const browserBuild = await readEvidence('artifacts/browser-build.json');
const unit = await readEvidence('artifacts/vitest.json');
const liveProxy = await readEvidence('artifacts/live-proxy.json');
const performance = await readEvidence('artifacts/lighthouse-summary.json');
const audit = await readEvidence('artifacts/npm-audit.json');
const performanceReports = [];
for (const page of performance.value?.pages || []) {
  for (const run of page.runs || []) {
    const raw = await readEvidence(run.report);
    performanceReports.push({ path: raw.path, sha256: raw.sha256, unavailable: raw.unavailable, fetchedAt: raw.value?.fetchTime });
  }
}
let artifact;
try { artifact = await artifactManifest('dist'); }
catch (error) { artifact = { unavailable: error.code || error.message }; }
const failedBrowser = (browser.value?.stats?.unexpected || 0) > 0 || (browser.value?.stats?.flaky || 0) > 0;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    workingTree: git(['status', '--porcelain']).split('\n').filter(Boolean),
    node: process.version,
  },
  artifact,
  evidence: {
    staticVerification: {
      path: verification.path,
      sha256: verification.sha256,
      unavailable: verification.unavailable,
      passed: verification.value?.passed,
      artifactMatches: Boolean(verification.value?.artifact?.digest && verification.value.artifact.digest === artifact.digest),
      issues: verification.value?.failures,
    },
    browserAcceptance: {
      path: browser.path,
      sha256: browser.sha256,
      unavailable: browser.unavailable,
      passed: browser.value ? !failedBrowser && browser.value.stats?.expected > 0 : null,
      artifactMatches: Boolean(browserBuild.value?.artifactDigest && browserBuild.value.artifactDigest === artifact.digest),
      completeRun: browserBuild.value ? browserBuild.value.filteredRun === false : false,
      buildBinding: { path: browserBuild.path, sha256: browserBuild.sha256, unavailable: browserBuild.unavailable, ...browserBuild.value },
      stats: browser.value?.stats,
      target: 'http://127.0.0.1:4321',
      liveProduction: false,
      externalServices: 'The AI proxy and optional Credly embed are mocked for deterministic interface/failure tests. Live provider responses and third-party iframe accessibility are separate acceptance checks.',
    },
    astroCheck: process.env.QA_CHECK_STATUS || 'not recorded; consult command output',
    unitTests: {
      commandStatus: process.env.QA_UNIT_STATUS || 'not recorded; consult command output',
      path: unit.path,
      sha256: unit.sha256,
      unavailable: unit.unavailable,
      passed: unit.value?.success,
      total: unit.value?.numTotalTests,
      passedCount: unit.value?.numPassedTests,
      failedCount: unit.value?.numFailedTests,
    },
    build: process.env.QA_BUILD_STATUS || 'not recorded; consult command output',
    performance: {
      path: performance.path,
      sha256: performance.sha256,
      unavailable: performance.unavailable,
      passed: performance.value?.passed,
      artifactMatches: Boolean(performance.value?.artifactDigest && performance.value.artifactDigest === artifact.digest && performance.value.artifactMatches),
      origin: performance.value?.origin,
      liveProduction: false,
      method: performance.value?.method,
      pages: performance.value?.pages,
      rawReports: performanceReports,
    },
    dependencyAudit: {
      path: audit.path,
      sha256: audit.sha256,
      unavailable: audit.unavailable,
      vulnerabilities: audit.value?.metadata?.vulnerabilities,
      scope: 'Package audit is separate from static/browser/performance acceptance. Review advisories and affected build/server paths; no server runtime is shipped in the Pages artifact.',
    },
    externalProxyConnectivity: {
      path: liveProxy.path,
      sha256: liveProxy.sha256,
      unavailable: liveProxy.unavailable,
      observation: liveProxy.value,
      scope: 'Separate connectivity and CORS observation from the existing live origin. Not acceptance of this new static interface or its complete chatbot prompt.',
    },
  },
  liveProductionAcceptance: 'Not run. Deploy and verify HTTP status, clean paths, custom 404, HTTPS, and www redirect separately.',
  thirdPartyAccessibility: 'The owned pages are tested with the optional Credly script mocked. A live vendor iframe was observed with insufficient contrast in its small attribution footer; this cross-origin content is outside the portfolio stylesheet.',
  historicalEvidence: 'Legacy evidence/ files describe the previous one-page/game build and are not acceptance evidence for this artifact.',
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/qa-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`QA report: artifacts/qa-report.json (commit ${report.source.commit.slice(0, 7)}, artifact ${artifact.digest?.slice(0, 12) || 'unavailable'})`);
if (!report.evidence.staticVerification.passed || !report.evidence.staticVerification.artifactMatches
  || report.evidence.browserAcceptance.passed !== true || !report.evidence.browserAcceptance.artifactMatches
  || !report.evidence.browserAcceptance.completeRun
  || report.evidence.performance.passed !== true || !report.evidence.performance.artifactMatches
  || performanceReports.length !== 6 || performanceReports.some((raw) => raw.unavailable)
  || unit.value?.success !== true
  || (process.env.QA_CHECK_STATUS !== undefined && process.env.QA_CHECK_STATUS !== 'success')
  || (process.env.QA_UNIT_STATUS !== undefined && process.env.QA_UNIT_STATUS !== 'success')
  || (process.env.QA_BUILD_STATUS !== undefined && process.env.QA_BUILD_STATUS !== 'success')) process.exitCode = 1;
