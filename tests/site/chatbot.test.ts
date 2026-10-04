import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, CHAT_LIMIT_KEY, ChatSession, getFallbackReply, initChatbot, renderMarkdown, sanitizeMarkdownHref, TOOLTIP_DISMISSED_KEY } from '../../src/scripts/chatbot';

afterEach(() => { sessionStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('portfolio chatbot rendering and source of truth', () => {
  it('only renders safe markup and allows known portfolio routes', () => {
    const markup = renderMarkdown('<img src=x onerror=alert(1)> [Projects](/projects/) [Bad](javascript:alert(1)) [Internal](/projects/classes369/) [CV](/assets/CV_bui_hai_duc.pdf) [External](https://example.com/?q=%22)');
    const root = document.createElement('div'); root.innerHTML = markup;
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelectorAll('a')).toHaveLength(4);
    expect(root.querySelector('a[href="/projects/"]')?.getAttribute('target')).toBeNull();
    expect(root.querySelector('a[href^="https:"]')?.getAttribute('rel')).toContain('noopener');
    for (const href of ['javascript:alert(1)', '//evil.example', '/\\evil.example', '/unknown/', 'data:text/html,x', 'https://example.com\n onclick=x']) expect(sanitizeMarkdownHref(href)).toBe('');
    expect(sanitizeMarkdownHref('/certificate')).toBe('/certificate');
    expect(sanitizeMarkdownHref('/projects/?q=Docker')).toBe('/projects/?q=Docker');
  });

  it('builds the prompt and local answers from portfolio data without fabricated testimonials or certificates', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('https://github.com/Duckcy-Bui');
    expect(prompt).toContain('AWS SBG Core Team Member Badge');
    expect(prompt).not.toContain('Google Cloud (self-learning');
    expect(prompt).not.toContain('Minh Tran');
    expect(getFallbackReply('Tell me about projects')).toContain('/projects/classes369/');
    expect(getFallbackReply('contact')).toContain('Duckcy-Bui');
    expect(getFallbackReply('chứng chỉ')).toContain('/certificate/');
  });
});

describe('chat widget behavior', () => {
  function fixture() {
    document.body.innerHTML = `<button id="chatbot-fab">Open</button><div id="chatbot-fab-tooltip" hidden><button id="chatbot-tooltip-close">Dismiss</button></div>
      <dialog id="chatbot-window"><button id="chatbot-close">Close</button><button id="chatbot-minimize"><svg class="icon-minimize"></svg><svg class="icon-maximize"></svg></button><div class="chatbot-messages"></div><div class="chatbot-suggestions"></div>
      <form id="chatbot-form"><textarea id="chatbot-input"></textarea><button id="chatbot-send">Send</button></form><button id="chatbot-reset">Clear</button></dialog>`;
    const dialog = document.getElementById('chatbot-window') as HTMLDialogElement;
    dialog.showModal = () => { dialog.setAttribute('open', ''); };
    dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
    return { dialog, input: document.getElementById('chatbot-input') as HTMLTextAreaElement, launcher: document.getElementById('chatbot-fab') as HTMLButtonElement };
  }

  it('restores the input after a stalled request and returns focus after closing', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const setup = fixture();
    const instance = initChatbot();
    setup.launcher.click();
    setup.input.value = 'Projects';
    document.getElementById('chatbot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(setup.input.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(15000);
    expect(setup.input.disabled).toBe(false);
    expect(document.activeElement).toBe(setup.input);
    expect(document.querySelector('.chatbot-messages')?.textContent).toContain('temporarily unavailable');
    document.getElementById('chatbot-close')!.click();
    expect(document.activeElement).toBe(setup.launcher);
    instance?.dispose();
  });

  it('stores one tooltip dismissal for subsequent page loads', async () => {
    vi.useFakeTimers();
    fixture();
    const first = initChatbot();
    await vi.advanceTimersByTimeAsync(4000);
    expect(document.getElementById('chatbot-fab-tooltip')?.hidden).toBe(false);
    document.getElementById('chatbot-tooltip-close')!.click();
    expect(sessionStorage.getItem(TOOLTIP_DISMISSED_KEY)).toBe('1');
    first?.dispose();
    fixture();
    const second = initChatbot();
    await vi.advanceTimersByTimeAsync(4000);
    expect(document.getElementById('chatbot-fab-tooltip')?.hidden).toBe(true);
    second?.dispose();
  });

  it('restores the old window controls without focusing a hidden input while minimized', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const setup = fixture();
    const instance = initChatbot();
    const minimize = document.getElementById('chatbot-minimize')!;
    setup.launcher.click();
    expect(setup.dialog.classList.contains('chatbot-window--open')).toBe(true);
    expect(setup.launcher.getAttribute('aria-expanded')).toBe('true');
    setup.input.value = 'Skills';
    document.getElementById('chatbot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    minimize.click();
    expect(setup.dialog.classList.contains('chatbot-window--minimized')).toBe(true);
    expect(minimize.getAttribute('aria-label')).toBe('Expand chat');
    await vi.advanceTimersByTimeAsync(15000);
    expect(document.activeElement).toBe(minimize);
    minimize.click();
    expect(setup.dialog.classList.contains('chatbot-window--minimized')).toBe(false);
    expect(document.activeElement).toBe(setup.input);
    document.getElementById('chatbot-close')!.click();
    expect(setup.launcher.getAttribute('aria-expanded')).toBe('false');
    expect(setup.launcher.classList.contains('chatbot-fab--hidden')).toBe(false);
    instance?.dispose();
  });
});

describe('chat session resilience and proxy contract', () => {
  it('invokes the default browser fetch with its global receiver', async () => {
    const receiverCheckedFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(JSON.stringify({ content: [{ type: 'text', text: 'Live reply' }] })));
    });
    vi.stubGlobal('fetch', receiverCheckedFetch);
    const session = new ChatSession({ storage: null });
    await expect(session.send('Projects?')).resolves.toBe('Live reply');
    expect(receiverCheckedFetch).toHaveBeenCalledOnce();
  });

  it('keeps the current proxy request shape and restores bounded history across native page loads', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Read [Projects](/projects/).' }] }), { status: 200 }));
    const session = new ChatSession({ storage: sessionStorage, fetcher });
    expect(await session.send('Projects?')).toBe('Read [Projects](/projects/).');
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://chatbot-proxy.ducbanca1604.workers.dev/');
    expect(options.method).toBe('POST');
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.max_tokens).toBe(1024);
    expect(body.messages).toEqual([{ role: 'user', content: 'Projects?' }]);
    const restored = new ChatSession({ storage: sessionStorage, fetcher });
    expect(restored.history).toEqual(session.history);
  });

  it('aborts after 15 seconds and returns a source-grounded fallback even if fetch never settles', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const fetcher = vi.fn((_url: string | URL | Request, options?: RequestInit) => { requestSignal = options?.signal; return new Promise<Response>(() => {}); });
    const session = new ChatSession({ storage: null, fetcher });
    const pending = session.send('Projects');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toContain('/projects/');
    expect(requestSignal?.aborted).toBe(true);
    expect(session.history.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['offline', () => Promise.reject(new Error('offline'))],
    ['non-OK', async () => new Response('{}', { status: 503 })],
    ['invalid response', async () => new Response('{bad', { status: 200 })],
    ['empty answer', async () => new Response(JSON.stringify({ content: [] }), { status: 200 })],
  ])('falls back on %s and completes the conversation', async (_name, fetcher) => {
    const session = new ChatSession({ storage: null, fetcher: fetcher as typeof fetch });
    expect(await session.send('contact')).toContain('duckcy.work@gmail.com');
    expect(session.history).toHaveLength(2);
  });

  it('preserves the ten-per-minute UI limit across page loads and clear conversation', async () => {
    const now = () => 100000;
    sessionStorage.setItem(CHAT_LIMIT_KEY, JSON.stringify(Array.from({ length: 9 }, () => 99999)));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'hello' }] })));
    const first = new ChatSession({ storage: sessionStorage, fetcher, now });
    await first.send('hello');
    first.clear();
    const reloaded = new ChatSession({ storage: sessionStorage, fetcher, now });
    await expect(reloaded.send('one more')).rejects.toThrow('Please wait');
    expect(fetcher).toHaveBeenCalledOnce();
    const expired = new ChatSession({ storage: sessionStorage, fetcher, now: () => 160001 });
    await expect(expired.send('window expired')).resolves.toBe('hello');
  });

  it('remains usable when storage throws or contains invalid history', async () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'reply' }] })));
    const session = new ChatSession({ storage, fetcher });
    await expect(session.send('hello')).resolves.toBe('reply');
    expect(session.history).toHaveLength(2);
    sessionStorage.setItem('chatbot-history', JSON.stringify([{ role: 'system', content: 'injected' }, { role: 'assistant', content: '<script>bad</script>' }, { role: 'user', content: 42 }]));
    const restored = new ChatSession({ storage: sessionStorage, fetcher });
    expect(restored.history).toEqual([{ role: 'assistant', content: '<script>bad</script>' }]);
  });
});
