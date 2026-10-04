import { initVisualEffects } from './visual-effects';

export type Cleanup = () => void;

const THEMES = [
  { key: 'dark', className: '', label: 'Outer Space' },
  { key: 'light', className: 'light-mode', label: 'Daylight' },
  { key: 'forest', className: 'theme-forest', label: 'Forest Terminal' },
  { key: 'ocean', className: 'theme-ocean', label: 'Deep Ocean' },
  { key: 'sunset', className: 'theme-sunset', label: 'Sunset Ember' },
];
const activeSites = new WeakMap<Document, Cleanup>();

export function readStorage(windowRef: Window, kind: 'localStorage' | 'sessionStorage', key: string): string | null {
  try { return windowRef[kind].getItem(key); } catch { return null; }
}

export function writeStorage(windowRef: Window, kind: 'localStorage' | 'sessionStorage', key: string, value: string | null): void {
  try {
    if (value === null) windowRef[kind].removeItem(key);
    else windowRef[kind].setItem(key, value);
  } catch { /* Site preferences remain usable when storage is unavailable. */ }
}

/** Shared, progressively enhanced controls. Navigation always remains a native link. */
export function initSite(documentRef: Document = document): Cleanup {
  activeSites.get(documentRef)?.();
  const windowRef = documentRef.defaultView;
  if (!windowRef) return () => {};
  const cleanups: Cleanup[] = [];
  const listen = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener);
    cleanups.push(() => target.removeEventListener(name, listener));
  };

  documentRef.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const themeSelect = documentRef.querySelector<HTMLSelectElement>('#theme-select');
  const applyTheme = (value: string | null) => {
    const theme = THEMES.find((item) => item.key === value) ?? THEMES[0];
    documentRef.documentElement.dataset.theme = theme.key;
    documentRef.body.classList.remove(...THEMES.map((item) => item.className).filter(Boolean));
    if (theme.className) documentRef.body.classList.add(theme.className);
    if (themeSelect) themeSelect.value = theme.key;
    const label = documentRef.getElementById('theme-pill-label');
    if (label) label.textContent = theme.label;
    documentRef.querySelectorAll<HTMLButtonElement>('.theme-picker-item').forEach((item) => {
      const selected = item.dataset.themeKey === theme.key;
      item.classList.toggle('active', selected);
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(selected));
    });
    documentRef.dispatchEvent(new CustomEvent('portfolio:themechange', { detail: { theme: theme.key } }));
  };
  applyTheme(readStorage(windowRef, 'localStorage', 'portfolio-theme'));
  if (themeSelect) listen(themeSelect, 'change', () => {
    applyTheme(themeSelect.value);
    writeStorage(windowRef, 'localStorage', 'portfolio-theme', themeSelect.value);
  });
  listen(windowRef, 'storage', ((event: StorageEvent) => {
    if (event.key === 'portfolio-theme' || event.key === null) applyTheme(event.newValue);
  }) as EventListener);

  const bindMenu = (button: HTMLButtonElement, menu: HTMLElement, wrapper: HTMLElement) => {
    let open = false;
    const items = () => [...menu.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
    const close = (focus = false) => {
      open = false; wrapper.classList.remove('open'); menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focus) button.focus();
    };
    const show = (focus = false, last = false) => {
      open = true; wrapper.classList.add('open'); menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      if (focus) (last ? items().at(-1) : items()[0])?.focus();
    };
    close();
    listen(button, 'click', (event) => { event.stopPropagation(); if (open) close(); else show(); });
    listen(button, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(true, event.key === 'ArrowUp'); }
      else if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
    }) as EventListener);
    listen(menu, 'keydown', ((event: KeyboardEvent) => {
      const controls = items();
      const index = controls.indexOf(documentRef.activeElement as HTMLElement);
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      else if (event.key === 'Tab') close(true);
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && controls.length) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
        controls[next].focus();
      }
    }) as EventListener);
    const outside = (event: Event) => { if (open && event.target instanceof windowRef.Node && !wrapper.contains(event.target)) close(); };
    listen(documentRef, 'pointerdown', outside);
    listen(documentRef, 'click', outside);
    listen(menu, 'click', ((event: Event) => {
      const target = event.target;
      if (target instanceof windowRef.Element && target.closest('a[href],button')) close(target.closest('button') !== null);
    }) as EventListener);
    cleanups.push(() => { close(); menu.hidden = false; });
    return close;
  };

  const themePill = documentRef.querySelector<HTMLButtonElement>('#theme-pill-btn');
  const themePicker = documentRef.querySelector<HTMLElement>('#theme-picker');
  const themeBrand = documentRef.querySelector<HTMLElement>('#theme-brand');
  if (themePill && themePicker && themeBrand) bindMenu(themePill, themePicker, themeBrand);
  documentRef.querySelectorAll<HTMLButtonElement>('.theme-picker-item').forEach((button) => listen(button, 'click', () => {
    const theme = button.dataset.themeKey ?? 'dark';
    applyTheme(theme); writeStorage(windowRef, 'localStorage', 'portfolio-theme', theme);
  }));
  const themeCycle = documentRef.querySelector<HTMLButtonElement>('#theme-toggle');
  if (themeCycle) listen(themeCycle, 'click', () => {
    const current = THEMES.findIndex((theme) => theme.key === documentRef.documentElement.dataset.theme);
    const next = THEMES[(current + 1) % THEMES.length].key;
    applyTheme(next); writeStorage(windowRef, 'localStorage', 'portfolio-theme', next);
  });
  const closeDropdowns: Array<(focus?: boolean) => void> = [];
  documentRef.querySelectorAll<HTMLElement>('.nav-dropdown-wrap').forEach((wrapper) => {
    const button = wrapper.querySelector<HTMLButtonElement>('[data-nav-dropdown]');
    const menu = wrapper.querySelector<HTMLElement>('.nav-dropdown');
    if (button && menu) closeDropdowns.push(bindMenu(button, menu, wrapper));
  });
  cleanups.push(initVisualEffects(documentRef));

  const toggle = documentRef.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const nav = documentRef.querySelector<HTMLElement>('[data-nav]');
  if (toggle && nav) {
    const desktopMedia = typeof windowRef.matchMedia === 'function'
      ? windowRef.matchMedia('(min-width: 981px)') : null;
    const desktop = () => desktopMedia ? desktopMedia.matches : windowRef.innerWidth >= 981;
    let open = false;
    const sync = () => {
      documentRef.body.classList.toggle('nav-open', open && !desktop());
      toggle.setAttribute('aria-expanded', String(open && !desktop()));
      if (!desktop()) nav.setAttribute('aria-hidden', String(!open));
      else nav.removeAttribute('aria-hidden');
      nav.inert = !desktop() && !open;
    };
    const close = (returnFocus = false) => {
      open = false;
      closeDropdowns.forEach((closeDropdown) => closeDropdown());
      sync();
      if (returnFocus) toggle.focus();
    };
    listen(toggle, 'click', () => {
      if (desktop()) return;
      open = !open;
      sync();
      if (open) nav.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
      else toggle.focus();
    });
    listen(nav, 'click', ((event: Event) => {
      const target = event.target;
      if (target instanceof windowRef.Element && target.closest('a[href]')) close();
    }) as EventListener);
    listen(documentRef, 'keydown', ((event: KeyboardEvent) => {
      if (!open || desktop() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') {
        const controls = [toggle, ...nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter((element) => !element.closest('[hidden]'));
        const index = controls.indexOf(documentRef.activeElement as HTMLElement);
        if (event.shiftKey && index === 0) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (!event.shiftKey && index === controls.length - 1) {
          event.preventDefault();
          toggle.focus();
        }
      }
    }) as EventListener);
    listen(documentRef, 'pointerdown', ((event: Event) => {
      const target = event.target as Node | null;
      if (open && target && !nav.contains(target) && !toggle.contains(target)) close();
    }) as EventListener);
    const onResize = () => { if (desktop()) open = false; sync(); };
    listen(windowRef, 'resize', onResize);
    if (desktopMedia?.addEventListener) {
      desktopMedia.addEventListener('change', onResize);
      cleanups.push(() => desktopMedia.removeEventListener('change', onResize));
    }
    sync();
    cleanups.push(() => {
      documentRef.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      nav.removeAttribute('aria-hidden');
      nav.inert = false;
    });
  }

  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanups.reverse().forEach((dispose) => dispose());
    if (activeSites.get(documentRef) === cleanup) activeSites.delete(documentRef);
  };
  activeSites.set(documentRef, cleanup);
  return cleanup;
}
