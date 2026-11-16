const uprightAnatomy = {
  cat: [12, 16], dog: [11, 15], rabbit: [15, 17], hamster: [10, 13],
  chinchilla: [10, 14], parrot: [9, 14]
};
const sideAnatomy = {
  guineaPig: { head: 15, feet: 11 }, turtle: { head: 19, feet: 10 },
  hedgehog: { head: 15, feet: 11 }, goldfish: { head: 16, feet: 11, tail: 7 }
};

// Each band has its own width and height so the head, torso and limbs grow at different rates.
const uprightGrowth = [
  [[.92, .92], [.73, .63], [.72, .65]],
  [[1, 1], [.96, 1], [.94, 1.4]],
  [[1.12, 1.06], [1.26, 1.28], [1.18, 1.45]]
];
const sideGrowth = [
  { head: 1, torso: .67, tail: .72, bodyHeight: .83, feet: .62 },
  { head: 1, torso: .96, tail: 1.1, bodyHeight: .98, feet: 1.38 },
  { head: 1.08, torso: 1.23, tail: 1.2, bodyHeight: 1.24, feet: 1.45 }
];

const youngChinchilla = pixelSprite(`
  ...IIII.....IIII.....
  ..IGBBGI...IGBBGI....
  .IGBBBGLIIILGBBBGI...
  .IGBBGLLLLLLLGBBGI...
  ..IGGLLLLLLLLLGGI....
  ..IGLLLLLLLLLLLGI....
  .IGLLLEELLLEELLLGI...
  .IGLLLEELLLEELLLGI...
  .IGBLLLLMCLLLLBGI....
  ..IGLLCCMCCLLLGI.....
  ...IIGGGGGGGGII...II.
  .....IGLCCLGI....IGGI
  .....IGCCCCGI...IGLGI
  .....IGGGGGGIIIIGGGI.
  ......IICICIIIIIII...
`);

function resamplePixels(values, length) {
  return Array.from({ length }, (_, index) => values[Math.floor((index + .5) * values.length / length)]);
}

function fitPixelBand(rows, widthScale, heightScale) {
  const width = Math.max(1, Math.round(rows[0].length * widthScale));
  const height = Math.max(1, Math.round(rows.length * heightScale));
  return resamplePixels(rows, height).map(row => resamplePixels(row, width).join(''));
}

function cropGrowthSprite(rows) {
  const painted = rows.filter(row => /[^.]/.test(row));
  const first = rows.indexOf(painted[0]);
  const last = rows.lastIndexOf(painted.at(-1));
  const left = Math.min(...painted.map(row => row.search(/[^.]/)));
  const right = Math.max(...painted.map(row => row.replace(/\.+$/, '').length));
  return pixelSprite(rows.slice(first, last + 1).map(row => row.slice(left, right)).join('\n'));
}

function growUpright(sprite, [head, legs], stage) {
  const bands = [sprite.pixels.slice(0, head), sprite.pixels.slice(head, legs), sprite.pixels.slice(legs)]
    .map((rows, index) => fitPixelBand(rows, ...uprightGrowth[stage][index]));
  const width = Math.max(...bands.map(band => band[0].length));
  const rows = bands.flatMap(band => band.map(row => ('.'.repeat(Math.floor((width - row.length) / 2)) + row).padEnd(width, '.')));
  return cropGrowthSprite(rows);
}

function growSideProfile(sprite, { head, feet, tail = 0 }, stage) {
  const factors = sideGrowth[stage];
  const segments = [[0, tail, factors.tail], [tail, head, factors.torso], [head, sprite.width, factors.head]]
    .filter(([start, end]) => start < end);
  const rows = sprite.pixels.map(row => segments.map(([start, end, ratio]) =>
    resamplePixels(row.slice(start, end), Math.max(1, Math.round((end - start) * ratio))).join('')).join(''));
  return cropGrowthSprite([
    ...fitPixelBand(rows.slice(0, feet), 1, factors.bodyHeight),
    ...fitPixelBand(rows.slice(feet), 1, factors.feet)
  ]);
}

const petGrowthSprites = Object.fromEntries(Object.entries(petSprites).map(([species, sprite]) => [
  species,
  [0, 1, 2].map(stage => {
    if (species === 'chinchilla' && stage === 0) return cropGrowthSprite(youngChinchilla.pixels);
    return uprightAnatomy[species] ? growUpright(sprite, uprightAnatomy[species], stage) : growSideProfile(sprite, sideAnatomy[species], stage);
  })
]));

function petGrowthSprite(species, level) {
  const stages = petGrowthSprites[species] ?? petGrowthSprites.cat;
  return stages[Math.min(stages.length, level) - 1] ?? stages[0];
}
