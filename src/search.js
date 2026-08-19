/**
 * All widget wiring lives here, decoupled from credentials so it can be driven
 * by any search client — the real Algolia one from main.js, or the stub used by
 * tests/app-smoke.mjs.
 */
import instantsearch from 'instantsearch.js';
import { connectClearRefinements } from 'instantsearch.js/es/connectors';
import {
  // eslint-disable-next-line no-unused-vars -- see the disabled block below
  breadcrumb,
  configure,
  currentRefinements,
  hierarchicalMenu,
  hits,
  hitsPerPage,
  pagination,
  rangeInput,
  ratingMenu,
  refinementList,
  searchBox,
  sortBy,
  stats,
  toggleRefinement,
} from 'instantsearch.js/es/widgets';

// eslint-disable-next-line no-unused-vars -- mounted only when the
// single-select color facet below is uncommented
import { colorHierarchyMenu } from './widgets/colorHierarchyMenu.js';
import { disjunctiveColorHierarchy } from './widgets/disjunctiveColorHierarchy.js';
import { colorFamilies, hexForPath } from './data/colorTaxonomy.js';

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Line-drawn silhouette per room, as raw path data (kept as arrays so the
// template renders real vnodes instead of injecting HTML).
const roomGlyphs = {
  Living: [
    'M4 22h32v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V22Z',
    'M8 22v-6a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v6',
  ],
  Dining: ['M4 16h32', 'M9 16v20', 'M31 16v20', 'M4 16 8 9h24l4 7'],
  Bedroom: ['M4 34V14a3 3 0 0 1 3-3h4v9', 'M11 20h25v14', 'M11 27h25'],
  Office: ['M4 15h32', 'M8 15v21', 'M32 15v21', 'M14 21h12v6H14z'],
  'Rugs & Decor': ['M6 12h28l-4 24H10L6 12Z', 'M12 18h16', 'M13 26h14'],
};

/** Human labels for the chips in `currentRefinements`. */
const attributeLabels = {
  'color.lvl0': 'Color',
  'color.lvl1': 'Color',
  'color.lvl2': 'Color',
  'categories.lvl0': 'Room',
  'categories.lvl1': 'Room',
  type: 'Piece',
  material: 'Material',
  collection: 'Collection',
  price: 'Price',
  rating: 'Rating',
  inStock: 'Availability',
  onSale: 'Sale',
  isNew: 'New',
};

/** Order the top-level color families the way the taxonomy lists them. */
const taxonomyOrder = colorFamilies.map((family) => family.name);

function sortFamilies(items) {
  return [...items].sort(
    (a, b) => taxonomyOrder.indexOf(a.label) - taxonomyOrder.indexOf(b.label)
  );
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export function createFurnitureSearch({ searchClient, indexName }) {
  const search = instantsearch({
    indexName,
    searchClient,
    routing: true, // deep-linkable SPA state, incl. the color path
    future: { preserveSharedStateOnUnmount: true },
    insights: false,
  });

  // Custom widget — multi-select across depths, facet values fetched per level
  // on expand. See src/widgets/disjunctiveColorHierarchy.js and
  // disjunctive-hierarchy.md
  const colorFacet = disjunctiveColorHierarchy({
    container: '#color-disjunctive',
    attributes: ['color.lvl0', 'color.lvl1', 'color.lvl2'],
    title: 'Color',
    limit: 8,
    maxFacetHits: 100,
    hexForValue: hexForPath,
    transformItems: (items, { level }) => (level === 0 ? sortFamilies(items) : items),
  });

  search.addWidgets([
    configure({ hitsPerPage: 24 }),

    searchBox({
      container: '#searchbox',
      placeholder: 'Search sofas, linen, walnut, indigo…',
      showReset: true,
      showSubmit: false,
      cssClasses: {
        form: 'sb-form',
        input: 'sb-input',
        reset: 'sb-reset',
        loadingIndicator: 'sb-loading',
      },
    }),

    stats({
      container: '#stats',
      templates: {
        text(data, { html }) {
          const count = data.nbHits.toLocaleString('en-US');
          return html`<span>
            <strong>${count}</strong> ${data.nbHits === 1 ? 'piece' : 'pieces'}${' '}
            <span class="results__ms">in ${data.processingTimeMS}ms</span>
          </span>`;
        },
      },
    }),

    // "Reset all" — custom, because the stock clearRefinements widget can't see
    // the color facet's `filters` string (see resetAll at the bottom of this file).
    resetAll({ container: '#clear-refinements', colorFacet, indexId: indexName }),

    currentRefinements({
      container: '#current-refinements',
      // Rename raw attributes, and show only the leaf of a hierarchical path.
      transformItems(items) {
        return items.map((item) => ({
          ...item,
          label: attributeLabels[item.attribute] ?? item.label,
          refinements: item.refinements.map((refinement) => ({
            ...refinement,
            label: String(refinement.label).split(' > ').pop(),
          })),
        }));
      },
      cssClasses: {
        list: 'chips',
        item: 'chips__group',
        category: 'chips__category',
        categoryLabel: 'chips__label',
        delete: 'chips__delete',
      },
    }),

    /* ---- the color hierarchy ------------------------------------- */

    // ---------------------------------------------------------------
    // Single-select color hierarchy — DISABLED.
    //
    // The custom widget in src/widgets/colorHierarchyMenu.js (built on
    // connectHierarchicalMenu) and its breadcrumb are commented out so the
    // multi-select widget below is the only color facet. Both are kept here
    // because they still work: uncomment to compare the two patterns, and
    // restore the `#color-breadcrumb` / `#color-hierarchy` containers in
    // index.html. Note that with both mounted they act as two independent
    // filters and AND together.
    //
    // breadcrumb({
    //   container: '#color-breadcrumb',
    //   attributes: ['color.lvl0', 'color.lvl1', 'color.lvl2'],
    //   templates: { home: 'All colors', separator: '›' },
    //   cssClasses: {
    //     list: 'bc-list',
    //     item: 'bc-item',
    //     selectedItem: 'bc-item--selected',
    //     separator: 'bc-sep',
    //     link: 'bc-link',
    //   },
    // }),
    //
    // colorHierarchyMenu({
    //   container: '#color-hierarchy',
    //   attributes: ['color.lvl0', 'color.lvl1', 'color.lvl2'],
    //   title: 'Color',
    //   limit: 6,
    //   showMore: true,
    //   showMoreLimit: 20,
    //   showParentLevel: true,
    //   transformItems: sortFamilies,
    // }),
    // ---------------------------------------------------------------

    colorFacet,

    /* ---- everything else ----------------------------------------- */

    hierarchicalMenu({
      container: '#categories',
      attributes: ['categories.lvl0', 'categories.lvl1'],
      limit: 8,
      cssClasses: {
        list: 'hm-list',
        childList: 'hm-list hm-list--child',
        item: 'hm-item',
        selectedItem: 'hm-item--selected',
        link: 'hm-link',
        label: 'hm-label',
        count: 'hm-count',
      },
    }),

    refinementList({
      container: '#type',
      attribute: 'type',
      limit: 6,
      showMore: true,
      showMoreLimit: 20,
      searchable: true,
      searchablePlaceholder: 'Find a piece…',
      cssClasses: refinementListClasses(),
    }),

    refinementList({
      container: '#material',
      attribute: 'material',
      limit: 6,
      showMore: true,
      showMoreLimit: 15,
      cssClasses: refinementListClasses(),
    }),

    refinementList({
      container: '#collection',
      attribute: 'collection',
      limit: 5,
      showMore: true,
      showMoreLimit: 15,
      cssClasses: refinementListClasses(),
    }),

    rangeInput({
      container: '#price',
      attribute: 'price',
      precision: 0,
      templates: { separatorText: 'to', submitText: 'Go' },
      cssClasses: {
        form: 'range-form',
        input: 'range-input',
        separator: 'range-sep',
        submit: 'range-submit',
      },
    }),

    ratingMenu({
      container: '#rating',
      attribute: 'rating',
      max: 5,
      cssClasses: {
        list: 'rating-list',
        item: 'rating-item',
        selectedItem: 'rating-item--selected',
        link: 'rating-link',
        starIcon: 'rating-star',
        count: 'hm-count',
      },
    }),

    toggleRefinement({
      container: '#in-stock',
      attribute: 'inStock',
      on: true,
      templates: { labelText: 'In stock only' },
      cssClasses: { label: 'toggle', checkbox: 'toggle__box' },
    }),

    toggleRefinement({
      container: '#on-sale',
      attribute: 'onSale',
      on: true,
      templates: { labelText: 'On sale' },
      cssClasses: { label: 'toggle', checkbox: 'toggle__box' },
    }),

    toggleRefinement({
      container: '#is-new',
      attribute: 'isNew',
      on: true,
      templates: { labelText: 'New arrivals' },
      cssClasses: { label: 'toggle', checkbox: 'toggle__box' },
    }),

    sortBy({
      container: '#sort-by',
      items: [
        { label: 'Featured', value: indexName },
        { label: 'Price: low to high', value: `${indexName}_price_asc` },
        { label: 'Price: high to low', value: `${indexName}_price_desc` },
      ],
      cssClasses: { select: 'select', root: 'select-root' },
    }),

    hitsPerPage({
      container: '#hits-per-page',
      items: [
        { label: '24 per page', value: 24, default: true },
        { label: '48 per page', value: 48 },
        { label: '96 per page', value: 96 },
      ],
      cssClasses: { select: 'select', root: 'select-root' },
    }),

    hits({
      container: '#hits',
      cssClasses: { list: 'grid', item: 'card-item', emptyRoot: 'grid--empty' },
      templates: {
        item(hit, { html, components }) {
          const price = hit.onSale && hit.salePrice ? hit.salePrice : hit.price;
          const glyph = roomGlyphs[hit.categories?.lvl0] ?? roomGlyphs.Living;

          return html`
            <article class="card" style="${`--card-color: ${hit.colorHex}`}">
              <div class="card__media">
                <svg
                  class="card__glyph"
                  viewBox="0 0 40 40"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.25"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  ${glyph.map((d) => html`<path d="${d}" />`)}
                </svg>
                <span class="card__material">${hit.material}</span>
                <div class="card__badges">
                  ${hit.isNew ? html`<span class="badge badge--new">New</span>` : null}
                  ${hit.onSale ? html`<span class="badge badge--sale">Sale</span>` : null}
                  ${!hit.inStock
                    ? html`<span class="badge badge--oos">Made to order</span>`
                    : null}
                </div>
              </div>

              <div class="card__body">
                <h3 class="card__name">
                  ${components.Highlight({ hit, attribute: 'name' })}
                </h3>

                <p class="card__color">
                  <span
                    class="card__dot"
                    style="${`--dot: ${hexForPath(hit.color.lvl2)}`}"
                    aria-hidden="true"
                  ></span>
                  <span class="card__colorname"
                    >${components.Highlight({ hit, attribute: 'colorName' })}</span
                  >
                  <span class="card__colorpath"
                    >${hit.colorFamily} › ${hit.colorShade}</span
                  >
                </p>

                <p class="card__desc">
                  ${components.Snippet({ hit, attribute: 'description' })}
                </p>

                <div class="card__foot">
                  <span class="card__price">
                    ${money.format(price)}
                    ${hit.onSale && hit.salePrice
                      ? html`<s class="card__was">${money.format(hit.price)}</s>`
                      : null}
                  </span>
                  <span class="card__rating" title="${`${hit.rating} out of 5`}">
                    ★ ${hit.rating}
                    <span class="card__reviews">(${hit.reviewCount})</span>
                  </span>
                </div>

                <div class="card__meta">
                  <span>${hit.dimensions.width}″ W</span>
                  <span>${hit.dimensions.depth}″ D</span>
                  <span>${hit.dimensions.height}″ H</span>
                </div>
              </div>
            </article>
          `;
        },
        empty(results, { html }) {
          return html`
            <div class="empty">
              <p class="empty__title">Nothing matches “${results.query}”.</p>
              <p>Try a color family — linen, indigo, cognac — or reset the filters.</p>
            </div>
          `;
        },
      },
    }),

    pagination({
      container: '#pagination',
      padding: 2,
      cssClasses: {
        list: 'pg-list',
        item: 'pg-item',
        selectedItem: 'pg-item--selected',
        disabledItem: 'pg-item--disabled',
        link: 'pg-link',
      },
    }),
  ]);

  return search;
}

function refinementListClasses() {
  return {
    searchableInput: 'rl-search',
    searchableSubmit: 'rl-search-hidden',
    searchableReset: 'rl-search-hidden',
    list: 'rl-list',
    item: 'rl-item',
    selectedItem: 'rl-item--selected',
    label: 'rl-label',
    checkbox: 'rl-checkbox',
    labelText: 'rl-text',
    count: 'hm-count',
    showMore: 'link-button',
    disabledShowMore: 'is-disabled',
  };
}

/**
 * "Reset all" — clears the helper's refinements *and* the multi-select color
 * facet in one ui-state write, so it costs a single search.
 *
 * `connectClearRefinements` supplies `canRefine` and the render timing, but its
 * `refine()` isn't used: it searches immediately, and pairing that with the
 * color facet's own ui-state update produced two round-trips. Rewriting the
 * index ui state once — keeping only what "reset" should preserve — does both
 * jobs in one go. (A connector's render options carry no `parent`, so the index
 * id is passed in via widgetParams.)
 */
const RESET_PRESERVES = ['query', 'sortBy', 'hitsPerPage', 'configure'];

const resetAll = connectClearRefinements((renderOptions, isFirstRender) => {
  const { canRefine, widgetParams, instantSearchInstance } = renderOptions;
  const container = document.querySelector(widgetParams.container);
  const { colorFacet, indexId } = widgetParams;

  if (isFirstRender) {
    container.innerHTML = '<button type="button" class="link-button">Reset all</button>';
    container.querySelector('button').addEventListener('click', () => {
      instantSearchInstance.setUiState((uiState) => {
        const indexUiState = uiState[indexId] ?? {};
        const kept = {};
        for (const key of RESET_PRESERVES) {
          if (indexUiState[key] !== undefined) kept[key] = indexUiState[key];
        }
        return { ...uiState, [indexId]: kept };
      });
    });
  }

  const button = container.querySelector('button');
  const enabled = canRefine || colorFacet.hasSelection();
  button.disabled = !enabled;
  button.classList.toggle('is-disabled', !enabled);
});
