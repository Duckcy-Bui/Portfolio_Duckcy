import { afterEach, beforeEach, vi } from 'vitest';

export function makeCanvasContext() {
  const noop = () => {};
  return {
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, rect: noop,
    fill: noop, stroke: noop, fillRect: noop, strokeRect: noop,
    fillText: noop, setTransform: noop, clearRect: noop,
    translate: noop, rotate: noop, scale: noop,
    measureText: (text) => ({ width: String(text).length * 8 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
  };
}

function installCanvasStub() {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(function getContext(kind) {
      if (kind !== '2d') return null;
      if (!this.__fcContext) this.__fcContext = makeCanvasContext();
      return this.__fcContext;
    }),
  });
}
installCanvasStub();
// A spy on an existing mock can change that mock's implementation in Vitest 4.
// Reset the browser capability fixture so an unsupported-canvas test cannot
// silently make every later loader activation unsupported as well.
beforeEach(installCanvasStub);

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

let nextFrameId = 1;
const frameCallbacks = new Map();
window.requestAnimationFrame = vi.fn((callback) => {
  const id = nextFrameId++;
  frameCallbacks.set(id, callback);
  return id;
});
window.cancelAnimationFrame = vi.fn((id) => frameCallbacks.delete(id));
window.scrollTo = vi.fn();

Object.defineProperty(window, '__fcTestFrames', {
  configurable: true,
  value: frameCallbacks,
});

afterEach(async () => {
  const engine = await import('../../game/fc-engine.js');
  if (engine.isOpen()) engine.close('test-cleanup');
  document.head.querySelectorAll('[data-fc-game-resource], [data-fc-loading-critical]').forEach((node) => node.remove());
  document.documentElement.removeAttribute('style');
  document.body.innerHTML = '';
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
  localStorage.clear();
  sessionStorage.clear();
  frameCallbacks.clear();
  vi.useRealTimers();
});
