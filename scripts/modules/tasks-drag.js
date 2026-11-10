// Arraste por ponteiro. O menu e os atalhos do painel fazem as mesmas mudanças.
const TaskDrag = {
    init() {
        const panel = TaskSystem.elements.panel;
        panel.addEventListener('pointerdown', event => this.start(event));
        panel.addEventListener('click', event => {
            if (this.suppressClick && event.detail > 0) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
        window.addEventListener('pointermove', event => this.move(event), { passive: false });
        window.addEventListener('pointerup', event => this.drop(event));
        window.addEventListener('pointercancel', event => {
            if (event.pointerId === this.pointer?.id) this.cancel();
        });
        window.addEventListener('blur', () => this.cancel());
        window.addEventListener('resize', () => this.cancel());
        window.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !this.active) return;
            event.preventDefault();
            event.stopPropagation();
            this.cancel();
            TaskSystem.announce(t('tasks.drag_cancelled'));
        }, true);
    },

    start(event) {
        this.suppressClick = false;
        if (event.button !== 0 || !event.isPrimary) return;
        const row = event.target.closest('.task:not(.is-done) .task-row');
        const control = event.target.closest('button, input, .task-edit');
        if (!row || (control && !control.matches('.task-title'))) return;
        this.pointer = { id: event.pointerId, row, x: event.clientX, y: event.clientY, armed: event.pointerType !== 'touch' };
        if (!this.pointer.armed) this.pointer.timer = setTimeout(() => {
            if (this.pointer) this.pointer.armed = true;
        }, 280);
    },

    move(event) {
        const pointer = this.pointer;
        if (!pointer || event.pointerId !== pointer.id) return;
        if (!this.active) {
            const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
            if (!pointer.armed) { if (distance > 8) this.cancel(); return; }
            if (distance < 6) return;
            if (!pointer.row.isConnected) { this.cancel(); return; }
            this.lift(pointer);
        }
        event.preventDefault();
        const drag = this.active;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.ghost.style.transform = 'translate(' + (drag.x - drag.dx) + 'px,' + (drag.y - drag.dy) + 'px)';
        this.findTarget();
    },

    lift(pointer) {
        const el = TaskSystem.elements;
        const row = pointer.row.closest('.task');
        const id = row.dataset.id;
        const task = TaskSystem.taskById(id);
        const rect = pointer.row.getBoundingClientRect();
        const ghost = pointer.row.cloneNode(true);
        ghost.classList.add('task-ghost', 'surface-solid');
        ghost.inert = true;
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.width = rect.width + 'px';
        document.body.append(ghost);
        const tray = document.createElement('div');
        tray.className = 'task-drop-tray surface-solid';
        tray.setAttribute('aria-hidden', 'true');
        const dates = Array.from({ length: 7 }, (_, i) => TasksCore.addDays(TaskSystem.today(), i + 1));
        const destinations = ['top', 'hoje', ...(task.fromRecurrence ? [] : dates.concat('semdia'))];
        tray.innerHTML = '<p class="label">' + taskText('tasks.drop_title') + '</p><div>' +
            destinations.map(zone => '<span data-zone="' + zone + '">' +
                (zone === 'top' ? taskText('today.next_label') : taskEsc(TaskSystem.dateLabel(zone))) + '</span>').join('') + '</div>';
        el.capture.prepend(tray);
        el.scroll.style.setProperty('--tasks-drag-inset', tray.offsetHeight + 'px');
        row.classList.add('is-drag-source');
        el.panel.classList.add('is-dragging');
        TaskMenu.close(false);
        this.suppressClick = true;
        this.active = { id, row, ghost, tray, routine: !!task.fromRecurrence,
            dx: pointer.x - rect.left, dy: pointer.y - rect.top };
        this.active.frame = requestAnimationFrame(() => this.autoScroll());
    },

    findTarget() {
        const drag = this.active;
        const hit = document.elementFromPoint(drag.x, drag.y);
        this.clearTarget();
        const next = hit?.closest('#today-next, #today-empty');
        const target = next || hit?.closest('#tasks-panel [data-zone]');
        if (!target) return;
        const zone = next ? 'top' : target.dataset.zone;
        if (drag.routine && zone !== 'hoje' && zone !== 'top') return;
        drag.target = target;
        drag.zone = zone;
        target.classList.add('is-drop-target');
        if (!target.matches('.tasks-today')) return;
        const list = document.getElementById('tasks-today');
        const items = [...list.children].filter(item => item.dataset.id !== drag.id);
        const before = items.find(item => {
            const rect = item.getBoundingClientRect();
            return drag.y < rect.top + rect.height / 2;
        });
        drag.beforeId = before?.dataset.id ?? null;
        const line = document.createElement('li');
        line.className = 'task-drop-line';
        line.setAttribute('aria-hidden', 'true');
        list.insertBefore(line, before || null);
        drag.line = line;
    },

    autoScroll() {
        const drag = this.active;
        if (!drag) return;
        const scroll = TaskSystem.elements.scroll;
        const rect = scroll.getBoundingClientRect();
        const bottom = drag.tray.getBoundingClientRect().top;
        const edge = Math.min(42, (bottom - rect.top) / 3);
        if (drag.x > rect.left && drag.x < rect.right && drag.y >= rect.top && drag.y < bottom) {
            const delta = drag.y < rect.top + edge ? -9 : drag.y > bottom - edge ? 9 : 0;
            if (delta) {
                scroll.scrollTop += delta;
                this.findTarget();
            }
        }
        drag.frame = requestAnimationFrame(() => this.autoScroll());
    },

    clearTarget() {
        const drag = this.active;
        drag.target?.classList.remove('is-drop-target');
        drag.line?.remove();
        drag.target = drag.zone = drag.line = drag.beforeId = undefined;
    },

    async drop(event) {
        if (event.pointerId !== this.pointer?.id) return;
        const drag = this.active;
        const zone = drag?.zone;
        const beforeId = drag?.beforeId;
        this.cancel();
        if (!zone) return;
        const rows = [...document.querySelectorAll('#tasks-today .task')];
        const before = new Map(rows.map(row => [row.dataset.id, row.getBoundingClientRect().top]));
        const options = zone === 'top' ? { top: true } : beforeId !== undefined ? { beforeId } : undefined;
        await TaskSystem.schedule(drag.id, zone === 'top' ? 'hoje' : zone, options);
        document.querySelectorAll('#tasks-today .task').forEach(row => {
            if (!before.has(row.dataset.id)) return;
            const dy = before.get(row.dataset.id) - row.getBoundingClientRect().top;
            if (Math.abs(dy) > 1) Motion.play(row, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }],
                { duration: 240, channel: 'tasks-reorder' });
        });
    },

    cancel() {
        clearTimeout(this.pointer?.timer);
        this.pointer = null;
        if (!this.active) return;
        this.clearTarget();
        cancelAnimationFrame(this.active.frame);
        this.active.ghost.remove();
        this.active.tray.remove();
        this.active.row.classList.remove('is-drag-source');
        TaskSystem.elements.scroll.style.removeProperty('--tasks-drag-inset');
        TaskSystem.elements.panel.classList.remove('is-dragging');
        this.active = null;
    }
};
