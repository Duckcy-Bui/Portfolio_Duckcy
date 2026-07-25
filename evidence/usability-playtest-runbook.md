# Flappy Cloud human usability evidence runbook

This checkpoint requires **five real people who did not develop this feature**. AI agents, browser bots, deterministic controllers, scripted input, and synthetic fixtures are not participants and must never be marked as real evidence.

The recorder in `evidence/tools/fc-usability-record.mjs` is observation-only: it launches headed Chrome, verifies the served production bytes, records DOM phase changes and trusted input counts, and rejects any CDP `Input.*` call. It cannot prove a person's identity, so a facilitator must be physically present and complete interactive begin/end attestations. Record no names, email addresses, phone numbers, or other PII.

## 1. Prepare one study and signing key

Use one pseudonymous study ID and one Ed25519 key for all five sessions. Keep the private key outside the repository:

```sh
mkdir -p evidence/usability-sessions
umask 077
openssl genpkey -algorithm Ed25519 -out /tmp/fc-usability-ed25519.pem
openssl pkey -in /tmp/fc-usability-ed25519.pem -pubout \
  -out evidence/usability-facilitator-public.pem
```

Serve the already measured production build:

```sh
node scripts/fc-serve.mjs \
  --root build/fc-production \
  --host 127.0.0.1 \
  --port 4173
```

Do not rebuild or edit source between sessions. The recorder rejects stale provenance and any served `index.html`, `script.js`, `styles.css`, `game/fc-engine.js`, or `game/fc-overlay.css` that differs from `evidence/production-build.json`.

## 2. Record each real participant

Assign IDs such as `P-01` through `P-05`; do not map them to personal information in the repository. Run this command in a real interactive terminal, changing the participant and output each time:

```sh
node evidence/tools/fc-usability-record.mjs \
  --url http://127.0.0.1:4173/ \
  --chromium /home/duckcy/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
  --participant P-01 \
  --study-id FC20260725 \
  --output evidence/usability-sessions/P-01.json \
  --signing-key /tmp/fc-usability-ed25519.pem \
  --human-attestation I_OBSERVED_A_REAL_NON_DEVELOPER \
  --no-sandbox
```

Only use `--no-sandbox` with the controlled localhost build when the host's packaged/cached Chrome cannot start its sandbox. The recorder requires a TTY and asks the facilitator to type `BEGIN P-01` before the run and `COMPLETE P-01` after observing the win.

For each participant:
1. Confirm they are a real person and did not develop the feature.
2. Give them the keyboard/mouse; do not coach the flight path or provide automated input.
3. They activate **Play Game**, then **Start**, and reach **Production Saved!**.
4. At most one crash/retry is allowed.
5. The browser must remain headed, visible, and focused from Start through WON.

The signed raw session stores pseudonymous IDs, monotonic Start/WON timestamps, duration, retry count, aggregate trusted-event counts, phase transitions, build hashes, browser identity, and facilitator attestations. It intentionally stores no key values, pointer coordinates, speech, screenshots, or PII.

## 3. Aggregate and validate

After five independently observed sessions, run:

```sh
node evidence/tools/fc-usability-aggregate.mjs \
  --sessions evidence/usability-sessions \
  --study-id FC20260725 \
  --public-key evidence/usability-facilitator-public.pem \
  --bundle-output evidence/usability-raw-bundle.json \
  --output evidence/usability-evidence.json \
  --human-attestation I_ATTEST_FIVE_REAL_NON_DEVELOPER_PARTICIPANTS

node scripts/fc-evidence.mjs \
  --type usability \
  --input evidence/usability-evidence.json
```

The aggregator fails closed unless every raw session:
- has a valid Ed25519 signature and current `fc-source-v1` provenance;
- used the exact current production build and headed non-Headless Chrome;
- contains interactive facilitator attestations for a real non-developer;
- records READY → PLAYING → WON, trusted input, foreground/focus, and zero CDP input calls;
- completed with zero or one retry;
- has exact `durationMs = wonTimestampMs - startTimestampMs`.

The aggregator writes `evidence/usability-raw-bundle.json`, containing the signed pseudonymous sessions and facilitator public key, then binds its SHA-256 into the aggregate. The finalizer retains the bundle as a supporting artifact and independently re-verifies every signature, build hash, participant derivation, and bundle hash.

The final validator additionally requires at least five unique participants and a median Start→WON duration from 30 to 60 seconds. Do not edit signed raw sessions or the raw bundle. If any run fails, recruit/record a new real participant under a new pseudonymous ID rather than changing data.

## 4. Finalize

Only after the usability validator passes:

```sh
node scripts/fc-finalize.mjs --build --output evidence/final-manifest.json
node scripts/fc-finalize.mjs --verify --input evidence/final-manifest.json
```

The finalizer also rejects stale source provenance, missing technical/accessibility artifacts, or changed hashes.
