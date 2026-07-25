// Compatibility entry for stale bookmarks/imports. The active bootstrap loads
// fc-engine.js directly; this file intentionally owns no state or browser work.
export * from './fc-engine.js';
export { default } from './fc-engine.js';
