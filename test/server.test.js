const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dailies-test-')), 'dailies.json');
process.env.DB_FILE = TMP_DB;

const {
  load, save, nextId, dateKey,
  getDailyPeriod, getWeeklyPeriod, getMonthlyPeriod,
  getStreakForTask, getBestStreak,
} = require('../server.js');

function reset() {
  for (const f of [TMP_DB, `${TMP_DB}.bak`, `${TMP_DB}.tmp`]) {
    try { fs.unlinkSync(f); } catch { /* not there */ }
  }
}

// Days back from today, as the YYYY-MM-DD keys the app stores.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

const completionsFor = (taskId, periods) => periods.map(period => ({ task_id: taskId, period }));

// ── Persistence ────────────────────────────────────────────────────────────

test('load() returns an empty database when the file does not exist', () => {
  reset();
  const data = load();
  assert.deepStrictEqual(data.tasks, []);
  assert.strictEqual(data.settings.resetHour, 0);
});

test('load() refuses to read a corrupt file instead of returning an empty database', () => {
  reset();
  save({ ...load(), tasks: [{ id: 1, title: 'Stretch', type: 'daily', created_at: '2026-01-01 00:00:00' }] });
  fs.writeFileSync(TMP_DB, '{"tasks":[{"id":1,'); // truncated, as a crashed write would leave it
  assert.throws(() => load(), /not valid JSON/);
});

test('save() keeps the previous copy at .bak', () => {
  reset();
  const first = load();
  first.tasks.push({ id: 1, title: 'Walk', type: 'daily', created_at: '2026-01-01 00:00:00' });
  save(first);

  const second = load();
  second.tasks.push({ id: 2, title: 'Read', type: 'daily', created_at: '2026-01-02 00:00:00' });
  save(second);

  const bak = JSON.parse(fs.readFileSync(`${TMP_DB}.bak`, 'utf8'));
  assert.strictEqual(bak.tasks.length, 1, 'bak should hold the state before the last save');
  assert.strictEqual(load().tasks.length, 2);
});

test('save() leaves no temp file behind', () => {
  reset();
  save(load());
  assert.strictEqual(fs.existsSync(`${TMP_DB}.tmp`), false);
});

test('nextId does not reissue an id already in use after a backup without _seq', () => {
  // A hand-edited or older backup can arrive with rows but no counter.
  const data = { tasks: [{ id: 1 }, { id: 2 }, { id: 7 }] };
  assert.strictEqual(nextId(data, 'tasks'), 8);
  assert.strictEqual(nextId(data, 'tasks'), 9);
});

test('nextId keeps counting from _seq when it is ahead of the rows', () => {
  // Deleting the highest-numbered row must not let its id be handed out again.
  const data = { tasks: [{ id: 1 }], _seq: { tasks: 5 } };
  assert.strictEqual(nextId(data, 'tasks'), 6);
});

// ── Periods ────────────────────────────────────────────────────────────────

test('getDailyPeriod honours resetHour', () => {
  const at1am = new Date(2026, 2, 15, 1, 30);
  assert.strictEqual(getDailyPeriod(at1am, 0), '2026-03-15');
  assert.strictEqual(getDailyPeriod(at1am, 4), '2026-03-14', 'before the 4am reset it is still the 14th');
  assert.strictEqual(getDailyPeriod(new Date(2026, 2, 15, 9, 0), 4), '2026-03-15');
});

test('getDailyPeriod resolves the day in the configured timezone', () => {
  // 2026-03-15T02:00Z is still the 14th in Los Angeles, already the 15th in Tokyo.
  const d = new Date('2026-03-15T02:00:00Z');
  assert.strictEqual(getDailyPeriod(d, 0, 'America/Los_Angeles'), '2026-03-14');
  assert.strictEqual(getDailyPeriod(d, 0, 'Asia/Tokyo'), '2026-03-15');
});

test('weekly and monthly periods are well formed', () => {
  assert.match(getWeeklyPeriod('UTC'), /^\d{4}-W\d{2}$/);
  assert.match(getMonthlyPeriod('UTC'), /^\d{4}-\d{2}$/);
});

// ── Streaks ────────────────────────────────────────────────────────────────

test('getStreakForTask counts consecutive days up to today', () => {
  const completions = completionsFor(1, [daysAgo(0), daysAgo(1), daysAgo(2)]);
  assert.strictEqual(getStreakForTask(1, completions), 3);
});

test('getStreakForTask survives a gap of one day if today is not done yet', () => {
  const completions = completionsFor(1, [daysAgo(1), daysAgo(2)]);
  assert.strictEqual(getStreakForTask(1, completions), 2);
});

test('getStreakForTask breaks on a missed day', () => {
  const completions = completionsFor(1, [daysAgo(0), daysAgo(1), daysAgo(3)]);
  assert.strictEqual(getStreakForTask(1, completions), 2);
});

test('vacation days bridge a gap in the current streak', () => {
  const completions = completionsFor(1, [daysAgo(0), daysAgo(1), daysAgo(3), daysAgo(4)]);
  assert.strictEqual(getStreakForTask(1, completions, 0, [daysAgo(2)]), 5);
});

test('best streak counts vacation days the same way the current streak does', () => {
  // Regression: getBestStreak used to ignore vacationDays, so this task showed
  // a current streak of 5 and a best streak of 2.
  const periods = [daysAgo(0), daysAgo(1), daysAgo(3), daysAgo(4)];
  const vacation = [daysAgo(2)];
  const completions = completionsFor(1, periods);
  const current = getStreakForTask(1, completions, 0, vacation);
  const best = getBestStreak(1, completions, vacation);
  assert.strictEqual(best, 5);
  assert.ok(best >= current, `best (${best}) must never be below current (${current})`);
});

test('best streak finds the longest historical run, not the latest', () => {
  const completions = completionsFor(1, [
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
    '2026-02-01', '2026-02-02',
  ]);
  assert.strictEqual(getBestStreak(1, completions), 4);
});

test('best streak is 0 with no completions and 1 with a single one', () => {
  assert.strictEqual(getBestStreak(1, []), 0);
  assert.strictEqual(getBestStreak(1, completionsFor(1, ['2026-01-01'])), 1);
});

test('a gap that vacation days do not fully cover still breaks the streak', () => {
  const completions = completionsFor(1, ['2026-01-01', '2026-01-05']);
  assert.strictEqual(getBestStreak(1, completions, ['2026-01-02']), 1);
});
