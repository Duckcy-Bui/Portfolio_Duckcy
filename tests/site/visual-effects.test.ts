import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initVisualEffects } from '../../src/scripts/visual-effects';

let cleanup: (() => void) | undefined;
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    get matches() { return query.includes('reduced-motion') && reduced; }, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.documentElement.dataset.theme = 'dark';
  document.body.innerHTML = '<canvas id="starfield"></canvas><section class="section hero"><pre data-animate-lines>name: "Duc"\n  - Docker\n</pre><button class="btn">Action</button></section><div class="scroll-progress-vertical"></div><button id="back-to-top">Top</button><dialog></dialog>';
  const canvas = document.querySelector('canvas')!;
  const context = canvas.getContext('2d')!;
  Object.assign(context, { ellipse: vi.fn(), createLinearGradient: () => ({ addColorStop: vi.fn() }), createRadialGradient: () => ({ addColorStop: vi.fn() }) });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); document.body.innerHTML = ''; });

const frames = () => (window as unknown as { __fcTestFrames: Map<number, FrameRequestCallback> }).__fcTestFrames;
const drawOne = () => { const [id, callback] = [...frames()][0]; frames().delete(id); callback(100); };

describe('original animated backdrop lifecycle', () => {
  it('draws each original scene and replaces the loop rather than adding another', () => {
    cleanup = initVisualEffects();
    const canvas = document.querySelector('canvas')!;
    for (const theme of ['dark', 'light', 'forest', 'ocean', 'sunset']) {
      document.documentElement.dataset.theme = theme;
      document.dispatchEvent(new Event('portfolio:themechange'));
      expect(canvas.dataset.scene).toBe(theme);
      expect(canvas.dataset.animationState).toBe('running');
      expect(frames().size).toBe(1);
      expect(() => drawOne()).not.toThrow();
      expect(frames().size).toBe(1);
    }
    cleanup();
    expect(frames().size).toBe(0);
  });

  it('renders a still scene under reduced motion without continuously scheduling frames', () => {
    reduced = true;
    cleanup = initVisualEffects();
    const canvas = document.querySelector('canvas')!;
    expect(canvas.dataset.animationState).toBe('reduced');
    expect(frames().size).toBe(0);
    document.documentElement.dataset.theme = 'ocean';
    document.dispatchEvent(new Event('portfolio:themechange'));
    expect(canvas.dataset.scene).toBe('ocean');
    expect(frames().size).toBe(0);
    document.querySelector<HTMLElement>('.btn')!.click();
    expect(document.querySelector('.ripple')).toBeNull();
  });

  it('pauses for the game and resumes once it closes', async () => {
    cleanup = initVisualEffects();
    document.body.classList.add('cr-game-open');
    await Promise.resolve();
    expect(document.querySelector('canvas')!.dataset.animationState).toBe('paused');
    expect(frames().size).toBe(0);
    document.body.classList.remove('cr-game-open');
    await Promise.resolve();
    expect(document.querySelector('canvas')!.dataset.animationState).toBe('running');
    expect(frames().size).toBe(1);
  });

  it('continues to expose readable content when canvas is unavailable and only tokenizes once', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    cleanup = initVisualEffects();
    const block = document.querySelector('pre')!;
    expect(block.querySelectorAll('.code-line')).toHaveLength(3);
    expect(block.querySelector('.keyword')?.textContent).toBe('name: "Duc"');
    expect(document.querySelector('.section')?.classList.contains('in-view')).toBe(true);
    cleanup();
    cleanup = initVisualEffects();
    expect(block.querySelectorAll('.code-line')).toHaveLength(3);
  });

  it('resumes a cached page after pageshow and leaves no loop after disposal', () => {
    cleanup = initVisualEffects();
    window.dispatchEvent(new Event('pagehide'));
    expect(frames().size).toBe(0);
    expect(document.querySelector('canvas')!.dataset.animationState).toBe('paused');
    window.dispatchEvent(new Event('pageshow'));
    expect(frames().size).toBe(1);
    cleanup();
    window.dispatchEvent(new Event('pageshow'));
    expect(frames().size).toBe(0);
  });
});
