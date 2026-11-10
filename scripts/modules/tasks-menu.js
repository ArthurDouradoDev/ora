// Menus do painel, incluindo o seletor de data compartilhado com a captura.
const TaskMenu = {
    init() {
        this.node = document.getElementById('tasks-menu');
        this.node.addEventListener('click', event => this.onClick(event));
        this.node.addEventListener('submit', event => this.onSubmit(event));
        this.node.addEventListener('keydown', event => this.onKey(event));
        document.addEventListener('pointerdown', event => {
            if (this.state && !this.node.contains(event.target) && !this.state.trigger.contains(event.target)) this.close(false);
        }, true);
        window.addEventListener('resize', () => this.close());
        TaskSystem.elements.scroll.addEventListener('scroll', () => {
            if (this.state?.kind === 'task') this.position();
        }, { passive: true });
        document.getElementById('tasks-end-confirm').addEventListener('click', () => {
            const id = this.endingId;
            DialogSystem.close('tasks-end-dialog');
            TaskSystem.endRoutine(id);
        });
    },

    hasFocus() { return this.node.contains(document.activeElement); },

    toggle(trigger, kind) {
        if (this.state?.trigger === trigger) this.close();
        else this.show(trigger, kind);
    },

    show(trigger, kind, point) {
        if (!trigger) return;
        this.close(false);
        const id = trigger.closest('[data-id]')?.dataset.id;
        this.state = { kind, view: kind, id, trigger, point };
        trigger.setAttribute('aria-expanded', 'true');
        this.render();
    },

    close(returnFocus = true) {
        if (!this.state) return;
        const { trigger } = this.state;
        trigger.setAttribute('aria-expanded', 'false');
        this.state = null;
        this.node.hidden = true;
        if (returnFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    },

    refresh() {
        const state = this.state;
        if (!state) return;
        if (!state.trigger.isConnected) {
            const trigger = TaskSystem.row(state.id)?.querySelector('[data-action="menu"]');
            if (!trigger?.getClientRects().length) { this.close(false); return; }
            state.trigger = trigger;
            trigger.setAttribute('aria-expanded', 'true');
        }
        this.position();
    },

    position() {
        const { trigger, point } = this.state;
        const rect = trigger.getBoundingClientRect();
        const width = this.node.offsetWidth;
        const height = this.node.offsetHeight;
        const left = point?.x ?? rect.right - width;
        const below = (point?.y ?? rect.bottom) + 4;
        const above = (point?.y ?? rect.top) - height - 4;
        this.node.style.left = Math.max(8, Math.min(left, innerWidth - width - 8)) + 'px';
        this.node.style.top = Math.max(8, below + height + 8 <= innerHeight ? below : above) + 'px';
    },

    item(action, icon, key, value = '') {
        return '<button type="button" class="task-menu-item" role="menuitem" data-command="' + action + '">' +
            taskIcon(icon, action === 'focus') + '<span>' + taskText(key) + '</span>' +
            (value ? '<small>' + taskEsc(value) + '</small>' : '') + '</button>';
    },

    render(focusSelector) {
        const { view, id } = this.state;
        const task = TaskSystem.taskById(id);
        const editor = ['calendar', 'duration', 'repeat'].includes(view);
        this.node.setAttribute('role', editor ? 'dialog' : 'menu');
        this.node.setAttribute('aria-label', t({
            panel: 'tasks.options', task: 'tasks.options', capture: 'tasks.destination',
            calendar: 'tasks.choose_date', duration: 'tasks.edit_estimate', repeat: 'tasks.edit_repeat'
        }[view]));
        let html;
        if (view === 'panel') {
            html = this.item('routines', 'arrows-clockwise', 'tasks.routines') + this.item('history', 'check-circle', 'tasks.history');
        } else if (view === 'capture') {
            html = this.when(TaskSystem.destination, 'tasks.destination');
        } else if (view === 'calendar') {
            html = this.calendar();
        } else if (view === 'duration') {
            html = this.duration(task);
        } else if (view === 'repeat') {
            html = this.repeat(task);
        } else {
            if (!task || task.completedAt || task.skipped) { this.close(false); return; }
            const routine = task.fromRecurrence;
            const today = task.list === 'hoje';
            html = (today ? this.item('focus', 'play', 'tasks.focus_now') : '') +
                (TasksCore.nextStep(TaskSystem.tasks)?.id !== id ? this.item('next', 'arrow-line-up', 'tasks.make_next') : '') +
                (routine ? '' : this.when(TaskSystem.zoneOf(task), 'tasks.when')) +
                '<hr>' + this.item('duration', 'timer', 'tasks.duration',
                    task.estimateMin ? t('tasks.minutes', { n: task.estimateMin }) : '—') +
                this.item('repeat', 'arrows-clockwise', 'tasks.repeat_action', routine ? t('tasks.whole_routine') : '') +
                this.item('rename', 'pencil-simple', 'tasks.rename', routine ? t('tasks.only_today') : '') +
                this.item('duplicate', 'copy', 'tasks.duplicate', routine ? t('tasks.no_repeat') : '') +
                (routine ? this.item('skip', 'skip-forward', 'tasks.skip_today', t('tasks.only_today')) +
                    this.item('end', 'x-circle', 'tasks.end_routine') : this.item('delete', 'trash', 'tasks.delete'));
        }
        this.node.innerHTML = html;
        this.node.hidden = false;
        this.node.scrollTop = 0;
        this.position();
        (this.node.querySelector(focusSelector || 'button:not(:disabled)') ||
            this.node.querySelector('button:not(:disabled)'))?.focus();
    },

    when(selected, title) {
        const entries = [
            ['hoje', 'sun', 'nav.today'], [TaskSystem.tomorrow(), 'sun-horizon', 'tasks.tomorrow'],
            ['date', 'calendar-dots', 'tasks.choose_date'], ['semdia', 'tray', 'tasks.unscheduled']
        ];
        const custom = TasksCore.dateFromKey(selected) && selected !== TaskSystem.tomorrow();
        return '<p class="label">' + taskText(title) + '</p><div class="task-menu-when">' +
            entries.map(([zone, icon, key]) => '<button type="button" class="btn btn-aux btn-sm" role="menuitemradio" aria-checked="' +
                (zone === selected || (zone === 'date' && !!custom)) + '" data-command="when" data-zone="' + zone + '">' +
                taskIcon(icon) + taskText(key) + '</button>').join('') + '</div>';
    },

    backButton() {
        return '<button type="button" class="btn-icon" data-command="back" aria-label="' +
            taskText('tasks.back') + '">' + taskIcon('arrow-left') + '</button>';
    },

    calendar() {
        const { month, selected } = this.state;
        const first = TasksCore.dateFromKey(month + '-01');
        const firstKey = TasksCore.isoDate(first);
        const now = TaskSystem.today();
        const names = t('tasks.day_short');
        const format = new Intl.DateTimeFormat(TaskSystem.locale(), { dateStyle: 'full' });
        let cells = names.map(name => '<span aria-hidden="true">' + taskEsc(name) + '</span>').join('');
        cells += '<span></span>'.repeat(first.getDay());
        for (let key = firstKey; key.startsWith(month); key = TasksCore.addDays(key, 1)) {
            const day = TasksCore.dateFromKey(key);
            cells += '<button type="button" data-command="pick" data-date="' + key + '" aria-label="' +
                taskEsc(format.format(day)) + '" aria-pressed="' + (selected === key || (key === now && selected === 'hoje')) +
                '"' + (key < now ? ' disabled' : '') + (key === now ? ' aria-current="date"' : '') + '>' + day.getDate() + '</button>';
        }
        const arrow = (offset, icon, label) => '<button type="button" class="btn-icon" data-command="month" data-offset="' + offset +
            '" aria-label="' + taskText(label) + '"' + (offset < 0 && month <= now.slice(0, 7) ? ' disabled' : '') + '>' + taskIcon(icon) + '</button>';
        const label = new Intl.DateTimeFormat(TaskSystem.locale(), { month: 'long', year: 'numeric' }).format(first);
        return '<div class="task-menu-head">' + this.backButton() + '<strong aria-live="polite">' + taskEsc(label) + '</strong>' +
            arrow(-1, 'caret-left', 'tasks.prev_month') + arrow(1, 'caret-right', 'tasks.next_month') +
            '</div><div class="task-calendar">' + cells + '</div>';
    },

    duration(task) {
        const options = TaskSystem.ESTIMATES.concat(null).map(minutes => '<button type="button" class="btn btn-aux btn-sm" data-command="estimate" data-minutes="' +
            (minutes || '') + '" aria-pressed="' + ((task.estimateMin || null) === minutes) + '">' +
            (minutes ? taskText('tasks.minutes', { n: minutes }) : taskText('tasks.no_estimate')) + '</button>').join('');
        return '<div class="task-menu-head">' + this.backButton() + '<strong>' + taskText('tasks.edit_estimate') + '</strong></div>' +
            (task.fromRecurrence ? '<p class="meta">' + taskText('tasks.occurrence_estimate') + '</p>' : '') +
            '<form class="task-menu-form" data-editor="duration"><div class="task-estimates">' + options +
            '</div><label class="meta">' + taskText('tasks.custom_minutes') + '<input class="input" name="estimate" type="number" min="1" step="1" inputmode="numeric" value="' +
            (task.estimateMin || '') + '"></label><button type="submit" class="btn btn-aux btn-sm">' + taskText('tasks.save') + '</button></form>';
    },

    daysButtons(days, action) {
        return t('tasks.day_short').map((label, day) => '<button type="button" data-action="' + action + '" data-day="' + day +
            '" aria-pressed="' + days.includes(day) + '" aria-label="' + taskEsc(t('tasks.day_names')[day]) + '">' + taskEsc(label) + '</button>').join('');
    },

    repeat(task) {
        const days = TasksCore.recurrenceDays(TaskSystem.tasks, task);
        return '<div class="task-menu-head">' + this.backButton() + '<strong>' + taskText('tasks.edit_days') + '</strong></div>' +
            '<p class="meta">' + taskText(days.length ? 'tasks.repeat_scope' : 'tasks.repeat_create') + '</p>' +
            '<form class="task-menu-form" data-editor="repeat"><div class="task-days" role="group" aria-label="' +
            taskText('tasks.edit_days') + '">' + this.daysButtons(days.length ? days : TasksCore.WEEKDAYS, 'repeat-day') +
            '</div><button type="submit" class="btn btn-aux btn-sm">' + taskText('tasks.save') + '</button>' +
            (days.length ? '<button type="button" data-command="end" class="btn btn-quiet btn-sm">' + taskText('tasks.end_routine') + '</button>' : '') +
            '</form>';
    },

    choose(zone) {
        const { kind, id } = this.state;
        if (zone <= TaskSystem.today() && TasksCore.dateFromKey(zone)) zone = 'hoje';
        this.close(false);
        if (kind === 'capture') {
            TaskSystem.destination = zone;
            TaskSystem.renderDestination();
            TaskSystem.elements.input.focus({ preventScroll: true });
            TaskSystem.announce(t('tasks.destination_value', { destination: TaskSystem.dateLabel(zone, true) }));
        } else TaskSystem.schedule(id, zone);
    },

    onClick(event) {
        const button = event.target.closest('button');
        if (!button || !this.state) return;
        const { kind, view, id, trigger } = this.state;
        if (button.dataset.action === 'repeat-day') {
            button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
            return;
        }
        switch (button.dataset.command) {
            case 'routines':
            case 'history':
                this.close(false);
                TaskSystem.openView(button.dataset.command);
                break;
            case 'back':
                this.state.view = kind;
                this.render(view === 'calendar' ? '[data-zone="date"]' : '[data-command="' + view + '"]');
                break;
            case 'when': {
                const zone = button.dataset.zone;
                if (zone !== 'date') { this.choose(zone); break; }
                const selected = kind === 'capture' ? TaskSystem.destination : TaskSystem.zoneOf(TaskSystem.taskById(id));
                const month = (TasksCore.dateFromKey(selected) ? selected : TaskSystem.today()).slice(0, 7);
                Object.assign(this.state, { view: 'calendar', selected, month });
                this.render('[data-date="' + (TasksCore.dateFromKey(selected) ? selected : TaskSystem.today()) + '"]');
                break;
            }
            case 'month': {
                const first = TasksCore.dateFromKey(this.state.month + '-01');
                first.setMonth(first.getMonth() + Number(button.dataset.offset));
                this.state.month = TasksCore.isoDate(first).slice(0, 7);
                this.render('[data-offset="' + button.dataset.offset + '"]:not(:disabled)');
                break;
            }
            case 'pick': this.choose(button.dataset.date); break;
            case 'duration':
            case 'repeat': this.state.view = button.dataset.command; this.render(); break;
            case 'estimate': this.close(); TaskSystem.editEstimate(id, Number(button.dataset.minutes) || null); break;
            case 'focus': this.close(); TaskSystem.startFocus(id); break;
            case 'next': this.close(); TaskSystem.schedule(id, 'hoje', { top: true }); break;
            case 'rename': this.close(); TaskSystem.beginRename(id); break;
            case 'duplicate': this.close(); TaskSystem.duplicate(id); break;
            case 'delete': this.close(); TaskSystem.remove(id); break;
            case 'skip': this.close(); TaskSystem.remove(id, true); break;
            case 'end': this.confirmEnd(TaskSystem.taskById(id)?.fromRecurrence, trigger); break;
        }
    },

    onSubmit(event) {
        event.preventDefault();
        const id = this.state?.id;
        if (!id) return;
        if (event.target.dataset.editor === 'duration') {
            const value = Number(event.target.elements.estimate.value) || null;
            this.close();
            TaskSystem.editEstimate(id, value);
        } else if (event.target.dataset.editor === 'repeat') {
            const days = [...event.target.querySelectorAll('[data-day][aria-pressed="true"]')].map(button => Number(button.dataset.day));
            if (!days.length) {
                const routine = TaskSystem.taskById(id)?.fromRecurrence;
                if (routine) this.confirmEnd(routine, this.state.trigger);
                else TaskSystem.announce(t('tasks.choose_days'));
                return;
            }
            this.close();
            TaskSystem.repeat(id, days);
        }
    },

    onKey(event) {
        if (!this.state) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.close();
            return;
        }
        const items = [...this.node.querySelectorAll('button:not(:disabled), input')];
        const index = items.indexOf(document.activeElement);
        if (event.key === 'Tab') {
            if (this.node.getAttribute('role') === 'menu' || (event.shiftKey ? index === 0 : index === items.length - 1)) this.close();
            return;
        }
        if (event.target.matches('input')) return;
        const date = event.target.dataset.date;
        const dayOffset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (date && dayOffset) {
            const next = TasksCore.addDays(date, dayOffset);
            if (next >= TaskSystem.today()) {
                this.state.month = next.slice(0, 7);
                this.render('[data-date="' + next + '"]');
            }
            event.preventDefault();
        } else if (this.node.getAttribute('role') === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        }
    },

    confirmEnd(id, opener) {
        const routine = TaskSystem.taskById(id);
        if (!routine?.recurrence) return;
        this.close(false);
        this.endingId = id;
        document.getElementById('tasks-end-title').textContent = t('tasks.end_named', { title: routine.title });
        DialogSystem.open('tasks-end-dialog', { opener, onClose: () => { this.endingId = null; } });
    }
};
