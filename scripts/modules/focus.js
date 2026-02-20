const FocusSystem = {
    // Dependencies: Global (animateModal, isModalVisible)
    
    // Constants
    RING_CIRCUMFERENCE: 2 * Math.PI * 90, // ~565.48
    POMODORO_STATE_KEY: 'ora_pomodoro_state',

    elements: {
        mini: {},
        fs: {},
        settings: {},
        triggers: {}
    },

    // Local state (derived from SW state)
    isTimerRunning: false,
    phase: 'focus',
    timeRemaining: 25 * 60,
    totalDuration: 25 * 60,
    pomodoroCount: 0,
    totalFocusSeconds: 0,
    settings: { focus: 25, pause: 5, longPause: 15 },
    expectedEndTime: null,


    init: async function() {
        this.cacheDOM();
        this.bindEvents();

        // Load current state from Service Worker
        await this.syncFromSW();

        // Listen for storage changes (cross-tab sync)
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.POMODORO_STATE_KEY]) {
                const newState = changes[this.POMODORO_STATE_KEY].newValue;
                if (newState) {
                    this.applyState(newState);
                }
            }
        });

        // Listen for phase completion notifications from SW
        if (navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'pomodoro:phaseComplete') {
                    this.onPhaseComplete(event.data.phase);
                }
            });
        }

        // Initialize UI
        this.loadSettingsUI();
        this.updateDisplay();

        // AudioContext Singleton
        this.audioContext = null;

        console.log('[Ora] Focus Timer initialized');
    },

    // --- Communication with Service Worker ---

    sendCommand: function(type, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, ...data }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Focus] SW message error:', chrome.runtime.lastError.message);
                    reject(chrome.runtime.lastError);
                    return;
                }
                if (response && response.state) {
                    this.applyState(response.state);
                    resolve(response.state);
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(null);
                }
            });
        });
    },

    syncFromSW: async function() {
        try {
            await this.sendCommand('pomodoro:getState');
        } catch (e) {
            console.warn('[Focus] Could not sync from SW, using defaults:', e);
        }
    },

    applyState: function(state) {
        const wasRunning = this.isTimerRunning;

        this.isTimerRunning = state.isRunning;
        this.phase = state.phase;
        this.totalDuration = state.totalDuration;
        this.pomodoroCount = state.pomodoroCount;
        this.totalFocusSeconds = state.totalFocusSeconds;
        this.settings = state.settings;
        this.expectedEndTime = state.expectedEndTime;

        // Calculate accurate timeRemaining
        if (state.isRunning && state.expectedEndTime) {
            this.timeRemaining = Math.max(0, Math.ceil((state.expectedEndTime - Date.now()) / 1000));
        } else {
            this.timeRemaining = state.timeRemaining;
        }

        // Manage local UI tick
        if (state.isRunning && !wasRunning) {
            this.startLocalTick();
        } else if (!state.isRunning && wasRunning) {
            this.stopLocalTick();
        }

        this.loadSettingsUI();
        this.updateDisplay();
    },

    // --- Local UI Tick ---
    // A local setInterval that recalculates display time from expectedEndTime.
    // Even if throttled, it self-corrects because the math is timestamp-based.

    startLocalTick: function() {
        this.stopLocalTick();
        this._tickInterval = setInterval(() => {
            if (!this.isTimerRunning || !this.expectedEndTime) {
                this.stopLocalTick();
                return;
            }
            const remaining = Math.max(0, Math.ceil((this.expectedEndTime - Date.now()) / 1000));
            if (remaining !== this.timeRemaining) {
                this.timeRemaining = remaining;
                this.updateDisplay();
            }
        }, 1000);
    },

    stopLocalTick: function() {
        if (this._tickInterval) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
    },

    // --- Phase Completion Handler ---

    onPhaseComplete: function(completedPhase) {
        this.playTone();

        // Trigger side-effects that were previously in advancePhase
        if (completedPhase === 'focus') {
            if (window.ReminderSystem) window.ReminderSystem.showRosarySuggestion();
            // Check if it was the 4th pomodoro (now in longPause)
            if (this.phase === 'longPause') {
                setTimeout(() => {
                    if (window.ExamSystem) window.ExamSystem.showPomodoroCheckin();
                }, 500);
            }
        }
    },

    // --- DOM & Events ---

    cacheDOM: function() {
        // Mini
        this.elements.mini.container = document.getElementById('focus-mini');
        if (!this.elements.mini.container) return; // Guard if elements missing

        this.elements.mini.phase = this.elements.mini.container.querySelector('.focus-mini-phase');
        this.elements.mini.timer = this.elements.mini.container.querySelector('.focus-mini-timer');
        this.elements.mini.total = this.elements.mini.container.querySelector('.focus-mini-total');
        this.elements.mini.dots = this.elements.mini.container.querySelector('.focus-mini-dots');
        this.elements.mini.playBtn = document.getElementById('focus-mini-play');
        this.elements.mini.skipBtn = document.getElementById('focus-mini-skip');
        this.elements.mini.resetBtn = document.getElementById('focus-mini-reset');
        this.elements.mini.expandBtn = document.getElementById('focus-mini-expand');
        this.elements.mini.minimizeBtn = document.getElementById('focus-mini-minimize');
        this.elements.mini.closeBtn = document.getElementById('focus-mini-close');

        // Fullscreen
        this.elements.fs.container = document.getElementById('focus-fullscreen');
        this.elements.fs.phase = this.elements.fs.container.querySelector('.focus-fs-phase');
        this.elements.fs.timer = this.elements.fs.container.querySelector('.focus-fs-timer');
        this.elements.fs.total = this.elements.fs.container.querySelector('.focus-fs-total');
        this.elements.fs.dots = this.elements.fs.container.querySelector('.focus-fs-dots');
        this.elements.fs.ringProgress = this.elements.fs.container.querySelector('.focus-ring-progress');
        this.elements.fs.playBtn = document.getElementById('focus-fs-play');
        this.elements.fs.skipBtn = document.getElementById('focus-fs-skip');
        this.elements.fs.resetBtn = document.getElementById('focus-fs-reset');
        this.elements.fs.collapseBtn = document.getElementById('focus-fs-collapse');
        this.elements.fs.settingsBtn = document.getElementById('focus-fs-settings-btn');
        this.elements.fs.settingsPanel = document.getElementById('focus-settings');

        // Settings
        this.elements.settings.focusInput = document.getElementById('setting-focus');
        this.elements.settings.pauseInput = document.getElementById('setting-pause');
        this.elements.settings.longPauseInput = document.getElementById('setting-long-pause');

        // Triggers
        this.elements.triggers.btnFocus = document.getElementById('btn-focus');
    },

    bindEvents: function() {
        if (!this.elements.mini.container) return;

        // Open timer
        if (this.elements.triggers.btnFocus) {
            this.elements.triggers.btnFocus.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(this.elements.mini.container) && !isModalVisible(this.elements.fs.container)) {
                    this.showCompact();
                } else if (isModalVisible(this.elements.mini.container)) {
                    animateModal(this.elements.mini.container, false);
                } else {
                    animateModal(this.elements.fs.container, false);
                    this.elements.fs.settingsPanel.style.display = 'none';
                }
            });
        }

        // Compact controls
        this.elements.mini.playBtn.addEventListener('click', () => this.toggleTimer());
        this.elements.mini.skipBtn.addEventListener('click', () => this.skipPhase());
        this.elements.mini.resetBtn.addEventListener('click', () => this.resetTimer());
        this.elements.mini.expandBtn.addEventListener('click', () => this.showFullscreen());
        this.elements.mini.closeBtn.addEventListener('click', () => this.closeFocusTimer());

        this.elements.mini.minimizeBtn.addEventListener('click', () => {
            this.isMiniMinimized = !this.isMiniMinimized;
            if (this.isMiniMinimized) {
                this.elements.mini.container.classList.add('minimized');
                this.elements.mini.minimizeBtn.querySelector('i').classList.replace('ph-caret-down', 'ph-caret-up');
            } else {
                this.elements.mini.container.classList.remove('minimized');
                this.elements.mini.minimizeBtn.querySelector('i').classList.replace('ph-caret-up', 'ph-caret-down');
            }
        });

        // Fullscreen controls
        this.elements.fs.playBtn.addEventListener('click', () => this.toggleTimer());
        this.elements.fs.skipBtn.addEventListener('click', () => this.skipPhase());
        this.elements.fs.resetBtn.addEventListener('click', () => this.resetTimer());
        this.elements.fs.collapseBtn.addEventListener('click', () => this.showCompact());

        // Settings toggle
        this.elements.fs.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = this.elements.fs.settingsPanel.style.display === 'none';
            this.elements.fs.settingsPanel.style.display = isHidden ? 'flex' : 'none';
        });

        // Settings input change
        [this.elements.settings.focusInput, this.elements.settings.pauseInput, this.elements.settings.longPauseInput].forEach(input => {
            if (input) input.addEventListener('change', () => this.saveSettings());
        });

        // Close settings on click outside
        this.elements.fs.container.addEventListener('click', (e) => {
            if (this.elements.fs.settingsPanel.style.display !== 'none' &&
                !this.elements.fs.settingsPanel.contains(e.target) &&
                !this.elements.fs.settingsBtn.contains(e.target)) {
                this.elements.fs.settingsPanel.style.display = 'none';
            }
        });

        // Listen for minimize event
        window.addEventListener('ora:minimize-focus', () => {
             if (isModalVisible(this.elements.fs.container)) {
                 this.showCompact();
             }
        });
    },

    loadSettingsUI: function() {
        if (!this.elements.settings.focusInput) return;
        this.elements.settings.focusInput.value = this.settings.focus;
        this.elements.settings.pauseInput.value = this.settings.pause;
        this.elements.settings.longPauseInput.value = this.settings.longPause;
    },

    saveSettings: function() {
        const f = parseInt(this.elements.settings.focusInput.value) || 25;
        const p = parseInt(this.elements.settings.pauseInput.value) || 5;
        const lp = parseInt(this.elements.settings.longPauseInput.value) || 15;

        const settings = {
            focus: Math.max(1, Math.min(120, f)),
            pause: Math.max(1, Math.min(30, p)),
            longPause: Math.max(1, Math.min(60, lp))
        };

        this.sendCommand('pomodoro:updateSettings', { settings });
    },

    // --- Display ---

    formatTime: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    formatTotalFocus: function(seconds) {
        if (seconds < 60) return `${seconds}s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    },

    getPhaseLabel: function(phase) {
        if (phase === 'focus') return 'Foco';
        if (phase === 'pause') return 'Pausa';
        if (phase === 'longPause') return 'Pausa Longa';
        return 'Foco';
    },

    updateDisplay: function() {
        if (!this.elements.mini.container) return;

        const timeStr = this.formatTime(this.timeRemaining);
        const label = this.getPhaseLabel(this.phase);
        const totalStr = this.formatTotalFocus(this.totalFocusSeconds);
        const playIcon = this.isTimerRunning ? 'ph-pause' : 'ph-play';

        // Mini
        this.elements.mini.timer.textContent = timeStr;
        this.elements.mini.phase.textContent = label;
        this.elements.mini.total.innerHTML = `<i class="ph ph-fire"></i> Total: ${totalStr}`;
        this.elements.mini.playBtn.innerHTML = `<i class="ph ${playIcon}"></i>`;

        // Fullscreen
        this.elements.fs.timer.textContent = timeStr;
        this.elements.fs.phase.textContent = label;
        this.elements.fs.total.innerHTML = `<i class="ph ph-fire"></i> Total hoje: ${totalStr}`;
        this.elements.fs.playBtn.innerHTML = `<i class="ph ${playIcon}"></i>`;

        // Ring
        const progress = this.totalDuration > 0 ? this.timeRemaining / this.totalDuration : 1;
        const offset = this.RING_CIRCUMFERENCE * (1 - progress);
        this.elements.fs.ringProgress.style.strokeDashoffset = offset;

        // Colors
        this.elements.mini.container.classList.remove('focus-phase-pause', 'focus-phase-longPause');
        this.elements.fs.container.classList.remove('focus-phase-pause', 'focus-phase-longPause');
        if (this.phase === 'pause') {
            this.elements.mini.container.classList.add('focus-phase-pause');
            this.elements.fs.container.classList.add('focus-phase-pause');
        } else if (this.phase === 'longPause') {
            this.elements.mini.container.classList.add('focus-phase-longPause');
            this.elements.fs.container.classList.add('focus-phase-longPause');
        }

        // Dots
        this.renderDots(this.elements.mini.dots);
        this.renderDots(this.elements.fs.dots);
    },

    renderDots: function(container) {
        container.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('div');
            dot.className = 'focus-dot';
            if (i < this.pomodoroCount % 4) {
                dot.classList.add('completed');
            } else if (i === this.pomodoroCount % 4 && this.phase === 'focus') {
                dot.classList.add('active');
            }
            container.appendChild(dot);
        }
    },

    // --- Timer Actions (delegate to SW) ---

    toggleTimer: function() {
        if (this.isTimerRunning) {
            this.sendCommand('pomodoro:pause');
        } else {
            this.sendCommand('pomodoro:start');
        }
    },

    resetTimer: function() {
        this.sendCommand('pomodoro:reset');
    },

    skipPhase: function() {
        this.sendCommand('pomodoro:skip');
    },

    // --- Audio ---

    playTone: function() {
        try {
            // Reusing context helps performance
            if (!this.audioContext) {
                 this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 528;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.5);
        } catch (e) { /* audio not available */ }
    },

    // --- Modes ---

    showCompact: function() {
        this.mode = 'compact';
        animateModal(this.elements.mini.container, true);
        animateModal(this.elements.fs.container, false);
        this.elements.fs.settingsPanel.style.display = 'none';
        this.updateDisplay();
    },

    showFullscreen: function() {
        this.mode = 'fullscreen';
        animateModal(this.elements.mini.container, false);
        animateModal(this.elements.fs.container, true);
        this.updateDisplay();
    },

    closeFocusTimer: function() {
        this.sendCommand('pomodoro:close');
        this.stopLocalTick();
        animateModal(this.elements.mini.container, false);
        animateModal(this.elements.fs.container, false);
        this.elements.fs.settingsPanel.style.display = 'none';
        this.isMiniMinimized = false;
        this.elements.mini.container.classList.remove('minimized');
    }
};

window.FocusSystem = FocusSystem;
