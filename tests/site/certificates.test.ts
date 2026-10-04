import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREDLY_EMBED_TIMEOUT_MS, initCertificates } from '../../src/scripts/certificates';

let cleanup = () => {};
const fixture = () => {
  document.body.innerHTML = `<article data-credly-badge>
    <figure data-certificate-artwork><img data-certificate-image src="/assets/certificates/aws-sbg-core-team.png" alt="AWS badge">
      <figcaption class="cert-artwork-caption">AWS Student Builder Group</figcaption>
      <p data-certificate-image-unavailable hidden>Verify this credential on Credly.</p></figure>
    <a href="https://www.credly.com/badges/73787dad-002a-4cce-b49d-011b40587df9">View credential on Credly</a>
  </article>`;
  return document.querySelector<HTMLImageElement>('[data-certificate-image]')!;
};

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('[data-credly-embed]').forEach((script) => script.remove());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Authentic local certificate artwork', () => {
  it('needs no Credly script or observer and leaves artwork and canonical link visible', () => {
    const image = fixture();
    const Observer = vi.fn();
    vi.stubGlobal('IntersectionObserver', Observer);
    cleanup = initCertificates();
    expect(Observer).not.toHaveBeenCalled();
    expect(document.querySelector('[data-credly-embed]')).toBeNull();
    expect(image.hidden).toBe(false);
    expect(document.querySelector('[data-certificate-image-unavailable]')?.hasAttribute('hidden')).toBe(true);
    expect(document.querySelector('a')?.href).toContain('/badges/73787dad-002a-4cce-b49d-011b40587df9');
  });

  it('handles a broken local image with truthful text while retaining verification access', () => {
    const image = fixture();
    cleanup = initCertificates();
    image.dispatchEvent(new Event('error'));
    expect(image.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-certificate-artwork]')?.dataset.imageState).toBe('unavailable');
    expect(document.querySelector<HTMLElement>('[data-certificate-image-unavailable]')?.hidden).toBe(false);
    expect(document.querySelector('a')?.textContent).toBe('View credential on Credly');
    image.dispatchEvent(new Event('load'));
    expect(image.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-certificate-image-unavailable]')?.hidden).toBe(true);
  });

  it('recognizes an image failure that completed before initialization', () => {
    const image = fixture();
    Object.defineProperties(image, {
      complete: { value: true }, currentSrc: { value: image.src }, naturalWidth: { value: 0 },
    });
    cleanup = initCertificates();
    expect(image.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-certificate-image-unavailable]')?.hidden).toBe(false);
  });

  it('removes stale event handlers on reinitialization and page cleanup', () => {
    const image = fixture();
    cleanup = initCertificates();
    cleanup = initCertificates();
    cleanup();
    image.dispatchEvent(new Event('error'));
    expect(image.hidden).toBe(false);
    cleanup = initCertificates();
    window.dispatchEvent(new Event('pagehide'));
    image.dispatchEvent(new Event('error'));
    expect(image.hidden).toBe(false);
  });

  it('bounds a delayed legacy embed and cancels callbacks after disposal without hiding local artwork', () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', undefined);
    const image = fixture();
    document.querySelector('article')!.insertAdjacentHTML('beforeend', '<div data-share-badge-id="legacy" data-share-badge-host="https://www.credly.com"></div>');
    cleanup = initCertificates();
    vi.advanceTimersByTime(CREDLY_EMBED_TIMEOUT_MS);
    expect(document.querySelector<HTMLElement>('[data-credly-badge]')?.dataset.credlyLoaded).toBe('false');
    expect(image.hidden).toBe(false);
    cleanup();
    document.querySelector('script[data-credly-embed]')!.dispatchEvent(new Event('load'));
    expect(document.querySelector<HTMLElement>('[data-credly-badge]')?.dataset.credlyLoaded).toBe('false');
    expect(vi.getTimerCount()).toBe(0);
  });
});
