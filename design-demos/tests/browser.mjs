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
async function click(selector) {
  // CDP dispatches a real mouse click at the control. Center the control inside the viewport first.
  const [{ x, y }, ...rest] = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return [];
    if (!el.checkVisibility()) throw new Error('Control is not visible');
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
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
async function demoDirection(index) {
  await navigate(`dir-${index}.html`, 1440, 1100);
  assert.equal(await evaluate('document.querySelectorAll(".phone-app").length'), 4);
  assert.equal(await evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".ios-shell")].every(x => x.getBoundingClientRect().width >= 300)'));
  assert.ok(await evaluate('document.querySelector("canvas").getContext("2d").getImageData(70,55,1,1).data[3] === 255'));
  await screenshot(`dir-${index}`);
  await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  await submit();
  await includes(lead('.sheet h3'), '确认关联');
  await submit();
  await includes(lead('.today-task'), '已完成');
  await includes(lead('.habitat'), '成长 2 次');
  assert.equal(await evaluate('document.querySelector(\'[data-phone="week"] .week-total strong\').textContent.trim()'), '0 / 3');
  await clickLead('tab', 'log');
  await includes(lead('.record-feed'), '校园夜跑');
  await clickLead('import');
  await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
  await submit();
  await clickLead('tab', 'week');
  await clickLead('previous');
  await clickLead('detail', 'old');
  await includes(lead('.sheet .sheet-status'), '已完成');
  await includes(lead('.sheet-note'), '撤销本次扣血');
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
  await clickLead('reschedule', 'today');
  await change(lead('input[name="date"]'), '2026-11-17');
  await submit();
  await includes(lead('.today-task'), '今天无计划训练');
  await includes(lead('.following'), '11月17日');

  if (index === 1) {
    await change('#demo-scene', 'death');
    await includes(lead('.habitat'), '已离世');
    await clickLead('adopt');
    await change(lead('input[name="name"]'), '点点');
    await submit();
    await includes(lead('.habitat'), '点点');
    await clickLead('tab', 'log');
    await clickLead('import');
    await click(lead('.sheet [data-action="device"]:nth-of-type(1)'));
    await submit();
    await clickLead('tab', 'pet');
    await clickLead('restore', 'moss');
    await clickLead('confirm-restore', 'moss');
    await includes(lead('.habitat'), '团团');
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

  await navigate(`dir-${index}.html`, 390, 1120);
  assert.equal(await evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".ios-status")].every(el => { const island = el.nextElementSibling.getBoundingClientRect(); return el.children[0].getBoundingClientRect().right < island.left && el.children[1].getBoundingClientRect().left > island.right; })'));
  await screenshot(`dir-${index}-mobile`);
  await clickLead('manual', 'today');
  await includes(lead('.sheet h3'), '手动记录');
  await screenshot(`dir-${index}-record`);
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('document.querySelectorAll(".sheet").length'), 0);
}
let failed = false;
try {
  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true }));
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  for (const direction of [1, 2, 3]) await demoDirection(direction);
  await navigate('thumbs.html', 1440, 940);
  assert.equal(await evaluate('document.querySelectorAll("[data-thumb]").length'), 6);
  assert.equal(await evaluate('document.querySelectorAll("[data-thumb] a").length'), 3);
  await screenshot('thumbs');
  assert.deepEqual(errors, [], 'Browser console exceptions');
  console.log('Browser verification passed for three directions and six candidates.');
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
