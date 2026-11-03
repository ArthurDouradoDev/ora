// ============================================================
// POMODORO CORE — Shared, dependency-free timer logic
// ============================================================
// Used by sw.js (via importScripts) and by the test suite.
// Pure functions only: no chrome.* calls, no DOM access.
(function (global) {
    'use strict';

    const LIMITS = {
        focus: [1, 120],
        pause: [1, 30],
        longPause: [1, 60]
    };
    const LONG_PAUSE_EVERY = 4;

    function getDefaultSettings() {
        return {
            focus: 25,
            pause: 5,
            longPause: 15,
            sound: true,
            autoNext: false,
            continuousAlarm: false,
            wakeLock: false
        };
    }

    function clampMinutes(value, key, fallback) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) return fallback;
        const [min, max] = LIMITS[key];
        return Math.max(min, Math.min(max, n));
    }

    // Completa e limita as configurações (vindas do storage, da interface ou
    // da versão anterior). A pausa longa é editável; o padrão é 15 min.
    function sanitizeSettings(raw) {
        const defaults = getDefaultSettings();
        const s = raw && typeof raw === 'object' ? raw : {};
        const bool = (key) => (typeof s[key] === 'boolean' ? s[key] : defaults[key]);
        return {
            focus: clampMinutes(s.focus, 'focus', defaults.focus),
            pause: clampMinutes(s.pause, 'pause', defaults.pause),
            longPause: clampMinutes(s.longPause, 'longPause', defaults.longPause),
            sound: bool('sound'),
            autoNext: bool('autoNext'),
            continuousAlarm: bool('continuousAlarm'),
            wakeLock: bool('wakeLock')
        };
    }

    // Chave diária legada do total de foco (ainda lida pela versão 1.1.5)
    function todayKey(date) {
        return 'ora_focus_total_' + (date instanceof Date ? date : new Date(date || Date.now())).toDateString();
    }

    function createState(settings, date) {
        const s = sanitizeSettings(settings);
        return {
            isRunning: false,
            phase: 'focus',
            expectedEndTime: null,
            timeRemaining: s.focus * 60,
            totalDuration: s.focus * 60,
            pomodoroCount: 0,
            totalFocusSeconds: 0,
            todayKey: todayKey(date),
            settings: s,
            session: null,
            // Última sessão concluída, enquanto a pessoa decide como continuar
            completed: null,
            // A proteção foi ligada pela sessão (e volta ao estado anterior no fim)
            protection: null
        };
    }

    function getPhaseDuration(phase, settings) {
        if (phase === 'focus') return settings.focus * 60;
        if (phase === 'pause') return settings.pause * 60;
        if (phase === 'longPause') return settings.longPause * 60;
        return settings.focus * 60;
    }

    function advancePhase(state) {
        if (state.phase === 'focus') {
            state.pomodoroCount++;
            if (state.pomodoroCount % LONG_PAUSE_EVERY === 0) {
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

    /**
     * Handle the day rollover for a persisted pomodoro state.
     * Mutates `state`. Returns true when a rollover happened (state changed).
     *
     * Daily counters always reset. The timer itself is only preserved when a
     * session is genuinely still running across midnight (expectedEndTime in
     * the future); anything else is residue from a previous day and is fully
     * reset to a fresh focus phase.
     */
    function applyDayRollover(state, currentKey, now = Date.now()) {
        if (state.todayKey === currentKey) return false;

        const activeCrossMidnight = !!(state.isRunning && state.expectedEndTime && state.expectedEndTime > now);

        state.todayKey = currentKey;
        state.totalFocusSeconds = 0;
        state.pomodoroCount = 0;

        if (!activeCrossMidnight) {
            state.completed = null;
            state.isRunning = false;
            state.expectedEndTime = null;
            state.phase = 'focus';
            state.timeRemaining = getPhaseDuration('focus', state.settings);
            state.totalDuration = state.timeRemaining;
        }

        return true;
    }

    /**
     * Única transição de fim de sessão (E12). Chamada depois que a fase de foco
     * terminou e `state` já avançou para a pausa. Devolve as opções na ordem de
     * apresentação; a primeira é a sugerida.
     *   pause / longPause — descansar (a longa tem duração editável)
     *   respiro           — fazer um Respiro em vez da pausa
     *   nextSession       — mais uma sessão de foco
     *   home              — voltar ao início
     */
    function endOfSessionOptions(state) {
        const settings = sanitizeSettings(state && state.settings);
        const isLong = !!state && state.phase === 'longPause';
        const rest = isLong
            ? { id: 'longPause', minutes: settings.longPause, editable: true }
            : { id: 'pause', minutes: settings.pause, editable: false };
        return [
            Object.assign(rest, { primary: true }),
            { id: 'respiro' },
            { id: 'nextSession', minutes: settings.focus },
            { id: 'home' }
        ];
    }

    function isBreak(phase) {
        return phase === 'pause' || phase === 'longPause';
    }

    // Prepara uma fase de foco com a duração escolhida na preparação
    // (15/25/50/90 ou a padrão), vinda de qualquer fase. Não começa a contar.
    function prepareFocus(state, minutes) {
        const s = sanitizeSettings(state.settings);
        state.phase = 'focus';
        state.timeRemaining = clampMinutes(minutes, 'focus', s.focus) * 60;
        state.totalDuration = state.timeRemaining;
        state.completed = null;
        return state;
    }

    // Ajusta a pausa que vem depois do foco (a longa é editável naquele momento).
    function prepareBreak(state, minutes) {
        if (!isBreak(state.phase) || state.isRunning) return state;
        const s = sanitizeSettings(state.settings);
        const fallback = getPhaseDuration(state.phase, s) / 60;
        state.timeRemaining = clampMinutes(minutes, state.phase, fallback) * 60;
        state.totalDuration = state.timeRemaining;
        return state;
    }

    // "Voltar ao início": parado, na fase de foco com a duração padrão.
    function resetToIdle(state) {
        const s = sanitizeSettings(state.settings);
        state.isRunning = false;
        state.expectedEndTime = null;
        state.phase = 'focus';
        state.timeRemaining = s.focus * 60;
        state.totalDuration = state.timeRemaining;
        state.completed = null;
        return state;
    }

    // Resumo da sessão que acabou de terminar, para a tela de sessão concluída.
    function completedSummary(session, record) {
        if (!session && !record) return null;
        const src = record || session;
        const summary = {
            taskId: src.taskId || null,
            plannedMin: src.plannedMin,
            focusedMin: record ? record.focusedMin : src.plannedMin,
            endedAt: record ? record.endedAt : Date.now()
        };
        if (src.title) summary.title = src.title;
        if (src.intention) summary.intention = src.intention;
        return summary;
    }

    global.PomodoroCore = {
        LONG_PAUSE_EVERY,
        getDefaultSettings,
        sanitizeSettings,
        todayKey,
        createState,
        getPhaseDuration,
        advancePhase,
        applyDayRollover,
        endOfSessionOptions,
        isBreak,
        prepareFocus,
        prepareBreak,
        resetToIdle,
        completedSummary
    };
})(typeof self !== 'undefined' ? self : this);
