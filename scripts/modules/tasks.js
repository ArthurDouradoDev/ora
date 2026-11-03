const TaskSystem = {
    // Dependencies: AsyncStorage, i18n (t), animateModal, isModalVisible, showToast,
    // TasksCore, SessionsCore, CounterCore.
    // Tarefas (ora_tasks) não guardam ciclos: as sessões de foco são gravadas
    // pelo SW em ora_sessions e só são lidas aqui para exibir o progresso.
    // Concluir não cria sessões (E01) e completar sessões não conclui (E02).
    // Interface antiga adaptada até a fase 2 (painel lateral).

    STORAGE_KEY: 'ora_tasks',
    HISTORY_KEY: 'ora_tasks_history',
    SESSIONS_KEY: 'ora_sessions',
    ACTIVE_TASK_KEY: 'ora_active_task_id',
    EXTRA_DAYS_KEY: 'ora_imported_active_days',
    RITUAL_SHOWN_KEY: 'ora_ritual_last_shown',
    WIDGET_COLLAPSED_KEY: 'ora_home_widget_collapsed',
    HOME_WIDGET_MAX: TasksCore.HOME_MAX,
    PLANNED_SESSIONS_MAX: 4,

    tasks: [],    // includes routine templates (hidden) — see TasksCore
    history: [],
    sessions: [],
    activeTaskId: null,
    editingTaskId: null,
    _userCollapsed: false, // user preference (persisted)
    _autoCollapsed: false, // temporary, while the prayers popup is open

    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.loadData();
        this._userCollapsed = (await AsyncStorage.get(this.WIDGET_COLLAPSED_KEY, false)) === true;
        this.applyWidgetCollapsed();
        await this.applyDayRollover();
        this.render();
        this.updateActiveTaskUI();
        await this.maybeShowMorningRitual();

        // A tab left open overnight rolls the day over when it comes back
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this._day !== TasksCore.isoDate(new Date())) {
                this.applyDayRollover().then(() => this.render());
            }
        });

        // Listen for storage changes from other tabs/windows (and the SW)
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes[this.STORAGE_KEY]) {
                    const newValue = TasksCore.normalizeTasks(changes[this.STORAGE_KEY].newValue);
                    if (JSON.stringify(this.tasks) !== JSON.stringify(newValue)) {
                        this.tasks = newValue;
                        this.render();
                        this.updateActiveTaskUI();
                    }
                }
                if (changes[this.HISTORY_KEY]) {
                    this.history = changes[this.HISTORY_KEY].newValue || [];
                }
                if (changes[this.SESSIONS_KEY]) {
                    this.sessions = changes[this.SESSIONS_KEY].newValue || [];
                    this.render();
                }
                if (changes[this.ACTIVE_TASK_KEY]) {
                    const newActiveId = changes[this.ACTIVE_TASK_KEY].newValue || null;
                    if (this.activeTaskId !== newActiveId) {
                        this.activeTaskId = newActiveId;
                        this.updateActiveTaskUI();
                        this.renderHomeWidget();
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
            toggleRecurring: document.getElementById('toggle-recurring-btn'),
            btnAdd: document.getElementById('add-task-btn'),

            // Lists (unified: pending + collapsible completed)
            listActive: document.getElementById('tasks-list-active'),
            listCompleted: document.getElementById('tasks-list-completed'),
            completedToggle: document.getElementById('tasks-completed-toggle'),
            completedCount: document.getElementById('tasks-completed-count'),
            emptyState: document.getElementById('tasks-empty-state'),

            // Home Tasks Widget
            homeWidget: document.getElementById('home-tasks-widget'),
            homeCollapse: document.getElementById('home-tasks-collapse'),
            homeList: document.getElementById('home-tasks-list'),
            homeDoneMsg: document.getElementById('home-tasks-done-msg'),
            homePlanCta: document.getElementById('home-tasks-plan-cta'),
            homeViewAll: document.getElementById('home-tasks-view-all'),

            // Morning Ritual
            ritualModal: document.getElementById('morning-ritual-modal'),
            ritualCloseBtn: document.getElementById('ritual-close-btn'),
            ritualGreeting: document.getElementById('ritual-greeting'),
            ritualStats: document.getElementById('ritual-stats'),
            ritualWeek: document.getElementById('ritual-week'),
            ritualRoutineSection: document.getElementById('ritual-routine-section'),
            ritualRoutineList: document.getElementById('ritual-routine-list'),
            ritualPriorityInputs: document.querySelectorAll('.ritual-priority-input'),
            ritualSkipBtn: document.getElementById('ritual-skip-btn'),
            ritualStartBtn: document.getElementById('ritual-start-btn'),

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
                this.elements.btnTasks && !this.elements.btnTasks.contains(e.target) &&
                (!this.elements.homeWidget || !this.elements.homeWidget.contains(e.target))) {
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

        // Home Tasks Widget — collapse handle
        if (this.elements.homeCollapse) {
            this.elements.homeCollapse.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle relative to the visible state, then persist as preference
                this._userCollapsed = !(this._userCollapsed || this._autoCollapsed);
                this._autoCollapsed = false;
                AsyncStorage.set(this.WIDGET_COLLAPSED_KEY, this._userCollapsed);
                this.applyWidgetCollapsed();
            });
        }

        // Auto-collapse while the prayers popup (bottom-right corner) is open,
        // restoring the previous state when it closes.
        const prayerList = document.getElementById('prayer-list');
        if (prayerList && window.MutationObserver) {
            const observer = new MutationObserver(() => {
                const open = isModalVisible(prayerList);
                if (open && !this._userCollapsed && !this._autoCollapsed) {
                    this._autoCollapsed = true;
                    this.applyWidgetCollapsed();
                } else if (!open && this._autoCollapsed) {
                    this._autoCollapsed = false;
                    this.applyWidgetCollapsed();
                }
            });
            observer.observe(prayerList, { attributes: true, attributeFilter: ['style', 'class'] });
        }

        // Home Tasks Widget
        if (this.elements.homeViewAll) {
            this.elements.homeViewAll.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(this.elements.modal)) {
                    animateModal(this.elements.modal, true);
                }
            });
        }
        if (this.elements.homePlanCta) {
            this.elements.homePlanCta.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(this.elements.modal)) {
                    animateModal(this.elements.modal, true);
                    this.elements.inputName.focus();
                }
            });
        }

        // Morning Ritual
        if (this.elements.ritualModal) {
            const closeRitual = () => animateModal(this.elements.ritualModal, false);
            this.elements.ritualCloseBtn.addEventListener('click', closeRitual);
            this.elements.ritualSkipBtn.addEventListener('click', closeRitual);
            this.elements.ritualStartBtn.addEventListener('click', () => this.startDayFromRitual());

            // Enter jumps to the next priority input; on the last one, starts the day
            const inputs = Array.from(this.elements.ritualPriorityInputs);
            inputs.forEach((input, idx) => {
                input.addEventListener('keypress', (e) => {
                    if (e.key !== 'Enter') return;
                    if (idx < inputs.length - 1) {
                        inputs[idx + 1].focus();
                    } else {
                        this.startDayFromRitual();
                    }
                });
            });
        }

        this.elements.optClearDone.addEventListener('click', () => {
            this.clearDone();
            this.elements.optionsMenu.style.display = 'none';
        });
        this.elements.optResetToday.addEventListener('click', () => {
            if (confirm(t('tasks.confirm_reset_today'))) {
                this.resetAllToday();
            }
            this.elements.optionsMenu.style.display = 'none';
        });
        this.elements.optResetRecurring.addEventListener('click', () => {
            this.resetRecurring();
            this.elements.optionsMenu.style.display = 'none';
        });
        this.elements.optRemoveAll.addEventListener('click', () => {
            if (confirm(t('tasks.confirm_remove_all'))) {
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
                    showToast(t('tasks.select_task_warning'), "warning");
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

    formatFocusTime: function(seconds) {
        if (!seconds || seconds < 60) return null;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },

    taskById: function(id) {
        return this.tasks.find(task => task.id === id) || null;
    },

    visibleTasks: function() {
        return TasksCore.visibleTasks(this.tasks);
    },

    focusMinutes: function() {
        const focus = window.FocusSystem && window.FocusSystem.settings && window.FocusSystem.settings.focus;
        return focus || 25;
    },

    // Sessões previstas = estimativa ÷ duração do foco (só exibição)
    plannedSessions: function(task) {
        if (!task.estimateMin) return 1;
        return Math.max(1, Math.min(this.PLANNED_SESSIONS_MAX, Math.round(task.estimateMin / this.focusMinutes())));
    },

    sessionsDone: function(task) {
        return TasksCore.sessionsDoneToday(this.sessions, task.id, new Date());
    },

    renderSessionDots: function(task) {
        const done = this.sessionsDone(task);
        const total = Math.max(this.plannedSessions(task), done);
        let html = '';
        for (let i = 0; i < total; i++) {
            html += `<div class="focus-dot ${i < done ? 'completed' : ''}"></div>`;
        }
        return html;
    },

    // --- Data ---

    loadData: async function() {
        this.tasks = TasksCore.normalizeTasks(await AsyncStorage.get(this.STORAGE_KEY, []));
        this.history = (await AsyncStorage.get(this.HISTORY_KEY, [])) || [];
        this.sessions = (await AsyncStorage.get(this.SESSIONS_KEY, [])) || [];

        const activeId = await AsyncStorage.get(this.ACTIVE_TASK_KEY);
        if (activeId) this.activeTaskId = activeId;
    },

    saveData: async function() {
        const saved = await AsyncStorage.set(this.STORAGE_KEY, this.tasks);
        this.render();
        this.updateActiveTaskUI();
        return saved;
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
        if (this.activeTaskId && !this.taskById(this.activeTaskId)) {
            await this.setActiveTask(null);
        }
    },

    startOfDay: function(daysAgo) {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo).getTime();
    },

    // Tarefas concluídas em [from, to) (histórico + lista atual)
    countCompletedBetween: function(from, to) {
        return this.history.concat(this.tasks).filter(task => {
            const at = task && task.completedAt;
            return at && at >= from && at < to;
        }).length;
    },

    // --- Morning Ritual (first tab of the day) ---

    maybeShowMorningRitual: async function() {
        if (!this.elements.ritualModal) return;
        // Don't compete with the first-run onboarding wizard — the ritual
        // will show on the next tab instead (key is not marked yet).
        const onboardingDone = await AsyncStorage.get('ora_onboarding_done', false);
        if (!onboardingDone) return;
        const today = new Date().toDateString();
        const lastShown = await AsyncStorage.get(this.RITUAL_SHOWN_KEY);
        if (lastShown === today) return;
        // Mark immediately so a second tab opened in parallel doesn't duplicate
        await AsyncStorage.set(this.RITUAL_SHOWN_KEY, today);
        await this.showMorningRitual();
    },

    showMorningRitual: async function() {
        const els = this.elements;

        // Greeting (with user name when set)
        const userName = (window.SettingsSystem && window.SettingsSystem.getUserName) ? window.SettingsSystem.getUserName() : '';
        const namePart = userName ? `, ${userName}` : '';
        els.ritualGreeting.textContent = t('tasks.ritual_greeting', { name: namePart });

        // Yesterday's summary (sessions + completed tasks) and "Dias com Ora"
        const today0 = this.startOfDay(0);
        const yesterday0 = this.startOfDay(1);
        const yesterdayTasks = this.countCompletedBetween(yesterday0, today0);
        const yesterdayFocus = this.formatFocusTime(SessionsCore.minutesInRange(this.sessions, yesterday0, today0) * 60);
        const daysWithOra = CounterCore.daysWithOra({
            sessions: this.sessions,
            tasks: this.tasks,
            taskHistory: this.history,
            extraDays: await AsyncStorage.get(this.EXTRA_DAYS_KEY, [])
        });
        const statsParts = [];
        if (yesterdayTasks > 0 || yesterdayFocus) {
            let text = this.escapeHtml(t('tasks.ritual_yesterday', { tasks: yesterdayTasks }));
            if (yesterdayFocus) text += ' ' + this.escapeHtml(t('tasks.ritual_yesterday_focus', { focus: yesterdayFocus }));
            statsParts.push(`<span class="ritual-stat"><i class="ph ph-chart-line-up"></i> ${text}</span>`);
        }
        if (daysWithOra > 0) {
            statsParts.push(`<span class="ritual-stat"><i class="ph ph-sun-horizon"></i> ${this.escapeHtml(t('tasks.ritual_days_with_ora', { n: daysWithOra }))}</span>`);
        }
        els.ritualStats.innerHTML = statsParts.join('');
        els.ritualStats.style.display = statsParts.length ? 'flex' : 'none';

        // Weekly summary on Mondays
        if (new Date().getDay() === 1) {
            const week0 = this.startOfDay(7);
            const weekTasks = this.countCompletedBetween(week0, today0);
            const weekMinutes = SessionsCore.minutesInRange(this.sessions, week0, today0);
            if (weekTasks > 0 || weekMinutes > 0) {
                const focusStr = this.formatFocusTime(weekMinutes * 60) || '0m';
                els.ritualWeek.innerHTML = `<i class="ph ph-calendar-check"></i> ` +
                    this.escapeHtml(t('tasks.ritual_week', { tasks: weekTasks, focus: focusStr }));
                els.ritualWeek.style.display = 'flex';
            } else {
                els.ritualWeek.style.display = 'none';
            }
        } else {
            els.ritualWeek.style.display = 'none';
        }

        // Today's routine (templates due today)
        const routine = this.tasks.filter(task => TasksCore.isDueOn(task, new Date()));
        if (routine.length > 0) {
            els.ritualRoutineList.innerHTML = '';
            routine.forEach(task => {
                const row = document.createElement('div');
                row.className = 'ritual-routine-item';
                row.innerHTML = `<i class="ph ph-repeat"></i><span class="ritual-routine-name">${this.escapeHtml(task.title)}</span>`;
                els.ritualRoutineList.appendChild(row);
            });
            els.ritualRoutineSection.style.display = 'block';
        } else {
            els.ritualRoutineSection.style.display = 'none';
        }

        // Clear priority inputs
        this.elements.ritualPriorityInputs.forEach(input => { input.value = ''; });

        animateModal(els.ritualModal, true);
        setTimeout(() => {
            if (this.elements.ritualPriorityInputs[0]) this.elements.ritualPriorityInputs[0].focus();
        }, 150);
    },

    startDayFromRitual: async function() {
        const priorities = Array.from(this.elements.ritualPriorityInputs)
            .map(input => input.value.trim())
            .filter(value => value.length > 0);

        if (priorities.length > 0) {
            const now = Date.now();
            // Priorities go to the top of Hoje, in the order typed
            let tasks = this.tasks;
            const ids = [];
            for (let i = priorities.length - 1; i >= 0; i--) {
                const id = (now + i).toString();
                tasks = TasksCore.createTask(tasks, { id, title: priorities[i], list: 'hoje', atTop: true, now });
                ids.unshift(id);
            }
            this.tasks = tasks;

            if (!this.activeTaskId) {
                await this.setActiveTask(ids[0]);
            }
            await this.saveData();
            showToast(t('tasks.ritual_started', { count: priorities.length }), 'success');
        }

        animateModal(this.elements.ritualModal, false);
    },

    // --- Core Operations ---

    addTask: async function() {
        const textStr = this.elements.inputName.value.trim();
        if (!textStr) return;

        const intentionStr = this.elements.inputIntention.value.trim();
        const isRecurring = this.elements.toggleRecurring.classList.contains('active');

        if (this.visibleTasks().length >= 8) {
            showToast(t('tasks.toast_too_many'), "warning");
        }

        const id = Date.now().toString();
        const now = new Date();
        this.tasks = TasksCore.createTask(this.tasks, {
            id,
            title: textStr,
            list: 'hoje',
            intention: intentionStr,
            // A rotina repete todos os dias até a fase 2 trazer a escolha dos dias
            recurrence: isRecurring ? { days: TasksCore.DAILY } : undefined,
            now: now.getTime()
        });
        if (isRecurring) this.tasks = TasksCore.materializeRecurring(this.tasks, now);
        const visibleId = isRecurring ? `${id}@${TasksCore.isoDate(now)}` : id;

        // Auto-select if no active task
        if (!this.activeTaskId && this.taskById(visibleId)) {
            await this.setActiveTask(visibleId);
        }

        await this.saveData();

        // Reset inputs
        this.elements.inputName.value = '';
        this.elements.inputIntention.value = '';
        this.elements.toggleRecurring.classList.remove('active');
        this.elements.inputName.focus();
    },

    // Concluir/reabrir só muda a tarefa: nenhuma sessão é criada (E01)
    toggleTaskStatus: async function(id) {
        const task = this.taskById(id);
        if (!task) return;

        this.tasks = TasksCore.isDone(task)
            ? TasksCore.reopenTask(this.tasks, id)
            : TasksCore.completeTask(this.tasks, id, Date.now());

        await this.saveData();
        this.checkAllDoneAnimation();
    },

    // Excluir a tarefa de uma rotina exclui a rotina (como na interface antiga)
    deleteTask: async function(id) {
        const task = this.taskById(id);
        this.tasks = TasksCore.removeTask(this.tasks, id);
        if (task && task.fromRecurrence) {
            this.tasks = TasksCore.removeTask(this.tasks, task.fromRecurrence);
        }
        if (this.activeTaskId === id) {
            await this.setActiveTask(null);
        }
        await this.saveData();
    },

    // "Tornar tarefa única": a rotina acaba e a tarefa de hoje fica
    toggleRecurrence: async function(id) {
        const task = this.taskById(id);
        if (!task) return;
        this.tasks = TasksCore.stopRecurrence(this.tasks, id);
        await this.saveData();
    },

    // --- Reorder Tasks ---

    moveTask: async function(id, direction) {
        this.tasks = TasksCore.moveTask(this.tasks, id, direction === 'up' ? -1 : 1);
        await this.saveData();
    },

    // --- Edit Task ---

    startEditTask: function(id) {
        const task = this.taskById(id);
        if (!task) return;
        this.editingTaskId = id;
        this.render();
    },

    saveEditTask: async function(id, newText, newIntention, newCycles) {
        const task = this.taskById(id);
        if (!task) return;
        const text = newText.trim();
        if (!text) return;
        const sessions = Math.max(1, Math.min(this.PLANNED_SESSIONS_MAX, parseInt(newCycles) || this.plannedSessions(task)));
        this.tasks = TasksCore.updateTask(this.tasks, id, {
            title: text,
            intention: newIntention,
            estimateMin: sessions * this.focusMinutes()
        });
        this.editingTaskId = null;
        await this.saveData();
    },

    cancelEditTask: function() {
        this.editingTaskId = null;
        this.render();
    },

    // --- Start Pomodoro from Task ---

    startPomodoroForTask: async function(id) {
        const task = this.taskById(id);
        if (!task || TasksCore.isDone(task)) return;

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
            showToast(t('tasks.toast_focus_started', { task: task.title }));
        }
    },

    // --- Global Operations ---

    // Concluídas saem da lista e ficam no histórico (contam em "Dias com Ora")
    clearDone: async function() {
        const result = TasksCore.archiveCompleted(this.tasks, this.history, { includeRecurring: false });
        if (result.archived > 0) {
            this.history = result.history;
            await AsyncStorage.set(this.HISTORY_KEY, this.history);
            this.tasks = result.tasks;
            showToast(t('tasks.toast_cleared'));
            await this.saveData();
            if (!this.taskById(this.activeTaskId)) {
                await this.setActiveTask(null);
            }
        }
    },

    // Reabre as tarefas concluídas (as sessões já feitas continuam registradas)
    resetAllToday: async function() {
        this.visibleTasks().filter(task => TasksCore.isDone(task)).forEach(task => {
            this.tasks = TasksCore.reopenTask(this.tasks, task.id);
        });
        showToast(t('tasks.toast_reset_today'));
        await this.saveData();
    },

    resetRecurring: async function() {
        this.visibleTasks().filter(task => task.fromRecurrence && TasksCore.isDone(task)).forEach(task => {
            this.tasks = TasksCore.reopenTask(this.tasks, task.id);
        });
        showToast(t('tasks.toast_reset_recurring'));
        await this.saveData();
    },

    removeAll: async function() {
        this.tasks = [];
        await this.setActiveTask(null);
        await this.saveData();
        showToast(t('tasks.toast_removed_all'));
    },

    // --- Active Task Integration ---

    getActiveTaskId: function() {
        return this.activeTaskId;
    },

    setActiveTask: async function(id) {
        const task = this.taskById(id);
        this.activeTaskId = task && !TasksCore.isTemplate(task) ? id : null;
        await AsyncStorage.set(this.ACTIVE_TASK_KEY, this.activeTaskId);
        // A focus session already running follows the newly chosen task
        if (window.FocusSystem && window.FocusSystem.sendCommand) {
            window.FocusSystem.sendCommand('pomodoro:setSessionTask', { taskId: this.activeTaskId }).catch(() => {});
        }
        this.updateActiveTaskUI();
        this.render();
    },

    // Called by FocusSystem when a focus phase ends. The session itself is
    // recorded by the SW; the task stays open (E02).
    onFocusSessionCompleted: function() {
        const task = this.taskById(this.activeTaskId);
        if (task && !TasksCore.isDone(task)) {
            showToast(t('tasks.toast_session_done', { task: task.title }));
        }
    },

    // --- Rendering ---

    render: function() {
        const visible = this.visibleTasks();
        const pending = visible.filter(t => !TasksCore.isDone(t));
        const completed = visible.filter(t => TasksCore.isDone(t));

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
        this.elements.emptyState.style.display = (visible.length === 0) ? 'flex' : 'none';

        // Badge & Progress
        const pendingCount = pending.length;
        const totalCount = visible.length;
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

        this.renderHomeWidget();
    },

    // --- Home Tasks Widget (docked right, collapsible) ---

    applyWidgetCollapsed: function() {
        const els = this.elements;
        if (!els.homeWidget) return;
        const collapsed = this._userCollapsed || this._autoCollapsed;
        els.homeWidget.classList.toggle('collapsed', collapsed);
        if (els.homeCollapse) {
            const icon = els.homeCollapse.querySelector('i');
            if (icon) icon.className = collapsed ? 'ph ph-caret-left' : 'ph ph-caret-right';
            els.homeCollapse.title = collapsed ? t('tasks.widget_expand') : t('tasks.widget_collapse');
        }
    },

    renderHomeWidget: function() {
        const els = this.elements;
        if (!els.homeWidget) return;

        const visible = this.visibleTasks();
        const pending = visible.filter(t => !TasksCore.isDone(t));
        const total = visible.length;

        els.homeWidget.style.display = 'flex';

        // No tasks at all → just the plan CTA
        if (total === 0) {
            els.homeList.style.display = 'none';
            els.homeDoneMsg.style.display = 'none';
            els.homeViewAll.style.display = 'none';
            els.homePlanCta.style.display = 'flex';
            return;
        }

        els.homePlanCta.style.display = 'none';
        els.homeViewAll.style.display = 'inline-flex';
        els.homeViewAll.textContent = t('tasks.view_all', { count: pending.length });

        // All done → encouragement message
        if (pending.length === 0) {
            els.homeList.style.display = 'none';
            els.homeDoneMsg.style.display = 'block';
            return;
        }

        els.homeDoneMsg.style.display = 'none';
        els.homeList.style.display = 'flex';
        els.homeList.innerHTML = '';

        // Hoje na ordem escolhida: a primeira é o próximo passo (E03)
        TasksCore.listTasks(this.tasks, 'hoje').filter(t => !TasksCore.isDone(t)).slice(0, this.HOME_WIDGET_MAX).forEach(task => {
            const item = document.createElement('div');
            item.className = 'home-task-item';
            if (task.id === this.activeTaskId) item.classList.add('active-pomodoro');

            item.innerHTML = `
                <div class="task-checkbox home-task-checkbox" data-id="${task.id}"></div>
                <div class="home-task-content">
                    <span class="home-task-name">${this.escapeHtml(task.title)}</span>
                    <div class="task-cycles home-task-cycles">${this.renderSessionDots(task)}</div>
                </div>
                <button class="icon-btn-sm home-task-play" data-id="${task.id}" title="${this.escapeHtml(t('tasks.start_focus'))}"><i class="ph ph-play"></i></button>
            `;

            item.querySelector('.home-task-checkbox').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTaskStatus(task.id);
            });
            item.querySelector('.home-task-play').addEventListener('click', (e) => {
                e.stopPropagation();
                this.startPomodoroForTask(task.id);
            });

            els.homeList.appendChild(item);
        });
    },

    renderTaskItem: function(task, container) {
        const item = document.createElement('div');
        const done = TasksCore.isDone(task);
        item.className = 'task-item';
        if (done) item.classList.add('done');
        if (task.id === this.activeTaskId && !done) item.classList.add('active-pomodoro');

        // Edit mode
        if (this.editingTaskId === task.id) {
            item.classList.add('editing');
            const planned = this.plannedSessions(task);
            let cyclesOptions = '';
            for (let i = 1; i <= this.PLANNED_SESSIONS_MAX; i++) {
                cyclesOptions += `<option value="${i}" ${planned === i ? 'selected' : ''}>${i} 🍅</option>`;
            }
            item.innerHTML = `
                <div class="task-edit-form">
                    <input type="text" class="task-edit-input" value="${this.escapeHtml(task.title)}" placeholder="${this.escapeHtml(t('tasks.edit_name_placeholder'))}">
                    <input type="text" class="task-edit-intention" value="${this.escapeHtml(task.intention || '')}" placeholder="${this.escapeHtml(t('tasks.intention_placeholder'))}">
                    <div class="task-edit-actions">
                        <select class="task-edit-cycles task-cycles-select" title="${this.escapeHtml(t('tasks.cycles_title'))}">${cyclesOptions}</select>
                        <button class="task-edit-save"><i class="ph ph-check"></i> ${this.escapeHtml(t('tasks.edit_save'))}</button>
                        <button class="task-edit-cancel"><i class="ph ph-x"></i> ${this.escapeHtml(t('tasks.edit_cancel'))}</button>
                    </div>
                </div>
            `;

            // Stop all clicks inside the edit form from bubbling (prevents modal close)
            item.addEventListener('click', (e) => e.stopPropagation());

            const inputText = item.querySelector('.task-edit-input');
            const inputIntention = item.querySelector('.task-edit-intention');
            const selectCycles = item.querySelector('.task-edit-cycles');
            const btnSave = item.querySelector('.task-edit-save');
            const btnCancel = item.querySelector('.task-edit-cancel');

            const save = () => this.saveEditTask(task.id, inputText.value, inputIntention.value, selectCycles.value);

            btnSave.addEventListener('click', (e) => {
                e.stopPropagation();
                save();
            });
            btnCancel.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelEditTask();
            });
            inputText.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') save();
            });
            inputIntention.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') save();
            });

            // Auto-focus
            setTimeout(() => inputText.focus(), 50);

            container.appendChild(item);
            return;
        }

        // Normal render
        const isChecked = done ? 'checked' : '';
        const checkIcon = done ? '<i class="ph ph-check"></i>' : '';
        const recurring = !!task.fromRecurrence;
        const cyclesHtml = this.renderSessionDots(task);

        const recurringBadge = recurring
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
                    <span class="task-title">${this.escapeHtml(task.title)}</span>
                    ${task.id === this.activeTaskId && !done ? `<i class="ph ph-play-circle task-active-indicator" title="${this.escapeHtml(t('tasks.active_label'))}"></i>` : ''}
                </div>
                ${intentionChip}
                <div class="task-cycles">${cyclesHtml}</div>
            </div>
            <div class="task-actions">
                ${!done ? `<button class="icon-btn-sm btn-move-up" data-id="${task.id}" title="${this.escapeHtml(t('tasks.move_up'))}"><i class="ph ph-caret-up"></i></button>` : ''}
                ${!done ? `<button class="icon-btn-sm btn-move-down" data-id="${task.id}" title="${this.escapeHtml(t('tasks.move_down'))}"><i class="ph ph-caret-down"></i></button>` : ''}
                ${!done && task.id !== this.activeTaskId ? `<button class="icon-btn-sm btn-start-pomodoro primary-action" data-id="${task.id}" title="${this.escapeHtml(t('tasks.start_focus'))}"><i class="ph ph-play"></i></button>` : ''}
                <button class="icon-btn-sm btn-edit-task" data-id="${task.id}" title="${this.escapeHtml(t('tasks.edit_task'))}"><i class="ph ph-pencil-simple"></i></button>
                ${recurring ?
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
        const pendingTasks = this.visibleTasks().filter(task => !TasksCore.isDone(task));
        const activeTask = pendingTasks.find(task => task.id === this.activeTaskId);
        const taskName = activeTask ? activeTask.title : t('tasks.no_active_task');

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
                ${task.fromRecurrence ? '<i class="ph ph-repeat"></i>' : '<i class="ph ph-check-square"></i>'}
                <span>${this.escapeHtml(task.title)}</span>
            `;
            btn.addEventListener('click', () => {
                this.setActiveTask(task.id);
                dropdownEl.style.display = 'none';
            });
            dropdownEl.appendChild(btn);
        });
    },

    checkAllDoneAnimation: function() {
        const visible = this.visibleTasks();
        const totalCount = visible.length;
        const pendingCount = visible.filter(t => !TasksCore.isDone(t)).length;
        if (totalCount > 0 && pendingCount === 0) {
            if (window.showToast) {
                showToast(t('tasks.toast_all_done'), "success");
            }
        }
    }
};

window.TaskSystem = TaskSystem;
