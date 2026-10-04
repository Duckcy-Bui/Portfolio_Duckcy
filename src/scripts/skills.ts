import type { Cleanup } from './site';

const activeSkills = new WeakMap<Document, Cleanup>();

export function initSkills(documentRef: Document = document): Cleanup {
  activeSkills.get(documentRef)?.();
  const allTabs = [...documentRef.querySelectorAll<HTMLButtonElement>('[data-skill-tab]')];
  const allPanels = [...documentRef.querySelectorAll<HTMLElement>('[data-skill-panel]')];
  if (!allTabs.length || !allPanels.length) return () => {};
  const cleanups: Cleanup[] = [];
  // Each original stack has its own tabs. Activating a secondary category must
  // leave the primary stack and its selected category untouched.
  const groups = [...new Set(allTabs.map((tab) => tab.closest('[data-skill-group]') || documentRef))];
  groups.forEach((group, groupIndex) => {
    const tabs = allTabs.filter((tab) => (tab.closest('[data-skill-group]') || documentRef) === group);
    const panels = allPanels.filter((panel) => (panel.closest('[data-skill-group]') || documentRef) === group);
    panels.forEach((panel) => {
      const tab = tabs.find((item) => item.dataset.skillTab === panel.dataset.skillPanel);
      if (!tab) return;
      if (!tab.id) tab.id = `skill-tab-${groupIndex}-${tabs.indexOf(tab)}`;
      if (!panel.id) panel.id = `skill-panel-${groupIndex}-${panels.indexOf(panel)}`;
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      // These panels contain text and icons, so they need a keyboard entry point.
      panel.tabIndex = 0;
    });
    const activate = (tab: HTMLButtonElement, focus = false) => {
      const target = tab.dataset.skillTab;
      tabs.forEach((item) => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        item.classList.toggle('active', selected);
      });
      panels.forEach((panel) => {
        const selected = panel.dataset.skillPanel === target;
        panel.hidden = !selected;
        panel.classList.toggle('active', selected);
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      const onClick = () => activate(tab);
      const onKeydown = (event: KeyboardEvent) => {
        let next: number | undefined;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        activate(tabs[next], true);
      };
      tab.addEventListener('click', onClick);
      tab.addEventListener('keydown', onKeydown);
      cleanups.push(() => {
        tab.removeEventListener('click', onClick);
        tab.removeEventListener('keydown', onKeydown);
      });
    });
    activate(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
  });
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((dispose) => dispose());
    if (activeSkills.get(documentRef) === cleanup) activeSkills.delete(documentRef);
  };
  activeSkills.set(documentRef, cleanup);
  return cleanup;
}
