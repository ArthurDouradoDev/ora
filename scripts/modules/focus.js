const FocusSystem = {
    // Motor do foco na página: espelha o estado do pomodoro gravado pelo SW
    // (ora_pomodoro_state), envia comandos, toca o aviso de fim de fase e
    // mantém a tela acesa. A interface do foco é a tela Hoje (today.js), que
    // escuta o evento 'ora:pomodoro'.
    POMODORO_STATE_KEY: 'ora_pomodoro_state',
    // Duração de teste de 1 min: só em extensão sem pacote e com esta chave ligada
    DEBUG_SHORT_KEY: 'ora_debug_short_focus',
    DURATIONS: [15, 25, 50, 90],

    state: null,          // último estado vindo do SW
    settings: PomodoroCore.getDefaultSettings(),
    isTimerRunning: false,
    phase: 'focus',
    debugShort: false,
    wakeLock: null,
    continuousAlarmInterval: null,
    audioContext: null,

    elements: { settings: {} },

    init: async function() {
        this.cacheDOM();
        this.bindEvents();

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isTimerRunning && this.settings.wakeLock) {
                this.manageWakeLock(true);
            }
        });

        this.debugShort = this.isDevBuild() && (await AsyncStorage.get(this.DEBUG_SHORT_KEY, false)) === true;

        await this.syncFromSW();

        // Outras abas e o próprio SW
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.POMODORO_STATE_KEY]) {
                const newState = changes[this.POMODORO_STATE_KEY].newValue;
                if (newState) this.applyState(newState);
            }
        });

        if (navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'pomodoro:phaseComplete') {
                    this.onPhaseComplete(event.data.phase);
                }
            });
        }

        console.log('[Ora] Focus engine initialized');
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
            // Sem o SW, Hoje ainda mostra o último estado gravado
            console.warn('[Focus] Could not sync from SW, reading storage:', e);
            const stored = await AsyncStorage.get(this.POMODORO_STATE_KEY, null);
            if (stored) this.applyState(stored);
        }
    },

    applyState: function(state) {
        const wasRunning = this.isTimerRunning;
        this.state = state;
        this.isTimerRunning = !!state.isRunning;
        this.phase = state.phase;
        this.settings = PomodoroCore.sanitizeSettings(state.settings);

        if (this.isTimerRunning !== wasRunning || this.isTimerRunning) {
            this.manageWakeLock(this.isTimerRunning);
        }
        this.loadSettingsUI();
        window.dispatchEvent(new CustomEvent('ora:pomodoro', { detail: state }));
    },

    // Durações oferecidas na preparação (a padrão entra se não estiver na lista)
    durations: function() {
        const list = this.DURATIONS.slice();
        if (!list.includes(this.settings.focus)) list.push(this.settings.focus);
        list.sort((a, b) => a - b);
        return this.debugShort ? [1].concat(list) : list;
    },

    isDevBuild: function() {
        try {
            return !chrome.runtime.getManifest().update_url;
        } catch (e) {
            return false;
        }
    },

    // --- Commands used by Hoje ---

    startFocus: function({ minutes, taskId, title, intention, protect }) {
        return this.sendCommand('pomodoro:startFocus', { minutes, taskId, title, intention, protect });
    },
    pause: function() { return this.sendCommand('pomodoro:pause'); },
    resume: function() { return this.sendCommand('pomodoro:start'); },
    interrupt: function() { return this.sendCommand('pomodoro:interrupt'); },
    startBreak: function(minutes) { return this.sendCommand('pomodoro:startBreak', { minutes }); },
    goHome: function() { return this.sendCommand('pomodoro:home'); },

    // --- Phase completion ---

    onPhaseComplete: function(completedPhase) {
        if (this.settings.sound !== false) {
            this.playTone();
            if (this.settings.continuousAlarm) this.startContinuousAlarm();
        }
        window.dispatchEvent(new CustomEvent('ora:phase-complete', { detail: { phase: completedPhase } }));
    },

    // --- Settings (in the settings modal until phase 7) ---

    cacheDOM: function() {
        this.elements.settings = {
            focusInput: document.getElementById('setting-focus'),
            pauseInput: document.getElementById('setting-pause'),
            longPauseInput: document.getElementById('setting-long-pause'),
            soundInput: document.getElementById('setting-sound'),
            autoNextInput: document.getElementById('setting-auto-next'),
            continuousAlarmInput: document.getElementById('setting-continuous-alarm'),
            wakeLockInput: document.getElementById('setting-wake-lock')
        };
    },

    bindEvents: function() {
        Object.values(this.elements.settings).forEach(input => {
            if (input) input.addEventListener('change', () => this.saveSettings());
        });
        // Qualquer clique silencia o alarme contínuo
        document.body.addEventListener('click', () => this.stopContinuousAlarm());
    },

    loadSettingsUI: function() {
        const el = this.elements.settings;
        if (!el.focusInput) return;
        el.focusInput.value = this.settings.focus;
        el.pauseInput.value = this.settings.pause;
        el.longPauseInput.value = this.settings.longPause;
        el.soundInput.checked = this.settings.sound !== false;
        el.autoNextInput.checked = this.settings.autoNext === true;
        el.continuousAlarmInput.checked = this.settings.continuousAlarm === true;
        el.wakeLockInput.checked = this.settings.wakeLock === true;
    },

    saveSettings: function() {
        const el = this.elements.settings;
        // Limits and defaults (long pause: 15 min) live in PomodoroCore
        const settings = PomodoroCore.sanitizeSettings({
            focus: el.focusInput.value,
            pause: el.pauseInput.value,
            longPause: el.longPauseInput.value,
            sound: el.soundInput.checked,
            autoNext: el.autoNextInput.checked,
            continuousAlarm: el.continuousAlarmInput.checked,
            wakeLock: el.wakeLockInput.checked
        });
        this.sendCommand('pomodoro:updateSettings', { settings }).catch(() => {
            showToast(t('today.save_failed_settings'), 'error');
            this.loadSettingsUI();
        });
    },

    // --- Audio & Wake Lock ---

    manageWakeLock: async function(active) {
        if (!('wakeLock' in navigator)) return;
        const wanted = active && this.settings.wakeLock === true;
        try {
            if (wanted && !this.wakeLock) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
            } else if (!wanted && this.wakeLock) {
                await this.wakeLock.release();
                this.wakeLock = null;
            }
        } catch (err) {
            console.warn('[Focus] Wake Lock error:', err);
        }
    },

    startContinuousAlarm: function() {
        this.stopContinuousAlarm();
        this.continuousAlarmInterval = setInterval(() => this.playTone(), 3000);
    },

    stopContinuousAlarm: function() {
        if (this.continuousAlarmInterval) {
            clearInterval(this.continuousAlarmInterval);
            this.continuousAlarmInterval = null;
        }
    },

    playTone: function() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') this.audioContext.resume();

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
    }
};

window.FocusSystem = FocusSystem;
