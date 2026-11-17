'use strict';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const { width: W, height: H } = canvas;
const FPS = 30;
const DURATION = 74;
const INK = '#152e23';
const OAT = '#f4f2de';
const GREEN = '#dceac9';
const SKY = '#d3e9f5';
const ORANGE = '#b04728';
const FONT = '"PingFang SC","Hiragino Sans GB",sans-serif';
const NUM = 'Helvetica Neue,Helvetica,sans-serif';
const { images: sources, captions, cat } = window.filmAssets;
const images = Object.fromEntries(Object.entries(sources).map(([name, source]) => {
  const img = new Image();
  img.src = source;
  return [name, img];
}));

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smooth(value) {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function fill(color, x = 0, y = 0, width = W, height = H) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function round(x, y, width, height, radius, color, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (color) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function type(text, x, y, { size = 36, color = INK, weight = 600, align = 'left', font = FONT } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function headline(lines, x, y, size, color = INK) {
  lines.forEach((line, index) => type(line, x, y + index * size * 1.16, { size, weight: 800, color }));
}

function draw(name, x, y, width, height, pixelated = false) {
  ctx.save();
  ctx.imageSmoothingEnabled = !pixelated;
  ctx.drawImage(images[name], x, y, width, height);
  ctx.restore();
}

function brand(x, y, dark = false) {
  ctx.save();
  round(x, y, 54, 54, 12);
  ctx.clip();
  draw('icon', x, y, 54, 54);
  ctx.restore();
  type('训练栖地', x + 72, y + 40, { size: 32, color: dark ? OAT : INK, weight: 740 });
}

function line(x, y, width, color = '#92a285') {
  fill(color, x, y, width, 1);
}

function heart(x, y, scale, color) {
  const pixels = [
    '01100110', '11111111', '11111111', '11111111',
    '01111110', '00111100', '00011000',
  ];
  for (const [row, bits] of pixels.entries()) {
    for (const [column, value] of [...bits].entries()) {
      if (value === '1') fill(color, x + column * scale, y + row * scale, scale, scale);
    }
  }
}

function sprite(name, centerX, baselineY, scale) {
  const image = images[name];
  draw(name, Math.round(centerX - image.width * scale / 2),
    Math.round(baselineY - 35 * scale), image.width * scale, image.height * scale, true);
}

function garden(x, y, width, height, time = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  const source = images.garden;
  const scale = Math.ceil(width / source.width);
  const drift = Math.floor(Math.sin(time / 3) * 2) * scale;
  draw('garden', x, y - Math.floor(31 * scale) + drift, source.width * scale, source.height * scale, true);
  ctx.restore();
}

function showOpening(t) {
  fill(GREEN);
  fill('#c5dca6', 1000, 0, 920, 1080);
  brand(100, 83);
  headline(t >= 3.5 ? ['一周排了三次。', '只记下一次。'] : ['一周排了三次。'], 100, 420, 98);
  line(104, 647, 676, '#8c9f79');
  type('每周训练计划示例', 104, 712, { size: 31, color: '#3d5641' });
  const left = 1072;
  type('本周训练', left, 200, { size: 47, weight: 770 });
  const rows = [['周一', '跑步', '已记录'], ['周三', '力量训练', '无记录'], ['周五', '跑步', '无记录']];
  for (const [i, [day, title, status]] of rows.entries()) {
    const p = smooth((t - i * .25) / .45);
    ctx.save();
    ctx.globalAlpha = p;
    const y = 292 + 173 * i + (1 - p) * 29;
    line(left, y - 40, 738, '#77946e');
    type(day, left, y + 17, { size: 38, weight: 730 });
    type(title, left + 142, y + 17, { size: 35 });
    if (t > 3.42 + i * .22) {
      const color = i === 0 ? '#214d37' : '#664c39';
      fill(i === 0 ? '#477753' : '#91785b', left + 542, y - 10, 19, 19);
      type(status, left + 580, y + 14, { size: 31, color });
    }
    ctx.restore();
  }
  line(left, 777, 738, '#77946e');
  if (t >= 5.45) {
    const hop = Math.sin(smooth((t - 5.45) / .6) * Math.PI) * 42;
    sprite('cat1', 854, 857 - hop, 8);
  }
}

function showAudience(t) {
  fill(OAT);
  fill('#e7ebd5', 1023, 0, 897, H);
  brand(100, 83);
  headline(['为排过训练、', '也漏过练的', '大学生设计。'], 100, 335, 84);
  type('首批用户使用 iPhone，近两周有过这些经历。', 104, 706, { size: 31, color: '#395241' });
  const rows = [
    ['漏练', '排了计划，到当天没能练。'],
    ['漏记', '已经练过，回头却找不到记录。'],
  ];
  for (const [i, [title, note]] of rows.entries()) {
    const p = smooth((t - (i === 0 ? 7.5 : 12.05)) / .5);
    ctx.save();
    ctx.globalAlpha = p;
    const y = 292 + 258 * i + (1 - p) * 34;
    line(1106, y - 58, 688, '#91a087');
    type(title, 1106, y + 31, { size: 69, weight: 800, color: i === 0 ? INK : '#9d3f28' });
    type(note, 1106, y + 111, { size: 35, color: '#344737' });
    ctx.restore();
  }
}

function reactionFrame(time) {
  const frames = cat.reactions;
  let remaining = (time % 3.4) * 1000;
  for (const [name, duration] of frames) {
    if (remaining < duration) return name;
    remaining -= duration;
  }
  return 'cat1';
}

function showPremise(t) {
  fill(SKY);
  garden(970, 0, 950, H, t);
  fill('#d3e9f5', 0, 0, 970, H);
  brand(100, 83);
  headline(['记下一次训练，', '就有一点变化。'], 100, 367, 88);
  type('安排训练，记录实际时长，', 106, 654, { size: 38, color: '#335264' });
  type('让像素猫的成长给你即时反馈。', 106, 719, { size: 38, color: '#335264' });
  const shift = Math.round(smooth((t - 15.8) / 3) * 23);
  const base = 760 - shift;
  fill('#466f4870', 1268, base - 2, 269, 25);
  sprite(reactionFrame(Math.max(0, t - 18.62)), 1403, base, 19);
  if (t >= 19.2) {
    const p = smooth((t - 19.2) / .4);
    ctx.save();
    ctx.globalAlpha = p;
    round(1274, 398 - p * 20, 258, 74, 0, '#eef3d8');
    type('训练进度', 1403, 450 - p * 20, { size: 34, weight: 770, align: 'center' });
    ctx.restore();
  }
}

function ring(x, y, elapsed, radius) {
  const p = elapsed / .68;
  if (p < 0 || p > 1) return;
  ctx.save();
  ctx.globalAlpha = .95 * (1 - smooth(p));
  ctx.strokeStyle = '#ef874a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(x, y, radius * (.5 + .8 * p), 0, Math.PI * 2);
  ctx.stroke();
  fill('#ef874a', x - 5, y - 5, 10, 10);
  ctx.restore();
}

function phone(name, x, y, height, tap, elapsed) {
  const img = images[name];
  const width = Math.round(height * img.width / img.height);
  ctx.save();
  ctx.shadowColor = '#10272145';
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 18;
  round(x - 11, y - 11, width + 22, height + 22, 57, '#13231e');
  ctx.restore();
  ctx.save();
  round(x, y, width, height, 46);
  ctx.clip();
  draw(name, x, y, width, height);
  if (tap) ring(x + width * tap[0], y + height * tap[1], elapsed, 34);
  ctx.restore();
}

const shots = [
  { at: 22.0, label: '首次使用', title: ['设每日目标'], steps: ['打开时间滚轮，选择每天想练多久。'], image: 'goal', tap: [.48, .52], cue: .93 },
  { at: 23.7, label: '首次使用', title: ['设每日目标'], steps: ['选好时长，点「完成」。'], image: 'goalWheel', tap: [.88, .54], cue: 1.19 },
  { at: 25.6, label: '首次使用', title: ['领养一只猫'], steps: ['在领养页选中猫。'], image: 'adopt', tap: [.14, .58], cue: .55 },
  { at: 27.5, label: '首次使用', title: ['给它起名'], steps: ['这只猫叫团团。'], image: 'name', tap: null },
  { at: 29.2, label: '首次使用', title: ['选个栖息地'], steps: ['选「草地」，再点「开始训练」。'], image: 'habitat', detail: 'habitatControls', tap: null },
  { at: 31.0, label: '首次使用', title: ['团团到家了'], steps: ['从栖息地进入「今天」。'], image: 'habitat', tap: [.5, .916], cue: .63 },
  { at: 32.25, label: '训练计划', title: ['新增训练计划'], steps: ['填写项目、计划日期和目标时长。'], image: 'addPlan', tap: [.64, .29], cue: 1.55 },
  { at: 34.9, label: '训练计划', title: ['新增训练计划'], steps: ['选好时长，保存这项计划。'], image: 'duration', tap: null },
  { at: 36.4, label: '训练计划', title: ['想换一天？'], steps: ['长按原计划，点「编辑」。'], image: 'editMenu', tap: [.18, .46], cue: 1.3 },
  { at: 38.6, label: '训练计划', title: ['想换一天？'], steps: ['更新计划日期，再保存。'], image: 'editMenu', detail: 'planDate', tap: null },
  { at: 41.35, label: '训练记录', title: ['开练就计时'], steps: ['点「记录」，选择「计时」。'], image: 'recordChoice', tap: [.746, .69], cue: 1.29 },
  { at: 43.2, label: '训练记录', title: ['开练就计时'], steps: ['开始后，应用会记录训练时长。'], image: 'timerStart', tap: null },
  { at: 44.55, label: '训练记录', title: ['练完就记录'], steps: ['至少计满 1 分钟，即可结束并记下。'], image: 'timer', detail: 'timerAction', tap: [.51, .65], cue: .89 },
  { at: 46.2, label: '训练记录', title: ['忘记记录？'], steps: ['打开「手动记录」，填写实际', '开始与结束时间。'], image: 'manual', tap: [.83, .29], cue: 2.42 },
  { at: 49.4, label: '训练记录', title: ['忘记记录？'], steps: ['核对实际训练时间，再保存。'], image: 'start', tap: null },
  { at: 62.75, label: '训练回顾', title: ['这周练了什么？'], steps: ['查看训练分布，以及每场记录。'], image: 'review', tap: null },
];

function showApp(shot, t) {
  const isPlan = shot.label === '训练计划';
  const bg = isPlan ? '#e1ebd4' : shot.label === '首次使用' ? '#e3eff5' : '#eceddd';
  fill(bg);
  fill(isPlan ? '#bfd5ab' : '#c7dce5', 1050, 0, 870, H);
  brand(100, 83);
  type(shot.label, 103, 316, { size: 34, color: '#365742', weight: 720 });
  headline(shot.title, 98, 465, 90);
  line(104, 544, 780, '#8ea693');
  shot.steps.forEach((step, i) => type(step, 105, 625 + i * 65, { size: 37, color: '#2e4937' }));
  const elapsed = t - shot.at;
  const arrival = smooth(elapsed / .25);
  phone(shot.image, 1318, 65 + Math.round((1 - arrival) * 12), 868, shot.tap, elapsed - (shot.cue || 0));
  if (shot.detail) {
    const detail = images[shot.detail];
    const width = 570;
    const height = Math.round(width * detail.height / detail.width);
    const entrance = smooth((elapsed - .12) / .3);
    const y = 728 + Math.round((1 - entrance) * 14);
    ctx.save();
    ctx.globalAlpha = entrance;
    round(104, y, width, height, 18);
    ctx.clip();
    draw(shot.detail, 104, y, width, height);
    ctx.restore();
  }
}

function growthName(from, progress) {
  if (progress <= 0) return `cat${from}`;
  if (progress >= 1) return `cat${from + 1}`;
  const frames = cat.growth[from - 1];
  return frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))];
}

function showGrowth(t) {
  fill('#ebefd9');
  fill('#cedfb2', 1020, 0, 900, H);
  brand(100, 83);
  if (t < 55.7) {
    headline(['每一分钟，', '都是一点经验。'], 100, 360, 88);
    type('每记录满 1 分钟 = 1 XP', 107, 645, { size: 44, weight: 740 });
    type('每累计 100 XP 升一级。', 106, 722, { size: 36, color: '#344f37' });
    const p = smooth((t - 51.35) / 2.4);
    sprite(growthName(1, (t - 54.77) / .68), 1461, 715, 19);
    round(1188, 785, 554, 24, 3, '#adc38f');
    fill('#466f4a', 1188, 785, Math.floor(554 * p / 16) * 16, 24);
    type(`${Math.round(p * 100)} / 100 XP`, 1741, 871, { size: 35, weight: 700, align: 'right', font: NUM });
  } else if (t < 59.15) {
    headline(['从幼年到成年'], 101, 425, 86);
    type('等级提高时，轮廓和体型会改变。', 105, 621, { size: 36, color: '#35503a' });
    const stageNames = ['幼年', '青年', '成年'];
    for (const [i, stage] of stageNames.entries()) {
      const x = 1185 + i * 272;
      const name = i === 2 ? growthName(2, (t - 56.38) / .8) : `cat${i + 1}`;
      sprite(name, x, 670, 10);
      type(stage, x, 744, { size: 35, weight: 750, align: 'center' });
      type(`Lv.${i + 1}${i === 2 ? '+' : ''}`, x, 792, { size: 27, font: NUM, align: 'center', color: '#3c5940' });
    }
    line(1086, 683, 744, '#9aac83');
  } else {
    headline(['每天照顾', '它的三颗心。'], 102, 350, 84);
    type('当天训练时长低于每日目标，结算时扣 1 颗。', 106, 658, { size: 35, color: '#364e3b' });
    type('三颗心用尽时，宠物会离世。', 106, 727, { size: 35, color: '#364e3b' });
    sprite('cat2', 1462, 683, 14);
    for (let i = 0; i < 3; i += 1) {
      heart(1270 + i * 131, 747, 12, i !== 2 || t < 60.5 ? '#a63d56' : '#9aa389');
    }
  }
}

function showTest(t) {
  fill('#18382d');
  if (t >= 70.2) {
    garden(1020, 0, 900, H, t);
    fill('#466f4870', 1340, 749, 262, 25);
    sprite('cat3', 1470, 749, 16);
    ctx.save();
    round(106, 234, 116, 116, 28);
    ctx.clip();
    draw('icon', 106, 234, 116, 116);
    ctx.restore();
    headline(['训练栖地'], 98, 546, 126, '#f1f4dd');
    type('排训练、记时长，陪团团长大。', 106, 690, { size: 44, color: '#cfe5b2' });
    return;
  }
  brand(100, 83, true);
  type('两周首测', 104, 295, { size: 37, color: '#cde4a9', weight: 730 });
  headline(['练完多少？', '还会回来吗？'], 100, 443, 91, '#f1f4dd');
  type('看原定训练完成率，也看漏练后的回归。', 105, 725, { size: 38, color: '#e0e9ce' });
  const rows = ['两周计划训练完成率', '漏练或宠物离世后是否继续训练'];
  rows.forEach((row, index) => {
    const y = 400 + index * 178;
    line(1080, y - 59, 726, '#547e62');
    type(row, 1090, y + 8, { size: 42, color: '#f1f4dd', weight: 720 });
  });
  line(1080, 697, 726, '#547e62');
}

function subtitle(text) {
  if (!text) return;
  const size = 40;
  ctx.font = `630 ${size}px ${FONT}`;
  const width = Math.ceil(ctx.measureText(text).width + 58);
  round((W - width) / 2, 969, width, 75, 17, '#10251fee');
  type(text, W / 2, 1020, { size, color: '#fffdf2', align: 'center', weight: 630 });
}

function seek(time) {
  const t = clamp(time, 0, DURATION);
  if (t < 7.1) showOpening(t);
  else if (t < 15.8) showAudience(t);
  else if (t < 22) showPremise(t);
  else if (t < 51 || (t >= 62.75 && t < 65.8)) {
    const shot = shots.findLast(item => item.at <= t);
    showApp(shot, t);
  } else if (t < 62.75) showGrowth(t);
  else showTest(t);

  subtitle(captions.find(([start, end]) => t >= start && t < end)?.[2]);
  if (t >= 70.2) type('Created by Huashu-Design', 1868, 1041, {
    size: 20, align: 'right', weight: 550, font: NUM, color: '#e0f0d9',
  });
}

window.__seek = seek;
window.film = { canvas, FPS, duration: DURATION, shots, ready: Promise.all(Object.values(images).map(img => img.decode())) };
const slider = document.querySelector('#seek');
const button = document.querySelector('#play');
const output = document.querySelector('#progress');
const storageKey = 'training-habitat-film-time';
let request;
let clock;
let position = 0;
const formatTime = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
function showPreview(current) {
  position = clamp(current, 0, DURATION);
  slider.value = String(position);
  output.textContent = `${formatTime(position)} / ${formatTime(DURATION)}`;
  seek(position);
}
function playFrame(now) {
  showPreview((now - clock) / 1000);
  if (position < DURATION) request = requestAnimationFrame(playFrame);
  else pause();
}
function pause() {
  cancelAnimationFrame(request);
  request = undefined;
  button.textContent = '播放画面';
  try { localStorage.setItem(storageKey, String(position)); } catch {}
}
button.addEventListener('click', () => {
  if (request) return pause();
  if (position >= DURATION) showPreview(0);
  clock = performance.now() - position * 1000;
  request = requestAnimationFrame(playFrame);
  button.textContent = '暂停';
});
slider.addEventListener('input', () => { pause(); showPreview(Number(slider.value)); pause(); });
window.film.ready.then(() => {
  try { position = Number(localStorage.getItem(storageKey)) || 0; } catch {}
  showPreview(position);
  window.__ready = true;
});
