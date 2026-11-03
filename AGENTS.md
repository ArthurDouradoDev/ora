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

**Tests:** pure functions in `scripts/shared/` are covered by `tests/tests.js`. Run `node tests/run.js` from the project root (exits 1 on failure), or open `tests/tests.html` in a browser. UI flows are still tested manually by exercising each module.

## Architecture

### Entry Points
- `ora.html` — Main new tab UI
- `blocked.html` — Shown when user visits a blocked site
- `sw.js` — Service Worker: alarms, reminders, gospel cache refresh

### Initialization flow
`ora.html` → `scripts/main.js` loads all JSON data from `/data/`, registers the SW, calls `init()` on each module, applies i18n, then reveals the UI from behind a loading screen.

### Shell and navigation (V1)
`ora.html` has a fixed `.topbar` (brand, nav Hoje · Rezar · Frutos, utilities) and one `<main class="view" data-view="…">` per destination. `scripts/ui/router.js` switches views; the route lives in `history.state` (URL stays clean, browser Back works, new tabs start at Hoje) and is parsed by the pure `scripts/shared/route-core.js`. New dialogs use `scripts/ui/dialog.js` (focus trap, inert background, Esc, focus return); legacy V0 modals still use `animateModal()` until each screen is migrated. The migration plan is in `PLANO_V1_ORA.md`.

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
| `scripts/modules/focus.js` | Pomodoro timer, phases, wake lock, sounds |
| `scripts/modules/blocker.js` | Website blocker using Declarative Net Request (DNR) |
| `scripts/modules/reminders.js` | Scheduled notifications (Angelus, Chaplet, etc.) |
| `scripts/modules/rosary.js` | Interactive rosary with bead visualization |
| `scripts/modules/exam.js` | Guided conscience examination |
| `scripts/modules/music.js` | YouTube/Spotify player with relay iframe workaround |
| `scripts/modules/tasks.js` | Task/intention management |
| `scripts/modules/prayers.js` | Prayer library with full-text search |
| `scripts/modules/settings.js` | User preferences UI |
| `scripts/utils.js` | Shared utilities: i18n, storage helpers, UI helpers |

### Storage
- `chrome.storage.local` — persistent user data (blocker config, playlists, tasks, focus sessions, settings)
- `chrome.storage.session` — ephemeral (e.g., `ora_bg_loaded` to prevent duplicate loading screens)
- Notable keys: `ora_pomodoro_state`, `blocker_config`, `blocker_sites`, `ora_settings`, `liturgy_gospel_cache`

### i18n
Use the global `t(key, params?)` function from `utils.js`. Keys use dot-notation (`t('header.liturgy')`). Locale files are in `/data/i18n/` (pt.json, en.json, es.json). Always use `t()` for any user-visible string.

### External APIs
- `https://liturgia.up.railway.app/v2/` — Daily gospel (cached in storage)
- Unsplash — Daily background images
- YouTube (via `youtube-nocookie`) and Spotify (via iframe embeds)
- **Note:** YouTube embeds use a relay iframe hosted on GitHub Pages to work around CORS

### Styling
CSS is organized under `styles/` into `base/`, `components/`, `layout/`, `modules/`, and `utils/`. Design tokens (from `prototypes/00-sistema.html`) live in `styles/base/variables.css`; V1 components in `styles/components/ui.css`; shell layout in `styles/layout/shell.css`. Fonts are bundled locally (`assets/fonts/`, declared in `styles/base/fonts.css`): Cinzel for brand/clock, Montserrat for UI, Literata for reading. Design language: glassmorphism with delimited roles (glass for navigation over the photo, solid for organizing, read surfaces for long text). Legacy class names that collide with V1 components keep the legacy meaning until that screen is replaced (the V1 switch is `.toggle`).
