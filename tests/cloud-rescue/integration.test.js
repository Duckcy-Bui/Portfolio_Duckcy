import { describe, expect, it } from 'vitest';
import * as canonical from '../../game/fc-engine.js';
import * as compatibility from '../../game/cr-engine.js';

describe('stale JavaScript entry interoperability', () => {
  it('shares one lifecycle rather than mounting a second runtime', () => {
    expect(canonical.isOpen()).toBe(false);
    const first = compatibility.open();
    const second = canonical.open();
    expect(second).toBe(first);
    expect(canonical.isOpen()).toBe(true);
    expect(compatibility.isOpen()).toBe(true);
    expect(canonical.close('adapter-test')).toBe(true);
    expect(compatibility.isOpen()).toBe(false);
  });
});
