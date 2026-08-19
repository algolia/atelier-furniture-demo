/**
 * disjunctiveColorHierarchy — a multi-select (OR) hierarchical facet.
 *
 * Built with the custom widget API rather than a connector:
 * https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js
 *
 * Why not `connectHierarchicalMenu`? Algolia's `hierarchicalFacets` are
 * single-selection by design — one path at a time, and refining a child
 * replaces the parent. This widget lets the user tick *several* colors at
 * *different depths* at once and ORs them together:
 *
 *   (color.lvl0:"Blues" OR color.lvl1:"Neutrals > Linen" OR color.lvl2:"Greys > Charcoal > Slate")
 *
 * ── How the counts stay correct ──────────────────────────────────────
 *
 * Two kinds of query are involved, matching the two things we need:
 *
 * 1. Records for "query + applied color values" — the main InstantSearch
 *    query. `getWidgetSearchParameters` appends the OR group above to
 *    `filters`, so the group ANDs with every other widget's refinement while
 *    staying a single disjunction internally.
 *
 * 2. Facet values + counts for a level — one `searchForFacetValues` call per
 *    expanded branch, issued lazily when that branch first opens. Each call
 *    reuses the current query and every *other* widget's filters, but drops
 *    this widget's own OR group. That omission is what makes the counts
 *    disjunctive: an unticked sibling shows how many results it would add,
 *    not zero, and ticking a color never changes the numbers next to the
 *    others (so no refetch is needed when the selection changes).
 *
 * Facet values come back as full paths ("Blues > Chambray > Powder Blue"), so
 * each level is scoped with a filter on its parent attribute and the labels are
 * the last segment. Nothing is expanded until the user asks for it.
 *
 * ── Options ──────────────────────────────────────────────────────────
 *
 *   container      string | HTMLElement           required
 *   attributes     string[]                       required, root level first
 *   separator      string                         default ' > '
 *   title          string
 *   limit          number                         rows shown per level before "show all"
 *   maxFacetHits   number                         1-100, the searchForFacetValues cap
 *   uiStateKey     string                         URL/uiState key, default 'disjunctiveColors'
 *   hexForValue    (path) => string               swatch color for a path
 *   transformItems (items, { level, parent }) => items
 */

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

const cssEscape = (value) =>
  typeof window !== 'undefined' && window.CSS?.escape
    ? window.CSS.escape(value)
    : String(value).replace(/["\\]/g, '\\$&');

/** Algolia filter syntax: quote the value, escape embedded quotes. */
const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

export function disjunctiveColorHierarchy(widgetParams) {
  const {
    container,
    attributes,
    separator = ' > ',
    title = 'Color',
    limit = 8,
    maxFacetHits = 100,
    uiStateKey = 'disjunctiveColors',
    hexForValue = () => '#cccccc',
    transformItems = (items) => items,
  } = widgetParams ?? {};

  if (!container) throw new Error('[disjunctiveColorHierarchy] `container` is required');
  if (!Array.isArray(attributes) || attributes.length === 0) {
    throw new Error('[disjunctiveColorHierarchy] `attributes` is required');
  }

  const leafDepth = attributes.length - 1;

  /* ---------------- state ------------------------------------------ */

  let element = null;
  let refs = null;
  let helper = null;
  let instantSearchInstance = null;
  let indexId = null;

  let selected = []; // full paths, any depth, never nested (see normalize)
  const expanded = new Set(); // paths whose children are visible
  const shownAll = new Set(); // paths whose children ignore `limit` ('' = root)
  const levels = new Map(); // parent path ('' = root) -> { status, items, signature, exhaustive }

  let appliedFilter = ''; // the OR group this widget last contributed
  let signature = null; // identity of "everything except our own filter"

  /* ---------------- path helpers ----------------------------------- */

  const depthOf = (path) => path.split(separator).length - 1;
  const labelOf = (path) => path.split(separator).pop();
  const isDescendant = (path, ancestor) => path.startsWith(ancestor + separator);

  /** Parent supersedes: drop anything already covered by a selected ancestor. */
  function normalize(paths) {
    const unique = [...new Set(paths.filter(Boolean))];
    return unique
      .filter((path) => !unique.some((other) => other !== path && isDescendant(path, other)))
      .sort();
  }

  const selectedAncestorOf = (path) => selected.find((sel) => isDescendant(path, sel));
  const hasSelectedDescendant = (path) => selected.some((sel) => isDescendant(sel, path));

  /* ---------------- filters ---------------------------------------- */

  function buildFilterGroup(paths) {
    if (paths.length === 0) return '';
    const terms = paths.map((path) => `${attributes[depthOf(path)]}:${quote(path)}`);
    return terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`;
  }

  /** Split on a token, ignoring occurrences inside parentheses. */
  function splitTopLevel(input, token) {
    const parts = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (depth === 0 && input.startsWith(token, i)) {
        parts.push(current);
        current = '';
        i += token.length - 1;
        continue;
      }
      current += char;
    }
    parts.push(current);

    return parts.map((part) => part.trim()).filter(Boolean);
  }

  /** True for a clause made up only of terms on this widget's attributes. */
  function isOwnClause(clause) {
    const inner =
      clause.startsWith('(') && clause.endsWith(')') ? clause.slice(1, -1) : clause;
    const terms = splitTopLevel(inner, ' OR ');
    return (
      terms.length > 0 &&
      terms.every((term) => {
        const match = term.match(/^([\w.]+)\s*:\s*"/);
        return Boolean(match) && attributes.includes(match[1]);
      })
    );
  }

  /**
   * Everything in `filters` except this widget's own contribution.
   *
   * Matched structurally rather than against the last value we wrote:
   * `getWidgetSearchParameters` receives the *current* state, which already
   * carries the group from the previous run, so a value-based strip would let
   * groups stack up ("Blues AND (Blues OR Linen)") and, worse, leak our own
   * selection into the facet-count queries.
   */
  function withoutOwnFilter(filters) {
    const all = (filters ?? '').trim();
    if (!all) return '';
    return splitTopLevel(all, ' AND ')
      .filter((clause) => !isOwnClause(clause))
      .join(' AND ');
  }

  /** Anything that changes facet counts — our own selection deliberately excluded. */
  function computeSignature(state) {
    return JSON.stringify({
      index: state.index,
      query: state.query ?? '',
      filters: withoutOwnFilter(state.filters),
      facets: state.facetsRefinements,
      disjunctive: state.disjunctiveFacetsRefinements,
      hierarchical: state.hierarchicalFacetsRefinements,
      numeric: state.numericRefinements,
      tags: state.tagRefinements,
    });
  }

  /* ---------------- fetching --------------------------------------- */

  /**
   * One `searchForFacetValues` call for the children of `parentPath`
   * ('' for the root level). Cached per (signature, parentPath).
   */
  function fetchLevel(parentPath) {
    const depth = parentPath === '' ? 0 : depthOf(parentPath) + 1;
    const attribute = attributes[depth];
    if (!attribute) return; // leaf level has no children

    const cached = levels.get(parentPath);
    if (cached && cached.signature === signature && cached.status !== 'error') return;

    levels.set(parentPath, {
      status: 'loading',
      signature,
      items: cached?.signature === signature ? cached.items : [],
    });
    paint();

    // Current query + other widgets' filters, minus our own OR group, scoped
    // to this branch. Dropping our group is what makes the counts disjunctive.
    const base = withoutOwnFilter(helper.state.filters);
    const scope = parentPath ? `${attributes[depth - 1]}:${quote(parentPath)}` : '';
    const filters = [base, scope].filter(Boolean).join(' AND ');
    const requestedFor = signature;

    helper
      .searchForFacetValues(attribute, '', Math.min(Math.max(maxFacetHits, 1), 100), {
        filters,
        hitsPerPage: 0,
        page: 0,
        attributesToRetrieve: [],
        attributesToHighlight: [],
        facets: [],
      })
      .then((response) => {
        if (requestedFor !== signature) return; // a newer search superseded this one
        levels.set(parentPath, {
          status: 'loaded',
          signature: requestedFor,
          exhaustive: response.exhaustiveFacetsCount !== false,
          items: (response.facetHits ?? []).map((hit) => ({
            value: hit.value,
            label: labelOf(hit.value),
            count: hit.count,
          })),
        });
        paint();
      })
      .catch((error) => {
        levels.set(parentPath, { status: 'error', signature: requestedFor, items: [], error });
        paint();
      });
  }

  /** Root level, plus the children of every open branch. */
  function fetchVisibleLevels() {
    fetchLevel('');
    for (const path of expanded) {
      if (depthOf(path) < leafDepth) fetchLevel(path);
    }
  }

  /* ---------------- mutations --------------------------------------- */

  function setSelection(paths) {
    const next = normalize(paths);
    selected = next;

    // Route every change through the ui state so routing/back-button and
    // getWidgetSearchParameters stay the single source of truth.
    instantSearchInstance.setUiState((uiState) => {
      const indexUiState = { ...(uiState[indexId] ?? {}) };
      delete indexUiState.page; // a refinement change resets pagination
      if (next.length) indexUiState[uiStateKey] = next;
      else delete indexUiState[uiStateKey];
      return { ...uiState, [indexId]: indexUiState };
    });
  }

  function toggleValue(path) {
    if (selected.includes(path)) {
      setSelection(selected.filter((sel) => sel !== path));
      return;
    }
    if (selectedAncestorOf(path)) return; // covered by a parent; the box is disabled
    setSelection([...selected, path]);
  }

  function toggleExpand(path) {
    if (expanded.has(path)) {
      expanded.delete(path);
      paint();
      return;
    }
    expanded.add(path);
    if (depthOf(path) < leafDepth) fetchLevel(path);
    paint();
  }

  /* ---------------- rendering --------------------------------------- */

  function renderRow(item, depth) {
    const exact = selected.includes(item.value);
    const covered = !exact && Boolean(selectedAncestorOf(item.value));
    const partial = !exact && !covered && hasSelectedDescendant(item.value);
    const expandable = depth < leafDepth;
    const isOpen = expanded.has(item.value);
    const childState = levels.get(item.value);
    const label = escapeHtml(item.label);

    return `
      <li class="dch-node dch-node--l${depth}${exact || covered ? ' is-selected' : ''}">
        <div class="dch-row">
          ${
            expandable
              ? `<button
                   type="button"
                   class="dch-disclose${isOpen ? ' is-open' : ''}"
                   data-dch-expand="${escapeHtml(item.value)}"
                   aria-expanded="${isOpen}"
                   aria-label="${isOpen ? 'Collapse' : 'Expand'} ${label}"
                 ><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg></button>`
              : '<span class="dch-disclose dch-disclose--leaf" aria-hidden="true"></span>'
          }
          <label class="dch-label${covered ? ' is-covered' : ''}"${
            covered ? ` title="Included by “${escapeHtml(selectedAncestorOf(item.value))}”"` : ''
          }>
            <input
              type="checkbox"
              class="dch-checkbox"
              data-dch-toggle="${escapeHtml(item.value)}"
              ${exact || covered ? 'checked' : ''}
              ${covered ? 'disabled' : ''}
              ${partial ? 'data-dch-partial="true"' : ''}
            />
            <span class="dch-swatch" style="--dch-swatch: ${escapeHtml(
              hexForValue(item.value)
            )}" aria-hidden="true"></span>
            <span class="dch-text">${label}</span>
            <span class="dch-count">${item.count}</span>
          </label>
        </div>
        ${isOpen ? renderLevel(item.value, depth + 1) : ''}
      </li>`;
  }

  function renderLevel(parentPath, depth) {
    const entry = levels.get(parentPath);

    if (!entry || (entry.status === 'loading' && entry.items.length === 0)) {
      return `<ul class="dch-list dch-list--child"><li class="dch-loading">Loading colors…</li></ul>`;
    }
    if (entry.status === 'error') {
      return `<ul class="dch-list dch-list--child"><li class="dch-error">Couldn’t load this level.</li></ul>`;
    }

    const items = transformItems(entry.items, { level: depth, parent: parentPath });
    if (items.length === 0) {
      return `<ul class="dch-list dch-list--child"><li class="dch-loading">No colors here.</li></ul>`;
    }

    const showAll = shownAll.has(parentPath);
    const visible = showAll ? items : items.slice(0, limit);
    const hidden = items.length - visible.length;

    return `
      <ul class="dch-list${depth > 0 ? ' dch-list--child' : ''}"${
        entry.status === 'loading' ? ' aria-busy="true"' : ''
      }>
        ${visible.map((item) => renderRow(item, depth)).join('')}
        ${
          hidden > 0 || showAll
            ? `<li class="dch-more">
                 <button type="button" class="dch-more-button" data-dch-more="${escapeHtml(parentPath)}">
                   ${showAll ? 'Show fewer' : `Show ${hidden} more`}
                 </button>
               </li>`
            : ''
        }
        ${
          entry.exhaustive === false
            ? `<li class="dch-truncated">Counts approximate (facet values capped at ${maxFacetHits}).</li>`
            : ''
        }
      </ul>`;
  }

  function paint() {
    if (!element) return;

    const active = document.activeElement;
    const focusKey =
      active && refs.tree.contains(active)
        ? active.dataset.dchToggle
          ? `[data-dch-toggle="${cssEscape(active.dataset.dchToggle)}"]`
          : active.dataset.dchExpand
            ? `[data-dch-expand="${cssEscape(active.dataset.dchExpand)}"]`
            : null
        : null;

    refs.meta.textContent = selected.length
      ? `${selected.length} selected`
      : 'multi-select';
    refs.clear.hidden = selected.length === 0;
    refs.tree.innerHTML = renderLevel('', 0);

    // `indeterminate` is a property, not an attribute — set it after paint.
    for (const box of refs.tree.querySelectorAll('[data-dch-partial="true"]')) {
      box.indeterminate = true;
    }

    if (focusKey) refs.tree.querySelector(focusKey)?.focus();
  }

  /* ---------------- widget ----------------------------------------- */

  return {
    $$type: 'furniture.disjunctiveColorHierarchy',
    $$widgetType: 'furniture.disjunctiveColorHierarchy',

    init(initOptions) {
      helper = initOptions.helper;
      instantSearchInstance = initOptions.instantSearchInstance;
      indexId = initOptions.parent?.getIndexId?.() ?? helper.state.index;

      element = typeof container === 'string' ? document.querySelector(container) : container;
      if (!element) throw new Error(`[disjunctiveColorHierarchy] container not found: ${container}`);

      element.classList.add('dch');
      element.innerHTML = `
        <div class="dch-head">
          <h3 class="dch-title">${escapeHtml(title)}</h3>
          <span class="dch-meta" data-dch-meta></span>
        </div>
        <button type="button" class="dch-clear" data-dch-clear hidden>Clear colors</button>
        <div class="dch-tree" data-dch-tree></div>
      `;

      refs = {
        meta: element.querySelector('[data-dch-meta]'),
        clear: element.querySelector('[data-dch-clear]'),
        tree: element.querySelector('[data-dch-tree]'),
      };

      element.addEventListener('click', (event) => {
        const clear = event.target.closest('[data-dch-clear]');
        if (clear) {
          setSelection([]);
          return;
        }

        const expand = event.target.closest('[data-dch-expand]');
        if (expand) {
          toggleExpand(expand.dataset.dchExpand);
          return;
        }

        const more = event.target.closest('[data-dch-more]');
        if (more) {
          const key = more.dataset.dchMore;
          if (shownAll.has(key)) shownAll.delete(key);
          else shownAll.add(key);
          paint();
        }
      });

      element.addEventListener('change', (event) => {
        const box = event.target.closest('[data-dch-toggle]');
        if (box) toggleValue(box.dataset.dchToggle);
      });

      // Reveal restored refinements without auto-expanding the root level.
      for (const path of selected) {
        const segments = path.split(separator);
        for (let i = 1; i < segments.length; i += 1) {
          expanded.add(segments.slice(0, i).join(separator));
        }
      }

      signature = computeSignature(helper.state);
      paint();
      fetchVisibleLevels();
    },

    render(renderOptions) {
      helper = renderOptions.helper;
      const nextSignature = computeSignature(renderOptions.state ?? helper.state);

      if (nextSignature !== signature) {
        // Query or another widget's filters changed: every count is stale.
        signature = nextSignature;
        levels.clear();
        paint();
        fetchVisibleLevels();
        return;
      }

      // Our own selection changing doesn't move the counts, so nothing refetches.
      paint();
    },

    getWidgetSearchParameters(searchParameters, { uiState }) {
      const base = withoutOwnFilter(searchParameters.filters);
      selected = normalize(uiState[uiStateKey] ?? []);
      appliedFilter = buildFilterGroup(selected);

      const filters = appliedFilter
        ? [base, appliedFilter].filter(Boolean).join(' AND ')
        : base;

      if (filters === (searchParameters.filters ?? '')) return searchParameters;
      return searchParameters.setQueryParameter('filters', filters);
    },

    getWidgetUiState(uiState) {
      if (selected.length === 0) {
        const { [uiStateKey]: _removed, ...rest } = uiState;
        return rest;
      }
      return { ...uiState, [uiStateKey]: selected };
    },

    /*
     * Imperative escape hatches for app-level wiring.
     *
     * `connectClearRefinements` and `connectCurrentRefinements` only look at the
     * helper's refinement structures (facets, disjunctive, hierarchical,
     * numeric, tags). This widget refines with a `filters` string — which is the
     * only way to OR across attributes — so those widgets cannot see it. Expose
     * the selection so a global "Reset all" can include it.
     */
    hasSelection() {
      return selected.length > 0;
    },

    getSelection() {
      return [...selected];
    },

    clearSelection() {
      if (selected.length > 0) setSelection([]);
    },

    dispose({ state }) {
      const remaining = withoutOwnFilter(state.filters);
      if (element) {
        element.classList.remove('dch');
        element.innerHTML = '';
      }
      element = null;
      refs = null;
      levels.clear();
      expanded.clear();
      shownAll.clear();
      selected = [];
      appliedFilter = '';
      return state.setQueryParameter('filters', remaining);
    },
  };
}
