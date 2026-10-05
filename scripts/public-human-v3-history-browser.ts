// Read-only public compatibility checks. Saved fixture storage never leaves
// the browser context; no signing credential or transaction is installed.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const privatePath = process.env.PONG_BROWSER_PRIVATE_PATH!;
assert(privatePath.includes('private-backups'));
const saved = JSON.parse(await readFile(privatePath, 'utf8'));
const manifest = JSON.parse(await readFile('deployments/independent-v3-20261005.json', 'utf8'));
const out = 'artifacts/qualification/human-v3-history-20261005';
await mkdir(out, {recursive: true});
const report: any = {at: new Date().toISOString(), passed: false, checks: []};
try {
  for (const channel of ['chrome', 'msedge']) {
    const browser = await chromium.launch({channel, headless: true});
    try {
      const context = await browser.newContext({storageState: saved.players[0].storage, viewport: {width: 1440, height: 1000}});
      const errors: string[] = [];
      let writes = 0;
      await context.route('**/*', async route => {
        const req = route.request();
        if (req.method() === 'GET') return route.continue();
        let method = ''; try {method = req.postDataJSON()?.method ?? '';} catch {}
        if (['eth_chainId', 'eth_call', 'eth_getCode', 'eth_getBalance', 'eth_getStorageAt', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_getLogs'].includes(method)) return route.continue();
        writes++; return route.abort();
      });
      await context.addInitScript(() => localStorage.setItem('pongit:arcade-audio', JSON.stringify({entered: true, enabled: false, background: false})));
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://pongit.xyz', {waitUntil: 'domcontentloaded'});
      await page.getByRole('button', {name: 'More', exact: true}).click();
      await page.getByRole('button', {name: 'My recent matches', exact: true}).click();
      const history = page.getByRole('dialog', {name: 'Match history', exact: true});
      await history.getByRole('button', {name: 'Watch replay', exact: true}).first().click();
      await history.locator('canvas').waitFor();
      const slider = history.getByRole('slider', {name: 'Replay position'});
      assert(Number(await slider.getAttribute('max')) > 2);
      await history.getByRole('button', {name: 'Play replay', exact: true}).click();
      await page.waitForTimeout(1600);
      assert(Number(await slider.inputValue()) > 0);
      await page.screenshot({path: `${out}/${channel}-current-replay.png`, fullPage: true});
      await page.keyboard.press('Escape');
      // Historical views are public. This address selects the old public row;
      // it does not supply an authenticator or pretend a financial signature.
      await page.evaluate(() => localStorage.setItem('pongit:remembered-passkey', JSON.stringify({address: '0x85B8c6b2aB8da78b769d24C7468aEc133EB28162', credential: {credentialId: 'read-only-public-history'}, rpId: 'pongit.xyz'})));
      await page.goto(`https://pongit.xyz/rooms/${manifest.previous[0].lobby}:340282366920938463463374607431768211457`, {waitUntil: 'domcontentloaded'});
      await page.getByRole('heading', {name: 'Previous human arenas', exact: true}).waitFor();
      await page.getByRole('button', {name: 'Watch replay', exact: true}).first().click();
      await page.locator('canvas').waitFor();
      await page.getByRole('button', {name: 'Play replay', exact: true}).click();
      await page.waitForTimeout(1600);
      assert(Number(await page.getByRole('slider', {name: 'Replay position'}).inputValue()) > 0);
      await page.getByText('Withdraw betting credit', {exact: true}).click();
      assert(await page.getByRole('button', {name: 'Withdraw with passkey', exact: true}).isVisible());
      assert.equal(await page.getByRole('button', {name: 'Get test betting credit', exact: true}).count(), 0);
      await page.screenshot({path: `${out}/${channel}-historical-replay.png`, fullPage: true});
      await page.getByRole('link', {name: 'Play in the new arenas', exact: true}).click();
      await page.getByRole('button', {name: /Play a person/}).waitFor();
      assert.equal(await page.getByRole('heading', {name: 'Previous human arenas'}).count(), 0);
      assert.deepEqual(errors, []);
      assert.equal(writes, 0);
      report.checks.push({channel, currentReplay: true, historicalReplay: true, historicalWithdrawView: true, backToCurrent: true, writes});
      await context.close();
    } finally {await browser.close();}
  }
  report.passed = true;
} catch (error) {report.error = String((error as Error).message).split('\n')[0]; process.exitCode = 1;}
finally {await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2), {flag: 'wx'}); console.log(JSON.stringify(report));}
