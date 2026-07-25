#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
};

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function statusFor(error) {
  if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return 404;
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 403;
  return 500;
}

export function isCompressible(contentType) {
  return /^(?:text\/|application\/(?:javascript|json))/.test(contentType);
}

export function createStaticServer({ root = process.cwd(), host = '127.0.0.1', port = 4173 } = {}) {
  const documentRoot = resolve(root);
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const relativePath = pathname === '/' ? '/index.html' : pathname;
      const filePath = resolve(documentRoot, `.${relativePath}`);
      if (filePath !== documentRoot && !filePath.startsWith(`${documentRoot}${sep}`)) {
        const error = new Error('Path escapes the document root');
        error.code = 'EACCES';
        throw error;
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        const error = new Error('Not a file');
        error.code = 'ENOENT';
        throw error;
      }

      const body = await readFile(filePath);
      const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(request.headers['accept-encoding'] || '');
      const compressed = acceptsGzip && isCompressible(contentType);
      const payload = compressed ? gzipSync(body, { level: 9 }) : body;
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Length': payload.length,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        ...(compressed ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
      });
      response.end(request.method === 'HEAD' ? undefined : payload);
    } catch (error) {
      const status = statusFor(error);
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(status === 500 ? 'Internal Server Error\n' : `${status}\n`);
    }
  });

  return {
    server,
    listen: () => new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolveListen(server.address());
      });
    }),
    close: () => new Promise((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}

async function main() {
  const port = Number(argument('--port', process.env.PORT || '4173'));
  const host = argument('--host', '127.0.0.1');
  const root = resolve(argument('--root', process.cwd()));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535');
  const staticServer = createStaticServer({ root, host, port });
  await staticServer.listen();
  process.stdout.write(`FC static server: http://${host}:${port} (root ${root})\n`);
  const shutdown = async () => {
    await staticServer.close();
    process.exitCode = 0;
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
