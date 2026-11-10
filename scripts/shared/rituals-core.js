// ============================================================
// RITUALS CORE — rituais da manhã e da noite como convite
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Nada abre sozinho: o ritual aparece como a linha de convite de Hoje
// (RemindersCore) e só quando faz sentido:
//   manhã — das 4h ao meio-dia, se ainda não foi feito e nenhum foco começou hoje;
//   noite — das 21h às 4h, se ainda não foi feito (a madrugada é do dia anterior).
//
// ora_rituals:      { 'YYYY-MM-DD': { manha?: {...}, noite?: {...} } } — guardado sempre
// ora_ritual_draft: { manha?: { date, step, ... }, noite?: { date, step, answers } }
(function (global) {
    'use strict';

    const KINDS = ['manha', 'noite'];
    const MORNING_FROM = 4;
    const MORNING_UNTIL = 12;
    const NIGHT_FROM = 21;
    const NIGHT_UNTIL = 4;
    const NIGHT_LOOKAHEAD_MIN = 4 * 60; // regras que começam ainda nesta noite

    function isoDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function toDate(now) {
        if (now instanceof Date) return now;
        return new Date(typeof now === 'number' ? now : Date.now());
    }

    // Dia a que o ritual pertence: de madrugada ainda vale o dia anterior
    function ritualDay(now) {
        const d = toDate(now);
        if (d.getHours() < NIGHT_UNTIL) return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
        return isoDate(d);
    }

    function entry(rituals, kind, now) {
        const map = rituals && typeof rituals === 'object' ? rituals : {};
        const day = map[ritualDay(now)];
        return day && typeof day === 'object' ? day[kind] || null : null;
    }

    function isDone(rituals, kind, now) {
        const e = entry(rituals, kind, now);
        return !!(e && e.doneAt);
    }

    function inMorning(date) {
        const h = date.getHours();
        return h >= MORNING_FROM && h < MORNING_UNTIL;
    }

    function inNight(date) {
        const h = date.getHours();
        return h >= NIGHT_FROM || h < NIGHT_UNTIL;
    }

    /**
     * morningInvite({ now, rituals, focusedToday, sessionActive }) → boolean
     * Some ao iniciar um foco (sessão em andamento ou já feita hoje) e ao meio-dia.
     */
    function morningInvite(opts) {
        const o = opts || {};
        const date = toDate(o.now);
        if (!inMorning(date) || o.sessionActive || o.focusedToday) return false;
        return !isDone(o.rituals, 'manha', date);
    }

    // nightInvite({ now, rituals, sessionActive }) → boolean
    function nightInvite(opts) {
        const o = opts || {};
        const date = toDate(o.now);
        if (!inNight(date) || o.sessionActive) return false;
        return !isDone(o.rituals, 'noite', date);
    }

    // Convites de RemindersCore que os rituais escondem agora
    function hiddenInvites(opts) {
        const o = opts || {};
        const date = toDate(o.now);
        const hidden = [];
        if (o.focusedToday || isDone(o.rituals, 'manha', date)) hidden.push('morning');
        if (isDone(o.rituals, 'noite', date)) hidden.push('closeDay');
        return hidden;
    }

    // ── Rascunhos: sair e voltar no mesmo dia retoma do mesmo ponto ──
    function draftFor(drafts, kind, now) {
        const map = drafts && typeof drafts === 'object' ? drafts : {};
        const draft = map[kind];
        if (!draft || typeof draft !== 'object') return null;
        return draft.date === ritualDay(now) ? draft : null;
    }

    function withDraft(drafts, kind, now, data) {
        if (!KINDS.includes(kind)) return Object.assign({}, drafts || {});
        const next = Object.assign({}, drafts && typeof drafts === 'object' ? drafts : {});
        next[kind] = Object.assign({}, data || {}, { date: ritualDay(now), updatedAt: toDate(now).getTime() });
        return next;
    }

    function withoutDraft(drafts, kind) {
        const next = Object.assign({}, drafts && typeof drafts === 'object' ? drafts : {});
        delete next[kind];
        return next;
    }

    // Grava o ritual concluído do dia (as respostas ficam guardadas, só neste navegador)
    function markDone(rituals, kind, now, record) {
        const map = Object.assign({}, rituals && typeof rituals === 'object' ? rituals : {});
        if (!KINDS.includes(kind)) return map;
        const day = ritualDay(now);
        map[day] = Object.assign({}, map[day] || {});
        map[day][kind] = Object.assign({}, record || {}, { doneAt: toDate(now).getTime() });
        return map;
    }

    // Gratidões e reflexões guardadas, da mais recente para a mais antiga
    function nightEntries(rituals) {
        const map = rituals && typeof rituals === 'object' ? rituals : {};
        return Object.keys(map).sort().reverse()
            .map(date => ({ date, noite: map[date] && map[date].noite }))
            .filter(x => x.noite && x.noite.doneAt);
    }

    /**
     * Prioridade escolhida na manhã chega a Hoje (M02): a tarefa vai para o topo
     * de Hoje com a duração escolhida; "Outra coisa" vira uma tarefa nova no topo.
     *   choice — { taskId?, title, minutes, id }
     * Devolve { tasks, taskId }.
     */
    function applyMorningPriority(tasks, choice, now) {
        const list = Array.isArray(tasks) ? tasks : [];
        const c = choice || {};
        const TC = global.TasksCore;
        const minutes = Number(c.minutes) > 0 ? Math.round(Number(c.minutes)) : null;
        const existing = c.taskId && TC ? list.find(t => t && t.id === c.taskId && !t.completedAt && !t.recurrence && !t.skipped) : null;
        if (existing) {
            let next = TC.scheduleTask(list, existing.id, 'hoje', TC.isoDate(toDate(now)), { top: true });
            if (minutes) next = TC.updateTask(next, existing.id, { estimateMin: minutes }, { occurrenceOnly: true });
            return { tasks: next, taskId: existing.id };
        }
        const title = typeof c.title === 'string' ? c.title.trim() : '';
        if (!title || !TC) return { tasks: list.slice(), taskId: null };
        const id = c.id || 'task-' + toDate(now).getTime();
        const next = TC.createTask(list, { id, title, list: 'hoje', atTop: true, estimateMin: minutes || undefined, now: toDate(now).getTime() });
        return { tasks: next, taskId: next.some(t => t.id === id) ? id : null };
    }

    /**
     * Proteção que vale para a noite (Encerramento): perfis ligados com horário
     * em vigor agora ou que começa nas próximas horas.
     * Devolve [{ name, from, to, active }] com horários 'HH:MM'.
     */
    function nightProtection(profiles, now, config) {
        const BC = global.BlockerCore;
        if (!BC || (config && config.enabled === false)) return [];
        const date = toDate(now);
        const out = [];
        for (const p of Array.isArray(profiles) ? profiles : []) {
            if (!p || p.enabled === false || !(p.sites || []).length) continue;
            const schedule = p.rules && p.rules.schedule;
            if (!schedule || !schedule.enabled) continue;
            const occ = BC.nextScheduleOccurrence(schedule, date);
            if (!occ || !occ.endsAt) continue;
            const minutesUntil = occ.active ? 0 : occ.minutesUntilStart;
            if (minutesUntil > NIGHT_LOOKAHEAD_MIN) continue;
            out.push({
                name: p.name,
                active: !!occ.active,
                from: occ.from,
                to: `${String(occ.endsAt.getHours()).padStart(2, '0')}:${String(occ.endsAt.getMinutes()).padStart(2, '0')}`
            });
        }
        return out;
    }

    global.RitualsCore = {
        KINDS,
        MORNING_FROM,
        MORNING_UNTIL,
        NIGHT_FROM,
        NIGHT_UNTIL,
        ritualDay,
        isDone,
        morningInvite,
        nightInvite,
        hiddenInvites,
        draftFor,
        withDraft,
        withoutDraft,
        markDone,
        nightEntries,
        applyMorningPriority,
        nightProtection
    };
})(typeof self !== 'undefined' ? self : this);
