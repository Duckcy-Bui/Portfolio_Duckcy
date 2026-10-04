#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

export const SITE_ORIGIN = 'https://duckcy.me';
export const REQUIRED_ROUTES = Object.freeze([
  '/', '/about/', '/skills/', '/projects/', '/projects/sblt-cup/',
  '/projects/classes369/', '/projects/investor-ai/', '/experience/',
  '/certificate/', '/contact/',
]);

async function walk(directory, output = []) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, item.name);
    if (item.isDirectory()) await walk(file, output);
    else if (item.isFile()) output.push(file);
  }
  return output.sort();
}

export async function artifactManifest(directory) {
  const root = resolve(directory);
  const files = [];
  const aggregate = createHash('sha256');
  for (const absolute of await walk(root)) {
    const bytes = await readFile(absolute);
    const file = {
      path: relative(root, absolute).split(sep).join('/'),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    files.push(file);
    aggregate.update(`${file.path}\0${file.sha256}\n`);
  }
  return { algorithm: 'sha256', digest: aggregate.digest('hex'), files };
}

export async function verifySite({ directory = 'dist', output = 'artifacts/site-verification.json' } = {}) {
  const root = resolve(directory);
  const failures = [];
  const pages = new Map();
  const fail = (page, message) => failures.push({ page, message });
  let artifact = null;
  try {
    artifact = await artifactManifest(root);
  } catch (error) {
    fail('build', `Cannot read generated site: ${error.message}`);
  }
  if (artifact) {
    const files = new Set(artifact.files.map((file) => file.path));
    for (const route of REQUIRED_ROUTES) {
      const expected = route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
      if (!files.has(expected)) fail(route, `Missing generated ${expected}`);
    }
    for (const required of ['404.html', 'CNAME', 'robots.txt', 'sitemap-index.xml']) {
      if (!files.has(required)) fail('build', `Missing ${required}`);
    }
    if (files.has('CNAME') && (await readFile(resolve(root, 'CNAME'), 'utf8')).trim() !== 'duckcy.me') {
      fail('CNAME', 'Custom domain must be duckcy.me');
    }
    for (const entry of artifact.files.filter((file) => file.path.endsWith('.html'))) {
      const route = entry.path === 'index.html' ? '/' : entry.path.endsWith('/index.html')
        ? `/${entry.path.slice(0, -'index.html'.length)}` : `/${entry.path}`;
      const source = await readFile(resolve(root, entry.path), 'utf8');
      const document = new JSDOM(source, { url: `${SITE_ORIGIN}${route}` }).window.document;
      pages.set(route, { document, file: entry.path });
      if (!document.documentElement.lang) fail(route, 'Document needs lang');
      if (document.querySelectorAll('h1').length !== 1) fail(route, 'Page needs exactly one h1');
      if (!document.title.trim()) fail(route, 'Page needs a title');
      if (!document.querySelector('meta[name="description"]')?.content.trim()) fail(route, 'Page needs meta description');
      if (!document.querySelector('meta[name="viewport"]')) fail(route, 'Page needs viewport metadata');
      if (!document.querySelector('main')) fail(route, 'Page needs a main landmark');
      const ids = new Set();
      document.querySelectorAll('[id]').forEach((node) => {
        if (ids.has(node.id)) fail(route, `Duplicate id ${node.id}`);
        ids.add(node.id);
      });
      document.querySelectorAll('img').forEach((image) => {
        if (!image.hasAttribute('alt')) fail(route, 'Image needs alt attribute');
        if (!image.hasAttribute('width') || !image.hasAttribute('height')) fail(route, `Image needs dimensions: ${image.getAttribute('src')}`);
      });
      if (route !== '/404.html') {
        const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
        if (canonical !== `${SITE_ORIGIN}${route}`) fail(route, `Canonical must be ${SITE_ORIGIN}${route}`);
        if (!document.querySelector('meta[property="og:title"]')?.content) fail(route, 'Missing Open Graph title');
        if (!document.querySelector('meta[property="og:description"]')?.content) fail(route, 'Missing Open Graph description');
        if (!document.querySelector('meta[property="og:url"]')?.content) fail(route, 'Missing Open Graph URL');
      }
      if (/Duck-SFIT-CNTT2-K64/i.test(source)) fail(route, 'Published page contains the old GitHub username');
    }

    const checkReference = async (route, reference, kind) => {
      if (!reference || /^(?:data:|blob:|mailto:|tel:|javascript:)/i.test(reference)) return;
      let url;
      try { url = new URL(reference, `${SITE_ORIGIN}${route}`); }
      catch { fail(route, `Invalid ${kind}: ${reference}`); return; }
      if (url.origin !== SITE_ORIGIN) return;
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { fail(route, `Invalid escaped path: ${reference}`); return; }
      if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
      else if (!files.has(pathname.slice(1)) && files.has(`${pathname.slice(1)}/index.html`)) pathname += '/index.html';
      const file = pathname.slice(1);
      if (!files.has(file)) { fail(route, `Broken ${kind}: ${reference}`); return; }
      if (kind === 'link' && url.hash) {
        const targetRoute = pathname === '/index.html' ? '/' : pathname.endsWith('/index.html')
          ? pathname.slice(0, -'index.html'.length) : pathname;
        const target = pages.get(targetRoute)?.document;
        const fragment = decodeURIComponent(url.hash.slice(1));
        if (fragment && target && !target.getElementById(fragment)) fail(route, `Missing anchor: ${reference}`);
      }
    };
    for (const [route, { document }] of pages) {
      for (const element of document.querySelectorAll('a[href], link[href], script[src], img[src], source[src], video[poster], iframe[src]')) {
        const attribute = element.hasAttribute('href') ? 'href' : element.hasAttribute('src') ? 'src' : 'poster';
        await checkReference(route, element.getAttribute(attribute), element.tagName === 'A' ? 'link' : 'asset');
      }
      for (const element of document.querySelectorAll('img[srcset], source[srcset]')) {
        for (const source of (element.getAttribute('srcset') || '').split(',')) {
          await checkReference(route, source.trim().split(/\s+/)[0], 'responsive image');
        }
      }
    }
    for (const entry of artifact.files.filter((file) => file.path.endsWith('.css'))) {
      const source = await readFile(resolve(root, entry.path), 'utf8');
      for (const match of source.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) {
        await checkReference(`/${entry.path}`, match[1], 'CSS asset');
      }
    }
    for (const route of REQUIRED_ROUTES) {
      const page = pages.get(route)?.document;
      if (!page) continue;
      const active = page.querySelectorAll('[data-nav] [aria-current="page"]');
      if (active.length !== 1) fail(route, 'Navigation needs exactly one active page');
    }
    const sitemapEntries = artifact.files.filter((file) => /^sitemap.*\.xml$/.test(file.path));
    const sitemapText = (await Promise.all(sitemapEntries.map((file) => readFile(resolve(root, file.path), 'utf8')))).join('\n');
    for (const route of REQUIRED_ROUTES) {
      if (!sitemapText.includes(`<loc>${SITE_ORIGIN}${route}</loc>`)) fail(route, 'Route missing from sitemap');
    }
    if (files.has('robots.txt') && !(await readFile(resolve(root, 'robots.txt'), 'utf8')).includes(`${SITE_ORIGIN}/sitemap-index.xml`)) {
      fail('robots.txt', 'robots.txt must point to the production sitemap');
    }
  }
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    target: relative(process.cwd(), root) || '.',
    site: SITE_ORIGIN,
    passed: failures.length === 0,
    pageCount: pages.size,
    requiredRoutes: REQUIRED_ROUTES,
    failures,
    artifact,
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Static verification: ${report.passed ? 'PASS' : 'FAIL'} (${pages.size} HTML pages, ${failures.length} issues)`);
  for (const failure of failures) console.error(`${failure.page}: ${failure.message}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await verifySite();
  if (!report.passed) process.exitCode = 1;
}
