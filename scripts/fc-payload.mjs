#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, dirname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PAYLOAD_LIMIT_BYTES = 150000;
export const ACTIVE_ENTRY_RESOURCES = Object.freeze(['game/fc-engine.js', 'game/fc-overlay.css']);
const COMPRESSIBLE = new Set(['.js', '.css', '.json', '.svg']);
const PRECOMPRESSED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2', '.mp3', '.mp4']);

function localReferences(source, extension) {
  const references = [];
  if (extension === '.js') {
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)) references.push(match[1]);
    for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) references.push(match[1]);
  }
  if (extension === '.css') {
    for (const match of source.matchAll(/@import\s+(?:url\()?['"]?([^'"\s)]+)["']?\)?/g)) references.push(match[1]);
    for (const match of source.matchAll(/url\(\s*['"]?([^'"\s)]+)["']?\s*\)/g)) references.push(match[1]);
  }
  return references.filter((reference) => reference.startsWith('.') && !reference.startsWith('data:'));
}

export async function discoverActiveResources(repoRoot = process.cwd()) {
  const queue = ACTIVE_ENTRY_RESOURCES.map((entry) => resolve(repoRoot, entry));
  const discovered = new Set();
  while (queue.length > 0) {
    const absolute = queue.shift();
    if (discovered.has(absolute)) continue;
    if (!existsSync(absolute)) throw new Error(`Active Gameplay_Resource is missing: ${relative(repoRoot, absolute)}`);
    discovered.add(absolute);
    const extension = extname(absolute).toLowerCase();
    if (!COMPRESSIBLE.has(extension)) continue;
    const source = await readFile(absolute, 'utf8');
    for (const reference of localReferences(source, extension)) {
      const target = resolve(dirname(absolute), reference.split(/[?#]/, 1)[0]);
      if (!discovered.has(target)) queue.push(target);
    }
  }
  return [...discovered].sort();
}

export function deterministicCompressedSize(buffer, extension) {
  if (COMPRESSIBLE.has(extension.toLowerCase())) return gzipSync(buffer, { level: 9, mtime: 0 }).byteLength;
  if (PRECOMPRESSED.has(extension.toLowerCase())) return buffer.byteLength;
  return gzipSync(buffer, { level: 9, mtime: 0 }).byteLength;
}

export async function buildPayloadLedger(repoRoot = process.cwd()) {
  const resources = await discoverActiveResources(repoRoot);
  const entries = [];
  for (const absolute of resources) {
    const path = relative(repoRoot, absolute).replaceAll('\\', '/');
    const buffer = await readFile(absolute);
    const source = COMPRESSIBLE.has(extname(absolute).toLowerCase()) ? buffer.toString('utf8') : '';
    if (/\.map(?:$|[?#])/.test(path)) throw new Error(`Source map must not deploy: ${path}`);
    if (/\b(?:phaser|three)(?:\.min)?\.js\b/i.test(source)) throw new Error(`Forbidden runtime detected in ${path}`);
    if (/https?:\/\//i.test(source)) throw new Error(`Remote asset/CDN reference detected in ${path}`);
    if (/(?:^|\/)cr-(?:engine\.js|overlay\.css)(?:$|[?#])/.test(path)) throw new Error(`Legacy adapter is active: ${path}`);
    entries.push({
      url: path,
      rawBytes: buffer.byteLength,
      encodedBytes: deterministicCompressedSize(buffer, extname(absolute)),
      measurement: COMPRESSIBLE.has(extname(absolute).toLowerCase()) ? 'gzip-9-n-equivalent' : 'raw-precompressed',
    });
  }
  const unique = [...new Map(entries.map((entry) => [entry.url, entry])).values()];
  const totalEncodedBytes = unique.reduce((total, entry) => total + entry.encodedBytes, 0);
  return {
    schemaVersion: 1,
    limitBytes: PAYLOAD_LIMIT_BYTES,
    totalEncodedBytes,
    passed: totalEncodedBytes <= PAYLOAD_LIMIT_BYTES,
    resources: unique,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const repoRoot = resolve(argument('--root') || process.cwd());
  const report = await buildPayloadLedger(repoRoot);
  const output = argument('--output');
  if (output) await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
