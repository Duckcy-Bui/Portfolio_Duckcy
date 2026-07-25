#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SOURCE_ENTRIES = Object.freeze([
  'index.html',
  'CNAME',
  'assets',
  'script.js',
  'styles.css',
  'chatbot.js',
  'package.json',
  'package-lock.json',
  'vitest.config.js',
  'game',
  'scripts',
  'tests/flappy-cloud-game',
  'tests/cloud-rescue',
  'evidence/tools',
  'evidence/accessibility-evidence.schema.json',
  'evidence/final-evidence-manifest.schema.json',
  'evidence/lifecycle-evidence.schema.json',
  'evidence/performance-evidence.schema.json',
  'evidence/usability-evidence.schema.json',
  'evidence/desktop-profile.json',
  'evidence/mobile-emulation-profile.json',
  'evidence/usability-evidence.template.json',
  'evidence/usability-playtest-runbook.md',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function collectFiles(path, files) {
  const details = await stat(path);
  if (details.isDirectory()) {
    const children = await readdir(path);
    for (const child of children.sort()) await collectFiles(resolve(path, child), files);
    return;
  }
  if (details.isFile()) files.push(path);
}

export async function computeSourceDigest(repoRoot = process.cwd()) {
  const root = resolve(repoRoot);
  const absoluteFiles = [];
  for (const entry of SOURCE_ENTRIES) await collectFiles(resolve(root, entry), absoluteFiles);
  const files = [];
  for (const absolute of absoluteFiles.sort()) {
    const bytes = await readFile(absolute);
    files.push({
      path: relative(root, absolute).replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }
  const aggregate = createHash('sha256');
  for (const file of files) aggregate.update(`${file.path}\0${file.sha256}\n`);
  return { algorithm: 'sha256', scope: 'fc-source-v1', digest: aggregate.digest('hex'), files };
}

export function readCommitSha(repoRoot = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(repoRoot), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not read Git commit SHA: ${result.stderr.trim()}`);
  const commitSha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error(`Invalid Git commit SHA: ${commitSha}`);
  return commitSha;
}

export async function currentProvenance(repoRoot = process.cwd()) {
  const source = await computeSourceDigest(repoRoot);
  return { commitSha: readCommitSha(repoRoot), sourceDigest: source.digest, sourceScope: source.scope };
}

async function main() {
  const rootIndex = process.argv.indexOf('--root');
  const repoRoot = rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd();
  const source = await computeSourceDigest(repoRoot);
  process.stdout.write(`${JSON.stringify({ commitSha: readCommitSha(repoRoot), source }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

export async function sourceCommitStatus(repoRoot = process.cwd()) {
  const root = resolve(repoRoot);
  const source = await computeSourceDigest(root);
  const currentPaths = new Set(source.files.map((file) => file.path));
  const differences = [];
  for (const file of source.files) {
    const currentBlob = spawnSync('git', ['hash-object', '--', file.path], { cwd: root, encoding: 'utf8' });
    const headBlob = spawnSync('git', ['rev-parse', `HEAD:${file.path}`], { cwd: root, encoding: 'utf8' });
    if (currentBlob.status !== 0) differences.push({ path: file.path, reason: 'unreadable-working-tree-file' });
    else if (headBlob.status !== 0) differences.push({ path: file.path, reason: 'not-in-HEAD' });
    else if (currentBlob.stdout.trim() !== headBlob.stdout.trim()) differences.push({ path: file.path, reason: 'differs-from-HEAD' });
  }
  const tracked = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', ...SOURCE_ENTRIES], { cwd: root, encoding: 'utf8' });
  if (tracked.status !== 0) throw new Error(`Could not inspect HEAD source tree: ${tracked.stderr.trim()}`);
  for (const path of tracked.stdout.split(/\r?\n/).filter(Boolean)) {
    if (!currentPaths.has(path)) differences.push({ path, reason: 'deleted-from-working-tree' });
  }
  return { commitSha: readCommitSha(root), sourceDigest: source.digest, matchesHead: differences.length === 0, differences };
}

export async function assertSourceCommitted(repoRoot = process.cwd()) {
  const status = await sourceCommitStatus(repoRoot);
  if (!status.matchesHead) {
    const summary = status.differences.slice(0, 20).map((entry) => `${entry.path} (${entry.reason})`).join(', ');
    const suffix = status.differences.length > 20 ? `, and ${status.differences.length - 20} more` : '';
    throw new Error(`fc-source-v1 is not fully contained in HEAD ${status.commitSha}: ${summary}${suffix}`);
  }
  return status;
}
