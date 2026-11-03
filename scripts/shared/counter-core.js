// ============================================================
// COUNTER CORE — "Dias com Ora"
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Conta os dias com pelo menos uma sessão de foco ou uma tarefa concluída.
// Nunca zera: dias sem registro simplesmente não somam (substitui o streak).
(function (global) {
    'use strict';

    function isoDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function dayOf(value) {
        if (value === null || value === undefined) return null;
        const ms = typeof value === 'number' ? value : Date.parse(value);
        return isNaN(ms) ? null : isoDate(new Date(ms));
    }

    const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

    // history: { sessions, tasks, taskHistory, extraDays }
    //   sessions    — ora_sessions (conta com focusedMin ≥ 1)
    //   tasks       — ora_tasks (conta pelas concluídas)
    //   taskHistory — ora_tasks_history
    //   extraDays   — dias importados da versão anterior ('YYYY-MM-DD')
    function activeDays(history) {
        const h = history || {};
        const days = new Set();

        for (const s of h.sessions || []) {
            if (!s || !(Number(s.focusedMin) >= 1)) continue;
            const day = typeof s.date === 'string' ? s.date : dayOf(s.startedAt);
            if (day) days.add(day);
        }
        for (const t of (h.tasks || []).concat(h.taskHistory || [])) {
            const day = t ? dayOf(t.completedAt) : null;
            if (day) days.add(day);
        }
        for (const d of h.extraDays || []) {
            if (typeof d === 'string' && ISO_RE.test(d)) days.add(d);
        }

        return Array.from(days).sort();
    }

    function daysWithOra(history) {
        return activeDays(history).length;
    }

    global.CounterCore = {
        activeDays,
        daysWithOra
    };
})(typeof self !== 'undefined' ? self : this);
