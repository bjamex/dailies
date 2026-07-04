const express = require('express');
const fs = require('fs');
const path = require('path');

const DB_FILE    = process.env.DB_FILE    || path.join(__dirname, 'dailies.json');
const QUOTES_FILE = path.join(__dirname, 'quotes.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    for (const t of data.tasks) {
      if (!('group' in t))        t.group = null;
      if (!('paused' in t))       t.paused = false;
      if (!('streak_goal' in t))  t.streak_goal = null;
      if (!('notes' in t))        t.notes = '';
      if (!('kind' in t))         t.kind = 'check';
      if (!('target' in t))       t.target = null;
      if (!('notify_time' in t))  t.notify_time = null;
    }
    if (!data.journal)  data.journal = [];
    if (!data.settings) data.settings = {};
    if (!('resetHour'    in data.settings)) data.settings.resetHour    = 0;
    if (!('vacationDays' in data.settings)) data.settings.vacationDays = [];
    if (!('pin'          in data.settings)) data.settings.pin          = null;
    return data;
  } catch {
    return { tasks: [], completions: [], reminders: [], journal: [], settings: { resetHour: 0, vacationDays: [], pin: null }, _seq: { tasks: 0, reminders: 0 } };
  }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(data, table) {
  if (!data._seq) data._seq = { tasks: 0, reminders: 0 };
  data._seq[table] = (data._seq[table] || 0) + 1;
  return data._seq[table];
}

function now() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function getDailyPeriod(d = new Date(), resetHour = 0) {
  // If current hour is before resetHour, treat it as the previous calendar day
  const shifted = new Date(d);
  if (resetHour > 0 && shifted.getHours() < resetHour) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

function getWeeklyPeriod() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getMonthlyPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriod(type, resetHour = 0) {
  if (type === 'daily')   return getDailyPeriod(new Date(), resetHour);
  if (type === 'weekly')  return getWeeklyPeriod();
  if (type === 'monthly') return getMonthlyPeriod();
}

function getDateOffset(n, resetHour = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return getDailyPeriod(d, resetHour);
}

function getStreakForTask(taskId, completions, resetHour = 0, vacationDays = []) {
  const vacSet = new Set(vacationDays);
  const today = getDailyPeriod(new Date(), resetHour);
  const periods = new Set(completions.filter(c => c.task_id === taskId).map(c => c.period));
  const isDone = (p) => periods.has(p) || vacSet.has(p);
  const start = isDone(today) ? today : getDateOffset(-1, resetHour);
  if (!isDone(start)) return 0;
  let streak = 0;
  const d = new Date(start + 'T12:00:00');
  while (isDone(getDailyPeriod(d, 0))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getBestStreak(taskId, completions) {
  const periods = [...new Set(completions.filter(c => c.task_id === taskId).map(c => c.period))].sort();
  if (!periods.length) return 0;
  let best = 1, current = 1;
  for (let i = 1; i < periods.length; i++) {
    const diff = Math.round(
      (new Date(periods[i] + 'T12:00:00') - new Date(periods[i - 1] + 'T12:00:00')) / 86400000
    );
    if (diff === 1) { current++; best = Math.max(best, current); }
    else current = 1;
  }
  return best;
}

function getCompletionRate(taskId, completions, createdAt, days = 90) {
  const periods = new Set(completions.filter(c => c.task_id === taskId).map(c => c.period));
  const created = new Date(createdAt.replace(' ', 'T'));
  let total = 0, completed = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (d < created) break;
    total++;
    if (periods.has(getDailyPeriod(d))) completed++;
  }
  return total ? Math.round((completed / total) * 100) : 0;
}

const VALID_TYPES  = new Set(['daily', 'weekly', 'monthly']);
const VALID_GROUPS = new Set(['morning', 'afternoon', null]);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

// ── Tasks ──────────────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  const { type } = req.query;
  if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'invalid type' });
  const data = load();
  const rh = data.settings.resetHour || 0;
  const period = getPeriod(type, rh);
  const tasks = data.tasks
    .filter(t => t.type === type)
    .sort((a, b) => {
      const go = { morning: 0, afternoon: 1, null: 2 };
      return (go[a.group] ?? 2) - (go[b.group] ?? 2) || a.position - b.position || a.id - b.id;
    })
    .map(t => {
      const c = data.completions.find(c => c.task_id === t.id && c.period === period);
      const streak = type === 'daily' && !t.paused ? getStreakForTask(t.id, data.completions, rh, data.settings.vacationDays) : null;
      const value = t.kind === 'count' ? (c?.value ?? 0) : null;
      const completed = t.kind === 'count' ? (t.target ? (value >= t.target) : value > 0) : !!c;
      return { ...t, completed, completed_at: c?.completed_at ?? null, streak, value };
    });
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { type, title, group = null, streak_goal = null } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'invalid type' });
  if (!VALID_GROUPS.has(group)) return res.status(400).json({ error: 'invalid group' });
  const data = load();
  const maxPos = data.tasks
    .filter(t => t.type === type && t.group === group)
    .reduce((m, t) => Math.max(m, t.position), -1);
  const { kind = 'check', target = null } = req.body;
  if (!['check', 'count'].includes(kind)) return res.status(400).json({ error: 'invalid kind' });
  const task = {
    id: nextId(data, 'tasks'), type, title: title.trim(),
    group, position: maxPos + 1, paused: false,
    streak_goal: streak_goal ? Number(streak_goal) : null,
    notes: '', kind, target: target ? Number(target) : null,
    notify_time: null,
    created_at: now(),
  };
  data.tasks.push(task);
  save(data);
  res.status(201).json({ id: task.id });
});

app.patch('/api/tasks/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const data = load();
  for (const { id, position } of order) {
    const task = data.tasks.find(t => t.id === Number(id));
    if (task) task.position = position;
  }
  save(data);
  res.json({ ok: true });
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (req.body.title !== undefined) {
    if (!req.body.title.trim()) return res.status(400).json({ error: 'title required' });
    task.title = req.body.title.trim();
  }
  if (req.body.group !== undefined) {
    if (!VALID_GROUPS.has(req.body.group)) return res.status(400).json({ error: 'invalid group' });
    task.group = req.body.group;
  }
  if (req.body.paused !== undefined) task.paused = !!req.body.paused;
  if (req.body.streak_goal !== undefined) {
    task.streak_goal = req.body.streak_goal ? Number(req.body.streak_goal) : null;
  }
  if (req.body.notes !== undefined)       task.notes = String(req.body.notes);
  if (req.body.target !== undefined)      task.target = req.body.target ? Number(req.body.target) : null;
  if (req.body.notify_time !== undefined) task.notify_time = req.body.notify_time || null;
  save(data);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const data = load();
  data.tasks = data.tasks.filter(t => t.id !== id);
  data.completions = data.completions.filter(c => c.task_id !== id);
  save(data);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const period = getPeriod(task.type, data.settings.resetHour || 0);
  if (!data.completions.find(c => c.task_id === id && c.period === period)) {
    data.completions.push({ task_id: id, period, completed_at: now() });
  }
  save(data);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const period = getPeriod(task.type, data.settings.resetHour || 0);
  data.completions = data.completions.filter(c => !(c.task_id === id && c.period === period));
  save(data);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/log', (req, res) => {
  const id = Number(req.params.id);
  const value = Number(req.body.value ?? 0);
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'invalid value' });
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task || task.kind !== 'count') return res.status(404).json({ error: 'not found' });
  const period = getPeriod(task.type, data.settings.resetHour || 0);
  const idx = data.completions.findIndex(c => c.task_id === id && c.period === period);
  if (value === 0) {
    if (idx >= 0) data.completions.splice(idx, 1);
  } else {
    const entry = { task_id: id, period, value, completed_at: now() };
    if (idx >= 0) data.completions[idx] = entry;
    else data.completions.push(entry);
  }
  save(data);
  res.json({ ok: true, value });
});

// ── Task history (for calendar heatmap) ───────────────────────────────────

app.get('/api/tasks/:id/history', (req, res) => {
  const id = Number(req.params.id);
  const days = Math.min(Number(req.query.days) || 91, 365);
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const periods = new Set(data.completions.filter(c => c.task_id === id).map(c => c.period));
  const history = [];
  for (let i = days - 1; i >= 0; i--) {
    const period = getDateOffset(-i);
    history.push({ period, completed: periods.has(period) });
  }
  res.json({ task: { id: task.id, title: task.title }, history });
});

// ── Statistics ─────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const data = load();
  const rh = data.settings.resetHour || 0;
  const days = 90;
  const dailyTasks = data.tasks.filter(t => t.type === 'daily');

  // Build lookup: "taskId:period" for fast hit check
  const hitSet = new Set(data.completions.map(c => `${c.task_id}:${c.period}`));

  // Day-of-week completion rates across all active daily tasks
  const dow = Array.from({ length: 7 }, () => ({ total: 0, completed: 0 }));
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const period = getDailyPeriod(d);
    const dayIdx = d.getDay();
    for (const task of dailyTasks) {
      if (new Date(task.created_at.replace(' ', 'T')) > d) continue;
      dow[dayIdx].total++;
      if (hitSet.has(`${task.id}:${period}`)) dow[dayIdx].completed++;
    }
  }

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const taskStats = dailyTasks.map(t => ({
    id: t.id,
    title: t.title,
    paused: t.paused,
    streak_goal: t.streak_goal,
    currentStreak: t.paused ? null : getStreakForTask(t.id, data.completions, rh, data.settings.vacationDays),
    bestStreak: getBestStreak(t.id, data.completions),
    rate: getCompletionRate(t.id, data.completions, t.created_at, days),
  })).sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0));

  res.json({
    days,
    dayOfWeek: DAY_NAMES.map((name, i) => ({
      name,
      rate: dow[i].total ? Math.round((dow[i].completed / dow[i].total) * 100) : null,
    })),
    tasks: taskStats,
  });
});

// ── Quote of the day ───────────────────────────────────────────────────────

app.get('/api/quote', (req, res) => {
  let quotes;
  try { quotes = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8')); }
  catch { return res.json({ quote: '' }); }
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  res.json({ quote: quotes[dayOfYear % quotes.length] });
});

// ── Settings ───────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  const data = load();
  res.json(data.settings);
});

app.patch('/api/settings', (req, res) => {
  const data = load();
  if (req.body.resetHour !== undefined) {
    const h = Number(req.body.resetHour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return res.status(400).json({ error: 'resetHour must be 0–23' });
    data.settings.resetHour = h;
  }
  if (req.body.vacationDays !== undefined) {
    if (!Array.isArray(req.body.vacationDays)) return res.status(400).json({ error: 'array required' });
    data.settings.vacationDays = req.body.vacationDays.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  }
  if (req.body.pin !== undefined) {
    data.settings.pin = req.body.pin || null;
  }
  save(data);
  res.json({ ok: true });
});

// ── Journal ────────────────────────────────────────────────────────────────

app.get('/api/journal', (req, res) => {
  const data = load();
  const entries = [...data.journal]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ date, updated_at }) => ({ date, updated_at }));
  res.json(entries);
});

app.get('/api/journal/:date', (req, res) => {
  const data = load();
  const entry = data.journal.find(j => j.date === req.params.date);
  res.json(entry ?? { date: req.params.date, content: '' });
});

app.put('/api/journal/:date', (req, res) => {
  const { content = '' } = req.body;
  const data = load();
  const idx = data.journal.findIndex(j => j.date === req.params.date);
  const entry = { date: req.params.date, content, updated_at: now() };
  if (idx >= 0) data.journal[idx] = entry;
  else data.journal.push(entry);
  // keep only last 365 entries
  data.journal.sort((a, b) => b.date.localeCompare(a.date));
  if (data.journal.length > 365) data.journal = data.journal.slice(0, 365);
  save(data);
  res.json({ ok: true });
});

// ── Summary ────────────────────────────────────────────────────────────────

app.get('/api/summary', (req, res) => {
  const data = load();
  const rh = data.settings.resetHour || 0;
  const dailyPeriod   = getDailyPeriod(new Date(), rh);
  const weeklyPeriod  = getWeeklyPeriod();
  const monthlyPeriod = getMonthlyPeriod();

  const byType = (type) => data.tasks.filter(t => t.type === type);
  const completedIds = (period) => new Set(
    data.completions.filter(c => c.period === period).map(c => c.task_id)
  );

  const dailyTasks    = byType('daily');
  const weeklyTasks   = byType('weekly');
  const monthlyTasks  = byType('monthly');
  const dailyDone     = completedIds(dailyPeriod);
  const weeklyDone    = completedIds(weeklyPeriod);
  const monthlyDone   = completedIds(monthlyPeriod);

  // Active (non-paused) dailies only for progress
  const activeDailies = dailyTasks.filter(t => !t.paused);

  const incompleteDailies = activeDailies
    .filter(t => !dailyDone.has(t.id))
    .sort((a, b) => {
      const go = { morning: 0, afternoon: 1, null: 2 };
      return (go[a.group] ?? 2) - (go[b.group] ?? 2) || a.position - b.position;
    })
    .map(t => ({ id: t.id, title: t.title, group: t.group, streak: getStreakForTask(t.id, data.completions, rh, data.settings.vacationDays) }));

  const topStreaks = dailyTasks
    .filter(t => !t.paused)
    .map(t => ({ id: t.id, title: t.title, streak: getStreakForTask(t.id, data.completions, rh, data.settings.vacationDays), streak_goal: t.streak_goal }))
    .filter(t => t.streak > 1)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 5);

  const d = new Date();
  const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const isoWeek = parseInt(getWeeklyPeriod().split('-W')[1], 10);

  const todayEntry = data.journal.find(j => j.date === dailyPeriod);


  res.json({
    date: `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
    week: `Week ${isoWeek}`,
    today: dailyPeriod,
    daily:   { total: activeDailies.length,  completed: [...dailyDone].filter(id => activeDailies.find(t => t.id === id)).length },
    weekly:  { total: weeklyTasks.length,  completed: weeklyDone.size },
    monthly: { total: monthlyTasks.length, completed: monthlyDone.size },
    incompleteDailies,
    topStreaks,
    reminders: [...data.reminders].sort((a, b) => a.position - b.position || a.id - b.id),
    journalContent: todayEntry?.content ?? '',
  });
});

// ── Export CSV ─────────────────────────────────────────────────────────────

app.get('/api/export.csv', (req, res) => {
  const data = load();
  const rows = ['task_id,task_title,task_type,period,completed_at'];
  for (const c of [...data.completions].sort((a, b) => a.period.localeCompare(b.period))) {
    const task = data.tasks.find(t => t.id === c.task_id);
    const title = task ? `"${task.title.replace(/"/g, '""')}"` : `"(deleted)"`;
    const type  = task?.type ?? '';
    rows.push(`${c.task_id},${title},${type},${c.period},${c.completed_at}`);
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="dailies-export.csv"');
  res.send(rows.join('\n'));
});

// ── Backup / Restore ───────────────────────────────────────────────────────

app.get('/api/backup', (req, res) => {
  const data = load();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="dailies-backup.json"');
  res.send(JSON.stringify(data, null, 2));
});

app.post('/api/restore', express.json({ limit: '50mb' }), (req, res) => {
  const data = req.body;
  if (!Array.isArray(data?.tasks) || !Array.isArray(data?.completions)) {
    return res.status(400).json({ error: 'invalid backup file' });
  }
  save(data);
  res.json({ ok: true });
});

// ── Import CSV ─────────────────────────────────────────────────────────────

app.post('/api/import.csv', express.text({ type: 'text/csv', limit: '10mb' }), (req, res) => {
  const lines = req.body.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length || !lines[0].startsWith('task_id')) {
    return res.status(400).json({ error: 'invalid CSV — missing header row' });
  }
  const data = load();
  const existingPeriods = new Set(data.completions.map(c => `${c.task_id}:${c.period}`));
  let imported = 0;
  for (const line of lines.slice(1)) {
    // task_id,"title",task_type,period,completed_at
    const m = line.match(/^(\d+),"?(.*?)"?,(\w+),([\w-]+),(.*?)$/);
    if (!m) continue;
    const [, rawId, , , period, completed_at] = m;
    const task_id = Number(rawId);
    if (!data.tasks.find(t => t.id === task_id)) continue;
    const key = `${task_id}:${period}`;
    if (existingPeriods.has(key)) continue;
    data.completions.push({ task_id, period, completed_at: completed_at.trim() || now() });
    existingPeriods.add(key);
    imported++;
  }
  save(data);
  res.json({ ok: true, imported });
});

// ── Reminders ──────────────────────────────────────────────────────────────

app.get('/api/reminders', (req, res) => {
  const data = load();
  res.json([...data.reminders].sort((a, b) => a.position - b.position || a.id - b.id));
});

app.post('/api/reminders', (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const data = load();
  const maxPos = data.reminders.reduce((m, r) => Math.max(m, r.position), -1);
  const reminder = { id: nextId(data, 'reminders'), content: content.trim(), position: maxPos + 1, created_at: now() };
  data.reminders.push(reminder);
  save(data);
  res.status(201).json({ id: reminder.id });
});

app.patch('/api/reminders/:id', (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content required' });
  const data = load();
  const reminder = data.reminders.find(r => r.id === Number(req.params.id));
  if (!reminder) return res.status(404).json({ error: 'not found' });
  reminder.content = content;
  save(data);
  res.json({ ok: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  const data = load();
  data.reminders = data.reminders.filter(r => r.id !== Number(req.params.id));
  save(data);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dailies running on http://localhost:${PORT}`));
