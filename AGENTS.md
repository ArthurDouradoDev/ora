# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**Ora - Nova Aba Católica** is a Chrome/Edge/Brave extension (Manifest V3) that overrides the new tab page with a Catholic spiritual + productivity interface combining Pomodoro timers, a website blocker, prayer library, interactive rosary, and daily liturgy readings.

## Installation & Development

There is no build process. This is pure vanilla JS/HTML/CSS — no npm, no bundler.

**To load the extension locally:**
1. Go to `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" → select the project root
4. Open a new tab to see the extension

**After making changes:**
- Reload the extension in the extensions page
- Service Worker changes require a full extension reload
- Check console in the new tab with `Ctrl+Shift+J`
- View SW logs: Extensions > Details > "Service Worker" link

**Tests:** pure functions in `scripts/shared/` are covered by `tests/tests.js`. Run `node tests/run.js` from the project root (exits 1 on failure), or open `tests/tests.html` in a browser (serve it over http so `tests/fixtures/*.json` load; under `file://` the fixture tests are skipped). UI flows are still tested manually by exercising each module.

## Architecture

### Entry Points
- `ora.html` — Main new tab UI
- `blocked.html` — Shown when user visits a blocked site
- `sw.js` — Service Worker: alarms, reminders, gospel cache refresh

### Initialization flow
`ora.html` → `scripts/main.js` loads all JSON data from `/data/`, registers the SW, calls `init()` on each module, applies i18n, then reveals the UI from behind a loading screen.

### Shell and navigation (V1)
`ora.html` has a fixed `.topbar` (brand, nav Hoje · Rezar · Frutos, Tarefas chip, Proteção pill, settings) and one `<main class="view" data-view="…">` per destination. `scripts/ui/router.js` switches views; the route lives in `history.state` (URL stays clean, browser Back works, new tabs start at Hoje) and is parsed by the pure `scripts/shared/route-core.js`. New dialogs use `scripts/ui/dialog.js` (focus trap, inert background, Esc, focus return); legacy V0 modals still use `animateModal()` until each screen is migrated (their triggers live in the hidden `.legacy-triggers` block; buttons that open them must `stopPropagation()`, because they close on any outside click). The migration plan is in `PLANO_V1_ORA.md`.

### Hoje and the focus flow (phase 2)
`TodayCore.resolveTodayState({ tasks, pomodoro, now, reminders, preparing, error })` is the single source for the Hoje state (`repouso-vazio`, `repouso`, `preparacao`, `ativa`, `pausada`, `concluida`, `noite`, `falha`). The SW owns the timer: `pomodoro:startFocus` (activity, minutes, task, session intention, protection), `pomodoro:pause` / `pomodoro:start` (resume), `pomodoro:interrupt` (focused minutes count), `pomodoro:startBreak`, `pomodoro:home`, `pomodoro:tick` (a tab whose countdown hit zero asks the SW to close the phase without waiting for the alarm). When a focus phase ends the SW writes `ora_pomodoro_state.completed`, which Hoje shows as the single end-of-session transition (E12). "Bloquear distrações" turns the blocker on for the session when it is off and restores it at the end (`ora_pomodoro_state.protection`).
Dev-only 1-minute focus: with the extension loaded unpacked, set `chrome.storage.local.set({ ora_debug_short_focus: true })` and reload; the preparation offers "1 min".

### Module Pattern
Every feature in `scripts/modules/` is a singleton object:
```js
const ModuleName = {
  state: { /* internal state */ },
  init: async function(appData) { /* setup */ },
  cacheDOM: function() { /* cache element refs */ },
  bindEvents: function() { /* attach listeners */ },
}
```
Modules communicate with the Service Worker via `chrome.runtime.sendMessage()`. Cross-tab state sync happens through `chrome.storage.onChanged` listeners.

### Key Modules
| File | Purpose |
|------|---------|
| `scripts/modules/today.js` | Hoje: arrival, next step, focus preparation/session/completion, day intention, gospel footer. State comes from `TodayCore.resolveTodayState` |
| `scripts/modules/focus.js` | Focus engine in the page: mirrors the SW pomodoro state (`ora:pomodoro` event), sends commands, end tone, wake lock |
| `scripts/modules/blocker.js` | Website blocker using Declarative Net Request (DNR); its V0 modal is opened by "Gerenciar proteção" until phase 4 |
| `scripts/modules/protection.js` | "Proteção" pill in the header (real state) and summary popover |
| `scripts/modules/reminders.js` | The single invite space on Hoje (Angelus, Chaplet, midday exam, "Encerrar o dia", internet prayer), chosen by `RemindersCore` |
| `scripts/modules/links.js` | "Seus atalhos" on Hoje + manage dialog (`ora_quick_links`) |
| `scripts/modules/rosary.js` | Rosary preparation and prayer subroutes, weekday mysteries, real saved position; also Divine Mercy Chaplet |
| `scripts/modules/exam.js` | Examination subroutes, draft, confirmed logs and virtue checklist |
| `scripts/modules/music.js` | YouTube/Spotify player with relay iframe workaround |
| `scripts/modules/tasks.js` | Tasks side panel "Tarefas (n)": Hoje (ordered) and Depois, weekday recurrence, completed of the day |
| `scripts/modules/rezar.js` | Rezar entry, saints, Gospel sources, Bible chapter selection and subroutes |
| `scripts/modules/prayers.js` | Accent-insensitive library search, category and favorites scopes |
| `scripts/modules/reader.js` | Reading position, Dark/Paper, text size and four-step Lectio with local notes |
| `scripts/modules/respiro.js` | Untimed pause, remembered form and return to its origin |
| `scripts/modules/settings.js` | User preferences UI |
| `scripts/utils.js` | Shared utilities: i18n, storage helpers, UI helpers |

### Storage
- `chrome.storage.local` — persistent user data (blocker config, playlists, tasks, focus sessions, settings)
- `chrome.storage.session` — ephemeral (e.g., `ora_bg_loaded` to prevent duplicate loading screens)
- Notable keys: `ora_pomodoro_state`, `blocker_config`, `blocker_sites`, `ora_settings`, `liturgy_gospel_cache`
- **Data model (schema 2, `ora_schema_version`):** task, session and intention are separate.
  - `ora_tasks` — tasks (`scripts/shared/tasks-core.js`); a task with `recurrence` is a routine template that generates the day's task. Completed tasks move to `ora_tasks_history` at day rollover.
  - `ora_sessions` — focus sessions, written **only by the SW** (`sessions-core.js`): paused time does not count, interrupted sessions keep the minutes focused, focus without a task is allowed.
  - `ora_day_intention` — intention of the day by date; a session's intention (and activity title) lives in the session.
  - Hoje: `ora_quick_links` (shortcuts), `ora_invites_handled` (invites done or postponed per time window), `ora_focus_protect` / `ora_focus_sound` (last choices in the preparation).
  - "Dias com Ora" (`counter-core.js`) is derived from sessions + completed tasks; it never resets.
  - `scripts/shared/migrate-core.js` converts 1.1.5 / 1.2.0 data; it runs (idempotently) in the SW and in `main.js` before modules start. The blocker keys stay as-is until phase 4.
  - Sync carries only routine templates (`sync_routine`) and settings.

### i18n
Use the global `t(key, params?)` function from `utils.js`. Keys use dot-notation (`t('header.liturgy')`). Locale files are in `/data/i18n/` (pt.json, en.json, es.json). Always use `t()` for any user-visible string.

### External APIs
- `https://liturgia.up.railway.app/v2/` — Daily gospel (cached in storage)
- Unsplash — Daily background images
- YouTube (via `youtube-nocookie`) and Spotify (via iframe embeds)
- **Note:** YouTube embeds use a relay iframe hosted on GitHub Pages to work around CORS

### Styling
CSS is organized under `styles/` into `base/`, `components/`, `layout/`, `modules/`, and `utils/`. Design tokens (from `prototypes/00-sistema.html`) live in `styles/base/variables.css`; V1 components in `styles/components/ui.css`; shell layout in `styles/layout/shell.css`. Fonts are bundled locally (`assets/fonts/`, declared in `styles/base/fonts.css`): Cinzel for brand/clock, Montserrat for UI, Literata for reading. Design language: glassmorphism with delimited roles (glass for navigation over the photo, solid for organizing, read surfaces for long text). Legacy class names that collide with V1 components keep the legacy meaning until that screen is replaced (the V1 switch is `.toggle`).

### Rezar (phase 3)
`rezar` → `biblioteca`, `leitor/:id`, `evangelho`, `lectio`, `terco`, `terco/oracao`, `respiro`, `exame`, `exame/virtudes`, `biblia`. These replace the V0 prayer/rosary/exam modals. `styles/modules/rezar.css` owns the screens; `PrayUI` reuses the existing controls and `DialogSystem` for destructive confirmations.

- Pure logic: `search-core`, `reader-core`, `rosary-core`, `liturgy-core`, `saints-core`, `bible-core`.
- `liturgy_gospel_cache` version 2 contains `days[YYYY-MM-DD].pt/en` for today plus six days, preserving legacy top-level Portuguese fields. The SW fills it on installation/startup, hourly, and on `liturgy:refresh`. Portuguese text remains complete; English/Spanish readers link to their sources.
- Prayer categories/essential flags and localized titles: `data/prayers.json`; fixed-date principal saints: `data/saints.json`; 73 Bible books: `data/bible-books.json`. Saint quotations require `verified: true` and an HTTPS source.
- Storage: `ora_prayer_favorites`, `ora_reader_preferences`, `ora_reader_position_<id>_<lang>`, `ora_lectio_<date>`, `ora_rosary_progress`, `ora_respiro_form`, `ora_exam_draft`, `ora_bible_last`. Existing `ora_exam_logs` and virtue keys are preserved.
- Optional approved artwork is selected by pericope from `ora_acervo_url` on the already-permitted jsDelivr origin. No image means no reserved blank area. The 20 rosary image slots remain null until artwork is approved (phase 10).
- Browser acceptance runner (preinstalled Playwright, isolated Chromium profile): `tests/phase3-browser.cjs`. Setup and evidence: `tests/FASE_3.md`. No new extension dependencies.
