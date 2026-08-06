// Boots static/app.js against static/index.html in jsdom with fetch stubbed,
// so the module-level DOM wiring and the unload-flush path are exercised.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'static/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'static/app.js'), 'utf8');

const SUMMARY = {
  today: '2026-08-06', date: 'Thursday, August 6', week: 'Week 32',
  daily: { total: 0, completed: 0 }, weekly: { total: 0, completed: 0 }, monthly: { total: 0, completed: 0 },
  incompleteDailies: [], topStreaks: [], reminders: [], journalContent: '', mood: null,
};

function stubBody(url) {
  if (url.includes('/summary'))  return SUMMARY;
  if (url.includes('/settings')) return { pin: null, resetHour: 0, vacationDays: [], timezone: null };
  if (url.includes('/tree'))     return { folders: [], notes: [] };
  if (url.includes('/quote'))    return { quote: '' };
  if (url.includes('/mood'))     return {};
  return [];
}

// Boots the app and resolves once the overview has rendered.
async function boot({ failWrites = false } = {}) {
  const calls = [];
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;

  w.fetch = (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, keepalive: !!opts.keepalive, body: opts.body });
    if (failWrites && method !== 'GET') {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stubBody(url)) });
  };
  w.crypto = w.crypto || {};
  w.crypto.subtle = { digest: async () => new ArrayBuffer(32) };
  delete w.navigator.serviceWorker; // no SW registration under test
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));

  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.error || e.message));

  w.eval(appJs);
  await new Promise(r => setTimeout(r, 300));
  return { w, calls, errors };
}

const hide = (w) => {
  Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
};

test('app.js boots without errors and renders the overview', async () => {
  const { w, errors } = await boot();
  assert.deepStrictEqual(errors, []);
  assert.ok(w.document.getElementById('journal-ta'), 'journal textarea should be rendered');
});

test('hiding the page flushes journal keystrokes still inside the debounce window', async () => {
  const { w, calls } = await boot();
  const ta = w.document.getElementById('journal-ta');

  calls.length = 0;
  ta.value = 'unsaved keystrokes';
  ta.dispatchEvent(new w.Event('input'));
  hide(w); // well before the 800ms debounce would have fired

  const writes = calls.filter(c => c.url.includes('/api/journal/'));
  assert.strictEqual(writes.length, 1, 'the pending edit should have been saved');
  assert.strictEqual(writes[0].method, 'PUT');
  assert.strictEqual(JSON.parse(writes[0].body).content, 'unsaved keystrokes');
  assert.strictEqual(writes[0].keepalive, true, 'must outlive the page being torn down');
});

test('flushing with nothing pending does not write', async () => {
  const { w, calls } = await boot();
  calls.length = 0;
  hide(w);
  assert.deepStrictEqual(calls.filter(c => c.method !== 'GET'), []);
});

test('a rejected write surfaces a message instead of failing silently', async () => {
  const { w } = await boot({ failWrites: true });
  const ta = w.document.getElementById('journal-ta');

  ta.value = 'this save will be rejected';
  ta.dispatchEvent(new w.Event('blur'));
  await new Promise(r => setTimeout(r, 50));

  const toast = w.document.getElementById('save-toast');
  assert.ok(toast, 'a save-failure toast should exist');
  assert.match(toast.textContent, /Save failed/);
  assert.ok(toast.classList.contains('visible'));
});
