#!/usr/bin/env node
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { currentProvenance } from '../../scripts/fc-provenance.mjs';
import { validateUsabilityEvidence } from '../../scripts/fc-evidence.mjs';
import {
  CORE_BUILD_ASSETS,
  USABILITY_BUNDLE_PATH,
  sha256,
  verifySignedUsabilitySession,
  verifyUsabilityBundle,
} from '../../scripts/fc-usability-chain.mjs';

const FINAL_ATTESTATION = 'I_ATTEST_FIVE_REAL_NON_DEVELOPER_PARTICIPANTS';
function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; const value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) fail(`Expected --key value, received ${key || '<end>'}`);
    options[key.slice(2)] = value;
  }
  for (const key of ['sessions', 'study-id', 'public-key', 'bundle-output', 'output', 'human-attestation']) {
    if (!options[key]) fail(`--${key} is required`);
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(options['study-id'])) fail('--study-id must be pseudonymous');
  if (options['human-attestation'] !== FINAL_ATTESTATION) fail(`--human-attestation must equal ${FINAL_ATTESTATION}`);
  const canonicalBundle = resolve(USABILITY_BUNDLE_PATH);
  if (resolve(options['bundle-output']) !== canonicalBundle) fail(`--bundle-output must be ${USABILITY_BUNDLE_PATH}`);
  return options;
}
function sameProvenance(left, right) {
  return left?.commitSha === right.commitSha && left?.sourceDigest === right.sourceDigest && left?.sourceScope === right.sourceScope;
}

export async function aggregateUsabilitySessions(options) {
  const directory = resolve(options.sessions);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  if (files.length < 5) fail(`At least five signed session files are required; found ${files.length}`);
  const provenance = await currentProvenance();
  const buildBytes = await readFile('evidence/production-build.json');
  const build = JSON.parse(buildBytes);
  if (!sameProvenance(build.provenance, provenance)) fail('Current production build provenance is stale');
  const coreAssets = Object.fromEntries(CORE_BUILD_ASSETS.map((path) => {
    const descriptor = build.files.find((file) => file.path === path);
    if (!descriptor) fail(`Production manifest lacks ${path}`);
    return [path, descriptor];
  }));
  const publicKeyPem = await readFile(resolve(options['public-key']), 'utf8');
  const context = {
    studyId: options['study-id'], provenance, publicKey: publicKeyPem,
    buildManifestSha256: sha256(buildBytes), buildDigest: build.digest, coreAssets,
  };
  const sessions = [];
  const participants = [];
  const ids = new Set();
  for (const file of files) {
    const session = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
    const participant = verifySignedUsabilitySession(session, context, file);
    if (ids.has(participant.participantId)) fail(`${file}: duplicate participant ID`);
    ids.add(participant.participantId);
    sessions.push(session);
    participants.push(participant);
  }
  const bundle = {
    schemaVersion: 1,
    kind: 'flappy-cloud-human-usability-bundle',
    createdAt: new Date().toISOString(),
    provenance,
    studyId: options['study-id'],
    publicKeyPem,
    publicKeySha256: sha256(Buffer.from(publicKeyPem)),
    sessions,
  };
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`);
  const evidence = {
    schemaVersion: 1,
    isRealEvidence: true,
    provenance,
    studyId: options['study-id'],
    rawEvidence: {
      bundlePath: USABILITY_BUNDLE_PATH,
      bundleSha256: sha256(bundleBytes),
      sessionCount: sessions.length,
      publicKeySha256: bundle.publicKeySha256,
    },
    participants,
  };
  const validation = validateUsabilityEvidence(evidence);
  if (!validation.valid) fail(`Final usability evidence rejected: ${validation.errors.join('; ')}`);
  verifyUsabilityBundle(bundle, evidence, { provenance, buildBytes, build });
  const bundleOutput = resolve(options['bundle-output']);
  const evidenceOutput = resolve(options.output);
  await writeFile(bundleOutput, bundleBytes, { flag: 'wx' });
  try {
    await writeFile(evidenceOutput, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    await rm(bundleOutput, { force: true });
    throw error;
  }
  return {
    output: relative(process.cwd(), evidenceOutput).replaceAll('\\', '/'),
    bundleOutput: relative(process.cwd(), bundleOutput).replaceAll('\\', '/'),
    participantCount: participants.length,
    medianDurationMs: validation.metrics.medianDurationMs,
  };
}

function cliOptions(argv) { return parseArgs(argv); }
async function main() {
  const summary = await aggregateUsabilitySessions(cliOptions(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(`Usability aggregator refused evidence: ${error.message}`); process.exitCode = 1; });
}
