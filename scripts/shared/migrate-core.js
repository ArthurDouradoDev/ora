// ============================================================
// MIGRATE CORE — dados da 1.1.5 (loja) e da 1.2.0 local → esquema 2
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Depende de TasksCore, PomodoroCore e BlockerCore (carregar antes).
//
// migrate(snapshot, { now }) → { changes, removals, schemaVersion }
//   snapshot — resultado de chrome.storage.local.get(null)
//   changes  — chaves a gravar (só as que mudam)
//   removals — chaves legadas já convertidas
// Idempotente: aplicar o resultado e migrar de novo não muda mais nada.
// Chaves desconhecidas nunca são apagadas.
(function (global) {
    'use strict';

    const SCHEMA_VERSION = 2;
    const SCHEMA_KEY = 'ora_schema_version';
    const FOCUS_TOTAL_PREFIX = 'ora_focus_total_';
    const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
    const UNPARSEABLE = {};

    function isoDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function same(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    // A 1.1.5 grava várias chaves como JSON em texto. Texto inválido → UNPARSEABLE
    // (a chave é deixada como está, nunca apagada).
    function parseStored(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (e) { return UNPARSEABLE; }
    }

    // "Tue Mar 03 2026" (Date#toDateString) → Date local, ou null
    function parseDateString(str) {
        const m = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{2}) (\d{4})$/.exec(str || '');
        if (!m || !(m[1] in MONTHS)) return null;
        const d = new Date(Number(m[3]), MONTHS[m[1]], Number(m[2]));
        return d.getDate() === Number(m[2]) ? d : null;
    }

    // ── Normalizadores (também usados pelos módulos ao gravar) ──

    function normalizeLinks(raw) {
        const list = parseStored(raw);
        if (!Array.isArray(list)) return null;
        return list
            .filter(l => l && typeof l.url === 'string' && l.url.trim())
            .map(l => Object.assign({}, l, { name: typeof l.name === 'string' ? l.name : '', url: l.url.trim() }));
    }

    function normalizePlaylists(raw) {
        const list = parseStored(raw);
        if (!Array.isArray(list)) return null;
        return list.filter(p => p && typeof p === 'object' && p.id !== undefined && p.id !== null);
    }

    function normalizeIdList(raw) {
        const list = parseStored(raw);
        if (!Array.isArray(list)) return null;
        return list.filter(id => typeof id === 'string' || typeof id === 'number');
    }

    // Registros de exame: { id, type, date (ISO), answers }, em ordem cronológica.
    function normalizeExamLogs(raw) {
        const list = parseStored(raw);
        if (!Array.isArray(list)) return null;
        return list
            .filter(l => l && typeof l === 'object' && !isNaN(Date.parse(l.date)))
            .map(l => ({
                id: l.id ? String(l.id) : 'exam-' + Date.parse(l.date),
                type: typeof l.type === 'string' ? l.type : 'night',
                date: new Date(Date.parse(l.date)).toISOString(),
                answers: l.answers === undefined ? null : l.answers
            }))
            .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    }

    function normalizeRosaryProgress(raw) {
        const p = parseStored(raw);
        if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
        const bead = parseInt(p.bead, 10);
        return {
            bead: Number.isFinite(bead) && bead >= 0 ? bead : 0,
            mystery: typeof p.mystery === 'string' && p.mystery ? p.mystery : 'gozosos',
            chapletType: typeof p.chapletType === 'string' && p.chapletType ? p.chapletType : 'terco',
            lang: typeof p.lang === 'string' && p.lang ? p.lang : 'pt'
        };
    }

    function importedSession(iso, minutes) {
        return {
            id: 'imported-' + iso,
            imported: true,
            date: iso,
            taskId: null,
            plannedMin: null,
            focusedMin: minutes,
            startedAt: null,
            endedAt: null,
            status: 'completed'
        };
    }

    // Tarefas da 1.2.0 (ora_tasks_daily) → TasksCore. Os ciclos registrados
    // NÃO viram sessões (E01): só a estimativa é aproveitada.
    function legacyTasksToCore(list, opts) {
        const now = opts.now;
        const today = new Date(now);
        const todayIso = isoDate(today);
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const focusMin = opts.focusMin || 25;
        const resetToday = opts.lastReset === today.toDateString();
        const tasks = [];
        const history = [];

        (list || []).forEach((t, idx) => {
            if (!t || typeof t !== 'object') return;
            if (typeof t.title === 'string') { // já no formato novo
                tasks.push(t);
                return;
            }
            const title = typeof t.text === 'string' ? t.text.trim() : '';
            if (!title || t.id === undefined || t.id === null) return;

            const id = String(t.id);
            const base = {
                title,
                list: 'hoje',
                order: idx,
                estimateMin: Math.max(1, parseInt(t.totalCycles, 10) || 1) * focusMin,
                intention: t.intention
            };
            const completedAt = t.done ? (Date.parse(t.completedAt) || now) : null;

            if (t.recurring) {
                tasks.push(Object.assign({ id, createdAt: Date.parse(t.createdAt) || now, recurrence: { days: TasksCore.DAILY } }, base));
                const doneDay = completedAt ? isoDate(new Date(completedAt)) : null;
                if (doneDay && doneDay < todayIso) {
                    history.push({ id: `${id}@${doneDay}`, title, completedAt, fromRecurrence: id });
                } else if (resetToday || doneDay === todayIso) {
                    const instance = Object.assign({ id: `${id}@${todayIso}`, createdAt: startOfToday, fromRecurrence: id, date: todayIso }, base);
                    if (completedAt) instance.completedAt = completedAt;
                    tasks.push(instance);
                }
            } else {
                const task = Object.assign({ id, createdAt: Date.parse(t.createdAt) || now }, base);
                if (completedAt) task.completedAt = completedAt;
                tasks.push(task);
            }
        });

        return { tasks: TasksCore.normalizeTasks(tasks), history };
    }

    function migrate(snapshot, options) {
        const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const now = options && Number.isFinite(options.now) ? options.now : Date.now();
        const today = new Date(now);
        const todayIso = isoDate(today);
        const changes = {};
        const removals = new Set();

        const has = (k) => Object.prototype.hasOwnProperty.call(snap, k);
        const current = (k) => (k in changes ? changes[k] : snap[k]);
        const set = (k, v) => { if (!same(snap[k], v)) changes[k] = v; else delete changes[k]; };
        const remove = (k) => { if (has(k)) removals.add(k); };

        // Atalhos (a 1.1.5 ainda lia a chave antiga oraLinks)
        if (has('ora_quick_links')) {
            const links = normalizeLinks(snap.ora_quick_links);
            if (links) set('ora_quick_links', links);
            if (links) remove('oraLinks');
        } else if (has('oraLinks')) {
            const links = normalizeLinks(snap.oraLinks);
            if (links) {
                set('ora_quick_links', links);
                remove('oraLinks');
            }
        }

        // Playlists do Som (gravadas como texto JSON na 1.1.5)
        if (has('ora_user_playlists')) {
            const playlists = normalizePlaylists(snap.ora_user_playlists);
            if (playlists) set('ora_user_playlists', playlists);
        }
        if (has('ora_deleted_default_playlists')) {
            const deleted = normalizeIdList(snap.ora_deleted_default_playlists);
            if (deleted) set('ora_deleted_default_playlists', deleted);
        }

        // Preferências de foco: ficam em ora_pomodoro_state.settings
        const legacyFocus = has('ora_focus_settings') ? parseStored(snap.ora_focus_settings) : null;
        if (has('ora_focus_settings') && legacyFocus !== UNPARSEABLE) {
            const state = snap.ora_pomodoro_state;
            if (!state || typeof state !== 'object') {
                set('ora_pomodoro_state', PomodoroCore.createState(legacyFocus, today));
            } else if (!state.settings || typeof state.settings !== 'object') {
                set('ora_pomodoro_state', Object.assign({}, state, { settings: PomodoroCore.sanitizeSettings(legacyFocus) }));
            }
            // Com estado existente, as configurações já foram absorvidas pela 1.1.5
            remove('ora_focus_settings');
        }

        // Totais diários de foco → sessões importadas (sem horário).
        // O total de hoje continua com o motor do pomodoro.
        const importedMinutes = new Map();
        const extraDays = new Set();
        for (const key of Object.keys(snap)) {
            if (!key.startsWith(FOCUS_TOTAL_PREFIX)) continue;
            const d = parseDateString(key.slice(FOCUS_TOTAL_PREFIX.length));
            if (!d) continue;
            const iso = isoDate(d);
            if (iso >= todayIso) continue;
            const minutes = Math.round((parseInt(snap[key], 10) || 0) / 60);
            if (minutes >= 1) importedMinutes.set(iso, Math.max(minutes, importedMinutes.get(iso) || 0));
            remove(key);
        }

        // Estatísticas diárias da 1.2.0 local
        if (has('ora_daily_stats')) {
            const stats = parseStored(snap.ora_daily_stats);
            if (stats && stats !== UNPARSEABLE && typeof stats === 'object') {
                for (const [iso, entry] of Object.entries(stats)) {
                    if (!ISO_RE.test(iso) || iso >= todayIso || !entry) continue;
                    const minutes = Math.round((Number(entry.focusSeconds) || 0) / 60);
                    if (minutes >= 1) importedMinutes.set(iso, Math.max(minutes, importedMinutes.get(iso) || 0));
                    if ((Number(entry.tasksDone) || 0) > 0) extraDays.add(iso);
                }
                remove('ora_daily_stats');
            }
        }

        if (importedMinutes.size) {
            const existing = Array.isArray(snap.ora_sessions) ? snap.ora_sessions : [];
            const ids = new Set(existing.map(s => s && s.id));
            const imported = Array.from(importedMinutes.keys()).sort()
                .filter(iso => !ids.has('imported-' + iso))
                .map(iso => importedSession(iso, importedMinutes.get(iso)));
            if (imported.length) set('ora_sessions', imported.concat(existing));
        }
        if (extraDays.size) {
            const existing = Array.isArray(snap.ora_imported_active_days) ? snap.ora_imported_active_days : [];
            set('ora_imported_active_days', Array.from(new Set(existing.concat(Array.from(extraDays)))).sort());
        }

        // Intenção → intenção do dia de hoje
        if (has('ora_intention')) {
            const text = typeof snap.ora_intention === 'string' ? snap.ora_intention.trim() : '';
            const map = snap.ora_day_intention && typeof snap.ora_day_intention === 'object' ? snap.ora_day_intention : {};
            if (text && !map[todayIso]) set('ora_day_intention', Object.assign({}, map, { [todayIso]: text }));
            remove('ora_intention');
        }

        // Registros de exame (para Frutos)
        if (has('ora_exam_logs')) {
            const logs = normalizeExamLogs(snap.ora_exam_logs);
            if (logs) set('ora_exam_logs', logs);
        }

        // Progresso do terço
        if (has('ora_rosary_progress')) {
            const progress = normalizeRosaryProgress(snap.ora_rosary_progress);
            if (progress) set('ora_rosary_progress', progress);
        }

        // Tarefas da 1.2.0 local (só o autor usou)
        if (has('ora_tasks_daily')) {
            const legacy = parseStored(snap.ora_tasks_daily);
            if (Array.isArray(legacy)) {
                const state = current('ora_pomodoro_state');
                const focusMin = PomodoroCore.sanitizeSettings((state && state.settings) || legacyFocus).focus;
                const converted = legacyTasksToCore(legacy, { now, focusMin, lastReset: snap.ora_tasks_last_reset });
                const existing = TasksCore.normalizeTasks(snap.ora_tasks);
                const ids = new Set(existing.map(t => t.id));
                set('ora_tasks', existing.concat(converted.tasks.filter(t => !ids.has(t.id))));

                if (converted.history.length) {
                    const history = Array.isArray(snap.ora_tasks_history) ? snap.ora_tasks_history : [];
                    const historyIds = new Set(history.map(h => h && h.id));
                    set('ora_tasks_history', history.concat(converted.history.filter(h => !historyIds.has(h.id))));
                }

                // A tarefa ativa recorrente passa a apontar para a tarefa de hoje
                const activeId = snap.ora_active_task_id;
                const todayInstance = activeId ? `${activeId}@${todayIso}` : null;
                if (todayInstance && current('ora_tasks').some(t => t.id === todayInstance)) {
                    set('ora_active_task_id', todayInstance);
                }

                remove('ora_tasks_daily');
                remove('ora_tasks_last_reset');
            }
        }

        // Bloqueador (1.1.5 / 1.2.0 → perfis da fase 4)
        if (has('blocker_config') || has('blocker_sites') || has('blocker_enabled')) {
            const rawCfg = has('blocker_config') ? parseStored(snap.blocker_config) : null;
            const rawSites = has('blocker_sites') ? parseStored(snap.blocker_sites) : null;
            if (rawCfg !== UNPARSEABLE) {
                const cfgObj = rawCfg && typeof rawCfg === 'object' && !Array.isArray(rawCfg) ? rawCfg : null;
                const sitesArr = Array.isArray(rawSites) ? rawSites : null;
                if (cfgObj || sitesArr || has('blocker_enabled')) {
                    const profiles = (cfgObj && Array.isArray(cfgObj.profiles))
                        ? BlockerCore.normalizeProfiles(cfgObj.profiles)
                        : BlockerCore.legacyToProfiles(cfgObj, sitesArr);
                    const enabled = cfgObj && typeof cfgObj.enabled === 'boolean'
                        ? cfgObj.enabled
                        : (typeof snap.blocker_enabled === 'boolean' ? snap.blocker_enabled : Boolean(sitesArr && sitesArr.length));
                    const reenableAt = cfgObj && Number.isFinite(Number(cfgObj.reenableAt)) && Number(cfgObj.reenableAt) > 0
                        ? Number(cfgObj.reenableAt)
                        : null;
                    const rawLock = cfgObj && cfgObj.lock && typeof cfgObj.lock === 'object' ? cfgObj.lock : {};
                    const lock = {
                        enabled: Boolean(rawLock.enabled),
                        verseIndex: Number.isFinite(Number(rawLock.verseIndex)) ? Number(rawLock.verseIndex) : 0,
                        writeUnlockEnabled: Boolean(rawLock.writeUnlockEnabled)
                    };
                    set('blocker_config', { enabled, reenableAt, lock, profiles });
                }
                if (rawSites !== UNPARSEABLE) remove('blocker_sites');
                remove('blocker_enabled');
            }
        }

        if (OnboardingCore.isLegacy(snap)) set(OnboardingCore.UPDATE_KEY, true);
        set(SCHEMA_KEY, SCHEMA_VERSION);
        for (const k of Object.keys(changes)) removals.delete(k);

        return { changes, removals: Array.from(removals).sort(), schemaVersion: SCHEMA_VERSION };
    }

    // Aplica o resultado a um snapshot (para testes e para conferência).
    function apply(snapshot, result) {
        const next = JSON.parse(JSON.stringify(snapshot || {}));
        Object.assign(next, JSON.parse(JSON.stringify(result.changes || {})));
        for (const key of result.removals || []) delete next[key];
        return next;
    }

    function needsMigration(snapshot) {
        if (!snapshot || (Number(snapshot[SCHEMA_KEY]) || 0) < SCHEMA_VERSION) return true;
        if (Object.prototype.hasOwnProperty.call(snapshot, 'blocker_sites')) return true;
        if (Object.prototype.hasOwnProperty.call(snapshot, 'blocker_enabled')) return true;
        const cfg = snapshot.blocker_config;
        if (typeof cfg === 'string') return true;
        if (cfg && typeof cfg === 'object' && !Array.isArray(cfg.profiles)) return true;
        return false;
    }

    global.MigrateCore = {
        SCHEMA_VERSION,
        SCHEMA_KEY,
        parseDateString,
        normalizeLinks,
        normalizePlaylists,
        normalizeIdList,
        normalizeExamLogs,
        normalizeRosaryProgress,
        legacyTasksToCore,
        migrate,
        apply,
        needsMigration
    };
})(typeof self !== 'undefined' ? self : this);
