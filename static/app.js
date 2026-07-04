// API wrappers
const api = {
  getTasks: (type) => fetch(`/api/tasks?type=${type}`).then(r => r.json()),
  createTask: (type, title, group) => fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title, group: group || null })
  }).then(r => r.json()),
  deleteTask: (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => fetch(`/api/tasks/${id}/complete`, { method: 'POST' }),
  uncompleteTask: (id) => fetch(`/api/tasks/${id}/complete`, { method: 'DELETE' }),

  getSummary: () => fetch('/api/summary').then(r => r.json()),

  getReminders: () => fetch('/api/reminders').then(r => r.json()),
  createReminder: (content) => fetch('/api/reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  }).then(r => r.json()),
  updateReminder: (id, content) => fetch(`/api/reminders/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  }),
  deleteReminder: (id) => fetch(`/api/reminders/${id}`, { method: 'DELETE' }),
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function streakBadge(streak) {
  if (!streak || streak < 2) return '';
  return `<span class="streak-badge">🔥 ${streak}</span>`;
}

// ── Overview ──────────────────────────────────────

async function loadOverview() {
  const el = document.getElementById('overview-content');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  const s = await api.getSummary();

  const dailyPct = s.daily.total ? Math.round((s.daily.completed / s.daily.total) * 100) : 0;
  const weeklyPct = s.weekly.total ? Math.round((s.weekly.completed / s.weekly.total) * 100) : 0;

  const todoItems = s.incompleteDailies.map(t => `
    <li class="overview-todo-item">
      ${t.group ? `<span class="group-chip">${escHtml(t.group)}</span>` : ''}
      <span>${escHtml(t.title)}</span>
      ${streakBadge(t.streak)}
    </li>`).join('');

  const streakItems = s.topStreaks.map(t => `
    <li class="overview-streak-item">
      <span>${escHtml(t.title)}</span>
      ${streakBadge(t.streak)}
    </li>`).join('');

  const reminderItems = s.reminders.map(r =>
    `<div class="overview-reminder">${escHtml(r.content)}</div>`
  ).join('');

  el.innerHTML = `
    <div class="overview-header">
      <div class="overview-date">${escHtml(s.date)}</div>
      <div class="overview-week">${escHtml(s.week)}</div>
    </div>

    <div class="overview-section">
      <div class="overview-label">Progress</div>
      ${s.daily.total ? `
      <div class="progress-row">
        <span class="progress-name">Daily</span>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${dailyPct}%"></div></div>
        <span class="progress-count">${s.daily.completed}/${s.daily.total}</span>
      </div>` : ''}
      ${s.weekly.total ? `
      <div class="progress-row">
        <span class="progress-name">Weekly</span>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${weeklyPct}%"></div></div>
        <span class="progress-count">${s.weekly.completed}/${s.weekly.total}</span>
      </div>` : ''}
      ${!s.daily.total && !s.weekly.total ? '<p class="empty-state" style="padding:0.5rem 0">No tasks yet — add some in the Daily or Weekly tabs.</p>' : ''}
    </div>

    ${s.incompleteDailies.length ? `
    <div class="overview-section">
      <div class="overview-label">Still to do today</div>
      <ul class="overview-todo-list">${todoItems}</ul>
    </div>` : s.daily.total ? `
    <div class="overview-section">
      <div class="overview-label">Still to do today</div>
      <p class="empty-state" style="padding:0.5rem 0">All done for today!</p>
    </div>` : ''}

    ${s.topStreaks.length ? `
    <div class="overview-section">
      <div class="overview-label">Streaks</div>
      <ul class="overview-streak-list">${streakItems}</ul>
    </div>` : ''}

    ${s.reminders.length ? `
    <div class="overview-section">
      <div class="overview-label">Reminders</div>
      <div class="overview-reminders">${reminderItems}</div>
    </div>` : ''}
  `;
}

// ── Task lists ────────────────────────────────────

const GROUP_ORDER = ['morning', 'afternoon', null];
const GROUP_LABELS = { morning: 'Morning', afternoon: 'Afternoon', null: 'Anytime' };

function renderDailyTasks(tasks, container) {
  container.innerHTML = '';

  // Group tasks
  const groups = {};
  for (const t of tasks) {
    const key = t.group ?? 'null';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const usedGroups = GROUP_ORDER.filter(g => groups[g ?? 'null']?.length);
  const showHeaders = usedGroups.length > 1 || (usedGroups.length === 1 && usedGroups[0] !== null);

  if (!tasks.length) {
    container.innerHTML = '<p class="empty-state">No tasks yet — add one below.</p>';
    return;
  }

  for (const group of GROUP_ORDER) {
    const key = group ?? 'null';
    const list = groups[key];
    if (!list?.length) continue;

    if (showHeaders) {
      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = GROUP_LABELS[group ?? 'null'];
      container.appendChild(header);
    }

    const ul = document.createElement('ul');
    ul.className = 'task-list';
    for (const task of list) ul.appendChild(makeTaskItem(task));
    container.appendChild(ul);
  }
}

function renderWeeklyTasks(tasks, listEl) {
  listEl.innerHTML = '';
  if (!tasks.length) {
    listEl.innerHTML = '<li class="empty-state">No tasks yet — add one below.</li>';
    return;
  }
  for (const task of tasks) listEl.appendChild(makeTaskItem(task));
}

function makeTaskItem(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.completed ? ' done' : ''}`;
  li.dataset.id = task.id;
  li.innerHTML = `
    <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Complete ${escHtml(task.title)}">
    <span class="task-label">${escHtml(task.title)}</span>
    ${streakBadge(task.streak)}
    <button class="delete-btn" title="Delete">✕</button>
  `;
  return li;
}

// ── Reminders ─────────────────────────────────────

function renderReminders(reminders, listEl) {
  listEl.innerHTML = '';
  if (!reminders.length) {
    listEl.innerHTML = '<div class="empty-state">No reminders yet — add one below.</div>';
    return;
  }
  for (const r of reminders) {
    const card = document.createElement('div');
    card.className = 'reminder-card';
    card.dataset.id = r.id;
    const ta = document.createElement('textarea');
    ta.value = r.content;
    ta.rows = Math.max(1, r.content.split('\n').length);
    ta.setAttribute('aria-label', 'Reminder');
    ta.addEventListener('input', () => autoResize(ta));
    ta.addEventListener('blur', () => {
      if (ta.value !== r.content) {
        r.content = ta.value;
        api.updateReminder(r.id, ta.value);
      }
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    card.appendChild(ta);
    card.appendChild(delBtn);
    listEl.appendChild(card);
  }
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// ── Load functions ────────────────────────────────

async function loadDailyTasks() {
  const container = document.getElementById('daily-groups');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  const tasks = await api.getTasks('daily');
  renderDailyTasks(tasks, container);
}

async function loadWeeklyTasks() {
  const listEl = document.getElementById('weekly-list');
  listEl.innerHTML = '<li class="empty-state">Loading…</li>';
  const tasks = await api.getTasks('weekly');
  renderWeeklyTasks(tasks, listEl);
}

async function loadReminders() {
  const listEl = document.getElementById('reminder-list');
  listEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const reminders = await api.getReminders();
  renderReminders(reminders, listEl);
}

// ── Tab switching ─────────────────────────────────

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const loaded = new Set();

function switchTab(name) {
  tabs.forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  panels.forEach(p => { p.hidden = p.id !== name; });
  if (!loaded.has(name)) {
    loaded.add(name);
    if (name === 'overview') loadOverview();
    else if (name === 'daily') loadDailyTasks();
    else if (name === 'weekly') loadWeeklyTasks();
    else if (name === 'reminders') loadReminders();
  }
}

tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

// ── Event delegation ──────────────────────────────

document.getElementById('daily-groups').addEventListener('click', async (e) => {
  const li = e.target.closest('.task-item');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.matches('input[type="checkbox"]')) {
    const checked = e.target.checked;
    li.classList.toggle('done', checked);
    try {
      if (checked) await api.completeTask(id);
      else await api.uncompleteTask(id);
      // refresh overview if loaded so progress updates
      if (loaded.has('overview')) loadOverview();
    } catch {
      e.target.checked = !checked;
      li.classList.toggle('done', !checked);
    }
  } else if (e.target.matches('.delete-btn')) {
    li.remove();
    await api.deleteTask(id);
    if (loaded.has('overview')) loadOverview();
  }
});

document.getElementById('weekly-list').addEventListener('click', async (e) => {
  const li = e.target.closest('.task-item');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.matches('input[type="checkbox"]')) {
    const checked = e.target.checked;
    li.classList.toggle('done', checked);
    try {
      if (checked) await api.completeTask(id);
      else await api.uncompleteTask(id);
      if (loaded.has('overview')) loadOverview();
    } catch {
      e.target.checked = !checked;
      li.classList.toggle('done', !checked);
    }
  } else if (e.target.matches('.delete-btn')) {
    li.remove();
    await api.deleteTask(id);
    if (loaded.has('overview')) loadOverview();
  }
});

document.getElementById('reminder-list').addEventListener('click', async (e) => {
  if (!e.target.matches('.delete-btn')) return;
  const card = e.target.closest('.reminder-card');
  if (!card) return;
  card.remove();
  await api.deleteReminder(card.dataset.id);
  if (loaded.has('overview')) loadOverview();
});

// ── Add forms ─────────────────────────────────────

document.getElementById('daily-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('daily-input');
  const group = document.getElementById('daily-group-select').value || null;
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  await api.createTask('daily', title, group);
  loadDailyTasks();
  if (loaded.has('overview')) loadOverview();
});

document.getElementById('weekly-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('weekly-input');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  await api.createTask('weekly', title, null);
  loadWeeklyTasks();
  if (loaded.has('overview')) loadOverview();
});

document.getElementById('reminder-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('reminder-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  await api.createReminder(content);
  loadReminders();
  if (loaded.has('overview')) loadOverview();
});

// ── Boot ──────────────────────────────────────────
switchTab('overview');
