// ============================================================
// SESSIONS CORE — sessões de foco realizadas e intenção do dia
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Usado pelo sw.js (motor do pomodoro grava as sessões), pelas páginas e testes.
//
// Sessão em andamento (dentro de ora_pomodoro_state.session):
//   { id, taskId|null, title?, intention?, plannedMin, startedAt, focusedMs, resumedAt|null }
// Sessão registrada (ora_sessions):
//   { id, taskId|null, title?, intention?, plannedMin, focusedMin, startedAt, endedAt,
//     status: 'completed'|'interrupted' }
// `title` é o nome da atividade escolhido na preparação (foco sem tarefa também tem).
// Registros importados da 1.1.5 têm `imported: true`, `date` e não têm horário.
//
// Foco sem tarefa é válido (taskId null). Tempo pausado não conta.
// Sessão interrompida registra os minutos realmente focados (decisão de 02/11).
(function (global) {
    'use strict';

    const SESSIONS_MAX = 5000;
    const INTENTION_KEEP_DAYS = 400;

    function isoDate(d) {
        const date = d instanceof Date ? d : new Date(d);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function toMs(value) {
        if (value instanceof Date) return value.getTime();
        return typeof value === 'number' ? value : Date.parse(value);
    }

    function startSession(fields) {
        const f = fields || {};
        const now = f.now || Date.now();
        const session = {
            id: f.id ? String(f.id) : 'session-' + now,
            taskId: f.taskId === undefined || f.taskId === null || f.taskId === '' ? null : String(f.taskId),
            plannedMin: Math.max(1, Math.round(Number(f.plannedMin) || 25)),
            startedAt: now - (f.alreadyFocusedMs || 0),
            focusedMs: Math.max(0, f.alreadyFocusedMs || 0),
            resumedAt: f.paused ? null : now
        };
        const title = typeof f.title === 'string' ? f.title.trim() : '';
        if (title) session.title = title;
        const intention = typeof f.intention === 'string' ? f.intention.trim() : '';
        if (intention) session.intention = intention;
        return session;
    }

    function focusedMs(session, now) {
        if (!session) return 0;
        const running = session.resumedAt ? Math.max(0, (now || Date.now()) - session.resumedAt) : 0;
        return session.focusedMs + running;
    }

    function isPaused(session) {
        return !!session && !session.resumedAt;
    }

    function pause(session, now) {
        if (!session || !session.resumedAt) return session;
        return Object.assign({}, session, { focusedMs: focusedMs(session, now), resumedAt: null });
    }

    function resume(session, now) {
        if (!session || session.resumedAt) return session;
        return Object.assign({}, session, { resumedAt: now || Date.now() });
    }

    function toRecord(session, now, status, minutes) {
        const record = {
            id: session.id,
            taskId: session.taskId,
            plannedMin: session.plannedMin,
            focusedMin: minutes,
            startedAt: session.startedAt,
            endedAt: now,
            status
        };
        if (session.title) record.title = session.title;
        if (session.intention) record.intention = session.intention;
        return record;
    }

    // A fase de foco chegou ao fim: arredonda e limita aos minutos planejados.
    function finishSession(session, now) {
        if (!session) return null;
        const end = now || Date.now();
        const minutes = Math.min(session.plannedMin, Math.round(focusedMs(session, end) / 60000));
        return toRecord(session, end, 'completed', minutes);
    }

    // A pessoa encerrou antes: conta só os minutos inteiros focados.
    function interruptSession(session, now) {
        if (!session) return null;
        const end = now || Date.now();
        const minutes = Math.floor(focusedMs(session, end) / 60000);
        return toRecord(session, end, 'interrupted', minutes);
    }

    // Acrescenta um registro. Menos de 1 minuto focado não vira sessão.
    function appendSession(sessions, record) {
        const list = Array.isArray(sessions) ? sessions.filter(s => s && s.id !== (record && record.id)) : [];
        if (!record || !(record.focusedMin >= 1)) return Array.isArray(sessions) ? sessions.slice() : [];
        list.push(record);
        return list.length > SESSIONS_MAX ? list.slice(-SESSIONS_MAX) : list;
    }

    // Dia (local) a que a sessão pertence.
    function sessionDay(session) {
        if (!session) return null;
        if (typeof session.date === 'string') return session.date;
        const ms = toMs(session.startedAt);
        return isNaN(ms) ? null : isoDate(new Date(ms));
    }

    function sessionStartMs(session) {
        if (typeof session.date === 'string' && (session.startedAt === null || session.startedAt === undefined)) {
            const [y, m, d] = session.date.split('-').map(Number);
            return new Date(y, m - 1, d).getTime();
        }
        return toMs(session.startedAt);
    }

    // Minutos focados das sessões que começaram em [from, to).
    function minutesInRange(sessions, from, to) {
        const start = toMs(from);
        const end = toMs(to);
        return (sessions || []).reduce((sum, s) => {
            if (!s) return sum;
            const at = sessionStartMs(s);
            if (isNaN(at) || at < start || at >= end) return sum;
            return sum + (Number(s.focusedMin) || 0);
        }, 0);
    }

    // ── Intenção do dia (ora_day_intention: { 'YYYY-MM-DD': texto }) ──
    // Separada da intenção da sessão: mudar uma nunca muda a outra.

    function dayIntention(map, date) {
        if (!map || typeof map !== 'object') return '';
        const value = map[isoDate(date || Date.now())];
        return typeof value === 'string' ? value : '';
    }

    function setDayIntention(map, date, text) {
        const d = date instanceof Date ? date : new Date(date || Date.now());
        const iso = isoDate(d);
        const cutoff = isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - INTENTION_KEEP_DAYS));
        const next = {};
        for (const [key, value] of Object.entries(map && typeof map === 'object' ? map : {})) {
            if (key >= cutoff && typeof value === 'string' && value) next[key] = value;
        }
        const clean = typeof text === 'string' ? text.trim() : '';
        if (clean) next[iso] = clean;
        else delete next[iso];
        return next;
    }

    global.SessionsCore = {
        startSession,
        focusedMs,
        isPaused,
        pause,
        resume,
        finishSession,
        interruptSession,
        appendSession,
        sessionDay,
        minutesInRange,
        dayIntention,
        setDayIntention
    };
})(typeof self !== 'undefined' ? self : this);
