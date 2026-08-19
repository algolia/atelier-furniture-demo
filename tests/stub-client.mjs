/**
 * A deliberately small stand-in for the Algolia search API, backed by
 * data/furniture-records.json. Enough to render the UI offline:
 * facet filters, numeric filters, query substring matching, paging, and
 * `_highlightResult` / `_snippetResult` so the highlight components work.
 *
 * Also answers `type: 'facet'` requests (what `helper.searchForFacetValues`
 * sends on an algoliasearch v5 client) and understands the subset of the
 * `filters` grammar this app generates:
 *
 *   attr:"value"  |  (attr:"a" OR attr:"b")  joined by ' AND '
 *
 * It is NOT a faithful engine — facet counts are computed with every filter
 * applied (real Algolia excludes a facet's own disjunctive filters), so sibling
 * counts run low. Fine for asserting render + interaction behaviour.
 */
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const HIGHLIGHTED = [
  'name',
  'fullName',
  'colorName',
  'colorShade',
  'colorFamily',
  'collection',
  'type',
  'material',
  'description',
];

function matchesFacetFilters(record, facetFilters = []) {
  return facetFilters.every((clause) => {
    const ors = Array.isArray(clause) ? clause : [clause];
    return ors.some((filter) => {
      const negated = String(filter).startsWith('-');
      const [attr, value] = String(negated ? filter.slice(1) : filter).split(':');
      const hit = String(getPath(record, attr)) === value;
      return negated ? !hit : hit;
    });
  });
}

function matchesNumericFilters(record, numericFilters = []) {
  return numericFilters.every((clause) => {
    const ors = Array.isArray(clause) ? clause : [clause];
    return ors.some((filter) => {
      const [, attr, op, raw] = String(filter).match(/^(.+?)(<=|>=|!=|=|<|>)(.+)$/) ?? [];
      if (!attr) return true;
      const left = Number(getPath(record, attr));
      const right = Number(raw);
      switch (op) {
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        case '!=':
          return left !== right;
        default:
          return left === right;
      }
    });
  });
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

function parseTerm(term) {
  const match =
    term.match(/^([\w.]+)\s*:\s*"((?:[^"\\]|\\.)*)"$/) || term.match(/^([\w.]+)\s*:\s*(.+)$/);
  return match ? { attribute: match[1], value: match[2].replace(/\\"/g, '"') } : null;
}

function matchesFilters(record, filters) {
  if (!filters) return true;

  return splitTopLevel(filters, ' AND ').every((group) => {
    const inner = group.startsWith('(') && group.endsWith(')') ? group.slice(1, -1) : group;
    const terms = splitTopLevel(inner, ' OR ').map(parseTerm).filter(Boolean);
    if (terms.length === 0) return true;
    return terms.some((term) => String(getPath(record, term.attribute)) === term.value);
  });
}

function matchesQuery(record, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return HIGHLIGHTED.some((attr) => String(record[attr] ?? '').toLowerCase().includes(needle));
}

function decorate(record, query) {
  const mark = (text) => {
    const value = String(text ?? '');
    if (!query) return { value, matchLevel: 'none', matchedWords: [] };
    const at = value.toLowerCase().indexOf(query.toLowerCase());
    if (at === -1) return { value, matchLevel: 'none', matchedWords: [] };
    return {
      value:
        value.slice(0, at) +
        `<mark>${value.slice(at, at + query.length)}</mark>` +
        value.slice(at + query.length),
      matchLevel: 'full',
      matchedWords: [query],
    };
  };

  return {
    ...record,
    _highlightResult: Object.fromEntries(HIGHLIGHTED.map((a) => [a, mark(record[a])])),
    _snippetResult: { description: mark(record.description) },
  };
}

export function createStubClient(records) {
  const calls = [];

  return {
    calls,
    search(requests) {
      calls.push(requests);

      return Promise.resolve({
        results: requests.map((request) => {
          const { indexName, params = {} } = request;
          const query = params.query ?? '';

          // `helper.searchForFacetValues` on an algoliasearch v5 client.
          if (request.type === 'facet') {
            const attribute = request.facet ?? params.facetName;
            const scoped = records.filter(
              (record) =>
                matchesQuery(record, query) &&
                matchesFilters(record, params.filters) &&
                matchesFacetFilters(record, params.facetFilters) &&
                matchesNumericFilters(record, params.numericFilters)
            );

            const counts = new Map();
            for (const record of scoped) {
              const value = getPath(record, attribute);
              if (value == null) continue;
              counts.set(value, (counts.get(value) ?? 0) + 1);
            }

            const facetQuery = String(params.facetQuery ?? '').toLowerCase();
            const facetHits = [...counts.entries()]
              .filter(([value]) => !facetQuery || value.toLowerCase().includes(facetQuery))
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .slice(0, params.maxFacetHits ?? 10)
              .map(([value, count]) => ({ value, highlighted: value, count }));

            return { facetHits, exhaustiveFacetsCount: true, processingTimeMS: 1 };
          }

          let matched = records.filter(
            (record) =>
              matchesQuery(record, query) &&
              matchesFilters(record, params.filters) &&
              matchesFacetFilters(record, params.facetFilters) &&
              matchesNumericFilters(record, params.numericFilters)
          );

          if (indexName.endsWith('_price_asc')) {
            matched = [...matched].sort((a, b) => a.price - b.price);
          } else if (indexName.endsWith('_price_desc')) {
            matched = [...matched].sort((a, b) => b.price - a.price);
          }

          const facets = {};
          for (const attr of params.facets ?? []) {
            facets[attr] = {};
            for (const record of matched) {
              const value = getPath(record, attr);
              if (value == null) continue;
              facets[attr][value] = (facets[attr][value] ?? 0) + 1;
            }
          }

          const hitsPerPage = params.hitsPerPage ?? 20;
          const page = params.page ?? 0;

          return {
            index: indexName,
            hits: matched
              .slice(page * hitsPerPage, (page + 1) * hitsPerPage)
              .map((record) => decorate(record, query)),
            nbHits: matched.length,
            page,
            nbPages: Math.max(1, Math.ceil(matched.length / hitsPerPage)),
            hitsPerPage,
            facets,
            exhaustiveNbHits: true,
            exhaustiveFacetsCount: true,
            query,
            params: '',
            processingTimeMS: 1,
            renderingContent: {},
          };
        }),
      });
    },
  };
}
