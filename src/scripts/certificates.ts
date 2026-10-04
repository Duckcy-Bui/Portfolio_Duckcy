import type { Cleanup } from './site';

export const CREDLY_EMBED_URL = 'https://cdn.credly.com/assets/utilities/embed.js';
export const CREDLY_EMBED_TIMEOUT_MS = 10_000;
const activeCertificates = new WeakMap<Document, Cleanup>();

/** Locally hosted authentic artwork needs no third-party request. Legacy embeds remain optional. */
export function initCertificates(documentRef: Document = document): Cleanup {
  activeCertificates.get(documentRef)?.();
  const windowRef = documentRef.defaultView;
  const images = [...documentRef.querySelectorAll<HTMLImageElement>('[data-certificate-image]')];
  const badges = [...documentRef.querySelectorAll<HTMLElement>('[data-credly-badge]')]
    .filter((badge) => badge.querySelector('[data-share-badge-id]'));
  if (!windowRef || (!badges.length && !images.length)) return () => {};
  let observer: IntersectionObserver | null = null;
  let requested = false;
  let disposed = false;
  let timeout: number | undefined;
  const removers: Cleanup[] = [];
  const imageState = (image: HTMLImageElement, available: boolean) => {
    if (disposed) return;
    const artwork = image.closest<HTMLElement>('[data-certificate-artwork]');
    image.hidden = !available;
    if (artwork) {
      artwork.dataset.imageState = available ? 'available' : 'unavailable';
      const fallback = artwork.querySelector<HTMLElement>('[data-certificate-image-unavailable]');
      const caption = artwork.querySelector<HTMLElement>('.cert-artwork-caption');
      if (fallback) fallback.hidden = available;
      if (caption) caption.hidden = !available;
    }
  };
  images.forEach((image) => {
    const loaded = () => imageState(image, true);
    const failed = () => imageState(image, false);
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    removers.push(() => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    });
    if (image.complete && image.currentSrc) imageState(image, image.naturalWidth > 0);
  });
  const settleEmbed = (available: boolean) => {
    if (disposed) return;
    windowRef.clearTimeout(timeout);
    timeout = undefined;
    badges.forEach((badge) => { badge.dataset.credlyLoaded = String(available); });
  };
  const load = () => {
    if (requested || disposed) return;
    requested = true;
    observer?.disconnect();
    const existing = documentRef.querySelector<HTMLScriptElement>(`script[src="${CREDLY_EMBED_URL}"]`);
    const script = existing ?? documentRef.createElement('script');
    const loaded = () => settleEmbed(true);
    const failed = () => settleEmbed(false);
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    removers.push(() => {
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
    });
    timeout = windowRef.setTimeout(() => settleEmbed(false), CREDLY_EMBED_TIMEOUT_MS);
    if (!existing) {
      script.src = CREDLY_EMBED_URL;
      script.async = true;
      script.dataset.credlyEmbed = 'true';
      documentRef.head.appendChild(script);
    }
  };
  if (badges.length && typeof windowRef.IntersectionObserver === 'function') {
    observer = new windowRef.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load();
    }, { rootMargin: '200px' });
    badges.forEach((badge) => observer?.observe(badge));
  } else if (badges.length) load();
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    windowRef.clearTimeout(timeout);
    observer?.disconnect();
    removers.forEach((remove) => remove());
    windowRef.removeEventListener('pagehide', cleanup);
    if (activeCertificates.get(documentRef) === cleanup) activeCertificates.delete(documentRef);
  };
  activeCertificates.set(documentRef, cleanup);
  windowRef.addEventListener('pagehide', cleanup, { once: true });
  return cleanup;
}
