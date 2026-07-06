# Dailies

A self-hosted habit tracker and daily planner. Tracks daily, weekly, and monthly habits with streaks, a mood log, one-off tasks, a journal, and reminders — all in a single file with no external database.

![Node.js](https://img.shields.io/badge/Node.js-24-green) ![Docker](https://img.shields.io/badge/Docker-ready-blue)

---

## Features

- **Daily / Weekly / Monthly habits** — check off recurring tasks, build streaks, set streak goals
- **Count tasks** — track numeric targets (e.g. "8 glasses of water")
- **One-off Tasks** — a simple to-do list for non-recurring items
- **Overview** — daily progress bars, incomplete tasks, top streaks, and today's journal note at a glance
- **Mood log** — 5-point daily mood with a 30-day dot chart
- **Journal** — freeform daily notes with a monthly archive view
- **Weekly Review** — structured prompts (went well / challenges / focus)
- **Stats** — completion rate by day of week and per-habit calendar heatmaps
- **Reminders** — persistent sticky notes shown on the overview
- **Streaks** — current and best streak per habit, with optional freeze days for holidays
- **PIN lock** — optional 4-digit PIN to protect the app
- **PWA** — installable on mobile (Add to Home Screen), works offline
- **Keyboard shortcuts** — navigate and complete tasks without touching the mouse
- **Light / dark mode** — warm zen theme, follows system preference

---

## Deploying with Docker (recommended)

### Docker Compose (e.g. Portainer)

Create a stack with this `docker-compose.yml`:

```yaml
services:
  dailies:
    image: ghcr.io/bjamex/dailies:latest
    ports:
      - "3069:3000"
    volumes:
      - dailies-data:/data
    restart: unless-stopped

volumes:
  dailies-data: {}
```

Then open `http://your-server:3069`.

### Docker CLI

```bash
docker run -d \
  --name dailies \
  -p 3069:3000 \
  -v dailies-data:/data \
  --restart unless-stopped \
  ghcr.io/bjamex/dailies:latest
```

### Updating

Pull the latest image and recreate the container. Your data lives in the `dailies-data` volume and is not affected.

**Portainer:** Go to the stack → Editor → Deploy (re-pulls the image).

---

## Running locally

```bash
git clone https://github.com/bjamex/dailies.git
cd dailies
npm install
node server.js
```

Open `http://localhost:3000`.

Data is stored in `dailies.json` in the project directory. Set `DB_FILE` to change the path:

```bash
DB_FILE=/path/to/data/dailies.json node server.js
```

---

## First-time setup

1. Open the app and go to the **Overview** tab
2. Scroll to **Settings** at the bottom
3. Set your **Timezone** — click "Use my timezone" so day resets happen at the right local time
4. Optionally set a **Day resets at** hour (e.g. 3am if you stay up past midnight)
5. Add your first daily habits on the **Daily** tab

---

## Tabs

| Tab | Purpose |
|-----|---------|
| Overview | Today's snapshot — progress, incomplete tasks, streaks, journal note |
| Daily | Daily habits — check off, reorder, group by morning/afternoon |
| Weekly | Habits that reset each Monday |
| Monthly | Habits that reset each month |
| Tasks | One-off to-dos with drag-to-reorder |
| Stats | Completion rates by day of week, per-habit heatmaps |
| Journal | Daily freeform notes + mood log with 30-day history |
| Reminders | Persistent notes shown on the overview every day |

---

## Habits

### Adding a habit

Go to the relevant tab (Daily / Weekly / Monthly) and type in the box at the bottom. Daily habits can be assigned to a **Morning** or **Afternoon** group.

### Task types

- **Check** — a simple checkbox (default)
- **Count** — a +/− counter with an optional target (e.g. 8 glasses of water). Set the type in the dropdown before adding.

### Editing a habit

Click the ✎ pencil button on any task to rename it, set a **streak goal** (daily only), or set a **reminder time** (requires the page to be open).

### Pausing a habit

Click ⏸ to pause a habit without deleting it. Paused habits don't count toward daily progress and streaks are frozen.

### Reordering

Drag the ⠿ handle to reorder tasks. Works on both desktop and mobile.

### Swipe to complete (mobile)

Swipe a task to the right to toggle it as complete.

---

## Streaks

Streaks count consecutive days a daily habit was completed. They appear as 🔥 badges on tasks and in the overview.

- Set a **streak goal** on a task (e.g. 30 days) to see a progress bar — it becomes 🎯 when reached
- Add **vacation / freeze days** in Settings to prevent a streak breaking when you're away

---

## Settings

Found at the bottom of the Overview tab:

| Setting | Description |
|---------|-------------|
| Day resets at | Hour when the "new day" begins (default: midnight). Useful if you track habits past midnight. |
| Timezone | Your local timezone. Click "Use my timezone" to auto-detect. Required for correct resets when running in Docker (which defaults to UTC). |
| Vacation days | Dates where streaks are frozen — missing a habit on these days won't break your streak. |
| PIN lock | 4-digit PIN to prevent casual access. |

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `o` | Overview |
| `d` | Daily |
| `w` | Weekly |
| `m` | Monthly |
| `t` | Tasks |
| `s` | Stats |
| `j` | Journal |
| `r` | Reminders |
| `n` | Focus the add-task input |
| `j` / `↓` | Next task |
| `k` / `↑` | Previous task |
| `Space` | Toggle focused task |
| `?` | Show shortcuts |
| `Esc` | Close modal / blur input |

---

## Backup & restore

Go to **Stats → Export / Import**:

- **CSV export** — all completion history as a spreadsheet
- **Backup** — full JSON backup of all data
- **Restore** — restore from a JSON backup (replaces all current data)

---

## Data

All data is stored in a single JSON file (`/data/dailies.json` inside the container, persisted via the named volume). There is no external database.

---

## Tech stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML, CSS, JavaScript — no build step
- **Storage:** JSON file on disk
