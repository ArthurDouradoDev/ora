const FocusSystem = {
    // Dependencies: Global (SafeStorage, animateModal, isModalVisible)
    
    // Constants
    RING_CIRCUMFERENCE: 2 * Math.PI * 90, // ~565.48

    elements: {
        mini: {},
        fs: {},
        settings: {},
        triggers: {}
    },


    init: function() {
        this.todayKey = 'ora_focus_total_' + new Date().toDateString();
        this.totalFocusSeconds = parseInt(SafeStorage.getItem(this.todayKey)) || 0;
        
        // Initialize state
        this.pomodoroCount = 0;
        this.phase = 'focus';
        this.settings = { focus: 25, pause: 5, longPause: 15 };

        this.loadSettings();
        this.cacheDOM();
        this.bindEvents();
        
        // Initialize UI
        this.loadSettingsUI();
        this.updateDisplay();

        console.log('[Ora] Focus Timer initialized');
    },

    cacheDOM: function() {
        // Mini
        this.elements.mini.container = document.getElementById('focus-mini');
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
            input.addEventListener('change', () => this.saveSettings());
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

    loadSettings: function() {
        try {
            const savedSettings = SafeStorage.getItem('ora_focus_settings');
            if (savedSettings) this.settings = JSON.parse(savedSettings);
        } catch (e) { /* use defaults */ }
        
        // Initial time update
        this.timeRemaining = this.getPhaseDuration(this.phase);
        this.totalDuration = this.timeRemaining;
    },

    loadSettingsUI: function() {
        this.elements.settings.focusInput.value = this.settings.focus;
        this.elements.settings.pauseInput.value = this.settings.pause;
        this.elements.settings.longPauseInput.value = this.settings.longPause;
    },

    saveSettings: function() {
        const f = parseInt(this.elements.settings.focusInput.value) || 25;
        const p = parseInt(this.elements.settings.pauseInput.value) || 5;
        const lp = parseInt(this.elements.settings.longPauseInput.value) || 15;

        this.settings = {
            focus: Math.max(1, Math.min(120, f)),
            pause: Math.max(1, Math.min(30, p)),
            longPause: Math.max(1, Math.min(60, lp))
        };

        SafeStorage.setItem('ora_focus_settings', JSON.stringify(this.settings));

        // If timer is not running, update the current phase duration
        if (!this.isTimerRunning) {
            this.timeRemaining = this.getPhaseDuration(this.phase);
            this.totalDuration = this.timeRemaining;
            this.updateDisplay();
        }
    },

    // Logic
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

    getPhaseDuration: function(phase) {
        if (phase === 'focus') return this.settings.focus * 60;
        if (phase === 'pause') return this.settings.pause * 60;
        if (phase === 'longPause') return this.settings.longPause * 60;
        return this.settings.focus * 60;
    },

    updateDisplay: function() {
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

    startTimer: function() {
        if (this.timerInterval) return;
        this.isTimerRunning = true;
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;

            if (this.phase === 'focus') {
                this.totalFocusSeconds++;
                SafeStorage.setItem(this.todayKey, this.totalFocusSeconds.toString());
            }

            this.updateDisplay();

            if (this.timeRemaining <= 0) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
                this.isTimerRunning = false;
                this.playTone();
                this.advancePhase();
            }
        }, 1000);
        this.updateDisplay();
    },

    pauseTimer: function() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isTimerRunning = false;
        this.updateDisplay();
    },

    toggleTimer: function() {
        if (this.isTimerRunning) this.pauseTimer();
        else this.startTimer();
    },

    resetTimer: function() {
        this.pauseTimer();
        this.timeRemaining = this.getPhaseDuration(this.phase);
        this.totalDuration = this.timeRemaining;
        this.updateDisplay();
    },

    advancePhase: function() {
        if (this.phase === 'focus') {
            this.pomodoroCount++;
            if (this.pomodoroCount % 4 === 0) {
                this.phase = 'longPause';
                if (window.ReminderSystem) window.ReminderSystem.showRosarySuggestion();
                setTimeout(() => {
                    if (window.ExamSystem) window.ExamSystem.showPomodoroCheckin();
                }, 500);
            } else {
                this.phase = 'pause';
                if (window.ReminderSystem) window.ReminderSystem.showRosarySuggestion();
            }
        } else {
            this.phase = 'focus';
        }

        this.timeRemaining = this.getPhaseDuration(this.phase);
        this.totalDuration = this.timeRemaining;
        this.updateDisplay();
        this.startTimer();
    },

    skipPhase: function() {
        this.pauseTimer();
        if (this.phase === 'focus') {
            this.pomodoroCount++;
            if (this.pomodoroCount % 4 === 0) {
                this.phase = 'longPause';
            } else {
                this.phase = 'pause';
            }
        } else {
            this.phase = 'focus';
        }
        this.timeRemaining = this.getPhaseDuration(this.phase);
        this.totalDuration = this.timeRemaining;
        this.updateDisplay();
    },

    playTone: function() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

    // Modes
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
        this.pauseTimer();
        animateModal(this.elements.mini.container, false);
        animateModal(this.elements.fs.container, false);
        this.elements.fs.settingsPanel.style.display = 'none';
        this.isMiniMinimized = false;
        this.elements.mini.container.classList.remove('minimized');
    }
};

window.FocusSystem = FocusSystem;
