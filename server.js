const express = require('express');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'dailies.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // migrate: ensure group field exists on all tasks
    for (const t of data.tasks) {
      if (!('group' in t)) t.group = null;
    }
    return data;
  } catch {
    return { tasks: [], completions: [], reminders: [], _seq: { tasks: 0, reminders: 0 } };
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

function getPeriod(type) {
  return type === 'daily' ? getDailyPeriod() : getWeeklyPeriod();
}

function getDateOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return getDailyPeriod(d);
}

function getStreakForTask(taskId, completions) {
  const today = getDailyPeriod();
  const periods = new Set(
    completions.filter(c => c.task_id === taskId).map(c => c.period)
  );
  // Start from today if completed, otherwise yesterday (streak survives until tomorrow)
  const start = periods.has(today) ? today : getDateOffset(-1);
  if (!periods.has(start)) return 0;

  let streak = 0;
  const d = new Date(start + 'T12:00:00');
  while (true) {
    const str = getDailyPeriod(d);
    if (!periods.has(str)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

const VALID_GROUPS = new Set(['morning', 'afternoon', null]);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

// Tasks
app.get('/api/tasks', (req, res) => {
  const type = req.query.type;
  if (type !== 'daily' && type !== 'weekly') {
    return res.status(400).json({ error: 'type must be daily or weekly' });
  }
  const data = load();
  const period = getPeriod(type);
  const tasks = data.tasks
    .filter(t => t.type === type)
    .sort((a, b) => {
      const gOrder = { morning: 0, afternoon: 1, null: 2 };
      const ga = gOrder[a.group] ?? 2;
      const gb = gOrder[b.group] ?? 2;
      return ga - gb || a.position - b.position || a.id - b.id;
    })
    .map(t => {
      const c = data.completions.find(c => c.task_id === t.id && c.period === period);
      const streak = type === 'daily' ? getStreakForTask(t.id, data.completions) : null;
      return { ...t, completed: !!c, completed_at: c ? c.completed_at : null, streak };
    });
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { type, title, group = null } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
  if (type !== 'daily' && type !== 'weekly') return res.status(400).json({ error: 'type must be daily or weekly' });
  if (!VALID_GROUPS.has(group)) return res.status(400).json({ error: 'invalid group' });
  const data = load();
  const maxPos = data.tasks
    .filter(t => t.type === type && t.group === group)
    .reduce((m, t) => Math.max(m, t.position), -1);
  const task = { id: nextId(data, 'tasks'), type, title: title.trim(), group, position: maxPos + 1, created_at: now() };
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

// Summary (dashboard)
app.get('/api/summary', (req, res) => {
  const data = load();
  const dailyPeriod = getDailyPeriod();
  const weeklyPeriod = getWeeklyPeriod();

  const dailyTasks = data.tasks.filter(t => t.type === 'daily');
  const weeklyTasks = data.tasks.filter(t => t.type === 'weekly');

  const dailyCompletedIds = new Set(
    data.completions.filter(c => c.period === dailyPeriod).map(c => c.task_id)
  );
  const weeklyCompletedIds = new Set(
    data.completions.filter(c => c.period === weeklyPeriod).map(c => c.task_id)
  );

  const incompleteDailies = dailyTasks
    .filter(t => !dailyCompletedIds.has(t.id))
    .sort((a, b) => {
      const gOrder = { morning: 0, afternoon: 1, null: 2 };
      return (gOrder[a.group] ?? 2) - (gOrder[b.group] ?? 2) || a.position - b.position;
    })
    .map(t => ({ id: t.id, title: t.title, group: t.group, streak: getStreakForTask(t.id, data.completions) }));

  const topStreaks = dailyTasks
    .map(t => ({ id: t.id, title: t.title, streak: getStreakForTask(t.id, data.completions) }))
    .filter(t => t.streak > 1)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 5);

  const d = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const isoWeek = parseInt(weeklyPeriod.split('-W')[1], 10);

  res.json({
    date: `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`,
    week: `Week ${isoWeek}`,
    daily: { total: dailyTasks.length, completed: dailyCompletedIds.size },
    weekly: { total: weeklyTasks.length, completed: weeklyCompletedIds.size },
    incompleteDailies,
    topStreaks,
    reminders: [...data.reminders].sort((a, b) => a.position - b.position || a.id - b.id),
  });
});

// Reminders
app.get('/api/reminders', (req, res) => {
  const data = load();
  res.json([...data.reminders].sort((a, b) => a.position - b.position || a.id - b.id));
});

app.post('/api/reminders', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
  const data = load();
  const maxPos = data.reminders.reduce((m, r) => Math.max(m, r.position), -1);
  const reminder = { id: nextId(data, 'reminders'), content: content.trim(), position: maxPos + 1, created_at: now() };
  data.reminders.push(reminder);
  save(data);
  res.status(201).json({ id: reminder.id });
});

app.patch('/api/reminders/:id', (req, res) => {
  const id = Number(req.params.id);
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content required' });
  const data = load();
  const reminder = data.reminders.find(r => r.id === id);
  if (!reminder) return res.status(404).json({ error: 'not found' });
  reminder.content = content;
  save(data);
  res.json({ ok: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  const id = Number(req.params.id);
  const data = load();
  data.reminders = data.reminders.filter(r => r.id !== id);
  save(data);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dailies running on http://localhost:${PORT}`));
