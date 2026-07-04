const express = require('express');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'dailies.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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

function getDailyPeriod() {
  const d = new Date();
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
  const completionSet = new Set(
    data.completions
      .filter(c => c.period === period)
      .map(c => c.task_id)
  );
  const tasks = data.tasks
    .filter(t => t.type === type)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map(t => {
      const c = data.completions.find(c => c.task_id === t.id && c.period === period);
      return { ...t, completed: completionSet.has(t.id), completed_at: c ? c.completed_at : null };
    });
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { type, title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
  if (type !== 'daily' && type !== 'weekly') return res.status(400).json({ error: 'type must be daily or weekly' });
  const data = load();
  const maxPos = data.tasks
    .filter(t => t.type === type)
    .reduce((m, t) => Math.max(m, t.position), -1);
  const task = { id: nextId(data, 'tasks'), type, title: title.trim(), position: maxPos + 1, created_at: now() };
  data.tasks.push(task);
  save(data);
  res.status(201).json({ id: task.id });
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
  const data = load();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'not found' });
  task.title = title.trim();
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
  const exists = data.completions.find(c => c.task_id === id && c.period === period);
  if (!exists) data.completions.push({ task_id: id, period, completed_at: now() });
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
