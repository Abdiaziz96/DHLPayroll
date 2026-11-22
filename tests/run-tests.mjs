/* Headless functional test for the DHL Payroll Answers demo.
   Drives the real pages in Edge over the Chrome DevTools Protocol, because the
   parts worth testing (accordion, filters, admin edits) only exist once JS runs.

   Run:  node tests/run-tests.mjs
   Exit code 0 means every check passed. */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.argv[2] ||
  'C:\\Users\\Abdurrahman\\Documents\\DeepSeekHarness-Projects\\finance\\dhl-payroll-faq';
const SHOTS = join(ROOT, 'tests', '_shots');
mkdirSync(SHOTS, { recursive: true });
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + String(detail).slice(0, 160) : ''}`);
}

/* ------------------------------------------------------------------ cdp glue */

let socket;
let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
    }, 15000);
  });
}

function waitForEvent(method, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('event timeout: ' + method)), timeout);
    eventWaiters.set(method, () => { clearTimeout(timer); eventWaiters.delete(method); resolve(); });
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result.value;
}

async function goto(url) {
  const loaded = waitForEvent('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await sleep(250);
}

async function waitUntil(expression, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await evaluate(expression)) { return true; } } catch { /* keep polling */ }
    await sleep(80);
  }
  return false;
}

/* A real key press through the browser's input pipeline, so page keydown
   listeners see the same event a person would produce. */
async function pressKey(key, code, vk, text) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send('Input.dispatchKeyEvent', text
    ? { type: 'keyDown', ...base, text, unmodifiedText: text }
    : { type: 'keyDown', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(160);
}

/* --------------------------------------------------------------------- main */

const profile = mkdtempSync(join(tmpdir(), 'payroll-test-'));
let edge;

try {
  edge = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!version) { throw new Error('Edge did not expose a debugging port'); }
  console.log('Browser:', version.Browser, '\n');

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('websocket failed')), { once: true });
  });
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) { reject(new Error(msg.error.message)); } else { resolve(msg.result); }
      return;
    }
    if (msg.method && eventWaiters.has(msg.method)) { eventWaiters.get(msg.method)(); }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const pageErrors = [];
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
  });

  const publicUrl = pathToFileURL(join(ROOT, 'index.html')).href;
  const adminUrl = pathToFileURL(join(ROOT, 'admin.html')).href;

  /* ------------------------------------------------------------ public page */

  console.log('--- public page ---');
  await goto(publicUrl);
  await waitUntil('document.querySelectorAll(".row__btn").length > 0');

  check('public: 12 answers render', await evaluate('document.querySelectorAll(".row__btn").length') === 12,
    'got ' + await evaluate('document.querySelectorAll(".row__btn").length'));
  check('public: banner counts the answers',
    (await evaluate('document.getElementById("bannerText").textContent')).includes('12 answers'));
  check('public: faq count line reads correctly',
    (await evaluate('document.getElementById("faqCount").textContent')) === '12 answers published',
    await evaluate('document.getElementById("faqCount").textContent'));
  check('public: admin badge shows 3 waiting',
    (await evaluate('document.getElementById("pendingCount").textContent')) === '3' &&
    (await evaluate('document.getElementById("pendingCount").hidden')) === false);

  await evaluate('document.querySelectorAll(".row__btn")[0].click()');
  check('public: clicking a question opens it',
    (await evaluate('document.querySelectorAll(".row__btn")[0].getAttribute("aria-expanded")')) === 'true' &&
    (await evaluate('document.querySelectorAll(".row__panel")[0].hasAttribute("hidden")')) === false);

  await evaluate('document.querySelectorAll(".row__btn")[1].click()');
  check('public: opening a second one closes the first',
    (await evaluate('document.querySelectorAll(".row__btn")[0].getAttribute("aria-expanded")')) === 'false' &&
    (await evaluate('document.querySelectorAll(".row__btn")[1].getAttribute("aria-expanded")')) === 'true');

  await evaluate('document.querySelectorAll(".row__btn")[1].click()');
  check('public: clicking the open one closes it',
    (await evaluate('document.querySelectorAll(".row__btn")[1].getAttribute("aria-expanded")')) === 'false');

  await evaluate(`(() => {
    const s = document.getElementById('faqSearch');
    s.value = 'overtime';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const filtered = await evaluate('document.querySelectorAll(".row__btn").length');
  check('public: search narrows the list', filtered > 0 && filtered < 12, 'showed ' + filtered);
  check('public: search updates the count line',
    (await evaluate('document.getElementById("faqCount").textContent')).includes('of 12'),
    await evaluate('document.getElementById("faqCount").textContent'));

  await evaluate(`(() => {
    const s = document.getElementById('faqSearch');
    s.value = 'zzzznothing';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  check('public: no match shows the empty state',
    (await evaluate('!!document.querySelector(".empty")')) === true);

  await evaluate(`(() => {
    const s = document.getElementById('faqSearch');
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  check('public: clearing the search restores 12',
    (await evaluate('document.querySelectorAll(".row__btn").length')) === 12);

  await evaluate('document.getElementById("askForm").dispatchEvent(new Event("submit", { cancelable: true }))');
  check('public: empty submit is refused with a message',
    (await evaluate('document.getElementById("askNote").hidden')) === false &&
    (await evaluate('document.getElementById("askNote").className')).includes('err'),
    await evaluate('document.getElementById("askNote").textContent'));

  await evaluate(`(() => {
    document.getElementById('visPrivate').click();
    const t = document.getElementById('askText');
    t.value = 'Test question about the shift premium';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('askForm').dispatchEvent(new Event('submit', { cancelable: true }));
  })()`);
  check('public: a real question is accepted',
    (await evaluate('document.getElementById("askNote").className')).includes('ok'),
    await evaluate('document.getElementById("askNote").textContent'));
  check('public: the counter resets after sending',
    (await evaluate('document.getElementById("askCount").textContent')) === '0 of 500');
  check('public: the waiting badge moves to 4',
    (await evaluate('document.getElementById("pendingCount").textContent')) === '4',
    await evaluate('document.getElementById("pendingCount").textContent'));
  check('public: the private choice is stored',
    (await evaluate(`JSON.parse(localStorage.getItem('dhl-payroll-faq.v1')).questions.filter(q => q.visibility === 'private').length`)) === 2);

  /* -------------------------------------------------------- keyboard shortcut */

  console.log('\n--- keyboard shortcut ---');

  const chip = await evaluate(`(() => {
    const c = document.querySelector('.search__hint');
    if (!c) { return null; }
    const s = document.getElementById('faqSearch');
    const r = c.getBoundingClientRect();
    const i = s.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(s).paddingRight);
    return {
      text: c.textContent.replace(/\\s+/g, ' ').trim(),
      visible: r.width > 0 && r.height > 0 && getComputedStyle(c).opacity === '1',
      inside: r.left >= i.left && r.right <= i.right + 1,
      clearsText: r.left >= i.right - pad - 1,
      width: Math.round(r.width),
      room: Math.round(pad)
    };
  })()`);
  check('shortcut: the hint chip reads "Press / to search" and sits clear of the text',
    !!chip && chip.text === 'Press / to search' && chip.visible && chip.inside && chip.clearsText,
    chip ? `chip ${chip.width}px in ${chip.room}px of room, clears=${chip.clearsText}` : 'chip missing');

  await evaluate(`(() => {
    const s = document.getElementById('faqSearch');
    s.value = 'overtime';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(260);
  const typedPad = await evaluate(`parseFloat(getComputedStyle(document.getElementById('faqSearch')).paddingRight)`);
  check('shortcut: typing releases the space the chip reserved',
    typedPad <= 24, `padding-right ${typedPad}px while a query is in the box`);

  await evaluate(`(() => {
    const s = document.getElementById('faqSearch');
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(260);
  check('shortcut: clearing the box brings the chip back',
    (await evaluate(`getComputedStyle(document.querySelector('.search__hint')).opacity`)) === '1',
    'chip opacity ' + await evaluate(`getComputedStyle(document.querySelector('.search__hint')).opacity`));

  await evaluate('document.activeElement && document.activeElement.blur()');
  await pressKey('/', 'Slash', 191, '/');
  check('shortcut: "/" moves focus into the search box',
    (await evaluate('document.activeElement && document.activeElement.id')) === 'faqSearch',
    'focus on ' + await evaluate('document.activeElement && document.activeElement.tagName'));

  await evaluate(`(() => {
    const t = document.getElementById('askText');
    t.value = '';
    t.focus();
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await pressKey('/', 'Slash', 191, '/');
  check('shortcut: "/" inside the textarea leaves focus where it is',
    (await evaluate('document.activeElement && document.activeElement.id')) === 'askText',
    'focus on ' + await evaluate('document.activeElement && document.activeElement.id'));
  check('shortcut: "/" inside the textarea still types a slash',
    (await evaluate('document.getElementById("askText").value')).indexOf('/') !== -1,
    'value "' + await evaluate('document.getElementById("askText").value') + '"');

  const narrowed = await evaluate(`(() => {
    const t = document.getElementById('askText');
    t.value = '';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.blur();
    const s = document.getElementById('faqSearch');
    s.focus();
    s.value = 'overtime';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return document.querySelectorAll('.row__btn').length;
  })()`);
  await pressKey('Escape', 'Escape', 27);
  check('shortcut: Escape clears the search and blurs the box',
    (await evaluate('document.getElementById("faqSearch").value')) === '' &&
    (await evaluate('document.activeElement && document.activeElement.id')) !== 'faqSearch',
    'value "' + await evaluate('document.getElementById("faqSearch").value') + '"');
  check('shortcut: Escape restores the full list',
    narrowed > 0 && narrowed < 12 &&
    (await evaluate('document.querySelectorAll(".row__btn").length')) === 12,
    `was ${narrowed}, now ` + await evaluate('document.querySelectorAll(".row__btn").length'));

  check('public: no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

  /* ------------------------------------------------------------- admin page */

  console.log('\n--- admin page ---');
  pageErrors.length = 0;
  await goto(adminUrl);
  await waitUntil('document.querySelectorAll(".qitem").length > 0');

  check('admin: the new question reached the queue',
    (await evaluate('document.querySelectorAll(".qitem").length')) === 4,
    'got ' + await evaluate('document.querySelectorAll(".qitem").length'));
  check('admin: sidebar count matches the queue',
    (await evaluate('document.getElementById("navPending").textContent')) === '4');
  check('admin: answered count is 1',
    (await evaluate('document.getElementById("navAnsweredCount").textContent')) === '1');
  check('admin: six sidebar entries (all plus four categories plus none)',
    (await evaluate('document.querySelectorAll("#navCats .a-nav__item").length')) === 5,
    'got ' + await evaluate('document.querySelectorAll("#navCats .a-nav__item").length'));

  await evaluate('document.querySelector(\'[data-action="answer"]\').click()');
  check('admin: the answer form opens',
    (await evaluate('!!document.querySelector(\'[data-answer]\')')) === true);

  await evaluate(`(() => {
    const id = document.querySelector('[data-answer]').getAttribute('data-answer');
    document.querySelector('[data-answer="' + id + '"]').value = 'Test answer written by the harness.';
    document.querySelector('[data-publish="' + id + '"]').checked = true;
    document.querySelector('[data-action="save-answer"]').click();
  })()`);
  check('admin: saving an answer clears it from the queue',
    (await evaluate('document.querySelectorAll(".qitem").length')) === 3,
    'got ' + await evaluate('document.querySelectorAll(".qitem").length'));
  check('admin: the answer was published to the FAQ',
    (await evaluate('document.getElementById("navCats").textContent')).includes('13'),
    await evaluate('document.querySelector("#navCats .a-nav__count").textContent'));
  check('admin: the answered count moved to 2',
    (await evaluate('document.getElementById("navAnsweredCount").textContent')) === '2');

  await evaluate('document.getElementById("navAnswered").click()');
  check('admin: the answered view lists 2',
    (await evaluate('document.querySelectorAll(".qitem").length')) === 2,
    'got ' + await evaluate('document.querySelectorAll(".qitem").length'));

  await evaluate('document.querySelector(\'#navCats [data-category=""]\').click()');
  const faqRows = await evaluate('document.querySelectorAll(".frow").length');
  check('admin: all answers lists 13', faqRows === 13, 'got ' + faqRows);

  await evaluate('document.querySelector(\'[data-action="toggle"]\').click()');
  check('admin: unpublishing marks the row hidden',
    (await evaluate('document.querySelector(".frow .badge--draft")')) !== null);

  await evaluate('document.querySelector(\'[data-action="toggle"]\').click()');
  check('admin: republishing marks it live again',
    (await evaluate('document.querySelector(".frow .badge--live")')) !== null);

  await evaluate('document.querySelector(\'[data-action="edit"]\').click()');
  check('admin: the edit form opens', (await evaluate('!!document.querySelector("[data-edit-q]")')) === true);

  await evaluate(`(() => {
    const id = document.querySelector('[data-edit-q]').getAttribute('data-edit-q');
    document.querySelector('[data-edit-q="' + id + '"]').value = 'Edited question from the harness?';
    document.querySelector('[data-action="save-edit"]').click();
  })()`);
  check('admin: the edit is saved',
    (await evaluate('document.querySelector(".frow__q").textContent')) === 'Edited question from the harness?',
    await evaluate('document.querySelector(".frow__q").textContent'));

  await evaluate(`(() => {
    window.confirm = () => true;
    document.querySelector('[data-action="ask-delete"]').click();
  })()`);
  check('admin: delete asks before acting',
    (await evaluate('!!document.querySelector(".frow__confirm")')) === true);

  await evaluate('document.querySelector(\'[data-action="confirm-delete"]\').click()');
  check('admin: confirming removes the answer',
    (await evaluate('document.querySelectorAll(".frow").length')) === 12,
    'got ' + await evaluate('document.querySelectorAll(".frow").length'));

  await evaluate('document.querySelector(\'[data-action="open-add"]\').click()');
  await evaluate(`(() => {
    document.getElementById('add-q').value = 'Added by the harness?';
    document.getElementById('add-a').value = 'A short answer added during the test run.';
    document.querySelector('[data-action="save-add"]').click();
  })()`);
  check('admin: adding an answer works',
    (await evaluate('document.querySelectorAll(".frow").length')) === 13,
    'got ' + await evaluate('document.querySelectorAll(".frow").length'));

  await evaluate('document.querySelector(\'[data-action="open-add"]\').click()');
  await evaluate('document.querySelector(\'[data-action="save-add"]\').click()');
  check('admin: an empty answer is refused',
    (await evaluate('document.getElementById("toast").textContent')).includes('required'),
    await evaluate('document.getElementById("toast").textContent'));
  check('admin: the refused answer was not added',
    (await evaluate('document.querySelectorAll(".frow").length')) === 13,
    'got ' + await evaluate('document.querySelectorAll(".frow").length'));
  await evaluate('document.querySelector(\'[data-action="close-add"]\').click()');

  await evaluate('document.querySelector(\'#navCats [data-category="Deductions and tax"]\').click()');
  const catRows = await evaluate('document.querySelectorAll(".frow").length');
  check('admin: category filter narrows the list', catRows === 3, 'got ' + catRows);

  await evaluate(`(() => {
    const s = document.getElementById('adminSearch');
    s.value = 'payslip';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  check('admin: searching from a category view resets to all answers',
    (await evaluate('document.getElementById("viewTitle").textContent')) === 'All answers',
    await evaluate('document.getElementById("viewTitle").textContent'));

  check('admin: no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

  /* --------------------------------------------------------- cross page check */

  console.log('\n--- public page after the admin edits ---');
  pageErrors.length = 0;
  await goto(publicUrl);
  await waitUntil('document.querySelectorAll(".row__btn").length > 0');
  check('round trip: public page reflects the admin changes',
    (await evaluate('document.getElementById("faqCount").textContent')) === '13 answers published',
    await evaluate('document.getElementById("faqCount").textContent'));
  check('round trip: the waiting badge is back to 3',
    (await evaluate('document.getElementById("pendingCount").textContent')) === '3',
    await evaluate('document.getElementById("pendingCount").textContent'));
  check('round trip: no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

  /* ------------------------------------------------------------- responsive */

  console.log('\n--- responsive ---');
  pageErrors.length = 0;

  async function setViewport(width, height) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 700
    });
    await sleep(220);
  }

  for (const width of [320, 390, 768, 1440]) {
    await setViewport(width, 900);
    await goto(publicUrl);
    await waitUntil('document.querySelectorAll(".row__btn").length > 0');
    const overflow = await evaluate('document.documentElement.scrollWidth - window.innerWidth');
    const viewport = await evaluate('window.innerWidth');
    check(`responsive: public page fits at ${width}px`,
      overflow <= 1 && viewport === width, `viewport ${viewport}, overflow ${overflow}px`);

    if (width === 320) {
      const chipFit = await evaluate(`(() => {
        const c = document.querySelector('.search__hint');
        const s = document.getElementById('faqSearch');
        if (!c || !s) { return { ok: false, chipLeft: 'n/a', textEdge: 'n/a' }; }
        const r = c.getBoundingClientRect();
        const i = s.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(s).paddingRight);
        return {
          ok: r.width > 0 && r.left >= i.right - pad - 1 && r.right <= i.right + 1,
          chipLeft: Math.round(r.left), textEdge: Math.round(i.right - pad)
        };
      })()`);
      check('responsive: the hint chip clears the placeholder at 320px',
        chipFit.ok === true, `chip starts at ${chipFit.chipLeft}, text area ends at ${chipFit.textEdge}`);

      const phFit = await evaluate(`(() => {
        const s = document.getElementById('faqSearch');
        const i = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const text = s.getAttribute('placeholder') || '';
        const width = ctx.measureText(text).width;
        const room = i.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { text: text, width: Math.round(width), room: Math.round(room), fits: width <= room };
      })()`);
      check('responsive: the 320px placeholder fits its room instead of being cut',
        phFit.fits === true, `"${phFit.text}" needs ${phFit.width}px of ${phFit.room}px`);
    }

    await goto(adminUrl);
    await waitUntil('document.querySelectorAll(".qitem").length > 0');
    const aOverflow = await evaluate('document.documentElement.scrollWidth - window.innerWidth');
    check(`responsive: admin page fits at ${width}px`, aOverflow <= 1, `overflow ${aOverflow}px`);
  }

  /* Screenshots are taken from a freshly seeded store, not from the state the
     tests left behind, so the images show what a first visitor actually sees. */
  async function freshPage(url, readyExpression) {
    await evaluate(`localStorage.removeItem('dhl-payroll-faq.v1')`).catch(() => {});
    await goto(url);
    await waitUntil(readyExpression);
  }

  await setViewport(390, 1400);
  await freshPage(publicUrl, 'document.querySelectorAll(".row__btn").length > 0');
  await evaluate('document.querySelectorAll(".row__btn")[0].click()');
  writeFileSync(join(SHOTS, 'public-mobile.png'),
    Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  await freshPage(adminUrl, 'document.querySelectorAll(".qitem").length > 0');
  await evaluate('document.querySelector(\'[data-action="answer"]\').click()');
  writeFileSync(join(SHOTS, 'admin-mobile.png'),
    Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  await setViewport(1280, 1500);
  await freshPage(publicUrl, 'document.querySelectorAll(".row__btn").length > 0');
  await evaluate('document.querySelectorAll(".row__btn")[0].click()');
  writeFileSync(join(SHOTS, 'public-desktop.png'),
    Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  await freshPage(adminUrl, 'document.querySelectorAll(".qitem").length > 0');
  writeFileSync(join(SHOTS, 'admin-desktop.png'),
    Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  check('responsive: no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

} catch (error) {
  check('harness ran to completion', false, error.message);
} finally {
  try { if (socket) { socket.close(); } } catch { /* ignore */ }
  try { if (edge) { edge.kill(); } } catch { /* ignore */ }
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) { console.log('  - ' + f.name); }
}
process.exit(failed.length ? 1 : 0);
