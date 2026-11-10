// ============================================================
// TASKS CORE — tarefas (o que fazer), separadas de sessões e intenção
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Todas as funções que alteram devolvem um array novo (não mutam a entrada).
//
// Tarefa: { id, title, list: 'hoje'|'depois', plannedFor?, order, estimateMin?,
//           recurrence?: { days: [0..6] }, createdAt, completedAt? }
//
// Tarefa com `recurrence` é um MODELO (a rotina): não aparece na lista.
// Nos dias da regra, materializeRecurring cria a tarefa do dia
// ({ fromRecurrence: idDoModelo, date: 'YYYY-MM-DD' }), que é concluída
// sozinha e vira histórico na virada do dia (E05, E06).
//
// `intention` numa tarefa é opcional e legado da 1.2.0 (intenção sugerida):
// é copiada para a sessão ao começar o foco, nunca o contrário.
(function (global) {
    'use strict';

    const LISTS = ['hoje', 'depois'];
    const DAILY = [0, 1, 2, 3, 4, 5, 6];
    const WEEKDAYS = [1, 2, 3, 4, 5];
    const HOME_MAX = 3; // só apresentação: Hoje pode guardar mais
    const HISTORY_MAX = 2000;

    function isoDate(d) {
        const date = d instanceof Date ? d : new Date(d);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function dateFromKey(key) {
        if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
        const date = new Date(key + 'T12:00:00');
        return isoDate(date) === key ? date : null;
    }

    function addDays(key, days) {
        const date = dateFromKey(key);
        date.setDate(date.getDate() + days);
        return isoDate(date);
    }

    function toMs(value) {
        if (typeof value === 'number') return value;
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'string') {
            const ms = Date.parse(value);
            return isNaN(ms) ? null : ms;
        }
        return null;
    }

    function dayOf(value) {
        const ms = toMs(value);
        return ms === null ? null : isoDate(new Date(ms));
    }

    function normalizeDays(days) {
        if (!Array.isArray(days)) return [];
        return Array.from(new Set(days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort();
    }

    // Valida uma tarefa vinda do storage ou do sync. Campos desconhecidos são
    // descartados; tarefa sem id ou sem título vira null.
    function normalizeTask(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = raw.id === undefined || raw.id === null ? '' : String(raw.id);
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        if (!id || !title) return null;

        const task = {
            id,
            title,
            list: LISTS.includes(raw.list) ? raw.list : 'hoje',
            order: Number.isFinite(raw.order) ? raw.order : 0,
            createdAt: toMs(raw.createdAt) || 0
        };

        const estimate = Number(raw.estimateMin);
        if (Number.isFinite(estimate) && estimate > 0) task.estimateMin = Math.round(estimate);

        if (raw.recurrence && typeof raw.recurrence === 'object') {
            const days = normalizeDays(raw.recurrence.days);
            if (days.length) task.recurrence = { days };
        }

        if (!task.recurrence) {
            const completedAt = toMs(raw.completedAt);
            if (completedAt) task.completedAt = completedAt;
            if (raw.fromRecurrence !== undefined && raw.fromRecurrence !== null && typeof raw.date === 'string') {
                task.fromRecurrence = String(raw.fromRecurrence);
                task.date = raw.date;
                if (raw.skipped && !completedAt) task.skipped = true;
            }
            if (!task.fromRecurrence && task.list === 'depois' && dateFromKey(raw.plannedFor)) task.plannedFor = raw.plannedFor;
        }

        if (typeof raw.intention === 'string' && raw.intention.trim()) task.intention = raw.intention.trim();
        return task;
    }

    function normalizeTasks(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const result = [];
        for (const raw of list) {
            const task = normalizeTask(raw);
            if (!task || seen.has(task.id)) continue;
            seen.add(task.id);
            result.push(task);
        }
        return result;
    }

    function isTemplate(task) {
        return !!(task && task.recurrence);
    }

    function isDone(task) {
        return !!(task && task.completedAt);
    }

    function isDueOn(template, date) {
        if (!isTemplate(template)) return false;
        const d = date instanceof Date ? date : new Date(date);
        return template.recurrence.days.includes(d.getDay());
    }

    function byOrder(a, b) {
        return (a.order - b.order) || (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }

    // Tarefas que a pessoa vê (sem os modelos de rotina), Hoje antes de Depois.
    function visibleTasks(tasks) {
        return (tasks || [])
            .filter(t => t && !isTemplate(t) && !t.skipped)
            .sort((a, b) => (LISTS.indexOf(a.list) - LISTS.indexOf(b.list)) || byOrder(a, b));
    }

    function listTasks(tasks, list) {
        return visibleTasks(tasks).filter(t => t.list === list);
    }

    function openToday(tasks) {
        return listTasks(tasks, 'hoje').filter(t => !isDone(t));
    }

    // Próximo passo: a primeira tarefa aberta de Hoje, na ordem escolhida (E03).
    function nextStep(tasks) {
        return openToday(tasks)[0] || null;
    }

    function nextOrder(tasks, list, atTop) {
        const orders = (tasks || []).filter(t => t.list === list).map(t => t.order);
        if (!orders.length) return 0;
        return atTop ? Math.min(...orders) - 1 : Math.max(...orders) + 1;
    }

    // Cria uma tarefa e a coloca no fim (ou no topo) da lista.
    // Com `recurrence`, cria o modelo; materializeRecurring gera a do dia.
    function createTask(tasks, fields) {
        const f = fields || {};
        const list = LISTS.includes(f.list) ? f.list : 'hoje';
        const task = normalizeTask({
            id: f.id,
            title: f.title,
            list,
            plannedFor: f.plannedFor,
            order: nextOrder(tasks, list, !!f.atTop),
            estimateMin: f.estimateMin,
            recurrence: f.recurrence,
            intention: f.intention,
            createdAt: f.now || Date.now()
        });
        if (!task) return (tasks || []).slice();
        return (tasks || []).concat([task]);
    }

    function mapTask(tasks, id, fn) {
        return (tasks || []).map(t => (t.id === id ? fn(Object.assign({}, t)) : t));
    }

    // Concluir não cria sessões nem mexe na estimativa (E01).
    function completeTask(tasks, id, now) {
        return mapTask(tasks, id, t => {
            if (isTemplate(t) || t.completedAt) return t;
            t.completedAt = now || Date.now();
            return t;
        });
    }

    function reopenTask(tasks, id) {
        return mapTask(tasks, id, t => {
            delete t.completedAt;
            return t;
        });
    }

    function moveToList(tasks, id, list) {
        const target = (tasks || []).find(t => t.id === id);
        if (!target || target.list === list) return (tasks || []).slice();
        const order = nextOrder(tasks.filter(t => t.id !== id), list, false);
        return mapTask(tasks, id, t => {
            delete t.plannedFor;
            return Object.assign(t, { list, order });
        });
    }

    function moveToToday(tasks, id) {
        return moveToList(tasks, id, 'hoje');
    }

    function moveToLater(tasks, id) {
        return moveToList(tasks, id, 'depois');
    }

    // 'hoje' e 'semdia' são destinos especiais. Só Hoje aceita posição manual.
    function scheduleTask(tasks, id, destination, today, { top = false, beforeId } = {}) {
        const task = tasks.find(t => t.id === id);
        if (!task || isTemplate(task) || isDone(task) || task.skipped) return tasks;
        if (dateFromKey(destination) && destination <= today) destination = 'hoje';
        if (destination !== 'hoje' && (task.fromRecurrence || (destination !== 'semdia' && !dateFromKey(destination)))) return tasks;
        const current = task.list === 'hoje' ? 'hoje' : task.plannedFor || 'semdia';
        if (destination === current && !top && beforeId === undefined) return tasks;
        if (destination !== 'hoje') {
            const order = nextOrder(tasks, 'depois', false);
            return mapTask(tasks, id, t => {
                delete t.plannedFor;
                if (destination !== 'semdia') t.plannedFor = destination;
                return Object.assign(t, { list: 'depois', order });
            });
        }
        const siblings = listTasks(tasks, 'hoje').filter(t => !isDone(t) && t.id !== id);
        const before = siblings.findIndex(t => t.id === beforeId);
        const position = top ? 0 : before === -1 ? siblings.length : before;
        siblings.splice(position, 0, task);
        const orders = new Map(siblings.map((t, i) => [t.id, i]));
        return tasks.map(t => {
            if (!orders.has(t.id)) return t;
            const next = { ...t, order: orders.get(t.id), list: 'hoje' };
            delete next.plannedFor;
            return next;
        });
    }

    // Troca de posição com a vizinha aberta da mesma lista (delta -1 sobe, +1 desce).
    function moveTask(tasks, id, delta) {
        const target = (tasks || []).find(t => t.id === id);
        if (!target || isDone(target) || isTemplate(target)) return (tasks || []).slice();
        const siblings = listTasks(tasks, target.list).filter(t => !isDone(t));
        const idx = siblings.findIndex(t => t.id === id);
        const other = siblings[idx + (delta < 0 ? -1 : 1)];
        if (!other) return tasks.slice();

        // Renumera a lista antes de trocar, para ordens repetidas não travarem a troca
        const renumbered = new Map(listTasks(tasks, target.list).map((t, i) => [t.id, i]));
        return tasks.map(t => {
            if (!renumbered.has(t.id)) return t;
            let order = renumbered.get(t.id);
            if (t.id === id) order = renumbered.get(other.id);
            else if (t.id === other.id) order = renumbered.get(id);
            return Object.assign({}, t, { order });
        });
    }

    // Edita título/estimativa/intenção. Tarefa do dia e seu modelo andam juntos.
    function updateTask(tasks, id, patch, { occurrenceOnly = false } = {}) {
        const target = (tasks || []).find(t => t.id === id);
        if (!target) return (tasks || []).slice();
        const p = patch || {};
        const linked = new Set([id]);
        const templateId = isTemplate(target) ? target.id : target.fromRecurrence;
        if (templateId && !occurrenceOnly) {
            tasks.forEach(t => {
                if (t.id === templateId || (t.fromRecurrence === templateId && !isDone(t))) linked.add(t.id);
            });
        }
        return tasks.map(t => {
            if (!linked.has(t.id)) return t;
            const next = Object.assign({}, t);
            if (typeof p.title === 'string' && p.title.trim()) next.title = p.title.trim();
            if ('estimateMin' in p) {
                const est = Number(p.estimateMin);
                if (Number.isFinite(est) && est > 0) next.estimateMin = Math.round(est);
                else delete next.estimateMin;
            }
            if ('intention' in p) {
                const intention = typeof p.intention === 'string' ? p.intention.trim() : '';
                if (intention) next.intention = intention;
                else delete next.intention;
            }
            if (p.recurrence && isTemplate(next)) {
                const days = normalizeDays(p.recurrence.days);
                if (days.length) next.recurrence = { days };
            }
            return next;
        });
    }

    function removeTask(tasks, id) {
        return (tasks || []).filter(t => t.id !== id);
    }

    // Mantém uma marca invisível até amanhã para a rotina não reaparecer hoje.
    function skipOccurrence(tasks, id) {
        return mapTask(tasks, id, t => t.fromRecurrence && !isDone(t) ? { ...t, skipped: true } : t);
    }

    // Encerra a rotina: o modelo sai e as tarefas já criadas viram tarefas comuns.
    function stopRecurrence(tasks, id) {
        const target = (tasks || []).find(t => t.id === id);
        if (!target) return (tasks || []).slice();
        const templateId = isTemplate(target) ? target.id : target.fromRecurrence;
        if (!templateId) return tasks.slice();
        return tasks
            .filter(t => t.id !== templateId && !(t.fromRecurrence === templateId && t.skipped))
            .map(t => {
                if (t.fromRecurrence !== templateId) return t;
                const next = Object.assign({}, t);
                delete next.fromRecurrence;
                delete next.date;
                return next;
            });
    }

    // Transforma uma tarefa comum em rotina nos dias escolhidos. A tarefa vira
    // a tarefa de hoje da rotina quando hoje está entre os dias; senão, fica
    // como tarefa comum (já está na lista) e a rotina começa no próximo dia da regra.
    function makeRecurring(tasks, id, days, now, newTemplateId) {
        const target = (tasks || []).find(t => t.id === id);
        const clean = normalizeDays(days);
        if (!target || isTemplate(target) || target.fromRecurrence || !clean.length) return (tasks || []).slice();
        const at = now || Date.now();
        const templateId = newTemplateId || 'routine-' + at;
        const template = normalizeTask({
            id: templateId,
            title: target.title,
            list: 'hoje',
            order: target.order,
            estimateMin: target.estimateMin,
            intention: target.intention,
            recurrence: { days: clean },
            createdAt: at
        });
        const d = new Date(at);
        const list = tasks.concat([template]);
        if (!isDueOn(template, d)) return list;
        const moved = scheduleTask(list, id, 'hoje', isoDate(d));
        return mapTask(moved, id, t => Object.assign(t, { fromRecurrence: templateId, date: isoDate(d) }));
    }

    // Dias da rotina a que a tarefa pertence (ou [] para tarefa comum).
    function recurrenceDays(tasks, task) {
        if (!task) return [];
        if (isTemplate(task)) return task.recurrence.days.slice();
        const template = task.fromRecurrence ? (tasks || []).find(t => t.id === task.fromRecurrence) : null;
        return template && isTemplate(template) ? template.recurrence.days.slice() : [];
    }

    function instanceId(templateId, iso) {
        return `${templateId}@${iso}`;
    }

    // Cria a tarefa do dia de cada rotina cuja regra inclui o dia da semana de `date`.
    // Idempotente: não duplica a tarefa do mesmo dia.
    function materializeRecurring(tasks, date) {
        const d = date instanceof Date ? date : new Date(date || Date.now());
        const iso = isoDate(d);
        const list = (tasks || []).slice();
        for (const template of tasks || []) {
            if (!isDueOn(template, d)) continue;
            const id = instanceId(template.id, iso);
            const exists = list.some(t => t.id === id || (t.fromRecurrence === template.id && t.date === iso));
            if (exists) continue;
            const instance = {
                id,
                title: template.title,
                list: 'hoje',
                order: nextOrder(list, 'hoje', false),
                createdAt: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
                fromRecurrence: template.id,
                date: iso
            };
            if (template.estimateMin) instance.estimateMin = template.estimateMin;
            if (template.intention) instance.intention = template.intention;
            list.push(instance);
        }
        return list;
    }

    function historyEntry(task) {
        const entry = { id: task.id, title: task.title, completedAt: task.completedAt };
        if (task.fromRecurrence) entry.fromRecurrence = task.fromRecurrence;
        return entry;
    }

    function appendHistory(history, entries) {
        const list = Array.isArray(history) ? history.slice() : [];
        const ids = new Set(list.map(h => h.id));
        for (const entry of entries) {
            if (ids.has(entry.id)) continue;
            ids.add(entry.id);
            list.push(entry);
        }
        return list.length > HISTORY_MAX ? list.slice(-HISTORY_MAX) : list;
    }

    // Move concluídas para o histórico. `beforeIso` limita às concluídas antes
    // desse dia; `includeRecurring: false` deixa as tarefas do dia de rotina onde estão.
    function archiveCompleted(tasks, history, options) {
        const opts = options || {};
        const includeRecurring = opts.includeRecurring !== false;
        const archived = [];
        const kept = [];
        for (const t of tasks || []) {
            const eligible = isDone(t) && !isTemplate(t) &&
                (includeRecurring || !t.fromRecurrence) &&
                (!opts.beforeIso || dayOf(t.completedAt) < opts.beforeIso);
            if (eligible) archived.push(historyEntry(t));
            else kept.push(t);
        }
        return { tasks: kept, history: appendHistory(history, archived), archived: archived.length };
    }

    // Virada do dia: concluídas de dias anteriores viram histórico em vez de
    // sumir (E06); tarefas de rotina de dias passados não concluídas saem
    // (a rotina gera a de hoje). Tarefas comuns abertas continuam.
    function rolloverDay(tasks, history, date) {
        const iso = isoDate(date instanceof Date ? date : new Date(date || Date.now()));
        const archivedResult = archiveCompleted(tasks, history, { beforeIso: iso });
        let remaining = archivedResult.tasks.filter(t => !(t.fromRecurrence && !isDone(t) && t.date < iso));
        const dropped = archivedResult.tasks.length - remaining.length;
        const arriving = remaining.filter(t => t.plannedFor && t.plannedFor <= iso && !isDone(t))
            .sort((a, b) => a.plannedFor.localeCompare(b.plannedFor) || byOrder(a, b));
        if (arriving.length) {
            const firstOrder = nextOrder(remaining, 'hoje', false);
            const orders = new Map(arriving.map((task, i) => [task.id, i + firstOrder]));
            remaining = remaining.map(task => {
                if (!orders.has(task.id)) return task;
                const next = { ...task, list: 'hoje', order: orders.get(task.id) };
                delete next.plannedFor;
                return next;
            });
        }
        return {
            tasks: remaining,
            history: archivedResult.history,
            changed: archivedResult.archived > 0 || dropped > 0 || arriving.length > 0
        };
    }

    // Quantas sessões concluídas a tarefa já teve no dia (para os pontos da interface antiga).
    function sessionsDoneToday(sessions, taskId, date) {
        const iso = isoDate(date instanceof Date ? date : new Date(date || Date.now()));
        return (sessions || []).filter(s => s && s.taskId === taskId && s.status === 'completed' &&
            dayOf(s.startedAt) === iso).length;
    }

    global.TasksCore = {
        LISTS,
        DAILY,
        WEEKDAYS,
        HOME_MAX,
        isoDate,
        dateFromKey,
        addDays,
        dayOf,
        normalizeTask,
        normalizeTasks,
        isTemplate,
        isDone,
        isDueOn,
        visibleTasks,
        listTasks,
        openToday,
        nextStep,
        createTask,
        completeTask,
        reopenTask,
        moveToToday,
        moveToLater,
        scheduleTask,
        moveTask,
        updateTask,
        removeTask,
        skipOccurrence,
        stopRecurrence,
        makeRecurring,
        recurrenceDays,
        materializeRecurring,
        archiveCompleted,
        rolloverDay,
        sessionsDoneToday
    };
})(typeof self !== 'undefined' ? self : this);
