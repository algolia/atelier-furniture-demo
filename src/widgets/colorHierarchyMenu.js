/**
 * colorHierarchyMenu — a custom widget built on `connectHierarchicalMenu`.
 *
 * Ref: https://www.algolia.com/doc/api-reference/widgets/hierarchical-menu/js
 *
 * The stock `hierarchicalMenu` widget can only restyle rows through templates.
 * This one reuses the exact same connector (so refinement state, counts, URL
 * routing and `showMore` all behave identically) while replacing the rendering
 * wholesale to add:
 *
 *   • a color swatch per node, resolved from the facet path (`color.lvl0/1/2`)
 *   • per-branch collapse/expand that survives re-renders
 *   • the deepest level rendered as a swatch chip grid instead of a list
 *   • a "clear colors" affordance driven by the refined root path
 *   • keyboard/AT-friendly markup: real buttons, aria-pressed, aria-expanded
 *
 * Connector render options used here:
 *   items, refine, createURL, canRefine, isShowingMore,
 *   toggleShowMore, canToggleShowMore, sendEvent, widgetParams
 * Item shape: { label, value, count, isRefined, data: items[] | null }
 */
import { connectHierarchicalMenu } from 'instantsearch.js/es/connectors';

import { COLOR_SEPARATOR, hexForPath } from '../data/colorTaxonomy.js';

/** Per-container UI state that must outlive a re-render. */
const uiState = new WeakMap();

function resolveContainer(container) {
  const element =
    typeof container === 'string' ? document.querySelector(container) : container;

  if (!element) {
    throw new Error(`[colorHierarchyMenu] container not found: ${String(container)}`);
  }

  return element;
}

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

/** For building attribute selectors out of facet paths (which contain spaces/&). */
const cssEscape = (value) =>
  window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');

const levelOf = (value) => value.split(COLOR_SEPARATOR).length - 1;

/** A node is expandable when the connector handed us children for it. */
const hasChildren = (item) => Array.isArray(item.data) && item.data.length > 0;

/** Walk the tree for the refined path, deepest first. */
function refinedTrail(items, trail = []) {
  for (const item of items) {
    if (!item.isRefined) continue;
    trail.push(item);
    if (hasChildren(item)) refinedTrail(item.data, trail);
    return trail;
  }
  return trail;
}

/* ------------------------------------------------------------------ */
/* Markup                                                             */
/* ------------------------------------------------------------------ */

function renderSwatch(value, { size = 'md' } = {}) {
  const hex = hexForPath(value);
  return `<span class="chm-swatch chm-swatch--${size}" style="--chm-swatch: ${hex}" aria-hidden="true"></span>`;
}

function renderChip(item, state) {
  const label = escapeHtml(item.label);
  return `
    <li class="chm-chip-item">
      <button
        type="button"
        class="chm-chip${item.isRefined ? ' is-refined' : ''}"
        data-chm-refine="${escapeHtml(item.value)}"
        aria-pressed="${item.isRefined}"
        title="${label} · ${item.count} ${item.count === 1 ? 'piece' : 'pieces'}"
      >
        ${renderSwatch(item.value, { size: 'lg' })}
        <span class="chm-chip__label">${label}</span>
        <span class="chm-chip__count">${item.count}</span>
      </button>
    </li>`;
}

function renderList(items, state) {
  // Deepest level (individual finishes) reads better as a swatch grid.
  const isLeafLevel = items.length > 0 && levelOf(items[0].value) === state.leafLevel;

  if (isLeafLevel) {
    return `<ul class="chm-chips">${items.map((item) => renderChip(item, state)).join('')}</ul>`;
  }

  return `<ul class="chm-list">${items.map((item) => renderNode(item, state)).join('')}</ul>`;
}

function renderNode(item, state) {
  const level = levelOf(item.value);
  const expandable = hasChildren(item);
  const collapsed = expandable && state.collapsed.has(item.value);
  const label = escapeHtml(item.label);

  return `
    <li class="chm-node chm-node--l${level}${item.isRefined ? ' is-refined' : ''}">
      <div class="chm-row">
        <a
          class="chm-refine"
          href="${escapeHtml(state.createURL(item.value))}"
          data-chm-refine="${escapeHtml(item.value)}"
          aria-pressed="${item.isRefined}"
          role="button"
        >
          ${renderSwatch(item.value)}
          <span class="chm-label">${label}</span>
          <span class="chm-count">${item.count}</span>
        </a>
        ${
          expandable
            ? `<button
                 type="button"
                 class="chm-disclose${collapsed ? ' is-collapsed' : ''}"
                 data-chm-collapse="${escapeHtml(item.value)}"
                 aria-expanded="${!collapsed}"
                 aria-label="${collapsed ? 'Expand' : 'Collapse'} ${label}"
               ><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg></button>`
            : ''
        }
      </div>
      ${expandable && !collapsed ? renderList(item.data, state) : ''}
    </li>`;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                           */
/* ------------------------------------------------------------------ */

function paint(container) {
  const state = uiState.get(container);
  if (!state) return;

  const { items, canRefine, isShowingMore, canToggleShowMore, widgetParams } = state.latest;
  const trail = refinedTrail(items);
  const deepest = trail[trail.length - 1];

  state.refs.count.textContent = canRefine
    ? `${items.length} ${items.length === 1 ? 'family' : 'families'}`
    : 'no colors match';

  state.refs.selection.innerHTML = deepest
    ? `${renderSwatch(deepest.value, { size: 'lg' })}<span>${escapeHtml(deepest.label)}</span>`
    : '<span class="chm-selection__empty">All colors</span>';

  state.refs.clear.hidden = trail.length === 0;
  state.refs.clear.dataset.chmClear = trail[0]?.value ?? '';

  // Rebuilding the tree replaces the focused button, so remember what had focus
  // and hand it back to the equivalent node afterwards (keyboard users).
  const active = document.activeElement;
  const focusKey =
    active && state.refs.tree.contains(active)
      ? active.dataset.chmCollapse
        ? `[data-chm-collapse="${cssEscape(active.dataset.chmCollapse)}"]`
        : active.dataset.chmRefine
          ? `[data-chm-refine="${cssEscape(active.dataset.chmRefine)}"]`
          : null
      : null;

  state.refs.tree.innerHTML = canRefine
    ? renderList(items, state)
    : '<p class="chm-empty">No colors for the current filters.</p>';

  if (focusKey) state.refs.tree.querySelector(focusKey)?.focus();

  const showMoreWanted = Boolean(widgetParams.showMore);
  state.refs.showMore.hidden = !showMoreWanted;
  if (showMoreWanted) {
    state.refs.showMore.disabled = !canToggleShowMore;
    state.refs.showMore.textContent = isShowingMore
      ? 'Show fewer families'
      : 'Show all families';
  }
}

const renderer = (renderOptions, isFirstRender) => {
  const { widgetParams, refine, createURL, toggleShowMore, sendEvent } = renderOptions;
  const container = resolveContainer(widgetParams.container);

  if (isFirstRender) {
    container.classList.add('chm');
    container.innerHTML = `
      <div class="chm-head">
        <h3 class="chm-title">${escapeHtml(widgetParams.title ?? 'Color')}</h3>
        <span class="chm-meta" data-chm-count></span>
      </div>
      <div class="chm-selection" data-chm-selection></div>
      <button type="button" class="chm-clear" data-chm-clear hidden>Clear color</button>
      <div class="chm-tree" data-chm-tree></div>
      <button type="button" class="chm-showmore" data-chm-showmore hidden></button>
    `;

    uiState.set(container, {
      collapsed: new Set(),
      leafLevel: widgetParams.attributes.length - 1,
      createURL,
      latest: renderOptions,
      refs: {
        count: container.querySelector('[data-chm-count]'),
        selection: container.querySelector('[data-chm-selection]'),
        clear: container.querySelector('[data-chm-clear]'),
        tree: container.querySelector('[data-chm-tree]'),
        showMore: container.querySelector('[data-chm-showmore]'),
      },
    });

    // One delegated listener for the whole subtree; survives every re-render.
    container.addEventListener('click', (event) => {
      const state = uiState.get(container);
      if (!state) return;

      const showMore = event.target.closest('[data-chm-showmore]');
      if (showMore) {
        state.latest.toggleShowMore();
        return;
      }

      const clear = event.target.closest('[data-chm-clear]');
      if (clear) {
        // Re-refining the refined root path removes the refinement entirely.
        if (clear.dataset.chmClear) state.latest.refine(clear.dataset.chmClear);
        state.collapsed.clear();
        return;
      }

      const disclose = event.target.closest('[data-chm-collapse]');
      if (disclose) {
        const value = disclose.dataset.chmCollapse;
        if (state.collapsed.has(value)) state.collapsed.delete(value);
        else state.collapsed.add(value);
        paint(container);
        return;
      }

      const target = event.target.closest('[data-chm-refine]');
      if (target) {
        event.preventDefault(); // keep the href for middle-click / SEO only
        const value = target.dataset.chmRefine;
        state.collapsed.delete(value);
        state.latest.sendEvent?.('click', value);
        state.latest.refine(value);
      }
    });

    // Space/Enter on the anchor-as-button rows.
    container.addEventListener('keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      const target = event.target.closest('a[data-chm-refine]');
      if (!target) return;
      event.preventDefault();
      target.click();
    });
  }

  const state = uiState.get(container);
  state.latest = renderOptions;
  state.createURL = createURL;
  paint(container);
};

const disposer = ({ container }) => {
  const element = resolveContainer(container);
  uiState.delete(element);
  element.classList.remove('chm');
  element.innerHTML = '';
};

/**
 * Widget factory. Accepts every `connectHierarchicalMenu` option
 * (attributes, separator, rootPath, showParentLevel, limit, showMore,
 * showMoreLimit, sortBy, transformItems) plus:
 *
 *   container : string | HTMLElement  (required)
 *   title     : string               heading text
 */
export const colorHierarchyMenu = connectHierarchicalMenu(renderer, disposer);
