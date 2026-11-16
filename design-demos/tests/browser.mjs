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
    await evaluate(`Promise.allSettled(document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getAnimations().map(animation => animation.finished))`);
    await evaluate('window.scrollTo(0, 0)');
    await screenshot(name + '-today');
  }
  await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  if (glass) {
    assert.ok(await evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(lead('.sheet'))});
      const field = sheet.querySelector('select');
      return sheet.contains(document.activeElement) && sheet.getAnimations().length > 0 &&
        getComputedStyle(sheet).borderWidth === '0px' && getComputedStyle(field).borderWidth === '0px';
    })()`));
    await evaluate(`Promise.allSettled(document.querySelector(${JSON.stringify(lead('.sheet'))}).getAnimations().map(animation => animation.finished))`);
    await screenshot(name + '-record');
  }
  await submit();
  await includes(lead('.sheet h3'), '确认关联');
  await submit();
  await includes(lead('.today-task'), '已完成');
  await includes(lead('.habitat'), '成长 2 次');
  if (glass) {
    await clickLead('habitat');
    assert.equal(await inHabitat(), true);
    await includes(habitatGrowth, '成长 2 次');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(habitatGrowth + ' .growth-bar i')}).style.width`), '40%');
    await enterToday();
  }
  assert.equal(await evaluate('document.querySelector(\'[data-phone="week"] .week-total strong\').textContent.trim()'), '0 / 3');
  await clickLead('tab', 'log');
  await includes(lead('.record-feed'), '校园夜跑');
  if (glass) await verifyHeatmapAfterSaving();
  await clickLead('import');
  await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
  await submit();
  await clickLead('tab', 'week');
  await clickLead('previous');
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
  await submit();
  await clickLead('detail', 'grace');
  await includes(lead('.sheet .sheet-status'), '已完成');
  await clickLead('close');
  await click('#reset');
  if (glass) {
    assert.equal(await inHabitat(), true);
    await enterToday();
  }
  await clickLead('reschedule', 'today');
  await change(lead('input[name="date"]'), '2026-11-17');
  await submit();
  await includes(lead('.today-task'), '今天无计划训练');
  await includes(lead('.following'), '11月17日');

  if (index === 1) {
    const petSummary = lead(glass ? '.habitat-entry-header' : '.habitat');
    await change('#demo-scene', 'death');
    await includes(petSummary, '已离世');
    await clickLead('adopt');
    await change(lead('input[name="name"]'), '点点');
    await submit();
    await includes(petSummary, '点点');
    await clickLead('tab', 'log');
    await clickLead('import');
    await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
    await submit();
    await clickLead('tab', 'pet');
    await clickLead('restore', 'moss');
    await clickLead('confirm-restore', 'moss');
    await includes(petSummary, '团团');
    await change('#demo-scene', 'onboarding');
    await submit();
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

  await navigate(name + '.html', 390, glass ? 760 : 1120);
  assert.equal(await evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".ios-status")].every(el => { const island = el.nextElementSibling.getBoundingClientRect(); return el.children[0].getBoundingClientRect().right < island.left && el.children[1].getBoundingClientRect().left > island.right; })'));
  if (glass) assert.ok(await evaluate(`document.querySelector(${JSON.stringify(habitatGrowth + ' .growth-bar')}).getBoundingClientRect().width > 80`));
  await screenshot(name + '-mobile');
  if (glass) await verifySwipe();
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

async function habitatPoint() {
  return evaluate(`(() => {
    const rect = document.querySelector(${JSON.stringify(lead('.habitat-entry'))}).getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height * 0.62) };
  })()`);
}

async function verifyHeatmapAfterSaving() {
  const cell = lead(act('log-day', '2026-11-16'));
  const feed = lead('.record-feed .list-row');
  const countRows = () => evaluate(`document.querySelectorAll(${JSON.stringify(feed)}).length`);
  const allRows = await countRows();
  assert.ok(allRows > 4, 'The heatmap has a populated sample history');
  await includes(lead('.heatmap-head strong'), String(allRows));
  const months = await evaluate(`[...document.querySelectorAll(${JSON.stringify(lead('.heat-month'))})].map(label => label.textContent).filter(Boolean)`);
  assert.deepEqual(months, ['9月', '10月', '11月']);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cell)}).title`), '11月16日 · 1 次训练');
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(lead('.heatmap'))}).nextElementSibling.classList.contains('record-actions')`));
  await click(cell);
  assert.equal(await countRows(), 1, 'Selecting a date filters the history to that day');
  await includes(feed, '校园夜跑');
  await click(lead('.heatmap-footer [data-action="log-day"]'));
  assert.equal(await countRows(), allRows);
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
  await verifyPrototypePalette();
  await verifyOpenSurfaces();
  const { x, y } = await habitatPoint();
  const wheel = deltaY => cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  await wheel(42);
  await assertSceneScale(false);
  await wheel(66);
  await waitForHabitat(false);
  await wheel(-102);
  await waitForHabitat(true);
  await enterToday();
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
  await clickLead('manual', 'today');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(lead('.sheet'))}).getAnimations().length`), 0);
  await clickLead('close');
  await cmd('Emulation.setEmulatedMedia', { features: [] });
}

async function verifyPrototypePalette() {
  assert.ok(await evaluate(`(() => {
    const background = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    const colorChannels = color => color.match(/[0-9]+/g).slice(0, 3).map(Number);
    const isPaleBlue = ([red, green, blue]) => red >= 215 && red < green && green < blue;
    const luminance = channels => channels.map(value => {
      const srgb = value / 255;
      return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const button = document.querySelector('[data-phone="log"] .record-actions .primary');
    const face = colorChannels(getComputedStyle(button).backgroundColor);
    const text = colorChannels(getComputedStyle(button).color);
    const contrast = (luminance(text) + .05) / (luminance(face) + .05);
    const pixel = (selector, x, y) => document.querySelector(selector).getContext('2d').getImageData(x, y, 1, 1).data;
    const isGreen = ([red, green, blue]) => green > red && green > blue;
    const habitat = '[data-phone="home"] .habitat-landscape';
    const card = '[data-phone="home"] .habitat-art canvas';
    const sky = pixel(habitat, 0, 0);
    const white = 'rgb(255, 255, 255)';
    return ['body', '.ios-screen', '[data-phone="log"] .heatmap'].every(selector => background(selector) === white) &&
      isPaleBlue(colorChannels(background('[data-phone="log"] .record-actions .secondary'))) &&
      face[0] < face[1] && face[1] < face[2] && contrast >= 4.5 &&
      sky[0] < sky[1] && sky[1] < sky[2] &&
      isGreen(pixel(habitat, 0, 140)) && isGreen(pixel(habitat, 5, 64)) &&
      isGreen(pixel(card, 0, 60)) && isGreen(pixel(card, 5, 37));
  })()`), 'Main surfaces are white, secondary controls are pale blue, and the habitat has green grass and trees');
}

async function verifyOpenSurfaces() {
  assert.ok(await evaluate(`(() => {
    const selectors = [
      '.habitat-link', '.today-task', '.week-card', '.heatmap', '.pet-scene-panel', '.tabbar',
      '.round', '.board-controls button', '.record-actions .secondary', '.heat-cell'
    ];
    const canvas = getComputedStyle(document.querySelector('.habitat-link .pixel-scene'));
    const portrait = getComputedStyle(document.querySelector('.habitat-landscape'));
    const blockDividers = ['.board-header', '.board-footer p', '.week-total', '.plan-list .list-row', '.record-feed .list-row', '.pet-scene-panel .list-row'];
    const hasOpenSpacing = blockDividers.every(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.borderTopWidth === '0px' && style.borderBottomWidth === '0px';
    }) && parseFloat(getComputedStyle(document.querySelector('.week-days')).marginTop) > 9 &&
      parseFloat(getComputedStyle(document.querySelector('.plan-list .list-row')).paddingTop) > 11;
    return selectors.every(selector => getComputedStyle(document.querySelector(selector)).borderWidth === '0px') &&
      canvas.maskImage.includes('linear-gradient') && portrait.maskImage === 'none' && hasOpenSpacing;
  })()`), 'Cards and controls have no perimeter strokes, and lists use whitespace instead of dividers');
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
