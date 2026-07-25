import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import canonical, * as fc from '../../game/fc-engine.js';
import compatibility, * as cr from '../../game/cr-engine.js';
import { ADAPTER_API_NAMES } from './test-helpers.js';

const source = readFileSync(resolve(process.cwd(), 'game/cr-engine.js'), 'utf8');

describe('cr-engine compatibility adapter', () => {
  it('re-exports the exact canonical API identities', () => {
    expect(compatibility).toBe(canonical);
    for (const name of ADAPTER_API_NAMES) expect(cr[name]).toBe(fc[name]);
    expect(cr.stepGame).toBe(fc.stepGame);
    expect(cr.ACHIEVEMENTS).toBe(fc.ACHIEVEMENTS);
  });

  it('contains no independent state, loop, listener, or open implementation', () => {
    expect(source).toBe(`// Compatibility entry for stale bookmarks/imports. The active bootstrap loads\n// fc-engine.js directly; this file intentionally owns no state or browser work.\nexport * from './fc-engine.js';\nexport { default } from './fc-engine.js';\n`);
    expect(source).not.toMatch(/requestAnimationFrame|addEventListener|function\s+open|let\s+active|class\s+/);
  });
});
