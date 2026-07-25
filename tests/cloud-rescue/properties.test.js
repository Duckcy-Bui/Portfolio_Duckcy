import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'game/cr-overlay.css'), 'utf8');

describe('cr-overlay compatibility adapter', () => {
  it('delegates once to canonical CSS and owns no selectors, rules, or keyframes', () => {
    expect(css).toBe('@import url("./fc-overlay.css");\n');
    expect(css.match(/@import/g)).toHaveLength(1);
    expect(css).not.toContain('{');
    expect(css).not.toMatch(/@keyframes|#cloud-rescue-root|\.cr-/);
  });
});
