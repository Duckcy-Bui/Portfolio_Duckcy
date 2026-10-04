import type { Cleanup } from './site';

const activeAboutPages = new WeakMap<Document, Cleanup>();

/** Keep the original About tabs while allowing links into a specific tab. */
export function initAbout(documentRef: Document = document): Cleanup {
  activeAboutPages.get(documentRef)?.();
  const windowRef = documentRef.defaultView;
  const tabs = [...documentRef.querySelectorAll<HTMLButtonElement>('.about-tabs-nav button[data-tab]')];
  const panels = [...documentRef.querySelectorAll<HTMLElement>('.about-content [data-tab-panel]')];
  if (!windowRef || !tabs.length || !panels.length) return () => {};
  const cleanups: Cleanup[] = [];
  const tablist = documentRef.querySelector('.about-page-tabs') ?? documentRef.querySelector('.about-tabs-nav');
  tablist?.setAttribute('role', 'tablist');
  tablist?.setAttribute('aria-label', 'About Duc');
  const activate = (tab: HTMLButtonElement, focus = false, updateUrl = false) => {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      const selected = panel.dataset.tabPanel === tab.dataset.tab;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
    });
    if (focus) tab.focus();
    if (updateUrl) {
      const url = new URL(windowRef.location.href);
      url.searchParams.delete('tab');
      url.hash = tab.dataset.tab === 'overview' ? '' : tab.dataset.tab ?? '';
      windowRef.history.replaceState(windowRef.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    if (!tab.id) tab.id = `about-tab-${tab.dataset.tab}`;
    const panel = panels.find((item) => item.dataset.tabPanel === tab.dataset.tab);
    if (panel) {
      if (!panel.id) panel.id = `about-panel-${tab.dataset.tab}`;
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
    }
    const onClick = () => activate(tab, false, true);
    const onKeydown = (event: KeyboardEvent) => {
      let next: number | undefined;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); activate(tabs[next], true, true); }
    };
    tab.addEventListener('click', onClick);
    tab.addEventListener('keydown', onKeydown);
    cleanups.push(() => { tab.removeEventListener('click', onClick); tab.removeEventListener('keydown', onKeydown); });
  });
  const fromUrl = () => {
    const url = new URL(windowRef.location.href);
    const requested = url.searchParams.get('tab') || url.hash.slice(1);
    activate(tabs.find((tab) => tab.dataset.tab === requested) ?? tabs[0]);
  };
  windowRef.addEventListener('hashchange', fromUrl);
  windowRef.addEventListener('popstate', fromUrl);
  cleanups.push(() => { windowRef.removeEventListener('hashchange', fromUrl); windowRef.removeEventListener('popstate', fromUrl); });
  fromUrl();
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((dispose) => dispose());
    if (activeAboutPages.get(documentRef) === cleanup) activeAboutPages.delete(documentRef);
  };
  activeAboutPages.set(documentRef, cleanup);
  return cleanup;
}
