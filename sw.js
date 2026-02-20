const CACHE_NAME = 'ora-cache-v1';

// Only precache external assets if needed. 
// Local extension files are already fast and 'cache.addAll' often fails with chrome-extension:// scheme.
const PRECACHE_URLS = [
    // Add external static assets here if you want them to be available offline immediately
    // e.g. 'https://fonts.googleapis.com/...' (though usually better to cache on demand)
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('[Service Worker] Install');
    // Skip addAll if array is empty or implementation is risky for local files
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
    return 'ora_focus_total_' + new Date().toDateString();
}

function getDefaultState() {
    return {
        isRunning: false,
        phase: 'focus',
        expectedEndTime: null,
        timeRemaining: 25 * 60,
        totalDuration: 25 * 60,
        pomodoroCount: 0,
        totalFocusSeconds: 0,
        todayKey: getTodayKey(),
        settings: { focus: 25, pause: 5, longPause: 15 }
    };
}

function getPhaseDuration(phase, settings) {
    if (phase === 'focus') return settings.focus * 60;
    if (phase === 'pause') return settings.pause * 60;
    if (phase === 'longPause') return settings.longPause * 60;
    return settings.focus * 60;
}

async function loadState() {
    try {
        const data = await chrome.storage.local.get([POMODORO_STATE_KEY]);
        const state = data[POMODORO_STATE_KEY];
        if (state) {
            // Ensure todayKey is current (handles day rollover)
            const currentKey = getTodayKey();
            if (state.todayKey !== currentKey) {
                state.todayKey = currentKey;
                state.totalFocusSeconds = 0;
                // Try to load today's total from legacy key
                const legacyTotal = await chrome.storage.local.get([currentKey]);
                if (legacyTotal[currentKey]) {
                    state.totalFocusSeconds = parseInt(legacyTotal[currentKey]) || 0;
                }
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
                defaultState.settings = oldSettings;
                defaultState.timeRemaining = getPhaseDuration(defaultState.phase, oldSettings);
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

function advancePhase(state) {
    if (state.phase === 'focus') {
        state.pomodoroCount++;
        if (state.pomodoroCount % 4 === 0) {
            state.phase = 'longPause';
        } else {
            state.phase = 'pause';
        }
    } else {
        state.phase = 'focus';
    }
    state.timeRemaining = getPhaseDuration(state.phase, state.settings);
    state.totalDuration = state.timeRemaining;
    return state;
}

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
    if (!message || !message.type || !message.type.startsWith('pomodoro:')) return false;

    const handler = async () => {
        let state = await loadState();

        switch (message.type) {
            case 'pomodoro:start': {
                if (state.isRunning) return state;
                state.isRunning = true;
                state.expectedEndTime = Date.now() + (state.timeRemaining * 1000);
                await saveState(state);
                await startAlarm(state);
                return state;
            }

            case 'pomodoro:pause': {
                if (!state.isRunning) return state;
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
                return state;
            }

            case 'pomodoro:skip': {
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
                return state;
            }

            case 'pomodoro:updateSettings': {
                const { settings } = message;
                if (settings) {
                    state.settings = {
                        focus: Math.max(1, Math.min(120, settings.focus || 25)),
                        pause: Math.max(1, Math.min(30, settings.pause || 5)),
                        longPause: Math.max(1, Math.min(60, settings.longPause || 15))
                    };
                    // If not running, update current phase duration
                    if (!state.isRunning) {
                        state.timeRemaining = getPhaseDuration(state.phase, state.settings);
                        state.totalDuration = state.timeRemaining;
                    }
                    await saveState(state);
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

            case 'pomodoro:close': {
                // Timer closed by user — pause and save
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
        }

        const completedPhase = state.phase;
        state = advancePhase(state);

        // Auto-start next phase
        state.isRunning = true;
        state.expectedEndTime = Date.now() + (state.timeRemaining * 1000);
        await saveState(state);
        await startAlarm(state);

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
});
