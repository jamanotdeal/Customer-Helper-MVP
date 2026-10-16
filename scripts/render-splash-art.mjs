#!/usr/bin/env node
/**
 * Renders the splash artwork — logo, "Jamanot", slogan — once, and writes every
 * copy the platforms need, so each splash on every platform draws the same pixels:
 *
 *   public/splash-art.png                                    AppSplash (in-app)
 *   android/.../drawable-nodpi/ic_splash_logo.png            Android launch splash
 *   ios/App/App/Assets.xcassets/SplashArt.imageset/*.png     iOS launch screen
 *
 * The art sits in a 192×192 box (dp / pt / CSS px). That is the part of the
 * Android 12+ launch icon the system leaves visible: the icon is a 288 dp square
 * masked to a circle of 192 dp, so anything outside that circle is cut off. The
 * block is checked against the circle and scaled down if a corner would be.
 *
 * Needs Google Chrome and a web build (`out/`, for the app's own Inter files).
 * Usage: npm run build && node scripts/render-splash-art.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOX = 192; // art box, CSS px = dp = pt
const MASK_RADIUS = BOX / 2 - 4; // keep a little clear of the circle's edge

// ─── The app's Inter, latin subset, from the build ──────────────────────────
const cssDir = path.join(ROOT, 'out/_next/static/css');
const css = fs.readdirSync(cssDir).map((f) => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n');
const interFace = (weight) => {
  const faces = css.match(/@font-face\{font-family:__Inter_[^}]*\}/g) || [];
  const face = faces.find((f) => f.includes(`font-weight:${weight};`) && /unicode-range:u\+00\?\?/.test(f));
  if (!face) throw new Error(`Inter ${weight} not found in out/ — run a web build first`);
  return face.match(/url\(([^)]+)\)/)[1];
};

// Where the mark sits inside public/Jamanot-Logo.png (2000×2000, white ground).
const LOGO = { size: 2000, x: 603, y: 453, w: 796, h: 1096 };

const page = (markH) => {
  const k = markH / LOGO.h;
  return `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family: InterSplash; font-weight: 800; src: url(${interFace(800)}) format("woff2"); }
  @font-face { font-family: InterSplash; font-weight: 500; src: url(${interFace(500)}) format("woff2"); }
  html, body { margin: 0; background: transparent; }
  #box { width: ${BOX}px; height: ${BOX}px; display: flex; align-items: center; justify-content: center; }
  #block { display: flex; flex-direction: column; align-items: center; }
  #mark { width: ${(LOGO.w * k).toFixed(2)}px; height: ${markH}px; overflow: hidden; position: relative; }
  #mark img { position: absolute; width: ${(LOGO.size * k).toFixed(2)}px; left: ${(-LOGO.x * k).toFixed(2)}px; top: ${(-LOGO.y * k).toFixed(2)}px; mix-blend-mode: multiply; }
  .t { font-family: InterSplash; white-space: nowrap; line-height: 1.15; }
  #name { margin-top: 7px; font-weight: 800; font-size: 20px; letter-spacing: -0.025em; color: #111827; }
  #slogan { margin-top: 1px; font-weight: 500; font-size: 12px; color: #047857; }
</style>
<div id="box"><div id="block">
  <div id="mark"><img src="/public/Jamanot-Logo.png"></div>
  <div id="name" class="t">Jamanot</div>
  <div id="slogan" class="t">Ask. Relax. Done.</div>
</div></div>`;
};

// ─── A throwaway static server and headless Chrome ──────────────────────────
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/art.html') return res.end(page(Number(new URL(req.url, 'http://x').searchParams.get('h'))));
  const file = url.startsWith('/public/') ? path.join(ROOT, url) : path.join(ROOT, 'out', url);
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.setHeader('content-type', file.endsWith('.png') ? 'image/png' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html');
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'splash-chrome-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  chrome.on('exit', () => reject(new Error('Chrome exited')));
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (method, params) => send(method, params, sessionId);
const evaluate = async (expression) => (await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

async function load(markH) {
  await s('Page.navigate', { url: `${base}/art.html?h=${markH}` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`document.readyState === 'complete' && document.fonts.status === 'loaded' && document.images[0]?.complete`)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await evaluate('document.fonts.ready.then(() => document.images[0].decode())');
}

// The farthest ink from the box centre — every corner of the mark and of each
// line of text — must stay inside the circle the Android 12 mask leaves.
const farthest = () =>
  evaluate(`(() => {
    const c = ${BOX / 2};
    const rects = [document.getElementById('mark').getBoundingClientRect()];
    for (const id of ['name', 'slogan']) {
      const r = document.createRange(); r.selectNodeContents(document.getElementById(id));
      rects.push(r.getBoundingClientRect());
    }
    let d = 0;
    for (const r of rects) for (const x of [r.left, r.right]) for (const y of [r.top, r.bottom]) d = Math.max(d, Math.hypot(x - c, y - c));
    return d;
  })()`);

let markH = 112;
await load(markH);
for (let d = await farthest(); d > MASK_RADIUS; d = await farthest()) {
  markH -= 2;
  await load(markH);
}
console.log(`mark ${markH}px tall, farthest ink ${(await farthest()).toFixed(1)}px from centre (limit ${MASK_RADIUS})`);

async function shot(scale, canvas, out) {
  // canvas: the PNG's edge in CSS px; the 192 box is centred in it.
  await s('Emulation.setDeviceMetricsOverride', { width: canvas, height: canvas, deviceScaleFactor: scale, mobile: false });
  await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await evaluate(`document.getElementById('box').style.margin = '${(canvas - BOX) / 2}px'`);
  const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: canvas, height: canvas, scale: 1 } });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`wrote ${path.relative(ROOT, out)} (${canvas * scale}px)`);
}

await shot(4, BOX, path.join(ROOT, 'public/splash-art.png'));
await shot(4, 288, path.join(ROOT, 'android/app/src/main/res/drawable-nodpi/ic_splash_logo.png'));
const iosDir = path.join(ROOT, 'ios/App/App/Assets.xcassets/SplashArt.imageset');
for (const k of [1, 2, 3]) await shot(k, BOX, path.join(iosDir, `splash-art@${k}x.png`));
fs.writeFileSync(
  path.join(iosDir, 'Contents.json'),
  JSON.stringify(
    {
      images: [1, 2, 3].map((k) => ({ idiom: 'universal', filename: `splash-art@${k}x.png`, scale: `${k}x` })),
      info: { version: 1, author: 'xcode' },
    },
    null,
    2
  ) + '\n'
);

ws.close();
const exited = new Promise((r) => chrome.once('exit', r));
chrome.kill();
await exited;
server.close();
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
