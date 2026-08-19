/**
 * Pushes data/furniture-records.json + data/index-settings.json to Algolia and
 * creates the two price replicas the sort dropdown expects.
 *
 *   ALGOLIA_APP_ID=... ALGOLIA_ADMIN_KEY=... ALGOLIA_INDEX_NAME=furniture npm run push
 *
 * Reads .env if present. Uses an ADMIN key, so it never runs in the browser.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { algoliasearch } from 'algoliasearch';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so the script works with or without a shell export.
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const appId = process.env.ALGOLIA_APP_ID;
const adminKey = process.env.ALGOLIA_ADMIN_KEY;
const indexName = process.env.ALGOLIA_INDEX_NAME || 'furniture';

if (!appId || !adminKey) {
  console.error('Missing ALGOLIA_APP_ID or ALGOLIA_ADMIN_KEY (set them in .env or the environment).');
  process.exit(1);
}

const records = JSON.parse(readFileSync(join(root, 'data', 'furniture-records.json'), 'utf8'));
const settings = JSON.parse(readFileSync(join(root, 'data', 'index-settings.json'), 'utf8'));

const replicas = [`${indexName}_price_asc`, `${indexName}_price_desc`];
const client = algoliasearch(appId, adminKey);

console.log(`Configuring "${indexName}" on app ${appId}…`);
let task = await client.setSettings({
  indexName,
  indexSettings: { ...settings, replicas },
  forwardToReplicas: false,
});
await client.waitForTask({ indexName, taskID: task.taskID });

for (const replica of replicas) {
  const direction = replica.endsWith('_asc') ? 'asc' : 'desc';
  console.log(`Configuring replica "${replica}" (price ${direction})…`);
  const replicaTask = await client.setSettings({
    indexName: replica,
    indexSettings: {
      ranking: [
        `${direction}(price)`,
        'typo',
        'geo',
        'words',
        'filters',
        'proximity',
        'attribute',
        'exact',
        'custom',
      ],
    },
  });
  await client.waitForTask({ indexName: replica, taskID: replicaTask.taskID });
}

console.log(`Uploading ${records.length} records…`);
await client.replaceAllObjects({ indexName, objects: records, batchSize: 1000 });

console.log('Done. Point VITE_ALGOLIA_INDEX_NAME at', indexName);
