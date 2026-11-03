// ============================================================
// TODAY CORE — qual estado a tela Hoje mostra
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Uma única função decide o estado a partir das tarefas, do pomodoro (estado
// gravado pelo SW), da hora e do convite do momento. Assim Hoje, o resumo e a
// Proteção nunca discordam (M13): com sessão em andamento não há "Começar foco"
// nem convite; sessão pausada é sempre "pausada", nunca "ativa" (M01).
//
// Estados: repouso-vazio · repouso · preparacao · ativa · pausada · concluida ·
//          noite · falha
(function (global) {
    'use strict';

    const NIGHT_FROM = 21;   // 21h: convite para encerrar o dia
    const NIGHT_UNTIL = 4;   // madrugada ainda é "noite"
    const COMPLETED_TTL_MS = 12 * 60 * 60 * 1000;

    function toMs(now) {
        if (now instanceof Date) return now.getTime();
        return typeof now === 'number' ? now : Date.now();
    }

    function isNight(date) {
        const h = date.getHours();
        return h >= NIGHT_FROM || h < NIGHT_UNTIL;
    }

    function isBreak(phase) {
        return phase === 'pause' || phase === 'longPause';
    }

    function remainingSeconds(pomodoro, nowMs) {
        if (pomodoro.isRunning && pomodoro.expectedEndTime) {
            return Math.max(0, Math.ceil((pomodoro.expectedEndTime - nowMs) / 1000));
        }
        return Math.max(0, Number(pomodoro.timeRemaining) || 0);
    }

    function taskTitle(tasks, id) {
        const task = id ? (tasks || []).find(t => t && t.id === id) : null;
        return task ? task.title : null;
    }

    function openTasks(tasks, list) {
        return (tasks || []).filter(t => t && !t.recurrence && !t.completedAt && (!list || t.list === list));
    }

    // Próxima tarefa aberta de Hoje na ordem escolhida (mesma regra de TasksCore.nextStep).
    function nextOpen(tasks, exceptId) {
        const today = openTasks(tasks, 'hoje')
            .filter(t => t.id !== exceptId)
            .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
        return today[0] || null;
    }

    function sessionView(pomodoro, session, tasks, nowMs) {
        const remaining = remainingSeconds(pomodoro, nowMs);
        const total = Math.max(1, Number(pomodoro.totalDuration) || remaining || 1);
        const kind = isBreak(pomodoro.phase) ? pomodoro.phase : 'focus';
        const view = {
            kind,
            running: !!pomodoro.isRunning,
            remainingSec: remaining,
            totalSec: total,
            progress: Math.min(1, Math.max(0, 1 - remaining / total)),
            endsAt: nowMs + remaining * 1000,
            taskId: null,
            title: null,
            intention: null,
            protected: !!(pomodoro.protection && pomodoro.protection.active)
        };
        if (kind === 'focus' && session) {
            view.taskId = session.taskId || null;
            view.title = session.title || taskTitle(tasks, session.taskId);
            view.intention = session.intention || null;
        }
        return view;
    }

    /**
     * resolveTodayState({ tasks, session?, pomodoro, now, reminders|invite, preparing, error })
     *   tasks     — ora_tasks (normalizadas)
     *   session   — sessão em andamento (padrão: pomodoro.session)
     *   pomodoro  — ora_pomodoro_state
     *   now       — Date ou ms
     *   reminders — convite escolhido por RemindersCore.pickInvite (ou null)
     *   preparing — a preparação do foco está aberta
     *   error     — falha de gravação ou de rede a mostrar (ou null)
     * Devolve { state, night, next, openToday, session, completed, invite, error }.
     */
    function resolveTodayState(input) {
        const i = input || {};
        const tasks = Array.isArray(i.tasks) ? i.tasks : [];
        const nowMs = toMs(i.now);
        const date = new Date(nowMs);
        const pomodoro = i.pomodoro && typeof i.pomodoro === 'object' ? i.pomodoro : null;
        const session = i.session !== undefined ? i.session : (pomodoro && pomodoro.session) || null;
        const invite = i.reminders !== undefined ? i.reminders : (i.invite || null);
        const night = isNight(date);

        const result = {
            state: 'repouso',
            night,
            next: null,
            openToday: openTasks(tasks, 'hoje').length,
            session: null,
            completed: null,
            invite: null,
            error: i.error || null
        };

        if (pomodoro) {
            const focusInProgress = pomodoro.phase === 'focus' && (session || pomodoro.isRunning);
            const breakRunning = isBreak(pomodoro.phase) && (pomodoro.isRunning ||
                (pomodoro.timeRemaining < pomodoro.totalDuration));

            // Em andamento: atividade antes de tudo, sem convites (E13, M13)
            if (focusInProgress || breakRunning) {
                result.session = sessionView(pomodoro, session, tasks, nowMs);
                result.state = pomodoro.isRunning ? 'ativa' : 'pausada';
                return result;
            }

            // Foco terminou e a pausa ainda não começou: sessão concluída
            const done = pomodoro.completed;
            if (isBreak(pomodoro.phase) && done && nowMs - (done.endedAt || 0) < COMPLETED_TTL_MS) {
                const task = done.taskId ? tasks.find(t => t && t.id === done.taskId) : null;
                const after = nextOpen(tasks, done.taskId);
                result.completed = {
                    title: done.title || (task && task.title) || null,
                    taskId: task ? task.id : null,
                    taskDone: !!(task && task.completedAt),
                    plannedMin: done.plannedMin,
                    focusedMin: done.focusedMin,
                    intention: done.intention || null,
                    breakKind: pomodoro.phase,
                    breakMin: Math.round((pomodoro.totalDuration || 0) / 60),
                    after: after ? { id: after.id, title: after.title } : null
                };
                result.state = i.preparing ? 'preparacao' : 'concluida';
                return result;
            }
        }

        // Repouso
        const next = nextOpen(tasks, null);
        if (next) {
            result.next = { id: next.id, title: next.title, estimateMin: next.estimateMin || null, first: true };
        }
        result.invite = invite || null;

        if (i.preparing) result.state = 'preparacao';
        else if (result.error) result.state = 'falha';
        else if (night) result.state = 'noite';
        else result.state = next ? 'repouso' : 'repouso-vazio';
        return result;
    }

    global.TodayCore = {
        NIGHT_FROM,
        isNight,
        resolveTodayState
    };
})(typeof self !== 'undefined' ? self : this);
