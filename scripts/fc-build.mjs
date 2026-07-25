#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { currentProvenance } from './fc-provenance.mjs';

const MARKER = '.fc-production-build.json';
const MINIFY_TARGETS = Object.freeze([
  ['script.js', 'js', 'iife'],
  ['chatbot.js', 'js', 'iife'],
  ['styles.css', 'css', null],
  ['game/fc-engine.js', 'js', 'esm'],
  ['game/fc-overlay.css', 'css', null],
  ['game/cr-engine.js', 'js', 'esm'],
  ['game/cr-overlay.css', 'css', null],
]);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function run(executable, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolveRun({ stdout: stdout.trim(), stderr: stderr.trim() })
      : reject(new Error(`${executable} exited ${code}\n${stderr.slice(-4000)}`)));
  });
}

async function safelyReset(output) {
  try {
    const marker = JSON.parse(await readFile(resolve(output, MARKER), 'utf8'));
    if (marker.kind !== 'flappy-cloud-production-build') throw new Error('marker kind mismatch');
    await rm(output, { recursive: true, force: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        const entries = await readdir(output);
        if (entries.length > 0) throw new Error(`Refusing to delete unowned non-empty output: ${output}`);
      } catch (directoryError) {
        if (directoryError.code !== 'ENOENT') throw directoryError;
      }
      return;
    }
    throw new Error(`Refusing to reset output without a valid ${MARKER}: ${error.message}`);
  }
}

async function collectFiles(root, directory = root, output = []) {
  for (const name of (await readdir(directory)).sort()) {
    if (name === MARKER) continue;
    const absolute = resolve(directory, name);
    const details = await stat(absolute);
    if (details.isDirectory()) await collectFiles(root, absolute, output);
    else if (details.isFile()) {
      const bytes = await readFile(absolute);
      output.push({
        path: relative(root, absolute).replaceAll('\\', '/'),
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
  return output;
}

export async function buildProduction({ repoRoot = process.cwd(), output = 'build/fc-production', esbuild }) {
  if (!esbuild) throw new Error('An explicit esbuild executable is required');
  const root = resolve(repoRoot);
  const target = resolve(root, output);
  if (target === root || !target.startsWith(`${root}/`)) throw new Error('Build output must be inside the repository and outside its root');
  await safelyReset(target);
  await mkdir(target, { recursive: true });
  for (const source of ['index.html', 'CNAME']) {
    await mkdir(dirname(resolve(target, source)), { recursive: true });
    await cp(resolve(root, source), resolve(target, source));
  }
  await cp(resolve(root, 'assets'), resolve(target, 'assets'), { recursive: true });
  const version = (await run(esbuild, ['--version'], root)).stdout;
  for (const [source, loader, format] of MINIFY_TARGETS) {
    const destination = resolve(target, source);
    await mkdir(dirname(destination), { recursive: true });
    const args = [resolve(root, source), '--minify', '--legal-comments=none', '--target=es2022', `--loader:.${loader}=${loader}`, `--outfile=${destination}`];
    if (format) args.push(`--format=${format}`);
    await run(esbuild, args, root);
  }
  const files = await collectFiles(target);
  const aggregate = createHash('sha256');
  for (const file of files) aggregate.update(`${file.path}\0${file.sha256}\n`);
  const manifest = {
    schemaVersion: 1,
    kind: 'flappy-cloud-production-build',
    createdAt: new Date().toISOString(),
    provenance: await currentProvenance(root),
    command: `${esbuild} (${version}) --minify --legal-comments=none --target=es2022`,
    output: relative(root, target).replaceAll('\\', '/'),
    digest: aggregate.digest('hex'),
    files,
  };
  await writeFile(resolve(target, MARKER), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const manifest = await buildProduction({
    repoRoot: resolve(argument('--root') || process.cwd()),
    output: argument('--output') || 'build/fc-production',
    esbuild: argument('--esbuild'),
  });
  const report = argument('--report');
  if (report) await writeFile(resolve(report), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
