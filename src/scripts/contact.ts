import { readStorage, writeStorage, type Cleanup } from './site';

const EMAIL = 'duckcy.work@gmail.com';
const DRAFT_KEY = 'portfolio-contact-draft';
const activeContacts = new WeakMap<Document, Cleanup>();
type ContactDraft = { name: string; email: string; message: string };
export type ContactOptions = {
  openMailto?: (url: string) => void;
  copyText?: (text: string) => Promise<void>;
};

export async function copyTextToClipboard(text: string, documentRef: Document = document): Promise<void> {
  const windowRef = documentRef.defaultView;
  const clipboard = windowRef?.navigator.clipboard;
  if (typeof clipboard?.writeText === 'function') {
    try { await clipboard.writeText(text); return; } catch { /* Try the native fallback. */ }
  }
  const previousFocus = documentRef.activeElement as HTMLElement | null;
  const helper = documentRef.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.setAttribute('aria-hidden', 'true');
  helper.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  documentRef.body.appendChild(helper);
  helper.select();
  helper.setSelectionRange(0, text.length);
  try {
    if (typeof documentRef.execCommand !== 'function' || !documentRef.execCommand('copy')) {
      throw new Error('Clipboard is unavailable.');
    }
  } finally {
    helper.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

export function makeContactDraft({ name, email, message }: ContactDraft): string {
  return `Hi Duc,\n\nMy name is ${name} (${email}).\n\n${message}\n\nBest regards,\n${name}`;
}

/** Opens an email draft. It deliberately never reports a message as sent. */
export function initContact(documentRef: Document = document, options: ContactOptions = {}): Cleanup {
  activeContacts.get(documentRef)?.();
  const windowRef = documentRef.defaultView;
  if (!windowRef) return () => {};
  const copy = options.copyText || ((text: string) => copyTextToClipboard(text, documentRef));
  const openMailto = options.openMailto || ((url: string) => {
    const link = documentRef.createElement('a');
    link.href = url;
    link.hidden = true;
    documentRef.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
  });
  const cleanups: Cleanup[] = [];
  let disposed = false;
  const listen = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener);
    cleanups.push(() => target.removeEventListener(name, listener));
  };
  const status = documentRef.querySelector<HTMLElement>('[data-contact-status]');
  const announce = (message: string) => {
    if (!disposed && status) status.textContent = message;
  };
  const copyFeedback = new Map<HTMLElement, number>();
  cleanups.push(() => {
    copyFeedback.forEach((timer, control) => {
      windowRef.clearTimeout(timer);
      control.classList.remove('copied');
    });
    copyFeedback.clear();
  });
  documentRef.querySelectorAll<HTMLElement>('[data-copy-email]').forEach((control) => {
    listen(control, 'click', async (event) => {
      event.preventDefault();
      const email = control.dataset.copyEmail || EMAIL;
      try {
        await copy(email);
        if (disposed) return;
        const previous = copyFeedback.get(control);
        if (previous !== undefined) windowRef.clearTimeout(previous);
        control.classList.add('copied');
        copyFeedback.set(control, windowRef.setTimeout(() => {
          control.classList.remove('copied');
          copyFeedback.delete(control);
        }, 2500));
        announce('Email address copied.');
      }
      catch { announce(`Email: ${email}. Select the address above to copy it manually.`); }
    });
  });

  const form = documentRef.querySelector<HTMLFormElement>('#contact-form');
  const name = form?.querySelector<HTMLInputElement>('#cf-name');
  const email = form?.querySelector<HTMLInputElement>('#cf-email');
  const message = form?.querySelector<HTMLTextAreaElement>('#cf-message');
  if (form && name && email && message) {
    const fields = [name, email, message];
    const readDraft = (): ContactDraft => ({ name: name.value.trim(), email: email.value.trim(), message: message.value.trim() });
    const persistDraft = () => {
      writeStorage(windowRef, 'sessionStorage', DRAFT_KEY, JSON.stringify({
        name: name.value, email: email.value, message: message.value,
      }));
    };
    const storedDraft = readStorage(windowRef, 'sessionStorage', DRAFT_KEY);
    if (storedDraft) {
      try {
        const draft: unknown = JSON.parse(storedDraft);
        if (draft && typeof draft === 'object') {
          const saved = draft as Record<string, unknown>;
          if (typeof saved.name === 'string' && !name.value) name.value = saved.name;
          if (typeof saved.email === 'string' && !email.value) email.value = saved.email;
          if (typeof saved.message === 'string' && !message.value) message.value = saved.message;
        }
      } catch { /* Ignore a damaged session draft. */ }
    }
    const validateField = (field: HTMLInputElement | HTMLTextAreaElement): boolean => {
      const value = field.value.trim();
      let error = '';
      if (!value) error = 'This field is required.';
      else if (field.dataset.validate === 'name' && value.length < 2) error = 'Name must be at least 2 characters.';
      else if (field.dataset.validate === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Please enter a valid email address.';
      else if (field.dataset.validate === 'message' && value.length < 10) error = 'Message must be at least 10 characters.';
      const errorElement = field.parentElement?.querySelector<HTMLElement>('.field-error');
      if (errorElement) errorElement.textContent = error;
      field.setAttribute('aria-invalid', String(Boolean(error)));
      field.classList.toggle('invalid', Boolean(error));
      field.classList.toggle('valid', !error && Boolean(value));
      return !error;
    };
    const validateDraft = () => {
      const firstInvalid = fields.filter((field) => !validateField(field))[0];
      if (!firstInvalid) return true;
      firstInvalid.focus();
      announce('Please correct the marked fields before opening your email draft.');
      return false;
    };
    fields.forEach((field) => {
      listen(field, 'input', () => {
        persistDraft();
        if (field.getAttribute('aria-invalid') === 'true') validateField(field);
      });
      listen(field, 'blur', () => { validateField(field); });
    });
    listen(form, 'submit', (event) => {
      event.preventDefault();
      if (!validateDraft()) return;
      const draft = readDraft();
      persistDraft();
      const subject = encodeURIComponent(`Portfolio Contact from ${draft.name}`);
      const body = encodeURIComponent(makeContactDraft(draft));
      try {
        openMailto(`mailto:${EMAIL}?subject=${subject}&body=${body}`);
        announce('Your email app is opening with a draft. Review and send it there. Your draft is kept here.');
      } catch {
        announce('Your email app could not open. Copy your draft and email it to duckcy.work@gmail.com.');
      }
    });
    const copyControl = documentRef.querySelector<HTMLButtonElement>('[data-contact-copy]');
    if (copyControl) listen(copyControl, 'click', async (event) => {
      event.preventDefault();
      if (!validateDraft()) return;
      try {
        await copy(makeContactDraft(readDraft()));
        announce('Email draft copied. Paste it into your email app and send it to duckcy.work@gmail.com.');
      } catch {
        announce('Clipboard is unavailable. Your draft is kept here; select and copy the message manually.');
      }
    });
    const clearControl = documentRef.querySelector<HTMLButtonElement>('[data-contact-clear]');
    if (clearControl) listen(clearControl, 'click', (event) => {
      event.preventDefault();
      fields.forEach((field) => {
        field.value = '';
        field.removeAttribute('aria-invalid');
        field.classList.remove('valid', 'invalid');
        const error = field.parentElement?.querySelector<HTMLElement>('.field-error');
        if (error) error.textContent = '';
      });
      writeStorage(windowRef, 'sessionStorage', DRAFT_KEY, null);
      announce('Draft cleared.');
      name.focus();
    });
  }
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((dispose) => dispose());
    if (activeContacts.get(documentRef) === cleanup) activeContacts.delete(documentRef);
  };
  activeContacts.set(documentRef, cleanup);
  return cleanup;
}
