// ============================================================
// SYNC SYSTEM — Cross-device sync via chrome.storage.sync
// ============================================================
// Conservative, last-write-wins sync for the data that makes sense to
// follow the user across machines:
//
//   - Settings        (locale, name, prayer lang, reminder toggles)
//   - Blocker         (profiles/site list + lock config — NOT the enabled flag,
//                      NOT daily counters, NOT timed-disable state)
//   - Routine         (recurring task templates only — NOT one-off tasks,
//                      NOT today's tasks or their completion)
//
// Design:
//   - Each group is one sync entry: { v, updatedAt, data }.
//   - `ora_sync_meta` (local) records the last updatedAt applied/pushed per
//     group; pulls are skipped unless the remote entry is newer.
//   - Pushes are debounced and skipped when the sanitized payload is
//     identical to the last pushed/applied one (prevents echo loops).
//   - Merge functions are pure (no chrome.*) so the test suite can cover them.
//   - The routine moved from `sync_tasks` (1.2.0 format) to `sync_routine`
//     (TasksCore format). A legacy entry is converted once when no
//     `sync_routine` exists yet. Depends on TasksCore and MigrateCore.

const SyncSystem = {
    VERSION: 2,
    PUSH_DEBOUNCE_MS: 2500,
    META_KEY: 'ora_sync_meta',
    TASKS_KEY: 'ora_tasks',

    SETTINGS_KEYS: [
        'ora_locale', 'ora_user_name', 'ora_prayer_lang',
        'ora_reminder_carlo', 'ora_reminder_angelus', 'ora_reminder_mercy',
        'ora_reminder_midday', 'ora_reminder_evening'
    ],

    _meta: {},
    _lastPushed: {},   // group → JSON string of last pushed/applied payload
    _applying: false,  // true while writing remote data into local storage
    _pushTimers: {},

    // ── Sanitizers (local → sync payload) ─────────────

    sanitizeBlockerConfig(config) {
        if (!config || typeof config !== 'object') return null;
        const lock = config.lock || { enabled: false, verseIndex: 0, writeUnlockEnabled: false };

        if (Array.isArray(config.profiles)) {
            return {
                lock,
                profiles: BlockerCore.normalizeProfiles(config.profiles).map(p => ({
                    id: p.id,
                    name: p.name,
                    icon: p.icon,
                    enabled: p.enabled !== false,
                    sites: p.sites,
                    rules: p.rules
                }))
            };
        }

        if (Array.isArray(config.sites)) {
            return {
                lock,
                sites: config.sites.map(s => ({
                    id: s.id,
                    url: s.url,
                    mode: s.mode,
                    accessLimit: s.accessLimit,
                    scheduleLimit: s.scheduleLimit,
                    writeUnlockEnabled: !!s.writeUnlockEnabled
                }))
            };
        }

        return null;
    },

    // Only the routine templates travel; today's tasks and completions stay local.
    sanitizeTasks(tasks) {
        return TasksCore.normalizeTasks(tasks).filter(t => TasksCore.isTemplate(t));
    },

    // ── Merge functions (remote + local → new local) — pure ──

    mergeBlockerConfig(remote, local) {
        const todayStr = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();

        if (remote && Array.isArray(remote.profiles)) {
            const localProfiles = (local && Array.isArray(local.profiles)) ? local.profiles : [];
            return {
                enabled: local ? !!local.enabled : false,
                reenableAt: (local && local.reenableAt) || null,
                lock: remote.lock || { enabled: false, verseIndex: 0, writeUnlockEnabled: false },
                profiles: BlockerCore.normalizeProfiles(remote.profiles).map(p => {
                    const localProfile = localProfiles.find(lp => lp && lp.id === p.id);
                    const merged = Object.assign({}, p);
                    if (localProfile && localProfile.tempAccess) {
                        merged.tempAccess = localProfile.tempAccess;
                    }
                    return merged;
                })
            };
        }

        const localSites = (local && local.sites) || [];
        return {
            // Device-local decisions stay local
            enabled: local ? !!local.enabled : false,
            reenableAt: (local && local.reenableAt) || null,
            lock: remote.lock,
            sites: (remote.sites || []).map(site => {
                const localSite = localSites.find(s => s.url === site.url);
                return {
                    ...site,
                    todayAccesses: localSite ? (localSite.todayAccesses || 0) : 0,
                    lastAccessDate: localSite ? (localSite.lastAccessDate || todayStr) : todayStr
                };
            })
        };
    },

    mergeTasks(remoteTemplates, localTasks) {
        const remote = TasksCore.normalizeTasks(remoteTemplates).filter(t => TasksCore.isTemplate(t));
        const remoteIds = new Set(remote.map(t => t.id));

        // One-off tasks and today's routine tasks are device-local; local
        // templates are replaced by the remote definitions (or dropped when
        // the routine was deleted on another device).
        let result = TasksCore.normalizeTasks(localTasks).filter(t => !TasksCore.isTemplate(t));
        result = result.concat(remote);

        // Renames reach today's open routine task too
        for (const template of remote) {
            result = TasksCore.updateTask(result, template.id, {
                title: template.title,
                estimateMin: template.estimateMin
            });
        }

        // Today's open task of a deleted routine becomes an ordinary task
        const orphaned = result.filter(t => t.fromRecurrence && !remoteIds.has(t.fromRecurrence));
        return result.map(t => {
            if (!orphaned.includes(t)) return t;
            const copy = Object.assign({}, t);
            delete copy.fromRecurrence;
            delete copy.date;
            return copy;
        });
    },

    // Legacy `sync_tasks` payload (1.2.0) → routine templates
    convertLegacyRoutine(data) {
        const converted = MigrateCore.legacyTasksToCore(Array.isArray(data) ? data : [], { now: Date.now() });
        return converted.tasks.filter(t => TasksCore.isTemplate(t));
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
            const entries = await chrome.storage.sync.get(['sync_settings', 'sync_blocker', 'sync_routine', 'sync_tasks']);
            if (entries.sync_settings) await this.pullSettings(entries.sync_settings);
            if (entries.sync_blocker) await this.pullBlocker(entries.sync_blocker);
            if (entries.sync_routine) {
                await this.pullTasks(entries.sync_routine);
            } else if (entries.sync_tasks && entries.sync_tasks.data && !this._meta.routine) {
                await this.pullTasks({
                    updatedAt: entries.sync_tasks.updatedAt || 1,
                    data: this.convertLegacyRoutine(entries.sync_tasks.data)
                });
            }
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
        if (!entry || !entry.data || (entry.updatedAt || 0) <= (this._meta.routine || 0)) return;

        this._applying = true;
        try {
            const local = (await chrome.storage.local.get([this.TASKS_KEY]))[this.TASKS_KEY];
            const merged = this.mergeTasks(entry.data, local);
            await chrome.storage.local.set({ [this.TASKS_KEY]: merged });
            this._meta.routine = entry.updatedAt;
            this._lastPushed.routine = JSON.stringify(this.sanitizeTasks(entry.data));
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
            if (this.TASKS_KEY in changes) this.schedulePush('routine');
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
            } else if (group === 'routine') {
                const tasks = (await chrome.storage.local.get([this.TASKS_KEY]))[this.TASKS_KEY];
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
            if (changes.sync_routine && changes.sync_routine.newValue) this.pullTasks(changes.sync_routine.newValue);
        });
    }
};

window.SyncSystem = SyncSystem;
