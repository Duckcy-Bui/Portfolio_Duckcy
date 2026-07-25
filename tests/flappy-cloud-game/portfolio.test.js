import { afterEach, describe, expect, it } from 'vitest';
import {
  close,
  createInitialState,
  createOverlaySession,
  open,
  renderCanvas,
} from '../../game/fc-engine.js';
import { createFakeClock, createFakeMediaQueryList, makePlayingState } from './test-helpers.js';

function portfolioFixture() {
  document.title = 'Duckcy Portfolio';
  history.replaceState({ section: 'projects', preserved: true }, '', '#projects');
  document.documentElement.dataset.theme = 'outer-space';
  document.body.className = 'portfolio chatbot-open';
  document.body.style.setProperty('--portfolio-state', 'preserve');
  document.body.innerHTML = `<nav><a id="nav" href="#contact" aria-current="page">Contact</a></nav>
    <a id="cv" href="assets/CV_bui_hai_duc.pdf?v=20260709-opt1" target="_blank" rel="noreferrer">Download CV</a>
    <button id="trigger" class="cr-cta">Play Game</button>
    <form><input id="contact" value="candidate message"></form>
    <div id="chatbot" data-open="true" data-history="question|answer">Chat history</div>
    <div id="cloud-rescue-root" hidden></div>`;
  const trigger = document.getElementById('trigger');
  trigger.focus();
  return { root: document.getElementById('cloud-rescue-root'), trigger };
}

function snapshot() {
  const cv = document.getElementById('cv');
  const nav = document.getElementById('nav');
  const chatbot = document.getElementById('chatbot');
  return {
    title: document.title,
    href: location.href,
    hash: location.hash,
    historyState: structuredClone(history.state),
    historyLength: history.length,
    htmlTheme: document.documentElement.dataset.theme,
    bodyClass: document.body.className,
    bodyStyle: document.body.getAttribute('style'),
    formValue: document.getElementById('contact').value,
    chatbotOpen: chatbot.dataset.open,
    chatbotHistory: chatbot.dataset.history,
    chatbotText: chatbot.textContent,
    navHref: nav.getAttribute('href'),
    navCurrent: nav.getAttribute('aria-current'),
    cvHref: cv.getAttribute('href'),
    cvTarget: cv.getAttribute('target'),
    cvRel: cv.getAttribute('rel'),
  };
}

function fakeEnv() {
  const clock = createFakeClock();
  const media = createFakeMediaQueryList(false);
  return {
    clock,
    env: {
      now: clock.now,
      requestFrame: clock.requestAnimationFrame,
      cancelFrame: clock.cancelAnimationFrame,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      matchMedia: () => media,
      createResizeObserver: () => null,
      devicePixelRatio: 1,
      innerWidth: 960,
      innerHeight: 720,
    },
  };
}

function expectPreserved(before, trigger) {
  expect(snapshot()).toEqual(before);
  expect(document.activeElement).toBe(trigger);
  const root = document.getElementById('cloud-rescue-root');
  expect(root.hidden).toBe(true);
  expect(root.children).toHaveLength(0);
}

afterEach(() => {
  close('portfolio-cleanup');
  history.replaceState(null, '', location.pathname);
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
});

describe('Portfolio state preservation', () => {
  it.each([
    ['normal close', createInitialState()],
    ['gate collision', { ...createInitialState(), phase: 'CRASHED', lastFailure: 'gate' }],
    ['bug collision', { ...createInitialState(), phase: 'CRASHED', lastFailure: 'bug' }],
    ['bottom collision', { ...createInitialState(), phase: 'CRASHED', lastFailure: 'fell-out' }],
  ])('preserves navigation/theme/form/chatbot/CV/history on %s', (_label, state) => {
    const { root, trigger } = portfolioFixture();
    const before = snapshot();
    const { env } = fakeEnv();
    const session = createOverlaySession({ root, trigger });
    open({ root, trigger, state, env, overlaySession: session });
    root.querySelector('.cr-close').click();
    expect(session.restoreCount).toBe(1);
    expectPreserved(before, trigger);
  });

  it('preserves the same snapshot after a runtime-render error and Back', () => {
    const { root, trigger } = portfolioFixture();
    const before = snapshot();
    const { env, clock } = fakeEnv();
    const session = createOverlaySession({ root, trigger });
    let calls = 0;
    const renderer = (...args) => {
      calls += 1;
      if (calls > 1) throw new Error('injected runtime failure');
      return renderCanvas(...args);
    };
    open({ root, trigger, state: makePlayingState(), env, overlaySession: session, renderer });
    clock.flushFrame(16.7);
    root.querySelector('[data-action="BACK"]').click();
    expect(session.restoreCount).toBe(1);
    expectPreserved(before, trigger);
  });
});
