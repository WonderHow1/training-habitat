import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = resolve(process.argv[2] || join(tmpdir(), 'training-habitat-film'));
const stillsOnly = process.argv.includes('--stills-only');
const encoderSmoke = process.argv.includes('--encoder-smoke');
const chrome = process.env.PIXEL_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'film-chrome-'));
const browser = spawn(chrome, [
  '--headless', '--disable-background-networking', '--no-first-run',
  '--no-default-browser-check', '--no-sandbox', '--remote-debugging-pipe', '--user-data-dir=' + profile,
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const pending = new Map();
const consoleErrors = [];
let messageId = 0;
let sessionId;
let buffer = '';
function failPending(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}
browser.on('error', failPending);
browser.on('exit', () => failPending(new Error('Browser closed')));
browser.stdio[4].setEncoding('utf8');
browser.stdio[4].on('data', text => {
  const messages = (buffer + text).split('\0');
  buffer = messages.pop();
  for (const message of messages) {
    const { id, result, error, method, params } = JSON.parse(message);
    if (method === 'Runtime.exceptionThrown') consoleErrors.push(params.exceptionDetails);
    const wait = pending.get(id);
    if (!wait) continue;
    pending.delete(id);
    if (error) wait.reject(new Error(error.message));
    else wait.resolve(result);
  }
});
function command(method, params = {}, session = sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId: session }) + '\0');
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
  return result.result.value;
}
const watchdog = setTimeout(() => browser.kill('SIGKILL'), 240_000);
try {
  mkdirSync(output, { recursive: true });
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await command('Target.attachToTarget', { targetId, flatten: true }));
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: new URL('film.html', import.meta.url).href });
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 10000;
    const timer = setInterval(() => {
      if (window.__ready) { clearInterval(timer); resolve(true); }
      else if (performance.now() > deadline) { clearInterval(timer); reject(new Error('Film assets did not load')); }
    }, 25);
  })`);
  const film = await evaluate(`({fps: film.FPS, duration: film.duration, width: film.canvas.width, height: film.canvas.height})`);
  assert.deepEqual(film, { fps: 30, duration: 74, width: 1920, height: 1080 });
  const checkpoints = {
    opening: 4.25, audience: 13.8, premise: 19.9, goal: 24.35, adoption: 26.4,
    name: 28.3, habitatSelection: 30.4, habitat: 31.5, add: 33.6, wheels: 35.5, edit: 37.9, date: 40.37,
    record: 42.36, timerStart: 43.8, timer: 45.55, manual: 47.7, start: 50.1, beforeGrowth: 54.65,
    growth: 55.11, afterGrowth: 55.61, catStages: 57.7, hearts: 60.9, review: 64.5,
    firstTest: 67.15, end: 72.22,
  };
  const stills = new Map();
  for (const [name, time] of encoderSmoke ? [] : Object.entries(checkpoints)) {
    const base64 = await evaluate(`(__seek(${time}),film.canvas.toDataURL('image/jpeg',.94).split(',')[1])`);
    const buffer = Buffer.from(base64, 'base64');
    assert.ok(buffer.length > 30_000, `${name} unexpectedly blank`);
    stills.set(name, buffer);
    writeFileSync(join(output, name + '.jpg'), buffer);
  }
  if (!encoderSmoke) {
    const revisitError = await evaluate(`(() => {
      const sample = document.createElement('canvas');
      sample.width = 64;
      sample.height = 36;
      const context = sample.getContext('2d', {willReadFrequently:true});
      const frameAt = time => {
        __seek(time);
        context.drawImage(film.canvas, 0, 0, 64, 36);
        return context.getImageData(0,0,64,36).data;
      };
      const first = frameAt(${checkpoints.growth});
      frameAt(${checkpoints.end});
      const second = frameAt(${checkpoints.growth});
      return first.reduce((sum,value,i) => sum + Math.abs(value - second[i]), 0) / first.length;
    })()`);
    assert.ok(revisitError < .3, 'Seeking returns to visually identical content');
    assert.notDeepEqual(stills.get('beforeGrowth'), stills.get('growth'), 'Intermediate growth renders a changed frame');
    assert.notDeepEqual(stills.get('growth'), stills.get('afterGrowth'), 'The next stage appears after growth');
  }
  const validateArtwork = await evaluate(`(() => {
    const stages = [1,2,3].map(i => {
      const surface = document.createElement('canvas');
      surface.width = 39;
      surface.height = 39;
      const context = surface.getContext('2d');
      context.drawImage(images['cat' + i], 0, 0);
      const { data } = context.getImageData(0,0,39,39);
      const bounds = { x:39, y:39, right:0, bottom:0 };
      for (let y = 0; y < 39; y += 1) for (let x = 0; x < 39; x += 1) {
        if (!data[(y*39+x)*4+3]) continue;
        bounds.x = Math.min(bounds.x,x);
        bounds.y = Math.min(bounds.y,y);
        bounds.right = Math.max(bounds.right,x);
        bounds.bottom = Math.max(bounds.bottom,y);
      }
      return [bounds.right - bounds.x, bounds.bottom - bounds.y];
    });
    return stages.every(([width,height], i) => i === 0 || width > stages[i-1][0] && height > stages[i-1][1]);
  })()`);
  assert.equal(validateArtwork, true, 'The film uses all three progressively larger cat silhouettes');
  assert.deepEqual(consoleErrors, [], 'Film preview has no browser exceptions');
  if (stills.size) console.log(`Verified and captured ${stills.size} film frames.`);

  if (!stillsOnly) {
    const mode = await evaluate(`(async () => {
      const config = {
        codec:'avc1.420028', width:1920, height:1080, bitrate:6500000, framerate:30,
        avc:{format:'annexb'}, latencyMode:'realtime',
      };
      for (const hardwareAcceleration of ['prefer-hardware','prefer-software','no-preference']) {
        const result = await VideoEncoder.isConfigSupported({...config,hardwareAcceleration});
        if (result.supported) {
          window.packetBuffers = [];
          window.encodedFrames = 0;
          window.encoder = new VideoEncoder({
            output(chunk) {
              const destination = new Uint8Array(chunk.byteLength);
              chunk.copyTo(destination);
              packetBuffers.push(destination);
              window.encodedFrames++;
            },
            error(error) { window.encodingError = error; },
          });
          encoder.configure(result.config);
          return hardwareAcceleration;
        }
      }
      throw new Error('This Chrome installation has no H.264 WebCodecs encoder');
    })()`);
    console.log('Browser H.264 encoder:', mode);
    const raw = join(output, 'film.h264');
    writeFileSync(raw, '');
    const totalFrames = encoderSmoke ? 30 : film.fps * film.duration;
    const group = 120;
    for (let first = 0; first < totalFrames; first += group) {
      const last = Math.min(first + group, totalFrames);
      const base64 = await evaluate(`(async () => {
        for (let i = ${first}; i < ${last}; i += 1) {
          while (encoder.encodeQueueSize > 7) {
            if (window.encodingError) throw window.encodingError;
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          __seek(i / film.FPS);
          const frame = new VideoFrame(film.canvas, { timestamp: Math.round(i * 1e6 / film.FPS) });
          encoder.encode(frame, { keyFrame: i % 60 === 0 });
          frame.close();
        }
        if (window.encodingError) throw window.encodingError;
        await encoder.flush();
        const blob = new Blob(window.packetBuffers);
        window.packetBuffers.length = 0;
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      })()`);
      appendFileSync(raw, Buffer.from(base64, 'base64'));
      if (last % 600 === 0 || last === totalFrames) console.log(`Encoded ${last}/${totalFrames} frames`);
    }
    assert.equal(await evaluate('window.encodedFrames'), totalFrames);
    await evaluate('encoder.close()');
    console.log(raw);
  }
} finally {
  clearTimeout(watchdog);
  await command('Browser.close').catch(() => {});
  if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('close', resolve));
  rmSync(profile, { recursive: true, force: true });
}
