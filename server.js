const express = require('express');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'dailies.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    for (const t of data.tasks) {
      if (!('group' in t))       t.group = null;
      if (!('paused' in t))      t.paused = false;
      if (!('streak_goal' in t)) t.streak_goal = null;
    }
    if (!data.journal) data.journal = [];
    return data;
  } catch {
    return { tasks: [], completions: [], reminders: [], journal: [], _seq: { tasks: 0, reminders: 0 } };
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

function getDailyPeriod(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function getPeriod(type) {
  if (type === 'daily')   return getDailyPeriod();
  if (type === 'weekly')  return getWeeklyPeriod();
  if (type === 'monthly') return getMonthlyPeriod();
}

function getDateOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return getDailyPeriod(d);
}

function getStreakForTask(taskId, completions) {
  const today = getDailyPeriod();
  const periods = new Set(completions.filter(c => c.task_id === taskId).map(c => c.period));
  const start = periods.has(today) ? today : getDateOffset(-1);
  if (!periods.has(start)) return 0;
  let streak = 0;
  const d = new Date(start + 'T12:00:00');
  while (periods.has(getDailyPeriod(d))) {
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
  const period = getPeriod(type);
  const tasks = data.tasks
    .filter(t => t.type === type)
    .sort((a, b) => {
      const go = { morning: 0, afternoon: 1, null: 2 };
      return (go[a.group] ?? 2) - (go[b.group] ?? 2) || a.position - b.position || a.id - b.id;
    })
    .map(t => {
      const c = data.completions.find(c => c.task_id === t.id && c.period === period);
      const streak = type === 'daily' && !t.paused ? getStreakForTask(t.id, data.completions) : null;
      return { ...t, completed: !!c, completed_at: c?.completed_at ?? null, streak };
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
  const task = {
    id: nextId(data, 'tasks'), type, title: title.trim(),
    group, position: maxPos + 1, paused: false,
    streak_goal: streak_goal ? Number(streak_goal) : null,
    created_at: now(),
  };
  data.tasks.push(task);
  save(data);
  res.status(201).json({ id: task.id });
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
  const period = getPeriod(task.type);
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
  const period = getPeriod(task.type);
  data.completions = data.completions.filter(c => !(c.task_id === id && c.period === period));
  save(data);
  res.json({ ok: true });
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
    currentStreak: t.paused ? null : getStreakForTask(t.id, data.completions),
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

// ── Journal ────────────────────────────────────────────────────────────────

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
  const dailyPeriod   = getDailyPeriod();
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
    .map(t => ({ id: t.id, title: t.title, group: t.group, streak: getStreakForTask(t.id, data.completions) }));

  const topStreaks = dailyTasks
    .filter(t => !t.paused)
    .map(t => ({ id: t.id, title: t.title, streak: getStreakForTask(t.id, data.completions), streak_goal: t.streak_goal }))
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
