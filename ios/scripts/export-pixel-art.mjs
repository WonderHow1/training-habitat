import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { deflateSync, crc32 } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const version = 'prototype-v1.2';
const source = ['training.js', 'pet-art.js', 'pet-growth.js', 'pet-reactions.js', 'pixels.js']
  .map(file => execFileSync('git', ['show', version + ':design-demos/src/' + file], { cwd: root, encoding: 'utf8' }))
  .join('\n');

function canvas(width, height, dataset, attributes) {
  const pixels = Buffer.alloc(width * height * 4);
  const stack = [];
  const surface = { width, height, dataset, hasAttribute: key => attributes.includes(key) };
  let color;
  const context = {
    canvas: surface,
    globalAlpha: 1,
    set fillStyle(value) {
      if (!/^#[0-9a-f]{6}$/i.test(value)) throw Error('Unsupported palette value: ' + value);
      color = Buffer.from(value.slice(1), 'hex');
    },
    save() { stack.push([this.globalAlpha, color]); },
    restore() { [this.globalAlpha, color] = stack.pop(); },
    clearRect() { pixels.fill(0); },
    fillRect(x, y, w, h) {
      for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
        for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
          const offset = (py * width + px) * 4;
          color.copy(pixels, offset);
          pixels[offset + 3] = Math.round(this.globalAlpha * 255);
        }
      }
    }
  };
  surface.getContext = () => context;
  return { surface, pixels };
}

function png(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (name, data) => {
    const length = Buffer.alloc(4);
    const checksum = Buffer.alloc(4);
    const body = Buffer.concat([Buffer.from(name), data]);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))
  ]).toString('base64');
}

const { drawScene, petReactions, petSpecies, habitatStyles, growthSteps } =
  vm.runInNewContext(source + '\n({ drawScene, petReactions, petSpecies, habitatStyles, growthSteps })');

function render(width, height, data, attrs, pose) {
  const { surface, pixels } = canvas(width, height, { palette: 'blueGarden', species: 'cat', ...data }, attrs);
  drawScene(surface, pose);
  return png(width, height, pixels);
}

const habitats = Object.fromEntries(Object.keys(habitatStyles).map(habitat => [
  habitat, render(88, 192, { habitat }, ['data-empty', 'data-portrait', 'data-centered-pet'])
]));
const pets = Object.fromEntries(Object.keys(petSpecies).map(species => {
  const portrait = (level, pose) => render(39, 39, { species, level }, ['data-avatar'], pose);
  const resting = [1, 2, 3].map(level => portrait(level));
  const walk = [1, 2, 3].map(level => [portrait(level, { footstep: 1 }), portrait(level, { footstep: 2 })]);
  const reactions = [1, 2, 3].map(level => petReactions[species].frames.map(frame => ({
    png: portrait(level, frame), duration: frame.duration
  })));
  const growth = [1, 2].map(from => growthSteps.map(progress => portrait(from, { growth: { from, to: from + 1, progress } })));
  return [species, { resting, walk, reactions, growth }];
}));

writeFileSync(new URL('../TrainingHabitat/PixelArtwork.json', import.meta.url),
  JSON.stringify({ source: version, habitats, pets }) + '\n');

const iconScene = canvas(88, 88, { palette: 'blueGarden', species: 'cat', level: 1 }, ['data-avatar']);
drawScene(iconScene.surface);
const icon = Buffer.alloc(1024 * 1024 * 4);
for (let y = 0; y < 1024; y++) {
  for (let x = 0; x < 1024; x++) {
    const sourceX = Math.floor(x / 30) + 27;
    const sourceY = Math.floor(y / 30) + 59;
    const pixel = (sourceY * 88 + sourceX) * 4;
    const background = y < 584 ? [196, 226, 246] : [134, 173, 88];
    const target = (y * 1024 + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      icon[target + channel] = iconScene.pixels[pixel + 3] ? iconScene.pixels[pixel + channel] : background[channel];
    }
    icon[target + 3] = 255;
  }
}
writeFileSync(new URL('../TrainingHabitat/Assets.xcassets/AppIcon.appiconset/Icon.png', import.meta.url),
  Buffer.from(png(1024, 1024, icon), 'base64'));
