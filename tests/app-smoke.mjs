/**
 * End-to-end-ish smoke test for the whole widget wiring in src/search.js.
 *
 *   npm run test:app
 *
 * Loads the real index.html into jsdom and drives the compiled app with the
 * stub search client — no Algolia credentials needed.
 */
import { createChecker } from './dom.mjs';
import { bootApp, sleep } from './harness.mjs';

const { check, state } = createChecker();
const { dom, document, client, click, type, $, $$ } = await bootApp();

/* ---- chrome ------------------------------------------------------ */
check('search box rendered', $('#searchbox .sb-input') !== null);
check('stats rendered', /pieces/.test($('#stats').textContent), $('#stats').textContent.trim());
check('sort options wired', $$('#sort-by option').length === 3);
check('hits-per-page wired', $$('#hits-per-page option').length === 3);

/* ---- results grid ----------------------------------------------- */
const cards = $$('#hits .card');
check('24 cards rendered', cards.length === 24, `${cards.length} cards`);
check('card name present', cards[0]?.querySelector('.card__name')?.textContent.trim().length > 0);
check('card price formatted', /^\$[\d,]+/.test(cards[0]?.querySelector('.card__price')?.textContent.trim()),
  cards[0]?.querySelector('.card__price')?.textContent.trim());
check('card color path shown', /›/.test(cards[0]?.querySelector('.card__colorpath')?.textContent ?? ''),
  cards[0]?.querySelector('.card__colorpath')?.textContent.trim());
check('card swatch tinted', /--dot: #/.test(cards[0]?.querySelector('.card__dot')?.getAttribute('style') ?? ''));
check('room glyph drawn', ($('#hits .card__glyph path') !== null));
check('snippet rendered', ($('#hits .card__desc')?.textContent.trim().length ?? 0) > 10);

/* ---- facets ------------------------------------------------------ */
check('color families rendered', $$('#color-disjunctive .dch-node--l0').length === 8,
  `${$$('#color-disjunctive .dch-node--l0').length}`);
check('single-select color facet is disabled', $('#color-hierarchy') === null);
check('room hierarchy rendered', $$('#categories .hm-item').length > 0);
check('type refinement list rendered', $$('#type .rl-item').length > 0);
check('material refinement list rendered', $$('#material .rl-item').length > 0);
check('collection refinement list rendered', $$('#collection .rl-item').length > 0);
check('price range inputs rendered', $$('#price .range-input').length === 2);
check('rating menu rendered', $$('#rating .rating-item').length > 0);
check('toggles rendered', $$('.panel--toggles .toggle__box').length === 3);
check('pagination rendered', $$('#pagination .pg-item').length > 0);

/* ---- interaction: query ----------------------------------------- */
type('#searchbox .sb-input', 'linen');
await sleep(600);
check('query narrows results', Number($('#stats').textContent.replace(/[^\d]/g, '').slice(0, 3)) > 0);
check('highlight marks applied', $('#hits mark') !== null);

/* ---- interaction: pick a color ---------------------------------- */

type('#searchbox .sb-input', '');
await sleep(500);

const family = $('#color-disjunctive .dch-node--l0 [data-dch-toggle]');
const familyName = family.dataset.dchToggle;
family.checked = true;
family.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await sleep(600);

check('color refinement applied', $('#color-disjunctive .dch-node--l0.is-selected') !== null);
check('reset-all enables for a filters-string refinement',
  $('#clear-refinements button').disabled === false);
check('colors are absent from the chips row (currentRefinements is refinement-based)',
  !$('#current-refinements').textContent.includes(familyName),
  $('#current-refinements').textContent.replace(/\s+/g, ' ').trim() || '(empty)');
check('all visible hits are in the family',
  $$('#hits .card').every((card) => card.querySelector('.card__colorpath').textContent.includes(familyName)),
  familyName);

/* ---- interaction: sort replica ---------------------------------- */
const sortSelect = $('#sort-by select');
sortSelect.value = 'furniture_price_asc';
sortSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await sleep(600);
// The replica sorts on `price`, but a card displays `salePrice` when on sale —
// so check the request hit the replica, and that the non-sale cards ascend.
const lastIndexes = client.calls.at(-1).map((request) => request.indexName);
check('sort switches to the price replica', lastIndexes.includes('furniture_price_asc'),
  lastIndexes.join(', '));

const listPrices = $$('#hits .card')
  .filter((card) => !card.querySelector('.card__was'))
  .map((card) =>
    Number((card.querySelector('.card__price').textContent.match(/\$([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''))
  );
check('non-sale cards ascend by price', listPrices.every((p, i) => i === 0 || listPrices[i - 1] <= p),
  listPrices.slice(0, 5).join(' ≤ '));

/* ---- clear all --------------------------------------------------- */
click($('#clear-refinements button'));
await sleep(600);
check('reset clears color refinement', $('#color-disjunctive .dch-node.is-selected') === null);

console.log(state.failures === 0 ? '\nAll checks passed.' : `\n${state.failures} check(s) failed.`);
process.exit(state.failures === 0 ? 0 : 1);
