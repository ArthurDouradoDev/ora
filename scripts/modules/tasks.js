const TaskSystem = {
    // Dependencies: AsyncStorage, i18n (t), animateModal, isModalVisible, showToast

    STORAGE_KEY: 'ora_tasks_daily',
    ACTIVE_TASK_KEY: 'ora_active_task_id',
    DAILY_STATS_KEY: 'ora_daily_stats',
    RITUAL_SHOWN_KEY: 'ora_ritual_last_shown',
    WIDGET_COLLAPSED_KEY: 'ora_home_widget_collapsed',
    HOME_WIDGET_MAX: 3,

    tasks: [],
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
        await this.checkDailyReset();
        this.render();
        this.updateActiveTaskUI();
        await this.maybeShowMorningRitual();

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

    isoDate: function(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    isoDaysAgo: function(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return this.isoDate(d);
    },

    formatFocusTime: function(seconds) {
        if (!seconds || seconds < 60) return null;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },

    // --- Streaks (recurring tasks) ---
    // streak counts consecutive days a task was completed. prevStreak /
    // prevStreakDate allow undoing a completion made earlier the same day.

    applyCompletionStreak: function(task) {
        const today = this.isoDate();
        if (task.lastStreakDate === today) return;
        task.prevStreak = task.streak || 0;
        task.prevStreakDate = task.lastStreakDate || null;
        task.streak = (task.lastStreakDate === this.isoDaysAgo(1)) ? (task.streak || 0) + 1 : 1;
        task.lastStreakDate = today;
    },

    revertCompletionStreak: function(task) {
        if (task.lastStreakDate !== this.isoDate()) return;
        task.streak = task.prevStreak || 0;
        task.lastStreakDate = task.prevStreakDate || null;
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

    // Returns true when a new day started (first open of the day).
    checkDailyReset: async function() {
        const today = new Date().toDateString();
        const lastResetDate = await AsyncStorage.get('ora_tasks_last_reset');
        if (lastResetDate === today) return false;

        // Record the previous day's task stats before clearing them
        if (lastResetDate) {
            await this.recordDailyStats(lastResetDate);
        }

        let changed = false;
        const remainingTasks = [];
        const yesterdayIso = this.isoDaysAgo(1);

        for (const task of this.tasks) {
            if (task.recurring) {
                task.done = false;
                task.completedCycles = 0;
                task.completedAt = null;
                // Chain broken: last completion was before yesterday
                if (task.streak && (!task.lastStreakDate || task.lastStreakDate < yesterdayIso)) {
                    task.streak = 0;
                }
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
        return true;
    },

    // --- Daily Stats (shared key with sw.js, which records focusSeconds) ---

    recordDailyStats: async function(lastResetDateString) {
        try {
            const d = new Date(lastResetDateString);
            if (isNaN(d.getTime())) return;
            const iso = this.isoDate(d);

            const tasksDone = this.tasks.filter(t => t.done).length;
            const cyclesDone = this.tasks.reduce((sum, t) => sum + (t.completedCycles || 0), 0);
            if (tasksDone === 0 && cyclesDone === 0) return;

            const stats = (await AsyncStorage.get(this.DAILY_STATS_KEY)) || {};
            stats[iso] = Object.assign({}, stats[iso], { tasksDone, cyclesDone });
            await AsyncStorage.set(this.DAILY_STATS_KEY, stats);
        } catch (e) {
            console.error('[Tasks] Failed to record daily stats:', e);
        }
    },

    // --- Morning Ritual (first tab of the day) ---

    maybeShowMorningRitual: async function() {
        if (!this.elements.ritualModal) return;
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

        // Yesterday's summary
        const stats = (await AsyncStorage.get(this.DAILY_STATS_KEY)) || {};
        const yesterday = stats[this.isoDaysAgo(1)];
        if (yesterday && ((yesterday.tasksDone || 0) > 0 || (yesterday.focusSeconds || 0) > 0)) {
            const focusStr = this.formatFocusTime(yesterday.focusSeconds);
            let text = `<i class="ph ph-chart-line-up"></i> ` + this.escapeHtml(t('tasks.ritual_yesterday', { tasks: yesterday.tasksDone || 0 }));
            if (focusStr) text += ' ' + this.escapeHtml(t('tasks.ritual_yesterday_focus', { focus: focusStr }));
            els.ritualStats.innerHTML = text;
            els.ritualStats.style.display = 'flex';
        } else {
            els.ritualStats.style.display = 'none';
        }

        // Weekly summary on Mondays
        if (new Date().getDay() === 1) {
            let weekTasks = 0, weekFocus = 0;
            for (let i = 1; i <= 7; i++) {
                const entry = stats[this.isoDaysAgo(i)];
                if (entry) {
                    weekTasks += entry.tasksDone || 0;
                    weekFocus += entry.focusSeconds || 0;
                }
            }
            if (weekTasks > 0 || weekFocus > 0) {
                const focusStr = this.formatFocusTime(weekFocus) || '0m';
                els.ritualWeek.innerHTML = `<i class="ph ph-calendar-check"></i> ` +
                    this.escapeHtml(t('tasks.ritual_week', { tasks: weekTasks, focus: focusStr }));
                els.ritualWeek.style.display = 'flex';
            } else {
                els.ritualWeek.style.display = 'none';
            }
        } else {
            els.ritualWeek.style.display = 'none';
        }

        // Today's routine (recurring tasks with streaks)
        const recurring = this.tasks.filter(task => task.recurring);
        if (recurring.length > 0) {
            els.ritualRoutineList.innerHTML = '';
            recurring.forEach(task => {
                const row = document.createElement('div');
                row.className = 'ritual-routine-item';
                const streakBadge = (task.streak || 0) >= 2
                    ? `<span class="ritual-streak" title="${this.escapeHtml(t('tasks.streak_title', { n: task.streak }))}">🔥 ${task.streak}</span>`
                    : '';
                row.innerHTML = `<i class="ph ph-repeat"></i><span class="ritual-routine-name">${this.escapeHtml(task.text)}</span>${streakBadge}`;
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
            const newTasks = priorities.map((text, idx) => ({
                id: (now + idx).toString(),
                text,
                intention: '',
                totalCycles: 1,
                completedCycles: 0,
                done: false,
                recurring: false,
                createdAt: new Date().toISOString(),
                completedAt: null
            }));

            // Priorities go to the top of the list, in the order typed
            this.tasks = [...newTasks, ...this.tasks];

            if (!this.activeTaskId) {
                await this.setActiveTask(newTasks[0].id);
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

        if (this.tasks.length >= 8) {
            showToast(t('tasks.toast_too_many'), "warning");
        }

        const newTask = {
            id: Date.now().toString(),
            text: textStr,
            intention: intentionStr,
            totalCycles: 1, // default — editable later via the edit form
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
            this.applyCompletionStreak(task);
        } else {
            task.completedAt = null;
            this.revertCompletionStreak(task);
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

    saveEditTask: async function(id, newText, newIntention, newCycles) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        const text = newText.trim();
        if (!text) return;
        task.text = text;
        task.intention = newIntention.trim();
        const cycles = Math.max(1, Math.min(4, parseInt(newCycles) || task.totalCycles || 1));
        task.totalCycles = cycles;
        task.completedCycles = Math.min(task.completedCycles || 0, cycles);
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
            showToast(t('tasks.toast_focus_started', { task: task.text }));
        }
    },

    // --- Global Operations ---

    clearDone: async function() {
        const initialLen = this.tasks.length;
        this.tasks = this.tasks.filter(t => !(t.done && !t.recurring));
        if (this.tasks.length < initialLen) {
            showToast(t('tasks.toast_cleared'));
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
            this.revertCompletionStreak(t);
        });
        showToast(t('tasks.toast_reset_today'));
        await this.saveData();
    },

    resetRecurring: async function() {
        this.tasks.forEach(t => {
            if (t.recurring) {
                t.done = false;
                t.completedCycles = 0;
                t.completedAt = null;
                this.revertCompletionStreak(t);
            }
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
            this.applyCompletionStreak(task);
            showToast(t('tasks.toast_task_complete', { task: task.text }), "success");
            this.checkAllDoneAnimation();
            await this.setActiveTask(null);
        } else {
            showToast(t('tasks.toast_cycle_complete', { task: task.text }));
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

        const pending = this.tasks.filter(t => !t.done);
        const total = this.tasks.length;

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

        pending.slice(0, this.HOME_WIDGET_MAX).forEach(task => {
            const item = document.createElement('div');
            item.className = 'home-task-item';
            if (task.id === this.activeTaskId) item.classList.add('active-pomodoro');

            let cyclesHtml = '';
            for (let i = 0; i < task.totalCycles; i++) {
                cyclesHtml += `<div class="focus-dot ${i < task.completedCycles ? 'completed' : ''}"></div>`;
            }

            const streakBadge = (task.recurring && (task.streak || 0) >= 2)
                ? `<span class="home-task-streak" title="${this.escapeHtml(t('tasks.streak_title', { n: task.streak }))}">🔥${task.streak}</span>`
                : '';

            item.innerHTML = `
                <div class="task-checkbox home-task-checkbox" data-id="${task.id}"></div>
                <div class="home-task-content">
                    <span class="home-task-name">${this.escapeHtml(task.text)}</span>
                    ${streakBadge}
                    <div class="task-cycles home-task-cycles">${cyclesHtml}</div>
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
        item.className = 'task-item';
        if (task.done) item.classList.add('done');
        if (task.id === this.activeTaskId && !task.done) item.classList.add('active-pomodoro');

        // Edit mode
        if (this.editingTaskId === task.id) {
            item.classList.add('editing');
            let cyclesOptions = '';
            for (let i = 1; i <= 4; i++) {
                cyclesOptions += `<option value="${i}" ${task.totalCycles === i ? 'selected' : ''}>${i} 🍅</option>`;
            }
            item.innerHTML = `
                <div class="task-edit-form">
                    <input type="text" class="task-edit-input" value="${this.escapeHtml(task.text)}" placeholder="${this.escapeHtml(t('tasks.edit_name_placeholder'))}">
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

        const streakBadge = (task.recurring && (task.streak || 0) >= 2)
            ? `<span class="task-streak-badge" title="${this.escapeHtml(t('tasks.streak_title', { n: task.streak }))}">🔥 ${task.streak}</span>`
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
                    ${streakBadge}
                    ${task.id === this.activeTaskId && !task.done ? `<i class="ph ph-play-circle task-active-indicator" title="${this.escapeHtml(t('tasks.active_label'))}"></i>` : ''}
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
                showToast(t('tasks.toast_all_done'), "success");
            }
        }
    }
};

window.TaskSystem = TaskSystem;
