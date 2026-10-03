import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

async function collect(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

export default async function globalSetup() {
  const root = resolve('dist');
  const hash = createHash('sha256');
  for (const absolute of await collect(root)) {
    const path = relative(root, absolute).split(sep).join('/');
    const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
    hash.update(`${path}\0${digest}\n`);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/browser-build.json', `${JSON.stringify({
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    target: 'http://127.0.0.1:4321',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    artifactDigest: hash.digest('hex'),
    filteredRun: process.argv.some((argument) => /^--(?:grep|grep-invert|project|shard|last-failed|test-list|only-changed|list)(?:=|$)/.test(argument)
      || /\.(?:spec|test)\.[cm]?[jt]sx?(?::\d+)?$/.test(argument)),
  }, null, 2)}\n`);
}
