/**
 * Entry point: resolve credentials, build the Algolia client, hand it to the
 * widget wiring in src/search.js, and run the small bits of SPA chrome.
 */
import { liteClient as algoliasearch } from 'algoliasearch/lite';

import { createFurnitureSearch } from './search.js';
import './style.css';

const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const searchKey = import.meta.env.VITE_ALGOLIA_SEARCH_KEY;
const indexName = import.meta.env.VITE_ALGOLIA_INDEX_NAME || 'furniture';

const configured = Boolean(appId && searchKey && !appId.startsWith('YOUR_'));

if (configured) {
  const search = createFurnitureSearch({
    searchClient: algoliasearch(appId, searchKey),
    indexName,
  });
  search.start();
} else {
  renderSetupNotice();
}

function renderSetupNotice() {
  document.querySelector('#hits').innerHTML = `
    <div class="setup">
      <h2>Almost there</h2>
      <p>This demo needs an Algolia index. From the project root:</p>
      <ol>
        <li><code>cp .env.example .env</code> and fill in your credentials</li>
        <li><code>npm run generate</code> — writes <code>data/furniture-records.json</code></li>
        <li><code>npm run push</code> — uploads records + index settings + price replicas</li>
        <li><code>npm run dev</code> again</li>
      </ol>
      <p class="setup__note">
        Prefer the dashboard? Import <code>data/furniture-records.json</code> and paste
        <code>data/index-settings.json</code> into the index configuration, then create the
        <code>${indexName}_price_asc</code> / <code>${indexName}_price_desc</code> replicas.
      </p>
    </div>`;
  document.querySelector('#filters').hidden = true;
}

/* ------------------------------------------------------------------ */
/* Mobile filter drawer                                                */
/* ------------------------------------------------------------------ */

const filtersToggle = document.querySelector('#filters-toggle');
filtersToggle?.addEventListener('click', () => {
  const open = document.body.classList.toggle('filters-open');
  filtersToggle.setAttribute('aria-expanded', String(open));
});
