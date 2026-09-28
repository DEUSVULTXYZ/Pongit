// Read-only browser qualification against actual retained private game frames.
// The bridge forwards unchanged JSON. No admission, wallet or engine is used.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {validateAgentPoolManifest} from '../shared/agent-pool';

assert.equal(process.env.PONG_FIVE_REPLAY, 'actual-private-read-only');
const directory = 'artifacts/qualification/20260928';
const manifest = validateAgentPoolManifest(JSON.parse(await readFile(`${directory}/private-manifest.json`, 'utf8')));
assert.equal(manifest.enabled, false);
assert.equal(manifest.pool.toLowerCase(), '0x384914dc7195b22ad348b57ea2a617e1e8e6b9f3');
const api = 'http://127.0.0.1:4195', web = 'http://localhost:4190';
const app = '0xa4c880d75b2a1896ae56d1bb8e460ea18c07f917', epoch = '1', id = '40';
assert(manifest.arenas.some(a => a.app.toLowerCase() === app));
const response = await fetch(`${api}/agents/replay?app=${app}&epoch=${epoch}&id=${id}`);
assert(response.ok);
const replay = await response.json();
assert.equal(replay.availability, 'available'); assert(replay.frameCount > 2);
const last = replay.frames.at(-1);
const report: any = {startedAt: new Date().toISOString(), passed: false,
  scope: 'Actual private indexed Chaos replay on desktop Chrome and Edge, with mobile viewport simulation. Engines stopped. No fabricated frames, enabled gates or physical mobile claim.',
  ref: {chainId: 10143, app, epoch, id}, frames: replay.frameCount, checks: []};
const attempt = process.env.PONG_REPLAY_ATTEMPT ?? '1';
assert(/^\d+$/.test(attempt));
const output = `${directory}/replay-browser-${attempt}`;
await mkdir(output, {recursive: true});
await writeFile(`${output}/report.json`, JSON.stringify(report), {flag: 'wx'});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (const channel of ['chrome', 'msedge']) {
    browser = await chromium.launch({channel, headless: true});
    for (const [width, height] of [[360, 640], [1440, 1000]]) {
      const context = await browser.newContext({viewport: {width, height}});
      let engineCalls = 0;
      const errors: string[] = [];
      await context.addInitScript(() => localStorage.setItem('pongit:arcade-audio', JSON.stringify({
        entered: true, enabled: false, music: .2, effects: .6, background: false, intensity: 'off',
      })));
      await context.route('**/*', async route => {
        const r = route.request(), u = new URL(r.url());
        try {
          if (u.origin === web) return await route.continue();
          if (u.origin === 'http://localhost:4000') {
            assert.equal(r.method(), 'GET'); assert(u.pathname.startsWith('/agents/'));
            return await route.fulfill({response: await route.fetch({url: api + u.pathname + u.search})});
          }
          engineCalls++; await route.abort('blockedbyclient');
        } catch (e) {
          errors.push((e as Error).message.split('\n')[0]); await route.abort().catch(() => {});
        }
      });
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`${web}/agents/arenas/${app}/${epoch}/${id}`);
        const open = page.getByRole('button', {name: 'Watch replay', exact: true}); await open.click();
        const dialog = page.getByRole('dialog', {name: 'Match replay'});
        await dialog.locator('canvas').waitFor();
        const court = await dialog.locator('canvas').boundingBox();
        assert(court && court.width > 200 && court.height > 110);
        assert(Math.abs(court.width / court.height - 16 / 9) < .03);
        const slider = dialog.getByRole('slider', {name: 'Replay position'});
        assert.equal(await slider.getAttribute('max'), String(replay.frameCount - 1));
        await dialog.getByRole('button', {name: 'Play replay', exact: true}).click();
        await page.waitForTimeout(1800); assert(Number(await slider.inputValue()) > 0);
        await dialog.evaluate(e => e.scrollTo({top: 0}));
        await page.screenshot({path: `${output}/${channel}-${width}-playing.png`, fullPage: true});
        await slider.fill(String(replay.frameCount - 1));
        await dialog.getByText(`${last.state.scoreA} : ${last.state.scoreB}`, {exact: true}).waitFor();
        const score = dialog.locator('.score');
        assert.deepEqual(await score.locator('span').allTextContents(), [last.state.scoreA, last.state.scoreB].map(n => String(n).padStart(2, '0')));
        assert(await score.isVisible());
        assert(await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({path: `${output}/${channel}-${width}.png`, fullPage: true});
        await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
        assert(await open.evaluate(e => e === document.activeElement));
        assert.equal(engineCalls, 0); assert.deepEqual(errors, []);
        report.checks.push({channel, width, height, court, finalScore: [last.state.scoreA, last.state.scoreB],
          engineCalls, playback: true, focus: true});
      } catch (e) {
        report.page = await page.locator('body').innerText();
        await page.screenshot({path: `${output}/${channel}-${width}-failure.png`, fullPage: true});
        throw e;
      } finally {await context.unrouteAll({behavior: 'ignoreErrors'}); await context.close();}
    }
    await browser.close(); browser = undefined;
  }
  report.passed = true;
} catch (e) {report.error = (e as Error).message.split('\n')[0]; process.exitCode = 1;}
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(JSON.stringify({passed: report.passed, checks: report.checks.length, error: report.error}));
}
