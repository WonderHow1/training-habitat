import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const chrome = process.env.PIXEL_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'pixel-chrome-'));
const root = new URL('../', import.meta.url);
const output = process.env.PIXEL_SCREENSHOTS;
if (output) mkdirSync(output, { recursive: true });
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--no-sandbox', '--remote-debugging-pipe', '--user-data-dir=' + profile
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let serial = 0;
let buffer = '';
let sessionId;
const responses = new Map();
const errors = [];
const escapeTimer = setTimeout(() => {
  console.error('Chrome verification timed out.');
  process.exitCode = 1;
  child.kill();
}, 50_000);
function rejectPending(error) {
  for (const { reject } of responses.values()) reject(error);
  responses.clear();
}
child.on('error', rejectPending);
child.on('exit', () => rejectPending(new Error('Chrome closed')));
child.stdio[4].setEncoding('utf8');
child.stdio[4].on('data', text => {
  buffer += text;
  const messages = buffer.split('\0');
  buffer = messages.pop();
  for (const raw of messages) {
    const message = JSON.parse(raw);
    if (message.id) {
      const { resolve, reject } = responses.get(message.id);
      responses.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const info = message.params.exceptionDetails;
      errors.push(info.exception?.description ?? info.text);
    }
  }
});
function cmd(method, params = {}, id = sessionId) {
  return new Promise((resolve, reject) => {
    const requestId = ++serial;
    responses.set(requestId, { resolve, reject });
    child.stdio[3].write(JSON.stringify({ id: requestId, method, params, sessionId: id }) + '\0');
  });
}
async function evaluate(expression) {
  const result = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
  return result.result.value;
}
async function navigate(file, width, height) {
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const url = new URL(file, root).href;
  await cmd('Page.navigate', { url });
  await evaluate(`new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      if (location.href === ${JSON.stringify(url)} && document.readyState === 'complete') {
        clearInterval(interval); resolve();
      }
      if (++attempts > 150) { clearInterval(interval); reject(new Error('Page did not load')); }
    }, 20);
  })`);
  await evaluate('document.fonts.ready.then(() => true)');
}
async function screenshot(name) {
  if (!output) return;
  const { data } = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(join(output, name + '.png'), Buffer.from(data, 'base64'));
}
async function click(selector, verticalPosition = .5) {
  // CDP dispatches a real mouse click at the control. Center the control inside the viewport first.
  const [{ x, y }, ...rest] = await evaluate(`(async () => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return [];
    if (!el.checkVisibility()) throw new Error('Control is not visible');
    await Promise.allSettled((el.closest('.sheet, .habitat-entry')?.getAnimations() ?? []).map(animation => animation.finished));
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height * ${verticalPosition};
    return [{ x, y }, el.contains(document.elementFromPoint(x, y))];
  })()`).then(answer => {
    assert.ok(answer.length, 'Missing control: ' + selector);
    return answer;
  });
  assert.ok(rest[0], 'Control is obstructed: ' + selector);
  await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
const lead = selector => '[data-phone="home"] ' + selector;
const act = (action, value) => `[data-action="${action}"]${value ? `[data-value="${value}"]` : ''}`;
const clickLead = (action, value) => click(lead(act(action, value)));
const todayHeadline = () => evaluate(`document.querySelector(${JSON.stringify(lead('.app-head h2'))}).textContent`);
const submit = () => click(lead('.sheet button[type="submit"]'));
const enterToday = () => click(lead('.habitat-continue'));
const inHabitat = () => evaluate(`Boolean(document.querySelector(${JSON.stringify(lead('.habitat-entry[data-active]'))}))`);
async function includes(selector, text) {
  const actual = await evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
  assert.ok(actual?.includes(text), `Expected "${text}" in ${selector}. Found "${actual}".`);
}
async function change(selector, value) {
  await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return control.value;
  })()`);
}
const workout = id => lead(`.swipe-workout[data-workout="${id}"]`);
const workoutOpen = id => evaluate(`document.querySelector(${JSON.stringify(workout(id))}).hasAttribute('data-open')`);
async function swipeWorkout(id, direction = 'left', touch = false) {
  const left = direction === 'left';
  const selector = JSON.stringify(workout(id));
  const { x, y } = await evaluate(`(() => {
    const row = document.querySelector(${selector});
    row.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = row.getBoundingClientRect();
    return { x: Math.round(rect.${left ? 'right - 35' : 'left + 40'}), y: Math.round((rect.top + rect.bottom) / 2) };
  })()`);
  const endX = x + (left ? -102 : 102);
  if (touch) {
    await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: endX, y }] });
    assert.ok(await evaluate(`(() => {
      const row = document.querySelector(${selector});
      const face = row.querySelector('.workout-face');
      const offset = ${left ? '-102' : '102 - row.querySelector(".swipe-actions").offsetWidth'};
      return row.hasAttribute('data-swiping') && Math.abs(face.getBoundingClientRect().left - row.getBoundingClientRect().left - offset) < 1;
    })()`), 'The workout row tracks the touch before release');
    await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: endX, y, buttons: 1 });
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y, button: 'left', clickCount: 1 });
  }
  await evaluate(`Promise.allSettled(document.querySelector(${selector} + ' .workout-face').getAnimations().map(animation => animation.finished)).then(() => true)`);
  assert.equal(await workoutOpen(id), left, `Swiping ${direction} changes actions for ${id}`);
  assert.equal(await evaluate(`document.querySelector(${selector} + ' .swipe-actions').inert`), !left);
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(lead('.sheet'))}))`), false);
}

async function demoDirection(index, glass = false) {
  const name = glass ? 'ios-prototype' : `dir-${index}`;
  const habitatGrowth = lead('.habitat-entry-header .growth');
  await navigate(name + '.html', 1440, 1100);
  assert.equal(await evaluate('document.querySelectorAll(".phone-app").length'), 4);
  assert.equal(await evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".ios-shell")].every(x => x.getBoundingClientRect().width >= 300)'));
  assert.ok(await evaluate('document.querySelector("canvas").getContext("2d").getImageData(70,55,1,1).data[3] === 255'));
  await screenshot(name);
  if (glass) {
    await includes('.board-nav a[href="new-user.html"]', '新用户引导原型');
    assert.equal(await evaluate('document.querySelectorAll(".onboarding, [data-action=open-onboarding], #demo-scene option[value=onboarding]").length'), 0);
    assert.equal(await inHabitat(), true);
    await includes(lead('.habitat-entry-header > h2:first-child'), '团团');
    await includes(lead('.habitat-entry-header .pet-attributes'), '年龄7 天');
    await includes(lead('.habitat-entry-header .pet-attributes'), '体重3.2 公斤');
    await clickLead('toggle-pet-age');
    await includes(lead(act('toggle-pet-age')), '领养于2026年11月9日');
    assert.equal(await inHabitat(), true);
    await clickLead('toggle-pet-age');
    await includes(lead(act('toggle-pet-age')), '年龄7 天');
    await includes(habitatGrowth, 'Lv.1');
    await includes(habitatGrowth, '0 / 100 XP');
    assert.ok(await evaluate(`(() => {
      const growth = document.querySelector(${JSON.stringify(habitatGrowth)});
      const attributes = growth.nextElementSibling.children;
      return attributes.length === 2 && [growth, ...attributes].every(element => {
        const pill = getComputedStyle(element);
        return pill.backgroundColor === 'rgba(255, 255, 255, 0.5)' &&
          pill.backgroundImage === 'none' && pill.borderRadius === '20px';
      });
    })()`), 'The full-screen experience, age and weight pills have matching 50% opaque white fills');
    await assertPetCentered(lead('.habitat-landscape'));
    assert.ok(await evaluate(`(() => {
      const entry = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
      const rect = entry.getBoundingClientRect();
      const frame = entry.closest('.ios-screen').getBoundingClientRect();
      const behind = entry.closest('.ios-screen').querySelector('.app-scroll');
      return rect.top === frame.top && rect.bottom === frame.bottom && behind.inert;
    })()`));
    const landscape = JSON.stringify(lead('.habitat-landscape'));
    assert.ok(await evaluate(`new Promise(resolve => {
      const canvas = document.querySelector(${landscape});
      const still = canvas.cloneNode();
      drawScene(still);
      const rest = still.toDataURL();
      const end = performance.now() + 3300;
      function check() {
        if (canvas.toDataURL() !== rest) resolve(true);
        else if (performance.now() >= end) resolve(false);
        else requestAnimationFrame(check);
      }
      check();
    })`), 'An untouched pet blinks in the habitat');
    await click(lead('.scene-pet-touch'));
    assert.ok(await evaluate(`(() => {
      const canvas = document.querySelector(${landscape});
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === 228 && pixels[index + 1] === 109 && pixels[index + 2] === 142) return true;
      }
      return false;
    })()`), 'Tapping the full-screen pet shows a pixel heart');
    await enterToday();
    await assertPetCentered(lead('.habitat-link .pixel-scene'));
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.habitat-link .scene-label'))}) === null`),
      true, 'The Today habitat preview has no visible label');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.habitat-open'))}).getAttribute('aria-label')`),
      '打开全屏栖息地');
    await includes(lead('.habitat-link .pet-attributes'), '年龄7 天');
    await includes(lead('.habitat-link .pet-attributes'), '体重3.2 公斤');
    await includes(lead('.today-task'), '今日训练');
    assert.equal(await todayHeadline(), '今天已经锻炼0小时');
    const headingSizes = await evaluate(`[...document.querySelectorAll(${JSON.stringify(lead('.app-head :is(.kicker, .today-duration, .today-remaining)'))})].map(text => getComputedStyle(text).fontSize)`);
    assert.deepEqual(headingSizes, ['13px', '28px', '13px']);
    await includes(lead('.app-head h2 + .today-remaining'), '你距离目标还有30分钟');
    await evaluate(`Promise.allSettled(document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getAnimations().map(animation => animation.finished))`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.app-scroll'))}).textContent.includes('下一次训练')`), false);
    assert.equal(await workoutOpen('today'), false);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(workout('today') + ' .swipe-actions')}).inert`), true);
    await evaluate('window.scrollTo(0, 0)');
    await screenshot(name + '-today');
    await swipeWorkout('today');
    await includes(workout('today') + ' .swipe-actions', '编辑删除');
    await screenshot(name + '-workout-swipe');
    await swipeWorkout('today', 'right');
    await clickLead('quick-record', 'today');
    await includes(workout('today') + ' .quick-record-options', '计时直接记录');
    await clickLead('quick-manual', 'today');
  } else await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  if (glass) {
    await includes(lead('.sheet button[type="submit"]'), '保存记录');
    await includes(lead('.sheet-note'), '保存后会计入「校园夜跑」');
    assert.ok(await evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(lead('.sheet'))});
      const field = sheet.querySelector('input[name="title"]');
      return sheet.contains(document.activeElement) &&
        getComputedStyle(sheet).borderWidth === '0px' && getComputedStyle(field).borderWidth === '0px' &&
        getComputedStyle(field).backdropFilter.includes('blur') && getComputedStyle(field).backgroundImage.includes('linear-gradient');
    })()`));
    await evaluate(`Promise.allSettled(document.querySelector(${JSON.stringify(lead('.sheet'))}).getAnimations().map(animation => animation.finished))`);
    await screenshot(name + '-record');
  }
  await submit();
  if (glass) assert.equal(await evaluate('document.querySelectorAll(".sheet").length'), 0);
  else {
    await includes(lead('.sheet h3'), '确认关联');
    await submit();
  }
  await includes(lead('.today-task'), '已完成');
  if (glass) {
    await includes(lead('.habitat .growth'), '0 / 100 XP');
    assert.equal(await todayHeadline(), '今天已经锻炼0.33小时');
    await includes(lead('.today-remaining'), '你距离目标还有10分钟');
    await clickLead('habitat');
    assert.equal(await inHabitat(), true);
    await includes(habitatGrowth, '0 / 100 XP');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(habitatGrowth + ' .growth-bar i')}).style.width`), '0%');
    await enterToday();
    await includes('[data-phone="week"] .week-summary dd', '0 / 3');
    await clickLead('tab', 'week');
    await includes(lead('.week-summary dd'), '1 / 3');
    await includes(lead('.week-summary > div:nth-child(2) dd'), '20 分钟');
    await clickLead('day', '2026-11-19');
    await includes(lead('.week-summary > div:nth-child(2) dd'), '20 分钟');
  } else {
    await includes(lead('.habitat'), '成长 2 次');
    await includes('[data-phone="week"] .week-total strong', '0 / 3');
  }
  await clickLead('tab', 'log');
  await includes(lead('.record-feed'), '校园夜跑');
  if (glass) {
    await verifyHeatmapAfterSaving();
    await clickLead('review-add');
  }
  await clickLead('import');
  await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
  await submit();
  await clickLead('tab', 'week');
  await clickLead('previous');
  if (glass) await includes(lead('.week-summary > div:nth-child(2) dd'), '79 分钟');
  await clickLead('detail', 'old');
  await includes(lead('.sheet .sheet-status'), '已完成');
  await includes(lead('.sheet-note'), '撤销本次扣血');
  if (glass) {
    assert.ok(await evaluate(`[...document.querySelectorAll(${JSON.stringify(lead('.sheet dl div'))})]
      .every(row => getComputedStyle(row).borderBottomWidth === '0px')`));
  }
  await clickLead('close');
  await clickLead('detail', 'grace');
  await includes(lead('.sheet'), '补记截止');
  await clickLead('manual', 'grace');
  await submit();
  if (!glass) await submit();
  await clickLead('detail', 'grace');
  await includes(lead('.sheet .sheet-status'), '已完成');
  await clickLead('close');
  await click('#reset');
  if (glass) {
    assert.equal(await inHabitat(), true);
    await enterToday();
    await clickLead('detail', 'today');
    await clickLead('manual', 'today');
    await change(lead('.sheet input[name="minutes"]'), '10');
    await submit();
    await includes(lead('.toast'), '已保存训练记录，计划尚未完成');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(workout('today') + ' .chip.upcoming')}) === null`), true);
    await includes(lead('.habitat .growth'), '0 / 100 XP');
    await clickLead('tab', 'log');
    await clickLead('record', 'record-2');
    await includes(lead('.sheet dl'), '关联计划未关联');
    await clickLead('close');
    await clickLead('tab', 'home');
    await clickLead('detail', 'today');
    await includes(lead('.sheet .sheet-status'), '待训练');
  }
  await (glass ? click(lead('.sheet ' + act('edit-plan', 'today'))) : clickLead('reschedule', 'today'));
  await change(lead('input[name="date"]'), '2026-11-17');
  await change(lead('.sheet input[name="start"]'), '19:45');
  await submit();
  await includes(lead('.today-task'), '今天无计划训练');
  if (glass) {
    await clickLead('tab', 'week');
    await clickLead('day', '2026-11-17');
    await includes(lead(act('detail', 'today')), '11月17日 19:45');
  } else await includes(lead('.following'), '11月17日 19:45');

  if (index === 1) {
    const petSummary = lead(glass ? '.habitat-entry-header' : '.habitat');
    await change('#demo-scene', 'death');
    await includes(petSummary, '已离世');
    await clickLead('adopt');
    await change(lead('input[name="name"]'), '点点');
    if (glass) {
      const form = lead('form[data-form="adopt"]');
      await includes(form + ' .species-options', '仓鼠');
      const previews = await evaluate(`[...document.querySelectorAll(${JSON.stringify(form + ' .species-choice canvas')})].map(canvas => canvas.toDataURL())`);
      assert.equal(new Set(previews).size, 10);
      await click(form + ' .species-choice:has(input[value="dog"])');
      const rooms = new Set();
      for (const habitat of ['garden', 'running-track', 'living', 'bedroom', 'gym']) {
        await change(form + ' select[name="habitat"]', habitat);
        rooms.add(await evaluate(`document.querySelector(${JSON.stringify(form + ' .habitat-choice-preview canvas')}).toDataURL()`));
        if (habitat === 'running-track') await screenshot('ios-prototype-running-track');
      }
      assert.equal(rooms.size, 5);
      await screenshot('ios-prototype-adoption');
    }
    await submit();
    await includes(petSummary, '点点');
    if (glass) {
      const portrait = JSON.stringify(lead('.habitat-landscape'));
      assert.equal(await evaluate(`document.querySelector(${portrait}).dataset.species`), 'dog');
      assert.equal(await evaluate(`document.querySelector(${portrait}).dataset.habitat`), 'gym');
      await includes(lead('.pet-attributes'), '0 天');
      await includes(lead('.pet-attributes'), '6 公斤');
      await clickLead('habitat-settings');
      await verifyCenteredHabitatChoices(lead('.sheet .habitat-choice-preview canvas'), lead('.sheet select[name="habitat"]'));
      await submit();
      assert.equal(await evaluate(`document.querySelector(${portrait}).dataset.habitat`), 'running-track');
      await clickLead('tab', 'home');
      assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(lead('.pixel-scene[data-species="dog"][data-habitat="running-track"]'))}))`));
    }
    await clickLead('tab', 'log');
    if (glass) await clickLead('review-add');
    await clickLead('import');
    await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
    await submit();
    await clickLead('tab', 'pet');
    await clickLead('restore', 'moss');
    await clickLead('confirm-restore', 'moss');
    await includes(petSummary, '团团');
    if (!glass) {
      await change('#demo-scene', 'onboarding');
      await submit();
      await change(lead('input[name="title"]'), '校园夜跑');
      await change(lead('input[name="date"]'), '2026-11-17');
      await submit();
      await click(lead('.sheet [data-action="onboard-finish"].secondary'));
      await includes(lead('.following'), '11月17日');
      await change('#demo-time', '2026-11-19T01:00');
      await click('#advance');
      await includes('#demo-feedback', '已按北京时间更新结算');
      await clickLead('tab', 'week');
      await clickLead('detail', 'plan-3');
      await includes(lead('.sheet .sheet-status'), '已漏练');
    }
  }

  await navigate(name + '.html', 390, glass ? 760 : 1120);
  assert.equal(await evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".ios-status")].every(el => { const island = el.nextElementSibling.getBoundingClientRect(); return el.children[0].getBoundingClientRect().right < island.left && el.children[1].getBoundingClientRect().left > island.right; })'));
  if (glass) assert.ok(await evaluate(`document.querySelector(${JSON.stringify(habitatGrowth + ' .growth-bar')}).getBoundingClientRect().width > 80`));
  await screenshot(name + '-mobile');
  if (glass) {
    await verifySwipe();
    await clickLead('detail', 'today');
  }
  await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  await screenshot(name + '-mobile-record');
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('document.querySelectorAll(".sheet").length'), 0);
  if (glass) {
    await clickLead('tab', 'pet');
    await includes(lead('.pet-scene-panel'), '0 / 100 XP');
    await settleHabitatAnimation();
    assert.ok(await evaluate(`(() => {
      const petScene = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
      const panel = petScene.querySelector('.pet-scene-panel').getBoundingClientRect();
      const header = petScene.querySelector('.habitat-entry-header').getBoundingClientRect();
      const nav = document.querySelector(${JSON.stringify(lead('.tabbar'))}).getBoundingClientRect();
      return petScene.getBoundingClientRect().height === innerHeight && header.bottom < panel.top && panel.bottom < nav.top;
    })()`));
    await screenshot(name + '-mobile-pet');
  }
}

async function assertPetCentered(selector) {
  const result = await evaluate(`(() => {
    const canvas = document.querySelector(${JSON.stringify(selector)});
    const { width, height } = canvas;
    const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
    const outline = petSprites[canvas.dataset.species].colors.I.slice(1);
    const [red, green, blue] = outline.match(/../g).map(channel => parseInt(channel, 16));
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] !== red || data[i + 1] !== green || data[i + 2] !== blue) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    const centered = right >= left && bottom >= top && Math.abs(left + right + 1 - width) <= 2 && Math.abs(top + bottom + 1 - height) <= 2;
    return { centered, bounds: [left, top, right, bottom] };
  })()`);
  assert.ok(result.centered, 'The scene centers the pet sprite in ' + selector);
  return result.bounds;
}

async function verifyCenteredHabitatChoices(canvas, picker) {
  const center = await assertPetCentered(canvas);
  const images = new Set();
  for (const habitat of ['garden', 'gym', 'living', 'bedroom', 'running-track']) {
    await change(picker, habitat);
    images.add(await evaluate(`document.querySelector(${JSON.stringify(canvas)}).toDataURL()`));
    assert.deepEqual(await assertPetCentered(canvas), center);
  }
  assert.equal(images.size, 5, 'Changing the habitat redraws every background');
}

async function verifyOnboarding() {
  await navigate('new-user.html', 320, 700);
  const screen = JSON.stringify(lead('.onboarding'));
  const heading = lead('.onboarding h2');
  const submitStep = () => click(lead('.onboarding button[type="submit"]'));
  const checkHeading = async title => {
    await includes(heading, title);
    assert.equal(await evaluate(`document.querySelector(${screen}).querySelector('progress, [role="progressbar"]')`), null);
  };
  const goal = lead('.onboarding input[name="minutes"]');
  await checkHeading('设定每日训练目标');
  assert.ok(await evaluate(`(() => {
    const view = document.querySelector(${screen});
    const phone = view.closest('.ios-screen');
    const rect = view.getBoundingClientRect();
    const goal = view.querySelector('.goal-entry input').getBoundingClientRect();
    const unit = view.querySelector('.goal-entry > span').getBoundingClientRect();
    return !view.hidden && rect.height === phone.getBoundingClientRect().height &&
      rect.width === phone.getBoundingClientRect().width && getComputedStyle(view).backgroundImage === 'none' &&
      Math.abs(goal.left + unit.right - rect.left - rect.right) < 1 &&
      Math.abs(goal.top + goal.bottom - rect.top - rect.bottom) < 1 &&
      phone.querySelector('.tabbar').inert && view.scrollWidth === view.clientWidth && document.documentElement.scrollHeight === innerHeight &&
      view.querySelector('h2').getBoundingClientRect().top - rect.top >= 120 &&
      getComputedStyle(view.querySelector('.onboarding-goal')).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(view.querySelector('input')).backgroundColor === 'rgba(0, 0, 0, 0)';
  })()`), 'Onboarding covers the phone with a solid color and centers the target time');
  await screenshot('new-user-goal');
  assert.ok(await evaluate(`new Promise(resolve => {
    const view = document.querySelector(${screen});
    const initial = view.style.backgroundColor;
    const interval = setInterval(() => {
      if (view.style.backgroundColor !== initial) {
        clearInterval(interval);
        const vivid = onboardingColors.every(color => {
          const channels = color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
          return Math.max(...channels) - Math.min(...channels) >= 90;
        });
        resolve(onboardingColorInterval === 2000 && onboardingColors.length === 7 && vivid &&
          getComputedStyle(view).transitionProperty === 'background-color' && parseFloat(getComputedStyle(view).transitionDuration) > 0);
      }
    }, 25);
    setTimeout(() => { clearInterval(interval); resolve(false); }, 2300);
  })`), 'The rainbow advances automatically with an animated transition');
  const warning = lead('.onboarding-warning');
  await change(goal, '9');
  await includes(warning, '至少 10 分钟');
  await submitStep();
  await includes(heading, '设定每日训练目标');
  await change(goal, '10');
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(goal)}).checkValidity()`));
  await change(goal, '120');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(warning)}).textContent`), '');
  await change(goal, '121');
  await includes(warning, '超过 2 小时');
  await submitStep();
  await checkHeading('领养宠物');
  const petPreview = JSON.stringify(lead('.onboarding-pet-preview'));
  const cat = await evaluate(`document.querySelector(${petPreview}).toDataURL()`);
  assert.ok(await evaluate(`(() => {
    const preview = document.querySelector(${petPreview});
    const options = [...preview.parentElement.nextElementSibling.querySelectorAll('input')];
    const rests = new Set();
    const reactions = new Set();
    for (const option of options) {
      option.click();
      drawScene(preview);
      const still = preview.toDataURL();
      rests.add(still);
      preview.parentElement.click();
      const reaction = preview.toDataURL();
      if (preview.dataset.species !== option.value || reaction === still) return false;
      reactions.add(reaction);
    }
    return options.length === 10 && rests.size === 10 && reactions.size === 10;
  })()`), 'Each of the ten selectable pets has a distinct portrait and reacts to a tap');
  await click(lead('.onboarding-choice:has(input[value="rabbit"])'));
  assert.notEqual(await evaluate(`document.querySelector(${petPreview}).toDataURL()`), cat);
  assert.ok(await evaluate(`(() => {
    const preview = document.querySelector(${petPreview});
    const rect = preview.getBoundingClientRect();
    const view = preview.closest('.onboarding').getBoundingClientRect();
    const options = preview.parentElement.nextElementSibling;
    const icons = [...options.querySelectorAll('canvas.avatar')];
    return preview.dataset.species === 'rabbit' && rect.bottom <= options.getBoundingClientRect().top &&
      (rect.top + rect.height / 2 - view.top) / view.height < .47 && icons.length === 10 &&
      new Set(icons.map(icon => icon.toDataURL())).size === 10 && options.scrollWidth === options.clientWidth &&
      getComputedStyle(options.parentElement.querySelector('input[name="name"]')).textAlign === 'center';
  })()`), 'The preview fits above all ten illustrated choices on a 320px screen');
  await change(lead('.onboarding input[name="name"]'), '小栗');
  await click(lead('.onboarding [data-back]'));
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(goal)}).value`), '121');
  await includes(warning, '避免过度训练');
  await submitStep();
  await screenshot('new-user-pet');
  assert.equal(await evaluate(`document.querySelector(${screen}).querySelector('input[name="species"]:checked').value`), 'rabbit');
  await submitStep();
  await checkHeading('选择栖息地');
  const preview = JSON.stringify(lead('.onboarding-habitat-art'));
  assert.ok(await evaluate(`(() => {
    const canvas = document.querySelector(${preview});
    const rect = canvas.getBoundingClientRect();
    const screen = canvas.closest('.ios-screen').getBoundingClientRect();
    return rect.x === screen.x && rect.y === screen.y && rect.width === screen.width && rect.height === screen.height &&
      getComputedStyle(canvas.parentElement.querySelector('h2')).color === 'rgb(255, 255, 255)';
  })()`), 'The habitat preview fills the phone screen');
  await verifyCenteredHabitatChoices(lead('.onboarding-habitat-art'), lead('.onboarding select[name="habitat"]'));
  await screenshot('new-user-habitat');
  await submitStep();
  assert.equal(await evaluate(`document.querySelector(${screen}).hidden`), true);
  assert.equal(await inHabitat(), true);
  await includes(lead('.habitat-entry-header'), '小栗');
  await includes(lead('.habitat-entry-header .pet-attributes'), '年龄0 天');
  await includes(lead('.habitat-entry-header .pet-attributes'), '体重1.8 公斤');
  assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(lead('.habitat-landscape[data-species="rabbit"][data-habitat="running-track"]'))}))`));
  await navigate('new-user.html', 320, 700);
  assert.equal(await evaluate(`document.querySelector(${screen}).hidden`), true);
  assert.equal(await inHabitat(), true);
  await includes(lead('.habitat-entry-header'), '小栗');
  await enterToday();
  await includes(lead('.today-remaining'), '你距离目标还有121分钟');
  await click('#reset');
  await includes(heading, '设定每日训练目标');
}

async function habitatPoint() {
  return evaluate(`(() => {
    const rect = document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height * 0.62) };
  })()`);
}

const heatWeeks = JSON.stringify(lead('.heat-weeks'));
const heatScrollLeft = () => evaluate(`document.querySelector(${heatWeeks}).scrollLeft`);
const heatScrollMax = () => evaluate(`(() => {
  const weeks = document.querySelector(${heatWeeks});
  return weeks.scrollWidth - weeks.clientWidth;
})()`);

async function heatPoint() {
  const point = await evaluate(`(() => {
    const weeks = document.querySelector(${heatWeeks});
    weeks.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const rect = weeks.getBoundingClientRect();
    const x = Math.round(rect.left + 60);
    const y = Math.round(rect.top + 36);
    return { x, y, hittable: weeks.contains(document.elementFromPoint(x, y)) };
  })()`);
  assert.ok(point.hittable, 'The swipe starts on the visible heatmap');
  return point;
}

async function waitForHeatScroll(condition) {
  assert.ok(await evaluate(`new Promise(resolve => {
    const end = performance.now() + 1000;
    function check() {
      const weeks = document.querySelector(${heatWeeks});
      if (${condition}) resolve(true);
      else if (performance.now() > end) resolve(false);
      else requestAnimationFrame(check);
    }
    check();
  })`), 'The heatmap scrolls to the expected dates');
}

async function verifyHeatmapAfterSaving() {
  await settleHabitatAnimation();
  const cell = lead(act('log-day', '2026-11-16'));
  const feed = lead('.record-feed .list-row');
  const countRows = () => evaluate(`document.querySelectorAll(${JSON.stringify(feed)}).length`);
  const allRows = await countRows();
  assert.ok(allRows > 4, 'The heatmap has a populated sample history');
  await includes(lead('.heatmap-head p'), '近 52 周');
  await includes(lead('.heatmap-head strong'), String(allRows));
  assert.ok(await evaluate(`(() => {
    const heatmap = document.querySelector(${JSON.stringify(lead('.heatmap'))});
    const legend = [...heatmap.querySelectorAll('.heat-legend i')];
    const colors = legend.map((swatch, index) => {
      const cell = heatmap.querySelector('.heat-cell.heat-' + index);
      const color = getComputedStyle(swatch).backgroundColor;
      return cell && color === getComputedStyle(cell).backgroundColor ? color.match(/[0-9]+/g).map(Number) : [];
    });
    return colors.length === 4 && colors.every(([red, green, blue], index) =>
      green > red && green > blue && (index === 0 || green < colors[index - 1][1]));
  })()`), 'The heatmap and legend share four progressively darker shades of green');
  const heatmapSize = () => evaluate(`(() => {
    const heatmap = document.querySelector(${JSON.stringify(lead('.heatmap'))});
    const calendar = heatmap.querySelector('.heat-calendar');
    return { height: heatmap.offsetHeight, width: calendar.offsetWidth };
  })()`);
  const size = await heatmapSize();
  assert.ok(size.height <= 172 && size.width === 253, 'More weeks keep the existing heatmap viewport size');
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(lead('.heat-calendar .heat-cell'))}).length`), 52 * 7);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cell)}).offsetWidth`), 14);
  const latest = await heatScrollMax();
  assert.ok(latest > 0);
  assert.equal(await heatScrollLeft(), latest, 'The heatmap initially shows the latest week');
  const months = await evaluate(`(() => {
    const weeks = document.querySelector(${heatWeeks});
    const viewport = weeks.getBoundingClientRect();
    return [...weeks.querySelectorAll('.heat-month')].filter(month => {
      const rect = month.getBoundingClientRect();
      return month.textContent && rect.left >= viewport.left && rect.right <= viewport.right;
    }).map(month => month.textContent);
  })()`);
  assert.deepEqual(months, ['8月', '9月', '10月', '11月']);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cell)}).title`), '11月16日 · 1 次训练');
  await includes(lead('.tabbar ' + act('tab', 'log')), '回顾');
  await includes(lead('.record-feed .review-day h3'), '11月16日 · 周一');
  assert.ok(await evaluate(`(() => {
    const heatmap = document.querySelector(${JSON.stringify(lead('.heatmap'))});
    const review = heatmap.closest('.app-scroll');
    const [add] = review.querySelectorAll('[data-action="review-add"]');
    const header = review.querySelector('.app-head');
    const groups = Array.from(review.querySelectorAll('.review-day'), group => group.getAttribute('aria-labelledby'));
    return review.querySelectorAll('[data-action="review-add"]').length === 1 && header.lastElementChild === add &&
      add.getAttribute('aria-label') === '补录或导入' && add.offsetWidth === 44 && add.offsetHeight === 44 &&
      heatmap.nextElementSibling.classList.contains('record-feed') && groups.length > 1 &&
      groups.every((date, index) => index === 0 || date < groups[index - 1]) &&
      !review.querySelector('[data-action="manual"], [data-action="import"], .swipe-actions, .record-source');
  })()`), 'Review groups actual workouts by date and exposes one recording entry point');
  await click(cell);
  assert.deepEqual(await heatmapSize(), size, 'The clear-date action keeps the layout steady');
  assert.equal(await countRows(), 1, 'Selecting a date filters the history to that day');
  await includes(feed, '校园夜跑');
  await click(lead('.heatmap-footer [data-action="log-day"]'));
  assert.equal(await countRows(), allRows);
  const { x, y } = await heatPoint();
  const wheel = deltaX => cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY: 0 });
  await wheel(-220);
  await waitForHeatScroll(`weeks.scrollLeft < ${latest - 180}`);
  const earlier = await heatScrollLeft();
  await clickLead('log-day', '2026-07-11');
  assert.equal(await countRows(), 1, 'Dates in an earlier month can be selected');
  await includes(lead('.heatmap-footer'), '7月11日 · 1 次');
  assert.equal(await heatScrollLeft(), earlier, 'Selecting a date preserves the horizontal position');
  await click(lead('.heatmap-footer [data-action="log-day"]'));
  assert.equal(await countRows(), allRows);
  assert.equal(await heatScrollLeft(), earlier);
  await wheel(600);
  await waitForHeatScroll('weeks.scrollLeft === weeks.scrollWidth - weeks.clientWidth');
  await clickLead('log-day', '2026-11-14');
  assert.equal(await countRows(), 1);
  await includes(feed, '16:12');
  await click(feed);
  await includes(lead('.sheet dl'), '来源设备');
  await clickLead('close');
  await click(lead('.heatmap-footer [data-action="log-day"]'));
  assert.equal(await countRows(), allRows);
  await screenshot('ios-prototype-heatmap');
}

async function verifySwipe() {
  assert.ok(await evaluate(`(() => {
    const { top, bottom } = document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getBoundingClientRect();
    return top === 0 && bottom === innerHeight;
  })()`), 'The habitat fills the first mobile viewport');
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const { x, y } = await habitatPoint();
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 23 }] });
  await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await inHabitat(), true, 'A short drag keeps the full-screen habitat open');
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const distance of [28, 64, 118]) {
    await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
  }
  await assertSceneScale(false);
  await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await inHabitat(), false, 'An upward touch swipe opens Today');
  await includes(lead('.today-task'), '校园夜跑');
  await settleHabitatAnimation();
  await swipeWorkout('today', 'left', true);
  await swipeWorkout('today', 'right', true);

  await cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
  await clickLead('tab', 'week');
  for (const title of ['游泳', '瑜伽', '跳绳', '骑行', '舞蹈']) {
    await click(lead('.app-head [data-action="new"]'));
    await change(lead('input[name="title"]'), title);
    await change(lead('input[name="date"]'), '2026-11-16');
    await submit();
  }
  await clickLead('tab', 'home');
  const workoutIds = await evaluate(`[...document.querySelectorAll(${JSON.stringify(lead('.swipe-workout'))})].map(row => row.dataset.workout)`);
  assert.equal(workoutIds.length, 6);
  const another = workoutIds.find(id => id !== 'today');
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await swipeWorkout('today', 'left', true);
  await swipeWorkout(another, 'left', true);
  assert.equal(await workoutOpen('today'), false, 'Only one workout can reveal actions at a time');
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
  await click(workout(another) + ' ' + act('edit-plan', another));
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.sheet input[name="title"]'))}).value`), '游泳');
  await clickLead('close');
  assert.equal(await evaluate('document.activeElement.closest(".swipe-workout").dataset.workout'), another);
  assert.equal(await workoutOpen(another), false);

  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const scroller = JSON.stringify(lead('.app-scroll'));
  await evaluate(`document.querySelector(${scroller}).scrollTop = 40`);
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y - 210 }] });
  await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 190 }] });
  assert.ok(await evaluate(`document.querySelector(${scroller}).scrollTop > 0`), 'Dragging within the list still scrolls it');
  await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60 }] });
  assert.equal(await evaluate(`document.querySelector(${scroller}).scrollTop`), 0);
  await assertSceneScale(true);
  await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await inHabitat(), true, 'Continuing the same downward swipe at the top reopens the habitat');
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
  await enterToday();
}

async function assertSceneScale(fromDetails) {
  assert.ok(await evaluate(`(() => {
    const scene = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
    const style = getComputedStyle(scene);
    const transform = new DOMMatrixReadOnly(style.transform);
    return transform.a > .74 && transform.a < 1 && transform.a === transform.d && transform.e === 0 && transform.f === 0 &&
      Number(style.opacity) > 0 && Number(style.opacity) < 1 && scene.inert === ${fromDetails};
  })()`), 'The scene scales with a partial drag before the finger releases');
}

async function waitForHabitat(visible) {
  assert.ok(await evaluate(`new Promise(resolve => {
    const end = performance.now() + 700;
    function check() {
      const visible = document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).hasAttribute('data-active');
      if (visible === ${visible}) resolve(true);
      else if (performance.now() >= end) resolve(false);
      else requestAnimationFrame(check);
    }
    check();
  })`), 'The wheel gesture settles in the expected view');
}

const settleHabitatAnimation = () => evaluate(`Promise.allSettled(document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getAnimations().map(animation => animation.finished))`);

async function verifyGlass() {
  await navigate('ios-prototype.html', 1440, 1100);
  assert.ok(await evaluate(`(() => {
    const weeks = document.querySelector('[data-phone="log"] .heat-weeks');
    return weeks.scrollWidth > weeks.clientWidth && weeks.scrollLeft === weeks.scrollWidth - weeks.clientWidth;
  })()`), 'The standalone record preview opens on the latest week');
  for (const [tab, title] of [['week', '训练计划'], ['log', '训练回顾']]) {
    const selector = `[data-phone="${tab}"] .app-head`;
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent.trim()`), title);
  }
  await verifyPrototypePalette();
  await verifyOpenSurfaces();
  await verifyWeekPicker();
  const { x, y } = await habitatPoint();
  const wheel = deltaY => cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  await wheel(42);
  await assertSceneScale(false);
  await wheel(66);
  await waitForHabitat(false);
  await wheel(-102);
  await waitForHabitat(true);
  const habitatAppearance = () => evaluate(`(() => {
    const scene = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
    const still = scene.querySelector('canvas').cloneNode();
    drawScene(still);
    return [scene.querySelector('.habitat-entry-header').innerHTML, still.toDataURL()];
  })()`);
  const todayHabitat = await habitatAppearance();
  await enterToday();
  await clickLead('tab', 'log');
  const nav = lead('.tabbar');
  const scroller = lead('.app-scroll');
  await evaluate(`window.testNav = document.querySelector(${JSON.stringify(nav)}); true`);
  assert.ok(await evaluate(`(() => {
    const scroller = document.querySelector(${JSON.stringify(scroller)});
    const before = testNav.getBoundingClientRect();
    scroller.scrollTop = 60;
    const after = testNav.getBoundingClientRect();
    const frame = testNav.closest('.ios-screen').getBoundingClientRect();
    return scroller.scrollTop > 0 && before.top === after.top && after.top < scroller.getBoundingClientRect().bottom &&
      frame.bottom - after.bottom >= 34 && getComputedStyle(testNav).backdropFilter.includes('blur');
  })()`));
  await clickLead('tab', 'pet');
  assert.ok(await evaluate(`(() => {
    const updated = document.querySelector(${JSON.stringify(nav)});
    return testNav === updated && updated.querySelector('[aria-current]').dataset.value === 'pet' &&
      updated.style.getPropertyValue('--tab-index') === '3';
  })()`));
  assert.ok(await evaluate(`testNav.getAnimations({ subtree: true }).some(a => a.transitionProperty === 'transform')`));
  assert.equal(await inHabitat(), true, 'Pet opens with the full-screen habitat');
  assert.deepEqual(await habitatAppearance(), todayHabitat, 'Pet and Today share the habitat artwork and header');
  await assertPetCentered(lead('.habitat-landscape'));
  await includes(lead(act('toggle-pet-age')), '年龄7 天');
  await clickLead('toggle-pet-age');
  await includes(lead(act('toggle-pet-age')), '领养于2026年11月9日');
  await clickLead('toggle-pet-age');
  await includes(lead(act('toggle-pet-age')), '年龄7 天');
  await includes(lead('.pet-attributes > div:last-child'), '体重3.2 公斤');
  await includes(lead('.pet-scene-panel'), '经验与血量');
  await includes(lead('.pet-scene-panel'), '更换背景');
  assert.ok(await evaluate(`(() => {
    const scene = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
    const scroll = document.querySelector(${JSON.stringify(lead('.app-scroll'))});
    return !scene.querySelector('.habitat-continue') && !scroll.firstElementChild && !testNav.inert;
  })()`), 'The full-screen scene contains the pet controls and leaves the tabs accessible');
  await settleHabitatAnimation();
  await screenshot('ios-prototype-pet');
  await clickLead('detail', 'old');
  await includes(lead('.sheet h3'), '校园夜跑');
  await clickLead('close');
  assert.ok(await evaluate('document.activeElement.closest(".pet-scene-panel") && document.activeElement.dataset.value === "old"'));
  assert.equal(await inHabitat(), true, 'Closing an event detail stays in the full-screen pet scene');
  await clickLead('tab', 'week');
  await clickLead('tab', 'pet');
  await clickLead('tab', 'home');
  assert.equal(await inHabitat(), false, 'Returning to the Today tab keeps the training view');
  await click(lead('.habitat-open'), .88);
  assert.equal(await inHabitat(), true, 'The bottom of the pet card opens the full-screen view');
  await enterToday();
  await click(lead('.habitat-open'), .3);
  assert.equal(await inHabitat(), true, 'The pet image opens the full-screen view');
  await enterToday();
  await clickLead('settings');
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(lead('.sheet'))}).getAnimations().length > 0`), 'Opening a sheet from the page animates');
  const toggle = lead('[role="switch"]');
  await click(toggle);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-checked')`), 'false');
  await clickLead('close');
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'settings');

  await cmd('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-contrast', value: 'more' }]
  });
  assert.ok(await evaluate(`getComputedStyle(testNav).backdropFilter === 'none' && getComputedStyle(testNav, '::before').transitionDuration === '0s'`));
  await evaluate(`document.querySelector(${JSON.stringify(workout('today') + ' .list-row')}).focus()`);
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  assert.equal(await workoutOpen('today'), true);
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'edit-plan');
  await clickLead('edit-plan', 'today');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.sheet'))}).getAnimations().length`), 0);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(lead('.sheet input[name="title"]'))})).backdropFilter`), 'none');
  await clickLead('close');
  await cmd('Emulation.setEmulatedMedia', { features: [] });
  await clickLead('tab', 'week');
  await includes(lead('.plan-list h3'), '今日安排');
  await change('#demo-time', '2026-11-17T00:00');
  await click('#advance');
  await includes(lead('.plan-list .empty-copy'), '今天暂无计划训练');
  assert.ok(await evaluate(`document.querySelector('[data-phone="home"] .day[data-value="2026-11-17"][aria-pressed="true"]') !== null`));
  await includes('[data-phone="week"] .week-trigger', '2024 年第 9 周');
  await clickLead('day', '2026-11-19');
  await includes(lead('.plan-list'), '下肢力量');
  await clickLead('tab', 'log');
  await clickLead('tab', 'week');
  await includes(lead('.plan-list .empty-copy'), '今天暂无计划训练');
  await clickLead('tab', 'pet');
  await includes(lead('.pet-attributes'), '8 天');
  await includes(lead('.pet-attributes'), '3.2 公斤');
  await clickLead('tab', 'home');
  await includes(lead('.habitat-link .pet-attributes'), '年龄8 天');
  await clickLead('habitat');
  await includes(lead('.habitat-entry-header .pet-attributes'), '年龄8 天');
}

async function verifyWeekPicker() {
  const week = selector => '[data-phone="week"] ' + selector;
  const planIds = () => evaluate(`[...document.querySelectorAll(${JSON.stringify(week('.plan-list .swipe-workout'))})].map(row => row.dataset.workout)`);
  await includes(week('.week-trigger'), '2026 年第 47 周');
  await includes(week('.week-trigger'), '11月16日–11月22日');
  await includes(week('.week-summary > div:nth-child(2) dt'), '本周训练时长');
  await includes(week('.week-summary > div:nth-child(2) dd'), '0 分钟');
  await includes(week('.plan-list h3'), '今日安排');
  assert.deepEqual(await planIds(), ['today']);
  await click(week(act('day', '2026-11-19')));
  assert.deepEqual(await planIds(), ['next']);
  await includes(week('.plan-list .section-heading button'), '显示全周');
  await click(week('.plan-list .section-heading button'));
  assert.deepEqual(await planIds(), ['today', 'next', 'last']);
  await click(week(act('day', '2026-11-16')));
  assert.deepEqual(await planIds(), ['today']);
  assert.ok(await evaluate(`(() => {
    const controls = document.querySelectorAll(${JSON.stringify(week('.week-card :is(.week-trigger, .round, .round > svg, .day)'))});
    return controls.length === 12 && [...controls].every(control => {
      const style = getComputedStyle(control);
      return style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none' && style.boxShadow === 'none';
    });
  })()`), 'The weekly calendar uses bare text and icons');
  assert.ok(await evaluate(`(() => {
    const add = document.querySelector(${JSON.stringify(week('.section-add'))}).getBoundingClientRect();
    const tabs = document.querySelector(${JSON.stringify(week('.tabbar'))}).getBoundingClientRect();
    return tabs.top - add.bottom >= 10;
  })()`));
  await screenshot('ios-prototype-plan');
  await click(week('.week-trigger'));
  await includes(week('.sheet h3'), '选择日期');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(week('.picker-day[aria-pressed="true"]'))}).dataset.value`), '2026-11-16');
  await change(week('.week-picker select[name="year"]'), '2024');
  await change(week('.week-picker select[name="month"]'), '02');
  await click(week(act('pick-date', '2024-02-29')));
  await change(week('.week-picker select[name="year"]'), '2025');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(week('.picker-day[aria-pressed="true"]'))}).dataset.value`), '2025-02-28');
  await change(week('.week-picker select[name="year"]'), '2024');
  await click(week(act('pick-date', '2024-02-29')));
  await screenshot('ios-prototype-week-picker');
  await click(week('.week-picker button[type="submit"]'));
  await includes(week('.week-trigger'), '2024 年第 9 周');
  await includes(week('.week-trigger'), '2月26日–3月3日');
  await includes(week('.week-summary > div:nth-child(2) dd'), '0 分钟');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(week('.week-days [aria-pressed="true"]'))}).dataset.value`), '2024-02-29');
  assert.ok(await evaluate(`(() => {
    const active = document.querySelector(${JSON.stringify(week('.week-days [aria-pressed="true"]'))});
    return getComputedStyle(active).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(active.querySelector('strong')).textDecorationLine === 'underline';
  })()`), 'The selected day uses an underline without a gray block');
  await click(week('.week-trigger'));
  await includes(week('.sheet h3'), '选择日期');
  await click(week(act('close')));
  await includes(week('.week-trigger'), '2024 年第 9 周');
}

async function verifyCustomProjects() {
  await navigate('ios-prototype.html', 1440, 1100);
  await evaluate('localStorage.removeItem("pixel-fitness.training-projects")');
  await navigate('ios-prototype.html', 1440, 1100);
  await enterToday();
  await clickLead('tab', 'log');
  await clickLead('review-add');
  await includes(lead('.sheet h3'), '补录或导入');
  await includes(lead('.review-add-options'), '导入设备');
  await clickLead('manual');
  const input = lead('.sheet input[name="title"]');
  const project = JSON.stringify(input);
  const suggestion = value => lead(act('pick-project', value));
  assert.equal(await evaluate(`document.querySelector(${project}).value`), '');
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(lead('.project-history button'))}).length`), 0);
  await change(input, '  自由泳  ');
  await submit();
  const entry = lead(act('record', 'record-2'));
  await includes(entry, '自由泳');
  await includes(entry, '25 分钟');
  await clickLead('tab', 'home');
  assert.equal(await todayHeadline(), '今天已经锻炼0.42小时');
  await includes(lead('.today-remaining'), '你距离目标还有5分钟');
  await clickLead('tab', 'week');
  await includes(lead('.week-summary dd'), '0 / 3');
  await includes(lead('.week-summary > div:nth-child(2) dd'), '25 分钟');
  await clickLead('tab', 'log');
  await clickLead('record', 'record-2');
  await clickLead('link', 'record-2');
  await includes(lead('.sheet h3'), '确认关联');
  await submit();
  await click(entry);
  await includes(lead('.sheet dl'), '关联计划校园夜跑');
  await clickLead('close');
  await clickLead('tab', 'week');
  await includes(lead('.week-summary dd'), '1 / 3');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.app-head ' + act('new')))}).getAttribute('aria-label')`), '新增计划');
  await includes(lead('.section-add'), '新增计划');
  await click(lead('.section-add'));
  await includes(lead('.sheet h3'), '新增计划');
  await click(suggestion('自由泳'));
  assert.equal(await evaluate(`document.querySelector(${project}).value`), '自由泳');
  await change(input, '瑜伽拉伸');
  await change(lead('.sheet input[name="start"]'), '07:05');
  await submit();
  await includes(lead('.plan-list .list-row'), '瑜伽拉伸');
  await includes(lead('.plan-list'), '11月16日 07:05');
  await navigate('ios-prototype.html', 1440, 1100);
  await enterToday();
  await clickLead('tab', 'log');
  await clickLead('review-add');
  await clickLead('manual');
  await includes(lead('.project-history'), '自由泳');
  await includes(lead('.project-history'), '瑜伽拉伸');
  await click(suggestion('瑜伽拉伸'));
  assert.equal(await evaluate(`document.querySelector(${project}).value`), '瑜伽拉伸');
  await clickLead('close');
}

async function verifyTrainingManagement() {
  await navigate('ios-prototype.html', 390, 760);
  await enterToday();
  await settleHabitatAnimation();
  const quick = JSON.stringify(workout('today') + ' .quick-record');
  const options = () => evaluate(`document.querySelector(${quick}).querySelector('.quick-record-options').inert`);
  assert.equal(await options(), true);
  await clickLead('quick-record', 'today');
  assert.equal(await options(), false);
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await options(), true);
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'quick-record');
  await clickLead('quick-record', 'today');
  assert.ok(await evaluate(`(async () => {
    const group = document.querySelector(${quick});
    await Promise.allSettled(group.getAnimations({ subtree: true }).map(animation => animation.finished));
    const row = group.closest('.workout-face').getBoundingClientRect();
    return group.offsetWidth === 112 && group.getBoundingClientRect().right <= row.right;
  })()`));
  await evaluate(`(() => {
    window.workoutTestClock = performance.now();
    performance.now = () => window.workoutTestClock;
  })()`);
  await clickLead('start-timer', 'today');
  await includes(lead('.sheet h3'), '训练计时');
  await includes(lead('.timer-elapsed'), '00:00');
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(lead(act('finish-timer', 'today')))}).disabled`));
  await evaluate('window.workoutTestClock += (20 * 60 + 13) * 1000');
  await evaluate(`new Promise((resolve, reject) => {
    const finish = document.querySelector(${JSON.stringify(lead(act('finish-timer', 'today')))});
    const deadline = Date.now() + 1500;
    function check() {
      if (!finish.disabled) resolve(true);
      else if (Date.now() >= deadline) reject(new Error('Workout timer did not advance'));
      else setTimeout(check, 25);
    }
    check();
  })`);
  await includes(lead('.timer-elapsed'), '20:13');
  await clickLead('finish-timer', 'today');
  await evaluate('delete performance.now; delete window.workoutTestClock');
  await includes(lead('.sheet h3'), '手动记录');
  await includes(lead('.sheet-note'), '校园夜跑');
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(lead('.sheet :is(input[name="start"], input[name="minutes"])'))}), field => field.value)`), ['20:00', '20']);
  await submit();
  await includes(lead('.today-task'), '已完成');
  await swipeWorkout('today');
  await clickLead('delete-plan', 'today');
  await includes(lead('.sheet h3'), '删除训练计划？');
  await clickLead('close');

  await clickLead('tab', 'week');
  await includes(lead('.week-summary dd'), '1 / 3');
  await clickLead('day', '2026-11-19');
  await swipeWorkout('next');
  await clickLead('edit-plan', 'next');
  await includes(lead('.sheet h3'), '编辑训练计划');
  const editForm = JSON.stringify(lead('.sheet form[data-form="edit-plan"]'));
  const formMarkup = await evaluate(`document.querySelector(${editForm}).outerHTML`);
  await clickLead('close');
  await clickLead('detail', 'next');
  const detailEdit = lead('.sheet ' + act('edit-plan', 'next'));
  await includes(detailEdit, '编辑');
  await click(detailEdit);
  await includes(lead('.sheet h3'), '编辑训练计划');
  assert.equal(await evaluate(`document.querySelector(${editForm}).outerHTML`), formMarkup,
    'Plan details and the swipe action open the same edit form');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(lead('.sheet input[name="title"]'))})).backgroundImage`), 'none');
  await change(lead('.sheet input[name="title"]'), '负重深蹲');
  await change(lead('.sheet input[name="date"]'), '2026-11-20');
  const plannedTime = lead('.sheet input[name="start"]');
  await change(plannedTime, '18:45');
  await change(lead('.sheet input[name="minutes"]'), '35');
  await submit();
  const changedPlan = lead(act('detail', 'next'));
  for (const content of ['负重深蹲', '11月20日 18:45', '35 分钟']) await includes(changedPlan, content);
  await click(changedPlan);
  await includes(lead('.sheet dl'), '计划时间18:45');
  await includes(lead('.sheet dl'), '训练截止11月21日 00:00');
  await click(detailEdit);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(plannedTime)}).value`), '18:45');
  await clickLead('close');
  await swipeWorkout('next');
  await clickLead('delete-plan', 'next');
  await includes(lead('.sheet h3'), '删除训练计划？');
  await click(lead('.sheet-buttons [data-action="close"]'));
  await includes(changedPlan, '负重深蹲');
  await swipeWorkout('next');
  await clickLead('delete-plan', 'next');
  await clickLead('confirm-delete');
  await includes(lead('.week-summary dd'), '1 / 2');

  await clickLead('tab', 'log');
  await clickLead('record', 'record-2');
  await clickLead('edit-record', 'record-2');
  await includes(lead('.sheet h3'), '编辑训练记录');
  await change(lead('.sheet input[name="title"]'), '晚间慢跑');
  await change(lead('.sheet input[name="start"]'), '18:00');
  await change(lead('.sheet input[name="minutes"]'), '105');
  await submit();
  const changedRecord = lead('.record-feed ' + act('record', 'record-2'));
  for (const content of ['晚间慢跑', '18:00', '105 分钟']) await includes(changedRecord, content);
  await clickLead('tab', 'home');
  await includes(lead('.today-remaining'), '你距离目标还有0分钟');
  await includes(lead('.habitat .growth'), 'Lv.2');
  await includes(lead('.habitat .growth'), '5 / 100 XP');
  await clickLead('tab', 'pet');
  await includes(lead('.pet-scene-panel'), '经验 +105 XP');
  await clickLead('record', 'record-2');
  await includes(lead('.sheet h3'), '晚间慢跑');
  await clickLead('close');
  await clickLead('tab', 'log');
  await clickLead('log-day', '2026-11-16');
  await clickLead('record', 'record-2');
  await clickLead('delete-record', 'record-2');
  await includes(lead('.sheet h3'), '删除训练记录？');
  await clickLead('confirm-delete');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(changedRecord)})`), null);
  await includes(lead('.heatmap-footer'), '左右滑动');
  await clickLead('tab', 'week');
  await includes(lead('.week-summary dd'), '0 / 2');
  await includes(lead('.week-summary > div:nth-child(2) dd'), '0 分钟');
  await clickLead('tab', 'home');
  assert.equal(await todayHeadline(), '今天已经锻炼0小时');
  await includes(lead('.today-remaining'), '你距离目标还有30分钟');
  await includes(lead('.habitat .growth'), 'Lv.1');
  await includes(lead('.habitat .growth'), '0 / 100 XP');
}

async function verifyPrototypePalette() {
  assert.ok(await evaluate(`(() => {
    const background = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    const colorChannels = color => color.match(/[0-9]+/g).slice(0, 3).map(Number);
    const isLightGray = ([red, green, blue]) => red >= 232 && red < 255 && red === green && green === blue;
    const luminance = channels => channels.map(value => {
      const srgb = value / 255;
      return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const button = document.querySelector('[data-phone="log"] .app-head .round');
    const face = colorChannels(getComputedStyle(button).backgroundColor);
    const icon = getComputedStyle(button.querySelector('svg'));
    const contrast = (luminance(colorChannels(icon.color)) + .05) / (luminance(colorChannels(icon.backgroundColor)) + .05);
    const pixel = (selector, x, y) => document.querySelector(selector).getContext('2d').getImageData(x, y, 1, 1).data;
    const isGreen = ([red, green, blue]) => green > red && green > blue;
    const habitat = '[data-phone="home"] .habitat-landscape';
    const card = '[data-phone="home"] .habitat-art canvas';
    const sky = pixel(habitat, 0, 0);
    const white = 'rgb(255, 255, 255)';
    return ['html', 'body', '.ios-screen', '.app-scroll', '.week-card', '.heatmap'].every(selector => background(selector) === white) &&
      isLightGray(colorChannels(background('.tabbar'))) && isLightGray(face) && contrast >= 4.5 &&
      sky[0] < sky[1] && sky[1] < sky[2] &&
      isGreen(pixel(habitat, 0, 140)) && isGreen(pixel(habitat, 5, 64)) &&
      isGreen(pixel(card, 0, 60)) && isGreen(pixel(card, 5, 37));
  })()`), 'Main surfaces are white, controls use light gray, and the habitat has green grass and trees');
  assert.ok(await evaluate(`(() => {
    return ['.scene-control', '.today-task .list-row', '.tabbar'].every(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.backgroundImage.includes('linear-gradient') && style.backdropFilter.includes('blur');
    });
  })()`), 'Today, Pet, and navigation still use glass highlights and backdrop blur');
  assert.ok(await evaluate(`(() => {
    const add = document.querySelector('[data-action="review-add"]');
    const pill = getComputedStyle(document.querySelector('.section-add'));
    const tile = getComputedStyle(document.querySelector('.plan-list .activity'));
    const icon = getComputedStyle(add.querySelector('svg'));
    const flatGray = style => style.backgroundColor === 'rgb(232, 232, 232)' && style.backgroundImage === 'none' &&
      style.boxShadow === 'none' && style.backdropFilter === 'none';
    return flatGray(pill) && parseFloat(pill.borderRadius) >= 25 && flatGray(getComputedStyle(add)) &&
      flatGray(tile) && tile.borderRadius === '13px' &&
      icon.backgroundColor === 'rgb(33, 38, 45)' && icon.borderRadius === '50%';
  })()`), 'Plan and Review controls use flat gray pills and dark icon badges');
}

async function verifyOpenSurfaces() {
  assert.ok(await evaluate(`(() => {
    const selectors = [
      '.habitat-link', '.today-task', '.week-card', '.heatmap', '.pet-scene-panel', '.tabbar',
      '.round', '.board-controls button', '.heat-cell'
    ];
    const preview = document.querySelector('.habitat-link .pixel-scene');
    const portrait = getComputedStyle(document.querySelector('.habitat-landscape'));
    const blockDividers = ['.board-header', '.board-footer p', '.week-summary', '.plan-list .list-row', '.record-feed .list-row', '.pet-scene-panel .list-row'];
    const hasOpenSpacing = blockDividers.every(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.borderTopWidth === '0px' && style.borderBottomWidth === '0px';
    }) && parseFloat(getComputedStyle(document.querySelector('.plan-list .list-row')).paddingTop) > 11;
    const compactWeek = document.querySelector('.week-card').getBoundingClientRect().height <= 126 &&
      [...document.querySelectorAll('.week-days .day')].every(day => day.getBoundingClientRect().height >= 44) &&
      document.querySelector('.week-summary > div:first-child').getBoundingClientRect().top ===
        document.querySelector('.week-summary > div:last-child').getBoundingClientRect().top;
    const gapBetween = (first, second) => {
      const above = document.querySelector(first).getBoundingClientRect();
      const below = document.querySelector(second).getBoundingClientRect();
      return below.top - above.bottom;
    };
    const matchesTodayGap = [['.week-card', '.plan-list'], ['.heatmap', '.record-feed']]
      .every(([first, second]) => Math.abs(gapBetween(first, second) - 29) < .5);
    const cardFade = getComputedStyle(preview).maskImage;
    const [midpoint, start] = [...cardFade.matchAll(/([0-9.]+)%/g)].map(match => Number(match[1]));
    const fadeMovesWithArtwork = Math.abs(preview.clientHeight - preview.clientWidth * 77 / 144) < 1 &&
      Math.abs(preview.clientHeight * midpoint / 100 - preview.clientWidth * 8.4 / 144) < 1 &&
      Math.abs(preview.clientHeight * start / 100 - preview.clientWidth * 18.9 / 144) < 1;
    return selectors.every(selector => getComputedStyle(document.querySelector(selector)).borderWidth === '0px') &&
      cardFade.includes('linear-gradient(to top') && fadeMovesWithArtwork &&
      portrait.maskImage === 'none' && hasOpenSpacing && matchesTodayGap && compactWeek;
  })()`), 'Cards and controls have no perimeter strokes, and lists use whitespace instead of dividers');
}

async function verifyNarrowTrainingSummary() {
  await navigate('ios-prototype.html', 320, 700);
  await enterToday();
  await settleHabitatAnimation();
  assert.equal(await todayHeadline(), '今天已经锻炼0小时');
  assert.ok(await evaluate(`(() => {
    const headline = document.querySelector(${JSON.stringify(lead('.today-duration'))});
    const reminder = document.querySelector(${JSON.stringify(lead(act('settings')))});
    return getComputedStyle(headline).fontSize === '24px' && headline.scrollWidth === headline.clientWidth &&
      headline.getBoundingClientRect().right <= reminder.getBoundingClientRect().left;
  })()`), 'The exercise headline fits alongside the reminder on a narrow screen');
  await clickLead('tab', 'week');
  assert.ok(await evaluate(`(() => {
    const summary = document.querySelector(${JSON.stringify(lead('.week-summary'))});
    const [completed, duration] = [...summary.children].map(metric => metric.getBoundingClientRect());
    return summary.scrollWidth === summary.clientWidth && completed.top === duration.top && completed.right < duration.left;
  })()`), 'Both weekly metrics fit side by side on a narrow screen');
  await clickLead('tab', 'log');
  assert.ok(await evaluate(`(() => {
    const calendar = document.querySelector(${JSON.stringify(lead('.heat-calendar'))});
    const weeks = calendar.querySelector('.heat-weeks');
    const grid = calendar.getBoundingClientRect();
    return weeks.children.length === 52 && grid.width === 253 && calendar.scrollWidth === calendar.clientWidth &&
      weeks.lastElementChild.getBoundingClientRect().right <= grid.right;
  })()`), 'The heatmap opens on the newest week within the 320px viewport');
  const latest = await heatScrollLeft();
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const { x, y } = await heatPoint();
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const distance of [30, 64, 110]) {
    await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + distance, y }] });
  }
  await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitForHeatScroll(`weeks.scrollLeft < ${latest - 40}`);
  assert.equal(await evaluate('document.documentElement.scrollLeft'), 0);
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
  await clickLead('review-add');
  assert.ok(await evaluate(`(async () => {
    const options = document.querySelector(${JSON.stringify(lead('.review-add-options'))});
    await Promise.allSettled(options.closest('.sheet').getAnimations().map(animation => animation.finished));
    const [manual, device] = options.children;
    const [top, bottom] = [manual, device].map(button => button.getBoundingClientRect());
    const singleLine = button => {
      const range = document.createRange();
      range.selectNodeContents(button.querySelector('span'));
      return range.getClientRects().length === 1;
    };
    return top.left === bottom.left && top.width === options.clientWidth && bottom.width === top.width &&
      top.height === bottom.height && top.bottom < bottom.top && singleLine(manual) && singleLine(device);
  })()`), 'Both recording options are equal-width rows with single-line labels at 320px');
  await clickLead('close');
}
let failed = false;
try {
  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true }));
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  for (const direction of [1, 2, 3]) await demoDirection(direction);
  await demoDirection(1, true);
  await verifyGlass();
  await verifyCustomProjects();
  await verifyTrainingManagement();
  await verifyNarrowTrainingSummary();
  await verifyOnboarding();
  await navigate('thumbs.html', 1440, 940);
  assert.equal(await evaluate('document.querySelectorAll("[data-thumb]").length'), 6);
  assert.equal(await evaluate('document.querySelectorAll("[data-thumb] a").length'), 3);
  await screenshot('thumbs');
  assert.deepEqual(errors, [], 'Browser console exceptions');
  console.log('Browser verification passed for the Liquid Glass prototype, three directions, and six candidates.');
} catch (error) {
  failed = true;
  console.error(error);
  console.error(errors);
  if (sessionId) await screenshot('failure').catch(() => {});
} finally {
  clearTimeout(escapeTimer);
  await cmd('Browser.close').catch(() => {});
  if (child.exitCode === null) await new Promise(resolve => child.once('close', resolve));
  rmSync(profile, { recursive: true, force: true });
  if (failed) process.exitCode = 1;
}
