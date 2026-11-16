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
      const face = row.querySelector('.list-row');
      const offset = ${left ? '-102' : '102 - row.querySelector(".swipe-actions").offsetWidth'};
      return row.hasAttribute('data-swiping') && Math.abs(face.getBoundingClientRect().left - row.getBoundingClientRect().left - offset) < 1;
    })()`), 'The workout row tracks the touch before release');
    await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: endX, y, buttons: 1 });
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y, button: 'left', clickCount: 1 });
  }
  await evaluate(`Promise.allSettled(document.querySelector(${selector} + ' .list-row').getAnimations().map(animation => animation.finished)).then(() => true)`);
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
    assert.equal(await inHabitat(), true);
    await includes(lead('.habitat-entry-header'), '团团');
    await includes(habitatGrowth, '成长 1 次');
    assert.ok(await evaluate(`(() => {
      const entry = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
      const rect = entry.getBoundingClientRect();
      const frame = entry.closest('.ios-screen').getBoundingClientRect();
      const behind = entry.closest('.ios-screen').querySelector('.app-scroll');
      return rect.top === frame.top && rect.bottom === frame.bottom && behind.inert;
    })()`));
    await enterToday();
    await includes(lead('.today-task'), '今日训练');
    assert.equal(await todayHeadline(), '今天已经锻炼0小时');
    await includes(lead('.app-head h2 + .today-remaining'), '你距离目标还有30分钟');
    await evaluate(`Promise.allSettled(document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getAnimations().map(animation => animation.finished))`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.app-scroll'))}).textContent.includes('下一次训练')`), false);
    assert.equal(await workoutOpen('today'), false);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(workout('today') + ' .swipe-actions')}).inert`), true);
    await evaluate('window.scrollTo(0, 0)');
    await screenshot(name + '-today');
    await swipeWorkout('today');
    await screenshot(name + '-workout-swipe');
  }
  await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  if (glass) {
    await includes(lead('.sheet button[type="submit"]'), '保存记录');
    await includes(lead('.sheet-note'), '保存后会计入「校园夜跑」');
    assert.ok(await evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(lead('.sheet'))});
      const field = sheet.querySelector('input[name="title"]');
      return sheet.contains(document.activeElement) && sheet.getAnimations().length > 0 &&
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
  await includes(lead('.habitat'), '成长 2 次');
  if (glass) {
    assert.equal(await todayHeadline(), '今天已经锻炼0.33小时');
    await includes(lead('.today-remaining'), '你距离目标还有10分钟');
    await clickLead('habitat');
    assert.equal(await inHabitat(), true);
    await includes(habitatGrowth, '成长 2 次');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(habitatGrowth + ' .growth-bar i')}).style.width`), '40%');
    await enterToday();
    await includes('[data-phone="week"] .week-summary dd', '0 / 3');
    await clickLead('tab', 'week');
    await includes(lead('.week-summary dd'), '1 / 3');
    await includes(lead('.week-summary > div:nth-child(2) dd'), '20 分钟');
    await clickLead('day', '2026-11-19');
    await includes(lead('.week-summary > div:nth-child(2) dd'), '20 分钟');
  } else await includes('[data-phone="week"] .week-total strong', '0 / 3');
  await clickLead('tab', 'log');
  await includes(lead('.record-feed'), '校园夜跑');
  if (glass) await verifyHeatmapAfterSaving();
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
    await swipeWorkout('today');
    await clickLead('manual', 'today');
    await change(lead('.sheet input[name="minutes"]'), '10');
    await submit();
    await includes(lead('.toast'), '已保存训练记录，计划尚未完成');
    await includes(lead('.today-task'), '待训练');
    await includes(lead('.habitat'), '成长 1 次');
    await clickLead('tab', 'log');
    await includes(lead(act('record', 'record-2')), '仅训练记录');
    await clickLead('tab', 'home');
    await swipeWorkout('today');
  }
  await clickLead('reschedule', 'today');
  await change(lead('input[name="date"]'), '2026-11-17');
  await submit();
  await includes(lead('.today-task'), '今天无计划训练');
  if (glass) {
    await clickLead('tab', 'week');
    await includes(lead(act('detail', 'today')), '11月17日');
  } else await includes(lead('.following'), '11月17日');

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
      assert.equal(new Set(previews).size, 4);
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
      await clickLead('habitat-settings');
      await change(lead('.sheet select[name="habitat"]'), 'running-track');
      await submit();
      assert.equal(await evaluate(`document.querySelector(${portrait}).dataset.habitat`), 'running-track');
      await clickLead('tab', 'home');
      assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(lead('.pixel-scene[data-species="dog"][data-habitat="running-track"]'))}))`));
    }
    await clickLead('tab', 'log');
    await clickLead('import');
    await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
    await submit();
    await clickLead('tab', 'pet');
    await clickLead('restore', 'moss');
    await clickLead('confirm-restore', 'moss');
    await includes(petSummary, '团团');
    await change('#demo-scene', 'onboarding');
    if (glass) {
      await verifyOnboarding();
      await enterToday();
      await includes(lead('.app-head .kicker'), '目标 121 分钟');
      await includes(lead('.today-remaining'), '你距离目标还有121分钟');
      await click(lead('.today-task [data-action="new"]'));
    } else await submit();
    await change(lead('input[name="title"]'), '校园夜跑');
    await change(lead('input[name="date"]'), '2026-11-17');
    await submit();
    if (glass) {
      await includes(lead(act('detail', 'plan-3')), '11月17日');
    } else {
      await click(lead('.sheet [data-action="onboard-finish"].secondary'));
      await includes(lead('.following'), '11月17日');
    }
    await change('#demo-time', '2026-11-19T01:00');
    await click('#advance');
    await includes('#demo-feedback', '已按北京时间更新结算');
    await clickLead('tab', 'week');
    await clickLead('detail', 'plan-3');
    await includes(lead('.sheet .sheet-status'), '已漏练');
  }

  await navigate(name + '.html', 390, glass ? 760 : 1120);
  assert.equal(await evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".ios-status")].every(el => { const island = el.nextElementSibling.getBoundingClientRect(); return el.children[0].getBoundingClientRect().right < island.left && el.children[1].getBoundingClientRect().left > island.right; })'));
  if (glass) assert.ok(await evaluate(`document.querySelector(${JSON.stringify(habitatGrowth + ' .growth-bar')}).getBoundingClientRect().width > 80`));
  await screenshot(name + '-mobile');
  if (glass) {
    await verifySwipe();
    await swipeWorkout('today');
  }
  await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  await screenshot(name + '-mobile-record');
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('document.querySelectorAll(".sheet").length'), 0);
  if (glass) {
    await clickLead('tab', 'pet');
    await includes(lead('.pet-scene-panel'), '成长 1 次');
    await settleHabitatAnimation();
    assert.ok(await evaluate(`(() => {
      const petScene = document.querySelector(${JSON.stringify(lead('.habitat-entry'))});
      const panel = petScene.querySelector('.pet-scene-panel').getBoundingClientRect();
      const nav = document.querySelector(${JSON.stringify(lead('.tabbar'))}).getBoundingClientRect();
      return petScene.getBoundingClientRect().height === innerHeight && panel.bottom < nav.top;
    })()`));
    await screenshot(name + '-mobile-pet');
  }
}

async function verifyOnboarding(screenshotPrefix = 'ios-prototype-onboarding') {
  const screen = JSON.stringify(lead('.onboarding'));
  const background = () => evaluate(`document.querySelector(${screen}).style.backgroundColor`);
  const heading = lead('.onboarding h2');
  const submitStep = () => click(lead('.onboarding button[type="submit"]'));
  const goal = lead('.onboarding input[name="minutes"]');
  await includes(heading, '设定每日训练目标');
  assert.ok(await evaluate(`(() => {
    const view = document.querySelector(${screen});
    const phone = view.closest('.ios-screen');
    const rect = view.getBoundingClientRect();
    return !view.hidden && rect.height === phone.getBoundingClientRect().height &&
      rect.width === phone.getBoundingClientRect().width && getComputedStyle(view).backgroundImage === 'none' &&
      phone.querySelector('.tabbar').inert && view.scrollWidth === view.clientWidth;
  })()`), 'Onboarding covers the phone with a solid color');
  const goalColor = await background();
  const warning = lead('.onboarding-warning');
  await change(goal, '120');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(warning)}).textContent`), '');
  await change(goal, '121');
  await includes(warning, '超过 2 小时');
  await screenshot(screenshotPrefix + '-goal');
  await submitStep();
  await includes(heading, '领养宠物');
  assert.notEqual(await background(), goalColor);
  await click(lead('.onboarding .species-choice:has(input[value="rabbit"])'));
  await change(lead('.onboarding input[name="name"]'), '小栗');
  await click(lead('.onboarding [data-back]'));
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(goal)}).value`), '121');
  await includes(warning, '避免过度训练');
  await submitStep();
  await screenshot(screenshotPrefix + '-pet');
  assert.equal(await evaluate(`document.querySelector(${screen}).querySelector('input[name="species"]:checked').value`), 'rabbit');
  await submitStep();
  await includes(heading, '选择栖息地');
  const preview = JSON.stringify(lead('.onboarding-preview canvas'));
  const grass = await evaluate(`document.querySelector(${preview}).toDataURL()`);
  await change(lead('.onboarding select[name="habitat"]'), 'running-track');
  assert.notEqual(await evaluate(`document.querySelector(${preview}).toDataURL()`), grass);
  await screenshot(screenshotPrefix + '-habitat');
  await submitStep();
  assert.equal(await evaluate(`document.querySelector(${screen}).hidden`), true);
  assert.equal(await inHabitat(), true);
  await includes(lead('.habitat-entry-header'), '小栗');
  assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(lead('.habitat-landscape[data-species="rabbit"][data-habitat="running-track"]'))}))`));
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
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(lead('.heatmap'))}).nextElementSibling.classList.contains('record-actions')`));
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
  await clickLead('filter', 'device');
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(cell)}))`), false);
  await clickLead('log-day', '2026-11-14');
  assert.equal(await countRows(), 1);
  await includes(feed, '设备');
  await clickLead('filter', 'all');
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
  await click(workout(another) + ' ' + act('manual', another));
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
  for (const [tab, title] of [['week', '训练计划'], ['log', '训练记录']]) {
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
  await includes(lead('.habitat-entry-header'), '我的宠物');
  await includes(lead('.habitat-entry-header'), '领养于 11月9日');
  await includes(lead('.pet-scene-panel'), '成长与血量');
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
  assert.equal(await evaluate('document.activeElement.dataset.action'), 'manual');
  await clickLead('manual', 'today');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.sheet'))}).getAnimations().length`), 0);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(lead('.sheet input[name="title"]'))})).backdropFilter`), 'none');
  await clickLead('close');
  await cmd('Emulation.setEmulatedMedia', { features: [] });
}

async function verifyWeekPicker() {
  const week = selector => '[data-phone="week"] ' + selector;
  await includes(week('.week-trigger'), '2026 年第 47 周');
  await includes(week('.week-trigger'), '11月16日–11月22日');
  await includes(week('.week-summary > div:nth-child(2) dt'), '本周训练时长');
  await includes(week('.week-summary > div:nth-child(2) dd'), '0 分钟');
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
  await click(lead('.record-actions [data-action="manual"]'));
  const input = lead('.sheet input[name="title"]');
  const project = JSON.stringify(input);
  const suggestion = value => lead(act('pick-project', value));
  assert.equal(await evaluate(`document.querySelector(${project}).value`), '');
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(lead('.project-history button'))}).length`), 0);
  await change(input, '  自由泳  ');
  await submit();
  const entry = lead(act('record', 'record-2'));
  await includes(entry, '自由泳');
  await includes(entry, '仅训练记录');
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
  await includes(entry, '已匹配计划');
  await clickLead('tab', 'week');
  await includes(lead('.week-summary dd'), '1 / 3');
  await click(lead('.app-head [data-action="new"]'));
  await click(suggestion('自由泳'));
  assert.equal(await evaluate(`document.querySelector(${project}).value`), '自由泳');
  await change(input, '瑜伽拉伸');
  await submit();
  await includes(lead('.plan-list'), '瑜伽拉伸');
  await navigate('ios-prototype.html', 1440, 1100);
  await enterToday();
  await clickLead('tab', 'log');
  await click(lead('.record-actions [data-action="manual"]'));
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
  await swipeWorkout('today');
  await clickLead('manual', 'today');
  await submit();

  await clickLead('tab', 'week');
  await includes(lead('.week-summary dd'), '1 / 3');
  await swipeWorkout('next');
  await clickLead('edit-plan', 'next');
  await includes(lead('.sheet h3'), '编辑训练计划');
  await change(lead('.sheet input[name="title"]'), '负重深蹲');
  await change(lead('.sheet input[name="date"]'), '2026-11-20');
  await change(lead('.sheet input[name="minutes"]'), '35');
  await submit();
  const changedPlan = lead(act('detail', 'next'));
  for (const content of ['负重深蹲', '11月20日', '35 分钟']) await includes(changedPlan, content);
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
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await swipeWorkout('record-2', 'left', true);
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
  await clickLead('edit-record', 'record-2');
  await includes(lead('.sheet h3'), '编辑训练记录');
  await change(lead('.sheet input[name="title"]'), '晚间慢跑');
  await change(lead('.sheet input[name="minutes"]'), '35');
  await submit();
  const changedRecord = lead(act('record', 'record-2'));
  for (const content of ['晚间慢跑', '35 分钟', '已匹配计划']) await includes(changedRecord, content);
  await clickLead('tab', 'home');
  await includes(lead('.today-remaining'), '你距离目标还有0分钟');
  await clickLead('tab', 'log');
  await clickLead('log-day', '2026-11-16');
  await swipeWorkout('record-2');
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
  await includes(lead('.habitat'), '成长 1 次');
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
    const button = document.querySelector('[data-phone="log"] .record-actions .primary');
    const face = colorChannels(getComputedStyle(button).backgroundColor);
    const text = colorChannels(getComputedStyle(button).color);
    const contrast = (luminance(face) + .05) / (luminance(text) + .05);
    const pixel = (selector, x, y) => document.querySelector(selector).getContext('2d').getImageData(x, y, 1, 1).data;
    const isGreen = ([red, green, blue]) => green > red && green > blue;
    const habitat = '[data-phone="home"] .habitat-landscape';
    const card = '[data-phone="home"] .habitat-art canvas';
    const sky = pixel(habitat, 0, 0);
    const white = 'rgb(255, 255, 255)';
    return ['html', 'body', '.ios-screen', '.app-scroll', '.week-card', '.heatmap'].every(selector => background(selector) === white) &&
      isLightGray(colorChannels(background('[data-phone="log"] .record-actions .secondary'))) &&
      isLightGray(colorChannels(background('[data-phone="week"] .day.actual'))) &&
      isLightGray(colorChannels(background('.tabbar'))) && isLightGray(face) && contrast >= 4.5 &&
      sky[0] < sky[1] && sky[1] < sky[2] &&
      isGreen(pixel(habitat, 0, 140)) && isGreen(pixel(habitat, 5, 64)) &&
      isGreen(pixel(card, 0, 60)) && isGreen(pixel(card, 5, 37));
  })()`), 'Main surfaces are white, controls use light gray, and the habitat has green grass and trees');
  assert.ok(await evaluate(`(() => {
    return ['.record-actions .primary', '.record-actions .secondary', '.segments', '.week-trigger',
      '.week-days .day', '.scene-control', '.today-task .list-row'].every(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.backgroundImage.includes('linear-gradient') && style.backdropFilter.includes('blur');
    });
  })()`), 'Internal controls use glass highlights and backdrop blur');
}

async function verifyOpenSurfaces() {
  assert.ok(await evaluate(`(() => {
    const selectors = [
      '.habitat-link', '.today-task', '.week-card', '.heatmap', '.pet-scene-panel', '.tabbar',
      '.round', '.board-controls button', '.record-actions .secondary', '.heat-cell'
    ];
    const canvas = getComputedStyle(document.querySelector('.habitat-link .pixel-scene'));
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
    const matchesTodayGap = [['.week-card', '.plan-list'], ['.heatmap', '.record-actions']]
      .every(([first, second]) => Math.abs(gapBetween(first, second) - 29) < .5);
    return selectors.every(selector => getComputedStyle(document.querySelector(selector)).borderWidth === '0px') &&
      canvas.maskImage.includes('linear-gradient') && portrait.maskImage === 'none' && hasOpenSpacing && matchesTodayGap && compactWeek;
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
    return headline.scrollWidth === headline.clientWidth &&
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
  await change('#demo-scene', 'onboarding');
  await verifyOnboarding('ios-prototype-mobile-onboarding');
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
