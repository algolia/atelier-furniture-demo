# The disjunctive hierarchical menu

How [`src/widgets/disjunctiveColorHierarchy.js`](src/widgets/disjunctiveColorHierarchy.js)
works, why it's shaped that way, and what it costs.

It is a **multi-select hierarchical facet**: the user can tick several colors at
several depths at once, and the results are the union of those picks.

---

## 1. Why not the hierarchical menu

Colors live in records as one path per level:

```json
"color": {
  "lvl0": "Blues",
  "lvl1": "Blues > Chambray",
  "lvl2": "Blues > Chambray > Powder Blue"
}
```

Algolia's `hierarchicalFacets` — what `hierarchicalMenu` and
`connectHierarchicalMenu` are built on — model a **single position in a tree**.
Refining a child replaces the parent, and there is one refined path at a time.
That's the whole point of the feature (it's what makes breadcrumbs and
`showParentLevel` work), and it's exactly what we don't want here.

So this widget uses the [custom widget API](https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js)
directly — `init`, `render`, `getWidgetSearchParameters`, `getWidgetUiState`,
`dispose` — and treats the three `lvl` attributes as three ordinary facets that
it stitches into a tree itself.

---

## 2. Expressing the refinement

The selection is a set of paths, at any depth:

```
Blues                             (lvl0)
Neutrals > Linen                  (lvl1)
Greys > Charcoal > Slate          (lvl2)
```

Those have to be OR'd **across different attributes**. The helper's refinement
structures can't do that: `disjunctiveFacetsRefinements` ORs *within* one
attribute and ANDs *between* attributes, so a mixed-depth selection would come
out as "Blues AND Linen" — which matches nothing.

What does support cross-attribute OR is the `filters` string, so
`getWidgetSearchParameters` contributes one group:

```js
searchParameters.setQueryParameter(
  'filters',
  '(color.lvl0:"Blues" OR color.lvl1:"Neutrals > Linen" OR color.lvl2:"Greys > Charcoal > Slate")'
);
```

One group, AND-ed with whatever other widgets put in `filters`, OR internally.

Two consequences worth knowing:

**A parent supersedes its descendants.** Ticking *Blues* removes any selected
Blues descendants, so the group stays minimal (`color.lvl0:"Blues"` covers the
whole subtree). Descendants then render checked-and-disabled, and a parent with
only some children ticked shows the indeterminate dash.

**The group must be rewritten, not appended.** `getWidgetSearchParameters`
receives the *current* state, which already contains the group from the previous
run. Appending stacks them up (`Blues AND (Blues OR Linen)`) and — worse — the
stale clause leaks into the facet queries below and starts zeroing out the
counts. Own clauses are therefore matched *structurally* (any clause made only of
terms on this widget's attributes) and stripped before the new group is added.

---

## 3. Getting the tree

Facet values come back as full paths, so a level's values already encode their
parent. The label is the last segment:

```
"Blues > Chambray"   →  label "Chambray", parent "Blues"
```

Two different things need to be fetched, and this is the core of the design:

| Need | Query | Filters |
| --- | --- | --- |
| **Records** for the current picks | the main InstantSearch search | everything, *including* our OR group |
| **Facet values + counts** for a level | one facet query per opened branch | everything *except* our OR group |

### Why the counts can't come from the main query

If the counts were read off the main query, ticking *Blues* would filter the
result set to Blues, and every other family would report 0 — you could never add
a second color. Dropping our own group from the count query is what makes the
facet *disjunctive*: an unticked sibling reports how many results it would add.

| With *Blues* ticked | Blues | Neutrals |
| --- | --- | --- |
| counts from the main query | 25 | **0** ← dead end |
| counts with our group dropped | 25 | **65** ← what the widget shows |

### The facet query

One call per branch, the first time it is expanded:

```js
helper.searchForFacetValues(
  'color.lvl1',                                   // the child level being opened
  '',                                             // no facet query — we want the branch
  100,                                            // maxFacetHits (Algolia's cap)
  { filters: `${everyOtherWidgetsFilters} AND color.lvl0:"Blues"` }
);
```

The helper builds the request from the current state and merges those overrides,
so the query string, other facets' `facetFilters`, and `numericFilters` all come
along for free — only `filters` is swapped. On an algoliasearch v5 client it
lands as a single request:

```json
{
  "type": "facet",
  "facet": "color.lvl1",
  "indexName": "furniture",
  "params": {
    "facetQuery": "",
    "maxFacetHits": 100,
    "query": "velvet",
    "filters": "color.lvl0:\"Blues\"",
    "facetFilters": [["material:Performance Velvet"]],
    "hitsPerPage": 0
  }
}
```

and the response is just values and counts:

```json
{ "facetHits": [
    { "value": "Blues > Indigo",   "count": 16 },
    { "value": "Blues > Chambray", "count": 6 },
    { "value": "Blues > Teal",     "count": 3 }
  ],
  "exhaustiveFacetsCount": true }
```

Two requirements come with it:

- the attributes must be declared `searchable(...)` in `attributesForFaceting`
  (facet search needs it — `data/index-settings.json` does this);
- `maxFacetHits` caps at **100**.

Scoping each call to one parent (`color.lvl0:"Blues"`) keeps a branch far from
that cap, and means counts are read straight from the engine at every level —
nothing is summed client-side, so the widget stays correct even if a record ever
carries more than one color.

---

## 4. Cache and invalidation

Results are cached per branch against a **signature** of everything that can
move a count:

```
index · query · other widgets' filters · facet/numeric/tag refinements
```

Our own OR group and the page number are deliberately *not* in it. That gives
the property that makes the widget feel cheap:

- **Ticking a color refetches nothing.** Counts don't depend on our own
  selection, so only the main search re-runs and the numbers next to every color
  stay put.
- **Collapsing and re-expanding refetches nothing.**
- **Changing the query or another facet invalidates everything**, and the root
  level plus each open branch are refetched.

---

## 5. State, URL, and the rest of the app

The selection lives in the ui state under `disjunctiveColors`, and every
mutation goes through `instantSearchInstance.setUiState`. That keeps
`getWidgetSearchParameters` the single source of truth, puts the selection in the
URL (so it's deep-linkable and the back button works), and resets the page.
On load, ancestors of a restored selection are expanded so the picks are visible
— nothing else auto-expands.

One integration cost of refining through `filters`: **`currentRefinements` and
`clearRefinements` can't see it.** Both read the helper's refinement structures
only. So the widget exposes `hasSelection()` / `clearSelection()`, and
`src/search.js` uses a custom "Reset all" (over `connectClearRefinements`) that
enables itself when either kind of refinement exists and clears both in one
ui-state write — one search, not two. Colors deliberately don't appear as chips
in the `currentRefinements` row; the panel shows its own selection state instead.

---

## 6. What Algolia actually receives

Facet queries, counted per interaction (the main search is separate, and carries
its own disjunctive queries for the other facets):

| Interaction | Facet queries | Searches |
| --- | --- | --- |
| First load | 1 (root level) | 1 |
| Expand a branch | 1 | 0 |
| Collapse, then re-expand | 0 | 0 |
| Tick / untick a color | **0** | 1 |
| Change page | 0 | 1 |
| New query, or another facet changes | 1 + (open branches) | 1 |
| Reset all, colors only | **0** — the signature never changed | 1 |
| Reset all, with other facets refined | 1 + (open branches) | 1 |

Every request in a multi-query batch is a billable operation, so the row that
matters is "new query, or another facet changes".

---

## 7. Performance concerns

**Keystroke amplification is the real one.** InstantSearch searches as you type,
and each keystroke changes the signature. With *k* branches open, one keystroke
costs `1 + k` facet queries on top of the search — type eight characters with
three branches open and that's ~32 facet queries. Mitigations, roughly in order
of value:

1. Debounce the query with a `searchFunction` / `queryHook` (a few lines) so
   facet refetching happens on a pause rather than per character.
2. Refetch the root level eagerly but mark open branches *stale* and refetch them
   only when the user looks at them again (or collapse them on a query change).
3. Cap how many branches can be open at once.

**Expansion latency.** Opening a branch waits on a network round-trip, so there's
a visible "Loading colors…" row. If that matters, prefetch a level ahead — fetch
a node's children when its parent renders, not when the node is clicked — at the
cost of queries for branches nobody opens.

**Truncation.** `maxFacetHits` maxes out at 100 per call. A branch with more
children than that is silently cut off by the engine, so the widget surfaces
`exhaustiveFacetsCount: false` in the UI. Counts can also be approximate on large
indices for the same reason.

**Selection size.** Every selected path adds a term to the `filters` string and
an entry to the URL. Hundreds of individually-ticked leaves make for a long
query string; the parent-supersedes rule is what normally keeps it short.

**Rendering.** Each paint rewrites the tree's `innerHTML` (focus is restored
afterwards). That's fine for the tens of rows a color taxonomy has; a facet with
thousands of visible values would want keyed DOM updates instead.

### The alternative design, for comparison

Instead of one query per branch, you can fetch the **deepest level once** —
`facets: ['color.lvl2']` with `maxValuesPerFacet: 1000` — split every value on
` > ` and rebuild the whole tree client-side, summing child counts into parents.

| | Per-level (this widget) | Deepest level once |
| --- | --- | --- |
| Queries | 1 per branch opened | 1 per search, total |
| Expansion | network round-trip | instant |
| Ceiling | 100 values per branch | 1,000 values overall |
| Parent counts | from the engine | summed client-side (assumes one color per record) |
| Response size | small | the entire leaf list every search |

Per-level wins when the taxonomy is broad or deep and users only open a branch or
two; fetch-once wins when the whole tree fits comfortably under 1,000 leaves and
expansion should feel instant. The color taxonomy here (52 leaves) would fit
either way.

---

## 8. Verifying it

[`tests/disjunctive-smoke.mjs`](tests/disjunctive-smoke.mjs) runs the real
bundle in jsdom against a stub client (no credentials) and asserts the behaviour
described above: nothing auto-expands, one scoped facet query per expansion, OR
across depths checked against counts computed from the source JSON,
parent-supersedes, no refetch when the selection changes, cache invalidation on a
new query, the URL round-trip, and the single-search reset.

```bash
npm run test:disjunctive
```
