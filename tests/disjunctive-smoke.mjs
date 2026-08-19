/**
 * Smoke test for the multi-select (disjunctive) color hierarchy widget.
 *
 *   npm run test:disjunctive
 *
 * Verifies the things that make it different from the single-select one:
 * nothing auto-expands, each level is fetched lazily with a scoped facet query,
 * selections OR together across depths, a parent supersedes its descendants,
 * and picking a color never invalidates the facet counts.
 */
import { createChecker } from './dom.mjs';
import { bootApp, sleep } from './harness.mjs';

const { check, state } = createChecker();
const { document, records, client, click, check: tick, type, $, $$, facetRequests } = await bootApp();

const PANEL = '#color-disjunctive';
const rows = (level) => $$(`${PANEL} .dch-node--l${level}`);
const rowFor = (value) => $(`${PANEL} [data-dch-toggle="${value}"]`)?.closest('.dch-node') ?? null;
const expanderFor = (value) => $(`${PANEL} [data-dch-expand="${value}"]`);
const countIn = (node) => Number(node?.querySelector('.dch-count')?.textContent ?? NaN);
const labelsAt = (level) => rows(level).map((node) => node.querySelector('.dch-text').textContent);

/** The last non-facet (hits) request the client saw. */
const lastHitsParams = () => client.calls.flat().filter((request) => !request.type).at(-1).params;
const nbHits = () => Number($('#stats').textContent.replace(/[^\d]/g, '').slice(0, -1) || 0);
const statedHits = () => Number($('#stats strong').textContent.replace(/,/g, ''));

/** Ground truth straight from the JSON, for count comparisons. */
const trueCount = (predicate) => records.filter(predicate).length;
const familyCount = (family) => trueCount((r) => r.color.lvl0 === family);

/* ---- 1. initial state ------------------------------------------- */

check('panel rendered', $(`${PANEL} .dch-tree`) !== null);
check('root level shows families', rows(0).length === 8, labelsAt(0).join(', '));
check('nothing is auto-expanded', rows(1).length === 0 && rows(2).length === 0);
check('root families in taxonomy order', labelsAt(0)[0] === 'Neutrals' && labelsAt(0)[1] === 'Greys',
  labelsAt(0).slice(0, 3).join(' | '));

const bootFacetCalls = facetRequests();
check('one facet query at boot', bootFacetCalls.length === 1, `${bootFacetCalls.length}`);
check('boot query facets the root attribute', bootFacetCalls[0].facet === 'color.lvl0',
  String(bootFacetCalls[0].facet));
check('boot query is unscoped', !bootFacetCalls[0].params.filters,
  JSON.stringify(bootFacetCalls[0].params.filters ?? null));

check('root counts match the data', countIn(rowFor('Blues')) === familyCount('Blues'),
  `Blues ${countIn(rowFor('Blues'))} vs ${familyCount('Blues')}`);

/* ---- 2. lazy fetch on expand ------------------------------------ */

click(expanderFor('Blues'));
await sleep(400);

const afterExpand = facetRequests();
const lvl1Request = afterExpand.at(-1);
check('expanding fetches exactly one more level', afterExpand.length === 2, `${afterExpand.length}`);
check('the fetch targets the child level', lvl1Request.facet === 'color.lvl1', String(lvl1Request.facet));
check('the fetch is scoped to the branch', lvl1Request.params.filters === 'color.lvl0:"Blues"',
  String(lvl1Request.params.filters));
check('children rendered under Blues', rows(1).length === 3, labelsAt(1).join(', '));
check('child counts match the data',
  countIn(rowFor('Blues > Chambray')) === trueCount((r) => r.color.lvl1 === 'Blues > Chambray'),
  `Chambray ${countIn(rowFor('Blues > Chambray'))}`);
check('sibling families stay collapsed', rowFor('Neutrals > Linen') === null);
check('aria-expanded set', expanderFor('Blues').getAttribute('aria-expanded') === 'true');

// Collapse + re-expand must not refetch (results are cached per query).
click(expanderFor('Blues'));
await sleep(120);
check('collapse hides children', rows(1).length === 0);
click(expanderFor('Blues'));
await sleep(250);
check('re-expanding uses the cache', facetRequests().length === 2, `${facetRequests().length}`);

/* ---- 3. selecting a color -------------------------------------- */

const countsBefore = labelsAt(0).map((label, i) => `${label}:${countIn(rows(0)[i])}`).join(',');
tick($(`${PANEL} [data-dch-toggle="Blues"]`));
await sleep(500);

check('selection filters the main query', lastHitsParams().filters === 'color.lvl0:"Blues"',
  String(lastHitsParams().filters));
check('hit count matches the family', statedHits() === familyCount('Blues'),
  `${statedHits()} vs ${familyCount('Blues')}`);
check('no facet refetch on selection', facetRequests().length === 2, `${facetRequests().length}`);
check('facet counts unchanged by our own selection',
  labelsAt(0).map((label, i) => `${label}:${countIn(rows(0)[i])}`).join(',') === countsBefore);
check('selected count shown', $(`${PANEL} .dch-meta`).textContent === '1 selected',
  $(`${PANEL} .dch-meta`).textContent);

/* ---- 4. parent supersedes descendants -------------------------- */

const chambrayBox = $(`${PANEL} [data-dch-toggle="Blues > Chambray"]`);
check('covered child is checked', chambrayBox.checked);
check('covered child is disabled', chambrayBox.disabled);
tick(chambrayBox);
await sleep(300);
check('clicking a covered child is a no-op', lastHitsParams().filters === 'color.lvl0:"Blues"',
  String(lastHitsParams().filters));

/* ---- 5. OR across depths --------------------------------------- */

click(expanderFor('Neutrals'));
await sleep(400);
check('second branch fetched on its own', facetRequests().at(-1).params.filters === 'color.lvl0:"Neutrals"',
  String(facetRequests().at(-1).params.filters));

tick($(`${PANEL} [data-dch-toggle="Neutrals > Linen"]`));
await sleep(500);

check('mixed-depth selection ORs together',
  lastHitsParams().filters === '(color.lvl0:"Blues" OR color.lvl1:"Neutrals > Linen")',
  String(lastHitsParams().filters));
check('hits equal the union',
  statedHits() === trueCount((r) => r.color.lvl0 === 'Blues' || r.color.lvl1 === 'Neutrals > Linen'),
  `${statedHits()} vs ${trueCount((r) => r.color.lvl0 === 'Blues' || r.color.lvl1 === 'Neutrals > Linen')}`);
check('parent of a selected child is indeterminate',
  $(`${PANEL} [data-dch-toggle="Neutrals"]`).indeterminate === true);

/* ---- 6. selecting a parent drops its descendants --------------- */

tick($(`${PANEL} [data-dch-toggle="Blues"]`)); // unselect Blues
await sleep(400);
tick($(`${PANEL} [data-dch-toggle="Blues > Chambray"]`)); // now selectable on its own
await sleep(400);
check('child-only selection uses the child attribute',
  lastHitsParams().filters ===
    '(color.lvl1:"Blues > Chambray" OR color.lvl1:"Neutrals > Linen")',
  String(lastHitsParams().filters));

tick($(`${PANEL} [data-dch-toggle="Blues"]`)); // re-select the parent
await sleep(400);
check('selecting the parent supersedes its child',
  lastHitsParams().filters === '(color.lvl0:"Blues" OR color.lvl1:"Neutrals > Linen")',
  String(lastHitsParams().filters));

/* ---- 7. leaf level -------------------------------------------- */

click(expanderFor('Neutrals > Linen'));
await sleep(400);
check('leaf level fetched with lvl2', facetRequests().at(-1).facet === 'color.lvl2',
  String(facetRequests().at(-1).facet));
check('leaf rows rendered', rows(2).length > 0, labelsAt(2).join(', '));
check('leaf rows are not expandable',
  rows(2).every((node) => node.querySelector('.dch-disclose--leaf') !== null));

/* ---- 8. routing ----------------------------------------------- */

await sleep(700); // the history router throttles URL writes
check('selection is in the URL', /disjunctiveColors/.test(document.location.search),
  decodeURIComponent(document.location.search).slice(0, 120));

/* ---- 9. query invalidates the counts -------------------------- */

const beforeQuery = facetRequests().length;
type('#searchbox .sb-input', 'velvet');
await sleep(700);

const afterQuery = facetRequests().slice(beforeQuery);
check('a new query refetches the open levels', afterQuery.length >= 2, `${afterQuery.length} refetches`);
check('refetches carry the query', afterQuery.every((request) => request.params.query === 'velvet'),
  afterQuery.map((r) => `${r.facet}:${r.params.query}`).join(' '));
check('counts follow the query',
  countIn(rowFor('Blues')) === trueCount((r) => r.color.lvl0 === 'Blues' && r.material === 'Performance Velvet'),
  `Blues now ${countIn(rowFor('Blues'))}`);
check('own selection still excluded from counts',
  facetRequests().slice(beforeQuery).every((request) => !/OR/.test(request.params.filters ?? '')),
  afterQuery.map((r) => r.params.filters ?? '-').join(' | '));

/* ---- 10. clearing --------------------------------------------- */

type('#searchbox .sb-input', '');
await sleep(600);
click($(`${PANEL} .dch-clear`));
await sleep(600);

check('clear removes the filter', !lastHitsParams().filters, String(lastHitsParams().filters));
check('clear resets the checkboxes', $$(`${PANEL} .dch-checkbox:checked`).length === 0);
check('all records back', statedHits() === records.length, `${statedHits()}`);
check('clear button hidden again', $(`${PANEL} .dch-clear`).hidden);
check('URL cleaned up', !/disjunctiveColors/.test(document.location.search),
  decodeURIComponent(document.location.search) || '(empty)');

/* ---- 11. global "Reset all" sees the filters-string refinement -- */

tick($(`${PANEL} [data-dch-toggle="Greys"]`));
await sleep(500);
check('reset-all enabled by a color-only selection',
  $('#clear-refinements button').disabled === false);

const callsBefore = client.calls.length;
const facetCallsBefore = facetRequests().length;
click($('#clear-refinements button'));
await sleep(700);
const searchCalls = client.calls
  .slice(callsBefore)
  .filter((batch) => batch.some((request) => !request.type)).length;

check('reset-all clears the color selection', $$(`${PANEL} .dch-checkbox:checked`).length === 0);
check('reset-all triggers a single search', searchCalls === 1, `${searchCalls} search batches`);
check('reset-all leaves no filter', !lastHitsParams().filters, String(lastHitsParams().filters));
// Only colors were selected, so the count signature never changed.
check('reset-all refetches no facets when only colors were selected',
  facetRequests().length === facetCallsBefore,
  `${facetRequests().length - facetCallsBefore} extra facet queries`);

console.log(state.failures === 0 ? '\nAll checks passed.' : `\n${state.failures} check(s) failed.`);
process.exit(state.failures === 0 ? 0 : 1);
