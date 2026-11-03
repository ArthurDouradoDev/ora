const TaskSystem = {
    // Painel lateral "Tarefas (n)" de Hoje: seções Hoje (ordenável) e Depois
    // (captura rápida), recorrência por dias da semana e concluídas do dia.
    // Dependencies: AsyncStorage, t(), TasksCore.
    // Tarefas não guardam ciclos: sessões ficam em ora_sessions (SW). Concluir
    // não cria sessões (E01) e completar sessões não conclui (E02).
    // O ritual da manhã não abre mais daqui (E04): volta como convite na fase 5.

    STORAGE_KEY: 'ora_tasks',
    HISTORY_KEY: 'ora_tasks_history',
    ESTIMATES: [15, 25, 50, 90],
    TODAY_SOFT_MAX: TasksCore.HOME_MAX, // só apresentação: Hoje pode guardar mais

    tasks: [],    // inclui os modelos de rotina (escondidos) — ver TasksCore
    history: [],
    editingId: null,
    confirmDeleteId: null,
    pendingSave: null, // { label, retry } da última gravação recusada
    open: false,

    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.loadData();
        await this.applyDayRollover();
        this.render();

        // Uma aba aberta de um dia para o outro vira o dia ao voltar
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this._day !== TasksCore.isoDate(new Date())) {
                this.applyDayRollover().then(() => this.render());
            }
        });

        // Outras abas, outros dispositivos (sync) e o SW
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[this.STORAGE_KEY]) {
                const next = TasksCore.normalizeTasks(changes[this.STORAGE_KEY].newValue);
                if (JSON.stringify(this.tasks) !== JSON.stringify(next)) {
                    this.tasks = next;
                    this.render();
                }
            }
            if (changes[this.HISTORY_KEY]) this.history = changes[this.HISTORY_KEY].newValue || [];
        });

        console.log('[Ora] Task System initialized');
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            view: $('view-hoje'),
            chip: $('tasks-chip'),
            count: $('tasks-count'),
            panel: $('tasks-panel'),
            close: $('tasks-close'),
            addForm: $('tasks-add-form'),
            addInput: $('tasks-add-input'),
            laterForm: $('tasks-later-form'),
            laterInput: $('tasks-later-input'),
            todayList: $('tasks-today'),
            todayEmpty: $('tasks-today-empty'),
            many: $('tasks-many'),
            laterList: $('tasks-later'),
            done: $('tasks-done'),
            doneSummary: $('tasks-done-summary'),
            doneList: $('tasks-done-list'),
            alert: $('tasks-alert'),
            alertTitle: $('tasks-alert-title'),
            alertRetry: $('tasks-alert-retry'),
            alertDismiss: $('tasks-alert-dismiss')
        };
    },

    bindEvents: function() {
        const el = this.elements;
        el.chip.addEventListener('click', () => this.toggle());
        el.close.addEventListener('click', () => this.hide());

        el.addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTask(el.addInput, 'hoje');
        });
        el.laterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTask(el.laterInput, 'depois');
        });

        el.alertRetry.addEventListener('click', () => {
            const pending = this.pendingSave;
            if (pending) pending.retry();
        });
        el.alertDismiss.addEventListener('click', () => this.showSaveError(null));

        // Esc fecha o painel (os diálogos tratam o próprio Esc antes)
        el.panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.editingId) {
                e.preventDefault();
                this.hide();
            }
        });

        [el.todayList, el.laterList, el.doneList].forEach(list => {
            list.addEventListener('click', (e) => this.onListClick(e));
            list.addEventListener('change', (e) => this.onListChange(e));
        });
    },

    // --- Painel ---

    toggle: function() {
        if (this.open) this.hide();
        else this.show();
    },

    show: function({ focus = true } = {}) {
        // O painel mora em Hoje: chamado de outro destino, volta para Hoje
        if (window.RouterSystem && RouterSystem.current() && RouterSystem.current().view !== 'hoje') {
            RouterSystem.navigate('hoje');
        }
        this.open = true;
        this.elements.view.setAttribute('data-tasks-open', '');
        this.elements.panel.inert = false;
        this.elements.chip.setAttribute('aria-expanded', 'true');
        if (focus) setTimeout(() => this.elements.addInput.focus({ preventScroll: true }), 60);
        window.dispatchEvent(new CustomEvent('ora:tasks-panel', { detail: { open: true } }));
    },

    hide: function({ returnFocus = true } = {}) {
        if (!this.open) return;
        const hadFocus = this.elements.panel.contains(document.activeElement);
        this.open = false;
        this.editingId = null;
        this.confirmDeleteId = null;
        this.elements.view.removeAttribute('data-tasks-open');
        this.elements.panel.inert = true;
        this.elements.chip.setAttribute('aria-expanded', 'false');
        if (returnFocus && hadFocus) this.elements.chip.focus({ preventScroll: true });
        this.render();
        window.dispatchEvent(new CustomEvent('ora:tasks-panel', { detail: { open: false } }));
    },

    // --- Dados ---

    taskById: function(id) {
        return this.tasks.find(task => task.id === id) || null;
    },

    loadData: async function() {
        this.tasks = TasksCore.normalizeTasks(await AsyncStorage.get(this.STORAGE_KEY, []));
        this.history = (await AsyncStorage.get(this.HISTORY_KEY, [])) || [];
    },

    // Grava; se o navegador recusar, volta ao estado anterior e mostra a falha
    // com nova tentativa, sem perder o que foi digitado.
    commit: async function(nextTasks, label, retry) {
        const previous = this.tasks;
        this.tasks = nextTasks;
        this.render();
        const saved = await AsyncStorage.set(this.STORAGE_KEY, nextTasks);
        if (!saved) {
            this.tasks = previous;
            this.render();
            this.showSaveError({ label, retry });
            return false;
        }
        this.showSaveError(null);
        return true;
    },

    showSaveError: function(pending) {
        this.pendingSave = pending;
        this.elements.alert.hidden = !pending;
        if (pending) {
            this.elements.alertTitle.textContent = t('tasks.save_failed', { title: pending.label });
            if (!this.open) this.show({ focus: false });
        }
        window.dispatchEvent(new CustomEvent('ora:tasks-error', { detail: pending }));
    },

    // Virada do dia: concluídas vão para o histórico (E06) e as rotinas
    // geram a tarefa de hoje nos dias da regra (E05). Idempotente.
    applyDayRollover: async function() {
        const now = new Date();
        this._day = TasksCore.isoDate(now);
        const rolled = TasksCore.rolloverDay(this.tasks, this.history, now);
        const tasks = TasksCore.materializeRecurring(rolled.tasks, now);

        // History first: a completed task is never lost between the two writes
        if (rolled.changed) {
            this.history = rolled.history;
            await AsyncStorage.set(this.HISTORY_KEY, this.history);
        }
        if (rolled.changed || tasks.length !== rolled.tasks.length) {
            this.tasks = tasks;
            await AsyncStorage.set(this.STORAGE_KEY, this.tasks);
        }
    },

    // --- Operações ---

    addTask: async function(input, list) {
        const title = input.value.trim();
        if (!title) {
            input.focus();
            return;
        }
        const next = TasksCore.createTask(this.tasks, {
            id: 'task-' + Date.now(),
            title,
            list,
            now: Date.now()
        });
        const ok = await this.commit(next, title, () => this.addTask(input, list));
        if (ok) {
            input.value = '';
            input.focus();
        }
    },

    setDone: async function(id, done) {
        const task = this.taskById(id);
        if (!task) return false;
        const next = done ? TasksCore.completeTask(this.tasks, id, Date.now()) : TasksCore.reopenTask(this.tasks, id);
        return this.commit(next, task.title, () => this.setDone(id, done));
    },

    // Excluir a tarefa de uma rotina encerra a rotina (com confirmação)
    deleteTask: async function(id) {
        const task = this.taskById(id);
        if (!task) return;
        let next = TasksCore.removeTask(this.tasks, id);
        if (task.fromRecurrence) next = TasksCore.removeTask(next, task.fromRecurrence);
        this.editingId = null;
        this.confirmDeleteId = null;
        const ok = await this.commit(next, task.title, () => this.deleteTask(id));
        if (ok) showToast(t('tasks.deleted', { title: task.title }), 'info');
    },

    move: async function(id, delta) {
        const task = this.taskById(id);
        if (!task) return;
        await this.commit(TasksCore.moveTask(this.tasks, id, delta), task.title, () => this.move(id, delta));
        this.focusRow(id, '[data-action="edit"]');
    },

    moveToList: async function(id, list) {
        const task = this.taskById(id);
        if (!task) return;
        const next = list === 'hoje' ? TasksCore.moveToToday(this.tasks, id) : TasksCore.moveToLater(this.tasks, id);
        this.editingId = null;
        await this.commit(next, task.title, () => this.moveToList(id, list));
        this.focusRow(id, '[data-action="edit"]');
    },

    saveEdit: async function(id, form) {
        const task = this.taskById(id);
        if (!task) return;
        const title = form.querySelector('[name="title"]').value.trim();
        if (!title) {
            form.querySelector('[name="title"]').focus();
            return;
        }
        const estimateBtn = form.querySelector('.ed-estimate [aria-pressed="true"]');
        const repeatInput = form.querySelector('[name="repeat"]'); // ausente em concluídas
        const days = Array.from(form.querySelectorAll('.days [aria-pressed="true"]')).map(b => Number(b.dataset.day));

        let next = TasksCore.updateTask(this.tasks, id, {
            title,
            estimateMin: estimateBtn ? Number(estimateBtn.dataset.min) : null
        });
        const currentDays = TasksCore.recurrenceDays(this.tasks, task);
        const templateId = task.fromRecurrence || null;
        const repeat = repeatInput ? repeatInput.checked : currentDays.length > 0;
        if (!repeatInput) {
            // Concluída: só título e estimativa
        } else if (repeat && days.length) {
            if (templateId) next = TasksCore.updateTask(next, templateId, { recurrence: { days } });
            else next = TasksCore.makeRecurring(next, id, days, Date.now());
        } else if (!repeat && currentDays.length) {
            next = TasksCore.stopRecurrence(next, id);
        }

        this.editingId = null;
        const ok = await this.commit(next, title, () => this.saveEdit(id, form));
        if (ok) this.focusRow(id, '[data-action="edit"]');
    },

    // --- Eventos das listas ---

    onListClick: function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const row = btn.closest('[data-id]');
        const id = row ? row.dataset.id : null;
        const action = btn.dataset.action;

        switch (action) {
            case 'edit':
                this.editingId = this.editingId === id ? null : id;
                this.confirmDeleteId = null;
                this.render();
                if (this.editingId) this.focusRow(id, '[name="title"]');
                break;
            case 'focus':
                window.dispatchEvent(new CustomEvent('ora:focus-task', { detail: { taskId: id } }));
                if (window.matchMedia('(max-width: 68rem)').matches) this.hide({ returnFocus: false });
                break;
            case 'to-today':
                this.moveToList(id, 'hoje');
                break;
            case 'to-later':
                this.moveToList(id, 'depois');
                break;
            case 'up':
                this.move(id, -1);
                break;
            case 'down':
                this.move(id, 1);
                break;
            case 'estimate':
                btn.parentElement.querySelectorAll('button').forEach(b => {
                    b.setAttribute('aria-pressed', String(b === btn && b.getAttribute('aria-pressed') !== 'true'));
                });
                break;
            case 'day':
                btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
                break;
            case 'save':
                this.saveEdit(id, btn.closest('.task-edit'));
                break;
            case 'cancel':
                this.editingId = null;
                this.confirmDeleteId = null;
                this.render();
                this.focusRow(id, '[data-action="edit"]');
                break;
            case 'delete':
                this.confirmDeleteId = id;
                this.render();
                this.focusRow(id, '[data-action="delete-confirm"]');
                break;
            case 'delete-confirm':
                this.deleteTask(id);
                break;
            case 'delete-cancel':
                this.confirmDeleteId = null;
                this.render();
                this.focusRow(id, '[data-action="delete"]');
                break;
        }
    },

    onListChange: function(e) {
        const target = e.target;
        if (target.matches('.check')) {
            const id = target.closest('[data-id]').dataset.id;
            this.setDone(id, target.checked).then(() => this.focusRow(id, '.check'));
        } else if (target.matches('[name="repeat"]')) {
            const days = target.closest('.task-edit').querySelector('.days');
            days.hidden = !target.checked;
            // Primeira vez: sugere os dias úteis
            if (target.checked && !days.querySelector('[aria-pressed="true"]')) {
                days.querySelectorAll('button').forEach(b => {
                    b.setAttribute('aria-pressed', String(TasksCore.WEEKDAYS.includes(Number(b.dataset.day))));
                });
            }
        }
    },

    focusRow: function(id, selector) {
        requestAnimationFrame(() => {
            const row = this.elements.panel.querySelector(`[data-id="${CSS.escape(id)}"]`);
            const target = row && row.querySelector(selector);
            if (target) target.focus({ preventScroll: false });
        });
    },

    // --- Render ---

    render: function() {
        const visible = TasksCore.visibleTasks(this.tasks);
        const today = visible.filter(t => t.list === 'hoje' && !TasksCore.isDone(t));
        const later = visible.filter(t => t.list === 'depois' && !TasksCore.isDone(t));
        const done = visible.filter(t => TasksCore.isDone(t));
        const next = TasksCore.nextStep(this.tasks);

        this.elements.count.textContent = String(today.length);
        this.elements.chip.setAttribute('aria-label', t('tasks.chip_label', { n: today.length }));

        this.renderList(this.elements.todayList, today, { next });
        this.elements.todayEmpty.hidden = today.length > 0;
        this.elements.many.hidden = today.length <= this.TODAY_SOFT_MAX;
        this.elements.many.textContent = t('tasks.today_many', { n: today.length });

        this.renderList(this.elements.laterList, later, {});

        this.elements.done.hidden = done.length === 0;
        this.elements.doneSummary.textContent = t('tasks.done_today', { n: done.length });
        this.renderList(this.elements.doneList, done, {});

        window.dispatchEvent(new CustomEvent('ora:tasks', { detail: { tasks: this.tasks } }));
    },

    renderList: function(container, tasks, { next }) {
        const fragment = document.createDocumentFragment();
        tasks.forEach((task, index) => fragment.appendChild(this.renderItem(task, {
            isNext: !!next && next.id === task.id,
            first: index === 0,
            last: index === tasks.length - 1
        })));
        container.replaceChildren(fragment);
    },

    metaText: function(task) {
        const parts = [];
        if (task.estimateMin) parts.push(t('tasks.minutes', { n: task.estimateMin }));
        const days = TasksCore.recurrenceDays(this.tasks, task);
        if (days.length) parts.push(this.daysText(days));
        if (TasksCore.isDone(task)) parts.push(t('tasks.done_at', { time: this.timeText(task.completedAt) }));
        return parts.join(' · ');
    },

    daysText: function(days) {
        if (days.length === 7) return t('tasks.repeat_daily');
        if (days.join() === TasksCore.WEEKDAYS.join()) return t('tasks.repeat_weekdays');
        const names = t('tasks.day_names');
        return t('tasks.repeat_on', { days: days.map(d => (Array.isArray(names) ? names[d] : d)).join(', ') });
    },

    timeText: function(ms) {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    renderItem: function(task, { isNext, first, last }) {
        const done = TasksCore.isDone(task);
        const li = document.createElement('li');
        li.className = 'task' + (done ? ' is-done' : '') + (isNext ? ' is-next' : '');
        li.dataset.id = task.id;

        const row = document.createElement('div');
        row.className = 'task-row';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'check';
        check.checked = done;
        check.setAttribute('aria-label', t(done ? 'tasks.reopen_label' : 'tasks.complete_label', { title: task.title }));

        const main = document.createElement('div');
        main.className = 'task-main';
        if (isNext) {
            const tag = document.createElement('span');
            tag.className = 'task-next';
            tag.textContent = t('today.next_label');
            main.appendChild(tag);
        }
        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'task-title';
        title.dataset.action = 'edit';
        title.textContent = task.title;
        title.setAttribute('aria-expanded', String(this.editingId === task.id));
        title.title = t('tasks.edit_hint');
        main.appendChild(title);
        const metaText = this.metaText(task);
        if (metaText) {
            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = metaText;
            main.appendChild(meta);
        }

        row.append(check, main);
        if (!done) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'btn btn-sm btn-aux';
            if (task.list === 'hoje') {
                action.dataset.action = 'focus';
                action.innerHTML = '<i class="ph-fill ph-play" aria-hidden="true"></i>';
                action.append(document.createTextNode(t('tasks.focus')));
                action.setAttribute('aria-label', t('tasks.focus_label', { title: task.title }));
            } else {
                action.dataset.action = 'to-today';
                action.textContent = t('tasks.to_today');
                action.setAttribute('aria-label', t('tasks.to_today_label', { title: task.title }));
            }
            row.appendChild(action);
        }
        li.appendChild(row);

        if (this.editingId === task.id) li.appendChild(this.renderEditor(task, { first, last, done }));
        return li;
    },

    renderEditor: function(task, { first, last, done }) {
        const days = TasksCore.recurrenceDays(this.tasks, task);
        const dayNames = t('tasks.day_short');
        const dayFull = t('tasks.day_names');
        const editor = document.createElement('div');
        editor.className = 'task-edit';
        const uid = 'ed-' + task.id.replace(/[^a-z0-9_-]/gi, '');
        const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

        editor.innerHTML = `
            <label class="field"><span>${esc(t('tasks.edit_title'))}</span>
                <input class="input" name="title" maxlength="80" autocomplete="off" value="${esc(task.title)}"></label>
            <div class="field"><span id="${uid}-est">${esc(t('tasks.edit_estimate'))}</span>
                <div class="seg ed-estimate" role="group" aria-labelledby="${uid}-est">
                    ${this.ESTIMATES.map(m => `<button type="button" data-action="estimate" data-min="${m}" aria-pressed="${task.estimateMin === m}">${esc(t('tasks.minutes', { n: m }))}</button>`).join('')}
                </div></div>
            ${done ? '' : `<div class="field">
                <label class="toggle"><input type="checkbox" name="repeat" ${days.length ? 'checked' : ''}><span class="track"></span><span>${esc(t('tasks.edit_repeat'))}</span></label>
                <div class="days" role="group" aria-label="${esc(t('tasks.edit_days'))}" ${days.length ? '' : 'hidden'}>
                    ${[0, 1, 2, 3, 4, 5, 6].map(d => `<button type="button" data-action="day" data-day="${d}" aria-pressed="${days.includes(d)}" aria-label="${esc(Array.isArray(dayFull) ? dayFull[d] : d)}">${esc(Array.isArray(dayNames) ? dayNames[d] : d)}</button>`).join('')}
                </div></div>`}
            ${done ? '' : `<div class="row" style="--gap: 0.25rem">
                ${task.list === 'hoje' ? `
                <button type="button" class="btn-icon sm" data-action="up" aria-label="${esc(t('tasks.move_up'))}" title="${esc(t('tasks.move_up'))}" ${first ? 'disabled' : ''}><i class="ph ph-arrow-up" aria-hidden="true"></i></button>
                <button type="button" class="btn-icon sm" data-action="down" aria-label="${esc(t('tasks.move_down'))}" title="${esc(t('tasks.move_down'))}" ${last ? 'disabled' : ''}><i class="ph ph-arrow-down" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-quiet btn-sm" data-action="to-later">${esc(t('tasks.to_later'))}</button>` : `
                <button type="button" class="btn btn-quiet btn-sm" data-action="to-today">${esc(t('tasks.to_today'))}</button>`}
            </div>`}
            <div class="row">
                <button type="button" class="btn btn-primary btn-sm" data-action="save">${esc(t('tasks.save'))}</button>
                <button type="button" class="btn btn-quiet btn-sm" data-action="cancel">${esc(t('today.cancel'))}</button>
                <span class="spacer"></span>
                ${this.confirmDeleteId === task.id ? `
                <span class="meta">${esc(t(task.fromRecurrence ? 'tasks.delete_routine_confirm' : 'tasks.delete_confirm'))}</span>
                <button type="button" class="btn btn-danger btn-sm" data-action="delete-confirm">${esc(t('tasks.delete'))}</button>
                <button type="button" class="btn btn-quiet btn-sm" data-action="delete-cancel">${esc(t('today.cancel'))}</button>` : `
                <button type="button" class="btn btn-quiet btn-sm danger-text" data-action="delete">${esc(t('tasks.delete'))}</button>`}
            </div>`;

        // Enter no título salva; Esc cancela a edição
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.name === 'title') {
                e.preventDefault();
                this.saveEdit(task.id, editor);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.editingId = null;
                this.confirmDeleteId = null;
                this.render();
                this.focusRow(task.id, '[data-action="edit"]');
            }
        });
        return editor;
    }
};

window.TaskSystem = TaskSystem;
