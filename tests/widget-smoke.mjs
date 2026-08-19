/**
 * Smoke test for the custom color hierarchy widget.
 *
 *   npm test
 *
 * Drives connectHierarchicalMenu through jsdom against a stubbed search client
 * that computes facet counts from data/furniture-records.json — so it runs with
 * no Algolia credentials. The stub is deliberately naive (it applies every
 * facet filter when counting), so sibling counts are smaller than a real index
 * would return; the assertions only cover render/interaction behaviour.
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const dom = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.location = dom.window.location;
global.history = dom.window.history;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;

const records = JSON.parse(readFileSync(join(root, 'data', 'furniture-records.json'), 'utf8'));

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function matchesFilters(record, facetFilters = []) {
  return facetFilters.every((clause) => {
    const ors = Array.isArray(clause) ? clause : [clause];
    return ors.some((f) => {
      const [attr, value] = String(f).split(':');
      return String(getPath(record, attr)) === value;
    });
  });
}

const stubClient = {
  search(requests) {
    return Promise.resolve({
      results: requests.map(({ indexName, params = {} }) => {
        const filtered = records.filter((r) => matchesFilters(r, params.facetFilters));
        const facets = {};
        for (const attr of params.facets ?? []) {
          facets[attr] = {};
          for (const r of filtered) {
            const v = getPath(r, attr);
            if (v == null) continue;
            facets[attr][v] = (facets[attr][v] ?? 0) + 1;
          }
        }
        const hitsPerPage = params.hitsPerPage ?? 20;
        return {
          index: indexName,
          hits: filtered.slice(0, hitsPerPage),
          nbHits: filtered.length,
          page: params.page ?? 0,
          nbPages: Math.ceil(filtered.length / hitsPerPage),
          hitsPerPage,
          facets,
          exhaustiveNbHits: true,
          query: params.query ?? '',
          params: '',
          processingTimeMS: 1,
        };
      }),
    });
  },
};

// Node can't resolve Vite-style directory imports; rewrite them for the test copy.
import { writeFileSync, unlinkSync } from 'node:fs';
const widgetSrc = readFileSync(join(root, 'src', 'widgets', 'colorHierarchyMenu.js'), 'utf8').replace(
  "instantsearch.js/es/connectors'",
  "instantsearch.js/es/connectors/index.js'"
);
const copyPath = join(root, 'src', 'widgets', '__smoke_copy.js');
writeFileSync(copyPath, widgetSrc);

const isMod = await import('instantsearch.js');
const instantsearch = typeof isMod.default === 'function' ? isMod.default : isMod.default.default;
const { colorHierarchyMenu } = await import(`file://${copyPath}`);
unlinkSync(copyPath);

const search = instantsearch({ indexName: 'furniture', searchClient: stubClient });
search.addWidgets([
  colorHierarchyMenu({
    container: '#c',
    attributes: ['color.lvl0', 'color.lvl1', 'color.lvl2'],
    title: 'Color',
    limit: 6,
    showMore: true,
    showMoreLimit: 20,
  }),
]);
search.start();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = document.querySelector('#c');
let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
};

await sleep(300);

const families = [...el.querySelectorAll('.chm-node--l0')];
check('root families rendered (limit 6)', families.length === 6, `${families.length} nodes`);
check('swatch colors resolved', !/--chm-swatch: #CCCCCC/.test(el.innerHTML));
check('meta count shown', /families/.test(el.querySelector('.chm-meta').textContent));
check('clear hidden initially', el.querySelector('.chm-clear').hidden);
check('show-more label', el.querySelector('.chm-showmore').textContent.includes('Show all'));

// show more
el.querySelector('.chm-showmore').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(200);
check('show more expands to 8 families', el.querySelectorAll('.chm-node--l0').length === 8,
  `${el.querySelectorAll('.chm-node--l0').length}`);

// refine a family
const first = el.querySelector('.chm-node--l0 [data-chm-refine]');
const firstValue = first.dataset.chmRefine;
check('href present for middle-click', first.hasAttribute('href'), `routing off -> "${first.getAttribute('href')}"`);
first.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(300);

check('family refined', el.querySelector('.chm-node--l0.is-refined') !== null);
check('sub-families revealed', el.querySelectorAll('.chm-node--l1').length > 0,
  `${el.querySelectorAll('.chm-node--l1').length} lvl1`);
check('selection label updated', el.querySelector('.chm-selection').textContent.trim() === firstValue);
check('clear now visible', el.querySelector('.chm-clear').hidden === false);

// refine a sub-family -> chips at leaf level
const shade = el.querySelector('.chm-node--l1 [data-chm-refine]');
shade.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(300);
check('leaf level renders chips', el.querySelectorAll('.chm-chip').length > 0,
  `${el.querySelectorAll('.chm-chip').length} chips`);

// collapse the refined branch
const disclose = el.querySelector('.chm-node--l0.is-refined > .chm-row > .chm-disclose');
disclose.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(120);
check('collapse hides children', el.querySelectorAll('.chm-node--l1').length === 0);
check('aria-expanded=false after collapse',
  el.querySelector('.chm-node--l0.is-refined .chm-disclose').getAttribute('aria-expanded') === 'false');
// the tree is rebuilt on collapse, so re-query the (new) button
el.querySelector('.chm-node--l0.is-refined > .chm-row > .chm-disclose')
  .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(120);
check('expand restores children', el.querySelectorAll('.chm-node--l1').length > 0);

// refine a leaf chip
const chip = el.querySelector('.chm-chip');
chip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(300);
check('leaf chip refines', el.querySelector('.chm-chip.is-refined') !== null);
check(
  'selection shows the finish label (leaf only)',
  el.querySelector('.chm-chip.is-refined').textContent.includes(
    el.querySelector('.chm-selection').textContent.trim()
  ),
  el.querySelector('.chm-selection').textContent.trim()
);

// clear
el.querySelector('.chm-clear').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(300);
check('clear removes all color refinements', el.querySelector('.chm-node.is-refined') === null);
check('back to All colors', el.querySelector('.chm-selection').textContent.includes('All colors'));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
