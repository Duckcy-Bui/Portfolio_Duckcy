import type { Cleanup } from './site';

const activeProjects = new WeakMap<Document, Cleanup>();

/** Search is combined with any selected technology; query state survives direct URLs and Back. */
export function initProjects(documentRef: Document = document): Cleanup {
  activeProjects.get(documentRef)?.();
  const windowRef = documentRef.defaultView;
  if (!windowRef) return () => {};
  const cards = [...documentRef.querySelectorAll<HTMLElement>('[data-project]')];
  const search = documentRef.querySelector<HTMLInputElement>('[data-project-search]');
  const filters = [...documentRef.querySelectorAll<HTMLInputElement>('input[data-tech]')];
  const count = documentRef.querySelector<HTMLElement>('[data-project-count]');
  const clear = documentRef.querySelector<HTMLButtonElement>('[data-project-clear]');
  const empty = documentRef.querySelector<HTMLElement>('[data-project-empty]');
  const categories = [...documentRef.querySelectorAll<HTMLDetailsElement>('details.stack-category')];
  if (!cards.length && !search && !filters.length) return () => {};
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const cleanups: Cleanup[] = [];
  let disposed = false;
  const listen = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener);
    cleanups.push(() => target.removeEventListener(name, listener));
  };
  const closeDropdowns = (restoreFocus = false, except?: HTMLDetailsElement) => {
    const open = categories.filter((category) => category.open && category !== except);
    open.forEach((category) => { category.open = false; });
    if (restoreFocus) open.at(-1)?.querySelector<HTMLElement>('summary')?.focus();
  };
  categories.forEach((category) => listen(category, 'toggle', () => {
    if (!disposed && category.open) closeDropdowns(false, category);
  }));
  listen(documentRef, 'click', (event) => {
    if (!(event.target instanceof windowRef.Node)) return;
    if (!categories.some((category) => category.contains(event.target as Node))) closeDropdowns();
  });
  listen(documentRef, 'keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Escape' || !categories.some((category) => category.open)) return;
    event.preventDefault();
    closeDropdowns(true);
  });

  const apply = (updateUrl = true) => {
    const query = normalize(search?.value || '');
    const selected = filters.filter((input) => input.checked).map((input) => input.value);
    const normalizedSelected = selected.map(normalize);
    let visible = 0;
    cards.forEach((card) => {
      const text = normalize(card.dataset.text || card.textContent || '');
      const tags = (card.dataset.tags || '').split(',').map(normalize);
      const matches = (!query || text.includes(query)) &&
        (!selected.length || normalizedSelected.some((technology) => tags.includes(technology)));
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (count) count.textContent = `Showing ${visible} of ${cards.length} projects`;
    if (empty) empty.hidden = visible > 0;
    if (clear) clear.disabled = !query && !selected.length;
    if (updateUrl) {
      const url = new URL(windowRef.location.href);
      if (query) url.searchParams.set('q', search?.value.trim() || '');
      else url.searchParams.delete('q');
      if (selected.length) url.searchParams.set('tech', selected.join(','));
      else url.searchParams.delete('tech');
      // Replacing keeps the browser Back button useful while typing.
      windowRef.history.replaceState(windowRef.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };
  const restore = () => {
    const query = new URL(windowRef.location.href).searchParams;
    if (search) search.value = query.get('q') || '';
    const selected = new Set((query.get('tech') || '').split(',').map(normalize));
    filters.forEach((input) => { input.checked = selected.has(normalize(input.value)); });
    apply(false);
  };
  if (search) listen(search, 'input', () => { closeDropdowns(); apply(); });
  filters.forEach((input) => listen(input, 'change', () => {
    apply();
    // Like the original tag dropdown, a selection closes the overlay. Return
    // focus to its summary so keyboard focus never stays in hidden content.
    closeDropdowns(true);
  }));
  if (clear) listen(clear, 'click', () => {
    closeDropdowns();
    if (search) search.value = '';
    filters.forEach((input) => { input.checked = false; });
    apply();
    search?.focus();
  });
  listen(windowRef, 'popstate', restore);
  restore();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((dispose) => dispose());
    if (activeProjects.get(documentRef) === cleanup) activeProjects.delete(documentRef);
  };
  activeProjects.set(documentRef, cleanup);
  return cleanup;
}
