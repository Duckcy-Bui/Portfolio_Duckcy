import { createHash, verify } from 'node:crypto';

export const USABILITY_BUNDLE_PATH = 'evidence/usability-raw-bundle.json';
export const CORE_BUILD_ASSETS = Object.freeze([
  'index.html', 'script.js', 'styles.css', 'game/fc-engine.js', 'game/fc-overlay.css',
]);

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fail(message) { throw new Error(message); }
function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function sameProvenance(left, right) {
  return left?.commitSha === right?.commitSha
    && left?.sourceDigest === right?.sourceDigest
    && left?.sourceScope === right?.sourceScope;
}

export function verifySignedUsabilitySession(session, context, label = 'session') {
  const prefix = `${label}:`;
  const expectedKeys = ['schemaVersion', 'kind', 'studyId', 'participantId', 'capturedAt', 'provenance', 'attestation', 'browser', 'testedUrl', 'productionBuild', 'observation', 'integrity'];
  if (!exactKeys(session, expectedKeys)) fail(`${prefix} session keys are not canonical`);
  if (session.schemaVersion !== 1 || session.kind !== 'flappy-cloud-human-usability-session') fail(`${prefix} invalid session kind/schema`);
  if (session.studyId !== context.studyId) fail(`${prefix} study ID mismatch`);
  if (!/^P-[A-Za-z0-9_-]{2,32}$/.test(session.participantId || '')) fail(`${prefix} invalid pseudonymous participant ID`);
  if (!Number.isFinite(Date.parse(session.capturedAt || ''))) fail(`${prefix} capturedAt is invalid`);
  if (!sameProvenance(session.provenance, context.provenance)) fail(`${prefix} stale source provenance`);
  if (!exactKeys(session.attestation, ['realHuman', 'nonDeveloper', 'facilitatorPresent', 'interactiveBeginAndComplete'])
    || session.attestation.realHuman !== true || session.attestation.nonDeveloper !== true
    || session.attestation.facilitatorPresent !== true || session.attestation.interactiveBeginAndComplete !== true) {
    fail(`${prefix} human/non-developer facilitator attestation missing`);
  }
  if (session.browser?.mode !== 'headed-foreground' || /Headless/i.test(`${session.browser?.product} ${session.browser?.userAgent}`)) {
    fail(`${prefix} browser was not headed foreground Chrome`);
  }
  if (session.productionBuild?.manifestSha256 !== context.buildManifestSha256
    || session.productionBuild?.digest !== context.buildDigest) fail(`${prefix} production build mismatch`);
  for (const [path, expected] of Object.entries(context.coreAssets)) {
    const observed = session.productionBuild?.servedAssets?.[path];
    if (observed?.sha256 !== expected.sha256 || observed?.bytes !== expected.bytes) fail(`${prefix} served asset mismatch for ${path}`);
  }
  const observation = session.observation;
  if (!Number.isFinite(observation?.startTimestampMs) || !Number.isFinite(observation?.wonTimestampMs)
    || observation.wonTimestampMs <= observation.startTimestampMs) fail(`${prefix} invalid Start/WON timestamps`);
  if (Math.abs(observation.durationMs - (observation.wonTimestampMs - observation.startTimestampMs)) > 1) fail(`${prefix} duration does not equal WON - Start`);
  if (!Number.isInteger(observation.retries) || observation.retries < 0 || observation.retries > 1) fail(`${prefix} retries must be 0 or 1`);
  if (observation.trustedInputCount < 2 || observation.trustedGameplayInputCount < 1) fail(`${prefix} insufficient trusted participant input`);
  if (!Number.isFinite(observation.startTrustedInputAgeMs) || observation.startTrustedInputAgeMs < -100
    || observation.startTrustedInputAgeMs > 2_000) fail(`${prefix} Start lacks a recent trusted input`);
  if (observation.attentionViolationCount !== 0 || observation.startForeground !== true
    || observation.wonForeground !== true) fail(`${prefix} run was not continuously foreground/focused`);
  if (observation.inputProtocolCallCount !== 0 || !Array.isArray(observation.protocolMethods)
    || observation.protocolMethods.some((method) => /^Input\./.test(method))) fail(`${prefix} automation input protocol use detected`);
  const phaseOrder = (observation.transitions || []).map((transition) => transition.phase);
  const playing = phaseOrder.indexOf('PLAYING');
  const won = phaseOrder.indexOf('WON', playing + 1);
  if (playing < 0 || won < 0 || !phaseOrder.slice(0, playing).includes('READY')) fail(`${prefix} READY → PLAYING → WON was not observed`);
  const { integrity, ...payload } = session;
  const payloadBytes = Buffer.from(canonicalJson(payload));
  if (!exactKeys(integrity, ['algorithm', 'payloadSha256', 'signatureBase64'])
    || integrity.algorithm !== 'sha256+Ed25519' || integrity.payloadSha256 !== sha256(payloadBytes)) {
    fail(`${prefix} payload checksum mismatch`);
  }
  if (!verify(null, payloadBytes, context.publicKey, Buffer.from(integrity.signatureBase64 || '', 'base64'))) {
    fail(`${prefix} Ed25519 signature is invalid`);
  }
  return {
    participantId: session.participantId,
    isDeveloper: false,
    startTimestampMs: observation.startTimestampMs,
    wonTimestampMs: observation.wonTimestampMs,
    durationMs: observation.durationMs,
    retries: observation.retries,
    completed: true,
  };
}

export function verifyUsabilityBundle(bundle, evidence, { provenance, buildBytes, build }) {
  if (!exactKeys(bundle, ['schemaVersion', 'kind', 'createdAt', 'provenance', 'studyId', 'publicKeyPem', 'publicKeySha256', 'sessions'])) {
    fail('Usability bundle keys are not canonical');
  }
  if (bundle.schemaVersion !== 1 || bundle.kind !== 'flappy-cloud-human-usability-bundle') fail('Usability bundle kind/schema is invalid');
  if (!Number.isFinite(Date.parse(bundle.createdAt || ''))) fail('Usability bundle createdAt is invalid');
  if (!sameProvenance(bundle.provenance, provenance) || !sameProvenance(evidence?.provenance, provenance)) fail('Usability bundle/evidence provenance mismatch');
  if (bundle.studyId !== evidence?.studyId) fail('Usability bundle study ID mismatch');
  if (typeof bundle.publicKeyPem !== 'string' || !bundle.publicKeyPem.includes('BEGIN PUBLIC KEY')) fail('Usability bundle public key is invalid');
  const publicKeySha256 = sha256(Buffer.from(bundle.publicKeyPem));
  if (bundle.publicKeySha256 !== publicKeySha256 || evidence?.rawEvidence?.publicKeySha256 !== publicKeySha256) {
    fail('Usability bundle public key hash mismatch');
  }
  if (!Array.isArray(bundle.sessions) || bundle.sessions.length < 5
    || evidence?.rawEvidence?.sessionCount !== bundle.sessions.length) fail('Usability bundle requires the declared five or more sessions');
  const coreAssets = Object.fromEntries(CORE_BUILD_ASSETS.map((path) => {
    const descriptor = build.files.find((file) => file.path === path);
    if (!descriptor) fail(`Production manifest lacks ${path}`);
    return [path, descriptor];
  }));
  const context = {
    studyId: bundle.studyId,
    provenance,
    publicKey: bundle.publicKeyPem,
    buildManifestSha256: sha256(buildBytes),
    buildDigest: build.digest,
    coreAssets,
  };
  const participants = [];
  const ids = new Set();
  for (const [index, session] of bundle.sessions.entries()) {
    const participant = verifySignedUsabilitySession(session, context, `sessions[${index}]`);
    if (ids.has(participant.participantId)) fail(`sessions[${index}]: duplicate participant ID`);
    ids.add(participant.participantId);
    participants.push(participant);
  }
  if (JSON.stringify(participants) !== JSON.stringify(evidence.participants)) fail('Usability aggregate participants do not exactly derive from signed bundle sessions');
  return { participantCount: participants.length, publicKeySha256 };
}
