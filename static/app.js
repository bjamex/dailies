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
  logTask:        (id, value) => fetch(`/api/tasks/${id}/log`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  }).then(r => r.json()),
  getHistory:     (id, days = 91) => fetch(`/api/tasks/${id}/history?days=${days}`).then(r => r.json()),

  getSummary:  () => fetch('/api/summary').then(r => r.json()),
  getStats:    () => fetch('/api/stats').then(r => r.json()),

  listJournal: () => fetch('/api/journal').then(r => r.json()),
  getJournal:  (date) => fetch(`/api/journal/${date}`).then(r => r.json()),
  saveJournal: (date, content) => fetch(`/api/journal/${date}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }),

  reorderTasks:    (order) => fetch('/api/tasks/reorder', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  }),

  getQuote:        () => fetch('/api/quote').then(r => r.json()),
  getSettings:     () => fetch('/api/settings').then(r => r.json()),
  saveSettings:    (patch) => fetch('/api/settings', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
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
  const [s, settings, { quote }] = await Promise.all([api.getSummary(), api.getSettings(), api.getQuote()]);

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
      ${quote ? `<div class="overview-quote">${esc(quote)}</div>` : ''}
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

    <div class="overview-section">
      <button class="weekly-review-btn" id="weekly-review-btn">📋 Weekly Review — ${esc(s.week)}</button>
    </div>

    <details class="settings-section">
      <summary class="settings-toggle">Settings</summary>
      <div class="settings-body">
        <label class="settings-row">
          <span>Day resets at</span>
          <select id="reset-hour-select">
            ${Array.from({length: 24}, (_, i) => {
              const label = i === 0 ? 'Midnight (default)' : `${String(i).padStart(2,'0')}:00`;
              return `<option value="${i}" ${settings.resetHour === i ? 'selected' : ''}>${label}</option>`;
            }).join('')}
          </select>
        </label>
        <div class="settings-divider"></div>
        <div class="settings-row-label">Vacation / streak freeze days</div>
        <div class="vacation-chips" id="vacation-chips">
          ${(settings.vacationDays || []).map(d => `<span class="vacation-chip" data-date="${d}">${d} <button class="vacation-chip-del" data-date="${d}">✕</button></span>`).join('')}
        </div>
        <div class="settings-row vacation-add-row">
          <input type="date" id="vacation-date-input" class="vacation-date-input">
          <button class="vacation-add-btn" id="vacation-add-btn">Add day</button>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row-label">PIN lock</div>
        <div class="settings-row">
          <span id="pin-status-label">${settings.pin ? 'PIN is set' : 'No PIN set'}</span>
          <div style="display:flex;gap:.4rem">
            ${settings.pin ? `<button class="vacation-add-btn" id="change-pin-btn">Change</button><button class="vacation-add-btn danger-btn" id="remove-pin-btn">Remove</button>` : `<button class="vacation-add-btn" id="set-pin-btn">Set PIN</button>`}
          </div>
        </div>
      </div>
    </details>
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

  // Settings — reset hour
  document.getElementById('reset-hour-select')?.addEventListener('change', async (e) => {
    await api.saveSettings({ resetHour: Number(e.target.value) });
    loaded.delete('daily'); loaded.delete('weekly'); loaded.delete('monthly');
    loadOverview();
  });

  // Settings — vacation days
  document.getElementById('vacation-add-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('vacation-date-input');
    const date = input.value;
    if (!date) return;
    const current = (settings.vacationDays || []);
    if (current.includes(date)) return;
    const next = [...current, date].sort();
    await api.saveSettings({ vacationDays: next });
    settings.vacationDays = next;
    const chips = document.getElementById('vacation-chips');
    const chip = document.createElement('span');
    chip.className = 'vacation-chip';
    chip.dataset.date = date;
    chip.innerHTML = `${date} <button class="vacation-chip-del" data-date="${date}">✕</button>`;
    chips.appendChild(chip);
    input.value = '';
  });

  document.getElementById('vacation-chips')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.vacation-chip-del');
    if (!btn) return;
    const date = btn.dataset.date;
    const next = (settings.vacationDays || []).filter(d => d !== date);
    await api.saveSettings({ vacationDays: next });
    settings.vacationDays = next;
    btn.closest('.vacation-chip').remove();
  });

  // Settings — PIN
  document.getElementById('set-pin-btn')?.addEventListener('click', () => openPinSetModal(false));
  document.getElementById('change-pin-btn')?.addEventListener('click', () => openPinSetModal(true));
  document.getElementById('remove-pin-btn')?.addEventListener('click', async () => {
    await api.saveSettings({ pin: null });
    sessionStorage.removeItem('pin-unlocked');
    loadOverview();
  });

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
  li.className = `task-item${task.completed ? ' done' : ''}${task.paused ? ' paused' : ''}${task.notes ? ' has-notes' : ''}`;
  li.dataset.id = task.id;
  li.tabIndex = -1;
  li.draggable = true;

  const noteIndicator = task.notes ? '<span class="note-dot" title="Has note">·</span>' : '';
  const isCount = task.kind === 'count';
  const countHtml = isCount ? `
    <span class="count-control">
      <button class="count-btn" data-action="count-dec" ${task.paused ? 'disabled' : ''}>−</button>
      <span class="count-val">${task.value ?? 0}${task.target ? `<span class="count-target">/${task.target}</span>` : ''}</span>
      <button class="count-btn" data-action="count-inc" ${task.paused ? 'disabled' : ''}>+</button>
    </span>` : '';

  li.innerHTML = `
    <span class="drag-handle" aria-hidden="true">⠿</span>
    ${isCount ? '' : `<input type="checkbox" ${task.completed ? 'checked' : ''} ${task.paused ? 'disabled' : ''} aria-label="${esc(task.title)}">`}
    <span class="task-label-wrap">
      <span class="task-label">${esc(task.title)}</span>${noteIndicator}
    </span>
    ${task.streak ? streakBadge(task.streak, task.streak_goal) : ''}
    ${countHtml}
    <button class="edit-btn" title="Edit" data-action="edit">✎</button>
    <button class="pause-btn" title="${task.paused ? 'Resume' : 'Pause'}" data-action="pause">${task.paused ? '▶' : '⏸'}</button>
    <button class="delete-btn" title="Delete" data-action="delete">✕</button>
  `;

  if (isCount) {
    li.dataset.value = task.value ?? 0;
    li.dataset.target = task.target ?? '';
  }

  // Notes panel (hidden by default)
  const notesPanel = document.createElement('div');
  notesPanel.className = 'task-notes-panel';
  notesPanel.hidden = true;
  const ta = document.createElement('textarea');
  ta.className = 'task-notes-ta';
  ta.placeholder = 'Add a note…';
  ta.value = task.notes || '';
  ta.rows = 2;
  let notesTimer;
  ta.addEventListener('input', () => {
    autoResize(ta);
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      api.updateTask(task.id, { notes: ta.value });
      const dot = li.querySelector('.note-dot');
      const wrap = li.querySelector('.task-label-wrap');
      if (ta.value && !dot) {
        const d = document.createElement('span');
        d.className = 'note-dot';
        d.title = 'Has note';
        d.textContent = '·';
        wrap.appendChild(d);
      } else if (!ta.value && dot) {
        dot.remove();
      }
    }, 600);
  });
  ta.addEventListener('blur', () => {
    clearTimeout(notesTimer);
    api.updateTask(task.id, { notes: ta.value });
  });
  notesPanel.appendChild(ta);
  li.appendChild(notesPanel);

  // Toggle notes on label click
  li.querySelector('.task-label-wrap').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !notesPanel.hidden;
    notesPanel.hidden = open;
    li.classList.toggle('notes-open', !open);
    if (!open) { autoResize(ta); ta.focus(); }
  });

  return li;
}

function initDrag(ul) {
  let dragSrc = null;

  ul.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.task-item');
    if (!li) return;
    dragSrc = li;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  ul.addEventListener('dragend', () => {
    dragSrc?.classList.remove('dragging');
    ul.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragSrc = null;
  });

  ul.addEventListener('dragover', (e) => {
    e.preventDefault();
    const li = e.target.closest('.task-item');
    if (!li || li === dragSrc) return;
    ul.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
    // Insert before or after based on mouse position
    const rect = li.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) ul.insertBefore(dragSrc, li);
    else li.after(dragSrc);
  });

  ul.addEventListener('drop', async (e) => {
    e.preventDefault();
    ul.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    const items = [...ul.querySelectorAll('.task-item')];
    const order = items.map((li, i) => ({ id: Number(li.dataset.id), position: i }));
    await api.reorderTasks(order);
    refreshOverview();
  });
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
    initDrag(ul);
  }
}

function renderFlatTasks(tasks, listEl) {
  listEl.innerHTML = '';
  if (!tasks.length) {
    listEl.innerHTML = '<li class="empty-state">No tasks yet — add one below.</li>';
    return;
  }
  tasks.forEach(t => listEl.appendChild(makeTaskItem(t)));
  initDrag(listEl);
}

async function loadTasks(type) {
  const tasks = await api.getTasks(type);
  if (type === 'daily') {
    renderGroupedTasks(tasks, document.getElementById('daily-groups'));
    scheduleNotifications(tasks);
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
      <div class="stats-label">Export / Import</div>
      <div class="import-export-row">
        <a class="export-btn" href="/api/export.csv" download="dailies-export.csv">⬇ CSV</a>
        <label class="export-btn import-label">
          ⬆ CSV
          <input type="file" accept=".csv,text/csv" id="import-file-input" style="display:none">
        </label>
        <a class="export-btn" href="/api/backup" download="dailies-backup.json">⬇ Backup</a>
        <label class="export-btn import-label">
          ⬆ Restore
          <input type="file" accept=".json,application/json" id="restore-file-input" style="display:none">
        </label>
      </div>
      <div id="import-status" class="import-status"></div>
    </div>
  `;

  // Import CSV
  document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('import-status');
    statusEl.textContent = 'Importing…';
    statusEl.className = 'import-status';
    const text = await file.text();
    try {
      const result = await fetch('/api/import.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      }).then(r => r.json());
      if (result.ok) {
        statusEl.textContent = `✓ Imported ${result.imported} completion${result.imported !== 1 ? 's' : ''}`;
        statusEl.className = 'import-status success';
        loaded.delete('stats');
        setTimeout(() => loadStats(), 800);
      } else {
        statusEl.textContent = `Error: ${result.error}`;
        statusEl.className = 'import-status error';
      }
    } catch {
      statusEl.textContent = 'Import failed';
      statusEl.className = 'import-status error';
    }
    e.target.value = '';
  });

  // Restore backup
  document.getElementById('restore-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('import-status');
    statusEl.textContent = 'Restoring…';
    statusEl.className = 'import-status';
    try {
      const json = JSON.parse(await file.text());
      const result = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      }).then(r => r.json());
      if (result.ok) {
        statusEl.textContent = '✓ Restore complete — reloading…';
        statusEl.className = 'import-status success';
        setTimeout(() => location.reload(), 800);
      } else {
        statusEl.textContent = `Error: ${result.error}`;
        statusEl.className = 'import-status error';
      }
    } catch {
      statusEl.textContent = 'Invalid backup file';
      statusEl.className = 'import-status error';
    }
    e.target.value = '';
  });

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

// ── Journal browser ───────────────────────────────────────────────────────

async function loadJournalBrowser() {
  const el = document.getElementById('journal-content');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  const entries = await api.listJournal();

  if (!entries.length) {
    el.innerHTML = '<p class="empty-state">No journal entries yet. Write one on the Overview tab.</p>';
    return;
  }

  // Group by month
  const byMonth = {};
  for (const e of entries) {
    const month = e.date.substring(0, 7);
    (byMonth[month] = byMonth[month] || []).push(e);
  }

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  el.innerHTML = Object.keys(byMonth).sort((a, b) => b.localeCompare(a)).map(month => {
    const [y, m] = month.split('-');
    const label = `${MONTH_NAMES[Number(m) - 1]} ${y}`;
    const rows = byMonth[month].map(e => {
      const isReview = e.date.includes('-review');
      const display = isReview ? `${e.date.replace('-review', '')} — Weekly Review` : e.date;
      return `<div class="journal-entry-row" data-date="${e.date}">
        <div class="journal-entry-header">
          <span class="journal-entry-date">${display}</span>
          <span class="journal-entry-chevron">›</span>
        </div>
        <div class="journal-entry-body" hidden></div>
      </div>`;
    }).join('');
    return `<div class="journal-month">
      <div class="journal-month-label">${label}</div>
      ${rows}
    </div>`;
  }).join('');

  el.addEventListener('click', async (e) => {
    const header = e.target.closest('.journal-entry-header');
    if (!header) return;
    const row = header.closest('.journal-entry-row');
    const body = row.querySelector('.journal-entry-body');
    const chevron = row.querySelector('.journal-entry-chevron');
    const isOpen = !body.hidden;
    if (isOpen) {
      body.hidden = true;
      chevron.style.transform = '';
      return;
    }
    chevron.style.transform = 'rotate(90deg)';
    body.hidden = false;
    if (!body.dataset.loaded) {
      body.innerHTML = '<p class="empty-state" style="padding:.5rem 0">Loading…</p>';
      const { content } = await api.getJournal(row.dataset.date);
      const isReview = row.dataset.date.includes('-review');
      if (isReview) {
        const [well, hard, next] = (content || '').split('\n---\n');
        body.innerHTML = [
          well ? `<div class="journal-review-section"><div class="journal-review-q">What went well</div><p>${esc(well)}</p></div>` : '',
          hard ? `<div class="journal-review-section"><div class="journal-review-q">Challenges</div><p>${esc(hard)}</p></div>` : '',
          next ? `<div class="journal-review-section"><div class="journal-review-q">Focus next week</div><p>${esc(next)}</p></div>` : '',
        ].join('') || '<p class="empty-state">Empty review.</p>';
      } else {
        body.innerHTML = content
          ? `<p class="journal-entry-text">${esc(content).replace(/\n/g, '<br>')}</p>`
          : '<p class="empty-state">Empty entry.</p>';
      }
      body.dataset.loaded = '1';
    }
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
    else if (name === 'journal')   loadJournalBrowser();
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
        if (checked) checkAllDone();
        refreshOverview();
      } catch {
        e.target.checked = !checked;
        li.classList.toggle('done', !checked);
      }

    } else if (action === 'count-inc' || action === 'count-dec') {
      const delta = action === 'count-inc' ? 1 : -1;
      const cur = Number(li.dataset.value ?? 0);
      const next = Math.max(0, cur + delta);
      li.dataset.value = next;
      const target = li.dataset.target ? Number(li.dataset.target) : null;
      const valEl = li.querySelector('.count-val');
      if (valEl) valEl.innerHTML = `${next}${target ? `<span class="count-target">/${target}</span>` : ''}`;
      const nowDone = target ? next >= target : next > 0;
      li.classList.toggle('done', nowDone);
      await api.logTask(id, next);
      if (nowDone) checkAllDone();
      refreshOverview();

    } else if (action === 'edit') {
      openTaskEditModal(li);

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

function addFormHandler(type, inputId, formId, groupSelectId, kindSelectId, targetInputId) {
  document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById(inputId);
    const title = input.value.trim();
    if (!title) return;
    const group = groupSelectId ? document.getElementById(groupSelectId).value || null : null;
    const kind = kindSelectId ? document.getElementById(kindSelectId).value : 'check';
    const target = targetInputId ? Number(document.getElementById(targetInputId).value) || null : null;
    input.value = '';
    if (targetInputId) document.getElementById(targetInputId).value = '';
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, group: group || null, kind, target }),
    });
    loadTasks(type);
    refreshOverview();
    if (loaded.has('stats')) { loaded.delete('stats'); }
  });
}

addFormHandler('daily',   'daily-input',   'daily-add-form',   'daily-group-select', 'daily-kind-select', 'daily-target-input');
addFormHandler('weekly',  'weekly-input',  'weekly-add-form',  null, null, null);
addFormHandler('monthly', 'monthly-input', 'monthly-add-form', null, null, null);

// Show/hide target input based on kind
document.getElementById('daily-kind-select')?.addEventListener('change', (e) => {
  const ti = document.getElementById('daily-target-input');
  if (ti) ti.style.display = e.target.value === 'count' ? '' : 'none';
});

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

const TAB_KEYS = { o: 'overview', d: 'daily', w: 'weekly', m: 'monthly', s: 'stats', j: 'journal', r: 'reminders' };

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

// ── Weekly review modal ───────────────────────────────────────────────────

const reviewModal = document.getElementById('review-modal');
let reviewKey = '';

async function openReviewModal(weekLabel, weekKey) {
  reviewKey = `${weekKey}-review`;
  document.getElementById('review-week-label').textContent = weekLabel;
  const entry = await api.getJournal(reviewKey);
  const content = entry.content || '';
  const parts = content.split('\n---\n');
  document.getElementById('review-well').value = parts[0] || '';
  document.getElementById('review-hard').value = parts[1] || '';
  document.getElementById('review-next').value = parts[2] || '';
  reviewModal.hidden = false;
  document.getElementById('review-well').focus();
}

function closeReviewModal() {
  reviewModal.hidden = true;
}

document.getElementById('review-save-btn').addEventListener('click', async () => {
  const well = document.getElementById('review-well').value;
  const hard = document.getElementById('review-hard').value;
  const next = document.getElementById('review-next').value;
  await api.saveJournal(reviewKey, [well, hard, next].join('\n---\n'));
  closeReviewModal();
});

document.getElementById('review-cancel-btn').addEventListener('click', closeReviewModal);
reviewModal.addEventListener('click', (e) => { if (e.target === reviewModal) closeReviewModal(); });

document.addEventListener('click', (e) => {
  if (e.target.id === 'weekly-review-btn') {
    const label = e.target.textContent.replace('📋 Weekly Review — ', '');
    const weekKey = e.target.closest('[data-week]')?.dataset.week
      || document.querySelector('[data-week]')?.dataset.week
      || (() => {
        const d = new Date();
        const day = d.getDay() || 7;
        d.setDate(d.getDate() + 4 - day);
        const ys = new Date(d.getFullYear(), 0, 1);
        const w = Math.ceil(((d - ys) / 86400000 + 1) / 7);
        return `${d.getFullYear()}-W${String(w).padStart(2,'0')}`;
      })();
    openReviewModal(label, weekKey);
  }
});

// ── Task edit modal ───────────────────────────────────────────────────────

const taskEditModal = document.getElementById('task-edit-modal');
let editingTaskEl = null;

function openTaskEditModal(li) {
  editingTaskEl = li;
  const id = li.dataset.id;
  const titleEl = li.querySelector('.task-label');
  document.getElementById('task-edit-title').value = titleEl?.textContent || '';

  // Fetch full task data for streak_goal and notify_time
  fetch(`/api/tasks?type=daily`).then(r => r.json()).then(tasks => {
    const task = tasks.find(t => String(t.id) === String(id));
    if (task) {
      document.getElementById('task-edit-streak').value = task.streak_goal || '';
      document.getElementById('task-edit-notify').value = task.notify_time || '';
    }
  }).catch(() => {});

  // Show/hide rows based on task type (daily tasks have full options)
  const isDaily = li.closest('#daily-groups') !== null;
  document.getElementById('task-edit-streak-row').style.display = isDaily ? '' : 'none';
  document.getElementById('task-edit-notify-row').style.display = isDaily ? '' : 'none';

  taskEditModal.hidden = false;
  document.getElementById('task-edit-title').focus();
  document.getElementById('task-edit-title').select();
}

function closeTaskEditModal() {
  taskEditModal.hidden = true;
  editingTaskEl = null;
}

document.getElementById('task-edit-save')?.addEventListener('click', async () => {
  if (!editingTaskEl) return;
  const id = editingTaskEl.dataset.id;
  const title = document.getElementById('task-edit-title').value.trim();
  const streak_goal = Number(document.getElementById('task-edit-streak').value) || null;
  const notify_time = document.getElementById('task-edit-notify').value || null;
  if (!title) return;

  if (notify_time && Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  await api.updateTask(id, { title, streak_goal, notify_time });

  // Update label in DOM without full reload
  const labelEl = editingTaskEl.querySelector('.task-label');
  if (labelEl) labelEl.textContent = title;

  closeTaskEditModal();
  // Reload the tab to reflect streak_goal badge change
  const type = editingTaskEl.closest('#daily-groups') ? 'daily'
    : editingTaskEl.closest('#weekly-list') ? 'weekly' : 'monthly';
  loadTasks(type);
  if (loaded.has('stats')) loaded.delete('stats');
});

document.getElementById('task-edit-cancel')?.addEventListener('click', closeTaskEditModal);
taskEditModal?.addEventListener('click', (e) => { if (e.target === taskEditModal) closeTaskEditModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !taskEditModal.hidden) closeTaskEditModal();
});

// ── Notifications ─────────────────────────────────────────────────────────

function scheduleNotifications(tasks) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = new Date().toISOString().split('T')[0];
  const shownKey = `notif-${today}`;
  const shown = new Set(JSON.parse(sessionStorage.getItem(shownKey) || '[]'));
  const now = new Date();

  for (const task of tasks) {
    if (!task.notify_time || task.completed || task.paused) continue;
    if (shown.has(String(task.id))) continue;
    const [h, m] = task.notify_time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    const ms = target - now;
    if (ms < -60000 || ms > 86400000) continue;
    if (ms <= 0) {
      // already past — show immediately if within last minute
      new Notification('Dailies', { body: task.title, icon: '/icon.svg', tag: String(task.id) });
      shown.add(String(task.id));
    } else {
      setTimeout(() => {
        new Notification('Dailies', { body: task.title, icon: '/icon.svg', tag: String(task.id) });
        shown.add(String(task.id));
        sessionStorage.setItem(shownKey, JSON.stringify([...shown]));
      }, ms);
    }
  }
  sessionStorage.setItem(shownKey, JSON.stringify([...shown]));
}

// ── Confetti celebration ──────────────────────────────────────────────────

function celebrate() {
  const el = document.createElement('div');
  el.className = 'confetti-container';
  document.body.appendChild(el);
  const colors = ['#7c84f8','#f97316','#22c55e','#f59e0b','#06b6d4','#ec4899'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `left:${Math.random()*100}%;background:${colors[i%colors.length]};` +
      `animation-delay:${(Math.random()*0.6).toFixed(2)}s;` +
      `animation-duration:${(0.9+Math.random()*0.8).toFixed(2)}s;` +
      `width:${4+Math.random()*6|0}px;height:${4+Math.random()*6|0}px;` +
      `transform:rotate(${Math.random()*360|0}deg)`;
    el.appendChild(p);
  }
  setTimeout(() => el.remove(), 3500);
}

function checkAllDone() {
  const panel = document.getElementById('daily-groups');
  if (!panel) return;
  const all = panel.querySelectorAll('.task-item:not(.paused)');
  const done = panel.querySelectorAll('.task-item:not(.paused).done');
  if (all.length && done.length === all.length) celebrate();
}

// ── PIN lock ──────────────────────────────────────────────────────────────

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const pinOverlay = document.getElementById('pin-overlay');
let pinBuffer = '';

function renderPinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`pd${i}`).classList.toggle('filled', i < pinBuffer.length);
  }
}

async function handlePinDigit(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  renderPinDots();
  if (pinBuffer.length === 4) {
    const hash = await sha256(pinBuffer);
    const settings = await api.getSettings();
    if (hash === settings.pin) {
      sessionStorage.setItem('pin-unlocked', '1');
      pinOverlay.hidden = true;
      pinBuffer = '';
    } else {
      document.getElementById('pin-error').textContent = 'Incorrect PIN';
      pinBuffer = '';
      renderPinDots();
      setTimeout(() => { document.getElementById('pin-error').textContent = ''; }, 1200);
    }
  }
}

pinOverlay?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.pin-key');
  if (!btn) return;
  if (btn.dataset.digit !== undefined) await handlePinDigit(btn.dataset.digit);
  else if (btn.dataset.action === 'back') { pinBuffer = pinBuffer.slice(0,-1); renderPinDots(); }
});

document.addEventListener('keydown', (e) => {
  if (pinOverlay?.hidden) return;
  if (/^\d$/.test(e.key)) handlePinDigit(e.key);
  else if (e.key === 'Backspace') { pinBuffer = pinBuffer.slice(0,-1); renderPinDots(); }
}, { capture: true });

async function initPinLock() {
  if (sessionStorage.getItem('pin-unlocked')) return;
  const settings = await api.getSettings();
  if (settings.pin) pinOverlay.hidden = false;
}

// PIN set modal (reuses review modal pattern inline)
let pinSetMode = false; // false=new, true=change
let pinSetStep = 0;
let pinSetFirst = '';

async function openPinSetModal(isChange) {
  pinSetMode = isChange;
  pinSetStep = isChange ? 0 : 1; // step 0 = verify old, 1 = enter new, 2 = confirm new
  pinSetFirst = '';
  const overlay = document.createElement('div');
  overlay.className = 'kb-modal';
  overlay.id = 'pin-set-overlay';
  const labels = ['Enter your current PIN', 'Enter new PIN (4 digits)', 'Confirm new PIN'];
  overlay.innerHTML = `<div class="kb-modal-box pin-set-box">
    <h2>${isChange ? 'Change PIN' : 'Set PIN'}</h2>
    <div class="pin-set-label" id="pin-set-label">${labels[pinSetStep]}</div>
    <div class="pin-dots" id="pin-set-dots">
      <span class="pin-dot" id="psd0"></span><span class="pin-dot" id="psd1"></span>
      <span class="pin-dot" id="psd2"></span><span class="pin-dot" id="psd3"></span>
    </div>
    <div class="pin-error" id="pin-set-error"></div>
    <div class="pin-pad">
      <button class="pin-key" data-d="1">1</button><button class="pin-key" data-d="2">2</button><button class="pin-key" data-d="3">3</button>
      <button class="pin-key" data-d="4">4</button><button class="pin-key" data-d="5">5</button><button class="pin-key" data-d="6">6</button>
      <button class="pin-key" data-d="7">7</button><button class="pin-key" data-d="8">8</button><button class="pin-key" data-d="9">9</button>
      <button class="pin-key pin-empty"></button><button class="pin-key" data-d="0">0</button>
      <button class="pin-key pin-back" data-back="1">⌫</button>
    </div>
    <button class="review-cancel-btn" id="pin-set-cancel">Cancel</button>
  </div>`;
  document.body.appendChild(overlay);

  let buf = '';
  const labels2 = isChange
    ? ['Enter your current PIN', 'Enter new PIN', 'Confirm new PIN']
    : ['Enter new PIN', 'Confirm new PIN'];

  function renderDots() {
    for (let i = 0; i < 4; i++) document.getElementById(`psd${i}`).classList.toggle('filled', i < buf.length);
  }

  async function handleDigit(d) {
    if (buf.length >= 4) return;
    buf += d;
    renderDots();
    if (buf.length < 4) return;

    const errEl = document.getElementById('pin-set-error');
    const lblEl = document.getElementById('pin-set-label');
    const stepIndex = pinSetStep - (isChange ? 0 : 1);

    if (isChange && pinSetStep === 0) {
      // Verify current PIN
      const settings = await api.getSettings();
      const hash = await sha256(buf);
      if (hash !== settings.pin) { errEl.textContent = 'Incorrect PIN'; buf = ''; renderDots(); return; }
      pinSetStep = 1; buf = ''; renderDots(); errEl.textContent = '';
      lblEl.textContent = labels2[1];
    } else if (pinSetStep === 1) {
      pinSetFirst = buf; pinSetStep = 2; buf = ''; renderDots();
      lblEl.textContent = isChange ? labels2[2] : labels2[1];
    } else {
      if (buf !== pinSetFirst) { errEl.textContent = 'PINs don\'t match'; buf = ''; renderDots(); return; }
      const hash = await sha256(buf);
      await api.saveSettings({ pin: hash });
      sessionStorage.setItem('pin-unlocked', '1');
      overlay.remove();
      loadOverview();
    }
  }

  overlay.addEventListener('click', async (e) => {
    if (e.target.dataset.d) await handleDigit(e.target.dataset.d);
    else if (e.target.dataset.back) { buf = buf.slice(0,-1); renderDots(); }
    else if (e.target.id === 'pin-set-cancel') overlay.remove();
  });
}

// ── Theme toggle ─────────────────────────────────────────────────────────

(function initTheme() {
  const btn = document.getElementById('theme-btn');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = (light) => {
    document.body.classList.toggle('light', light);
    btn.textContent = light ? '🌙' : '☀️';
    btn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
  };
  const saved = localStorage.getItem('theme');
  if (saved) {
    apply(saved === 'light');
  } else {
    apply(!systemDark.matches);
    systemDark.addEventListener('change', e => {
      if (!localStorage.getItem('theme')) apply(!e.matches);
    });
  }
  btn.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light');
    apply(!isLight);
    localStorage.setItem('theme', !isLight ? 'light' : 'dark');
  });
})();

// ── Service worker ─────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Boot ──────────────────────────────────────────────────────────────────
initPinLock().then(() => switchTab('overview'));
