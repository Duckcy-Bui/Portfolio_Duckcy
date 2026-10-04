import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initAbout } from '../../src/scripts/about';

let cleanup: (() => void) | undefined;
beforeEach(() => {
  document.body.innerHTML = `<nav class="about-tabs-nav" aria-label="About sections"><div class="about-page-tabs"><button data-tab="overview">Overview</button><button data-tab="education">Education</button><button data-tab="testimonials">Testimonials</button></div><a href="/certificate/">Certificates</a></nav>
    <div class="about-content"><section data-tab-panel="overview">Intro</section><section data-tab-panel="education">Education content</section><section data-tab-panel="testimonials">Feedback</section></div>`;
  history.replaceState(null, '', '/about/');
});
afterEach(() => { cleanup?.(); document.body.innerHTML = ''; });
const activePanel = () => [...document.querySelectorAll<HTMLElement>('[data-tab-panel]')].find((panel) => !panel.hidden);

describe('restored About tabs and independent certificate route', () => {
  it('opens a linked education or testimonials tab and exposes its accessible panel', () => {
    history.replaceState(null, '', '/about/#education');
    cleanup = initAbout();
    expect(activePanel()?.dataset.tabPanel).toBe('education');
    expect(activePanel()?.getAttribute('role')).toBe('tabpanel');
    expect(document.querySelector('.about-page-tabs')?.getAttribute('role')).toBe('tablist');
    expect(document.querySelector('a')?.closest('[role="tablist"]')).toBeNull();
    history.replaceState(null, '', '/about/#testimonials');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(activePanel()?.dataset.tabPanel).toBe('testimonials');
  });

  it('uses keyboard tabs and keeps certificate navigation native', () => {
    cleanup = initAbout();
    const overview = document.querySelector<HTMLButtonElement>('[data-tab="overview"]')!;
    overview.focus();
    overview.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(document.activeElement?.textContent).toBe('Testimonials');
    expect(location.hash).toBe('#testimonials');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    document.querySelector('a')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('restores query links, ignores invalid tabs, and does not duplicate handlers', () => {
    history.replaceState(null, '', '/about/?tab=education&ref=profile');
    cleanup = initAbout();
    cleanup = initAbout();
    expect(activePanel()?.dataset.tabPanel).toBe('education');
    document.querySelector<HTMLButtonElement>('[data-tab="overview"]')!.click();
    expect(location.search).toBe('?ref=profile');
    expect(location.hash).toBe('');
    history.replaceState(null, '', '/about/#missing');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(activePanel()?.dataset.tabPanel).toBe('overview');
  });
});
