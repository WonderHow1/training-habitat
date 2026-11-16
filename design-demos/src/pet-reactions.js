function patchPetSprite(species, row, column, patch) {
  const pixels = [...petSprites[species].pixels];
  patch.forEach((strip, offset) => {
    const line = pixels[row + offset];
    pixels[row + offset] = line.slice(0, column) + strip + line.slice(column + strip.length);
  });
  return pixelSprite(pixels.join('\n'));
}

const catStretch = pixelSprite(`
  ....................II...
  ...................IGI...
  .................IIGLI...
  ..............IIIGLLI....
  ....I...I..IIIGLLLGI.....
  ...IGI.IGIIGLLLLLLLI.....
  ..IGLIIIGLLLLCCCCCLGI....
  .IGLLLLLLLLLCCCCCCCGI....
  .IGLMLMLCLLLCCCCCCLGI....
  .IGBLLLMCGLLLGIIIIII.....
  ..IGLLLCCGIIGI....IGI....
  ..IIIGGGGGGIII....IGI....
  .ICCGIIIICCGII....ICI....
  .IIII....IIII.....III....
`);
const catReach = pixelSprite([...catStretch.pixels.slice(0, 11),
  '.IIIIGGGGGGIII....IGI....', 'ICCCGIIIIICCGI....ICI....', 'IIIII.....IIII.....III....'
].join('\n'));

const dogTailUp = patchPetSprite('dog', 9, 17, [
  '....II', '...IGI', '..IGLI', '..IGLI', '.IGGI.', '.IGGI.', 'IGGI..', 'GI....'
]);
const dogTailLow = patchPetSprite('dog', 9, 17, [
  '......', '......', '......', '......', '....II', '...IGI', 'GGGGI.', 'GI....'
]);

const rabbitCrouch = pixelSprite(petSprites.rabbit.pixels.filter((_, row) => ![4, 16, 17].includes(row)).join('\n'));

const hamsterPuff = patchPetSprite('hamster', 7, 0, [
  'IGBBBBLLLCCCLLLBBBBLLGI',
  'IGBBCCLLCCMCCLLCCBBGGGI',
  'IGBBCCLCCCMCCCLCCBBGGGI',
  'IGGCCCCCCCCCCCCCCCGGGGI'
]);
const hamsterChew = { ...hamsterPuff, pixels: hamsterPuff.pixels.map((row, index) =>
  index === 8 ? row.replace('CCMCC', 'CMMMC') : row) };

const guineaSqueak = patchPetSprite('guineaPig', 7, 19, [
  'LBBMI', 'LMMMI', 'CMBMI', 'CGGGI'
]);

const chinchillaRoll = pixelSprite(`
  ........IIIIII.........
  .....IIIGGGGGGIII......
  ...IIGGLLGGGGLLGGII....
  ..IGGLLLLCCCLLLLGGGI...
  .IGLLLCCCCCCCCCCLLGGI..
  IGLCCCCWCCCCCCWCCCLGGI.
  IGLLCCCLLLCCCLLLCCCGGI.
  .IGGLCCCCCMMCCCCLCGGGI.
  ..IIGGCCCCCCCCCGGGGII..
  ....IIGGGGGGGGGGGII....
  ......IIIIIIIIIII......
`);

const parrotWings = pixelSprite(`
  ..............II.........
  .............IGII........
  ............IGLGI........
  ...........IGLLLLIII.....
  .II.......IGLLLLLCCCI....
  IGGI.....IGLLLLLCCEEBI...
  ILLGI...IGLLLLLLCCEEBBI..
  .IGLGI.IGLLLLLLLLCCBBBI..
  ..IGLGIGLLLLLLLLLCCMMI...
  ...IGLLLGGGLLLLLLCCGI....
  ....IGLLLLGLGLLLLCGI.....
  .....IGGLLLGLGLLCGI......
  ......IIGGGLGLLCGI.......
  .......IIIGLLLLCGI.......
  .......IGLLLLLCGI........
  .......IGGGGGGI..........
  .........IBBIBBI.........
  ..........II.II..........
`);

const turtlePeek = patchPetSprite('turtle', 5, 19, [
  'CI...', 'GIILI', 'GIILI', 'GGILI', 'GIIGI', 'IIGI.'
]);
const turtleShell = pixelSprite(`
  .........IIIIII.........
  .......IIGGCCGGII.......
  .....IIGCLCCCCLCGII.....
  ....IGCLCCCCCCCCLCGI....
  ...IGCLCCCGGCCCCCLCGI...
  ..IGCLCCGLCCLGCCCCLCGI..
  ..IGCLCCGLCCLGCCCCLGGI..
  .IGCCLCCCGGCCCCCLCCGGI..
  .IGGCCCCCLLCCCCCCGGGGI..
  ..IGGGGGGGGGGGGGGGGII...
  ...IIIIIIIIIIIIIIIII....
`);

const hedgehogBall = pixelSprite(`
  .......I.I.I........
  .....IIGIGII........
  ....IGGGCGGGIII.....
  ..IIGCGGGCGGGGI....
  ..IGGGCGGGCGGGGII..
  .IGCGGGGGCGGGGCGI..
  .IGGGCGGGGGCGGGGII.
  .IGCGGGCGGGGCGGGGI.
  .IGGGCGGGGGGGCGGGI.
  ..IGGGGGCGGGGGGGI..
  ...IIGGGGGGGGGII...
  .....IIIIIIIII.....
`);

const petReactionEffects = {
  note: { color: '#654a8a', pixels: ['..###', '..#..', '..#..', '.##..', '###..', '.#...'] },
  dust: { color: '#d4a576', pixels: ['.#.....#', '...##...', '......#.', '#...#...'] },
  bubbles: { color: '#3c91b4', pixels: ['.##...', '#..#..', '.##...', '.....#', '....#.', '......'] }
};

const petReactions = {
  cat: {
    still: { sprite: catStretch },
    frames: [
      { sprite: catStretch, duration: 185 }, { sprite: catReach, duration: 490 },
      { sprite: catStretch, duration: 180 }, { blink: true, duration: 140 }
    ]
  },
  dog: {
    still: { sprite: dogTailUp },
    frames: Array.from({ length: 8 }, (_, index) => ({ sprite: index % 2 ? dogTailLow : dogTailUp, duration: 95 }))
  },
  rabbit: {
    still: { sprite: rabbitCrouch },
    frames: [
      { sprite: rabbitCrouch, duration: 100 }, { y: -5, duration: 95 }, { y: -8, duration: 115 },
      { y: -4, duration: 95 }, { sprite: rabbitCrouch, duration: 90 }, { y: -4, duration: 95 },
      { y: -6, duration: 105 }, { y: -2, duration: 90 }, { sprite: rabbitCrouch, duration: 110 }
    ]
  },
  hamster: {
    still: { sprite: hamsterPuff },
    frames: Array.from({ length: 6 }, (_, index) => ({ sprite: index % 2 ? hamsterChew : hamsterPuff, duration: 125 }))
  },
  guineaPig: {
    still: { sprite: guineaSqueak },
    frames: [
      { sprite: guineaSqueak, effect: ['note', 24, 7], duration: 160 }, { effect: ['note', 25, 4], duration: 145 },
      { sprite: guineaSqueak, effect: ['note', 25, 2], duration: 185 }, { effect: ['note', 26, 0], duration: 140 }
    ]
  },
  chinchilla: {
    still: { sprite: chinchillaRoll },
    frames: [
      { sprite: chinchillaRoll, x: -2, effect: ['dust', -3, 17], duration: 185 },
      { sprite: chinchillaRoll, x: 2, flip: true, effect: ['dust', 20, 16], duration: 185 },
      { sprite: chinchillaRoll, x: -1, effect: ['dust', 3, 14], duration: 185 },
      { effect: ['dust', 20, 16], duration: 160 }
    ]
  },
  parrot: {
    still: { sprite: parrotWings },
    frames: Array.from({ length: 7 }, (_, index) => ({ sprite: index % 2 ? undefined : parrotWings, duration: 105 }))
  },
  turtle: {
    still: { sprite: turtleShell },
    frames: [{ sprite: turtlePeek, duration: 135 }, { sprite: turtleShell, duration: 600 }, { sprite: turtlePeek, duration: 170 }]
  },
  hedgehog: {
    still: { sprite: hedgehogBall },
    frames: [
      { sprite: hedgehogBall, duration: 150 }, { sprite: hedgehogBall, x: -3, flip: true, duration: 150 },
      { sprite: hedgehogBall, x: -5, duration: 165 }, { sprite: hedgehogBall, x: -3, flip: true, duration: 145 },
      { sprite: hedgehogBall, x: -1, duration: 125 }
    ]
  },
  goldfish: {
    still: { effect: ['bubbles', 23, 3] },
    frames: [
      { x: -2, flip: true, effect: ['bubbles', 0, 6], duration: 150 },
      { x: -3, y: -3, flip: true, effect: ['bubbles', 1, 2], duration: 180 },
      { x: 1, y: -3, effect: ['bubbles', 23, 5], duration: 180 },
      { x: 3, y: -1, effect: ['bubbles', 24, 2], duration: 150 },
      { y: -1, effect: ['bubbles', 24, 0], duration: 150 }
    ]
  }
};
