// ============================================================
// SYNC SYSTEM — Cross-device sync via chrome.storage.sync
// ============================================================
// Conservative, last-write-wins sync for the data that makes sense to
// follow the user across machines:
//
//   - Settings        (locale, name, prayer lang, reminder toggles)
//   - Blocker         (site list + lock config — NOT the enabled flag,
//                      NOT daily counters, NOT timed-disable state)
//   - Tasks           (recurring routine only — NOT one-off tasks,
//                      NOT today's done/cycle progress)
//
// Design:
//   - Each group is one sync entry: { v, updatedAt, data }.
//   - `ora_sync_meta` (local) records the last updatedAt applied/pushed per
//     group; pulls are skipped unless the remote entry is newer.
//   - Pushes are debounced and skipped when the sanitized payload is
//     identical to the last pushed/applied one (prevents echo loops).
//   - Merge functions are pure (no chrome.*) so the test suite can cover them.

const SyncSystem = {
    VERSION: 1,
    PUSH_DEBOUNCE_MS: 2500,
    META_KEY: 'ora_sync_meta',

    SETTINGS_KEYS: [
        'ora_locale', 'ora_user_name', 'ora_prayer_lang',
        'ora_reminder_carlo', 'ora_reminder_angelus', 'ora_reminder_mercy',
        'ora_reminder_midday', 'ora_reminder_evening', 'ora_reminder_rosary'
    ],

    _meta: {},
    _lastPushed: {},   // group → JSON string of last pushed/applied payload
    _applying: false,  // true while writing remote data into local storage
    _pushTimers: {},

    // ── Sanitizers (local → sync payload) ─────────────

    sanitizeBlockerConfig(config) {
        if (!config || !Array.isArray(config.sites)) return null;
        return {
            lock: config.lock || { enabled: false, verseIndex: 0, writeUnlockEnabled: false },
            sites: config.sites.map(s => ({
                id: s.id,
                url: s.url,
                mode: s.mode,
                accessLimit: s.accessLimit,
                scheduleLimit: s.scheduleLimit,
                writeUnlockEnabled: !!s.writeUnlockEnabled
            }))
        };
    },

    sanitizeTasks(tasks) {
        if (!Array.isArray(tasks)) return [];
        return tasks
            .filter(t => t.recurring)
            .map(t => ({
                id: t.id,
                text: t.text,
                intention: t.intention || '',
                totalCycles: t.totalCycles || 1,
                recurring: true,
                createdAt: t.createdAt,
                streak: t.streak || 0,
                lastStreakDate: t.lastStreakDate || null
            }));
    },

    // ── Merge functions (remote + local → new local) — pure ──

    mergeBlockerConfig(remote, local) {
        const todayStr = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();

        const localSites = (local && local.sites) || [];
        return {
            // Device-local decisions stay local
            enabled: local ? !!local.enabled : false,
            reenableAt: (local && local.reenableAt) || null,
            lock: remote.lock,
            sites: remote.sites.map(site => {
                const localSite = localSites.find(s => s.url === site.url);
                return {
                    ...site,
                    todayAccesses: localSite ? (localSite.todayAccesses || 0) : 0,
                    lastAccessDate: localSite ? (localSite.lastAccessDate || todayStr) : todayStr
                };
            })
        };
    },

    mergeTasks(remoteRecurring, localTasks) {
        const local = Array.isArray(localTasks) ? localTasks : [];
        const result = [];

        for (const task of local) {
            if (!task.recurring) {
                // One-off tasks are device-local
                result.push(task);
                continue;
            }
            const remote = remoteRecurring.find(r => r.id === task.id);
            if (!remote) continue; // deleted on another device

            // Remote wins for definition fields; today's progress stays local.
            // Streak: keep whichever side has the most recent completion.
            const localStreakNewer = (task.lastStreakDate || '') > (remote.lastStreakDate || '');
            result.push({
                ...task,
                text: remote.text,
                intention: remote.intention,
                totalCycles: remote.totalCycles,
                streak: localStreakNewer ? (task.streak || 0) : (remote.streak || 0),
                lastStreakDate: localStreakNewer ? task.lastStreakDate : remote.lastStreakDate
            });
        }

        // New recurring tasks from the other device
        for (const remote of remoteRecurring) {
            if (!result.some(t => t.id === remote.id)) {
                result.push({
                    ...remote,
                    completedCycles: 0,
                    done: false,
                    completedAt: null
                });
            }
        }

        return result;
    },

    // ── Lifecycle ─────────────────────────────────────

    async init() {
        if (!chrome.storage || !chrome.storage.sync) {
            console.warn('[Sync] chrome.storage.sync unavailable — sync disabled');
            return;
        }

        this._meta = (await chrome.storage.local.get([this.META_KEY]))[this.META_KEY] || {};

        await this.pullAll();
        this.bindLocalPush();
        this.bindRemotePull();

        console.log('[Ora] Sync System initialized');
    },

    async saveMeta() {
        await chrome.storage.local.set({ [this.META_KEY]: this._meta });
    },

    // ── Pull (sync → local) ───────────────────────────

    async pullAll() {
        try {
            const entries = await chrome.storage.sync.get(['sync_settings', 'sync_blocker', 'sync_tasks']);
            if (entries.sync_settings) await this.pullSettings(entries.sync_settings);
            if (entries.sync_blocker) await this.pullBlocker(entries.sync_blocker);
            if (entries.sync_tasks) await this.pullTasks(entries.sync_tasks);
        } catch (e) {
            console.error('[Sync] pullAll failed:', e);
        }
    },

    async pullSettings(entry) {
        if (!entry || !entry.data || (entry.updatedAt || 0) <= (this._meta.settings || 0)) return;

        this._applying = true;
        try {
            const local = await chrome.storage.local.get(this.SETTINGS_KEYS);
            const toWrite = {};
            for (const key of this.SETTINGS_KEYS) {
                if (key in entry.data && JSON.stringify(local[key]) !== JSON.stringify(entry.data[key])) {
                    toWrite[key] = entry.data[key];
                }
            }
            if (Object.keys(toWrite).length > 0) {
                await chrome.storage.local.set(toWrite);
                console.log('[Sync] Settings updated from sync:', Object.keys(toWrite));
            }
            this._meta.settings = entry.updatedAt;
            this._lastPushed.settings = JSON.stringify(entry.data);
            await this.saveMeta();
        } finally {
            this._applying = false;
        }
    },

    async pullBlocker(entry) {
        if (!entry || !entry.data || (entry.updatedAt || 0) <= (this._meta.blocker || 0)) return;

        this._applying = true;
        try {
            const local = (await chrome.storage.local.get(['blocker_config'])).blocker_config;
            const merged = this.mergeBlockerConfig(entry.data, local);
            await chrome.storage.local.set({ blocker_config: merged });
            this._meta.blocker = entry.updatedAt;
            this._lastPushed.blocker = JSON.stringify(entry.data);
            await this.saveMeta();
            console.log('[Sync] Blocker config updated from sync');
        } finally {
            this._applying = false;
        }
    },

    async pullTasks(entry) {
        if (!entry || !entry.data || (entry.updatedAt || 0) <= (this._meta.tasks || 0)) return;

        this._applying = true;
        try {
            const local = (await chrome.storage.local.get(['ora_tasks_daily'])).ora_tasks_daily;
            const merged = this.mergeTasks(entry.data, local);
            await chrome.storage.local.set({ ora_tasks_daily: merged });
            this._meta.tasks = entry.updatedAt;
            this._lastPushed.tasks = JSON.stringify(entry.data);
            await this.saveMeta();
            console.log('[Sync] Recurring tasks updated from sync');
        } finally {
            this._applying = false;
        }
    },

    // ── Push (local → sync) ───────────────────────────

    bindLocalPush() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || this._applying) return;

            if (this.SETTINGS_KEYS.some(k => k in changes)) this.schedulePush('settings');
            if ('blocker_config' in changes) this.schedulePush('blocker');
            if ('ora_tasks_daily' in changes) this.schedulePush('tasks');
        });
    },

    schedulePush(group) {
        clearTimeout(this._pushTimers[group]);
        this._pushTimers[group] = setTimeout(() => this.push(group), this.PUSH_DEBOUNCE_MS);
    },

    async push(group) {
        try {
            let data;
            if (group === 'settings') {
                data = await chrome.storage.local.get(this.SETTINGS_KEYS);
            } else if (group === 'blocker') {
                const cfg = (await chrome.storage.local.get(['blocker_config'])).blocker_config;
                data = this.sanitizeBlockerConfig(cfg);
            } else if (group === 'tasks') {
                const tasks = (await chrome.storage.local.get(['ora_tasks_daily'])).ora_tasks_daily;
                data = this.sanitizeTasks(tasks);
            }
            if (data === null || data === undefined) return;

            const json = JSON.stringify(data);
            if (json === this._lastPushed[group]) return; // nothing new

            const updatedAt = Date.now();
            await chrome.storage.sync.set({
                ['sync_' + group]: { v: this.VERSION, updatedAt, data }
            });
            this._meta[group] = updatedAt;
            this._lastPushed[group] = json;
            await this.saveMeta();
            console.log(`[Sync] Pushed ${group}`);
        } catch (e) {
            // Quota errors etc. — sync is best-effort
            console.warn(`[Sync] Push failed for ${group}:`, e);
        }
    },

    // ── Remote changes (another device pushed) ────────

    bindRemotePull() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync') return;
            if (changes.sync_settings && changes.sync_settings.newValue) this.pullSettings(changes.sync_settings.newValue);
            if (changes.sync_blocker && changes.sync_blocker.newValue) this.pullBlocker(changes.sync_blocker.newValue);
            if (changes.sync_tasks && changes.sync_tasks.newValue) this.pullTasks(changes.sync_tasks.newValue);
        });
    }
};

window.SyncSystem = SyncSystem;
