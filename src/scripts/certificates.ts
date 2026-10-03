import type { Cleanup } from './site';

export const CREDLY_EMBED_URL = 'https://cdn.credly.com/assets/utilities/embed.js';
const activeCertificates = new WeakMap<Document, Cleanup>();

/** The credential link is always usable; the optional third-party embed starts near the viewport. */
export function initCertificates(documentRef: Document = document): Cleanup {
  activeCertificates.get(documentRef)?.();
  const windowRef = documentRef.defaultView;
  const badges = [...documentRef.querySelectorAll<HTMLElement>('[data-credly-badge]')];
  if (!windowRef || !badges.length) return () => {};
  let observer: IntersectionObserver | null = null;
  let requested = false;
  let disposed = false;
  const load = () => {
    if (requested || disposed) return;
    requested = true;
    observer?.disconnect();
    const existing = documentRef.querySelector<HTMLScriptElement>(`script[src="${CREDLY_EMBED_URL}"]`);
    if (existing) return;
    const script = documentRef.createElement('script');
    script.src = CREDLY_EMBED_URL;
    script.async = true;
    script.dataset.credlyEmbed = 'true';
    script.addEventListener('load', () => {
      if (!disposed) badges.forEach((badge) => { badge.dataset.credlyLoaded = 'true'; });
    }, { once: true });
    script.addEventListener('error', () => {
      if (!disposed) badges.forEach((badge) => { badge.dataset.credlyLoaded = 'false'; });
    }, { once: true });
    documentRef.head.appendChild(script);
  };
  if (typeof windowRef.IntersectionObserver === 'function') {
    observer = new windowRef.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load();
    }, { rootMargin: '200px' });
    badges.forEach((badge) => observer?.observe(badge));
  } else load();
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    if (activeCertificates.get(documentRef) === cleanup) activeCertificates.delete(documentRef);
  };
  activeCertificates.set(documentRef, cleanup);
  return cleanup;
}
