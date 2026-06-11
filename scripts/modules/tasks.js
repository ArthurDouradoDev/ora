const TaskSystem = {
    // Dependencies: AsyncStorage, i18n (t), animateModal, isModalVisible, showToast

    STORAGE_KEY: 'ora_tasks_daily',
    ACTIVE_TASK_KEY: 'ora_active_task_id',

    tasks: [],
    activeTaskId: null,
    editingTaskId: null,

    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.loadData();
        await this.checkDailyReset();
        this.render();
        this.updateActiveTaskUI();

        // Listen for storage changes from other tabs/windows
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes[this.STORAGE_KEY]) {
                    const newValue = changes[this.STORAGE_KEY].newValue || [];
                    if (JSON.stringify(this.tasks) !== JSON.stringify(newValue)) {
                        this.tasks = newValue;
                        this.render();
                    }
                }
                if (changes[this.ACTIVE_TASK_KEY]) {
                    const newActiveId = changes[this.ACTIVE_TASK_KEY].newValue || null;
                    if (this.activeTaskId !== newActiveId) {
                        this.activeTaskId = newActiveId;
                        this.updateActiveTaskUI();
                    }
                }
            }
        });

        console.log('[Ora] Task System initialized');
    },

    cacheDOM: function() {
        this.elements = {
            // Triggers
            btnTasks: document.getElementById('btn-tasks'),
            badge: document.getElementById('tasks-badge'),

            // Modal
            modal: document.getElementById('tasks-modal'),
            closeBtn: document.getElementById('close-tasks-btn'),
            optionsBtn: document.getElementById('tasks-options-btn'),
            optionsMenu: document.getElementById('tasks-options-menu'),
            progressText: document.getElementById('tasks-progress-text'),
            footerMsg: document.getElementById('tasks-footer-msg'),

            // Add Task
            inputName: document.getElementById('new-task-input'),
            inputIntention: document.getElementById('task-intention-input'),
            selectCycles: document.getElementById('task-cycles-select'),
            toggleRecurring: document.getElementById('toggle-recurring-btn'),
            btnAdd: document.getElementById('add-task-btn'),

            // Lists (unified: pending + collapsible completed)
            listActive: document.getElementById('tasks-list-active'),
            listCompleted: document.getElementById('tasks-list-completed'),
            completedToggle: document.getElementById('tasks-completed-toggle'),
            completedCount: document.getElementById('tasks-completed-count'),
            emptyState: document.getElementById('tasks-empty-state'),

            // Active Task Bar (home footer)
            activeTaskBar: document.getElementById('active-task-bar'),
            activeTaskBarName: document.getElementById('active-task-bar-name'),
            activeTaskBarCycles: document.getElementById('active-task-bar-cycles'),
            activeTaskBarPlay: document.getElementById('active-task-bar-play'),

            // Dropdown Actions
            optClearDone: document.getElementById('tasks-opt-clear-done'),
            optResetToday: document.getElementById('tasks-opt-reset-today'),
            optResetRecurring: document.getElementById('tasks-opt-reset-recurring'),
            optRemoveAll: document.getElementById('tasks-opt-remove-all'),

            // Pomodoro Integration (fullscreen only)
            fsActiveTaskName: document.getElementById('focus-fs-active-task-name'),
            fsActiveTaskIntention: document.getElementById('focus-fs-active-task-intention'),
            fsTasksDropdown: document.getElementById('focus-fs-tasks-dropdown')
        };
    },

    bindEvents: function() {
        // Modal toggling
        if (this.elements.btnTasks) {
            this.elements.btnTasks.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(this.elements.modal)) {
                    animateModal(this.elements.modal, true);
                    this.elements.inputName.focus();
                } else {
                    animateModal(this.elements.modal, false);
                }
            });
        }

        if (this.elements.closeBtn) {
            this.elements.closeBtn.addEventListener('click', () => {
                animateModal(this.elements.modal, false);
            });
        }

        // Add Task
        this.elements.toggleRecurring.addEventListener('click', () => {
            this.elements.toggleRecurring.classList.toggle('active');
        });

        const handleAdd = () => this.addTask();
        this.elements.btnAdd.addEventListener('click', handleAdd);
        this.elements.inputName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAdd();
        });
        this.elements.inputIntention.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAdd();
        });

        // Options Menu
        this.elements.optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = this.elements.optionsMenu;
            const isVisible = menu.style.display !== 'none';
            menu.style.display = isVisible ? 'none' : 'flex';
        });

        document.addEventListener('click', (e) => {
            // Close options menu on outside click
            if (this.elements.optionsMenu && this.elements.optionsMenu.style.display !== 'none' &&
                !this.elements.optionsBtn.contains(e.target) && !this.elements.optionsMenu.contains(e.target)) {
                this.elements.optionsMenu.style.display = 'none';
            }
            // Close tasks modal on outside click (centered modal)
            if (this.elements.modal && isModalVisible(this.elements.modal) &&
                !this.elements.modal.contains(e.target) &&
                this.elements.btnTasks && !this.elements.btnTasks.contains(e.target)) {
                // Guard: detached target = was inside modal before re-render, ignore
                if (!document.contains(e.target)) return;
                animateModal(this.elements.modal, false);
            }
            // Fullscreen pomodoro dropdown
            if (this.elements.fsTasksDropdown && this.elements.fsTasksDropdown.style.display !== 'none') {
                const parent = this.elements.fsTasksDropdown.parentElement;
                if (parent && !parent.contains(e.target)) {
                    this.elements.fsTasksDropdown.style.display = 'none';
                }
            }
        });

        // Completed section toggle
        if (this.elements.completedToggle) {
            this.elements.completedToggle.addEventListener('click', () => {
                const opened = this.elements.completedToggle.classList.toggle('open');
                this.elements.listCompleted.style.display = opened ? 'flex' : 'none';
            });
        }

        // Active task bar (home footer)
        if (this.elements.activeTaskBar) {
            this.elements.activeTaskBar.addEventListener('click', (e) => {
                e.stopPropagation();
                // Avoid re-opening when the play button is clicked
                if (e.target.closest('#active-task-bar-play')) return;
                if (!isModalVisible(this.elements.modal)) {
                    animateModal(this.elements.modal, true);
                }
            });
        }
        if (this.elements.activeTaskBarPlay) {
            this.elements.activeTaskBarPlay.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.activeTaskId) {
                    this.startPomodoroForTask(this.activeTaskId);
                }
            });
        }

        this.elements.optClearDone.addEventListener('click', () => {
            this.clearDone();
            this.elements.optionsMenu.style.display = 'none';
        });
        this.elements.optResetToday.addEventListener('click', () => {
            if (confirm("Tem certeza? Isso desmarcará todas as tarefas para hoje.")) {
                this.resetAllToday();
            }
            this.elements.optionsMenu.style.display = 'none';
        });
        this.elements.optResetRecurring.addEventListener('click', () => {
            this.resetRecurring();
            this.elements.optionsMenu.style.display = 'none';
        });
        this.elements.optRemoveAll.addEventListener('click', () => {
            if (confirm("Atenção: Isso excluirá DE VEZ todas as tarefas, incluindo a sua rotina. Continuar?")) {
                this.removeAll();
            }
            this.elements.optionsMenu.style.display = 'none';
        });

        // Fullscreen Pomodoro Task Selector
        if (this.elements.fsActiveTaskName) {
            this.elements.fsActiveTaskName.parentElement.addEventListener('click', (e) => {
                e.stopPropagation();
                // Block selection during break if no active task
                if (this.isInBreakPhase() && !this.activeTaskId) {
                    showToast("Selecione uma tarefa antes do próximo ciclo de foco.", "warning");
                    return;
                }
                const dropdown = this.elements.fsTasksDropdown;
                if (!dropdown) return;
                const isVisible = dropdown.style.display !== 'none' && dropdown.style.display !== '';
                dropdown.style.display = isVisible ? 'none' : 'flex';
            });
        }
    },

    // --- Helpers ---

    isInBreakPhase: function() {
        if (!window.FocusSystem) return false;
        return window.FocusSystem.phase === 'pause' || window.FocusSystem.phase === 'longPause';
    },

    // --- Data ---

    loadData: async function() {
        const stored = await AsyncStorage.get(this.STORAGE_KEY);
        this.tasks = stored || [];

        const activeId = await AsyncStorage.get(this.ACTIVE_TASK_KEY);
        if (activeId) this.activeTaskId = activeId;
    },

    saveData: async function() {
        await AsyncStorage.set(this.STORAGE_KEY, this.tasks);
        this.render();
        this.updateActiveTaskUI();
    },

    checkDailyReset: async function() {
        const today = new Date().toDateString();
        const lastResetDate = await AsyncStorage.get('ora_tasks_last_reset');

        if (lastResetDate !== today) {
            let changed = false;
            const remainingTasks = [];

            for (const task of this.tasks) {
                if (task.recurring) {
                    task.done = false;
                    task.completedCycles = 0;
                    task.completedAt = null;
                    remainingTasks.push(task);
                    changed = true;
                } else {
                    if (!task.done) {
                        remainingTasks.push(task);
                    } else {
                        changed = true;
                    }
                }
            }

            if (changed) {
                this.tasks = remainingTasks;
                await this.saveData();
            }

            await AsyncStorage.set('ora_tasks_last_reset', today);
        }
    },

    // --- Core Operations ---

    addTask: async function() {
        const textStr = this.elements.inputName.value.trim();
        if (!textStr) return;

        const intentionStr = this.elements.inputIntention.value.trim();
        const cycles = parseInt(this.elements.selectCycles.value) || 1;
        const isRecurring = this.elements.toggleRecurring.classList.contains('active');

        if (this.tasks.length >= 8) {
            showToast("Muitas tarefas podem dispersar o foco. Priorize as essenciais.", "warning");
        }

        const newTask = {
            id: Date.now().toString(),
            text: textStr,
            intention: intentionStr,
            totalCycles: cycles,
            completedCycles: 0,
            done: false,
            recurring: isRecurring,
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        this.tasks.push(newTask);

        // Auto-select if no active task
        if (!this.activeTaskId) {
            await this.setActiveTask(newTask.id);
        }

        await this.saveData();

        // Reset inputs
        this.elements.inputName.value = '';
        this.elements.inputIntention.value = '';
        this.elements.toggleRecurring.classList.remove('active');
        this.elements.inputName.focus();
    },

    toggleTaskStatus: async function(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        task.done = !task.done;
        if (task.done) {
            task.completedAt = new Date().toISOString();
            if (task.completedCycles < task.totalCycles) {
                task.completedCycles = task.totalCycles;
            }
        } else {
            task.completedAt = null;
        }

        await this.saveData();
        this.checkAllDoneAnimation();
    },

    deleteTask: async function(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        if (this.activeTaskId === id) {
            await this.setActiveTask(null);
        }
        await this.saveData();
    },

    toggleRecurrence: async function(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        task.recurring = !task.recurring;
        await this.saveData();
    },

    // --- Reorder Tasks ---

    moveTask: async function(id, direction) {
        const idx = this.tasks.findIndex(t => t.id === id);
        if (idx === -1) return;

        const task = this.tasks[idx];
        if (task.done) return; // completed tasks are not reorderable in the unified list

        // Move among pending tasks regardless of recurring vs single
        if (direction === 'up') {
            for (let i = idx - 1; i >= 0; i--) {
                if (!this.tasks[i].done) {
                    this.tasks.splice(idx, 1);
                    this.tasks.splice(i, 0, task);
                    break;
                }
            }
        } else {
            for (let i = idx + 1; i < this.tasks.length; i++) {
                if (!this.tasks[i].done) {
                    this.tasks.splice(idx, 1);
                    this.tasks.splice(i, 0, task);
                    break;
                }
            }
        }

        await this.saveData();
    },

    // --- Edit Task ---

    startEditTask: function(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        this.editingTaskId = id;
        this.render();
    },

    saveEditTask: async function(id, newText, newIntention) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        const text = newText.trim();
        if (!text) return;
        task.text = text;
        task.intention = newIntention.trim();
        this.editingTaskId = null;
        await this.saveData();
    },

    cancelEditTask: function() {
        this.editingTaskId = null;
        this.render();
    },

    // --- Start Pomodoro from Task ---

    startPomodoroForTask: async function(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task || task.done) return;

        // Set as active task
        await this.setActiveTask(id);

        // Open focus timer and start
        if (window.FocusSystem) {
            // If not visible, show compact first
            const miniEl = document.getElementById('focus-mini');
            const fsEl = document.getElementById('focus-fullscreen');
            if (!isModalVisible(miniEl) && !isModalVisible(fsEl)) {
                window.FocusSystem.showCompact();
            }
            // Start timer if not running
            if (!window.FocusSystem.isTimerRunning) {
                // If in break phase, skip to focus first
                if (this.isInBreakPhase()) {
                    await window.FocusSystem.sendCommand('pomodoro:skip');
                    // Small delay for state to update
                    setTimeout(() => {
                        window.FocusSystem.sendCommand('pomodoro:start');
                    }, 200);
                } else {
                    window.FocusSystem.sendCommand('pomodoro:start');
                }
            }
            showToast(`Foco iniciado: ${task.text}`);
        }
    },

    // --- Global Operations ---

    clearDone: async function() {
        const initialLen = this.tasks.length;
        this.tasks = this.tasks.filter(t => !(t.done && !t.recurring));
        if (this.tasks.length < initialLen) {
            showToast("Tarefas únicas concluídas removidas.");
            await this.saveData();
            if (!this.tasks.find(t => t.id === this.activeTaskId)) {
                await this.setActiveTask(null);
            }
        }
    },

    resetAllToday: async function() {
        this.tasks.forEach(t => {
            t.done = false;
            t.completedCycles = 0;
            t.completedAt = null;
        });
        showToast("Progresso de hoje resetado.");
        await this.saveData();
    },

    resetRecurring: async function() {
        this.tasks.forEach(t => {
            if (t.recurring) {
                t.done = false;
                t.completedCycles = 0;
                t.completedAt = null;
            }
        });
        showToast("Rotina diária resetada.");
        await this.saveData();
    },

    removeAll: async function() {
        this.tasks = [];
        await this.setActiveTask(null);
        await this.saveData();
        showToast("Todas as tarefas removidas.");
    },

    // --- Active Task Integration ---

    getActiveTaskId: function() {
        return this.activeTaskId;
    },

    setActiveTask: async function(id) {
        if (this.tasks.find(t => t.id === id)) {
            this.activeTaskId = id;
        } else {
            this.activeTaskId = null;
        }
        await AsyncStorage.set(this.ACTIVE_TASK_KEY, this.activeTaskId);
        this.updateActiveTaskUI();
        this.render();
    },

    incrementActiveTaskCycle: async function() {
        if (!this.activeTaskId) return;
        const task = this.tasks.find(t => t.id === this.activeTaskId);
        if (!task || task.done) return;

        task.completedCycles += 1;

        if (task.completedCycles >= task.totalCycles) {
            task.completedCycles = task.totalCycles;
            task.done = true;
            task.completedAt = new Date().toISOString();
            showToast(`✓ Tarefa concluída: ${task.text}`, "success");
            this.checkAllDoneAnimation();
            await this.setActiveTask(null);
        } else {
            showToast(`Ciclo completo! Progresso em: ${task.text}`);
        }

        await this.saveData();
    },

    // --- Rendering ---

    render: function() {
        const pending = this.tasks.filter(t => !t.done);
        const completed = this.tasks.filter(t => t.done);

        const pendingFragment = document.createDocumentFragment();
        const completedFragment = document.createDocumentFragment();

        pending.forEach(t => this.renderTaskItem(t, pendingFragment));
        completed.forEach(t => this.renderTaskItem(t, completedFragment));

        this.elements.listActive.innerHTML = '';
        this.elements.listActive.appendChild(pendingFragment);

        this.elements.listCompleted.innerHTML = '';
        this.elements.listCompleted.appendChild(completedFragment);

        // Completed toggle visibility + count
        if (this.elements.completedToggle) {
            this.elements.completedToggle.style.display = completed.length > 0 ? 'flex' : 'none';
            if (this.elements.completedCount) {
                this.elements.completedCount.textContent = `(${completed.length})`;
            }
            // Keep collapsed display state in sync: if no completed, hide list regardless
            if (completed.length === 0) {
                this.elements.completedToggle.classList.remove('open');
                this.elements.listCompleted.style.display = 'none';
            }
        }

        // Empty State
        this.elements.emptyState.style.display = (this.tasks.length === 0) ? 'flex' : 'none';

        // Badge & Progress
        const pendingCount = pending.length;
        const totalCount = this.tasks.length;
        const doneCount = completed.length;

        if (this.elements.badge) {
            this.elements.badge.textContent = pendingCount;
            this.elements.badge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
        }

        if (this.elements.progressText) {
            this.elements.progressText.textContent = t('tasks.progress_text', { done: doneCount, total: totalCount });
        }

        // Footer encouragement
        if (totalCount > 0 && pendingCount === 0) {
            this.elements.footerMsg.style.display = 'block';
        } else {
            this.elements.footerMsg.style.display = 'none';
        }
    },

    renderTaskItem: function(task, container) {
        const item = document.createElement('div');
        item.className = 'task-item';
        if (task.done) item.classList.add('done');
        if (task.id === this.activeTaskId && !task.done) item.classList.add('active-pomodoro');

        // Edit mode
        if (this.editingTaskId === task.id) {
            item.classList.add('editing');
            item.innerHTML = `
                <div class="task-edit-form">
                    <input type="text" class="task-edit-input" value="${this.escapeHtml(task.text)}" placeholder="${this.escapeHtml(t('tasks.edit_name_placeholder'))}">
                    <input type="text" class="task-edit-intention" value="${this.escapeHtml(task.intention || '')}" placeholder="${this.escapeHtml(t('tasks.intention_placeholder'))}">
                    <div class="task-edit-actions">
                        <button class="task-edit-save"><i class="ph ph-check"></i> ${this.escapeHtml(t('tasks.edit_save'))}</button>
                        <button class="task-edit-cancel"><i class="ph ph-x"></i> ${this.escapeHtml(t('tasks.edit_cancel'))}</button>
                    </div>
                </div>
            `;

            // Stop all clicks inside the edit form from bubbling (prevents modal close)
            item.addEventListener('click', (e) => e.stopPropagation());

            const inputText = item.querySelector('.task-edit-input');
            const inputIntention = item.querySelector('.task-edit-intention');
            const btnSave = item.querySelector('.task-edit-save');
            const btnCancel = item.querySelector('.task-edit-cancel');

            btnSave.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveEditTask(task.id, inputText.value, inputIntention.value);
            });
            btnCancel.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelEditTask();
            });
            inputText.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveEditTask(task.id, inputText.value, inputIntention.value);
            });
            inputIntention.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveEditTask(task.id, inputText.value, inputIntention.value);
            });

            // Auto-focus
            setTimeout(() => inputText.focus(), 50);

            container.appendChild(item);
            return;
        }

        // Normal render
        const isChecked = task.done ? 'checked' : '';
        const checkIcon = task.done ? '<i class="ph ph-check"></i>' : '';

        let cyclesHtml = '';
        for (let i = 0; i < task.totalCycles; i++) {
            const isCompletedCycle = i < task.completedCycles;
            cyclesHtml += `<div class="focus-dot ${isCompletedCycle ? 'completed' : ''}"></div>`;
        }

        const recurringBadge = task.recurring
            ? `<span class="task-badge-recurring" title="${this.escapeHtml(t('tasks.recurring_badge'))}"><i class="ph ph-repeat"></i></span>`
            : '';

        const intentionChip = task.intention
            ? `<span class="task-intention-chip">
                   <i class="ph ph-cross"></i>
                   <span class="task-intention-label">${this.escapeHtml(t('tasks.offer_for'))}:</span>
                   <span class="task-intention-text">${this.escapeHtml(task.intention)}</span>
               </span>`
            : '';

        item.innerHTML = `
            <div class="task-checkbox-container">
                <div class="task-checkbox ${isChecked}" data-id="${task.id}">${checkIcon}</div>
            </div>
            <div class="task-content">
                <div class="task-title-row">
                    ${recurringBadge}
                    <span class="task-title">${this.escapeHtml(task.text)}</span>
                    ${task.id === this.activeTaskId && !task.done ? '<i class="ph ph-play-circle task-active-indicator" title="Foco atual"></i>' : ''}
                </div>
                ${intentionChip}
                <div class="task-cycles">${cyclesHtml}</div>
            </div>
            <div class="task-actions">
                ${!task.done ? `<button class="icon-btn-sm btn-move-up" data-id="${task.id}" title="${this.escapeHtml(t('tasks.move_up'))}"><i class="ph ph-caret-up"></i></button>` : ''}
                ${!task.done ? `<button class="icon-btn-sm btn-move-down" data-id="${task.id}" title="${this.escapeHtml(t('tasks.move_down'))}"><i class="ph ph-caret-down"></i></button>` : ''}
                ${!task.done && task.id !== this.activeTaskId ? `<button class="icon-btn-sm btn-start-pomodoro primary-action" data-id="${task.id}" title="${this.escapeHtml(t('tasks.start_focus'))}"><i class="ph ph-play"></i></button>` : ''}
                <button class="icon-btn-sm btn-edit-task" data-id="${task.id}" title="${this.escapeHtml(t('tasks.edit_task'))}"><i class="ph ph-pencil-simple"></i></button>
                ${task.recurring ?
                    `<button class="icon-btn-sm btn-unrecur" data-id="${task.id}" title="${this.escapeHtml(t('tasks.make_single'))}"><i class="ph ph-arrow-bend-down-right"></i></button>`
                    : ''}
                <button class="icon-btn-sm btn-delete-task" data-id="${task.id}" title="${this.escapeHtml(t('tasks.delete_task'))}"><i class="ph ph-trash"></i></button>
            </div>
        `;

        // Bind events
        item.querySelector('.task-checkbox').addEventListener('click', () => this.toggleTaskStatus(task.id));
        item.querySelector('.btn-delete-task').addEventListener('click', () => this.deleteTask(task.id));
        item.querySelector('.btn-edit-task').addEventListener('click', () => this.startEditTask(task.id));

        const btnStart = item.querySelector('.btn-start-pomodoro');
        if (btnStart) {
            btnStart.addEventListener('click', () => this.startPomodoroForTask(task.id));
        }

        const btnUnrecur = item.querySelector('.btn-unrecur');
        if (btnUnrecur) {
            btnUnrecur.addEventListener('click', () => this.toggleRecurrence(task.id));
        }

        const btnMoveUp = item.querySelector('.btn-move-up');
        if (btnMoveUp) {
            btnMoveUp.addEventListener('click', () => this.moveTask(task.id, 'up'));
        }

        const btnMoveDown = item.querySelector('.btn-move-down');
        if (btnMoveDown) {
            btnMoveDown.addEventListener('click', () => this.moveTask(task.id, 'down'));
        }

        container.appendChild(item);
    },

    escapeHtml: function(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    updateActiveTaskUI: function() {
        const pendingTasks = this.tasks.filter(task => !task.done);
        const activeTask = pendingTasks.find(task => task.id === this.activeTaskId);
        const taskName = activeTask ? activeTask.text : t('tasks.no_active_task');

        if (this.elements.fsActiveTaskName) this.elements.fsActiveTaskName.textContent = taskName;

        // Show intention below task name in fullscreen focus mode
        if (this.elements.fsActiveTaskIntention) {
            if (activeTask && activeTask.intention) {
                this.elements.fsActiveTaskIntention.textContent = `${t('tasks.offer_for')}: ${activeTask.intention}`;
                this.elements.fsActiveTaskIntention.style.display = 'block';
            } else {
                this.elements.fsActiveTaskIntention.style.display = 'none';
            }
        }

        // Home footer active-task bar
        if (this.elements.activeTaskBar) {
            if (activeTask) {
                this.elements.activeTaskBar.style.display = 'flex';
                if (this.elements.activeTaskBarName) {
                    this.elements.activeTaskBarName.textContent = activeTask.text;
                }
                if (this.elements.activeTaskBarCycles) {
                    let cyclesHtml = '';
                    for (let i = 0; i < activeTask.totalCycles; i++) {
                        const done = i < activeTask.completedCycles;
                        cyclesHtml += `<div class="focus-dot ${done ? 'completed' : ''}"></div>`;
                    }
                    this.elements.activeTaskBarCycles.innerHTML = cyclesHtml;
                }
            } else {
                this.elements.activeTaskBar.style.display = 'none';
            }
        }

        // Render fullscreen dropdown
        const dropdownEl = this.elements.fsTasksDropdown;
        if (!dropdownEl) return;
        dropdownEl.innerHTML = '';

        const btnNone = document.createElement('button');
        btnNone.className = 'task-selector-item' + (!this.activeTaskId ? ' selected' : '');
        btnNone.innerHTML = `<i class="ph ph-x-circle"></i> ${this.escapeHtml(t('tasks.no_task_option'))}`;
        btnNone.addEventListener('click', () => {
            this.setActiveTask(null);
            dropdownEl.style.display = 'none';
        });
        dropdownEl.appendChild(btnNone);

        pendingTasks.forEach(task => {
            const btn = document.createElement('button');
            btn.className = 'task-selector-item' + (this.activeTaskId === task.id ? ' selected' : '');
            btn.innerHTML = `
                ${task.recurring ? '<i class="ph ph-repeat"></i>' : '<i class="ph ph-check-square"></i>'}
                <span>${this.escapeHtml(task.text)}</span>
            `;
            btn.addEventListener('click', () => {
                this.setActiveTask(task.id);
                dropdownEl.style.display = 'none';
            });
            dropdownEl.appendChild(btn);
        });
    },

    checkAllDoneAnimation: function() {
        const totalCount = this.tasks.length;
        const pendingCount = this.tasks.filter(t => !t.done).length;
        if (totalCount > 0 && pendingCount === 0) {
            if (window.showToast) {
                showToast("Todas as tarefas concluídas! Bom trabalho.", "success");
            }
        }
    }
};

window.TaskSystem = TaskSystem;
