/**
 * Builds data/furniture-records.json — the record set you import into Algolia.
 *
 * Deterministic: a seeded PRNG means re-running produces byte-identical output,
 * so the JSON stays diff-able instead of churning on every run.
 *
 *   npm run generate
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { colorFinishes } from '../src/data/colorTaxonomy.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

/* ------------------------------------------------------------------ */
/* Seeded PRNG                                                         */
/* ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260819);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + rand() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const chance = (p) => rand() < p;

/* ------------------------------------------------------------------ */
/* Catalog definition                                                  */
/* ------------------------------------------------------------------ */

// Which color families read as plausible for a given material.
const familiesByMaterial = {
  'Belgian Linen': ['Neutrals', 'Greys', 'Blues', 'Greens', 'Reds & Pinks', 'Black & White'],
  'Performance Velvet': ['Blues', 'Greens', 'Reds & Pinks', 'Greys', 'Yellows', 'Black & White'],
  Bouclé: ['Neutrals', 'Greys', 'Black & White', 'Yellows'],
  'Italian Leather': ['Browns', 'Greys', 'Black & White', 'Reds & Pinks'],
  'Perennials Weave': ['Neutrals', 'Greys', 'Blues', 'Greens'],
  Cotton: ['Neutrals', 'Blues', 'Greys', 'Black & White'],
  'Reclaimed Oak': ['Browns', 'Neutrals', 'Greys'],
  Walnut: ['Browns', 'Black & White'],
  'Carrara Marble': ['Neutrals', 'Greys', 'Black & White'],
  'Antiqued Brass': ['Yellows', 'Browns', 'Greys'],
  Rattan: ['Neutrals', 'Browns', 'Yellows'],
  'Hand-Knotted Wool': ['Neutrals', 'Greys', 'Blues', 'Greens', 'Reds & Pinks', 'Browns'],
};

const productTypes = [
  {
    type: 'Sofa',
    lvl0: 'Living',
    lvl1: 'Living > Sofas',
    price: [2495, 8990],
    materials: ['Belgian Linen', 'Performance Velvet', 'Bouclé', 'Italian Leather', 'Perennials Weave'],
    collections: ['Cloud', 'Maxwell', 'Belgian Track Arm', 'Milano', 'Sundance'],
    dims: [[84, 108], [38, 46], [26, 34]],
  },
  {
    type: 'Sectional',
    lvl0: 'Living',
    lvl1: 'Living > Sectionals',
    price: [4995, 14500],
    materials: ['Belgian Linen', 'Performance Velvet', 'Bouclé', 'Italian Leather'],
    collections: ['Cloud', 'Maxwell', 'Belgian Track Arm', 'Milano'],
    dims: [[112, 168], [64, 96], [26, 34]],
  },
  {
    type: 'Lounge Chair',
    lvl0: 'Living',
    lvl1: 'Living > Chairs',
    price: [1195, 4290],
    materials: ['Belgian Linen', 'Performance Velvet', 'Bouclé', 'Italian Leather', 'Rattan'],
    collections: ['Devon', 'Martens', 'Balmain', 'Sundance'],
    dims: [[28, 40], [30, 40], [28, 36]],
  },
  {
    type: 'Ottoman',
    lvl0: 'Living',
    lvl1: 'Living > Ottomans',
    price: [595, 2290],
    materials: ['Belgian Linen', 'Performance Velvet', 'Bouclé', 'Italian Leather'],
    collections: ['Cloud', 'Devon', 'Milano'],
    dims: [[24, 48], [20, 32], [15, 19]],
  },
  {
    type: 'Coffee Table',
    lvl0: 'Living',
    lvl1: 'Living > Tables',
    price: [995, 5490],
    materials: ['Reclaimed Oak', 'Walnut', 'Carrara Marble', 'Antiqued Brass'],
    collections: ['Aspen', 'Reclaimed Russian Oak', 'Milano', 'Martens'],
    dims: [[40, 60], [24, 40], [14, 18]],
  },
  {
    type: 'Console Table',
    lvl0: 'Living',
    lvl1: 'Living > Tables',
    price: [1195, 4890],
    materials: ['Reclaimed Oak', 'Walnut', 'Carrara Marble', 'Antiqued Brass'],
    collections: ['Aspen', 'Reclaimed Russian Oak', 'Balmain'],
    dims: [[48, 84], [14, 20], [30, 34]],
  },
  {
    type: 'Media Console',
    lvl0: 'Living',
    lvl1: 'Living > Storage',
    price: [1795, 6490],
    materials: ['Reclaimed Oak', 'Walnut', 'Antiqued Brass'],
    collections: ['Aspen', 'Reclaimed Russian Oak', 'Martens'],
    dims: [[60, 96], [16, 22], [24, 30]],
  },
  {
    type: 'Dining Table',
    lvl0: 'Dining',
    lvl1: 'Dining > Tables',
    price: [1995, 9990],
    materials: ['Reclaimed Oak', 'Walnut', 'Carrara Marble'],
    collections: ['Aspen', 'Reclaimed Russian Oak', 'Milano', 'Balmain'],
    dims: [[72, 120], [36, 48], [29, 31]],
  },
  {
    type: 'Dining Chair',
    lvl0: 'Dining',
    lvl1: 'Dining > Seating',
    price: [395, 1890],
    materials: ['Belgian Linen', 'Italian Leather', 'Performance Velvet', 'Rattan', 'Walnut'],
    collections: ['Devon', 'Martens', 'Balmain', 'Milano'],
    dims: [[18, 24], [20, 26], [32, 40]],
  },
  {
    type: 'Bar Stool',
    lvl0: 'Dining',
    lvl1: 'Dining > Seating',
    price: [445, 1590],
    materials: ['Italian Leather', 'Belgian Linen', 'Rattan', 'Antiqued Brass'],
    collections: ['Devon', 'Martens', 'Aspen'],
    dims: [[16, 22], [18, 24], [26, 30]],
  },
  {
    type: 'Bench',
    lvl0: 'Dining',
    lvl1: 'Dining > Seating',
    price: [695, 2490],
    materials: ['Belgian Linen', 'Italian Leather', 'Reclaimed Oak', 'Bouclé'],
    collections: ['Aspen', 'Devon', 'Sundance'],
    dims: [[48, 72], [14, 20], [17, 19]],
  },
  {
    type: 'Bed',
    lvl0: 'Bedroom',
    lvl1: 'Bedroom > Beds',
    price: [2295, 8490],
    materials: ['Belgian Linen', 'Performance Velvet', 'Bouclé', 'Italian Leather', 'Walnut'],
    collections: ['Cloud', 'Devon', 'Balmain', 'Sundance'],
    dims: [[64, 84], [84, 92], [42, 60]],
  },
  {
    type: 'Nightstand',
    lvl0: 'Bedroom',
    lvl1: 'Bedroom > Storage',
    price: [795, 3290],
    materials: ['Reclaimed Oak', 'Walnut', 'Carrara Marble', 'Rattan'],
    collections: ['Aspen', 'Reclaimed Russian Oak', 'Martens'],
    dims: [[20, 32], [16, 20], [24, 30]],
  },
  {
    type: 'Dresser',
    lvl0: 'Bedroom',
    lvl1: 'Bedroom > Storage',
    price: [1895, 7490],
    materials: ['Reclaimed Oak', 'Walnut', 'Rattan'],
    collections: ['Aspen', 'Reclaimed Russian Oak', 'Balmain'],
    dims: [[52, 76], [18, 22], [32, 38]],
  },
  {
    type: 'Desk',
    lvl0: 'Office',
    lvl1: 'Office > Desks',
    price: [1495, 5990],
    materials: ['Reclaimed Oak', 'Walnut', 'Carrara Marble', 'Antiqued Brass'],
    collections: ['Aspen', 'Martens', 'Balmain'],
    dims: [[54, 84], [26, 34], [29, 31]],
  },
  {
    type: 'Rug',
    lvl0: 'Rugs & Decor',
    lvl1: 'Rugs & Decor > Rugs',
    price: [695, 6990],
    materials: ['Hand-Knotted Wool', 'Perennials Weave', 'Cotton'],
    collections: ['Sundance', 'Milano', 'Balmain'],
    dims: [[96, 168], [120, 240], [0.5, 1]],
  },
];

const designers = ['Studio Halden', 'Marta Ruiz', 'Atelier Fournier', 'Oskar Lindqvist', 'RH Atelier'];

const copy = {
  Sofa: 'A deep-seated silhouette with a loose back cushion and a tailored, hand-finished skirt.',
  Sectional: 'Modular components let the configuration follow the room instead of fighting it.',
  'Lounge Chair': 'A low, enveloping shell balanced on a slender hardwood frame.',
  Ottoman: 'Doubles as a footrest or occasional seat, upholstered to match or contrast.',
  'Coffee Table': 'A solid slab top over a sculpted plinth base, waxed by hand.',
  'Console Table': 'A narrow profile built for entries and behind-the-sofa placement.',
  'Media Console': 'Soft-close drawers with integrated cord management behind a solid front.',
  'Dining Table': 'A generous top on a trestle base, finished to reveal the grain.',
  'Dining Chair': 'A supportive back and a webbed seat platform for long dinners.',
  'Bar Stool': 'Counter and bar heights with a footrest and reinforced joinery.',
  Bench: 'A clean, backless form for the foot of a bed or the length of a table.',
  Bed: 'A tall upholstered headboard with a fully wrapped rail and slat system.',
  Nightstand: 'Two drawers and an open shelf sized for a bedside stack.',
  Dresser: 'Six drawers on full-extension glides in a solid, dovetailed case.',
  Desk: 'A writing surface with a shallow drawer and a cable pass-through.',
  Rug: 'Hand-knotted pile with an abrash that shifts subtly across the field.',
};

/* ------------------------------------------------------------------ */
/* Record assembly                                                     */
/* ------------------------------------------------------------------ */

const round = (n, step) => Math.round(n / step) * step;

const records = [];
let n = 0;

for (const product of productTypes) {
  for (const collection of product.collections) {
    const material = pick(product.materials);
    const allowedFamilies = familiesByMaterial[material];
    const eligible = colorFinishes.filter((c) => allowedFamilies.includes(c.family));

    // 4-7 colorways per collection, no repeats within the collection.
    const wanted = intBetween(4, 7);
    const chosen = [];
    const seen = new Set();
    let guard = 0;
    while (chosen.length < wanted && guard++ < 200) {
      const candidate = pick(eligible);
      if (seen.has(candidate.lvl2)) continue;
      seen.add(candidate.lvl2);
      chosen.push(candidate);
    }

    const basePrice = round(between(product.price[0], product.price[1]), 5);

    for (const color of chosen) {
      n += 1;
      const price = round(basePrice * between(0.92, 1.14), 5);
      const onSale = chance(0.22);
      const salePrice = onSale ? round(price * between(0.65, 0.85), 5) : null;
      const rating = Number(between(3.4, 5).toFixed(1));
      const [w, d, h] = product.dims;

      records.push({
        objectID: `furn-${String(n).padStart(4, '0')}`,
        sku: `${collection.slice(0, 3).toUpperCase()}-${product.type.slice(0, 3).toUpperCase()}-${String(n).padStart(4, '0')}`,
        name: `${collection} ${product.type}`,
        fullName: `${collection} ${product.type} in ${color.finish} ${material}`,
        description: copy[product.type],
        collection,
        type: product.type,
        categories: { lvl0: product.lvl0, lvl1: product.lvl1 },

        // --- the multi-level color hierarchy -------------------------
        color: { lvl0: color.lvl0, lvl1: color.lvl1, lvl2: color.lvl2 },
        colorFamily: color.family,
        colorShade: color.shade,
        colorName: color.finish,
        colorHex: color.hex,
        // ------------------------------------------------------------

        material,
        designer: pick(designers),
        price,
        onSale,
        salePrice,
        currency: 'USD',
        rating,
        reviewCount: intBetween(3, 480),
        inStock: chance(0.78),
        isNew: chance(0.18),
        madeToOrder: chance(0.35),
        leadTimeWeeks: intBetween(2, 14),
        dimensions: {
          width: Number(between(w[0], w[1]).toFixed(1)),
          depth: Number(between(d[0], d[1]).toFixed(1)),
          height: Number(between(h[0], h[1]).toFixed(1)),
          unit: 'in',
        },
        popularity: intBetween(1, 100),
      });
    }
  }
}

const outFile = join(outDir, 'furniture-records.json');
writeFileSync(outFile, `${JSON.stringify(records, null, 2)}\n`);

const families = new Set(records.map((r) => r.color.lvl0));
const shades = new Set(records.map((r) => r.color.lvl1));
const finishes = new Set(records.map((r) => r.color.lvl2));

console.log(`Wrote ${records.length} records -> ${outFile}`);
console.log(`  color families:   ${families.size}`);
console.log(`  color sub-families: ${shades.size}`);
console.log(`  color finishes:   ${finishes.size}`);
