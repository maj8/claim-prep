// Browser test: phone-sized Chromium, app served from a sub-folder (as on merra.org/claim-prep/).
// Usage: node e2e/run.mjs http://localhost:8765/claim-prep/  (screenshots go to e2e/out/)
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2];
const OUT = 'e2e/out/'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = (n) => page.screenshot({ path: OUT + n + '.png', fullPage: true });
const step = (s) => console.log('•', s);

await page.goto(BASE);
await page.getByRole('button', { name: 'Set up' }).click();
await page.getByLabel('Your name').fill('Test Person');
await page.getByLabel('University email').fill('tp@st-andrews.ac.uk');
await page.getByLabel('Last 4 digits of your university card').fill('4536');
await shot('01-about-you');
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Add an account' }).click();
await page.getByLabel("Name you'll recognise").fill('My research account');
await page.getByLabel('Cost centre').fill('10019');
await page.getByLabel('Analysis code').fill('mjamesyy');
await page.getByLabel('Source of funds (SOF)').fill('ndri');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('button', { name: 'Add a project' }).click();
await page.getByLabel("Name you'll recognise").fill('Everyfish (Innovate UK)');
await page.getByLabel('Project number').fill('10000423');
await page.getByLabel('Expenditure organisation').fill('School of Biology (School-wide)');
await page.getByLabel('Project approver (email)').fill('pi@st-andrews.ac.uk');
await page.getByLabel("Project's cost centre").fill('10014');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await shot('02-codes');
await page.getByRole('button', { name: 'Finish' }).click();
step('setup finished');

// A trip, before adding receipts.
await page.getByRole('button', { name: 'Trips' }).click();
await page.getByRole('button', { name: 'Add a trip' }).click();
await page.getByLabel('Trip name (becomes the Oracle report name)').fill('Project meeting, Bilbao');
await page.getByLabel('First day').fill('2026-10-12');
await page.getByLabel('Last day').fill('2026-10-15');
await page.getByLabel('Note added to each description (optional)').fill('to be rejournalled to the project');
await page.getByRole('button', { name: 'Save trip' }).click();
step('trip added');

await page.getByRole('button', { name: /^Receipts/ }).click();
const t0 = Date.now();
await page.locator('input[type=file][multiple]').setInputFiles(['e2e/fixtures/taxi.jpg', 'e2e/fixtures/netlify-chrome.pdf', 'e2e/fixtures/hotel-reportlab.pdf']);
await page.waitForFunction(() => document.querySelectorAll('.list .item').length === 3 && !document.querySelector('.chip.info:not(:empty)')?.textContent?.match(/Reading|Starting|Preparing|Opening|Getting|Working/), null, { timeout: 120000 });
step(`3 receipts read in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await shot('03-list');
const list = await page.locator('.list .item').allInnerTexts();
console.log(list.map(t => '   ' + t.replace(/\n+/g, ' | ')).join('\n'));

// Open the taxi.
await page.locator('.list .item', { hasText: 'Oscar' }).click();
await page.waitForSelector('.detail');
await shot('04-taxi');
const fields = await page.locator('.oracle div').allInnerTexts();
console.log('   Oracle fields:\n' + fields.map(t => '     ' + t.replace(/\n/g, ': ')).join('\n'));
const auto = await page.locator('.note').innerText().catch(() => '');
console.log('   ' + auto.replace(/\n/g, ' / '));

// Send: headless Chromium has no share sheet, so the fallback saves the file and opens an email.
const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
await page.evaluate(() => { (window).__nav = []; });
await page.getByRole('button', { name: 'Send to Oracle' }).click();
const d = await dl;
step('send fallback saved: ' + (d ? d.suggestedFilename() : 'nothing'));
await page.getByRole('button', { name: 'Yes, sent' }).click({ timeout: 10000 }).catch(e => step('no confirm sheet: ' + e.message));
await page.waitForTimeout(300);
await page.goBack();

// Setup: rules learnt, coding sheet download.
await page.getByRole('button', { name: 'Setup' }).click();
await page.getByRole('button', { name: /Supplier rules/ }).click();
console.log('   rules: ' + (await page.locator('.rows li').allInnerTexts()).join(' ; ').replace(/\n/g, ' '));
await shot('05-setup');
await page.getByRole('button', { name: /^Receipts/ }).click();
await page.getByRole('button', { name: /^All/ }).click();
const dl2 = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download coding sheet' }).click();
const sheet = await dl2; const path = OUT + sheet.suggestedFilename(); await sheet.saveAs(path);
step('coding sheet: ' + path);

// Offline: reload with the network off.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 }).catch(() => step('service worker not controlling yet'));
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('.list .item', { timeout: 10000 }).then(() => step('works offline'), () => step('OFFLINE FAILED'));
await ctx.setOffline(false);

const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json()).catch(e => String(e));
step('manifest: ' + (manifest.name || manifest) + ', share target ' + (manifest.share_target ? 'yes' : 'no'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No page errors.');
await browser.close();
