import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS } from '../../game/fc-engine.js';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const testFiles = readdirSync(resolve(process.cwd(), 'tests'), { recursive: true })
  .map(String)
  .filter((path) => path.endsWith('.test.js'));

describe('Flappy Cloud final integration smoke contracts', () => {
  it('imports the canonical engine without globals, Canvas, rAF, listeners, or DOM game nodes', async () => {
    const objectPrototypeKeys = Reflect.ownKeys(Object.prototype);
    const arrayPrototypeKeys = Reflect.ownKeys(Array.prototype);
    const createElement = vi.spyOn(document, 'createElement');
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const windowKeys = Reflect.ownKeys(window);
    const documentKeys = Reflect.ownKeys(document);

    vi.resetModules();
    const engine = await import('../../game/fc-engine.js');
    expect(typeof engine.open).toBe('function');
    expect(typeof engine.renderCanvas).toBe('function');
    expect(Reflect.ownKeys(window)).toEqual(windowKeys);
    expect(Reflect.ownKeys(document)).toEqual(documentKeys);
    expect(Reflect.ownKeys(Object.prototype)).toEqual(objectPrototypeKeys);
    expect(Reflect.ownKeys(Array.prototype)).toEqual(arrayPrototypeKeys);
    expect(createElement).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(windowAdd).not.toHaveBeenCalled();
    expect(documentAdd).not.toHaveBeenCalled();
    expect(document.querySelector('[data-flappy-cloud-game]')).toBeNull();
  });

  it('contains exactly one real fast-check property P01–P38 with numRuns 150 for every property', () => {
    const source = read('tests/flappy-cloud-game/properties.test.js');
    const labels = [...source.matchAll(/Property P(\d{2}):/g)].map((match) => match[1]);
    const expected = Array.from({ length: 38 }, (_, index) => String(index + 1).padStart(2, '0'));
    expect(labels).toEqual(expected);
    expect(new Set(labels).size).toBe(38);
    expect((source.match(/fc\.assert\(fc\.property\(/g) || [])).toHaveLength(38);
    expect((source.match(/\{ numRuns: 150 \}/g) || [])).toHaveLength(38);
    expect(source).not.toMatch(/Property P\d{2}:.*(?:TODO|placeholder)/i);
  });

  it('has exactly one CTA/root in correct order and preserves the primary CV link contract', () => {
    const html = read('index.html');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const ctas = parsed.querySelectorAll('.cr-cta');
    const roots = parsed.querySelectorAll('#cloud-rescue-root');
    expect(ctas).toHaveLength(1);
    expect(roots).toHaveLength(1);
    const cta = ctas[0];
    const cv = cta.previousElementSibling;
    expect(cv?.matches('a.btn.primary')).toBe(true);
    expect(cv?.getAttribute('href')).toBe('assets/CV_bui_hai_duc.pdf?v=20260709-opt1');
    expect(cv?.getAttribute('target')).toBe('_blank');
    expect(cv?.getAttribute('rel')).toBe('noreferrer');
    expect(cta.getAttribute('aria-haspopup')).toBe('dialog');
    expect(cta.getAttribute('aria-controls')).toBe('cloud-rescue-root');
    expect(html).not.toMatch(/<(?:link|script)[^>]+fc-(?:engine|overlay)/i);
  });

  it('uses the canonical activation-only loader with deadline, generation, critical UI and no active cr resource', () => {
    const script = read('script.js');
    const tail = script.slice(script.indexOf('// FLAPPY CLOUD'));
    expect(tail).toContain('const LOAD_TIMEOUT_MS = 10000');
    expect(tail).toContain('performance.now()');
    expect(tail).toContain('const token = ++generation');
    expect(tail).toContain('token !== generation');
    expect(tail).toContain('capabilitySupported()');
    expect(tail.indexOf('capabilitySupported()')).toBeLessThan(tail.indexOf('beginAttempt()'));
    expect(tail).toContain('import(MODULE_PATH)');
    expect(tail).toContain('./game/fc-engine.js');
    expect(tail).toContain('./game/fc-overlay.css');
    expect(tail).toContain('data-fc-loading-critical');
    expect(tail).toContain('transition: opacity 240ms');
    expect(tail).toContain('@media (prefers-reduced-motion: reduce)');
    expect(tail).toContain('min-width: 44px; min-height: 44px');
    expect(tail).toContain('Close Deploy Before Dawn: Cloud Rescue');
    expect(tail).not.toMatch(/\.\/game\/cr-(?:engine\.js|overlay\.css)/);
    expect((tail.match(/cta\.addEventListener\("click", activate\)/g) || [])).toHaveLength(1);
    expect(tail).not.toMatch(/cta\.addEventListener\(["']keydown/);
  });

  it('keeps every game CSS selector root-scoped and includes all responsive/motion contracts', () => {
    const css = read('game/fc-overlay.css');
    const selectorLines = css.split('\n').map((line) => line.trim())
      .filter((line) => line.endsWith('{') && !line.startsWith('@') && !/^(?:from|to|\d+%)\s*\{/.test(line));
    expect(selectorLines.length).toBeGreaterThan(25);
    for (const line of selectorLines) expect(line).toMatch(/^#cloud-rescue-root\b/);
    expect(css).toContain('position: fixed');
    expect(css).toContain('transition: opacity 240ms');
    expect(css).toContain('transition-duration: 0ms !important');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('min-height: 44px');
    for (const breakpoint of ['479px', '767px', '768px', '1199px', '1200px', '500px']) expect(css).toContain(breakpoint);
    expect(css).toContain('(prefers-reduced-motion: reduce)');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('"Urbanist"');
    expect(css).toContain('"Space Grotesk"');
    expect(css).not.toMatch(/(?:^|\n)\s*(?:html|body|\.portfolio|\.hero)(?:\s|\{|,)/);
  });

  it('keeps cr entries as adapter-only delegates and the active suite free of retired gameplay law', () => {
    const jsAdapter = read('game/cr-engine.js');
    const cssAdapter = read('game/cr-overlay.css');
    expect(jsAdapter).toContain("export * from './fc-engine.js'");
    expect(jsAdapter).toContain("export { default } from './fc-engine.js'");
    expect(jsAdapter).not.toMatch(/requestAnimationFrame|addEventListener|function\s+open|let\s+active/);
    expect(cssAdapter).toBe('@import url("./fc-overlay.css");\n');
    const activeSources = [
      read('game/fc-engine.js'),
      ...testFiles.filter((path) => !path.endsWith('smoke.test.js')).map((path) => read(`tests/${path}`)),
    ].join('\n');
    expect(activeSources).not.toMatch(/laneSelect|laneMove|LEVEL_CONFIGS|DEFAULT_LEVEL_SECONDS|data-status-stability/);
  });

  it('contains canonical facts byte-for-byte in engine output and no skipped/focused/placeholder tests', () => {
    const engine = read('game/fc-engine.js');
    for (const achievement of ACHIEVEMENTS) {
      expect(engine).toContain(achievement.title);
      expect(engine).toContain(achievement.funFact);
    }
    const sources = testFiles
      .filter((path) => !path.endsWith('smoke.test.js'))
      .map((path) => read(`tests/${path}`)).join('\n');
    expect(sources).not.toMatch(/\b(?:it|test|describe)\.(?:skip|only|todo)\b/);
    expect(sources).not.toMatch(/\b(?:xit|xtest|xdescribe)\s*\(/);
    expect(engine).not.toMatch(/not implemented|throw new Error\(['"]TODO|\bplaceholder\b/i);
  });

  it('keeps the game import graph dependency-free while separating Astro site and historical evidence builds', () => {
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts.build).toContain('astro build');
    expect(packageJson.scripts.build).not.toContain('fc-build.mjs');
    expect(packageJson.scripts['build:production']).toContain('scripts/fc-build.mjs');
    expect(packageJson.scripts['build:production']).toContain('evidence/production-build.json');
    for (const tool of ['fast-check', 'jsdom', 'vitest']) expect(packageJson.devDependencies[tool]).toBeTruthy();

    // Site/build tooling may use packages. The engine and compatibility entry
    // must still ship a self-contained browser graph without package or CDN imports.
    const gameRoot = resolve(process.cwd(), 'game');
    const pending = [resolve(gameRoot, 'fc-engine.js'), resolve(gameRoot, 'cr-engine.js')];
    const visited = new Set();
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      expect(file.startsWith(`${gameRoot}${sep}`)).toBe(true);
      const source = readFileSync(file, 'utf8');
      const staticImports = [
        ...source.matchAll(/^\s*import\s+(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/gm),
        ...source.matchAll(/^\s*export\s+(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/gm),
      ];
      const dynamicImports = [...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)];
      expect((source.match(/\bimport\s*\(/g) || []).length).toBe(dynamicImports.length);
      for (const [, specifier] of [...staticImports, ...dynamicImports]) {
        expect(specifier).toMatch(/^\.\.?\//);
        pending.push(resolve(dirname(file), specifier));
      }
      expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
    }
    expect(visited).toContain(resolve(gameRoot, 'fc-engine.js'));
    expect(visited).toContain(resolve(gameRoot, 'cr-engine.js'));

    const performance = read('scripts/fc-performance.mjs');
    const lighthouse = read('scripts/fc-lighthouse.mjs');
    const payload = read('scripts/fc-payload.mjs');
    const evidence = read('scripts/fc-evidence.mjs');
    expect(performance).toContain('const RUN_COUNT = 3');
    expect(performance).toContain('const WARMUP_PLAYING_MS = 5000');
    expect(performance).toContain('const SAMPLE_PLAYING_MS = 30000');
    expect(performance).toContain('encodedBodySize');
    expect(lighthouse).toContain('const RUN_COUNT = 5');
    expect(lighthouse).toContain('width: 360, height: 800');
    expect(lighthouse).toContain('cpuSlowdownMultiplier: 4');
    expect(payload).toContain('PAYLOAD_LIMIT_BYTES = 150000');
    expect(evidence).toContain('validateUsabilityEvidence');
    expect(evidence).toContain('validateAccessibilityEvidence');
  });
});
