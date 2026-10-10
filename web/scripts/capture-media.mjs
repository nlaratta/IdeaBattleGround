// Records README media from a running dev stack (`npm run dev` at the repo root):
// runs one mock tournament in the browser and writes screenshots + a video.
//   npm --workspace web run media      (needs Google Chrome and ffmpeg)
import { chromium } from 'playwright';
import { mkdirSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const SERVER = process.env.IBG_SERVER ?? 'http://localhost:8787';
const WEB = process.env.IBG_WEB ?? 'http://localhost:5173';
const OUT = resolve(process.cwd(), '..', 'docs', 'media');
const TMP = resolve(OUT, '.tmp');
mkdirSync(TMP, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = () => fetch(`${SERVER}/api/health`).then((r) => r.json());
const state = () => fetch(`${SERVER}/api/state`).then((r) => r.json()).then((d) => d.tournament);

if ((await health()).running) throw new Error('a tournament is already running');

const browser = await chromium.launch({ channel: process.env.IBG_CHANNEL ?? 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Playwright's own video recorder needs a separate ffmpeg download, so grab
// frames in a loop and assemble them with the system ffmpeg instead.
let recording = true;
let frames = 0;
const recStart = Date.now();
const grabber = (async () => {
  while (recording) {
    try {
      await page.screenshot({ path: resolve(TMP, `f${String(frames).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 80 });
      frames++;
    } catch { /* page navigating */ }
  }
})();

await page.goto(WEB);
await sleep(1500);
await page.click('button:text-is("universe")');
// Brisk pacing so the whole run fits in a short clip.
const setRange = (label, value) => page.evaluate(([label, value]) => {
  const row = [...document.querySelectorAll('span')].find((el) => el.textContent === label)?.parentElement;
  const input = row?.querySelector('input[type=range]');
  if (!input) throw new Error(`no slider: ${label}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, [label, value]);
await setRange('swiss rounds', 3);
await setRange('duel ms', 1000);
await setRange('linger ms', 1000);
await page.click('text=start tournament');

// Universe view during generation/judging, then orbital view mid-battle.
let shotOrbital = false;
let t0 = Date.now();
for (;;) {
  const t = await state();
  if (t?.phase === 'pairwise' && !shotOrbital) {
    await sleep(1500);
    await page.click('button:text-is("orbital")');
    await sleep(1500);
    await page.click('button:text-is("auto-follow on")'); // manual cam: frame the whole field
    await sleep(2500);
    await page.screenshot({ path: resolve(OUT, 'orbital-mid-battle.png') });
    await page.click('button:text-is("universe")');
    shotOrbital = true;
  }
  if (t?.phase === 'complete') break;
  if (Date.now() - t0 > 240_000) throw new Error('tournament timed out');
  await sleep(500);
}
await sleep(1500);
await page.screenshot({ path: resolve(OUT, 'universe-champions.png') });
await sleep(9000); // let the champion reveal play out
await page.click('button:text-is("tree")');
await sleep(2500);
await page.screenshot({ path: resolve(OUT, 'tree-final.png') });

recording = false;
await grabber;
const fps = (frames / ((Date.now() - recStart) / 1000)).toFixed(2);
await ctx.close();
await browser.close();
const input = ['-framerate', fps, '-i', resolve(TMP, 'f%05d.jpg')];

// Frames -> mp4 (1280 wide, real time) and a looping 2x-speed GIF (kept under ~6 MB).
const mp4 = resolve(OUT, 'tournament.mp4');
const gif = resolve(OUT, 'tournament.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-vf', 'setpts=PTS/2,fps=8,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
rmSync(TMP, { recursive: true, force: true });
console.log('wrote', readdirSync(OUT).join(', '));
if (errors.length) console.warn('browser console errors:\n' + [...new Set(errors)].join('\n'));
