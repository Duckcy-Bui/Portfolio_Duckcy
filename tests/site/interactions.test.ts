import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSite } from '../../src/scripts/site';
import { initProjects } from '../../src/scripts/projects';
import { initSkills } from '../../src/scripts/skills';
import { copyTextToClipboard, initContact } from '../../src/scripts/contact';
import { CREDLY_EMBED_URL, initCertificates } from '../../src/scripts/certificates';

const cleanups: Array<() => void> = [];
const start = (cleanup: () => void) => { cleanups.push(cleanup); return cleanup; };
const input = (selector: string, value: string) => {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  document.body.innerHTML = '';
  document.body.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.head.querySelectorAll('[data-credly-embed]').forEach((node) => node.remove());
  history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const siteFixture = () => {
  document.body.innerHTML = `<button data-nav-toggle aria-controls="site-nav">Menu</button>
    <nav id="site-nav" data-nav><a href="/">Home</a><a href="/certificate/">Certificates</a></nav>
    <select id="theme-select"><option value="dark">Dark</option><option value="light">Light</option>
      <option value="forest">Forest</option><option value="ocean">Ocean</option><option value="sunset">Sunset</option></select>
    <span data-year></span><main><button id="outside">Outside</button></main>`;
};

describe('Shared site navigation and theme persistence', () => {
  it('restores a valid theme and changes all pages through the guarded preference key', () => {
    siteFixture();
    localStorage.setItem('portfolio-theme', 'forest');
    start(initSite());
    expect(document.documentElement.dataset.theme).toBe('forest');
    const select = document.querySelector<HTMLSelectElement>('#theme-select')!;
    expect(select.value).toBe('forest');
    select.value = 'ocean';
    select.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('ocean');
    expect(localStorage.getItem('portfolio-theme')).toBe('ocean');
    expect(document.querySelector('[data-year]')?.textContent).toBe(String(new Date().getFullYear()));
  });

  it('keeps controls operational when storage is unavailable', () => {
    siteFixture();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => start(initSite())).not.toThrow();
    const select = document.querySelector<HTMLSelectElement>('#theme-select')!;
    select.value = 'light';
    select.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('light');
    click('[data-nav-toggle]');
    expect(document.body.classList.contains('nav-open')).toBe(true);
  });

  it('moves focus into the mobile navigation, traps its controls, and restores focus on Escape', () => {
    siteFixture();
    start(initSite());
    const nav = document.querySelector('[data-nav]')!;
    expect(nav.getAttribute('aria-hidden')).toBe('true');
    click('[data-nav-toggle]');
    expect(document.activeElement?.textContent).toBe('Home');
    expect(nav.getAttribute('aria-hidden')).toBe('false');
    nav.querySelectorAll('a')[1].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(document.querySelector('[data-nav-toggle]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.body.classList.contains('nav-open')).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('[data-nav-toggle]'));
  });

  it('closes on an outside pointer and leaves route navigation native', () => {
    siteFixture();
    start(initSite());
    click('[data-nav-toggle]');
    document.querySelector('#outside')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.body.classList.contains('nav-open')).toBe(false);
    click('[data-nav-toggle]');
    const linkClick = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    document.querySelector('nav a')!.dispatchEvent(linkClick);
    expect(linkClick.defaultPrevented).toBe(false);
    expect(document.body.classList.contains('nav-open')).toBe(false);
  });

  it('exposes desktop navigation after resize and does not duplicate listeners on reinitialization', () => {
    let desktop = false;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: desktop, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    siteFixture();
    start(initSite());
    start(initSite());
    click('[data-nav-toggle]');
    expect(document.body.classList.contains('nav-open')).toBe(true);
    desktop = true;
    // A MediaQueryList updates matches in a real browser; use a getter in this fixture.
    const actualMedia = vi.mocked(window.matchMedia).mock.results.at(-1)!.value;
    Object.defineProperty(actualMedia, 'matches', { get: () => desktop });
    window.dispatchEvent(new Event('resize'));
    expect(document.querySelector('[data-nav]')!.hasAttribute('aria-hidden')).toBe(false);
    expect(document.body.classList.contains('nav-open')).toBe(false);
  });

  it('has no required page-specific nodes and accepts cross-tab theme changes', () => {
    start(initSite());
    window.dispatchEvent(new StorageEvent('storage', { key: 'portfolio-theme', newValue: 'sunset' }));
    expect(document.documentElement.dataset.theme).toBe('sunset');
    window.dispatchEvent(new StorageEvent('storage', { key: 'portfolio-theme', newValue: 'unknown' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

const projectFixture = () => {
  document.body.innerHTML = `<input data-project-search aria-label="Search">
    <input type="checkbox" data-tech value="Java"><input type="checkbox" data-tech value="Python">
    <span data-project-count></span><button data-project-clear>Clear</button><p data-project-empty hidden>None</p>
    <article data-project data-text="Tournament Java Redis" data-tags="Java,Redis">Tournament</article>
    <article data-project data-text="Investor Python Docker" data-tags="Python,Docker">Investor</article>
    <article data-project data-text="Student Java SQL" data-tags="Java,SQL">Student</article>`;
};
const visibleProjects = () => [...document.querySelectorAll<HTMLElement>('[data-project]')]
  .filter((card) => !card.hidden).map((card) => card.textContent);

describe('Project search, filters and shareable query state', () => {
  it('restores direct-link search and case-insensitive selected technologies', () => {
    projectFixture();
    history.replaceState(null, '', '/projects/?q=investor&tech=python,unknown');
    start(initProjects());
    expect(visibleProjects()).toEqual(['Investor']);
    expect(document.querySelector<HTMLInputElement>('[data-project-search]')!.value).toBe('investor');
    expect(document.querySelector<HTMLInputElement>('[value="Python"]')!.checked).toBe(true);
    expect(document.querySelector('[data-project-count]')!.textContent).toBe('Showing 1 of 3 projects');
  });

  it('combines search with OR technology selection and preserves unrelated URL parameters', () => {
    projectFixture();
    history.replaceState(null, '', '/projects/?ref=profile#list');
    start(initProjects());
    click('[value="Java"]');
    click('[value="Python"]');
    expect(visibleProjects()).toHaveLength(3);
    input('[data-project-search]', 'Docker');
    expect(visibleProjects()).toEqual(['Investor']);
    const query = new URL(location.href).searchParams;
    expect(query.get('q')).toBe('Docker');
    expect(query.get('tech')).toBe('Java,Python');
    expect(query.get('ref')).toBe('profile');
    expect(location.hash).toBe('#list');
  });

  it('shows empty results then clears filters, query and reserved URL parameters', () => {
    projectFixture();
    start(initProjects());
    input('[data-project-search]', 'missing');
    expect(visibleProjects()).toEqual([]);
    expect(document.querySelector<HTMLElement>('[data-project-empty]')!.hidden).toBe(false);
    click('[data-project-clear]');
    expect(visibleProjects()).toHaveLength(3);
    expect(document.querySelector<HTMLElement>('[data-project-empty]')!.hidden).toBe(true);
    expect(location.search).toBe('');
    expect(document.activeElement).toBe(document.querySelector('[data-project-search]'));
  });

  it('replays URL state on browser Back/Forward without appending another history entry', () => {
    projectFixture();
    start(initProjects());
    history.replaceState(null, '', '/projects/?tech=Java&q=student');
    const replace = vi.spyOn(history, 'replaceState');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(visibleProjects()).toEqual(['Student']);
    expect(replace).not.toHaveBeenCalled();
  });

  it('matches technology names exactly instead of misleading text substrings', () => {
    projectFixture();
    const first = document.querySelector<HTMLElement>('[data-project]')!;
    first.dataset.tags = 'JavaScript,Redis';
    start(initProjects());
    click('[value="Java"]');
    expect(visibleProjects()).toEqual(['Student']);
  });
});

describe('Accessible skill tabs', () => {
  const fixture = () => {
    document.body.innerHTML = `<div role="tablist"><button id="tab-languages" data-skill-tab="languages" role="tab" aria-controls="panel-languages">Languages</button>
      <button id="tab-backend" data-skill-tab="backend" role="tab" aria-controls="panel-backend">Backend</button>
      <button id="tab-devops" data-skill-tab="devops" role="tab" aria-controls="panel-devops">DevOps</button></div>
      <section id="panel-languages" data-skill-panel="languages">Python</section>
      <section id="panel-backend" data-skill-panel="backend">Flask</section>
      <section id="panel-devops" data-skill-panel="devops">Docker</section>`;
  };
  it('uses one selected tab and exposes only its panel after enhancement', () => {
    fixture();
    start(initSkills());
    click('[data-skill-tab="backend"]');
    expect(document.querySelector('[data-skill-tab="backend"]')!.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector<HTMLElement>('[data-skill-tab="languages"]')!.tabIndex).toBe(-1);
    expect(document.querySelector<HTMLElement>('[data-skill-panel="languages"]')!.hidden).toBe(true);
    const panel = document.querySelector<HTMLElement>('[data-skill-panel="backend"]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-backend');
    expect(panel.tabIndex).toBe(0);
    expect(document.querySelector('#tab-backend')!.getAttribute('aria-controls')).toBe(panel.id);
    panel.focus();
    expect(document.activeElement).toBe(panel);
  });
  it('supports arrow wrapping, Home and End with automatic activation and focus', () => {
    fixture();
    start(initSkills());
    const languages = document.querySelector<HTMLElement>('[data-skill-tab="languages"]')!;
    languages.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    const devops = document.querySelector<HTMLElement>('[data-skill-tab="devops"]')!;
    expect(document.activeElement).toBe(devops);
    expect(devops.getAttribute('aria-selected')).toBe('true');
    devops.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(languages);
    languages.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(devops);
  });
});

const contactFixture = () => {
  document.body.innerHTML = `<form id="contact-form" novalidate>
    <label>Name <input id="cf-name" data-validate="name"><span class="field-error"></span></label>
    <label>Email <input id="cf-email" data-validate="email"><span class="field-error"></span></label>
    <label>Message <textarea id="cf-message" data-validate="message"></textarea><span class="field-error"></span></label>
    <button type="submit">Open email draft</button></form>
    <button data-contact-copy>Copy draft</button><button data-contact-clear>Clear draft</button>
    <button data-copy-email="duckcy.work@gmail.com">Copy email</button><p data-contact-status aria-live="polite"></p>`;
};
const fillContact = () => {
  input('#cf-name', 'Visitor');
  input('#cf-email', 'visitor@example.com');
  input('#cf-message', 'I would like to discuss a project & collaboration.');
};
const submitContact = () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

describe('Contact drafts and truthful mailto behavior', () => {
  it('blocks blank submission, marks every missing input, and focuses the first', () => {
    contactFixture();
    const openMailto = vi.fn();
    start(initContact(document, { openMailto }));
    submitContact();
    expect(openMailto).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.querySelector('#cf-name'));
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(3);
    expect(document.querySelector('[data-contact-status]')!.textContent).toContain('correct');
  });

  it('validates email and message, opens an encoded mailto draft and never clears it on submit', () => {
    contactFixture();
    const openMailto = vi.fn();
    start(initContact(document, { openMailto }));
    fillContact();
    input('#cf-email', 'invalid');
    submitContact();
    expect(openMailto).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.querySelector('#cf-email'));
    input('#cf-email', 'visitor@example.com');
    submitContact();
    const url = new URL(openMailto.mock.calls[0][0]);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('duckcy.work@gmail.com');
    expect(url.searchParams.get('body')).toContain('project & collaboration.');
    expect(document.querySelector<HTMLTextAreaElement>('#cf-message')!.value).not.toBe('');
    expect(document.querySelector('[data-contact-status]')!.textContent).toContain('Review and send it there');
    expect(sessionStorage.getItem('portfolio-contact-draft')).toContain('visitor@example.com');
  });

  it('restores a session draft on a new page load and clears it only by explicit user action', () => {
    contactFixture();
    const first = start(initContact());
    fillContact();
    first();
    contactFixture();
    start(initContact());
    expect(document.querySelector<HTMLInputElement>('#cf-name')!.value).toBe('Visitor');
    click('[data-contact-clear]');
    expect(sessionStorage.getItem('portfolio-contact-draft')).toBeNull();
    expect(document.querySelector<HTMLTextAreaElement>('#cf-message')!.value).toBe('');
    expect(document.activeElement).toBe(document.querySelector('#cf-name'));
  });

  it('copies complete drafts and gives an actionable fallback when the clipboard is blocked', async () => {
    contactFixture();
    const copyText = vi.fn().mockResolvedValue(undefined);
    start(initContact(document, { copyText }));
    fillContact();
    click('[data-contact-copy]');
    await Promise.resolve();
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('My name is Visitor (visitor@example.com)'));
    expect(document.querySelector('[data-contact-status]')!.textContent).toContain('Email draft copied');
    copyText.mockRejectedValueOnce(new Error('blocked'));
    click('[data-contact-copy]');
    await Promise.resolve();
    expect(document.querySelector('[data-contact-status]')!.textContent).toContain('copy the message manually');
  });

  it('still works with damaged draft storage and reports a failure to open the email app', () => {
    contactFixture();
    sessionStorage.setItem('portfolio-contact-draft', '{broken');
    start(initContact(document, { openMailto: () => { throw new Error('blocked'); } }));
    fillContact();
    submitContact();
    expect(document.querySelector('[data-contact-status]')!.textContent).toContain('could not open');
    expect(document.querySelector<HTMLTextAreaElement>('#cf-message')!.value).not.toBe('');
  });

  it('ignores async copy completion after cleanup', async () => {
    contactFixture();
    let resolveCopy: () => void = () => {};
    const cleanup = start(initContact(document, { copyText: () => new Promise<void>((resolve) => { resolveCopy = resolve; }) }));
    click('[data-copy-email]');
    cleanup();
    resolveCopy();
    await Promise.resolve();
    expect(document.querySelector('[data-contact-status]')!.textContent).toBe('');
  });

  it('removes the native clipboard helper and restores focus even when copying fails', async () => {
    document.body.innerHTML = '<button id="previous">Previous control</button>';
    const previous = document.querySelector<HTMLButtonElement>('#previous')!;
    previous.focus();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
    await expect(copyTextToClipboard('Email draft')).rejects.toThrow('Clipboard');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(previous);
    delete (document as unknown as Record<string, unknown>).execCommand;
  });
});

describe('Credly embed as an optional progressive enhancement', () => {
  const fixture = () => {
    document.body.innerHTML = `<article data-credly-badge><div data-share-badge-id="existing-id" data-share-badge-host="https://www.credly.com"></div>
      <a href="https://www.credly.com/badges/existing-id">Verify credential</a></article>`;
  };
  it('requests one official script only after intersection and preserves the link if it fails', () => {
    let emit: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { emit = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    fixture();
    start(initCertificates());
    expect(document.querySelector('script[data-credly-embed]')).toBeNull();
    emit([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    emit([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[data-credly-embed]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(CREDLY_EMBED_URL);
    expect(disconnect).toHaveBeenCalled();
    scripts[0].dispatchEvent(new Event('error'));
    expect(document.querySelector('[data-credly-badge] a')?.textContent).toBe('Verify credential');
  });

  it('uses the official script without IntersectionObserver and does not duplicate it on reinitialization', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    fixture();
    start(initCertificates());
    start(initCertificates());
    expect(document.querySelectorAll('script[data-credly-embed]')).toHaveLength(1);
    expect(document.querySelector('[data-credly-badge] a')).not.toBeNull();
  });
});
