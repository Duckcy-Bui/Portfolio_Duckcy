// @ts-nocheck
// Bootstrap preserves the original engine's transferable overlay session lifecycle.
import gameStylesheetUrl from '../../game/fc-overlay.css?url';

export function initGameLoader(options = {}) {
  const INTENT_KEY = "cloud-rescue:intent";
  const LOAD_TIMEOUT_MS = options.loadTimeoutMs ?? 10000;
  const loadEngine = options.loadEngine ?? (() => import("../../game/fc-engine.js"));
  const STYLESHEET_PATH = options.stylesheetUrl ?? gameStylesheetUrl;
  const CLOSE_LABEL = "Close Deploy Before Dawn: Cloud Rescue";

    const cta = document.querySelector(".cr-cta");
    const root = document.getElementById("cloud-rescue-root");
    if (!cta || !root) return;

    const readIntent = () => {
      try { return sessionStorage.getItem(INTENT_KEY); } catch { return null; }
    };
    const rememberIntent = () => {
      try { sessionStorage.setItem(INTENT_KEY, "open"); } catch { /* Storage is optional. */ }
    };
    const clearIntent = () => {
      try { sessionStorage.removeItem(INTENT_KEY); } catch { /* Storage is optional. */ }
    };

    let generation = 0;
    let activationPending = false;
    let loadedEngine = null;
    let modulePromise = null;
    let cssLink = null;
    let cssPromise = null;
    let cssCancel = null;
    let cssReady = false;
    let activeSession = null;
    let loadingAbortController = null;
    let activeDeadline = null;
    let criticalStyle = null;

    function typedError(code, message, cause) {
      const error = new Error(message, cause ? { cause } : undefined);
      error.code = code;
      return error;
    }

    function capabilitySupported() {
      try {
        if (options.capabilitySupported) return options.capabilitySupported();
        const scratch = document.createElement("canvas");
        return typeof scratch.getContext === "function" && Boolean(scratch.getContext("2d"));
      } catch {
        return false;
      }
    }

    function showUnavailable() {
      cta.disabled = true;
      cta.setAttribute("aria-disabled", "true");
      let status = cta.parentElement?.querySelector("[data-fc-unavailable]");
      if (!status) {
        status = document.createElement("span");
        status.dataset.fcUnavailable = "true";
        status.className = "cr-unavailable-message";
        status.setAttribute("role", "status");
        cta.insertAdjacentElement("afterend", status);
      }
      status.textContent = "This browser does not support the mini-game.";
      clearIntent();
    }

    function captureStyles(element, properties) {
      return Object.fromEntries(properties.map((property) => [property, element.style.getPropertyValue(property)]));
    }

    function restoreStyles(element, values) {
      for (const [property, value] of Object.entries(values)) {
        if (value) element.style.setProperty(property, value);
        else element.style.removeProperty(property);
      }
      if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
    }

    function createBootstrapOverlaySession(trigger) {
      const body = document.body;
      const html = document.documentElement;
      const scrollX = Number.isFinite(window.scrollX) ? window.scrollX : 0;
      const scrollY = Number.isFinite(window.scrollY) ? window.scrollY : 0;
      const activeElement = document.activeElement;
      const bodyProperties = ["position", "top", "left", "right", "width", "overflow", "padding-right"];
      const siblingSnapshots = [...(root.parentElement?.children || [])]
        .filter((node) => node !== root)
        .map((node) => ({
          node,
          inertSupported: "inert" in node,
          inert: "inert" in node ? Boolean(node.inert) : undefined,
          ariaHidden: node.getAttribute("aria-hidden"),
        }));
      const snapshot = Object.freeze({
        activeElement,
        scrollX,
        scrollY,
        bodyStyles: Object.freeze(captureStyles(body, bodyProperties)),
        htmlStyles: Object.freeze(captureStyles(html, ["overflow"])),
        bodyHadClass: body.classList.contains("cr-game-open"),
        siblingSnapshots,
      });
      let owner = "bootstrap";
      let transferred = false;
      let restoreCount = 0;

      body.classList.add("cr-game-open");
      body.style.position = "fixed";
      body.style.top = `${-scrollY}px`;
      body.style.left = `${-scrollX}px`;
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
      const documentWidth = Number.isFinite(html.clientWidth) ? html.clientWidth : 0;
      const scrollbarWidth = documentWidth > 0 ? Math.max(0, viewportWidth - documentWidth) : 0;
      if (scrollbarWidth > 0) {
        const currentPadding = Number.parseFloat(window.getComputedStyle?.(body)?.paddingRight || "0") || 0;
        body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
      html.style.overflow = "hidden";
      for (const entry of siblingSnapshots) {
        if (entry.inertSupported) entry.node.inert = true;
        else entry.node.setAttribute("aria-hidden", "true");
      }

      return {
        snapshot,
        trigger,
        transferToEngine() {
          if (owner === "restored") throw typedError("SESSION_RESTORED", "OverlaySession was already restored.");
          if (!transferred) {
            transferred = true;
            owner = "engine";
          }
          return owner === "engine";
        },
        restore(requester = owner) {
          if (owner === "restored" || requester !== owner) return false;
          for (const entry of siblingSnapshots) {
            if (entry.inertSupported) entry.node.inert = entry.inert;
            if (entry.ariaHidden === null) entry.node.removeAttribute("aria-hidden");
            else entry.node.setAttribute("aria-hidden", entry.ariaHidden);
          }
          restoreStyles(body, snapshot.bodyStyles);
          restoreStyles(html, snapshot.htmlStyles);
          if (!snapshot.bodyHadClass) body.classList.remove("cr-game-open");
          try { window.scrollTo(scrollX, scrollY); } catch { /* Some webviews disallow scrollTo. */ }
          const focusTarget = trigger?.isConnected ? trigger : activeElement?.isConnected ? activeElement : document.querySelector("h1, h2");
          try { focusTarget?.focus?.({ preventScroll: true }); } catch { focusTarget?.focus?.(); }
          owner = "restored";
          restoreCount += 1;
          return true;
        },
        get owner() { return owner; },
        get restoreCount() { return restoreCount; },
        get locked() { return owner !== "restored"; },
      };
    }

    function ensureCriticalStyle() {
      if (criticalStyle?.isConnected) return criticalStyle;
      criticalStyle = document.createElement("style");
      criticalStyle.setAttribute("data-fc-loading-critical", "true");
      criticalStyle.textContent = `
        #cloud-rescue-root { position: fixed; inset: 0; z-index: 10000; overflow: hidden; }
        #cloud-rescue-root .cr-loading-shell { position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; overflow: auto; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); color: #f8fafc; background: #080b1b; opacity: 1; transition: opacity 240ms ease; font-family: "Urbanist", system-ui, sans-serif; }
        #cloud-rescue-root .cr-loading-shell h2 { font-family: "Space Grotesk", "Urbanist", system-ui, sans-serif; }
        #cloud-rescue-root .cr-loading-shell button { min-width: 44px; min-height: 44px; border: 1px solid #aab6d3; border-radius: 999px; padding: 10px 18px; color: #f8fafc; background: #11182e; font: inherit; font-weight: 700; }
        #cloud-rescue-root .cr-loading-shell .cr-close { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); width: 44px; height: 44px; padding: 0; font-size: 24px; }
        #cloud-rescue-root .cr-loading-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        #cloud-rescue-root .cr-loading-shell :focus-visible { outline: 3px solid #7dd3fc; outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) { #cloud-rescue-root .cr-loading-shell { transition-duration: 0ms; } }
      `;
      document.head.appendChild(criticalStyle);
      return criticalStyle;
    }

    function removeCriticalStyle() {
      criticalStyle?.remove();
      criticalStyle = null;
    }

    function abortLoadingTrap() {
      loadingAbortController?.abort();
      loadingAbortController = null;
    }

    function focusables(container) {
      return [...container.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hidden);
    }

    function installLoadingTrap(shell) {
      abortLoadingTrap();
      loadingAbortController = new AbortController();
      const signal = loadingAbortController.signal;
      shell.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          abandonBootstrapSession("escape");
          return;
        }
        if (event.key !== "Tab") return;
        const elements = focusables(shell);
        if (elements.length === 0) return;
        event.preventDefault();
        const current = elements.indexOf(document.activeElement);
        const offset = event.shiftKey ? -1 : 1;
        const next = (current + offset + elements.length) % elements.length;
        elements[next].focus();
      }, { signal });
    }

    function shellMarkup(kind, error) {
      const loading = kind === "loading";
      const message = error?.code === "LOAD_TIMEOUT"
        ? "Cloud Rescue could not finish loading. Please retry."
        : error
          ? "Cloud Rescue is temporarily unavailable. Your portfolio is unchanged."
          : "Loading mini-game…";
      return `<div class="cr-loading-shell" role="dialog" aria-modal="true" aria-labelledby="cr-loading-title" aria-describedby="cr-loading-status" aria-busy="${loading ? "true" : "false"}">
        <button type="button" class="cr-close" data-loading-action="close" aria-label="${CLOSE_LABEL}">×</button>
        <h2 id="cr-loading-title" tabindex="-1">Deploy Before Dawn: Cloud Rescue</h2>
        <p id="cr-loading-status" role="${error ? "alert" : "status"}">${message}</p>
        <div class="cr-loading-actions">
          ${error ? '<button type="button" data-loading-action="retry">Retry</button>' : ''}
          <button type="button" data-loading-action="back">Back to Portfolio</button>
        </div>
      </div>`;
    }

    function abandonBootstrapSession(reason = "back") {
      generation += 1;
      activationPending = false;
      activeDeadline?.cancel();
      activeDeadline = null;
      abortLoadingTrap();
      if (!cssReady) {
        const cancelCss = cssCancel;
        cssCancel = null;
        const pendingLink = cssLink;
        cssLink = null;
        cssPromise = null;
        cancelCss?.();
        pendingLink?.remove();
      }
      root.replaceChildren();
      root.hidden = true;
      removeCriticalStyle();
      if (activeSession?.owner === "bootstrap") activeSession.restore("bootstrap");
      activeSession = null;
      clearIntent();
      return reason;
    }

    function mountBootstrapView(kind, error = null) {
      ensureCriticalStyle();
      root.hidden = false;
      root.innerHTML = shellMarkup(kind, error);
      const shell = root.querySelector(".cr-loading-shell");
      installLoadingTrap(shell);
      shell.addEventListener("click", (event) => {
        const action = event.target.closest?.("[data-loading-action]")?.dataset.loadingAction;
        if (action === "retry") beginAttempt();
        else if (action === "close" || action === "back") abandonBootstrapSession(action);
      }, { signal: loadingAbortController.signal });
      const initialFocus = error ? shell.querySelector("[data-loading-action='retry']") : shell.querySelector("#cr-loading-title");
      try { initialFocus?.focus?.({ preventScroll: true }); } catch { initialFocus?.focus?.(); }
    }

    function ensureStylesheet() {
      if (cssReady && cssLink?.isConnected) return Promise.resolve(cssLink);
      if (cssPromise) return cssPromise;
      const link = document.querySelector('link[data-fc-game-resource="styles"]') || document.createElement("link");
      const shouldAppend = !link.isConnected;
      if (shouldAppend) {
        link.rel = "stylesheet";
        link.href = STYLESHEET_PATH;
        link.dataset.fcGameResource = "styles";
      }
      let cancelRequest = null;
      const pending = new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          link.removeEventListener("load", onLoad);
          link.removeEventListener("error", onError);
        };
        const settle = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };
        const onLoad = () => settle(resolve, link);
        const onError = () => settle(reject, typedError("CSS_LOAD_FAILED", "Cloud Rescue styles failed to load."));
        cancelRequest = () => settle(reject, typedError("STALE_LOAD", "Cancelled stale stylesheet load."));
        if (link.sheet) { settle(resolve, link); return; }
        link.addEventListener("load", onLoad);
        link.addEventListener("error", onError);
      });
      let attemptPromise;
      attemptPromise = pending.then((loadedLink) => {
        if (cssLink === link) {
          cssReady = true;
          cssCancel = null;
        }
        return loadedLink;
      }).catch((error) => {
        if (cssLink === link) {
          cssPromise = null;
          cssCancel = null;
          cssReady = false;
          cssLink = null;
        }
        link.remove();
        throw error;
      });
      cssLink = link;
      cssPromise = attemptPromise;
      cssCancel = cancelRequest;
      if (shouldAppend) document.head.appendChild(link);
      return attemptPromise;
    }

    function ensureModule() {
      if (loadedEngine) return Promise.resolve(loadedEngine);
      if (!modulePromise) {
        modulePromise = loadEngine()
          .then((engine) => { loadedEngine = engine; return engine; })
          .catch((error) => { modulePromise = null; throw typedError("MODULE_LOAD_FAILED", "Cloud Rescue module failed to load.", error); });
      }
      return modulePromise;
    }

    function deadlinePromise(start, token) {
      let timeoutId = null;
      let cancelled = false;
      const promise = new Promise((_, reject) => {
        const check = () => {
          if (cancelled) return;
          if (token !== generation) { reject(typedError("STALE_LOAD", "Stale game load.")); return; }
          const remaining = start + LOAD_TIMEOUT_MS - performance.now();
          if (remaining <= 0) { reject(typedError("LOAD_TIMEOUT", "Cloud Rescue took longer than 10 seconds to load.")); return; }
          timeoutId = window.setTimeout(check, Math.min(remaining, 250));
        };
        timeoutId = window.setTimeout(check, LOAD_TIMEOUT_MS);
      });
      return {
        promise,
        cancel() { cancelled = true; if (timeoutId !== null) window.clearTimeout(timeoutId); },
      };
    }

    function handoffToEngine(engine, token) {
      if (token !== generation || !activationPending || activeSession?.owner !== "bootstrap") return;
      abortLoadingTrap();
      const session = activeSession;
      try {
        engine.open({
          root,
          trigger: cta,
          overlaySession: session,
          onClose: () => {
            clearIntent();
            activationPending = false;
            activeSession = null;
            removeCriticalStyle();
          },
        });
        activationPending = false;
        clearIntent();
        queueMicrotask(removeCriticalStyle);
      } catch (error) {
        if (session.owner === "bootstrap") session.restore("bootstrap");
        activeSession = null;
        activationPending = true;
        try { activeSession = createBootstrapOverlaySession(cta); } catch { activeSession = null; }
        if (activeSession) mountBootstrapView("error", typedError("ENGINE_OPEN_FAILED", "Cloud Rescue could not open.", error));
        else abandonBootstrapSession("open-error");
      }
    }

    function beginAttempt() {
      if (!activeSession || activeSession.owner !== "bootstrap") return;
      const token = ++generation;
      activationPending = true;
      mountBootstrapView("loading");
      const start = performance.now();
      activeDeadline?.cancel();
      const deadline = deadlinePromise(start, token);
      activeDeadline = deadline;
      const resources = Promise.all([ensureModule(), ensureStylesheet()]);
      Promise.race([resources, deadline.promise])
        .then(([engine]) => {
          deadline.cancel();
          if (activeDeadline === deadline) activeDeadline = null;
          if (token !== generation) throw typedError("STALE_LOAD", "Stale game load.");
          handoffToEngine(engine, token);
        })
        .catch((error) => {
          deadline.cancel();
          if (activeDeadline === deadline) activeDeadline = null;
          if (token !== generation || error?.code === "STALE_LOAD") return;
          generation += 1;
          activationPending = true;
          mountBootstrapView("error", error);
        });
    }

    function activate() {
      if (activationPending || loadedEngine?.isOpen?.()) return;
      if (!capabilitySupported()) { showUnavailable(); return; }
      rememberIntent();
      activeSession = createBootstrapOverlaySession(cta);
      beginAttempt();
    }

    // Native button activation already maps click, Enter, Space, and tap to one event.
    cta.addEventListener("click", activate);

    // A stale crash intent is never treated as a fresh user activation.
    if (readIntent() === "open") clearIntent();
    const close = () => {
      if (loadedEngine?.isOpen?.()) loadedEngine.close("navigation");
      else if (activeSession) abandonBootstrapSession("navigation");
    };
    window.addEventListener("pagehide", close);
    return {
      activate,
      close,
      dispose() {
        close();
        cta.removeEventListener("click", activate);
        window.removeEventListener("pagehide", close);
      },
    };
}
