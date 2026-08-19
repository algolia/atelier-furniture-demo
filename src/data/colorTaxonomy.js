/**
 * The color taxonomy that drives both the record generator and the UI swatches.
 *
 * Three levels, mirrored into every record as `color.lvl0` / `lvl1` / `lvl2`:
 *
 *   lvl0  family      "Neutrals"
 *   lvl1  sub-family  "Neutrals > Linen"
 *   lvl2  finish      "Neutrals > Linen > Belgian Linen Natural"
 *
 * `hex` at every level is what the custom hierarchy widget paints its swatches
 * with, so a family node has a representative color of its own.
 */
export const COLOR_SEPARATOR = ' > ';

export const colorFamilies = [
  {
    name: 'Neutrals',
    hex: '#D9CDBA',
    shades: [
      {
        name: 'Linen',
        hex: '#DCD3C1',
        finishes: [
          { name: 'Belgian Linen Natural', hex: '#DED6C4' },
          { name: 'Flax', hex: '#CFC0A4' },
          { name: 'Oatmeal', hex: '#C9BCA6' },
        ],
      },
      {
        name: 'Ivory',
        hex: '#EFE7D8',
        finishes: [
          { name: 'Antique White', hex: '#F1EADC' },
          { name: 'Chalk', hex: '#E8E2D5' },
          { name: 'Parchment', hex: '#E3D9C3' },
        ],
      },
      {
        name: 'Greige',
        hex: '#B8AE9F',
        finishes: [
          { name: 'Fog', hex: '#BFB6AA' },
          { name: 'Stone Greige', hex: '#ADA292' },
          { name: 'Driftwood', hex: '#9E9384' },
        ],
      },
      {
        name: 'Sand',
        hex: '#CBB89A',
        finishes: [
          { name: 'Dune', hex: '#D3C1A3' },
          { name: 'Wheat', hex: '#C4AE86' },
        ],
      },
    ],
  },
  {
    name: 'Greys',
    hex: '#8C8C8C',
    shades: [
      {
        name: 'Dove',
        hex: '#B4B4B0',
        finishes: [
          { name: 'Pearl Grey', hex: '#C2C2BE' },
          { name: 'Mist', hex: '#AFB2B0' },
        ],
      },
      {
        name: 'Pewter',
        hex: '#8A8D8F',
        finishes: [
          { name: 'Zinc', hex: '#93979A' },
          { name: 'Nickel', hex: '#7E8286' },
        ],
      },
      {
        name: 'Charcoal',
        hex: '#4A4D50',
        finishes: [
          { name: 'Graphite', hex: '#55585B' },
          { name: 'Slate', hex: '#42464A' },
          { name: 'Gunmetal', hex: '#36393C' },
        ],
      },
    ],
  },
  {
    name: 'Blues',
    hex: '#3F5B78',
    shades: [
      {
        name: 'Chambray',
        hex: '#8AA3BE',
        finishes: [
          { name: 'Powder Blue', hex: '#9DB4CC' },
          { name: 'Denim', hex: '#7591AF' },
        ],
      },
      {
        name: 'Indigo',
        hex: '#33456B',
        finishes: [
          { name: 'Midnight Navy', hex: '#232F4C' },
          { name: 'Ink Blue', hex: '#2E3C5E' },
          { name: 'Prussian', hex: '#33517A' },
        ],
      },
      {
        name: 'Teal',
        hex: '#2F6B6B',
        finishes: [
          { name: 'Lagoon', hex: '#3C8080' },
          { name: 'Deep Sea', hex: '#28565A' },
        ],
      },
    ],
  },
  {
    name: 'Greens',
    hex: '#5B7355',
    shades: [
      {
        name: 'Sage',
        hex: '#A3B096',
        finishes: [
          { name: 'Eucalyptus', hex: '#AEBBA4' },
          { name: 'Willow', hex: '#94A388' },
        ],
      },
      {
        name: 'Olive',
        hex: '#6E7248',
        finishes: [
          { name: 'Moss', hex: '#6B7350' },
          { name: 'Fern', hex: '#7C8354' },
        ],
      },
      {
        name: 'Forest',
        hex: '#2F4A38',
        finishes: [
          { name: 'Pine', hex: '#35543F' },
          { name: 'Hunter', hex: '#27402F' },
        ],
      },
    ],
  },
  {
    name: 'Browns',
    hex: '#7A5233',
    shades: [
      {
        name: 'Camel',
        hex: '#B78B5C',
        finishes: [
          { name: 'Tobacco', hex: '#A87A4C' },
          { name: 'Chestnut', hex: '#8F5F3A' },
        ],
      },
      {
        name: 'Cognac',
        hex: '#8B4F2B',
        finishes: [
          { name: 'Saddle', hex: '#8A5533' },
          { name: 'Whiskey', hex: '#A05F30' },
        ],
      },
      {
        name: 'Espresso',
        hex: '#3E2A20',
        finishes: [
          { name: 'Walnut', hex: '#4C3427' },
          { name: 'Chocolate', hex: '#3A271D' },
          { name: 'Reclaimed Oak', hex: '#6B5240' },
        ],
      },
    ],
  },
  {
    name: 'Reds & Pinks',
    hex: '#9E4B3F',
    shades: [
      {
        name: 'Terracotta',
        hex: '#B4623F',
        finishes: [
          { name: 'Clay', hex: '#BE7050' },
          { name: 'Rust', hex: '#A2512F' },
        ],
      },
      {
        name: 'Blush',
        hex: '#DBB3AE',
        finishes: [
          { name: 'Rose Quartz', hex: '#E2C0BB' },
          { name: 'Petal', hex: '#D3A39D' },
        ],
      },
      {
        name: 'Burgundy',
        hex: '#6B2732',
        finishes: [
          { name: 'Merlot', hex: '#762C38' },
          { name: 'Oxblood', hex: '#5A1F28' },
        ],
      },
    ],
  },
  {
    name: 'Yellows',
    hex: '#C99B40',
    shades: [
      {
        name: 'Ochre',
        hex: '#C08A2E',
        finishes: [
          { name: 'Mustard', hex: '#B98A22' },
          { name: 'Amber', hex: '#CC9333' },
        ],
      },
      {
        name: 'Butter',
        hex: '#E4CE96',
        finishes: [
          { name: 'Honey', hex: '#DDBE74' },
          { name: 'Straw', hex: '#E8D8A8' },
        ],
      },
    ],
  },
  {
    name: 'Black & White',
    hex: '#1F1F1F',
    shades: [
      {
        name: 'Black',
        hex: '#1A1A1A',
        finishes: [
          { name: 'Onyx', hex: '#141414' },
          { name: 'Ink', hex: '#22252A' },
        ],
      },
      {
        name: 'White',
        hex: '#F7F5F1',
        finishes: [
          { name: 'Snow', hex: '#FBFAF8' },
          { name: 'Cotton', hex: '#F2EFE9' },
        ],
      },
    ],
  },
];

/**
 * Flat lookup of every hierarchy path -> { hex, level, label }.
 * Keys are exactly the facet values Algolia returns for color.lvl0/1/2, which is
 * what lets the custom widget resolve a swatch color from an `item.value`.
 */
export const colorPathIndex = (() => {
  const index = Object.create(null);

  for (const family of colorFamilies) {
    index[family.name] = { hex: family.hex, level: 0, label: family.name };

    for (const shade of family.shades) {
      const shadePath = `${family.name}${COLOR_SEPARATOR}${shade.name}`;
      index[shadePath] = { hex: shade.hex, level: 1, label: shade.name };

      for (const finish of shade.finishes) {
        const finishPath = `${shadePath}${COLOR_SEPARATOR}${finish.name}`;
        index[finishPath] = { hex: finish.hex, level: 2, label: finish.name };
      }
    }
  }

  return index;
})();

/** Every leaf finish, flattened, with its full hierarchy pre-built. */
export const colorFinishes = colorFamilies.flatMap((family) =>
  family.shades.flatMap((shade) =>
    shade.finishes.map((finish) => ({
      family: family.name,
      shade: shade.name,
      finish: finish.name,
      hex: finish.hex,
      lvl0: family.name,
      lvl1: `${family.name}${COLOR_SEPARATOR}${shade.name}`,
      lvl2: `${family.name}${COLOR_SEPARATOR}${shade.name}${COLOR_SEPARATOR}${finish.name}`,
    }))
  )
);

export function hexForPath(path) {
  return colorPathIndex[path]?.hex ?? '#CCCCCC';
}
