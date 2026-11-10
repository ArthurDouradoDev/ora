// Painel de tarefas de Hoje. O armazenamento continua compartilhado entre abas.
const TaskSystem = {
    STORAGE_KEY: 'ora_tasks',
    HISTORY_KEY: 'ora_tasks_history',
    ESTIMATES: [15, 25, 50, 60, 90],
    tasks: [],
    history: [],
    open: false,
    view: 'main',
    expanded: { upcoming: true, unscheduled: false, done: false },
    destination: 'hoje',
    pendingSave: null,
    writeQueue: Promise.resolve(),

    async init() {
        const ids = {
            home: 'view-hoje', chip: 'tasks-chip', count: 'tasks-count', panel: 'tasks-panel', close: 'tasks-close',
            back: 'tasks-back', title: 'tasks-panel-title', options: 'tasks-options', scroll: 'tasks-scroll',
            content: 'tasks-content', capture: 'tasks-capture', form: 'tasks-add-form', input: 'tasks-add-input',
            destination: 'tasks-destination', notice: 'tasks-notice', undo: 'tasks-undo', live: 'tasks-live', alert: 'tasks-alert',
            alertTitle: 'tasks-alert-title', retry: 'tasks-alert-retry', dismiss: 'tasks-alert-dismiss'
        };
        this.elements = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, document.getElementById(id)]));
        this.bindEvents();
        TaskMenu.init();
        TaskDrag.init();
        await this.applyDayRollover();
    },

    bindEvents() {
        const el = this.elements;
        el.chip.addEventListener('click', () => this.open ? this.hide() : this.show());
        el.close.addEventListener('click', () => this.hide());
        el.back.addEventListener('click', () => this.openView('main'));
        el.options.addEventListener('click', () => TaskMenu.toggle(el.options, 'panel'));
        el.destination.addEventListener('click', () => TaskMenu.toggle(el.destination, 'capture'));
        el.form.addEventListener('submit', event => { event.preventDefault(); this.captureTask(); });
        el.retry.addEventListener('click', () => this.pendingSave?.retry());
        el.dismiss.addEventListener('click', () => this.showSaveError(null));
        el.panel.addEventListener('keydown', event => this.onKey(event));
        el.content.addEventListener('click', event => this.onClick(event));
        el.content.addEventListener('submit', event => {
            if (event.target.id !== 'task-routine-form') return;
            event.preventDefault();
            this.addRoutine(event.target.elements['routine-title']);
        });
        el.content.addEventListener('input', event => {
            if (event.target.id === 'task-routine-input') this.routineDraft = event.target.value;
        });
        el.content.addEventListener('change', event => {
            if (!event.target.matches('.check')) return;
            const row = event.target.closest('[data-id]');
            if (row.dataset.archived) this.reopenHistory(row.dataset.id);
            else this.setDone(row.dataset.id, event.target.checked, true);
        });
        el.content.addEventListener('contextmenu', event => {
            const button = event.target.closest('.task')?.querySelector('[data-action="menu"]');
            if (!button) return;
            event.preventDefault();
            TaskMenu.show(button, 'task', { x: event.clientX, y: event.clientY });
        });
        el.content.addEventListener('toggle', event => {
            if (event.target.isConnected && event.target.id === 'tasks-done') this.expanded.done = event.target.open;
        }, true);

        window.addEventListener('ora:locale-changed', () => this.render());
        window.addEventListener('ora:route', event => {
            if (event.detail.view !== 'hoje') this.hide({ returnFocus: false });
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.day !== this.today()) this.applyDayRollover();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !(this.STORAGE_KEY in changes || this.HISTORY_KEY in changes)) return;
            const tasks = this.STORAGE_KEY in changes ? TasksCore.normalizeTasks(changes[this.STORAGE_KEY].newValue) : this.tasks;
            const history = this.HISTORY_KEY in changes ? changes[this.HISTORY_KEY].newValue : this.history;
            this.useRecords(tasks, history);
            if (this.day !== this.today() || tasks.some(task => !task.completedAt && task.plannedFor <= this.today())) {
                this.applyDayRollover();
            }
        });
    },

    today() { return TasksCore.isoDate(new Date()); },
    tomorrow() { return TasksCore.addDays(this.today(), 1); },
    locale() { return document.documentElement.lang || 'pt-BR'; },
    taskById(id) { return this.tasks.find(task => task.id === id); },
    openTasks() { return TasksCore.visibleTasks(this.tasks).filter(task => !TasksCore.isDone(task)); },
    hasLater() { return this.openTasks().some(task => task.list === 'depois'); },

    dateLabel(key, short = false) {
        if (key === 'hoje' || key === this.today()) return t('nav.today');
        if (key === 'semdia') return t('tasks.unscheduled');
        if (key === this.tomorrow()) return t('tasks.tomorrow');
        const date = TasksCore.dateFromKey(key);
        const nextWeek = key <= TasksCore.addDays(this.today(), 6) && key > this.today();
        const options = !short && nextWeek ? { weekday: 'long', day: 'numeric' }
            : { day: 'numeric', month: 'short', ...(key.slice(0, 4) !== this.today().slice(0, 4) ? { year: 'numeric' } : {}) };
        const label = new Intl.DateTimeFormat(this.locale(), options).format(date);
        return label[0].toLocaleUpperCase(this.locale()) + label.slice(1);
    },

    async show({ focus = true, browse = false } = {}) {
        if (RouterSystem.current()?.view !== 'hoje') RouterSystem.navigate('hoje');
        const opening = !this.open;
        if (opening) {
            this.open = true;
            this.view = 'main';
            this.destination = 'hoje';
            this.clearNotice();
            this.animatePanel(true, () => this.elements.home.setAttribute('data-tasks-open', ''));
            this.elements.panel.inert = false;
            this.elements.chip.setAttribute('aria-expanded', 'true');
            this.render();
            this.elements.scroll.scrollTop = this.mainScroll || 0;
            window.dispatchEvent(new CustomEvent('ora:tasks-panel', { detail: { open: true } }));
        }
        if (this.day !== this.today()) await this.applyDayRollover();
        if (!focus || !this.open) return;
        if (!browse) { this.elements.input.focus({ preventScroll: true }); return; }
        if (this.view !== 'main') this.openView('main');
        const next = TasksCore.nextStep(this.tasks);
        if (next) return this.focusRow(next.id);
        const section = this.openTasks().some(task => task.plannedFor) ? 'upcoming' : 'unscheduled';
        this.toggleSection(section, true)?.focus();
    },

    hide({ returnFocus = true } = {}) {
        if (!this.open) return;
        const el = this.elements;
        const hadFocus = el.panel.contains(document.activeElement) || TaskMenu.hasFocus();
        if (this.rename) this.finishRename(true, false);
        TaskMenu.close(false);
        TaskDrag.cancel();
        if (this.view === 'main') this.mainScroll = el.scroll.scrollTop;
        this.open = false;
        this.animatePanel(false, () => el.home.removeAttribute('data-tasks-open'));
        el.panel.inert = true;
        el.chip.setAttribute('aria-expanded', 'false');
        if (returnFocus && hadFocus) el.chip.focus({ preventScroll: true });
        window.dispatchEvent(new CustomEvent('ora:tasks-panel', { detail: { open: false } }));
    },

    animatePanel(open, apply) {
        const center = document.getElementById('today-main');
        if (Motion.reduced() || matchMedia('(max-width: 68rem)').matches || document.documentElement.dataset.view !== 'hoje') {
            apply();
            return;
        }
        const flip = () => {
            const before = center.getBoundingClientRect();
            center._oraMotion?.tasks?.cancel();
            apply();
            const after = center.getBoundingClientRect();
            const dx = (before.left + before.width / 2) - (after.left + after.width / 2);
            const dy = before.top - after.top;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                Motion.play(center, [
                    { transform: `translate(${dx}px, ${dy}px)` },
                    { transform: 'none' }
                ], { duration: 300, easing: 'ease-in-out', fill: 'backwards', channel: 'tasks' });
            }
        };
        const panel = this.elements.panel;
        if (open) {
            flip();
            Motion.play(panel, [{ opacity: 0, transform: 'translateX(32px)' }, { opacity: 1, transform: 'none' }], { duration: 300, channel: 'tasks' });
        } else {
            const out = Motion.play(panel, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(32px)' }], { duration: 180, fill: 'forwards', channel: 'tasks' });
            if (!out) { flip(); return; }
            out.finished.then(() => { if (!this.open) flip(); out.cancel(); }, () => {});
        }
    },

    openView(view) {
        const el = this.elements;
        if (this.view === 'main') this.mainScroll = el.scroll.scrollTop;
        this.view = view;
        this.render();
        el.scroll.scrollTop = view === 'main' ? this.mainScroll || 0 : 0;
        (view === 'main' ? el.options : el.title).focus({ preventScroll: true });
    },

    toggleSection(section, open = !this.expanded[section]) {
        this.expanded[section] = open;
        const trigger = this.elements.content.querySelector('[data-section="' + section + '"]');
        if (trigger) {
            trigger.setAttribute('aria-expanded', String(open));
            document.getElementById(trigger.getAttribute('aria-controls')).hidden = !open;
        }
        return trigger;
    },

    // Lê o estado mais recente dentro do lock para ações em abas diferentes
    // comporem a mesma lista, inclusive quando Desfazer vem depois de outra ação.
    withWriteLock(action) {
        if (navigator.locks) return navigator.locks.request('ora-tasks-write', action);
        const run = this.writeQueue.then(action);
        this.writeQueue = run.catch(() => {});
        return run;
    },

    async commit(transform, label, retry) {
        const save = retry && window.LeaveGuard?.beginSave(this.STORAGE_KEY);
        let ok = false;
        try {
            await this.withWriteLock(async () => {
                const now = new Date();
                const stored = await chrome.storage.local.get([this.STORAGE_KEY, this.HISTORY_KEY]);
                const original = TasksCore.normalizeTasks(stored[this.STORAGE_KEY]);
                const history = Array.isArray(stored[this.HISTORY_KEY]) ? stored[this.HISTORY_KEY] : [];
                const rolled = TasksCore.rolloverDay(original, history, now);
                const current = TasksCore.materializeRecurring(rolled.tasks, now);
                const change = transform(current, rolled.history, now);
                const next = TasksCore.normalizeTasks(change.tasks);
                const nextHistory = change.history || rolled.history;
                const writes = {};
                if (JSON.stringify(original) !== JSON.stringify(next)) writes[this.STORAGE_KEY] = next;
                if (JSON.stringify(history) !== JSON.stringify(nextHistory)) writes[this.HISTORY_KEY] = nextHistory;
                if (Object.keys(writes).length) {
                    await chrome.storage.local.set(writes);
                }
                const dayChanged = this.day !== TasksCore.isoDate(now);
                this.day = TasksCore.isoDate(now);
                this.useRecords(next, nextHistory, dayChanged);
                ok = true;
            });
        } catch (error) {
            console.error('[Ora] Tasks could not be saved:', error);
        } finally {
            if (save) LeaveGuard.endSave(save, ok);
        }
        if (ok) {
            if (retry) this.showSaveError(null);
        } else if (retry) {
            this.render();
            this.showSaveError({ label, retry });
        }
        return ok;
    },

    useRecords(tasks, history, force = false) {
        history = Array.isArray(history) ? history : [];
        const changed = JSON.stringify(this.tasks) !== JSON.stringify(tasks) || JSON.stringify(this.history) !== JSON.stringify(history);
        this.tasks = tasks;
        this.history = history;
        if (changed || force) this.render();
        if (changed) window.dispatchEvent(new CustomEvent('ora:tasks', { detail: { tasks } }));
    },

    async applyDayRollover() {
        const ok = await this.commit((tasks, history) => ({ tasks, history }));
        if (!ok) this.render();
        clearTimeout(this.dayTimer);
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 50);
        this.dayTimer = setTimeout(() => this.applyDayRollover(), midnight - Date.now());
    },

    showSaveError(pending) {
        this.pendingSave = pending;
        const el = this.elements;
        el.alert.hidden = !pending;
        if (pending) {
            el.alertTitle.textContent = t('tasks.save_failed', { title: pending.label });
            if (!this.open) this.show({ focus: false });
            el.scroll.scrollTop = 0;
        }
        window.dispatchEvent(new CustomEvent('ora:tasks-error', { detail: pending }));
    },

    async captureTask(request) {
        if (this.capturing) return;
        const input = this.elements.input;
        const raw = request?.raw ?? input.value;
        const title = raw.trim();
        if (!title) { input.focus(); return; }
        const destination = request?.destination ?? this.destination;
        const id = request?.id ?? 'task-' + crypto.randomUUID();
        this.capturing = true;
        const ok = await this.commit((tasks, history, now) => {
            const plannedFor = TasksCore.dateFromKey(destination) && destination > TasksCore.isoDate(now) ? destination : null;
            const list = plannedFor || destination === 'semdia' ? 'depois' : 'hoje';
            return { tasks: tasks.some(task => task.id === id) ? tasks : TasksCore.createTask(tasks, { id, title, list, plannedFor, now: +now }) };
        }, title, () => this.captureTask({ raw, destination, id }));
        this.capturing = false;
        if (!ok) return;
        if (input.value === raw) input.value = '';
        if (this.open && this.view === 'main' && (request || document.activeElement === document.body ||
            document.activeElement === this.elements.form.querySelector('[type="submit"]') ||
            document.activeElement === input)) input.focus({ preventScroll: true });
        const target = TasksCore.dateFromKey(destination) && destination <= this.today() ? 'hoje' : destination;
        this.notice(t('tasks.added', { destination: this.dateLabel(target, true) }));
    },

    async applyMorningPriority(choice) {
        let result;
        const ok = await this.commit((tasks, history, now) => {
            result = RitualsCore.applyMorningPriority(tasks, { id: 'task-' + crypto.randomUUID(), ...choice }, +now);
            return result;
        }, choice.title, () => this.applyMorningPriority(choice));
        return ok && result.taskId ? { taskId: result.taskId } : null;
    },

    async setDone(id, done, fromPanel = false) {
        const task = this.taskById(id);
        if (!task) return false;
        const fallback = this.neighbor(id);
        const ok = await this.commit((tasks, history, now) => ({
            tasks: done ? TasksCore.completeTask(tasks, id, +now) : TasksCore.reopenTask(tasks, id)
        }), task.title, () => this.setDone(id, done, fromPanel));
        if (fromPanel) {
            const row = this.row(id);
            if (row && row.getClientRects().length) {
                this.focusRow(id, '.check');
                if (ok && done) Motion.play(row.querySelector('.check'), [
                    { transform: 'scale(.85)' }, { transform: 'scale(1.12)', offset: .5 }, { transform: 'none' }
                ], { duration: 240, channel: 'done' });
            } else this.focusRow(fallback, '.task-title', this.zoneOf(task));
        }
        if (ok) this.announce(t(done ? 'tasks.completed' : 'tasks.reopened', { title: task.title }));
        return ok;
    },

    async reopenHistory(id) {
        const entry = this.history.find(item => item.id === id);
        if (!entry) return;
        const newId = 'task-' + crypto.randomUUID();
        const ok = await this.commit((tasks, history, now) => history.some(item => item.id === id) ? ({
            tasks: TasksCore.createTask(tasks, { id: newId, title: entry.title, now: +now }),
            history: history.filter(item => item.id !== id)
        }) : { tasks }, entry.title, () => this.reopenHistory(id));
        if (ok) {
            this.elements.title.focus({ preventScroll: true });
            this.announce(t('tasks.reopened', { title: entry.title }));
        }
    },

    zoneOf(task) { return task.list === 'hoje' ? 'hoje' : task.plannedFor || 'semdia'; },

    async schedule(id, destination, options) {
        const task = this.taskById(id);
        if (!task || task.completedAt || task.skipped) return;
        if (task.fromRecurrence && destination !== 'hoje') { this.notice(t('tasks.routine_stays')); return; }
        const ok = await this.commit((tasks, history, now) => ({
            tasks: TasksCore.scheduleTask(tasks, id, destination, TasksCore.isoDate(now), options)
        }), task.title, () => this.schedule(id, destination, options));
        if (ok) {
            const current = this.taskById(id);
            if (!current) return;
            const zone = this.zoneOf(current);
            this.focusRow(id, '.task-title', zone);
            if (options?.top) this.notice(t('tasks.next_changed', { title: task.title }));
            else if (options?.beforeId !== undefined) {
                const today = this.openTasks().filter(item => item.list === 'hoje');
                this.announce(t('tasks.reordered', { title: task.title, position: today.indexOf(current) + 1, total: today.length }));
            } else this.notice(t('tasks.rescheduled', { title: task.title, destination: this.dateLabel(zone, true) }));
        }
    },

    async move(id, delta) {
        const task = this.taskById(id);
        if (task?.list !== 'hoje') return;
        const ok = await this.commit(tasks => ({ tasks: TasksCore.moveTask(tasks, id, delta) }), task.title, () => this.move(id, delta));
        if (!ok) return;
        this.focusRow(id);
        const today = this.openTasks().filter(item => item.list === 'hoje');
        this.announce(t('tasks.reordered', { title: task.title, position: today.findIndex(item => item.id === id) + 1, total: today.length }));
    },

    async remove(id, skip = false) {
        const task = this.taskById(id);
        if (!task || (!!task.fromRecurrence !== skip)) return;
        const fallback = this.neighbor(id);
        let removed;
        const ok = await this.commit(tasks => {
            removed = tasks.find(item => item.id === id && !item.skipped && !item.completedAt && (!!item.fromRecurrence === skip));
            if (!removed) return { tasks };
            return { tasks: skip ? TasksCore.skipOccurrence(tasks, id) : TasksCore.removeTask(tasks, id) };
        }, task.title, () => this.remove(id, skip));
        if (!ok || !removed) return;
        this.focusRow(fallback, '.task-title', this.zoneOf(task));
        this.notice(t(skip ? 'tasks.skipped' : 'tasks.deleted', { title: task.title }), () => this.restoreTask(removed, skip));
    },

    async restoreTask(task, skipped) {
        const ok = await this.commit((tasks, history, now) => {
            if (skipped) return { tasks: tasks.map(item => item.id === task.id && item.skipped ? task : item) };
            if (tasks.some(item => item.id === task.id)) return { tasks };
            const restored = tasks.concat(task);
            return { tasks: TasksCore.rolloverDay(restored, history, now).tasks };
        }, task.title, () => this.restoreTask(task, skipped));
        if (ok) {
            this.notice(t('tasks.undone'));
            this.focusRow(task.id, '.task-title', this.zoneOf(task));
        }
    },

    async duplicate(id) {
        const task = this.taskById(id);
        if (!task) return;
        const newId = 'task-' + crypto.randomUUID();
        const ok = await this.commit((tasks, history, now) => {
            const item = tasks.find(entry => entry.id === id && !entry.skipped);
            if (!item) return { tasks };
            let next = TasksCore.createTask(tasks, { ...item, id: newId, recurrence: null, now: +now });
            if (item.list === 'hoje') {
                const today = TasksCore.listTasks(tasks, 'hoje').filter(entry => !TasksCore.isDone(entry));
                const beforeId = today[today.indexOf(item) + 1]?.id ?? null;
                next = TasksCore.scheduleTask(next, newId, 'hoje', TasksCore.isoDate(now), { beforeId });
            }
            return { tasks: next };
        }, task.title, () => this.duplicate(id));
        if (ok) this.focusRow(newId, '.task-title', this.zoneOf(task));
    },

    async editEstimate(id, estimateMin) {
        const task = this.taskById(id);
        if (!task) return;
        const ok = await this.commit(tasks => ({
            tasks: TasksCore.updateTask(tasks, id, { estimateMin }, { occurrenceOnly: true })
        }), task.title, () => this.editEstimate(id, estimateMin));
        if (ok) this.focusRow(id, '[data-action="menu"]');
    },

    async repeat(id, days) {
        const task = this.taskById(id);
        if (!task || !days.length) return;
        const templateId = task.recurrence ? id : task.fromRecurrence;
        const ok = await this.commit((tasks, history, now) => {
            const updated = templateId ? TasksCore.updateTask(tasks, templateId, { recurrence: { days } })
                : TasksCore.makeRecurring(tasks, id, days, +now, 'routine-' + crypto.randomUUID());
            return { tasks: updated };
        }, task.title, () => this.repeat(id, days));
        if (ok && !task.recurrence) this.focusRow(id, '[data-action="menu"]');
    },

    async addRoutine(input, raw = input.value) {
        const title = raw.trim();
        if (!title) return;
        const id = 'routine-' + crypto.randomUUID();
        const ok = await this.commit((tasks, history, now) => ({
            tasks: TasksCore.materializeRecurring(TasksCore.createTask(tasks, {
                id, title, recurrence: { days: TasksCore.WEEKDAYS }, now: +now
            }), now)
        }), title, () => this.addRoutine(input, raw));
        if (ok && this.routineDraft === raw) {
            this.routineDraft = '';
            const current = document.getElementById('task-routine-input');
            if (current) { current.value = ''; current.focus(); LeaveGuard.acceptField(current); }
        }
    },

    async endRoutine(id) {
        const template = this.taskById(id);
        if (!template?.recurrence) return;
        let ended;
        let occurrences;
        const ok = await this.commit(tasks => {
            ended = tasks.find(task => task.id === id && task.recurrence);
            occurrences = tasks.filter(task => task.fromRecurrence === id);
            return { tasks: ended ? TasksCore.stopRecurrence(tasks, id) : tasks };
        }, template.title, () => this.endRoutine(id));
        if (ok && ended) {
            this.elements.title.focus({ preventScroll: true });
            this.notice(t('tasks.routine_ended', { title: ended.title }), () => this.restoreRoutine(ended, occurrences));
        }
    },

    async restoreRoutine(template, occurrences) {
        const ok = await this.commit((tasks, history, now) => {
            if (tasks.some(task => task.id === template.id)) return { tasks };
            const day = TasksCore.isoDate(now);
            const current = new Map(occurrences.filter(task => task.date === day).map(task => [task.id, task]));
            const restored = tasks.map(task => {
                if (!current.has(task.id) || task.fromRecurrence || task.list !== 'hoje') return task;
                current.delete(task.id);
                return { ...task, fromRecurrence: template.id, date: day };
            });
            const skipped = [...current.values()].filter(task => task.skipped && !restored.some(item => item.id === task.id));
            return { tasks: TasksCore.materializeRecurring(restored.concat(template, skipped), now) };
        }, template.title, () => this.restoreRoutine(template, occurrences));
        if (ok) {
            this.notice(t('tasks.undone'));
            this.elements.title.focus({ preventScroll: true });
        }
    },

    startFocus(id) {
        const task = this.taskById(id);
        if (task?.list !== 'hoje' || task.completedAt || task.skipped) return;
        const narrow = matchMedia('(max-width: 68rem)').matches;
        const opener = narrow ? this.elements.chip : this.row(id)?.querySelector('[data-action="focus"]');
        if (narrow) this.hide({ returnFocus: false });
        window.dispatchEvent(new CustomEvent('ora:focus-task', { detail: { taskId: id, opener } }));
    },

    beginRename(id) {
        const task = this.taskById(id);
        const row = this.row(id);
        const button = row?.querySelector('.task-title');
        if (!task || !button || button.tagName !== 'BUTTON') return;
        if (this.rename?.id === id) { this.rename.input.focus(); return; }
        const form = document.createElement('form');
        form.className = 'task-edit';
        const input = document.createElement('input');
        input.className = 'input';
        input.name = 'title';
        input.maxLength = 80;
        input.value = task.title;
        input.setAttribute('aria-label', t(task.fromRecurrence ? 'tasks.rename_occurrence' : 'tasks.rename'));
        form.append(input);
        form.addEventListener('submit', event => { event.preventDefault(); this.finishRename(true, true); });
        input.addEventListener('blur', () => {
            if (!this.rendering && this.rename?.form === form) this.finishRename(true, false);
        });
        button.replaceWith(form);
        this.rename = { id, form, input, button };
        this.editingId = id;
        LeaveGuard.watchEditor('task', form, () => input.value, () => form.isConnected);
        input.focus();
        input.select();
    },

    async finishRename(save, refocus) {
        const edit = this.rename;
        if (!edit) return;
        const { id, input, button, form } = edit;
        const title = input.value.trim();
        const task = this.taskById(id);
        this.rename = null;
        this.editingId = null;
        form.replaceWith(button);
        if (refocus) button.focus({ preventScroll: true });
        if (!save || !task || !title || title === task.title) return;
        const apply = () => this.commit(tasks => ({
            tasks: TasksCore.updateTask(tasks, id, { title }, { occurrenceOnly: true })
        }), title, apply);
        const ok = await apply();
        if (ok && refocus && document.activeElement === document.body) this.focusRow(id);
    },

    row(id) { return id && this.elements.content.querySelector('[data-id="' + CSS.escape(id) + '"]'); },
    neighbor(id) {
        const rows = [...(this.row(id)?.parentElement.children || [])];
        const i = rows.findIndex(row => row.dataset.id === id);
        return (rows[i + 1] || rows[i - 1])?.dataset.id;
    },
    focusRow(id, selector = '.task-title', zone) {
        if (!this.open) return;
        const target = this.row(id)?.querySelector(selector);
        if (target?.getClientRects().length) { target.focus(); return; }
        const section = zone === 'semdia' ? 'unscheduled' : zone && zone !== 'hoje' ? 'upcoming' : null;
        (section && this.elements.content.querySelector('[data-section="' + section + '"]') ||
            (this.view === 'main' ? this.elements.input : this.elements.title)).focus();
    },

    announce(message) {
        clearTimeout(this.announceTimer);
        this.elements.live.textContent = '';
        this.announceTimer = setTimeout(() => { this.elements.live.textContent = message; }, 25);
    },

    clearNotice() {
        clearTimeout(this.noticeTimer);
        this.elements.notice.hidden = true;
    },

    notice(message, undo) {
        this.announce(message);
        if (!this.open) return;
        const notice = undo ? this.elements.undo : this.elements.notice;
        const timer = undo ? 'undoTimer' : 'noticeTimer';
        clearTimeout(this[timer]);
        notice.replaceChildren(document.createTextNode(message));
        if (undo) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-quiet btn-sm';
            button.textContent = t('tasks.undo');
            button.addEventListener('click', () => { notice.hidden = true; undo(); });
            notice.append(button);
        }
        notice.hidden = false;
        this[timer] = setTimeout(() => {
            if (notice.contains(document.activeElement)) {
                (this.view === 'main' ? this.elements.input : this.elements.title).focus();
            }
            notice.hidden = true;
        }, undo ? 8000 : 3500);
    },

    onClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        const id = button.closest('[data-id]')?.dataset.id;
        switch (button.dataset.action) {
            case 'edit': this.beginRename(id); break;
            case 'menu': TaskMenu.toggle(button, 'task'); break;
            case 'focus': this.startFocus(id); break;
            case 'section': this.toggleSection(button.dataset.section); break;
            case 'dismiss-tip':
                this.tipDismissed = true;
                button.parentElement.remove();
                this.elements.content.querySelector('[data-section="upcoming"]').focus();
                break;
            case 'end-routine': TaskMenu.confirmEnd(id, button); break;
            case 'routine-day': {
                const days = this.taskById(id).recurrence.days;
                const day = Number(button.dataset.day);
                const next = days.includes(day) ? days.filter(value => value !== day) : days.concat(day);
                if (!next.length) this.announce(t('tasks.choose_days'));
                else this.repeat(id, next);
                break;
            }
        }
    },

    onKey(event) {
        if (event.isComposing || event.defaultPrevented) return;
        const input = this.elements.input;
        const target = event.target;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (target === input) {
                if (input.value) { input.value = ''; LeaveGuard.acceptField(input); }
                else input.blur();
            } else if (this.rename?.input === target) this.finishRename(false, true);
            else if (this.view !== 'main') this.openView('main');
            else this.hide();
            return;
        }
        const row = target.closest('.task[data-id]');
        if (!row || target.closest('.task-edit')) return;
        const task = this.taskById(row.dataset.id);
        if (!task || task.completedAt) return;
        const alt = event.altKey && !event.ctrlKey && !event.metaKey;
        if (alt && ['ArrowUp', 'ArrowDown'].includes(event.key) && task.list === 'hoje') {
            event.preventDefault();
            this.move(task.id, event.key === 'ArrowUp' ? -1 : 1);
        } else if (alt && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            const current = this.zoneOf(task);
            const later = event.key === 'ArrowRight';
            if (current === 'semdia' && later) return;
            const date = current === 'semdia' ? this.today()
                : TasksCore.addDays(current === 'hoje' ? this.today() : current, later ? 1 : -1);
            this.schedule(task.id, date <= this.today() ? 'hoje' : date);
        } else if (event.key === 'Delete') {
            event.preventDefault();
            this.remove(task.id, !!task.fromRecurrence);
        } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            TaskMenu.show(row.querySelector('[data-action="menu"]'), 'task');
        } else if (!alt && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'f' && task.list === 'hoje') {
            event.preventDefault();
            this.startFocus(task.id);
        }
    },

    render() {
        const el = this.elements;
        const open = this.openTasks();
        const today = open.filter(task => task.list === 'hoje');
        el.count.textContent = today.length;
        el.chip.setAttribute('aria-label', t('tasks.chip_label', { n: today.length }));
        el.title.textContent = t({ main: 'tasks.panel_title', routines: 'tasks.routines', history: 'tasks.history' }[this.view]);
        el.options.hidden = this.view !== 'main';
        el.back.hidden = this.view === 'main';
        el.form.hidden = this.view !== 'main';
        if (this.destination !== 'hoje' && this.destination !== 'semdia' && this.destination <= this.today()) this.destination = 'hoje';
        this.renderDestination();
        const before = document.activeElement;
        const rowId = before?.closest('.task[data-id], .task-routine[data-id]')?.dataset.id;
        const section = before?.dataset.section;
        const action = before?.dataset.action;
        const day = before?.dataset.day;
        const scroll = el.scroll.scrollTop;
        const selection = before === this.rename?.input ? [before.selectionStart, before.selectionEnd] : null;
        if (TaskDrag.active) TaskDrag.cancel();
        this.rendering = true;
        el.content.innerHTML = this.view === 'main' ? this.renderMain(today, open) :
            this.view === 'routines' ? this.renderRoutines() : this.renderHistory();
        if (this.rename) {
            const title = this.row(this.rename.id)?.querySelector('button.task-title');
            if (title) {
                this.rename.button = title;
                title.replaceWith(this.rename.form);
                this.rename.input.setAttribute('aria-label', t(this.taskById(this.rename.id).fromRecurrence ? 'tasks.rename_occurrence' : 'tasks.rename'));
            } else {
                this.rename = null;
                this.editingId = null;
            }
        }
        this.rendering = false;
        el.scroll.scrollTop = scroll;
        if (selection && this.rename) {
            this.rename.input.focus({ preventScroll: true });
            this.rename.input.setSelectionRange(...selection);
        } else if (!before?.isConnected) {
            const row = this.row(rowId);
            const target = (action && row?.querySelector('[data-action="' + action + '"]' +
                (day !== undefined ? '[data-day="' + day + '"]' : ''))) ||
                (before?.matches('.check') && row?.querySelector('.check')) ||
                (section && el.content.querySelector('[data-section="' + section + '"]')) ||
                (before?.id === 'tasks-done-summary' && document.getElementById('tasks-done-summary'));
            target?.focus({ preventScroll: true });
        }
        TaskMenu.refresh();
    },

    renderDestination() {
        const button = this.elements.destination;
        const name = this.dateLabel(this.destination, true);
        button.innerHTML = taskEsc(name) + ' ' + taskIcon('caret-down');
        button.setAttribute('aria-label', t('tasks.destination_value', { destination: name }));
    },

    renderMain(today, open) {
        const later = open.filter(task => task.list === 'depois');
        const unscheduled = later.filter(task => !task.plannedFor);
        const upcoming = later.filter(task => task.plannedFor);
        const done = TasksCore.visibleTasks(this.tasks).filter(task => TasksCore.isDone(task)).sort((a, b) => a.completedAt - b.completedAt);
        const groupDays = new Map();
        const cutoff = TasksCore.addDays(this.today(), 6);
        const more = [];
        upcoming.sort((a, b) => a.plannedFor.localeCompare(b.plannedFor)).forEach(task => {
            if (task.plannedFor > cutoff) more.push(task);
            else {
                if (!groupDays.has(task.plannedFor)) groupDays.set(task.plannedFor, []);
                groupDays.get(task.plannedFor).push(task);
            }
        });
        const list = (tasks, label, next = false) => this.renderList(tasks, label, { next });
        const datedGroups = [...groupDays].map(([day, tasks]) => '<section class="tasks-date" data-zone="' + day +
            '"><h4 id="task-day-' + day + '">' + taskEsc(this.dateLabel(day)) + '</h4>' + list(tasks, 'task-day-' + day) + '</section>').join('');
        const todayCount = this.renderCount(today.length);
        const tip = today.length > TasksCore.HOME_MAX && !this.tipDismissed ? '<div class="tasks-tip meta"><p>' +
            taskText('tasks.today_many') + '</p><button type="button" class="btn-icon" data-action="dismiss-tip" aria-label="' +
            taskText('tasks.dismiss_tip') + '">' + taskIcon('x') + '</button></div>' : '';
        return '<section class="tasks-today" data-zone="hoje" aria-labelledby="tasks-today-title"><div class="tasks-group-head">' +
            '<h3 class="label" id="tasks-today-title">' + taskText('nav.today') + '</h3>' + todayCount + '</div>' +
            list(today, 'tasks-today-title', true) + (today.length ? '' : '<div class="tasks-empty meta"><strong>' +
                taskText('tasks.empty_title') + '</strong><p>' + taskText(later.length ? 'tasks.empty_with_later' : 'tasks.empty_desc') + '</p></div>') + tip +
            (done.length ? '<details class="tasks-done" id="tasks-done"' + (this.expanded.done ? ' open' : '') +
                '><summary id="tasks-done-summary">' + taskIcon('caret-right') + taskText('tasks.done_today') + '</summary>' +
                list(done, 'tasks-done-summary') + '</details>' : '') + '</section>' +
            this.renderSection('upcoming', 'tasks.upcoming', upcoming.length, this.tomorrow(), datedGroups +
                (more.length ? '<section class="tasks-date"><h4 id="tasks-far">' + taskText('tasks.far') + '</h4>' +
                    this.renderList(more, 'tasks-far', { showDate: true }) + '</section>' : '') ||
                '<p class="tasks-empty meta">' + taskText('tasks.empty_upcoming') + '</p>') +
            this.renderSection('unscheduled', 'tasks.unscheduled', unscheduled.length, 'semdia',
                unscheduled.length ? list(unscheduled, 'tasks-unscheduled-title') :
                    '<p class="tasks-empty meta">' + taskText('tasks.empty_unscheduled') + '</p>');
    },

    renderCount(count) {
        return '<span class="tasks-count meta"><span aria-hidden="true">' + count + '</span><span class="sr-only">' +
            taskText('tasks.open_count', { n: count }) + '</span></span>';
    },

    renderSection(section, label, count, zone, body) {
        const open = this.expanded[section];
        return '<section class="tasks-section" aria-labelledby="tasks-' + section + '-title"><h3><button type="button" class="tasks-section-toggle" ' +
            'data-action="section" data-section="' + section + '" data-zone="' + zone + '" aria-expanded="' + open + '" aria-controls="tasks-' + section + '">' +
            '<span class="label" id="tasks-' + section + '-title">' + taskText(label) + '</span>' + this.renderCount(count) +
            '<span class="task-drop-caption meta" aria-hidden="true">' + taskText('tasks.drop_in', { destination: this.dateLabel(zone, true) }) + '</span>' +
            taskIcon('caret-down') + '</button></h3><div id="tasks-' + section + '"' + (open ? '' : ' hidden') + '>' + body + '</div></section>';
    },

    renderList(tasks, label, { next = false, showDate = false, archived = false } = {}) {
        return '<ul class="task-list"' + (next ? ' id="tasks-today"' : '') + ' aria-labelledby="' + label + '">' +
            tasks.map((task, i) => this.renderTask(task, next && i === 0, showDate, archived)).join('') + '</ul>';
    },

    renderTask(task, next, showDate, archived) {
        const done = TasksCore.isDone(task);
        const focus = !done && task.list === 'hoje';
        const days = TasksCore.recurrenceDays(this.tasks, task);
        const meta = [
            next && '<span class="task-next">' + taskText('today.next_label') + '</span>',
            days.length && '<span title="' + taskEsc(this.daysText(days)) + '">' + taskIcon('arrows-clockwise') +
                '<span class="sr-only">' + taskEsc(this.daysText(days)) + '</span></span>',
            task.estimateMin && '<span>' + taskText('tasks.minutes', { n: task.estimateMin }) + '</span>',
            showDate && '<span>' + taskEsc(this.dateLabel(task.plannedFor, true)) + '</span>'
        ].filter(Boolean).join('');
        const title = taskEsc(task.title);
        const actions = (focus ? '<button type="button" class="btn-icon task-focus" data-action="focus" aria-label="' +
            taskText('tasks.focus_label', { title: task.title }) + '" title="' + taskText('tasks.focus') + '">' + taskIcon('play', true) + '</button>' : '') +
            (!done ? '<button type="button" class="btn-icon task-more" data-action="menu" aria-haspopup="menu" aria-expanded="false" aria-controls="tasks-menu" aria-label="' +
                taskText('tasks.task_actions', { title: task.title }) + '">' + taskIcon('dots-three') + '</button>' : '');
        const time = done ? new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(task.completedAt)) : '';
        return '<li class="task' + (done ? ' is-done' : '') + '" data-id="' + taskEsc(task.id) + '"' + (archived ? ' data-archived="true"' : '') +
            '><div class="task-row"><input type="checkbox" class="check task-check"' + (done ? ' checked' : '') +
            ' aria-label="' + taskText(done ? 'tasks.reopen_label' : 'tasks.complete_label', { title: task.title }) + '">' +
            '<div class="task-main">' + (archived ? '<span class="task-title">' + title + '</span>' :
                '<button type="button" class="task-title" data-action="edit" title="' + taskText('tasks.rename') + '">' + title + '</button>') +
            (meta ? '<div class="task-meta meta">' + meta + '</div>' : '') + '</div>' +
            (actions ? '<div class="task-actions">' + actions + '</div>' : '') +
            (done ? '<time class="meta" aria-label="' + taskText('tasks.done_at', { time }) + '">' + taskEsc(time) + '</time>' : '') + '</div></li>';
    },

    daysText(days) {
        if (days.length === 7) return t('tasks.repeat_daily');
        if (days.join() === TasksCore.WEEKDAYS.join()) return t('tasks.repeat_weekdays');
        return t('tasks.repeat_on', { days: days.map(day => t('tasks.day_names')[day]).join(', ') });
    },

    renderRoutines() {
        const routines = this.tasks.filter(TasksCore.isTemplate);
        const items = routines.map(task => '<section class="task-routine" data-id="' + taskEsc(task.id) +
            '"><div class="task-routine-head">' + taskIcon('arrows-clockwise') + '<strong>' + taskEsc(task.title) + '</strong>' +
            (task.estimateMin ? '<span class="meta">' + taskText('tasks.minutes', { n: task.estimateMin }) + '</span>' : '') +
            '<button type="button" class="btn-icon" data-action="end-routine" aria-label="' +
            taskText('tasks.end_named', { title: task.title }) + '">' + taskIcon('x-circle') + '</button></div>' +
            '<div class="task-days" role="group" aria-label="' + taskText('tasks.edit_days') + '">' +
            TaskMenu.daysButtons(task.recurrence.days, 'routine-day') + '</div></section>').join('');
        return '<p class="tasks-empty meta">' + taskText('tasks.routine_intro') + '</p>' + items +
            '<form class="task-routine-add tasks-add" id="task-routine-form"><input class="input" name="routine-title" id="task-routine-input" maxlength="80" value="' +
            taskEsc(this.routineDraft || '') + '" ' +
            'aria-label="' + taskText('tasks.new_routine') + '" placeholder="' + taskText('tasks.new_routine') + '">' +
            '<button type="submit" class="btn-icon" aria-label="' + taskText('tasks.add') + '">' + taskIcon('plus') + '</button></form>';
    },

    renderHistory() {
        const current = TasksCore.visibleTasks(this.tasks).filter(TasksCore.isDone);
        const ids = new Set(current.map(task => task.id));
        const items = current.concat(this.history.filter(item => item && item.completedAt && !ids.has(item.id))
            .map(item => ({ ...item, archived: true }))).sort((a, b) => b.completedAt - a.completedAt);
        const groups = new Map();
        for (const task of items) {
            const day = TasksCore.dayOf(task.completedAt);
            if (!TasksCore.dateFromKey(day)) continue;
            if (!groups.has(day)) groups.set(day, []);
            groups.get(day).push(task);
        }
        return [...groups].map(([day, tasks]) => '<section class="tasks-date"><h3 id="task-history-' + day + '">' +
            taskEsc(this.dateLabel(day)) + '</h3><ul class="task-list" aria-labelledby="task-history-' + day + '">' +
            tasks.map(task => this.renderTask(task, false, false, task.archived)).join('') + '</ul></section>').join('') ||
            '<p class="tasks-empty meta">' + taskText('tasks.history_empty') + '</p>';
    }
};

function taskEsc(value) {
    return String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function taskText(key, params) { return taskEsc(t(key, params)); }
function taskIcon(name, fill = false) { return '<i class="' + (fill ? 'ph-fill' : 'ph') + ' ph-' + name + '" aria-hidden="true"></i>'; }

window.TaskSystem = TaskSystem;
