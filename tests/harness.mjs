/**
 * Boots the real app (index.html + src/search.js) in jsdom against the stub
 * search client, so tests exercise the same bundle a browser would get.
 *
 * src/search.js is compiled by Vite into an IIFE and evaluated inside the jsdom
 * realm: closer to production than an SSR transform, and it avoids Node's
 * CJS/ESM interop differences with algoliasearch-helper.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installDom, sleep } from './dom.mjs';
import { createStubClient } from './stub-client.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function bootApp({ indexName = 'furniture', settle = 600 } = {}) {
  const dom = installDom(readFileSync(join(root, 'index.html'), 'utf8'));

  const records = JSON.parse(readFileSync(join(root, 'data', 'furniture-records.json'), 'utf8'));
  const client = createStubClient(records);

  const { build } = await import('vite');
  const outDir = join(root, 'node_modules', '.cache', 'app-smoke');

  await build({
    root,
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: join(root, 'src', 'search.js'),
        formats: ['iife'],
        name: 'AppSearch',
        fileName: () => 'app-search.js',
      },
    },
  });

  dom.window.eval(readFileSync(join(outDir, 'app-search.js'), 'utf8'));

  const search = dom.window.AppSearch.createFurnitureSearch({ searchClient: client, indexName });
  search.start();
  await sleep(settle);

  const click = (target) => {
    if (!target) throw new Error('click(): no element');
    target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  };

  /** Ticking a checkbox: flip the property, then fire `change` like a browser. */
  const check = (target) => {
    if (!target) throw new Error('check(): no element');
    target.checked = !target.checked;
    target.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };

  const type = (selector, value) => {
    const input = dom.window.document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };

  return {
    dom,
    document: dom.window.document,
    records,
    client,
    search,
    click,
    check,
    type,
    $: (selector) => dom.window.document.querySelector(selector),
    $$: (selector) => [...dom.window.document.querySelectorAll(selector)],
    /** Requests the widget sent to the facet-search endpoint. */
    facetRequests: () =>
      client.calls.flat().filter((request) => request.type === 'facet'),
  };
}

export { sleep };
