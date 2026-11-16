const sprite = [
  '.......II.......II.......',
  '......IGGI.....IGGI......',
  '.....IGGGGI...IGGGGI.....',
  '.....IGLLLGIIIGLLLGI.....',
  '....IGLLLLLLLLLLLLLLI....',
  '...IGLLLLLLLLLLLLLLLGI...',
  '..IGLLLLLLLLLLLLLLLLLGI..',
  '..IGLLLWLLLWLLLWLLLLGI..',
  '.IGLLLLLLLLLLLLLLLLLLLGI.',
  '.IGLLLLKKLLLLLLKKLLLLLGI.',
  '.IGLLLLKWLLLLLLKWLLLLLGI.',
  '.IGLLLLKKLLLLLLKKLLLLLGI.',
  '.IGLBBLLLLLLLLLLLLBBLLGI.',
  '.IGLBBLLLKKLKKLLLLBBLLGI.',
  '..IGLLLLLLKKKLLLLLLLLGI..',
  '..IGGGLLLLLLLLLLLLLGGI...',
  '...IGGGLLLLLLLLLLLGGI....',
  '....IGGLLLLLLLLLLLGI.....',
  '....IGLLLLLCCLLLLLGI.....',
  '...IGLLLLLCCCCLLLLLGI....',
  '...IGLLLLLLCCLLLLLLGI....',
  '....IGGGGGGGGGGGGGGI.....',
  '.....IIIIGIIIIIGIII......',
  '........II.....II........'
];
const palettes = {
  garden: { sky: '#b9dbe0', haze: '#d7e8d4', cloud: '#f5f2d5', far: '#94baa5', mid: '#73a783', trees: '#438263', land: '#84ab56', lit: '#b3cb72', turf: '#71944a', shore: '#a8c4be', water: '#80bdad', wave: '#bedfd0', flower: '#f9df95' },
  track: { sky: '#393758', haze: '#55486f', cloud: '#6f6688', far: '#555676', mid: '#4d607c', trees: '#3d506f', land: '#60767d', lit: '#93a697', turf: '#4e626d', shore: '#7999a7', water: '#596e98', wave: '#8f9dbb', flower: '#dec7f0' },
  diary: { sky: '#c2cbed', haze: '#e7dff7', cloud: '#f9edef', far: '#a7b1d1', mid: '#909cc3', trees: '#6d82ae', land: '#a2afc5', lit: '#c6cfdb', turf: '#879bbb', shore: '#c5cef0', water: '#a1b9df', wave: '#e3e8fb', flower: '#f8e4ab' },
  studio: { sky: '#edc39c', haze: '#f1d3ac', cloud: '#fff0d0', far: '#d1a381', mid: '#ba917c', trees: '#927757', land: '#c6a574', lit: '#dec08a', turf: '#af9469', shore: '#e1cbaa', water: '#ceae92', wave: '#efdbc5', flower: '#fbecba' },
  clay: { sky: '#dfbfae', haze: '#f1d9be', cloud: '#ffeecc', far: '#b58d86', mid: '#af786a', trees: '#865f58', land: '#c58d72', lit: '#eab68a', turf: '#aa745b', shore: '#cca58d', water: '#bd938b', wave: '#ebcbb7', flower: '#fff2d6' },
  signal: { sky: '#b9d8ce', haze: '#cce5dc', cloud: '#e3fbec', far: '#85afac', mid: '#709596', trees: '#4e767a', land: '#80a99a', lit: '#a1c5a8', turf: '#6d978a', shore: '#b5d6d0', water: '#92b6bf', wave: '#c6e0dc', flower: '#fae5ac' }
};

function paintPet(ctx, x, y, scale, level, faded) {
  const colors = { I: '#573851', G: '#c8788d', L: '#e5a3ad', B: '#f6c3ae', W: '#fff2d8', K: '#382843', C: '#f9d6c2' };
  ctx.save();
  if (faded) ctx.globalAlpha = 0.32;
  sprite.forEach((row, j) => [...row].forEach((color, i) => {
    if (color === '.') return;
    ctx.fillStyle = colors[color];
    ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
  }));
  if (level > 1) {
    ctx.fillStyle = '#6c6564';
    ctx.fillRect(x + 5 * scale, y + 15 * scale, 15 * scale, 2 * scale);
    ctx.fillStyle = '#f6d77d';
    ctx.fillRect(x + 5 * scale, y + 15 * scale, 14 * scale, scale);
    ctx.fillRect(x + 16 * scale, y + 16 * scale, 3 * scale, 3 * scale);
  }
  if (level > 2) {
    ctx.fillStyle = '#8da55b';
    ctx.fillRect(x + 11 * scale, y - 2 * scale, scale, 5 * scale);
    ctx.fillRect(x + 12 * scale, y - 2 * scale, 4 * scale, 2 * scale);
  }
  ctx.restore();
}

function drawScene(canvas) {
  const ctx = canvas.getContext('2d');
  const p = palettes[canvas.dataset.palette];
  const compact = canvas.hasAttribute('data-avatar');
  const wide = canvas.hasAttribute('data-wide');
  const level = Number(canvas.dataset.level ?? 1);
  const faded = canvas.dataset.faded === 'true';
  const box = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  if (compact) {
    paintPet(ctx, 4, 5, 1, level, faded);
    return;
  }
  box(0, 0, 144, 83, p.sky);
  box(0, 18, 144, 46, p.haze);
  const night = canvas.dataset.palette === 'track';
  if (night) {
    box(107, 8, 8, 11, '#e5d8bc');
    box(105, 10, 12, 7, '#e5d8bc');
    box(111, 7, 6, 7, p.sky);
    for (const [x, y] of [[10, 10], [27, 15], [37, 4], [69, 8], [90, 13], [132, 8]]) box(x, y, 1, 1, '#efe2b9');
  } else {
    for (const [x, y, w] of [[7, 11, 27], [63, 5, 21], [104, 14, 32]]) {
      box(x, y, w, 3, p.cloud);
      box(x + 5, y - 3, w - 10, 4, p.cloud);
      box(x + 10, y - 5, 9, 3, p.cloud);
    }
  }
  for (let x = 0; x < 144; x += 3) {
    const y = 33 - Math.round((Math.sin(x / 11) + Math.sin(x / 29)) * 4);
    box(x, y, 3, 25, p.far);
    const y2 = 40 - Math.round((Math.sin(x / 9 + 2) + Math.sin(x / 26)) * 3);
    box(x, y2, 3, 21, p.mid);
  }
  const tree = (x, y, size) => {
    box(x, y + size, size, size * 2, p.trees);
    box(x - size, y + size * 2, size * 3, size * 2, p.trees);
    box(x - size * 2, y + size * 3, size * 5, size, p.trees);
    box(x, y + size * 4, size, 3, p.turf);
  };
  [[4, 24, 4], [15, 28, 3], [25, 31, 2], [137, 24, 4], [126, 30, 3], [116, 34, 2]].forEach(([x, y, s]) => tree(x, y, s));
  box(0, 44, 144, 39, p.land);
  for (let y = 48; y < 87; y += 3) {
    const left = 109 - Math.round((y - 47) * 1.72) + (y % 8);
    box(left, y, 144 - left, 3, p.shore);
    box(left + 3, y, 144 - left, 3, p.water);
  }
  for (const [x, y, w] of [[115, 53, 13], [127, 61, 8], [106, 65, 9], [92, 72, 17], [77, 80, 14], [124, 77, 13], [139, 70, 5]]) box(x, y, w, 1, p.wave);
  for (const [x, y] of [[6, 53], [11, 69], [22, 50], [25, 76], [38, 63], [45, 51], [55, 69], [16, 80], [84, 51], [102, 44], [1, 76], [67, 76]]) {
    box(x, y, 4, 1, p.turf);
    box(x + 2, y - 2, 1, 2, p.turf);
    box(x + 1, y - 2, 1, 1, p.lit);
  }
  for (const [x, y] of [[17, 57], [30, 69], [41, 74], [45, 76], [9, 64], [51, 49], [74, 67], [92, 52]]) {
    box(x, y, 1, 3, p.trees);
    box(x - 1, y - 1, 3, 1, p.flower);
    box(x, y - 2, 1, 3, p.flower);
  }
  const x = wide ? 56 : 58;
  box(x - 4, 62, 31, 2, p.turf);
  box(x, 64, 23, 1, p.turf);
  paintPet(ctx, x, 39, 1, level, faded);
  if (faded) {
    box(x + 26, 54, 1, 7, p.flower);
    box(x + 24, 55, 5, 2, p.flower);
  } else {
    box(x + 34, 41, 1, 5, p.flower);
    box(x + 32, 43, 5, 1, p.flower);
    box(x - 5, 46, 2, 2, p.flower);
  }
}

function petCanvas(theme, level = 1, faded = false, avatar = false) {
  return `<canvas width="${avatar ? 33 : 144}" height="${avatar ? 33 : 83}" class="${avatar ? 'avatar' : 'pixel-scene'}" data-palette="${theme}" data-level="${level}" data-faded="${faded}" ${avatar ? 'data-avatar' : ''} role="img" aria-label="${faded ? '像素宠物的纪念画像' : '像素宠物'}"></canvas>`;
}
