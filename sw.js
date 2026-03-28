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

async function refreshGospelCache() {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Check if cache is already up-to-date
    try {
        const data = await chrome.storage.local.get([GOSPEL_CACHE_KEY]);
        const cached = data[GOSPEL_CACHE_KEY];
        if (cached && cached.date === todayStr) {
            console.log('[SW Gospel] Cache already up-to-date for', todayStr);
            return;
        }
    } catch (e) { /* proceed to fetch */ }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(LITURGY_API, { signal: controller.signal });
        clearTimeout(timeoutId);
        const json = await resp.json();
        const gospelEntry = json.leituras?.evangelho?.[0];
        if (gospelEntry) {
            const gospel = {
                date: todayStr,
                text: (gospelEntry.texto || '').replace(/\n+/g, ' ').trim(),
                ref: gospelEntry.referencia || '',
                titulo: gospelEntry.titulo || '',
                liturgia: json.liturgia || ''
            };
            await chrome.storage.local.set({ [GOSPEL_CACHE_KEY]: gospel });
            console.log('[SW Gospel] Cache refreshed for', todayStr, '—', gospel.ref);
        }
    } catch (e) {
        console.error('[SW Gospel] Failed to refresh cache:', e);
    }
}

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
        settings: { 
            focus: 25, 
            pause: 5, 
            longPause: 15,
            sound: true,
            autoNext: false,
            continuousAlarm: false,
            wakeLock: false
        }
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
                state.pomodoroCount = 0; // Reset Pomodoro dots count
                // Try to load today's total from legacy key
                const legacyTotal = await chrome.storage.local.get([currentKey]);
                if (legacyTotal[currentKey]) {
                    state.totalFocusSeconds = parseInt(legacyTotal[currentKey]) || 0;
                }
                // Persist the rollover immediately so open tabs detect the change
                chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
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
                defaultState.settings = { ...defaultState.settings, ...oldSettings };
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
    // ── Bloqueador: recuperar URL original completa ──
    if (message && message.action === 'get_original_url') {
        const tabId = sender?.tab?.id;
        const url = tabId ? originalUrls.get(tabId) : null;
        sendResponse({ url });
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
                        longPause: Math.max(1, Math.min(60, settings.longPause || 15)),
                        sound: settings.sound !== undefined ? settings.sound : true,
                        autoNext: settings.autoNext !== undefined ? settings.autoNext : false,
                        continuousAlarm: settings.continuousAlarm !== undefined ? settings.continuousAlarm : false,
                        wakeLock: settings.wakeLock !== undefined ? settings.wakeLock : false
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

        if (state.settings.autoNext) {
            // Auto-start next phase
            state.isRunning = true;
            state.expectedEndTime = Date.now() + (state.timeRemaining * 1000);
            await saveState(state);
            await startAlarm(state);
        } else {
            // Pause and wait for manual start
            state.isRunning = false;
            state.expectedEndTime = null;
            await saveState(state);
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
});

// ============================================================
// SITE BLOCKER BACKGROUND LOGIC
// ============================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
    // Handle Gospel daily refresh
    if (alarm.name === GOSPEL_ALARM) {
        await refreshGospelCache();
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

const BLOCKER_ALIASES = {
    'gmail.com':          ['mail.google.com'],
    'mail.google.com':    ['gmail.com'],
    'twitter.com':        ['x.com'],
    'x.com':              ['twitter.com'],
    'facebook.com':       ['fb.com', 'www.facebook.com'],
    'fb.com':             ['facebook.com'],
    'instagram.com':      ['www.instagram.com'],
    'reddit.com':         ['old.reddit.com', 'www.reddit.com', 'new.reddit.com'],
    'old.reddit.com':     ['reddit.com'],
};

// Global exceptions for Google OAuth (so it doesn't break when YouTube etc. is blocked)
const AUTH_WHITELIST_REGEXES = [
    /^https?:\/\/(www\.)?youtube\.com\/(signin|accounts|account_redirect)/i,
    /^https?:\/\/accounts\.youtube\.com/i,
    /^https?:\/\/(www\.)?google\.com\/(signin|accounts|account_redirect|ServiceLogin)/i,
    /^https?:\/\/accounts\.google\.com/i
];

function isAuthWhitelist(url) {
    return AUTH_WHITELIST_REGEXES.some(re => re.test(url));
}

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

// ── Helper: check if a hostname matches a site or its aliases ──
function matchesSiteOrAlias(hostname, site) {
    const candidates = [site.url, ...(BLOCKER_ALIASES[site.url] || [])];
    for (const d of candidates) {
        if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
    return false;
}

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
    if (isAuthWhitelist(details.url)) return;

    try {
        const cfg = _blockerCfg || (await chrome.storage.local.get(['blocker_config'])).blocker_config;
        if (!cfg || !cfg.enabled || !cfg.sites || cfg.sites.length === 0) return;

        const url = new URL(details.url);
        const hostname = url.hostname.replace(/^www\./, '');

        // Find matching blocked site
        let matchedSite = null;
        for (const site of cfg.sites) {
            if (matchesSiteOrAlias(hostname, site)) {
                matchedSite = site;
                break;
            }
        }
        if (!matchedSite) return;

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
            + '?domain=' + encodeURIComponent(matchedSite.url)
            + '&url=' + encodeURIComponent(details.url);
        chrome.tabs.update(details.tabId, { url: blockedUrl });
        console.log(`[Blocker Fallback] Redirected tab ${details.tabId} from ${hostname} to blocked page`);
    } catch (e) {
        console.error('[Blocker Fallback] Error:', e);
    }
});
