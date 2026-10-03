export type Cleanup = () => void;

const THEMES = new Set(['dark', 'light', 'forest', 'ocean', 'sunset']);
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
    const theme = value && THEMES.has(value) ? value : 'dark';
    documentRef.documentElement.dataset.theme = theme;
    if (themeSelect) themeSelect.value = theme;
  };
  applyTheme(readStorage(windowRef, 'localStorage', 'portfolio-theme'));
  if (themeSelect) listen(themeSelect, 'change', () => {
    applyTheme(themeSelect.value);
    writeStorage(windowRef, 'localStorage', 'portfolio-theme', themeSelect.value);
  });
  listen(windowRef, 'storage', ((event: StorageEvent) => {
    if (event.key === 'portfolio-theme' || event.key === null) applyTheme(event.newValue);
  }) as EventListener);

  const toggle = documentRef.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const nav = documentRef.querySelector<HTMLElement>('[data-nav]');
  if (toggle && nav) {
    const desktopMedia = typeof windowRef.matchMedia === 'function'
      ? windowRef.matchMedia('(min-width: 1024px)') : null;
    const desktop = () => desktopMedia ? desktopMedia.matches : windowRef.innerWidth >= 1024;
    let open = false;
    const sync = () => {
      documentRef.body.classList.toggle('nav-open', open && !desktop());
      toggle.setAttribute('aria-expanded', String(open && !desktop()));
      if (!desktop()) nav.setAttribute('aria-hidden', String(!open));
      else nav.removeAttribute('aria-hidden');
    };
    const close = (returnFocus = false) => {
      open = false;
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
      if (!open || desktop()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') {
        const controls = [toggle, ...nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
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
