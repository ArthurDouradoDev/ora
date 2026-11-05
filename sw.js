// Shared logic (scripts/shared/*-core.js) — single source of truth
// also used by the extension pages and the test suite.
importScripts(
    'scripts/shared/blocker-core.js',
    'scripts/shared/pomodoro-core.js',
    'scripts/shared/tasks-core.js',
    'scripts/shared/sessions-core.js',
    'scripts/shared/migrate-core.js',
    'scripts/shared/liturgy-core.js'
);

const CACHE_NAME = 'ora-cache-v1';

// Only precache external assets if needed. 
// Local extension files are already fast and 'cache.addAll' often fails with chrome-extension:// scheme.
const PRECACHE_URLS = [
    // Add external static assets here if you want them to be available offline immediately
    // e.g. 'https://fonts.googleapis.com/...' (though usually better to cache on demand)
];

// ============================================================
// GOSPEL DAILY REFRESH — Proactive cache update
// ============================================================
const GOSPEL_CACHE_KEY = 'liturgy_gospel_cache';
const LITURGY_API = 'https://liturgia.up.railway.app/v2/';
const GOSPEL_ALARM = 'gospel_daily_refresh';

let gospelRefresh = null;
async function fetchLiturgyJSON(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Liturgy HTTP ${response.status}`);
    return response.json();
}
function refreshGospelCache() {
    if (gospelRefresh) return gospelRefresh;
    gospelRefresh = (async () => {
        const now = new Date(), dates = LiturgyCore.days(now), updates = {};
        const stored = await chrome.storage.local.get(GOSPEL_CACHE_KEY), cache = stored[GOSPEL_CACHE_KEY];
        const missingPT = dates.filter(date => !LiturgyCore.read(cache,date,'pt')?.text);
        if (missingPT.length) {
            try {
                const json = await fetchLiturgyJSON(LITURGY_API + '?periodo=7');
                const entries = Array.isArray(json) ? json : [json];
                for (const entry of entries) {
                    const date = String(entry.data || '').split('/').reverse().join('-');
                    if (!dates.includes(date)) continue;
                    const pt = LiturgyCore.normalizePT(entry,date);
                    if (pt) updates[date] = { pt };
                }
            } catch (err) { console.warn('[SW Gospel] Seven-day feed unavailable:',err.message); }
            // A partial feed must not leave holes. Fetch missing dates individually.
            for (const date of missingPT) {
                if (updates[date]?.pt) continue;
                try {
                    const pt = LiturgyCore.normalizePT(await fetchLiturgyJSON(LiturgyCore.source('pt',date).api),date);
                    if (pt) updates[date] = { ...updates[date],pt };
                } catch (err) { console.warn('[SW Gospel]',date,err.message); }
            }
        }
        // References only; no English/Spanish copyrighted Gospel text is copied.
        // Requests are bounded in batches so this refresh coexists with timer alarms.
        for (let i = 0; i < dates.length; i += 3) {
            await Promise.all(dates.slice(i,i + 3).map(async date => {
                if (LiturgyCore.read(cache,date,'en')?.liturgia) return;
                try {
                    const source = LiturgyCore.source('en',date);
                    const [readings,calendar] = await Promise.all([
                        fetchLiturgyJSON(source.api),fetchLiturgyJSON(source.calendar).catch(() => null)
                    ]);
                    const en = LiturgyCore.normalizeEN(readings,calendar,date);
                    if (en) updates[date] = { ...updates[date],en };
                } catch (err) { console.warn('[SW Gospel EN]',date,err.message); }
            }));
        }
        if (Object.keys(updates).length) {
            // Merge with the latest snapshot, preserving successful entries on partial/network failure.
            const latest = (await chrome.storage.local.get(GOSPEL_CACHE_KEY))[GOSPEL_CACHE_KEY];
            await chrome.storage.local.set({ [GOSPEL_CACHE_KEY]:LiturgyCore.merge(latest,updates,now) });
        }
        return { success:true };
    })().finally(() => { gospelRefresh = null; });
    return gospelRefresh;
}

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(GOSPEL_ALARM,{ periodInMinutes:60 });
    refreshGospelCache().catch(err => console.warn('[SW Gospel]',err));
    ensureMigrated().then(() => syncBlockerRules()).catch(err => console.warn('[SW Blocker]', err));
});
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(GOSPEL_ALARM,{ periodInMinutes:60 });
    refreshGospelCache().catch(err => console.warn('[SW Gospel]',err));
    ensureMigrated().then(() => syncBlockerRules()).catch(err => console.warn('[SW Blocker]', err));
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
    if (message?.type !== 'liturgy:refresh') return;
    refreshGospelCache().then(sendResponse).catch(err => sendResponse({error:err.message}));
    return true;
});

// ============================================================
// DATA MIGRATION (1.1.5 / 1.2.0 → schema 2)
// ============================================================
// Runs here and in ora.html (main.js); both are idempotent. The SW must
// migrate before the pomodoro day rollover purges old ora_focus_total_* keys.
let migrationPromise = null;

function ensureMigrated() {
    if (!migrationPromise) {
        migrationPromise = (async () => {
            const snapshot = await chrome.storage.local.get(null);
            if (!MigrateCore.needsMigration(snapshot)) return;
            const result = MigrateCore.migrate(snapshot);
            await chrome.storage.local.set(result.changes);
            if (result.removals.length) await chrome.storage.local.remove(result.removals);
            console.log('[SW Migrate] Schema', result.schemaVersion, '—', Object.keys(result.changes).length, 'keys written,', result.removals.length, 'removed');
        })().catch(e => {
            console.error('[SW Migrate] Failed:', e);
            migrationPromise = null; // retry on the next call
        });
    }
    return migrationPromise;
}

chrome.runtime.onInstalled.addListener(() => {
    ensureMigrated();
});

self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('[Service Worker] Install');
    // Set up repeating alarm for gospel refresh (every 60 minutes)
    chrome.alarms.create(GOSPEL_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
    // Fetch gospel immediately on install
    event.waitUntil(refreshGospelCache());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Ensure gospel alarm exists and refresh cache on activate
    chrome.alarms.get(GOSPEL_ALARM, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(GOSPEL_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
        }
    });
    event.waitUntil(refreshGospelCache());
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Filter: Only cache HTTP/HTTPS (External resources)
    // Ignore chrome-extension://, data:, etc.
    if (!requestUrl.protocol.startsWith('http')) {
        return; 
    }

    // Strategy: Stale-While-Revalidate for external static assets (Fonts, Icons, etc.)
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Check if we received a valid response
                    // Note: Chrome extensions have CORS limitations. 
                    // 'opaque' responses (status 0) from no-cors requests can be cached but limit JS access.
                    // For fonts/images it's usually fine.
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                         cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch((err) => {
                    // Network failed
                    console.log('[SW] Network fetch failed for', event.request.url, err);
                    return cachedResponse; 
                });
                return cachedResponse || fetchPromise;
            });
        })
    );
});

// ============================================================
// POMODORO TIMER ENGINE
// ============================================================

const POMODORO_ALARM = 'ora-pomodoro-tick';
const POMODORO_STATE_KEY = 'ora_pomodoro_state';

function getTodayKey() {
    return PomodoroCore.todayKey(new Date());
}

function getDefaultState() {
    return PomodoroCore.createState(PomodoroCore.getDefaultSettings(), new Date());
}

const getPhaseDuration = PomodoroCore.getPhaseDuration;

// ── Focus sessions (ora_sessions) ──
// The SW owns the session record: it is the only place that sees a focus
// phase start, pause, finish or end early, even with no Ora tab open.
const SESSIONS_KEY = 'ora_sessions';
const ACTIVE_TASK_KEY = 'ora_active_task_id';
const TASKS_KEY = 'ora_tasks';

async function recordSession(record) {
    if (!record || !(record.focusedMin >= 1)) return;
    try {
        const data = await chrome.storage.local.get([SESSIONS_KEY]);
        const sessions = SessionsCore.appendSession(data[SESSIONS_KEY] || [], record);
        await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
        console.log(`[SW Sessions] Recorded ${record.status} session: ${record.focusedMin} min`);
    } catch (e) {
        console.error('[SW Sessions] Failed to record session:', e);
    }
}

// Seconds of the current focus phase already elapsed (paused time excluded)
function elapsedFocusSeconds(state, now) {
    const remaining = state.isRunning && state.expectedEndTime
        ? Math.max(0, Math.ceil((state.expectedEndTime - now) / 1000))
        : state.timeRemaining;
    return Math.max(0, state.totalDuration - remaining);
}

// Called right before a focus phase starts running. Resumes the paused
// session or opens a new one linked to the active task (if any).
async function beginOrResumeSession(state, message, now) {
    if (state.phase !== 'focus') return;
    if (state.session) {
        state.session = SessionsCore.resume(state.session, now);
        return;
    }

    const explicitTask = !!message && Object.prototype.hasOwnProperty.call(message, 'taskId');
    let taskId = explicitTask ? message.taskId : null;
    let intention = message && typeof message.intention === 'string' ? message.intention : undefined;
    try {
        const data = await chrome.storage.local.get([ACTIVE_TASK_KEY, TASKS_KEY]);
        if (!explicitTask) taskId = data[ACTIVE_TASK_KEY] || null;
        const task = taskId ? (data[TASKS_KEY] || []).find(t => t && t.id === taskId) : null;
        if (!task) taskId = null;
        // The task's suggested intention is copied, never linked
        if (intention === undefined && task && task.intention) intention = task.intention;
    } catch (e) { /* session without task */ }

    state.session = SessionsCore.startSession({
        id: 'session-' + now,
        taskId,
        intention,
        plannedMin: Math.round(state.totalDuration / 60),
        // A focus phase begun before this version has no session yet
        alreadyFocusedMs: elapsedFocusSeconds(state, now) * 1000,
        now
    });
}

// The session of a focus phase begun before schema 2, rebuilt from the timer.
function legacySession(state, now) {
    const elapsed = elapsedFocusSeconds(state, now);
    if (state.phase !== 'focus' || elapsed <= 0) return null;
    return SessionsCore.startSession({
        id: 'session-' + now,
        plannedMin: Math.round(state.totalDuration / 60),
        alreadyFocusedMs: elapsed * 1000,
        paused: true,
        now
    });
}

function pauseSession(state, now) {
    if (state.session) state.session = SessionsCore.pause(state.session, now);
}

// Ends the current focus session: 'completed' when the phase ran out,
// 'interrupted' when the person stopped early (counts the minutes focused).
// Must run before the timer fields are reset.
async function endSession(state, kind, now) {
    const session = state.session || legacySession(state, now);
    state.session = null;
    if (!session) return null;
    const record = kind === 'completed'
        ? SessionsCore.finishSession(session, now)
        : SessionsCore.interruptSession(session, now);
    await recordSession(record);
    return record;
}

// ── Protection during a focus session ──
// "Bloquear distrações" on the preparation turns the blocker on for the
// session when it is off, and puts it back as it was when the session ends
// (a contemplative pause that was running keeps its re-enable time). When
// the blocker was already on, the session only records that it is protected.
async function claimProtection(state, wanted) {
    state.protection = null;
    if (!wanted) return;
    try {
        const data = await chrome.storage.local.get(['blocker_config']);
        const cfg = data.blocker_config;
        const profiles = BlockerCore.profilesFromConfig(cfg);
        const sites = BlockerCore.flattenSites(profiles);
        if (!cfg || !sites.length) return;
        if (cfg.enabled) {
            state.protection = { active: true, owned: false };
            return;
        }
        const restoreReenableAt = cfg.reenableAt || null;
        const next = Object.assign({}, cfg, { enabled: true, reenableAt: null });
        await chrome.storage.local.set({ blocker_config: next });
        await chrome.alarms.clear(BLOCKER_REENABLE_ALARM);
        state.protection = { active: true, owned: true, restoreReenableAt };
        console.log('[SW Focus] Protection turned on for the session');
    } catch (e) {
        console.error('[SW Focus] Could not turn protection on:', e);
    }
}

async function releaseProtection(state) {
    const protection = state.protection;
    state.protection = null;
    if (!protection || !protection.owned) return;
    try {
        const data = await chrome.storage.local.get(['blocker_config']);
        const cfg = data.blocker_config;
        if (!cfg || !cfg.enabled) return;
        const reenableAt = protection.restoreReenableAt;
        // A pause that already expired during the session: the blocker stays on
        if (reenableAt && reenableAt <= Date.now()) return;
        const next = Object.assign({}, cfg, { enabled: false, reenableAt: reenableAt || null });
        await chrome.storage.local.set({ blocker_config: next });
        if (reenableAt) await chrome.alarms.create(BLOCKER_REENABLE_ALARM, { when: reenableAt });
        console.log('[SW Focus] Protection restored after the session');
    } catch (e) {
        console.error('[SW Focus] Could not restore protection:', e);
    }
}

function normalizeState(stored) {
    const state = Object.assign(getDefaultState(), stored);
    state.settings = PomodoroCore.sanitizeSettings(stored.settings);
    if (!stored.phase) {
        state.timeRemaining = getPhaseDuration('focus', state.settings);
        state.totalDuration = state.timeRemaining;
    }
    if (!state.session || typeof state.session !== 'object') state.session = null;
    return state;
}

async function loadState() {
    try {
        await ensureMigrated();
        const data = await chrome.storage.local.get([POMODORO_STATE_KEY]);
        const stored = data[POMODORO_STATE_KEY];
        if (stored && typeof stored === 'object') {
            const state = normalizeState(stored);
            // Ensure todayKey is current (handles day rollover)
            const currentKey = getTodayKey();
            const now = Date.now();
            const before = Object.assign({}, state);
            if (PomodoroCore.applyDayRollover(state, currentKey, now)) {
                // Timer fields were reset (unless a session is genuinely running
                // across midnight) — drop the stale wakeup alarm too.
                if (!state.isRunning) {
                    chrome.alarms.clear(POMODORO_ALARM);
                    // Yesterday's session is closed with what was really focused
                    if (before.session) {
                        const ranOut = before.isRunning && before.expectedEndTime && before.expectedEndTime <= now;
                        await endSession(before, ranOut ? 'completed' : 'interrupted', ranOut ? before.expectedEndTime : now);
                    }
                    state.session = null;
                    await releaseProtection(state);
                }

                // Try to load today's total from legacy key
                const legacyTotal = await chrome.storage.local.get([currentKey]);
                if (legacyTotal[currentKey]) {
                    state.totalFocusSeconds = parseInt(legacyTotal[currentKey]) || 0;
                }
                // Persist the rollover immediately so open tabs detect the change
                chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });

                // Purge focus-total keys from previous days (already turned
                // into ora_sessions by ensureMigrated above)
                chrome.storage.local.get(null).then(all => {
                    const stale = Object.keys(all).filter(k => k.startsWith('ora_focus_total_') && k !== currentKey);
                    if (stale.length) chrome.storage.local.remove(stale);
                });
            }
            return state;
        }

        // First load — migrate old settings if they exist
        const defaultState = getDefaultState();
        const migration = await chrome.storage.local.get(['ora_focus_settings', defaultState.todayKey]);

        if (migration['ora_focus_settings']) {
            try {
                const oldSettings = typeof migration['ora_focus_settings'] === 'string'
                    ? JSON.parse(migration['ora_focus_settings'])
                    : migration['ora_focus_settings'];
                defaultState.settings = PomodoroCore.sanitizeSettings(oldSettings);
                defaultState.timeRemaining = getPhaseDuration(defaultState.phase, defaultState.settings);
                defaultState.totalDuration = defaultState.timeRemaining;
            } catch (e) { /* use defaults */ }
        }

        if (migration[defaultState.todayKey]) {
            defaultState.totalFocusSeconds = parseInt(migration[defaultState.todayKey]) || 0;
        }

        return defaultState;
    } catch (e) {
        console.error('[SW Pomodoro] Error loading state:', e);
    }
    return getDefaultState();
}

async function saveState(state) {
    try {
        await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
        // Also save today's focus total under its own key for backward compatibility
        await chrome.storage.local.set({ [state.todayKey]: state.totalFocusSeconds.toString() });
    } catch (e) {
        console.error('[SW Pomodoro] Error saving state:', e);
    }
}

const advancePhase = PomodoroCore.advancePhase;

async function startAlarm(state) {
    // Use chrome.alarms for background wakeup
    // delayInMinutes minimum is ~0.5 in dev, 1 in production
    // We use a 30-second alarm as a safety net; the actual time tracking
    // is based on expectedEndTime timestamps, so precision isn't needed here
    const remainingSec = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
    
    // If less than 60 seconds remain, use the minimum alarm delay
    // The alarm is just a wakeup mechanism — real time is calculated from expectedEndTime
    const delayMinutes = Math.max(0.5, remainingSec / 60);
    
    await chrome.alarms.create(POMODORO_ALARM, { delayInMinutes: Math.min(delayMinutes, 1) });
    console.log(`[SW Pomodoro] Alarm set for ${Math.min(delayMinutes, 1).toFixed(2)} min (${remainingSec}s remaining)`);
}

async function clearAlarm() {
    await chrome.alarms.clear(POMODORO_ALARM);
}

// Notify all tabs that a phase completed (so they can play tone)
async function notifyPhaseComplete(phase) {
    try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
            client.postMessage({ type: 'pomodoro:phaseComplete', phase });
        }
    } catch (e) {
        console.error('[SW Pomodoro] Error notifying clients:', e);
    }
}

// --- Message Handler ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ── Bloqueador: recuperar URL original completa ──
    if (message && message.action === 'get_original_url') {
        const tabId = sender?.tab?.id;
        const url = tabId ? originalUrls.get(tabId) : null;
        sendResponse({ url });
        return true; 
    }

    // ── Bloqueador: sincronização de regras e alarme de transição ──
    if (message && message.action === 'blocker:sync') {
        syncBlockerRules().then(() => sendResponse({ success: true })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Bloqueador: desativação temporizada (reativação automática) ──
    if (message && (message.action === 'blocker_schedule_reenable' || message.action === 'blocker:scheduleReenable')) {
        const when = message.reenableAt || message.when;
        const handle = async () => {
            if (typeof when === 'number' && when > Date.now()) {
                await chrome.alarms.create(BLOCKER_REENABLE_ALARM, { when });
                console.log(`[Blocker] Re-enable scheduled for ${new Date(when).toLocaleString()}`);
            }
            await syncBlockerRules();
        };
        handle().then(() => sendResponse({ success: true })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (message && (message.action === 'blocker_cancel_reenable' || message.action === 'blocker:cancelReenable')) {
        const handle = async () => {
            await chrome.alarms.clear(BLOCKER_REENABLE_ALARM);
            await syncBlockerRules();
        };
        handle().then(() => sendResponse({ success: true })).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // ── Bloqueador: configurar alarme de revogação de acesso temporário ──
    if (message && message.action === 'setup_revoke_alarm') {
        const { ruleId, durationMinutes } = message;
        const tabId = sender?.tab?.id;

        const handle = async () => {
            // Safety net: alarm revokes the rule after the session duration
            if (durationMinutes > 0 && durationMinutes !== Infinity) {
                await chrome.alarms.create(`blocker_revoke_${ruleId}`, { delayInMinutes: durationMinutes });
            }
            // Tab-based: also track which tab owns this allow rule so we can
            // revoke it immediately when the user closes that tab
            if (tabId) {
                const data = await chrome.storage.session.get('blocker_sessions');
                const sessions = data.blocker_sessions || {};
                sessions[tabId] = ruleId;
                await chrome.storage.session.set({ blocker_sessions: sessions });
            }
        };

        handle().then(() => sendResponse({ success: true }));
        return true; // keep channel open for async response
    }

    // ── Pomodoro ──
    if (!message || !message.type || !message.type.startsWith('pomodoro:')) return false;

    const handler = async () => {
        let state = await loadState();

        switch (message.type) {
            case 'pomodoro:start': {
                if (state.isRunning) return state;
                await beginOrResumeSession(state, message, Date.now());
                state.isRunning = true;
                state.expectedEndTime = Date.now() + (state.timeRemaining * 1000);
                await saveState(state);
                await syncBlockerRules(state);
                await startAlarm(state);
                return state;
            }

            // Preparation done: a new focus session with the chosen activity,
            // duration, intention and protection, from any phase.
            case 'pomodoro:startFocus': {
                const now = Date.now();
                if (state.session) {
                    await endSession(state, 'interrupted', now);
                    await releaseProtection(state);
                }
                PomodoroCore.prepareFocus(state, message.minutes);
                state.session = SessionsCore.startSession({
                    id: 'session-' + now,
                    taskId: message.taskId || null,
                    title: message.title,
                    intention: message.intention,
                    plannedMin: Math.round(state.totalDuration / 60),
                    now
                });
                await claimProtection(state, message.protect === true);
                state.isRunning = true;
                state.expectedEndTime = now + (state.timeRemaining * 1000);
                await saveState(state);
                await syncBlockerRules(state);
                await startAlarm(state);
                return state;
            }

            // Start the break offered after a focus session (long break: minutes editable)
            case 'pomodoro:startBreak': {
                if (state.isRunning || !PomodoroCore.isBreak(state.phase)) return state;
                if (message.minutes) PomodoroCore.prepareBreak(state, message.minutes);
                state.isRunning = true;
                state.expectedEndTime = Date.now() + (state.timeRemaining * 1000);
                await saveState(state);
                await startAlarm(state);
                return state;
            }

            // "Encerrar sessão": the focused minutes count; back to rest
            case 'pomodoro:interrupt': {
                const now = Date.now();
                if (state.phase === 'focus') {
                    if (state.isRunning) {
                        const remaining = Math.max(0, Math.ceil((state.expectedEndTime - now) / 1000));
                        state.totalFocusSeconds += Math.max(0, state.timeRemaining - remaining);
                    }
                    await endSession(state, 'interrupted', now);
                }
                await releaseProtection(state);
                PomodoroCore.resetToIdle(state);
                await clearAlarm();
                await saveState(state);
                await syncBlockerRules(state);
                return state;
            }

            // "Voltar ao início" (after a session) or "Encerrar pausa"
            case 'pomodoro:home': {
                if (state.phase === 'focus' && state.session) return state; // use interrupt
                await releaseProtection(state);
                PomodoroCore.resetToIdle(state);
                await clearAlarm();
                await saveState(state);
                await syncBlockerRules(state);
                return state;
            }

            case 'pomodoro:pause': {
                if (!state.isRunning) return state;
                pauseSession(state, Date.now());
                state.isRunning = false;
                // Calculate accurate remaining time
                const remaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
                // Accumulate focus seconds for the elapsed portion
                if (state.phase === 'focus') {
                    const elapsed = state.timeRemaining - remaining;
                    state.totalFocusSeconds += elapsed;
                }
                state.timeRemaining = remaining;
                state.expectedEndTime = null;
                await clearAlarm();
                await saveState(state);
                return state;
            }

            case 'pomodoro:reset': {
                // Restarting the phase ends the session early (minutes count)
                if (state.phase === 'focus') await endSession(state, 'interrupted', Date.now());
                const wasRunning = state.isRunning;
                if (wasRunning && state.phase === 'focus') {
                    // Save accumulated focus time before reset
                    const remaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
                    const elapsed = state.timeRemaining - remaining;
                    state.totalFocusSeconds += elapsed;
                }
                state.isRunning = false;
                state.expectedEndTime = null;
                state.timeRemaining = getPhaseDuration(state.phase, state.settings);
                state.totalDuration = state.timeRemaining;
                await clearAlarm();
                await saveState(state);
                await syncBlockerRules(state);
                return state;
            }

            case 'pomodoro:skip': {
                if (state.phase === 'focus') await endSession(state, 'interrupted', Date.now());
                const wasRunning = state.isRunning;
                if (wasRunning && state.phase === 'focus') {
                    const remaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
                    const elapsed = state.timeRemaining - remaining;
                    state.totalFocusSeconds += elapsed;
                }
                state.isRunning = false;
                state.expectedEndTime = null;
                await clearAlarm();
                state = advancePhase(state);
                await saveState(state);
                await syncBlockerRules(state);
                return state;
            }

            case 'pomodoro:updateSettings': {
                const { settings } = message;
                if (settings) {
                    state.settings = PomodoroCore.sanitizeSettings(Object.assign({}, state.settings, settings));
                    // If not running, update current phase duration
                    if (!state.isRunning) {
                        // A paused focus session restarts with the new duration
                        if (state.phase === 'focus' && state.session) await endSession(state, 'interrupted', Date.now());
                        state.timeRemaining = getPhaseDuration(state.phase, state.settings);
                        state.totalDuration = state.timeRemaining;
                    }
                    await saveState(state);
                }
                return state;
            }

            case 'pomodoro:tick': {
                await advancePomodoroIfDue();
                state = await loadState();
                if (state.isRunning && state.expectedEndTime) {
                    state.timeRemaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
                }
                return state;
            }

            case 'pomodoro:getState': {
                // Recalculate timeRemaining if running
                if (state.isRunning && state.expectedEndTime) {
                    state.timeRemaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
                }
                return state;
            }

            case 'pomodoro:setSessionTask': {
                // The active task changed during a focus session
                if (state.session) {
                    state.session = Object.assign({}, state.session, { taskId: message.taskId || null });
                    await saveState(state);
                }
                return state;
            }

            case 'pomodoro:close': {
                // Timer closed by user — pause and save (the session stays paused)
                pauseSession(state, Date.now());
                if (state.isRunning && state.phase === 'focus') {
                    const remaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
                    const elapsed = state.timeRemaining - remaining;
                    state.totalFocusSeconds += elapsed;
                }
                state.isRunning = false;
                state.expectedEndTime = null;
                await clearAlarm();
                await saveState(state);
                return state;
            }

            default:
                return state;
        }
    };

    handler().then(state => sendResponse({ state })).catch(err => {
        console.error('[SW Pomodoro] Handler error:', err);
        sendResponse({ error: err.message });
    });

    return true; // Keep message channel open for async response
});

// --- Alarm Handler ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== POMODORO_ALARM) return;
    await advancePomodoroIfDue();
});

// Closes the running phase when its time is up. Called by the alarm and by
// an open tab whose countdown reached zero ('pomodoro:tick'): the alarm may
// wake up to 30 s late. Serialized so a phase never completes twice.
let pomodoroTickPromise = null;
function advancePomodoroIfDue() {
    if (!pomodoroTickPromise) {
        pomodoroTickPromise = runPomodoroTick().finally(() => { pomodoroTickPromise = null; });
    }
    return pomodoroTickPromise;
}

async function runPomodoroTick() {
    let state = await loadState();
    if (!state.isRunning || !state.expectedEndTime) return;

    const now = Date.now();
    const remainingMs = state.expectedEndTime - now;
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

    if (remainingSec <= 0) {
        // Phase complete!
        // Accumulate focus seconds for the elapsed portion
        if (state.phase === 'focus') {
            state.totalFocusSeconds += state.timeRemaining; // full phase elapsed
            const session = state.session;
            const record = await endSession(state, 'completed', state.expectedEndTime);
            // Shown by Hoje until the person chooses how to continue (E12)
            state.completed = PomodoroCore.completedSummary(session, record);
            await releaseProtection(state);
        } else {
            state.completed = null;
        }

        const completedPhase = state.phase;
        state = advancePhase(state);

        if (state.settings.autoNext) {
            // Auto-start next phase
            await beginOrResumeSession(state, null, Date.now());
            state.isRunning = true;
            state.expectedEndTime = Date.now() + (state.timeRemaining * 1000);
            await saveState(state);
            await syncBlockerRules(state);
            await startAlarm(state);
        } else {
            // Pause and wait for manual start
            state.isRunning = false;
            state.expectedEndTime = null;
            await saveState(state);
            await syncBlockerRules(state);
            await clearAlarm();
        }

        // Notify tabs to play tone and show system notifications
        await notifyPhaseComplete(completedPhase);
    } else {
        // Timer still running — update remaining time in storage and re-schedule
        if (state.phase === 'focus') {
            // Calculate how many seconds passed since last save
            const previousRemaining = state.timeRemaining;
            state.timeRemaining = remainingSec;
            const elapsed = previousRemaining - remainingSec;
            if (elapsed > 0) {
                state.totalFocusSeconds += elapsed;
            }
        } else {
            state.timeRemaining = remainingSec;
        }
        await saveState(state);
        await startAlarm(state);
    }
}

// ============================================================
// SITE BLOCKER BACKGROUND LOGIC
// ============================================================

const BLOCKER_REENABLE_ALARM = 'blocker_reenable';
const BLOCKER_SCHEDULE_ALARM = 'blocker_schedule_transition';

function nextMidnightTimestamp(now = new Date()) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
    return next.getTime();
}

// Rebuild the dynamic block rules from the current profiles and context
// (focus session, schedule window, daily limit, contemplative pause), and
// schedule the next schedule/midnight transition alarm so rules update even
// with no Ora tab open.
async function syncBlockerRules(pomodoroStateOverride) {
    try {
        await ensureMigrated();
        const store = await chrome.storage.local.get(['blocker_config', POMODORO_STATE_KEY, SCREENTIME_KEY]);
        const cfg = store.blocker_config || null;
        const pomo = pomodoroStateOverride || store[POMODORO_STATE_KEY] || null;
        const screentime = store[SCREENTIME_KEY] || {};
        const profiles = BlockerCore.profilesFromConfig(cfg);
        const now = new Date();
        const enabled = Boolean(cfg && cfg.enabled !== false);
        const pausedUntil = cfg && cfg.reenableAt ? cfg.reenableAt : 0;
        const focusActive = Boolean(pomo && pomo.phase === 'focus' && (pomo.isRunning || pomo.session));

        const addRules = BlockerCore.buildRulesFromProfiles(profiles, {
            blockedPageUrl: chrome.runtime.getURL('blocked.html'),
            now,
            enabled,
            pausedUntil,
            focusActive,
            screentime
        });

        const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        // Only remove block rules (IDs < 1000); allow rules (>= 1000) are temporary session grants.
        const oldRuleIds = oldRules.filter(rule => rule.id < 1000).map(rule => rule.id);

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds,
            addRules
        });

        // Schedule next transition alarm (schedule start/end or midnight reset)
        let nextWhen = null;
        if (enabled && profiles.some(p => p && p.enabled !== false)) {
            const info = BlockerCore.nextChangeInfo(profiles, now, {
                enabled,
                pausedUntil,
                focusActive,
                screentime
            });
            if (info && typeof info.at === 'number' && info.at > now.getTime()) {
                nextWhen = info.at;
            }
            const needsMidnight = profiles.some(p =>
                p && p.enabled !== false && p.rules && (
                    (p.rules.dailyLimitMin && p.rules.dailyLimitMin > 0) ||
                    (p.rules.schedule && p.rules.schedule.enabled)
                )
            );
            if (needsMidnight) {
                const midnight = nextMidnightTimestamp(now);
                if (!nextWhen || midnight < nextWhen) nextWhen = midnight;
            }
        }

        if (nextWhen && nextWhen > now.getTime()) {
            await chrome.alarms.create(BLOCKER_SCHEDULE_ALARM, { when: nextWhen });
        } else {
            await chrome.alarms.clear(BLOCKER_SCHEDULE_ALARM);
        }
    } catch (e) {
        console.error('[SW Blocker] Failed to sync blocker rules:', e);
    }
}

async function applyBlockerRulesFromConfig() {
    await syncBlockerRules();
}

async function reenableBlocker() {
    const data = await chrome.storage.local.get(['blocker_config']);
    const cfg = data.blocker_config;
    if (!cfg) return;

    cfg.enabled = true;
    cfg.reenableAt = null;
    await chrome.storage.local.set({ blocker_config: cfg });
    await syncBlockerRules();
    console.log('[Blocker] Pause period ended — blocker re-enabled');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    // Handle Gospel daily refresh
    if (alarm.name === GOSPEL_ALARM) {
        await refreshGospelCache();
        return;
    }

    // Handle Blocker: timed disable expired — turn the blocker back on
    if (alarm.name === BLOCKER_REENABLE_ALARM) {
        await reenableBlocker();
        return;
    }

    // Handle Blocker: schedule window or midnight transition
    if (alarm.name === BLOCKER_SCHEDULE_ALARM) {
        await syncBlockerRules();
        return;
    }

    // Handle Blocker: revoke temporary allow rule when session time expires
    if (alarm.name.startsWith('blocker_revoke_')) {
        const ruleId = parseInt(alarm.name.slice('blocker_revoke_'.length), 10);
        if (!isNaN(ruleId)) {
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
            // Clean up session mapping for this rule
            const data = await chrome.storage.session.get('blocker_sessions');
            const sessions = data.blocker_sessions || {};
            for (const tabId of Object.keys(sessions)) {
                if (sessions[tabId] === ruleId) delete sessions[tabId];
            }
            await chrome.storage.session.set({ blocker_sessions: sessions });
            console.log(`[Blocker] Session expired — revoked allow rule ${ruleId}`);
        }
        return;
    }
});

// ── Blocker: revoke allow rule immediately when the user closes the tab ──
chrome.tabs.onRemoved.addListener(async (tabId) => {
    // Clean up original URL tracking
    originalUrls.delete(tabId);

    const data = await chrome.storage.session.get('blocker_sessions');
    const sessions = data.blocker_sessions || {};
    if (sessions[tabId] !== undefined) {
        const ruleId = sessions[tabId];
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
        delete sessions[tabId];
        await chrome.storage.session.set({ blocker_sessions: sessions });
        console.log(`[Blocker] Tab ${tabId} closed — session ended, revoked rule ${ruleId}`);
    }
});

// ============================================================
// SITE BLOCKER — FALLBACK via webNavigation
// ============================================================
// DNR redirect rules work for most sites, but fail for SPAs like
// Gmail and X/Twitter whose Service Workers intercept requests before
// DNR can act. This listener is the safety net: it fires after
// every committed navigation and redirects the tab if the URL matches
// a blocked domain.

// Aliases / OAuth whitelist now live in BlockerCore (scripts/shared/blocker-core.js)

// ── In-memory cache of blocker config (avoids storage reads on every navigation)
let _blockerCfg = null;

chrome.storage.local.get(['blocker_config']).then(data => {
    _blockerCfg = data.blocker_config || null;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.blocker_config) {
        _blockerCfg = changes.blocker_config.newValue;
    }
});

// ── webNavigation.onBeforeNavigate — Rastreamento de URL original ──
// Quando o DNR bloqueia um site, ele corta o path/query da URL.
// Com esse listener, salvamos a URL exata ANTES do bloqueio acontecer,
// para que a página blocked.html possa oferecer um "Continuar" exato.
const originalUrls = new Map();

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0 && (details.url.startsWith('http://') || details.url.startsWith('https://'))) {
        originalUrls.set(details.tabId, details.url);
    }
});

// ── webNavigation.onCommitted — Fallback Blocker (SPAs, etc.) ──
chrome.webNavigation.onCommitted.addListener(async (details) => {
    // Only process top-level frame navigations
    if (details.frameId !== 0) return;

    // Ignore non-http(s) URLs (extension pages, chrome://, etc.)
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) return;

    // Check auth whitelist so we don't block OAuth redirects
    if (BlockerCore.isAuthWhitelisted(details.url)) return;

    try {
        const store = await chrome.storage.local.get(['blocker_config', POMODORO_STATE_KEY, SCREENTIME_KEY]);
        const cfg = store.blocker_config || _blockerCfg;
        if (!cfg || !cfg.enabled) return;

        const profiles = BlockerCore.profilesFromConfig(cfg);
        if (!profiles.length) return;

        const url = new URL(details.url);
        const hostname = url.hostname.replace(/^www\./, '');

        const pomo = store[POMODORO_STATE_KEY] || null;
        const focusActive = Boolean(pomo && pomo.phase === 'focus' && (pomo.isRunning || pomo.session));
        const hit = BlockerCore.findBlockingProfile(profiles, hostname, {
            enabled: cfg.enabled !== false,
            pausedUntil: cfg.reenableAt || 0,
            focusActive,
            screentime: store[SCREENTIME_KEY] || {}
        }, new Date());
        if (!hit) return;

        // Check if this tab has an active allow session (user clicked "Continue")
        const sessionData = await chrome.storage.session.get('blocker_sessions');
        const sessions = sessionData.blocker_sessions || {};
        if (sessions[details.tabId] !== undefined) return;

        // Also check for active DNR allow rules for this domain
        const allRules = await chrome.declarativeNetRequest.getDynamicRules();
        const hasAllow = allRules.some(r =>
            r.id >= 1000 && r.id < 10000 &&
            r.action?.type === 'allow' &&
            r.condition?.requestDomains?.some(d => hostname === d || hostname.endsWith('.' + d))
        );
        if (hasAllow) return;

        // Redirect to blocked page
        const blockedUrl = chrome.runtime.getURL('blocked.html')
            + '?domain=' + encodeURIComponent(hit.site)
            + '&profile=' + encodeURIComponent(hit.profile.id)
            + '&reason=' + encodeURIComponent(hit.reason || 'focus')
            + '&url=' + encodeURIComponent(details.url);
        chrome.tabs.update(details.tabId, { url: blockedUrl });
        console.log(`[Blocker Fallback] Redirected tab ${details.tabId} from ${hostname} to blocked page`);
    } catch (e) {
        console.error('[Blocker Fallback] Error:', e);
    }
});

// ============================================================
// SCREEN TIME TRACKING — tempo por domínio + reflexão diária
// ============================================================
// Coleta o tempo gasto por domínio (somente aba ativa, janela focada e
// usuário presente) e dispara dois momentos de reflexão por dia (~13h e ~19h)
// via notificação do sistema. Tudo fica no dispositivo; histórico podado a 14 dias.

const SCREENTIME_KEY = 'ora_screentime';
const SCREENTIME_ACTIVE_KEY = 'ora_screentime_active'; // storage.session
const SCREENTIME_MAX_AGE_DAYS = 14;
const SCREENTIME_MAX_DELTA_MS = 2 * 60 * 60 * 1000; // descarta deltas > 2h (sleep/suspensão)
const SCREENTIME_SETTING_KEY = 'ora_reminder_screentime';

const REFLECT_MIDDAY_ALARM = 'screentime_reflect_midday';
const REFLECT_EVENING_ALARM = 'screentime_reflect_evening';
const REFLECT_MIDDAY_HOUR = 13;
const REFLECT_EVENING_HOUR = 19;

const ST_NOTIF_STRINGS = {
    pt: {
        midday: { title: 'Um momento de reflexão', message: 'Como está o seu dia até agora? Toque para ver seu tempo de tela.' },
        evening: { title: 'Um momento de reflexão', message: 'Como foi o seu dia? Toque para revisar seu tempo de tela.' }
    },
    en: {
        midday: { title: 'A moment to reflect', message: 'How is your day going so far? Tap to see your screen time.' },
        evening: { title: 'A moment to reflect', message: 'How was your day? Tap to review your screen time.' }
    },
    es: {
        midday: { title: 'Un momento para reflexionar', message: '¿Cómo va tu día hasta ahora? Toca para ver tu tiempo de pantalla.' },
        evening: { title: 'Un momento para reflexionar', message: '¿Cómo fue tu día? Toca para revisar tu tiempo de pantalla.' }
    }
};

function stDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stExtractDomain(url) {
    try {
        if (!url || !/^https?:\/\//i.test(url)) return null;
        const h = new URL(url).hostname.replace(/^www\./, '');
        return h || null;
    } catch (e) { return null; }
}

async function stGetLocale() {
    try {
        const d = await chrome.storage.local.get(['ora_locale']);
        const loc = d['ora_locale'];
        return (loc === 'en' || loc === 'es') ? loc : 'pt';
    } catch (e) { return 'pt'; }
}

async function stGetActive() {
    try {
        const d = await chrome.storage.session.get(SCREENTIME_ACTIVE_KEY);
        return d[SCREENTIME_ACTIVE_KEY] || null;
    } catch (e) { return null; }
}

async function stSetActive(active) {
    try {
        if (active) await chrome.storage.session.set({ [SCREENTIME_ACTIVE_KEY]: active });
        else await chrome.storage.session.remove(SCREENTIME_ACTIVE_KEY);
    } catch (e) { /* session storage indisponível */ }
}

// Lê o store de tempo de tela já podando dias além do limite.
async function stPruneAndGet() {
    const data = await chrome.storage.local.get([SCREENTIME_KEY]);
    const store = data[SCREENTIME_KEY] || {};
    const cutoff = Date.now() - SCREENTIME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(store)) {
        const t = new Date(k + 'T00:00:00').getTime();
        if (!isNaN(t) && t < cutoff) delete store[k];
    }
    return store;
}

async function stAddSeconds(domain, seconds) {
    if (!domain || seconds <= 0) return;
    const store = await stPruneAndGet();
    const today = stDateStr();
    if (!store[today]) store[today] = { domains: {}, newTabs: 0 };
    if (!store[today].domains) store[today].domains = {};
    store[today].domains[domain] = (store[today].domains[domain] || 0) + seconds;
    await chrome.storage.local.set({ [SCREENTIME_KEY]: store });

    // If an active profile has a daily limit covering this domain and just reached it, sync DNR rules
    try {
        const cfg = _blockerCfg || (await chrome.storage.local.get(['blocker_config'])).blocker_config;
        if (cfg && cfg.enabled) {
            const profiles = BlockerCore.profilesFromConfig(cfg);
            const now = new Date();
            for (const p of profiles) {
                if (!p || p.enabled === false || !p.rules || !(p.rules.dailyLimitMin > 0)) continue;
                const matches = (p.sites || []).some(s => BlockerCore.matchesSiteOrAlias(domain, s));
                if (matches && BlockerCore.profileMinutesUsedToday(p, store, now) >= p.rules.dailyLimitMin) {
                    await syncBlockerRules();
                    break;
                }
            }
        }
    } catch (e) { /* ignore */ }
}

// Liquida a sessão ativa (credita o tempo decorrido) e inicia uma nova.
// newDomain = null apenas pausa (janela sem foco, idle, lock).
async function stFlushAndStart(newDomain) {
    const now = Date.now();
    const active = await stGetActive();
    if (active && active.domain && active.startTime) {
        const deltaMs = now - active.startTime;
        if (deltaMs > 0 && deltaMs < SCREENTIME_MAX_DELTA_MS) {
            await stAddSeconds(active.domain, Math.round(deltaMs / 1000));
        }
    }
    await stSetActive(newDomain ? { domain: newDomain, startTime: now } : null);
}

// Resolve o domínio da aba ativa na janela atualmente focada.
async function stResolveActiveDomain() {
    try {
        const wins = await chrome.windows.getAll({ populate: false });
        const focused = wins.find(w => w.focused);
        if (!focused) return null;
        const tabs = await chrome.tabs.query({ active: true, windowId: focused.id });
        const tab = tabs && tabs[0];
        return tab ? stExtractDomain(tab.url) : null;
    } catch (e) { return null; }
}

async function stOnActivity() {
    const domain = await stResolveActiveDomain();
    await stFlushAndStart(domain);
}

// ── Listeners de atividade ──
chrome.tabs.onActivated.addListener(() => { stOnActivity(); });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab && tab.active) stOnActivity();
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) stFlushAndStart(null);
    else stOnActivity();
});

try { chrome.idle.setDetectionInterval(60); } catch (e) { /* idle indisponível */ }
chrome.idle.onStateChanged.addListener((state) => {
    if (state === 'active') stOnActivity();
    else stFlushAndStart(null); // 'idle' ou 'locked'
});

// ── Alarmes de reflexão (13h / 19h) ──
function stNextOccurrence(hour) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime();
}

async function stEnsureReflectAlarms() {
    const midday = await chrome.alarms.get(REFLECT_MIDDAY_ALARM);
    if (!midday) {
        chrome.alarms.create(REFLECT_MIDDAY_ALARM, { when: stNextOccurrence(REFLECT_MIDDAY_HOUR), periodInMinutes: 1440 });
    }
    const evening = await chrome.alarms.get(REFLECT_EVENING_ALARM);
    if (!evening) {
        chrome.alarms.create(REFLECT_EVENING_ALARM, { when: stNextOccurrence(REFLECT_EVENING_HOUR), periodInMinutes: 1440 });
    }
}
// Garante os alarmes sempre que o SW inicializa (idempotente).
stEnsureReflectAlarms();

async function stIsReflectEnabled() {
    try {
        const d = await chrome.storage.local.get([SCREENTIME_SETTING_KEY]);
        return d[SCREENTIME_SETTING_KEY] !== false; // default: ligado
    } catch (e) { return true; }
}

async function stShownToday(moment) {
    const key = `screentime_reflect_${moment}_${stDateStr()}`;
    const d = await chrome.storage.local.get([key]);
    return d[key] === true;
}

async function stMarkShown(moment) {
    const key = `screentime_reflect_${moment}_${stDateStr()}`;
    await chrome.storage.local.set({ [key]: true });
}

async function stFireReflection(moment) {
    if (!(await stIsReflectEnabled())) return;
    if (await stShownToday(moment)) return;
    await stMarkShown(moment);

    const locale = await stGetLocale();
    const strings = (ST_NOTIF_STRINGS[locale] || ST_NOTIF_STRINGS.pt)[moment];
    try {
        chrome.notifications.create(`ora_reflect_${moment}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icon.png'),
            title: strings.title,
            message: strings.message,
            priority: 2
        });
    } catch (e) {
        console.error('[SW ScreenTime] Failed to create notification:', e);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFLECT_MIDDAY_ALARM) stFireReflection('midday');
    else if (alarm.name === REFLECT_EVENING_ALARM) stFireReflection('evening');
});

// ── Clique na notificação → abre a nova aba já no popup de reflexão ──
chrome.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId.startsWith('ora_reflect_')) return;
    const moment = notificationId.slice('ora_reflect_'.length);
    const url = chrome.runtime.getURL('ora.html') + '?reflect=' + encodeURIComponent(moment);
    chrome.tabs.create({ url });
    chrome.notifications.clear(notificationId);
});

// ── Mensagens da página (contagem de novas abas e relatório) ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type || !message.type.startsWith('screentime:')) return false;

    const handler = async () => {
        switch (message.type) {
            case 'screentime:newtab': {
                const store = await stPruneAndGet();
                const today = stDateStr();
                if (!store[today]) store[today] = { domains: {}, newTabs: 0 };
                store[today].newTabs = (store[today].newTabs || 0) + 1;
                await chrome.storage.local.set({ [SCREENTIME_KEY]: store });
                return { ok: true };
            }

            case 'screentime:getReport': {
                // Liquida a sessão em curso para o relatório refletir o agora.
                await stOnActivity();

                const store = await stPruneAndGet();
                const today = stDateStr();
                const todayData = store[today] || { domains: {}, newTabs: 0 };

                // Média por domínio e total diário médio dos dias anteriores (exclui hoje).
                const prevDays = Object.keys(store).filter(k => k !== today);
                const domainTotals = {};
                let prevTotal = 0;
                for (const k of prevDays) {
                    const doms = store[k].domains || {};
                    for (const d of Object.keys(doms)) {
                        domainTotals[d] = (domainTotals[d] || 0) + doms[d];
                        prevTotal += doms[d];
                    }
                }
                const nPrev = prevDays.length;
                const averages = {};
                for (const d of Object.keys(domainTotals)) {
                    averages[d] = domainTotals[d] / nPrev;
                }
                const avgDailyTotal = nPrev ? prevTotal / nPrev : 0;

                return { today: todayData, averages, avgDailyTotal, prevDaysCount: nPrev };
            }

            default:
                return { ok: false };
        }
    };

    handler().then(res => sendResponse(res)).catch(err => {
        console.error('[SW ScreenTime] Handler error:', err);
        sendResponse({ error: err.message });
    });

    return true; // resposta assíncrona
});
