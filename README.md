# Atelier — furniture search demo

A single-page furniture catalog built with **vanilla [InstantSearch.js](https://www.algolia.com/doc/guides/building-search-ui/what-is-instantsearch/js/)** (no React) and **Vite**.

The point of the demo is the **color facet**: furniture colors are modelled as a
three-level hierarchy — family → sub-family → finish — and rendered by two
*custom* widgets:

| Widget | Built with | Selection | Mounted |
| --- | --- | --- | --- |
| [`disjunctiveColorHierarchy`](src/widgets/disjunctiveColorHierarchy.js) | the custom widget API (no connector) | many paths, any depth, OR'd | yes |
| [`colorHierarchyMenu`](src/widgets/colorHierarchyMenu.js) | `connectHierarchicalMenu` (connector reuse) | one path at a time | commented out in [search.js](src/search.js) |

The multi-select facet is the live one; **[disjunctive-hierarchy.md](disjunctive-hierarchy.md)
explains how it works, what it sends to Algolia, and what it costs**. The
single-select widget is kept and still works — uncomment its block in
`src/search.js` (and the matching panel in `index.html`) to compare the two
patterns. With both mounted they act as two independent filters and AND together.

```
color.lvl0   Blues
color.lvl1   Blues > Chambray
color.lvl2   Blues > Chambray > Powder Blue
```

---

## Quick start

```bash
npm install
cp .env.example .env          # add your credentials
npm run generate              # writes data/furniture-records.json (304 records)
npm run push                  # uploads records + settings + price replicas
npm run dev                   # http://localhost:5173
```

`npm run generate` is optional — `data/furniture-records.json` is already
committed. Regenerating is deterministic (seeded PRNG), so the file only changes
when you change the catalog definition.

### Environment

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_ALGOLIA_APP_ID` | browser | anything `VITE_`-prefixed is bundled into the client |
| `VITE_ALGOLIA_SEARCH_KEY` | browser | **search-only** key |
| `VITE_ALGOLIA_INDEX_NAME` | browser | defaults to `furniture` |
| `ALGOLIA_APP_ID` / `ALGOLIA_ADMIN_KEY` / `ALGOLIA_INDEX_NAME` | `npm run push` | admin key, never shipped to the browser |

Without credentials the app still boots and shows a setup panel instead of results.

### Importing by hand instead

1. Create an index and import `data/furniture-records.json` (Dashboard → Index → *Add records* → *Upload file*).
2. Apply `data/index-settings.json` (Configuration → *Copy/paste* the JSON, or the API).
3. Create two [replicas](https://www.algolia.com/doc/guides/managing-results/refine-results/sorting/how-to/replicas/) for the sort dropdown, ranked by price:
   `<index>_price_asc` (`asc(price)` first) and `<index>_price_desc` (`desc(price)` first).

The critical settings bit is that all three color levels are declared for faceting:

```json
"attributesForFaceting": ["searchable(color.lvl0)", "searchable(color.lvl1)", "searchable(color.lvl2)", "…"]
```

---

## The record shape

```json
{
  "objectID": "furn-0007",
  "name": "Belgian Track Arm Sofa",
  "fullName": "Belgian Track Arm Sofa in Powder Blue Performance Velvet",
  "collection": "Belgian Track Arm",
  "type": "Sofa",
  "categories": { "lvl0": "Living", "lvl1": "Living > Sofas" },

  "color": {
    "lvl0": "Blues",
    "lvl1": "Blues > Chambray",
    "lvl2": "Blues > Chambray > Powder Blue"
  },
  "colorFamily": "Blues",
  "colorShade": "Chambray",
  "colorName": "Powder Blue",
  "colorHex": "#9DB4CC",

  "material": "Performance Velvet",
  "price": 3320,
  "onSale": false,
  "salePrice": null,
  "rating": 4.6,
  "reviewCount": 210,
  "inStock": true,
  "isNew": true,
  "madeToOrder": false,
  "leadTimeWeeks": 6,
  "dimensions": { "width": 88.9, "depth": 44.6, "height": 33.9, "unit": "in" },
  "popularity": 74
}
```

Two things worth copying into a real catalog:

- **The flat mirrors** (`colorFamily`, `colorShade`, `colorName`) exist alongside
  the hierarchy so those words are searchable and highlightable. The `lvl*`
  attributes are for faceting; the flat ones are for querying.
- **`colorHex`** travels on the record so hit cards can be tinted without a
  lookup table. The *facet* swatches can't use it (facets return strings, not
  records), which is what `src/data/colorTaxonomy.js` is for — see below.

The catalog is 304 records spanning 8 color families, 23 sub-families and 52
finishes across 16 furniture types, 10 collections and 12 materials, so every
facet has something to show.

---

## Extending the hierarchical menu

Reference: [`hierarchicalMenu` / `connectHierarchicalMenu`](https://www.algolia.com/doc/api-reference/widgets/hierarchical-menu/js).

The stock widget can only restyle rows through `templates`. To put a swatch on
every node, collapse branches, and render the deepest level as a chip grid,
[`src/widgets/colorHierarchyMenu.js`](src/widgets/colorHierarchyMenu.js) keeps
the **connector** and replaces only the rendering:

```js
import { connectHierarchicalMenu } from 'instantsearch.js/es/connectors';

const renderer = (renderOptions, isFirstRender) => { /* build DOM */ };
const disposer = ({ container }) => { /* tear down */ };

export const colorHierarchyMenu = connectHierarchicalMenu(renderer, disposer);
```

Used exactly like the built-in widget, plus a `title`:

```js
colorHierarchyMenu({
  container: '#color-hierarchy',
  attributes: ['color.lvl0', 'color.lvl1', 'color.lvl2'],
  title: 'Color',
  limit: 6,
  showMore: true,
  showMoreLimit: 20,
  showParentLevel: true,
  transformItems: sortFamilies,   // order families by the taxonomy, not by count
});
```

### What the connector hands you

| Render option | How this widget uses it |
| --- | --- |
| `items` | recursive tree of `{ label, value, count, isRefined, data }` |
| `refine(value)` | called with the full path from `data-chm-refine`; re-refining the current value clears it (that's the *Clear color* button) |
| `createURL(value)` | real `href` on each row, so middle-click / open-in-new-tab work |
| `canRefine` | swaps the tree for an empty state |
| `isShowingMore` / `toggleShowMore` / `canToggleShowMore` | the *Show all families* button |
| `sendEvent` | fires a `click` Insights event on refine (no-op unless Insights is on) |
| `widgetParams` | `container`, `title`, and `attributes.length` — used to know which depth is the leaf level |

### What the extension adds

- **Swatches at every level.** Facets come back as strings, so the hex has to be
  resolved from the path. `src/data/colorTaxonomy.js` exports `colorPathIndex`,
  a flat `"Blues > Chambray > Powder Blue" → { hex, level, label }` map, and
  `hexForPath()` reads it. The same module is the generator's source of truth,
  so the swatches can't drift from the data.
- **Collapsible branches.** Collapsed paths live in a `Set` outside the render
  function (keyed off the container in a `WeakMap`), so state survives the
  re-render that every refinement triggers.
- **Leaf level as a chip grid.** Depth is derived from `attributes.length`, so
  a two- or four-level taxonomy works without touching the widget.
- **One delegated listener** on the container instead of per-row handlers —
  nothing to re-bind after a re-render.
- **Focus preservation.** Re-rendering replaces the focused button, so the
  widget re-focuses the equivalent node afterwards; `Space` activates the
  anchor-styled rows, and disclosure buttons carry `aria-expanded`.

`src/search.js` also mounts the *built-in* `hierarchicalMenu` for
`categories.lvl0/lvl1` and a `breadcrumb` over the same color attributes — a
side-by-side comparison of the templated widget and the custom one, and proof
that two widgets can share one hierarchy.

---

## Multi-select: a disjunctive hierarchical menu

Reference: [Create your own widget](https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js).
Full write-up: **[disjunctive-hierarchy.md](disjunctive-hierarchy.md)**.

Algolia's `hierarchicalFacets` are **single-selection by design** — one path at a
time, and refining a child replaces its parent. So
[`src/widgets/disjunctiveColorHierarchy.js`](src/widgets/disjunctiveColorHierarchy.js)
drops the connector entirely and implements the widget interface directly
(`init` / `render` / `getWidgetSearchParameters` / `getWidgetUiState` /
`dispose`). The user can tick **several colors at several depths at once**:

```
(color.lvl0:"Blues" OR color.lvl1:"Neutrals > Linen" OR color.lvl2:"Greys > Charcoal > Slate")
```

```js
disjunctiveColorHierarchy({
  container: '#color-disjunctive',
  attributes: ['color.lvl0', 'color.lvl1', 'color.lvl2'],
  title: 'Color (multi-select)',
  limit: 8,           // rows per level before "show N more"
  maxFacetHits: 100,  // searchForFacetValues cap (Algolia max)
  hexForValue: hexForPath,
  transformItems: (items, { level, parent }) => items,
});
```

### Two kinds of query

**1. Records for "query + applied color values"** — the main InstantSearch query.
`getWidgetSearchParameters` appends the OR group to `filters`, so it ANDs with
every other widget's refinement while staying one disjunction internally.

**2. Facet values + counts for a level** — one `searchForFacetValues` call per
branch, issued the first time that branch is expanded:

```js
helper.searchForFacetValues(
  'color.lvl1',          // the child level being opened
  '',                    // no facet query: we want the whole branch
  maxFacetHits,
  { filters: `${otherWidgetsFilters} AND color.lvl0:"Blues"` }  // scope to the parent
);
```

On an algoliasearch v5 client the helper turns this into a single
`{ type: 'facet' }` request, so opening a branch costs exactly one query. The
values come back as full paths (`"Blues > Chambray"`), and the label is the last
segment.

Three properties fall out of that call:

- **Counts are disjunctive.** The auxiliary query reuses the query and every
  *other* widget's filters, but **drops this widget's own OR group**. So an
  unticked sibling shows how many results it would add instead of zero.
- **Ticking a color never refetches.** Because the counts don't depend on our
  own selection, only the main query re-runs — the numbers next to every color
  stay put. Changing the query or another facet *does* invalidate the cache
  (there's a signature over "everything except our own filter").
- **No count arithmetic.** Each level's counts come straight from the engine, so
  nothing is summed client-side and nothing breaks if a record ever carries more
  than one color.

### Behaviour

- **Nothing is expanded on load** — the root level is fetched, everything else
  waits for a click. Ancestors of a refinement restored from the URL are opened
  so the selection is visible.
- **A parent supersedes its descendants.** Ticking *Blues* drops any Blues
  descendants from the selection (so the filter stays minimal) and renders them
  checked-and-disabled; a parent with only some children ticked shows the
  indeterminate dash.
- **State lives in the ui state** under `disjunctiveColors`, so selections are in
  the URL and the back button works. Every mutation goes through
  `instantSearchInstance.setUiState`, which keeps
  `getWidgetSearchParameters` the single source of truth and resets the page.
- **`filters` is rewritten, not appended to.** Own clauses are recognised
  structurally (any clause made only of terms on the widget's attributes) and
  stripped before the new group is added — otherwise groups stack up across
  state updates (`Blues AND (Blues OR Linen)`) and, worse, the widget's own
  selection leaks into the count queries.

### Limits worth knowing

- `searchForFacetValues` returns at most **100 values** per call, so a branch
  with more children than that is truncated (the widget says so in the UI when
  the response is non-exhaustive). Scoping each call to one parent keeps you far
  from the cap; a flat "fetch the deepest level once" design would instead hit
  the 1,000-value facet limit.
- The attributes must be declared `searchable(...)` in `attributesForFaceting` —
  `searchForFacetValues` requires it. `data/index-settings.json` already does.
- The two color widgets are **independent filters**, so using both at once ANDs
  them (pick *Blues* in the single-select one and the multi-select panel's counts
  narrow to Blues). That's expected; drive one at a time when demoing.

---

## Project structure

```
index.html                        layout + widget containers
src/main.js                       credentials, client, SPA chrome
src/search.js                     all widget wiring (takes any searchClient)
src/widgets/colorHierarchyMenu.js single-select, via connectHierarchicalMenu
src/widgets/disjunctiveColorHierarchy.js multi-select, via the custom widget API (live)
src/data/colorTaxonomy.js         families → sub-families → finishes (+ hex)
src/style.css                     hand-rolled styles (no instantsearch.css theme)
scripts/generate-records.mjs      builds the record set
scripts/push-to-algolia.mjs       settings + replicas + records
data/furniture-records.json       the importable record set
data/index-settings.json          index configuration
disjunctive-hierarchy.md          how the multi-select facet works
tests/                            offline smoke tests
```

Every widget is styled through the `cssClasses` passed in `src/search.js`, so
there's no theme stylesheet to fight. Colors are CSS custom properties with a
`prefers-color-scheme: dark` variant.

## Tests

```bash
npm test
```

Two jsdom suites that need **no Algolia credentials** — a stub client in
`tests/stub-client.mjs` answers queries from the local JSON:

- `tests/widget-smoke.mjs` — drills through all three levels of the
  single-select widget: refine, chips, show-more, collapse/expand, clear.
- `tests/app-smoke.mjs` — bundles `src/search.js` with Vite and runs it against
  the real `index.html`: cards, highlighting, facets, sort replica, reset.
- `tests/disjunctive-smoke.mjs` — the multi-select widget: nothing auto-expands,
  one scoped facet query per expansion, OR across depths (compared against
  counts computed from the JSON), parent-supersedes, no refetch on selection,
  cache invalidation on a new query, URL round-trip.

The stub applies every filter when counting facets (real Algolia excludes a
facet's own disjunctive filters), so sibling counts read low where the
single-select widget is concerned. It's for behaviour, not for numbers — except
in the disjunctive suite, where counts are asserted against the source JSON.

## Customizing the taxonomy

Edit `src/data/colorTaxonomy.js` — add a family, sub-family or finish with its
`hex` — then `npm run generate && npm run push`. The widget, the swatches, the
hit cards and the family ordering all follow from that one file. To change the
depth, adjust the `attributes` arrays in `src/search.js` (and the `lvl*` keys the
generator writes); the widget derives its leaf level from the array length.

## Notes

- `routing: true` keeps the full refinement state — the single-select color path
  and the multi-select `disjunctiveColors` list — in the URL, so any view is
  deep-linkable and back/forward work.
- Insights is off (`insights: false`). Turn it on and the widget's `sendEvent`
  calls start reporting facet clicks.
- The hit "photography" is a tinted gradient plus a line glyph per room; swap
  `card__media` for real images when you have them.
