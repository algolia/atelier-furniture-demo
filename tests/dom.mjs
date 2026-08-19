/** Shared jsdom bootstrap: installs the globals InstantSearch expects. */
import { JSDOM } from 'jsdom';

export function installDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    // 'outside-only' gives us window.eval so a real Vite bundle can be run
    // inside the jsdom realm, without executing <script> tags from the page.
    runScripts: 'outside-only',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.history = dom.window.history;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.CustomEvent = dom.window.CustomEvent;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = clearTimeout;
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });

  return dom;
}

export function createChecker() {
  const state = { failures: 0 };
  const check = (label, condition, extra = '') => {
    if (!condition) state.failures += 1;
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  };
  return { check, state };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
