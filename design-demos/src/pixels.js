const gardenPalette = {
  sky: '#b9dbe0', haze: '#d7e8d4', cloud: '#f5f2d5', far: '#94baa5', mid: '#73a783',
  trees: '#438263', land: '#84ab56', lit: '#b3cb72', turf: '#71944a',
  shore: '#a8c4be', water: '#80bdad', wave: '#bedfd0', flower: '#f9df95'
};
const palettes = {
  garden: gardenPalette,
  blueGarden: {
    ...gardenPalette,
    sky: '#c9e5ff', haze: '#e8f2fd', cloud: '#fbfdff', far: '#abc4dc', mid: '#8fabcd',
    shore: '#c3e0f2', water: '#99c7eb', wave: '#daefff', flower: '#fff5db'
  },
  track: { sky: '#393758', haze: '#55486f', cloud: '#6f6688', far: '#555676', mid: '#4d607c', trees: '#3d506f', land: '#60767d', lit: '#93a697', turf: '#4e626d', shore: '#7999a7', water: '#596e98', wave: '#8f9dbb', flower: '#dec7f0' },
  diary: { sky: '#c2cbed', haze: '#e7dff7', cloud: '#f9edef', far: '#a7b1d1', mid: '#909cc3', trees: '#6d82ae', land: '#a2afc5', lit: '#c6cfdb', turf: '#879bbb', shore: '#c5cef0', water: '#a1b9df', wave: '#e3e8fb', flower: '#f8e4ab' },
  studio: { sky: '#edc39c', haze: '#f1d3ac', cloud: '#fff0d0', far: '#d1a381', mid: '#ba917c', trees: '#927757', land: '#c6a574', lit: '#dec08a', turf: '#af9469', shore: '#e1cbaa', water: '#ceae92', wave: '#efdbc5', flower: '#fbecba' },
  clay: { sky: '#dfbfae', haze: '#f1d9be', cloud: '#ffeecc', far: '#b58d86', mid: '#af786a', trees: '#865f58', land: '#c58d72', lit: '#eab68a', turf: '#aa745b', shore: '#cca58d', water: '#bd938b', wave: '#ebcbb7', flower: '#fff2d6' },
  signal: { sky: '#b9d8ce', haze: '#cce5dc', cloud: '#e3fbec', far: '#85afac', mid: '#709596', trees: '#4e767a', land: '#80a99a', lit: '#a1c5a8', turf: '#6d978a', shore: '#b5d6d0', water: '#92b6bf', wave: '#c6e0dc', flower: '#fae5ac' }
};

function paintPet(ctx, x, y, scale, level, faded, species, pose) {
  const pet = petSprites[species] ?? petSprites.cat;
  const { colors, scarf } = pet;
  const { pixels, width } = pose?.sprite ?? pet;
  x += (pose?.walk?.x ?? 0) * scale;
  y += (pose?.walk?.y ?? 0) * scale;
  const restX = x;
  const restY = y;
  x += (pose?.x ?? 0) * scale;
  y += (pose?.y ?? 0) * scale;
  const left = x + Math.floor((25 - width) / 2) * scale;
  const top = y + (24 - pixels.length) * scale;
  ctx.save();
  if (faded) ctx.globalAlpha = 0.32;
  if (species === 'goldfish') {
    const bowl = ['....IIIIIIIIIIIIIIIIIIII....', '...ICCCCCCCCCCCCCCCCCCCCI...', '..ICLLLLLLLLLLLLLLLLLLLLCI..',
      '.ICLLLLLLLLLLLLLLLLLLLLLLCI.', 'ICLLLLLLLLLLLLLLLLLLLLLLLLCI'];
    const rows = [...bowl, ...Array(12).fill(bowl.at(-1)), ...bowl.slice(0, -1).reverse()];
    const glass = { I: '#779bb9', C: '#f5faff', L: '#ceedff' };
    rows.forEach((row, j) => [...row].forEach((color, i) => {
      if (color === '.') return;
      ctx.fillStyle = glass[color];
      ctx.fillRect(restX + (i - 2) * scale, restY + (j + 4) * scale, scale, scale);
    }));
  }
  pixels.forEach((row, j) => [...row].forEach((color, i) => {
    if (color === '.') return;
    ctx.fillStyle = pose?.blink && color === 'E' && pixels[j + 1]?.[i] === 'E' ? colors.L : colors[color];
    const column = pose?.flip ? width - i - 1 : i;
    const lift = pose?.footstep && j === pixels.length - 1 && (column < width / 2) === (pose.footstep === 1) ? 1 : 0;
    ctx.fillRect(left + column * scale, top + (j - lift) * scale, scale, scale);
  }));
  if (level > 1 && !pose?.sprite) {
    ctx.fillStyle = '#6c6564';
    ctx.fillRect(x + 5 * scale, y + scarf * scale, 15 * scale, 2 * scale);
    ctx.fillStyle = '#f6d77d';
    ctx.fillRect(x + 5 * scale, y + scarf * scale, 14 * scale, scale);
    ctx.fillRect(x + 16 * scale, y + (scarf + 1) * scale, 3 * scale, 3 * scale);
  }
  if (level > 2 && !pose?.sprite) {
    ctx.fillStyle = '#8da55b';
    ctx.fillRect(x + 11 * scale, y - 2 * scale, scale, 5 * scale);
    ctx.fillRect(x + 12 * scale, y - 2 * scale, 4 * scale, 2 * scale);
  }
  ctx.restore();
  if (pose?.effect) {
    const [type, dx, dy] = pose.effect;
    const { color, pixels: effect } = petReactionEffects[type];
    const left = Math.min(restX + dx * scale, ctx.canvas.width - effect[0].length * scale);
    const top = restY + dy * scale;
    ctx.fillStyle = color;
    effect.forEach((row, j) => [...row].forEach((pixel, i) => {
      if (pixel === '#') ctx.fillRect(left + i * scale, top + j * scale, scale, scale);
    }));
  }
}

function centeredPetPosition(canvas, species) {
  const { pixels } = petSprites[species] ?? petSprites.cat;
  return {
    x: Math.round((canvas.width - 25) / 2),
    y: Math.round(canvas.height / 2 - 24 + pixels.length / 2)
  };
}

function drawScene(canvas, pose) {
  const ctx = canvas.getContext('2d');
  const p = palettes[canvas.dataset.palette];
  const compact = canvas.hasAttribute('data-avatar');
  const wide = canvas.hasAttribute('data-wide');
  const level = Number(canvas.dataset.level ?? 1);
  const faded = canvas.dataset.faded === 'true';
  const species = canvas.dataset.species ?? 'cat';
  const habitat = canvas.dataset.habitat ?? 'garden';
  if (!compact && habitat === 'running-track') {
    drawRunningTrack(ctx, canvas, level, faded, species, pose);
    return;
  }
  if (!compact && habitat !== 'garden') {
    drawIndoorHabitat(ctx, canvas, habitat, level, faded, species, pose);
    return;
  }
  if (canvas.hasAttribute('data-portrait')) {
    drawHabitatPortrait(ctx, p, level, faded, centeredPetPosition(canvas, species), canvas.hasAttribute('data-empty'), species, pose);
    return;
  }
  const box = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  if (compact) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintPet(ctx, 4, 5, 1, level, faded, species, pose);
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
  const { x, y } = canvas.dataset.palette === 'blueGarden' ? centeredPetPosition(canvas, species) : { x: wide ? 56 : 58, y: 39 };
  box(x - 4, y + 23, 31, 2, p.turf);
  box(x, y + 25, 23, 1, p.turf);
  paintPet(ctx, x, y, 1, level, faded, species, pose);
  if (faded) {
    box(x + 26, y + 15, 1, 7, p.flower);
    box(x + 24, y + 16, 5, 2, p.flower);
  } else {
    box(x + 34, y + 2, 1, 5, p.flower);
    box(x + 32, y + 4, 5, 1, p.flower);
    box(x - 5, y + 7, 2, 2, p.flower);
  }
}

function drawRunningTrack(ctx, canvas, level, faded, species, pose) {
  const { width, height } = canvas;
  const portrait = canvas.hasAttribute('data-portrait');
  const horizon = Math.round(height * .39);
  const box = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  box(0, 0, width, horizon, '#cae5fb');
  box(0, horizon - 13, width, 13, '#e5f0f5');
  for (const [left, top] of [[.09, .10], [.62, .17], [.39, .27]]) {
    const x = width * left;
    const y = height * top;
    box(x, y, 20, 3, '#f9fcff');
    box(x + 4, y - 3, 11, 3, '#f9fcff');
  }
  box(0, horizon, width, height - horizon, '#88ac62');
  const standX = Math.round(width * .07);
  box(standX - 2, horizon - 14, 28, 3, '#60788d');
  box(standX, horizon - 11, 24, 11, '#99b0bc');
  box(standX + 1, horizon - 8, 21, 2, '#e0eced');
  box(standX + 3, horizon - 4, 18, 2, '#e0eced');
  const lightX = Math.round(width * .87);
  box(lightX, horizon - 23, 2, 26, '#6a8393');
  box(lightX - 4, horizon - 24, 10, 4, '#819ba9');
  box(lightX - 2, horizon - 23, 6, 2, '#fff5d9');

  for (let y = horizon; y < height; y++) {
    const depth = (y - horizon) / (height - horizon);
    const center = width * (.59 - .3 * depth * depth);
    const laneWidth = width * (.035 + .245 * depth);
    const left = center - 2 * laneWidth;
    box(left, y, Math.ceil(4 * laneWidth), 1, '#bd725f');
    for (let lane = 0; lane <= 4; lane++) {
      box(left + lane * laneWidth, y, depth > .52 ? 2 : 1, 1, '#f9eee5');
    }
    if (y % 9 === 0) box(left + laneWidth * .4, y, 2, 1, '#ca8873');
  }

  if (canvas.hasAttribute('data-empty')) return;
  const { x: petX, y: petY } = canvas.hasAttribute('data-centered-pet') ? centeredPetPosition(canvas, species) : {
    x: Math.round(width * .55) - 12, y: portrait ? 103 : 42
  };
  const { x = 0, y = 0 } = pose?.walk ?? {};
  box(petX + x - 2, petY + y + 22, 29, 2, '#885445');
  box(petX + x + 1, petY + y + 24, 23, 1, '#885445');
  paintPet(ctx, petX, petY, 1, level, faded, species, pose);
}

const roomPalettes = {
  gym: ['#dbe9eb', '#aac2c4', '#dae2df', '#b7c6be', '#355754'],
  living: ['#e8edd9', '#becba8', '#efddc3', '#d9bf9f', '#647457'],
  bedroom: ['#efe7f2', '#cbbad3', '#e4d1db', '#cfb9c7', '#795f79']
};

function drawIndoorHabitat(ctx, canvas, habitat, level, faded, species, pose) {
  const { width, height } = canvas;
  const portrait = canvas.hasAttribute('data-portrait');
  const floor = portrait ? 77 : 48;
  const [wall, trim, ground, seams, outline] = roomPalettes[habitat] ?? roomPalettes.living;
  const box = (x, y, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  box(0, 0, width, height, wall);
  box(0, floor - 3, width, 3, trim);
  box(0, floor, width, height - floor, ground);
  for (let y = floor + 12; y < height; y += 16) {
    box(0, y, width, 1, seams);
    for (let x = y % 32; x < width; x += 33) box(x, y, 1, 16, seams);
  }
  const windowX = width - 30;
  const windowY = floor - 47;
  box(windowX - 2, windowY - 2, 22, 24, trim);
  box(windowX, windowY, 18, 20, '#c0def4');
  box(windowX + 2, windowY + 3, 14, 2, '#f5fbff');
  box(windowX + 8, windowY, 2, 20, '#f5fbff');
  box(windowX, windowY + 10, 18, 2, '#f5fbff');
  box(windowX - 3, windowY + 20, 24, 2, outline);

  const right = width - 24;
  if (habitat === 'gym') {
    box(5, floor - 22, 3, 25, outline);
    box(21, floor - 22, 3, 25, outline);
    box(3, floor - 16, 23, 2, '#677f7e');
    box(3, floor - 20, 5, 10, '#40535d');
    box(21, floor - 20, 5, 10, '#40535d');
    box(5, floor - 5, 23, 5, '#617f78');
    box(right, floor - 18, 3, 18, outline);
    box(right - 3, floor - 20, 12, 4, '#536e6f');
    box(right - 7, floor - 4, 25, 7, '#526e6c');
    box(right - 5, floor - 3, 21, 3, '#9eafac');
  } else if (habitat === 'living') {
    box(6, floor - 23, 27, 17, '#7f9b82');
    box(3, floor - 14, 33, 13, '#75917c');
    box(7, floor - 10, 25, 7, '#acc0a3');
    box(11, floor - 17, 7, 6, '#e4c399');
    box(21, floor - 17, 8, 6, '#eadcc4');
    box(7, floor - 1, 3, 3, outline);
    box(29, floor - 1, 3, 3, outline);
    box(right + 5, floor - 13, 2, 10, '#627b57');
    box(right + 1, floor - 21, 9, 9, '#849664');
    box(right + 3, floor - 7, 7, 9, '#b78064');
  } else {
    box(4, floor - 23, 27, 24, '#a289a5');
    box(6, floor - 16, 24, 16, '#f5edf5');
    box(7, floor - 16, 9, 6, '#fff9fa');
    box(7, floor - 8, 24, 8, '#c2a6c7');
    box(4, floor - 1, 27, 3, outline);
    box(right + 2, floor - 12, 15, 14, '#ae93a1');
    box(right + 8, floor - 22, 2, 10, outline);
    box(right + 5, floor - 25, 8, 5, '#fff5d7');
  }

  const { x: petX, y: petY } = canvas.hasAttribute('data-centered-pet') ? centeredPetPosition(canvas, species) : {
    x: Math.round((width - 25) / 2), y: portrait ? 105 : 38
  };
  const rug = habitat === 'gym' ? '#90aaa7' : trim;
  box(petX - 7, petY + 19, 39, 14, rug);
  box(petX - 3, petY + 22, 31, 3, seams);
  if (!canvas.hasAttribute('data-empty')) paintPet(ctx, petX, petY, 1, level, faded, species, pose);
}

function gardenShoreAt(y) {
  return Math.round(73 - (y - 84) * .38 + Math.sin(y / 11) * 5);
}

function drawHabitatPortrait(ctx, p, level, faded, { x: petX, y: petY }, empty, species, pose) {
  const box = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  box(0, 0, 88, 192, p.land);
  box(0, 0, 88, 71, p.sky);
  box(0, 35, 88, 36, p.haze);
  for (const [x, y, w] of [[8, 13, 19], [59, 20, 21], [37, 42, 17]]) {
    box(x, y, w, 3, p.cloud);
    box(x + 5, y - 3, w - 10, 4, p.cloud);
  }
  for (let x = 0; x < 88; x += 2) {
    const ridge = Math.round(55 + Math.sin(x / 8) * 3 + Math.sin(x / 17) * 5);
    const near = Math.round(65 + Math.sin(x / 13 + 3) * 4);
    box(x, ridge, 2, 22, p.far);
    box(x, near, 2, 81 - near, p.mid);
  }
  for (const [x, y, size] of [[2, 57, 5], [12, 65, 3], [79, 56, 6], [70, 65, 4], [84, 73, 4]]) {
    box(x + size - 1, y, 3, size * 4, p.trees);
    box(x - 1, y + size, size * 2 + 2, size * 2, p.trees);
    box(x - 3, y + size * 2, size * 2 + 6, size, p.trees);
    box(x + size, y + size * 3, 2, size * 2, p.turf);
  }
  for (let y = 84; y < 192; y += 3) {
    const left = gardenShoreAt(y);
    box(left, y, 88 - left, 3, p.shore);
    box(left + 3, y, 88 - left, 3, p.water);
    if (y % 9 === 0) box(left + 9 + y % 13, y + 1, 7 + y % 8, 1, p.wave);
  }
  for (let i = 0; i < 38; i++) {
    const y = 86 + (i * 19) % 101;
    const bank = Math.round(66 - (y - 84) * .38 + Math.sin(y / 11) * 5);
    const x = 2 + (i * 17) % bank;
    if (!empty && x > petX - 4 && x < petX + 29 && y > petY - 6 && y < petY + 32) continue;
    box(x, y, 3, 1, p.turf);
    box(x + 2, y - 2, 1, 2, p.turf);
    if (i % 3 === 0) box(x + 1, y - 2, 3, 1, p.flower);
  }
  if (empty) return;
  const { x = 0, y = 0 } = pose?.walk ?? {};
  box(petX + x - 2, petY + y + 23, 28, 2, p.turf);
  box(petX + x + 2, petY + y + 25, 22, 1, p.turf);
  paintPet(ctx, petX, petY, 1, level, faded, species, pose);
  box(petX + 32, petY + 1, 1, 5, p.flower);
  box(petX + 30, petY + 3, 5, 1, p.flower);
}

function petCanvas(theme, level = 1, faded = false, avatar = false, species = 'cat', habitat = 'garden', { centered = false } = {}) {
  return `<canvas width="${avatar ? 33 : 144}" height="${avatar ? 33 : 83}" class="${avatar ? 'avatar' : 'pixel-scene'}" data-palette="${theme}" data-species="${species}" data-habitat="${habitat}" data-level="${level}" data-faded="${faded}" ${avatar ? 'data-avatar' : ''} ${centered ? 'data-centered-pet' : ''} role="img" aria-label="${faded ? '像素宠物的纪念画像' : '像素宠物'}"></canvas>`;
}
