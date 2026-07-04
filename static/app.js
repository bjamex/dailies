// API wrappers
const api = {
  getTasks: (type) => fetch(`/api/tasks?type=${type}`).then(r => r.json()),
  createTask: (type, title) => fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title })
  }).then(r => r.json()),
  deleteTask: (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => fetch(`/api/tasks/${id}/complete`, { method: 'POST' }),
  uncompleteTask: (id) => fetch(`/api/tasks/${id}/complete`, { method: 'DELETE' }),

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

// Render task list
function renderTasks(tasks, listEl) {
  listEl.innerHTML = '';
  if (!tasks.length) {
    listEl.insertAdjacentHTML('beforeend', '<li class="empty-state">No tasks yet — add one below.</li>');
    return;
  }
  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' done' : ''}`;
    li.dataset.id = task.id;
    li.innerHTML = `
      <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Complete ${task.title}">
      <span class="task-label">${escHtml(task.title)}</span>
      <button class="delete-btn" title="Delete task">✕</button>
    `;
    listEl.appendChild(li);
  }
}

// Render reminders
function renderReminders(reminders, listEl) {
  listEl.innerHTML = '';
  if (!reminders.length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="empty-state">No reminders yet — add one below.</div>');
    return;
  }
  for (const r of reminders) {
    const card = document.createElement('div');
    card.className = 'reminder-card';
    card.dataset.id = r.id;
    const ta = document.createElement('textarea');
    ta.value = r.content;
    ta.rows = Math.max(2, r.content.split('\n').length);
    ta.setAttribute('aria-label', 'Reminder text');
    ta.addEventListener('input', () => autoResize(ta));
    ta.addEventListener('blur', () => {
      if (ta.value !== r.content) {
        r.content = ta.value;
        api.updateReminder(r.id, ta.value);
      }
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Delete reminder';
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

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Load sections
async function loadTasks(type) {
  const listEl = document.getElementById(`${type}-list`);
  listEl.innerHTML = '<li class="empty-state">Loading…</li>';
  const tasks = await api.getTasks(type);
  renderTasks(tasks, listEl);
}

async function loadReminders() {
  const listEl = document.getElementById('reminder-list');
  listEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const reminders = await api.getReminders();
  renderReminders(reminders, listEl);
}

// Tab switching
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const loaded = new Set();

function switchTab(tabName) {
  tabs.forEach(t => {
    const active = t.dataset.tab === tabName;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  panels.forEach(p => {
    p.hidden = p.id !== tabName;
  });
  if (!loaded.has(tabName)) {
    loaded.add(tabName);
    if (tabName === 'reminders') loadReminders();
    else loadTasks(tabName);
  }
}

tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

// Event delegation for task checkboxes and delete buttons
document.getElementById('daily-list').addEventListener('click', handleTaskClick('daily'));
document.getElementById('weekly-list').addEventListener('click', handleTaskClick('weekly'));
document.getElementById('reminder-list').addEventListener('click', handleReminderClick);

function handleTaskClick(type) {
  return async (e) => {
    const li = e.target.closest('.task-item');
    if (!li) return;
    const id = li.dataset.id;

    if (e.target.matches('input[type="checkbox"]')) {
      const checked = e.target.checked;
      li.classList.toggle('done', checked);
      try {
        if (checked) await api.completeTask(id);
        else await api.uncompleteTask(id);
      } catch {
        // revert on error
        e.target.checked = !checked;
        li.classList.toggle('done', !checked);
      }
    } else if (e.target.matches('.delete-btn')) {
      li.remove();
      await api.deleteTask(id);
    }
  };
}

async function handleReminderClick(e) {
  if (!e.target.matches('.delete-btn')) return;
  const card = e.target.closest('.reminder-card');
  if (!card) return;
  const id = card.dataset.id;
  card.remove();
  await api.deleteReminder(id);
}

// Add forms
document.getElementById('daily-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('daily-input');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  await api.createTask('daily', title);
  loadTasks('daily');
});

document.getElementById('weekly-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('weekly-input');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  await api.createTask('weekly', title);
  loadTasks('weekly');
});

document.getElementById('reminder-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('reminder-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  await api.createReminder(content);
  loadReminders();
});

// Initial load
switchTab('daily');
