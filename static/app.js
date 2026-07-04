// ── API ───────────────────────────────────────────────────────────────────

const api = {
  getTasks:       (type) => fetch(`/api/tasks?type=${type}`).then(r => r.json()),
  createTask:     (type, title, group) => fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title, group: group || null }),
  }).then(r => r.json()),
  updateTask:     (id, patch) => fetch(`/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }),
  deleteTask:     (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }),
  completeTask:   (id) => fetch(`/api/tasks/${id}/complete`, { method: 'POST' }),
  uncompleteTask: (id) => fetch(`/api/tasks/${id}/complete`, { method: 'DELETE' }),
  getHistory:     (id, days = 91) => fetch(`/api/tasks/${id}/history?days=${days}`).then(r => r.json()),

  getSummary:  () => fetch('/api/summary').then(r => r.json()),
  getStats:    () => fetch('/api/stats').then(r => r.json()),

  getJournal:  (date) => fetch(`/api/journal/${date}`).then(r => r.json()),
  saveJournal: (date, content) => fetch(`/api/journal/${date}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }),

  getReminders:    () => fetch('/api/reminders').then(r => r.json()),
  createReminder:  (content) => fetch('/api/reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }).then(r => r.json()),
  updateReminder:  (id, content) => fetch(`/api/reminders/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }),
  deleteReminder:  (id) => fetch(`/api/reminders/${id}`, { method: 'DELETE' }),
};

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function streakBadge(streak, goal) {
  if (!streak || streak < 2) return '';
  const met = goal && streak >= goal;
  const cls = met ? ' goal-met' : '';
  const icon = met ? '🎯' : '🔥';
  const label = goal ? `${streak}/${goal}` : streak;
  return `<span class="streak-badge${cls}">${icon} ${label}</span>`;
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

const GROUP_ORDER  = ['morning', 'afternoon', null];
const GROUP_LABELS = { morning: 'Morning', afternoon: 'Afternoon', null: 'Anytime' };

// ── Overview ──────────────────────────────────────────────────────────────

async function loadOverview() {
  const el = document.getElementById('overview-content');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  const s = await api.getSummary();

  const pct = (done, total) => total ? Math.round((done / total) * 100) : 0;

  const progressRows = [
    s.daily.total   ? `<div class="progress-row">
      <span class="progress-name">Daily</span>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct(s.daily.completed,s.daily.total)}%"></div></div>
      <span class="progress-count">${s.daily.completed}/${s.daily.total}</span></div>` : '',
    s.weekly.total  ? `<div class="progress-row">
      <span class="progress-name">Weekly</span>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct(s.weekly.completed,s.weekly.total)}%"></div></div>
      <span class="progress-count">${s.weekly.completed}/${s.weekly.total}</span></div>` : '',
    s.monthly.total ? `<div class="progress-row">
      <span class="progress-name">Monthly</span>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct(s.monthly.completed,s.monthly.total)}%"></div></div>
      <span class="progress-count">${s.monthly.completed}/${s.monthly.total}</span></div>` : '',
  ].join('');

  const todoHtml = s.incompleteDailies.length
    ? `<ul class="overview-todo-list" id="overview-todo">${s.incompleteDailies.map(t => `
        <li class="overview-todo-item" data-id="${t.id}">
          <input type="checkbox" aria-label="Complete ${esc(t.title)}">
          ${t.group ? `<span class="group-chip">${esc(t.group)}</span>` : ''}
          <span class="todo-title">${esc(t.title)}</span>
          ${streakBadge(t.streak)}
        </li>`).join('')}</ul>`
    : (s.daily.total ? '<p class="empty-state" style="padding:.4rem 0">All done for today! 🎉</p>' : '');

  const streakHtml = s.topStreaks.length
    ? `<ul class="overview-streak-list">${s.topStreaks.map(t => {
        const goalBar = t.streak_goal
          ? `<div class="streak-goal-bar"><div class="streak-goal-fill" style="width:${Math.min(100, Math.round(t.streak / t.streak_goal * 100))}%"></div></div>`
          : '';
        return `<li class="overview-streak-item">
          <span>${esc(t.title)}</span>
          ${goalBar}
          ${streakBadge(t.streak, t.streak_goal)}
        </li>`;
      }).join('')}</ul>` : '';

  const remindersHtml = s.reminders.length
    ? s.reminders.map(r => `<div class="overview-reminder">${esc(r.content)}</div>`).join('') : '';

  el.innerHTML = `
    <div class="overview-header">
      <div class="overview-date">${esc(s.date)}</div>
      <div class="overview-week">${esc(s.week)}</div>
    </div>

    ${progressRows ? `<div class="overview-section"><div class="overview-label">Progress</div>${progressRows}</div>` : ''}

    <div class="overview-section">
      <div class="overview-label">Today's note</div>
      <textarea class="journal-textarea" id="journal-ta" placeholder="Write anything about today…" rows="3">${esc(s.journalContent)}</textarea>
      <div class="journal-save-hint">Saves automatically</div>
    </div>

    ${todoHtml ? `<div class="overview-section"><div class="overview-label">Still to do today</div>${todoHtml}</div>` : ''}

    ${streakHtml ? `<div class="overview-section"><div class="overview-label">Streaks</div>${streakHtml}</div>` : ''}

    ${remindersHtml ? `<div class="overview-section"><div class="overview-label">Reminders</div><div class="overview-reminders">${remindersHtml}</div></div>` : ''}
  `;

  // Journal auto-save
  const ta = document.getElementById('journal-ta');
  if (ta) {
    autoResize(ta);
    ta.addEventListener('input', () => autoResize(ta));
    let journalTimer;
    ta.addEventListener('input', () => {
      clearTimeout(journalTimer);
      journalTimer = setTimeout(() => api.saveJournal(s.today, ta.value), 800);
    });
    ta.addEventListener('blur', () => {
      clearTimeout(journalTimer);
      api.saveJournal(s.today, ta.value);
    });
  }

  // Checkable todo items
  document.getElementById('overview-todo')?.addEventListener('click', async (e) => {
    const li = e.target.closest('.overview-todo-item');
    if (!li) return;
    const cb = li.querySelector('input[type="checkbox"]');
    if (!cb) return;
    const id = li.dataset.id;
    cb.checked = true;
    li.classList.add('done');
    await api.completeTask(id);
    // brief delay so the user sees the checkmark, then refresh
    setTimeout(() => loadOverview(), 500);
  });
}

// ── Task lists ────────────────────────────────────────────────────────────

function makeTaskItem(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.completed ? ' done' : ''}${task.paused ? ' paused' : ''}`;
  li.dataset.id = task.id;
  li.tabIndex = -1;
  li.innerHTML = `
    <input type="checkbox" ${task.completed ? 'checked' : ''} ${task.paused ? 'disabled' : ''} aria-label="${esc(task.title)}">
    <span class="task-label">${esc(task.title)}</span>
    ${task.streak ? streakBadge(task.streak, task.streak_goal) : ''}
    <button class="pause-btn" title="${task.paused ? 'Resume' : 'Pause'}" data-action="pause">${task.paused ? '▶' : '⏸'}</button>
    <button class="delete-btn" title="Delete" data-action="delete">✕</button>
  `;
  return li;
}

function renderGroupedTasks(tasks, container) {
  container.innerHTML = '';
  if (!tasks.length) {
    container.innerHTML = '<p class="empty-state">No tasks yet — add one below.</p>';
    return;
  }
  const groups = {};
  for (const t of tasks) {
    const k = t.group ?? 'null';
    (groups[k] = groups[k] || []).push(t);
  }
  const usedGroups = GROUP_ORDER.filter(g => groups[g ?? 'null']?.length);
  const showHeaders = usedGroups.some(g => g !== null) && usedGroups.length > 0;

  for (const g of GROUP_ORDER) {
    const list = groups[g ?? 'null'];
    if (!list?.length) continue;
    if (showHeaders) {
      const h = document.createElement('div');
      h.className = 'group-header';
      h.textContent = GROUP_LABELS[g ?? 'null'];
      container.appendChild(h);
    }
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    list.forEach(t => ul.appendChild(makeTaskItem(t)));
    container.appendChild(ul);
  }
}

function renderFlatTasks(tasks, listEl) {
  listEl.innerHTML = '';
  if (!tasks.length) {
    listEl.innerHTML = '<li class="empty-state">No tasks yet — add one below.</li>';
    return;
  }
  tasks.forEach(t => listEl.appendChild(makeTaskItem(t)));
}

async function loadTasks(type) {
  const tasks = await api.getTasks(type);
  if (type === 'daily') {
    renderGroupedTasks(tasks, document.getElementById('daily-groups'));
  } else {
    renderFlatTasks(tasks, document.getElementById(`${type}-list`));
  }
}

// ── Reminders ─────────────────────────────────────────────────────────────

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
      if (ta.value !== r.content) { r.content = ta.value; api.updateReminder(r.id, ta.value); }
    });
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.title = 'Delete';
    del.textContent = '✕';
    card.appendChild(ta);
    card.appendChild(del);
    listEl.appendChild(card);
  }
}

async function loadReminders() {
  const reminders = await api.getReminders();
  renderReminders(reminders, document.getElementById('reminder-list'));
}

// ── Stats ─────────────────────────────────────────────────────────────────

function buildHeatmap(history) {
  // history: array of {period, completed} oldest→newest, 91 items (13 weeks)
  const today = history[history.length - 1]?.period;
  const weeks = [];
  for (let i = 0; i < history.length; i += 7) {
    weeks.push(history.slice(i, i + 7));
  }

  const DAY_ABBRS = ['S','M','T','W','T','F','S'];
  const dayLabels = DAY_ABBRS.map(d => `<div class="heatmap-day-label">${d}</div>`).join('');

  const cols = weeks.map(week => {
    const cells = week.map(day => {
      const cls = day.completed ? ' done' : '';
      const tod = day.period === today ? ' today' : '';
      return `<div class="heatmap-cell${cls}${tod}" title="${day.period}"></div>`;
    }).join('');
    return `<div class="heatmap-col">${cells}</div>`;
  }).join('');

  return `
    <div class="heatmap-wrap">
      <div class="heatmap">${cols}</div>
      <div class="heatmap-legend">
        <div class="heatmap-legend-cell" style="background:var(--surface-2)"></div> Not done
        <div class="heatmap-legend-cell" style="background:var(--accent);opacity:.85"></div> Completed
      </div>
    </div>`;
}

async function loadStats() {
  const el = document.getElementById('stats-content');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  const s = await api.getStats();

  const maxRate = Math.max(...s.dayOfWeek.filter(d => d.rate !== null).map(d => d.rate), 1);
  const dowBars = s.dayOfWeek.map(d => `
    <div class="dow-col">
      <div class="dow-pct">${d.rate !== null ? d.rate + '%' : '—'}</div>
      <div class="dow-bar-wrap">
        <div class="dow-bar-fill" style="height:${d.rate !== null ? Math.round((d.rate / maxRate) * 100) : 0}%"></div>
      </div>
      <div class="dow-day">${d.name}</div>
    </div>`).join('');

  const habitRows = s.tasks.map(t => `
    <div class="habit-row" data-id="${t.id}">
      <div class="habit-row-header">
        <span class="habit-title">${esc(t.title)}${t.paused ? ' <span style="color:var(--text-muted);font-size:.75em">(paused)</span>' : ''}</span>
        <div class="habit-meta">
          <div class="habit-stat">
            <span class="habit-stat-val">${t.currentStreak ?? '—'}</span>
            <span class="habit-stat-lbl">streak</span>
          </div>
          <div class="habit-stat">
            <span class="habit-stat-val">${t.bestStreak}</span>
            <span class="habit-stat-lbl">best</span>
          </div>
          <div class="habit-stat">
            <span class="habit-stat-val">${t.rate}%</span>
            <span class="habit-stat-lbl">${s.days}d</span>
          </div>
        </div>
        <span class="habit-chevron">›</span>
      </div>
      <div class="habit-calendar" hidden></div>
    </div>`).join('') || '<p class="empty-state">No daily tasks yet.</p>';

  el.innerHTML = `
    <div class="stats-section">
      <div class="stats-label">Completion by day of week (last ${s.days} days)</div>
      <div class="dow-chart">${dowBars}</div>
    </div>

    <div class="stats-section">
      <div class="stats-label">Habits — click to see calendar</div>
      <div class="habit-table">${habitRows}</div>
    </div>

    <div class="stats-section">
      <div class="stats-label">Export</div>
      <a class="export-btn" href="/api/export.csv" download="dailies-export.csv">⬇ Download CSV</a>
    </div>
  `;

  // Expand/collapse calendar on click
  el.querySelectorAll('.habit-row-header').forEach(header => {
    header.addEventListener('click', async () => {
      const row = header.closest('.habit-row');
      const calEl = row.querySelector('.habit-calendar');
      const isOpen = !calEl.hidden;
      if (isOpen) {
        calEl.hidden = true;
        row.classList.remove('open');
        return;
      }
      row.classList.add('open');
      calEl.hidden = false;
      if (!calEl.dataset.loaded) {
        calEl.innerHTML = '<p class="empty-state" style="padding:.5rem">Loading…</p>';
        const { history } = await api.getHistory(row.dataset.id, 91);
        calEl.innerHTML = buildHeatmap(history);
        calEl.dataset.loaded = '1';
      }
    });
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────

const tabs   = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const loaded = new Set();

function switchTab(name) {
  tabs.forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  panels.forEach(p => { p.hidden = p.id !== name; });
  clearKbFocus();
  if (!loaded.has(name)) {
    loaded.add(name);
    if      (name === 'overview')  loadOverview();
    else if (name === 'daily')     loadTasks('daily');
    else if (name === 'weekly')    loadTasks('weekly');
    else if (name === 'monthly')   loadTasks('monthly');
    else if (name === 'stats')     loadStats();
    else if (name === 'reminders') loadReminders();
  }
}

function refreshOverview() {
  if (loaded.has('overview')) loadOverview();
}

tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

// ── Task event delegation ─────────────────────────────────────────────────

function taskListHandler(type) {
  return async (e) => {
    const li = e.target.closest('.task-item');
    if (!li) return;
    const id = li.dataset.id;
    const action = e.target.dataset.action;

    if (e.target.matches('input[type="checkbox"]')) {
      const checked = e.target.checked;
      li.classList.toggle('done', checked);
      try {
        if (checked) await api.completeTask(id);
        else         await api.uncompleteTask(id);
        refreshOverview();
      } catch {
        e.target.checked = !checked;
        li.classList.toggle('done', !checked);
      }

    } else if (action === 'pause') {
      const paused = !li.classList.contains('paused');
      await api.updateTask(id, { paused });
      loadTasks(type);
      refreshOverview();

    } else if (action === 'delete') {
      li.remove();
      await api.deleteTask(id);
      refreshOverview();
      if (loaded.has('stats')) { loaded.delete('stats'); }
    }
  };
}

document.getElementById('daily-groups').addEventListener('click', taskListHandler('daily'));
document.getElementById('weekly-list').addEventListener('click',  taskListHandler('weekly'));
document.getElementById('monthly-list').addEventListener('click', taskListHandler('monthly'));

document.getElementById('reminder-list').addEventListener('click', async (e) => {
  if (!e.target.matches('.delete-btn')) return;
  const card = e.target.closest('.reminder-card');
  if (!card) return;
  card.remove();
  await api.deleteReminder(card.dataset.id);
  refreshOverview();
});

// ── Add forms ─────────────────────────────────────────────────────────────

function addFormHandler(type, inputId, formId, groupSelectId) {
  document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById(inputId);
    const title = input.value.trim();
    if (!title) return;
    const group = groupSelectId ? document.getElementById(groupSelectId).value || null : null;
    input.value = '';
    await api.createTask(type, title, group);
    loadTasks(type);
    refreshOverview();
    if (loaded.has('stats')) { loaded.delete('stats'); }
  });
}

addFormHandler('daily',   'daily-input',   'daily-add-form',   'daily-group-select');
addFormHandler('weekly',  'weekly-input',  'weekly-add-form',  null);
addFormHandler('monthly', 'monthly-input', 'monthly-add-form', null);

document.getElementById('reminder-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('reminder-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  await api.createReminder(content);
  loadReminders();
  refreshOverview();
});

// ── Keyboard navigation ───────────────────────────────────────────────────

let kbFocusEl = null;

function clearKbFocus() {
  kbFocusEl?.classList.remove('kb-focus');
  kbFocusEl = null;
}

function getAllTaskItems() {
  const activePanel = document.querySelector('.tab-panel:not([hidden])');
  return activePanel ? [...activePanel.querySelectorAll('.task-item')] : [];
}

function moveKbFocus(dir) {
  const items = getAllTaskItems();
  if (!items.length) return;
  let idx = kbFocusEl ? items.indexOf(kbFocusEl) + dir : (dir > 0 ? 0 : items.length - 1);
  idx = Math.max(0, Math.min(items.length - 1, idx));
  clearKbFocus();
  kbFocusEl = items[idx];
  kbFocusEl.classList.add('kb-focus');
  kbFocusEl.scrollIntoView({ block: 'nearest' });
}

function toggleKbFocusedTask() {
  if (!kbFocusEl) return;
  const cb = kbFocusEl.querySelector('input[type="checkbox"]:not([disabled])');
  if (cb) cb.click();
}

function focusAddInput() {
  const activePanel = document.querySelector('.tab-panel:not([hidden])');
  const input = activePanel?.querySelector('.add-form input[type="text"]');
  input?.focus();
}

const TAB_KEYS = { o: 'overview', d: 'daily', w: 'weekly', m: 'monthly', s: 'stats', r: 'reminders' };

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    if (!document.getElementById('kb-modal').hidden) closeKbModal();
    else if (typing) document.activeElement.blur();
    clearKbFocus();
    return;
  }

  if (e.key === '?') { toggleKbModal(); return; }

  if (typing) return;

  if (TAB_KEYS[e.key]) { switchTab(TAB_KEYS[e.key]); return; }
  if (e.key === 'j' || e.key === 'ArrowDown')  { moveKbFocus(1);  return; }
  if (e.key === 'k' || e.key === 'ArrowUp')    { moveKbFocus(-1); return; }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleKbFocusedTask(); return; }
  if (e.key === 'n') { focusAddInput(); return; }
});

// ── Keyboard shortcut modal ───────────────────────────────────────────────

const kbModal   = document.getElementById('kb-modal');
const kbHelpBtn = document.getElementById('kb-help-btn');
const kbClose   = document.getElementById('kb-close');

function toggleKbModal() {
  kbModal.hidden ? openKbModal() : closeKbModal();
}
function openKbModal()  { kbModal.hidden = false; kbClose.focus(); }
function closeKbModal() { kbModal.hidden = true;  kbHelpBtn.focus(); }

kbHelpBtn.addEventListener('click', toggleKbModal);
kbClose.addEventListener('click', closeKbModal);
kbModal.addEventListener('click', (e) => { if (e.target === kbModal) closeKbModal(); });

// ── Boot ──────────────────────────────────────────────────────────────────
switchTab('overview');
