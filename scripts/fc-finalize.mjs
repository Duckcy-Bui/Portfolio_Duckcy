#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPayloadLedger } from './fc-payload.mjs';
import {
  validateAccessibilityEvidence,
  validateLifecycleEvidence,
  validatePerformanceEvidence,
  validateUsabilityEvidence,
} from './fc-evidence.mjs';
import { assertSourceCommitted, currentProvenance } from './fc-provenance.mjs';
import { USABILITY_BUNDLE_PATH, verifyUsabilityBundle } from './fc-usability-chain.mjs';

export const FINAL_ARTIFACT_PATHS = Object.freeze({
  usability: 'evidence/usability-evidence.json',
  accessibility: 'evidence/accessibility-evidence.json',
  performanceDesktop: 'evidence/performance-desktop.json',
  performanceMobile: 'evidence/performance-mobile.json',
  payload: 'evidence/payload.json',
  lifecycle: 'evidence/lifecycle-evidence.json',
});
const ROLES = Object.freeze(Object.keys(FINAL_ARTIFACT_PATHS));
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;


export const FINAL_SUPPORTING_PATHS = Object.freeze([
  'evidence/production-build.json',
  USABILITY_BUNDLE_PATH,
  'evidence/lifecycle-vitest-raw.json',
  'evidence/lighthouse-raw/run-1.json',
  'evidence/lighthouse-raw/run-2.json',
  'evidence/lighthouse-raw/run-3.json',
  'evidence/lighthouse-raw/run-4.json',
  'evidence/lighthouse-raw/run-5.json',
  'evidence/accessibility-raw/browser-checks.json',
  'evidence/accessibility-raw/orca-speech-matches.log',
  'evidence/accessibility-raw/environment.json',
  'evidence/accessibility-raw/checksums.sha256',
  'evidence/full-vitest-raw.json',
  'evidence/property-coverage.json',
]);
function result(errors, details = {}) {
  return { valid: errors.length === 0, errors, details };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function validProvenance(value) {
  return value && exactKeys(value, ['commitSha', 'sourceDigest', 'sourceScope'])
    && HEX_40.test(value.commitSha)
    && HEX_64.test(value.sourceDigest)
    && value.sourceScope === 'fc-source-v1';
}

export function validateFinalManifestShape(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result(['Manifest must be an object']);
  if (!exactKeys(value, ['schemaVersion', 'kind', 'createdAt', 'provenance', 'artifacts', 'supportingArtifacts'])) errors.push('Manifest keys do not match the strict schema');
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (value.kind !== 'flappy-cloud-game-final-evidence') errors.push('kind is invalid');
  if (typeof value.createdAt !== 'string' || !value.createdAt || Number.isNaN(Date.parse(value.createdAt))) errors.push('createdAt must be an ISO timestamp');
  if (!validProvenance(value.provenance)) errors.push('provenance must contain a valid commit SHA and source digest');
  if (!exactKeys(value.artifacts, ROLES)) errors.push(`artifacts must contain exactly: ${ROLES.join(', ')}`);
  const paths = new Set();
  for (const role of ROLES) {
    const descriptor = value.artifacts?.[role];
    if (!descriptor || !exactKeys(descriptor, ['path', 'bytes', 'sha256'])) {
      errors.push(`artifacts.${role} must contain exactly path, bytes and sha256`);
      continue;
    }
    if (typeof descriptor.path !== 'string' || isAbsolute(descriptor.path)
      || !descriptor.path.startsWith('evidence/') || descriptor.path.split('/').includes('..')
      || !descriptor.path.endsWith('.json')) errors.push(`artifacts.${role}.path is unsafe`);
    if (paths.has(descriptor.path)) errors.push('Artifact paths must be unique');
    paths.add(descriptor.path);
    if (!Number.isInteger(descriptor.bytes) || descriptor.bytes <= 0) errors.push(`artifacts.${role}.bytes must be positive`);
    if (!HEX_64.test(descriptor.sha256 || '')) errors.push(`artifacts.${role}.sha256 is invalid`);
  }
  if (!Array.isArray(value.supportingArtifacts) || value.supportingArtifacts.length !== FINAL_SUPPORTING_PATHS.length) {
    errors.push(`supportingArtifacts must contain exactly ${FINAL_SUPPORTING_PATHS.length} entries`);
  } else {
    for (const [index, descriptor] of value.supportingArtifacts.entries()) {
      if (!descriptor || !exactKeys(descriptor, ['path', 'bytes', 'sha256'])) {
        errors.push(`supportingArtifacts[${index}] must contain exactly path, bytes and sha256`);
        continue;
      }
      if (descriptor.path !== FINAL_SUPPORTING_PATHS[index]) errors.push(`supportingArtifacts[${index}].path is not canonical`);
      if (paths.has(descriptor.path)) errors.push('Artifact paths must be unique');
      paths.add(descriptor.path);
      if (!Number.isInteger(descriptor.bytes) || descriptor.bytes <= 0) errors.push(`supportingArtifacts[${index}].bytes must be positive`);
      if (!HEX_64.test(descriptor.sha256 || '')) errors.push(`supportingArtifacts[${index}].sha256 is invalid`);
    }
  }
  return result(errors);
}

function sameProvenance(actual, expected) {
  return actual?.commitSha === expected.commitSha
    && actual?.sourceDigest === expected.sourceDigest
    && actual?.sourceScope === expected.sourceScope;
}

export async function artifactDescriptor(repoRoot, artifactPath) {
  const root = resolve(repoRoot);
  const absolute = resolve(root, artifactPath);
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`Artifact path escapes repository: ${artifactPath}`);
  const details = await lstat(absolute);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Artifact must be a regular non-symlink file: ${artifactPath}`);
  const bytes = await readFile(absolute);
  return { path: relative(root, absolute).replaceAll('\\', '/'), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function collectProductionFiles(root, directory = root, output = []) {
  for (const name of (await readdir(directory)).sort()) {
    if (name === '.fc-production-build.json') continue;
    const absolute = resolve(directory, name);
    const details = await lstat(absolute);
    if (details.isSymbolicLink()) throw new Error(`Production output contains a symbolic link: ${relative(root, absolute)}`);
    if (details.isDirectory()) await collectProductionFiles(root, absolute, output);
    else if (details.isFile()) {
      const bytes = await readFile(absolute);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (path.endsWith('.map')) throw new Error(`Production output contains a source map: ${path}`);
      output.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
    }
  }
  return output;
}

export async function validateProductionBuildEvidence(repoRoot, provenance) {
  const root = resolve(repoRoot);
  const reportBytes = await readFile(resolve(root, 'evidence/production-build.json'));
  const report = JSON.parse(reportBytes);
  if (!exactKeys(report, ['schemaVersion', 'kind', 'createdAt', 'provenance', 'command', 'output', 'digest', 'files'])
    || report.schemaVersion !== 1 || report.kind !== 'flappy-cloud-production-build') throw new Error('Production build report kind/schema/keys are invalid');
  if (!sameProvenance(report.provenance, provenance)) throw new Error('Production build provenance does not match current source');
  if (report.output !== 'build/fc-production' || !/esbuild.*\(\d+(?:\.\d+)+\).*--minify/.test(report.command || '')) throw new Error('Production build command/output is not canonical minified esbuild');
  const outputRoot = resolve(root, report.output);
  const markerBytes = await readFile(resolve(outputRoot, '.fc-production-build.json'));
  if (!reportBytes.equals(markerBytes)) throw new Error('Production build report and embedded marker differ');
  const actualFiles = await collectProductionFiles(outputRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(report.files)) throw new Error('Production build file ledger does not exactly match output bytes/paths');
  const aggregate = createHash('sha256');
  for (const file of actualFiles) aggregate.update(`${file.path}\0${file.sha256}\n`);
  const digest = aggregate.digest('hex');
  if (report.digest !== digest) throw new Error('Production build aggregate digest is inconsistent');
  return { files: actualFiles.length, digest, reportSha256: sha256(reportBytes) };
}

async function validateArtifact(role, value, provenance, repoRoot) {
  if (role === 'usability') {
    const validation = validateUsabilityEvidence(value);
    if (!sameProvenance(value?.provenance, provenance)) validation.errors.push('Usability provenance does not match current source');
    try {
      if (value?.rawEvidence?.bundlePath !== USABILITY_BUNDLE_PATH) throw new Error('Usability raw bundle path is not canonical');
      const bundleBytes = await readFile(resolve(repoRoot, USABILITY_BUNDLE_PATH));
      if (sha256(bundleBytes) !== value?.rawEvidence?.bundleSha256) throw new Error('Usability raw bundle SHA-256 does not match aggregate');
      const bundle = JSON.parse(bundleBytes);
      const buildBytes = await readFile(resolve(repoRoot, 'evidence/production-build.json'));
      const build = JSON.parse(buildBytes);
      validation.metrics.rawBundle = verifyUsabilityBundle(bundle, value, { provenance, buildBytes, build });
    } catch (error) {
      validation.errors.push(error.message);
    }
    validation.valid = validation.errors.length === 0;
    return validation;
  }
  if (role === 'accessibility') {
    const validation = validateAccessibilityEvidence(value);
    if (!sameProvenance(value?.provenance, provenance)) validation.errors.push('Accessibility provenance does not match current source');
    try {
      const rawRoot = resolve(repoRoot, 'evidence/accessibility-raw');
      const rawNames = ['browser-checks.json', 'orca-speech-matches.log', 'environment.json'];
      const rawBytes = Object.fromEntries(await Promise.all(rawNames.map(async (name) => [name, await readFile(resolve(rawRoot, name))])));
      const checksumLines = (await readFile(resolve(rawRoot, 'checksums.sha256'), 'utf8')).trim().split(/\r?\n/);
      const expectedChecksums = new Map(checksumLines.map((line) => {
        const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
        if (!match) throw new Error('Accessibility checksum manifest is malformed');
        return [match[2], match[1]];
      }));
      if (expectedChecksums.size !== rawNames.length
        || rawNames.some((name) => expectedChecksums.get(name) !== sha256(rawBytes[name]))) {
        throw new Error('Accessibility raw checksums do not match the canonical raw files');
      }
      const checks = JSON.parse(rawBytes['browser-checks.json']);
      const environment = JSON.parse(rawBytes['environment.json']);
      const speech = rawBytes['orca-speech-matches.log'].toString('utf8');
      if (checks.pass !== true || !sameProvenance(environment.provenance, provenance)
        || environment.productionBuild !== 'build/fc-production') throw new Error('Accessibility raw browser/environment evidence is stale or failed');
      for (const phrase of ['Play Game', 'No Timer', 'Gate 1 LINT', 'Deployment paused']) {
        if (!speech.includes(phrase)) throw new Error(`Accessibility Orca speech evidence lacks ${phrase}`);
      }
      const run = value.runs?.[0];
      if (run?.browser?.version !== environment.browser?.version
        || run?.screenReader?.version !== environment.screenReader?.version) throw new Error('Accessibility aggregate versions do not match raw environment');
    } catch (error) {
      validation.errors.push(error.message);
    }
    validation.valid = validation.errors.length === 0;
    return validation;
  }
  if (role === 'performanceDesktop' || role === 'performanceMobile') {
    const validation = validatePerformanceEvidence(value);
    const expectedProfile = role === 'performanceDesktop' ? 'desktop' : 'mobile';
    if (value?.fps?.profile !== expectedProfile) validation.errors.push(`${role} must use the ${expectedProfile} profile`);
    const metadataProvenance = {
      commitSha: value?.metadata?.commit,
      sourceDigest: value?.metadata?.sourceDigest,
      sourceScope: value?.metadata?.sourceScope,
    };
    if (!sameProvenance(metadataProvenance, provenance)) validation.errors.push(`${role} provenance does not match current source`);
    try {
      const rawDirectory = value?.lighthouse?.rawReportDirectory;
      if (rawDirectory !== 'evidence/lighthouse-raw') throw new Error('Lighthouse raw report directory is not canonical');
      for (const run of value?.lighthouse?.runs || []) {
        const rawBytes = await readFile(resolve(repoRoot, rawDirectory, `run-${run.run}.json`));
        if (sha256(rawBytes) !== run.rawReportSha256) throw new Error(`Lighthouse raw run ${run.run} SHA-256 mismatch`);
      }
    } catch (error) {
      validation.errors.push(error.message);
    }
    validation.valid = validation.errors.length === 0;
    return validation;
  }
  if (role === 'payload') {
    const expected = await buildPayloadLedger(resolve(repoRoot, 'build/fc-production'));
    return JSON.stringify(value) === JSON.stringify(expected)
      ? result([], { totalEncodedBytes: expected.totalEncodedBytes })
      : result(['Payload artifact is stale or differs from a fresh deterministic ledger']);
  }
  if (role === 'lifecycle') {
    const validation = validateLifecycleEvidence(value);
    if (!sameProvenance(value?.provenance, provenance)) validation.errors.push('Lifecycle provenance does not match current source');
    try {
      if (value?.rawReport?.path !== 'evidence/lifecycle-vitest-raw.json') throw new Error('Lifecycle raw report path is not canonical');
      const rawBytes = await readFile(resolve(repoRoot, value.rawReport.path));
      if (sha256(rawBytes) !== value.rawReport.sha256) throw new Error('Lifecycle raw report SHA-256 mismatch');
    } catch (error) {
      validation.errors.push(error.message);
    }
    validation.valid = validation.errors.length === 0;
    return validation;
  }
  return result([`Unknown artifact role: ${role}`]);
}

async function verifyManifestValue(manifest, repoRoot) {
  const shape = validateFinalManifestShape(manifest);
  const errors = [...shape.errors];
  const details = { artifacts: {} };
  if (!shape.valid) return result(errors, details);
  const provenance = await currentProvenance(repoRoot);
  details.provenance = provenance;
  if (!sameProvenance(manifest.provenance, provenance)) errors.push('Manifest provenance does not match current HEAD/source digest');
  try {
    details.productionBuild = await validateProductionBuildEvidence(repoRoot, provenance);
  } catch (error) {
    errors.push(`productionBuild: ${error.message}`);
  }
  for (const role of ROLES) {
    const descriptor = manifest.artifacts[role];
    try {
      const actualDescriptor = await artifactDescriptor(repoRoot, descriptor.path);
      if (actualDescriptor.bytes !== descriptor.bytes) errors.push(`${role} byte length does not match manifest`);
      if (actualDescriptor.sha256 !== descriptor.sha256) errors.push(`${role} SHA-256 does not match manifest`);
      const value = JSON.parse(await readFile(resolve(repoRoot, descriptor.path), 'utf8'));
      const validation = await validateArtifact(role, value, provenance, repoRoot);
      details.artifacts[role] = validation;
      errors.push(...validation.errors.map((error) => `${role}: ${error}`));
    } catch (error) {
      errors.push(`${role}: ${error.message}`);
    }
  }
  for (const [index, descriptor] of manifest.supportingArtifacts.entries()) {
    try {
      const actualDescriptor = await artifactDescriptor(repoRoot, descriptor.path);
      if (actualDescriptor.bytes !== descriptor.bytes) errors.push(`supportingArtifacts[${index}] byte length does not match manifest`);
      if (actualDescriptor.sha256 !== descriptor.sha256) errors.push(`supportingArtifacts[${index}] SHA-256 does not match manifest`);
    } catch (error) {
      errors.push(`supportingArtifacts[${index}]: ${error.message}`);
    }
  }
  return result(errors, details);
}

export async function buildFinalManifest({ repoRoot = process.cwd(), artifactPaths = FINAL_ARTIFACT_PATHS, output }) {
  const root = resolve(repoRoot);
  await assertSourceCommitted(root);
  if (!exactKeys(artifactPaths, ROLES)) throw new Error(`artifactPaths must contain exactly: ${ROLES.join(', ')}`);
  const artifacts = {};
  for (const role of ROLES) artifacts[role] = await artifactDescriptor(root, artifactPaths[role]);
  const supportingArtifacts = [];
  for (const path of FINAL_SUPPORTING_PATHS) supportingArtifacts.push(await artifactDescriptor(root, path));
  const manifest = {
    schemaVersion: 1,
    kind: 'flappy-cloud-game-final-evidence',
    createdAt: new Date().toISOString(),
    provenance: await currentProvenance(root),
    artifacts,
    supportingArtifacts,
  };
  const validation = await verifyManifestValue(manifest, root);
  if (!validation.valid) throw new Error(`Final manifest refused:\n${validation.errors.join('\n')}`);
  if (output) await writeFile(resolve(root, output), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, validation };
}

export async function verifyFinalManifest({ repoRoot = process.cwd(), input }) {
  if (!input) throw new Error('Manifest input is required');
  const root = resolve(repoRoot);
  await assertSourceCommitted(root);
  const manifest = JSON.parse(await readFile(resolve(root, input), 'utf8'));
  return verifyManifestValue(manifest, root);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const repoRoot = resolve(argument('--root') || process.cwd());
  if (process.argv.includes('--build')) {
    const output = argument('--output') || 'evidence/final-manifest.json';
    const built = await buildFinalManifest({ repoRoot, output });
    process.stdout.write(`${JSON.stringify(built, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--verify')) {
    const input = argument('--input') || 'evidence/final-manifest.json';
    const validation = await verifyFinalManifest({ repoRoot, input });
    process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    if (!validation.valid) process.exitCode = 1;
    return;
  }
  throw new Error('Usage: fc-finalize.mjs --build [--output evidence/final-manifest.json] | --verify [--input manifest.json]');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
