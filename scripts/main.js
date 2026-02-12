// 1. Relógio
function updateClock() {
    try {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const clock = document.getElementById('clock');
        if (clock) clock.textContent = `${hours}:${minutes}`;
    } catch (e) { console.error(e); }
}
setInterval(updateClock, 1000);
updateClock();

// Helper for safe storage access (works on file:// where localStorage might be blocked)
const SafeStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { return null; }
    },
    setItem: (key, value) => {
        try { localStorage.setItem(key, value); }
        catch (e) { /* silently fail */ }
    }
};

// ============================================================
// LOAD DATA FROM JSON & INITIALIZE
// ============================================================

// --- TOAST SYSTEM ---
const toastContainer = document.getElementById('toast-container');

// --- Modal Animation Helper ---
function animateModal(el, show) {
    if (!el) return;
    if (show) {
        el.classList.remove('modal-closing');
        el.style.display = 'flex';
        // Force reflow so the browser picks up the new animation
        void el.offsetWidth;
        el.classList.add('modal-opening');
    } else {
        if (el.style.display === 'none' || el.style.display === '') return;
        el.classList.remove('modal-opening');
        el.classList.add('modal-closing');
        const handler = (e) => {
            if (e.target !== el) return;
            if (!el.classList.contains('modal-closing')) return;
            el.style.display = 'none';
            el.classList.remove('modal-closing');
        };
        el.addEventListener('animationend', handler, { once: true });
        // Fallback in case animationend doesn't fire
        setTimeout(() => {
            if (el.classList.contains('modal-closing')) {
                el.style.display = 'none';
                el.classList.remove('modal-closing');
            }
        }, 500);
    }
}

function isModalVisible(el) {
    return el && el.style.display !== 'none' && el.style.display !== '' && !el.classList.contains('modal-closing');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon;
    if (type === 'success') icon = 'ph-check-circle';
    else if (type === 'error') icon = 'ph-warning-circle';
    else icon = 'ph-info';

    toast.innerHTML = `<i class="ph ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

async function loadAppData() {
    try {
        const [backgrounds, playlists, prayers, quotes, greetings, rosary, exam] = await Promise.all([
            fetch('data/backgrounds.json').then(r => r.json()),
            fetch('data/playlists.json').then(r => r.json()),
            fetch('data/prayers.json').then(r => r.json()),
            fetch('data/quotes.json').then(r => r.json()),
            fetch('data/greetings.json').then(r => r.json()),
            fetch('data/rosary.json').then(r => r.json()),
            fetch('data/exam.json').then(r => r.json())
        ]);

        return {
            backgroundImages: backgrounds,
            defaultPlaylists: playlists,
            prayers: prayers,
            quotes: quotes,
            greetings: greetings,
            rosary: rosary,
            exam: exam
        };
    } catch (e) {
        console.error('Failed to load data modules:', e);
        // Return minimal fallback so the app doesn't crash
        return {
            backgroundImages: [],
            defaultPlaylists: [],
            prayers: [],
            quotes: [{ text: "Fiat Voluntas Tua", author: "" }],
            greetings: ["Fiat Voluntas Tua"],
            rosary: { structure: [], mysteries: {}, extraPrayers: {} },
            exam: { types: {}, defaultVirtues: [], pomodoroCheckin: {} }
        };
    }
}

async function initApp() {
    const data = await loadAppData();
    console.log('[Ora] Data loaded:', Object.keys(data));

    // ============================================================
    // 2. Imagem de Fundo Dinâmica
    // ============================================================

    // Initialize Background System (now handled in background.js)
    if (typeof BackgroundSystem !== 'undefined') {
        BackgroundSystem.init(data.backgroundImages);
    } else {
        console.error('BackgroundSystem not found!');
    }

    // ============================================================
    // 2b. Frase e Saudação Dinâmicas
    // ============================================================

    function setQuote() {
        try {
            if (!data.quotes || data.quotes.length === 0) return;
            const quoteText = document.querySelector('.quote-text');
            const quoteAuthor = document.querySelector('.quote-author');
            if (!quoteText || !quoteAuthor) return;

            const today = new Date().toDateString();
            const savedQuoteDate = SafeStorage.getItem('ora_quote_date');
            let quoteIndex;

            if (savedQuoteDate === today && SafeStorage.getItem('ora_quote_index') !== null) {
                quoteIndex = parseInt(SafeStorage.getItem('ora_quote_index'));
            } else {
                quoteIndex = Math.floor(Math.random() * data.quotes.length);
                SafeStorage.setItem('ora_quote_date', today);
                SafeStorage.setItem('ora_quote_index', quoteIndex.toString());
            }

            const quote = data.quotes[quoteIndex] || data.quotes[0];
            quoteText.textContent = `"${quote.text}"`;
            quoteAuthor.textContent = quote.author;
        } catch (e) {
            console.error('[Ora] Error in setQuote:', e);
        }
    }
    setQuote();

    function setGreeting() {
        try {
            if (!data.greetings || data.greetings.length === 0) return;
            const greetingEl = document.querySelector('.greeting');
            if (!greetingEl) return;

            const today = new Date().toDateString();
            const savedGreetingDate = SafeStorage.getItem('ora_greeting_date');
            let greetingIndex;

            if (savedGreetingDate === today && SafeStorage.getItem('ora_greeting_index') !== null) {
                greetingIndex = parseInt(SafeStorage.getItem('ora_greeting_index'));
            } else {
                greetingIndex = Math.floor(Math.random() * data.greetings.length);
                SafeStorage.setItem('ora_greeting_date', today);
                SafeStorage.setItem('ora_greeting_index', greetingIndex.toString());
            }

            greetingEl.textContent = data.greetings[greetingIndex] || data.greetings[0];
        } catch (e) {
            console.error('[Ora] Error in setGreeting:', e);
        }
    }
    setGreeting();

    // ============================================================
    // 3. Music Library & Player Logic
    // ============================================================

    // Initialize Music System
    if (window.MusicSystem) {
        window.MusicSystem.init(data.defaultPlaylists, {
            storage: SafeStorage,
            animateModal: animateModal,
            isModalVisible: isModalVisible,
            showToast: showToast
        });
    } else {
        console.error('MusicSystem not found!');
    }

    // ============================================================
    // ============================================================
    // 4. PRAYER SYSTEM
    // ============================================================

    // Initialize Prayer System
    if (window.PrayerSystem) {
        window.PrayerSystem.init(data.prayers, { animateModal, isModalVisible });
        console.log('[Ora] Prayer System initialized');
    }

    // ============================================================
    // 5. REMINDERS (Angelus, Exam, Rosary)
    // ============================================================

    if (window.ReminderSystem) {
        window.ReminderSystem.init({
            prayers: data.prayers,
            exam: data.exam
        }, {
            storage: SafeStorage,
            animateModal: animateModal,
            isModalVisible: isModalVisible,
            prayerSystem: window.PrayerSystem
        });
    }

    // Listen for events from ReminderSystem
    window.addEventListener('ora:start-exam', (e) => {
        if (typeof startExam === 'function') {
            startExam(e.detail.type);
        }
    });

    window.addEventListener('ora:minimize-focus', () => {
        if (typeof showCompact === 'function' && typeof isModalVisible === 'function') {
             if (isModalVisible(document.getElementById('focus-fullscreen'))) {
                 showCompact();
             }
        }
    });


    // ============================================================
    // 6. INTENTION INPUT PERSISTENCE
    // ============================================================

    const intentionInput = document.getElementById('intention-input');

    if (intentionInput) {
        const savedIntention = SafeStorage.getItem('ora_intention');
        if (savedIntention) {
            intentionInput.value = savedIntention;
        }

        intentionInput.addEventListener('input', (e) => {
            const value = e.target.value;
            SafeStorage.setItem('ora_intention', value);
        });

        window.addEventListener('storage', (e) => {
            if (e.key === 'ora_intention') {
                intentionInput.value = e.newValue || '';
            }
        });
    }

    // ============================================================
    // 7. FOCUS TIMER (POMODORO)
    // ============================================================

    // --- Settings ---
    let focusSettings = { focus: 25, pause: 5, longPause: 15 };
    try {
        const savedSettings = SafeStorage.getItem('ora_focus_settings');
        if (savedSettings) focusSettings = JSON.parse(savedSettings);
    } catch (e) { /* use defaults */ }

    // --- State ---
    let focusPhase = 'focus'; // 'focus', 'pause', 'longPause'
    let pomodoroCount = 0;
    let timeRemaining = focusSettings.focus * 60;
    let totalDuration = focusSettings.focus * 60;
    let timerInterval = null;
    let isTimerRunning = false;
    let isFocusMiniMinimized = false;
    let focusMode = 'compact'; // 'compact' or 'fullscreen'

    // Total focus today
    const todayKey = 'ora_focus_total_' + new Date().toDateString();
    let totalFocusSeconds = parseInt(SafeStorage.getItem(todayKey)) || 0;

    // --- DOM Elements ---
    const btnFocus = document.getElementById('btn-focus');
    const focusMini = document.getElementById('focus-mini');
    const focusMiniPhase = focusMini.querySelector('.focus-mini-phase');
    const focusMiniTimer = focusMini.querySelector('.focus-mini-timer');
    const focusMiniTotal = focusMini.querySelector('.focus-mini-total');
    const focusMiniDots = focusMini.querySelector('.focus-mini-dots');
    const focusMiniPlayBtn = document.getElementById('focus-mini-play');
    const focusMiniSkipBtn = document.getElementById('focus-mini-skip');
    const focusMiniResetBtn = document.getElementById('focus-mini-reset');
    const focusMiniExpandBtn = document.getElementById('focus-mini-expand');
    const focusMiniMinimizeBtn = document.getElementById('focus-mini-minimize');
    const focusMiniCloseBtn = document.getElementById('focus-mini-close');

    const focusFullscreen = document.getElementById('focus-fullscreen');
    const focusFsPhase = focusFullscreen.querySelector('.focus-fs-phase');
    const focusFsTimer = focusFullscreen.querySelector('.focus-fs-timer');
    const focusFsTotal = focusFullscreen.querySelector('.focus-fs-total');
    const focusFsDots = focusFullscreen.querySelector('.focus-fs-dots');
    const focusRingProgress = focusFullscreen.querySelector('.focus-ring-progress');
    const focusFsPlayBtn = document.getElementById('focus-fs-play');
    const focusFsSkipBtn = document.getElementById('focus-fs-skip');
    const focusFsResetBtn = document.getElementById('focus-fs-reset');
    const focusFsCollapseBtn = document.getElementById('focus-fs-collapse');
    const focusFsSettingsBtn = document.getElementById('focus-fs-settings-btn');
    const focusSettingsPanel = document.getElementById('focus-settings');

    const settingFocusInput = document.getElementById('setting-focus');
    const settingPauseInput = document.getElementById('setting-pause');
    const settingLongPauseInput = document.getElementById('setting-long-pause');

    // SVG ring circumference
    const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ~565.48

    // --- Helper Functions ---

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function formatTotalFocus(seconds) {
        if (seconds < 60) return `${seconds}s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    function getPhaseLabel(phase) {
        if (phase === 'focus') return 'Foco';
        if (phase === 'pause') return 'Pausa';
        if (phase === 'longPause') return 'Pausa Longa';
        return 'Foco';
    }

    function getPhaseDuration(phase) {
        if (phase === 'focus') return focusSettings.focus * 60;
        if (phase === 'pause') return focusSettings.pause * 60;
        if (phase === 'longPause') return focusSettings.longPause * 60;
        return focusSettings.focus * 60;
    }

    function playTone() {
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
    }

    // --- Update Display ---

    function updateFocusDisplay() {
        const timeStr = formatTime(timeRemaining);
        const label = getPhaseLabel(focusPhase);
        const totalStr = formatTotalFocus(totalFocusSeconds);
        const playIcon = isTimerRunning ? 'ph-pause' : 'ph-play';

        // Update compact modal
        focusMiniTimer.textContent = timeStr;
        focusMiniPhase.textContent = label;
        focusMiniTotal.innerHTML = `<i class="ph ph-fire"></i> Total: ${totalStr}`;
        focusMiniPlayBtn.innerHTML = `<i class="ph ${playIcon}"></i>`;

        // Update fullscreen
        focusFsTimer.textContent = timeStr;
        focusFsPhase.textContent = label;
        focusFsTotal.innerHTML = `<i class="ph ph-fire"></i> Total hoje: ${totalStr}`;
        focusFsPlayBtn.innerHTML = `<i class="ph ${playIcon}"></i>`;

        // Update SVG ring
        const progress = totalDuration > 0 ? timeRemaining / totalDuration : 1;
        const offset = RING_CIRCUMFERENCE * (1 - progress);
        focusRingProgress.style.strokeDashoffset = offset;

        // Phase color classes
        focusMini.classList.remove('focus-phase-pause', 'focus-phase-longPause');
        focusFullscreen.classList.remove('focus-phase-pause', 'focus-phase-longPause');
        if (focusPhase === 'pause') {
            focusMini.classList.add('focus-phase-pause');
            focusFullscreen.classList.add('focus-phase-pause');
        } else if (focusPhase === 'longPause') {
            focusMini.classList.add('focus-phase-longPause');
            focusFullscreen.classList.add('focus-phase-longPause');
        }

        // Dots
        renderDots(focusMiniDots);
        renderDots(focusFsDots);
    }

    function renderDots(container) {
        container.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('div');
            dot.className = 'focus-dot';
            if (i < pomodoroCount % 4) {
                dot.classList.add('completed');
            } else if (i === pomodoroCount % 4 && focusPhase === 'focus') {
                dot.classList.add('active');
            }
            container.appendChild(dot);
        }
    }

    // --- Timer Logic ---

    function startTimer() {
        if (timerInterval) return;
        isTimerRunning = true;
        timerInterval = setInterval(() => {
            timeRemaining--;

            if (focusPhase === 'focus') {
                totalFocusSeconds++;
                SafeStorage.setItem(todayKey, totalFocusSeconds.toString());
            }

            updateFocusDisplay();

            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                isTimerRunning = false;
                playTone();
                advancePhase();
            }
        }, 1000);
        updateFocusDisplay();
    }

    function pauseTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        isTimerRunning = false;
        updateFocusDisplay();
    }

    function toggleTimer() {
        if (isTimerRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    }

    function resetTimer() {
        pauseTimer();
        timeRemaining = getPhaseDuration(focusPhase);
        totalDuration = timeRemaining;
        updateFocusDisplay();
    }

    function advancePhase() {
        if (focusPhase === 'focus') {
            pomodoroCount++;
            if (pomodoroCount % 4 === 0) {
                focusPhase = 'longPause';
                if (window.ReminderSystem) window.ReminderSystem.showRosarySuggestion(); // Trigger Rosary suggestion
                // Trigger pomodoro emotional check-in (Option 2)
                setTimeout(() => {
                    if (typeof showPomodoroCheckin === 'function') {
                        showPomodoroCheckin();
                    }
                }, 500);
            } else {
                focusPhase = 'pause';
                if (window.ReminderSystem) window.ReminderSystem.showRosarySuggestion(); // Trigger Rosary suggestion
            }
        } else {
            focusPhase = 'focus';
        }

        timeRemaining = getPhaseDuration(focusPhase);
        totalDuration = timeRemaining;
        updateFocusDisplay();

        // Auto-start next phase
        startTimer();
    }

    function skipPhase() {
        pauseTimer();
        if (focusPhase === 'focus') {
            pomodoroCount++;
            if (pomodoroCount % 4 === 0) {
                focusPhase = 'longPause';
            } else {
                focusPhase = 'pause';
            }
        } else {
            focusPhase = 'focus';
        }
        timeRemaining = getPhaseDuration(focusPhase);
        totalDuration = timeRemaining;
        updateFocusDisplay();
    }

    // --- Mode Switching ---

    function showCompact() {
        focusMode = 'compact';
        animateModal(focusMini, true);
        animateModal(focusFullscreen, false);
        focusSettingsPanel.style.display = 'none';
        updateFocusDisplay();
    }

    function showFullscreen() {
        focusMode = 'fullscreen';
        animateModal(focusMini, false);
        animateModal(focusFullscreen, true);
        updateFocusDisplay();
    }

    function closeFocusTimer() {
        pauseTimer();
        animateModal(focusMini, false);
        animateModal(focusFullscreen, false);
        focusSettingsPanel.style.display = 'none';
        isFocusMiniMinimized = false;
        focusMini.classList.remove('minimized');
    }

    // --- Settings ---

    function loadSettingsUI() {
        settingFocusInput.value = focusSettings.focus;
        settingPauseInput.value = focusSettings.pause;
        settingLongPauseInput.value = focusSettings.longPause;
    }

    function saveSettings() {
        const f = parseInt(settingFocusInput.value) || 25;
        const p = parseInt(settingPauseInput.value) || 5;
        const lp = parseInt(settingLongPauseInput.value) || 15;

        focusSettings = {
            focus: Math.max(1, Math.min(120, f)),
            pause: Math.max(1, Math.min(30, p)),
            longPause: Math.max(1, Math.min(60, lp))
        };

        SafeStorage.setItem('ora_focus_settings', JSON.stringify(focusSettings));

        // If timer is not running, update the current phase duration
        if (!isTimerRunning) {
            timeRemaining = getPhaseDuration(focusPhase);
            totalDuration = timeRemaining;
            updateFocusDisplay();
        }
    }

    // --- Event Listeners ---

    // Open timer
    if (btnFocus) {
        btnFocus.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isModalVisible(focusMini) && !isModalVisible(focusFullscreen)) {
                showCompact();
            } else if (isModalVisible(focusMini)) {
                animateModal(focusMini, false);
            } else {
                animateModal(focusFullscreen, false);
                focusSettingsPanel.style.display = 'none';
            }
        });
    }

    // Compact controls
    focusMiniPlayBtn.addEventListener('click', toggleTimer);
    focusMiniSkipBtn.addEventListener('click', skipPhase);
    focusMiniResetBtn.addEventListener('click', resetTimer);

    focusMiniExpandBtn.addEventListener('click', showFullscreen);
    focusMiniCloseBtn.addEventListener('click', closeFocusTimer);

    focusMiniMinimizeBtn.addEventListener('click', () => {
        isFocusMiniMinimized = !isFocusMiniMinimized;
        if (isFocusMiniMinimized) {
            focusMini.classList.add('minimized');
            focusMiniMinimizeBtn.querySelector('i').classList.remove('ph-caret-down');
            focusMiniMinimizeBtn.querySelector('i').classList.add('ph-caret-up');
        } else {
            focusMini.classList.remove('minimized');
            focusMiniMinimizeBtn.querySelector('i').classList.remove('ph-caret-up');
            focusMiniMinimizeBtn.querySelector('i').classList.add('ph-caret-down');
        }
    });

    // Fullscreen controls
    focusFsPlayBtn.addEventListener('click', toggleTimer);
    focusFsSkipBtn.addEventListener('click', skipPhase);
    focusFsResetBtn.addEventListener('click', resetTimer);
    focusFsCollapseBtn.addEventListener('click', showCompact);

    // Settings toggle
    focusFsSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = focusSettingsPanel.style.display === 'none';
        focusSettingsPanel.style.display = isHidden ? 'flex' : 'none';
    });

    // Settings input change
    [settingFocusInput, settingPauseInput, settingLongPauseInput].forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Close settings on click outside
    focusFullscreen.addEventListener('click', (e) => {
        if (focusSettingsPanel.style.display !== 'none' &&
            !focusSettingsPanel.contains(e.target) &&
            !focusFsSettingsBtn.contains(e.target)) {
            focusSettingsPanel.style.display = 'none';
        }
    });

    // Initialize
    loadSettingsUI();
    updateFocusDisplay();
    console.log('[Ora] Focus Timer initialized');

    // ============================================================
    // 9. EXAME DE CONSCIÊNCIA
    // ============================================================
    console.log('[Ora] Starting Exam initialization...');

    const examDataFallback = {
        types: {
            morning: { label: "Preparar o Dia", icon: "☀️", hours: [6,11], questions: [
                { text: "Pela graça de qual dia você agradece?", type: "text" },
                { text: "Que virtude quer praticar hoje?", type: "text" },
                { text: "Onde pode encontrar Deus hoje?", type: "text" }
            ]},
            midday: { label: "Revisar a Manhã", icon: "🌤️", hours: [11,14], questions: [
                { text: "Como foi sua manhã?", type: "thumbs" },
                { text: "Onde você viu/sentiu Deus na manhã?", type: "text" },
                { text: "Como pode melhorar a tarde?", type: "text" }
            ]},
            quick: { label: "Pausa Rápida", icon: "⚡", hours: [14,18], questions: [
                { text: "Como está seu coração agora?", type: "emoji", options: ["😌 Em paz","😐 Neutro","😟 Pesado"] }
            ]},
            night: { label: "Revisar o Dia", icon: "🌙", hours: [18,24], questions: [
                { text: "Agradecimento: pelo que você é grato hoje?", type: "text" },
                { text: "Revisão: onde sentiu a presença de Deus?", type: "text" },
                { text: "Exame: que sentimentos marcaram o dia?", type: "text" },
                { text: "Arrependimento: onde você tropeçou?", type: "text" },
                { text: "Solução: como será amanhã?", type: "text" }
            ]}
        },
        defaultVirtues: [
            { id: "paciencia", name: "Paciência", icon: "ph-hourglass" },
            { id: "caridade", name: "Caridade", icon: "ph-heart" },
            { id: "temperanca", name: "Temperança", icon: "ph-scales" },
            { id: "prudencia", name: "Prudência", icon: "ph-crosshair" },
            { id: "humildade", name: "Humildade", icon: "ph-hand-heart" }
        ],
        pomodoroCheckin: {
            message: "Pause para refletir: Como está seu coração agora?",
            options: [
                { id: "peace", emoji: "😌", label: "Em paz" },
                { id: "neutral", emoji: "😐", label: "Neutro" },
                { id: "heavy", emoji: "😟", label: "Pesado" }
            ],
            microPrayers: [
                { id: "breath", label: "Respiração", icon: "ph-wind", text: "Inspire... Senhor, tenha piedade.\nExpire... Cristo, tenha piedade.\nInspire... Senhor, tenha piedade." },
                { id: "pai-nosso", label: "Pai Nosso", icon: "ph-hands-praying", text: "prayer:pai-nosso" },
                { id: "silence", label: "Só silêncio", icon: "ph-ear", text: "Fique em silêncio por um momento.\nDeixe Deus falar ao seu coração.\n\n\"Aquietai-vos e sabei que eu sou Deus.\" — Sl 46,10" }
            ]
        }
    };
    const examData = (data && data.exam) ? data.exam : examDataFallback;
    const examTypes = examData.types;

    // --- DOM Elements ---
    const btnExam = document.getElementById('btn-exam');
    const examTypeModal = document.getElementById('exam-type-modal');
    const closeExamTypeBtn = document.getElementById('close-exam-type-btn');
    const examTypeGrid = document.getElementById('exam-type-grid');
    const examSuggestion = examTypeModal.querySelector('.exam-suggestion');
    const examStreakText = document.getElementById('exam-streak-text');
    const openVirtuesBtn = document.getElementById('open-virtues-btn');

    const examFlowModal = document.getElementById('exam-flow-modal');
    const examFlowTitle = document.getElementById('exam-flow-title');
    const closeExamFlowBtn = document.getElementById('close-exam-flow-btn');
    const examFlowBackBtn = document.getElementById('exam-flow-back-btn');
    const examProgressFill = examFlowModal.querySelector('.exam-progress-fill');
    const examQuestionText = examFlowModal.querySelector('.exam-question-text');
    const examInputArea = examFlowModal.querySelector('.exam-input-area');
    const examPrevBtn = document.getElementById('exam-prev-btn');
    const examNextBtn = document.getElementById('exam-next-btn');
    const examStepCounter = examFlowModal.querySelector('.exam-step-counter');

    const pomodoroCheckin = document.getElementById('pomodoro-checkin');
    const closeCheckinBtn = document.getElementById('close-checkin-btn');
    const checkinOptions = pomodoroCheckin.querySelector('.checkin-options');

    const microPrayerModal = document.getElementById('micro-prayer-modal');
    const closeMicroPrayerBtn = document.getElementById('close-micro-prayer-btn');
    const microPrayerBackBtn = document.getElementById('micro-prayer-back-btn');
    const microPrayerOptionsEl = document.getElementById('micro-prayer-options');
    const microPrayerTextEl = document.getElementById('micro-prayer-text');

    const middayReminder = document.getElementById('midday-reminder');
    const startMiddayBtn = document.getElementById('start-midday-btn');
    const checkMiddayBtn = document.getElementById('check-midday-btn');

    const virtuesModal = document.getElementById('virtues-modal');
    const closeVirtuesBtn = document.getElementById('close-virtues-btn');
    const virtuesBackBtn = document.getElementById('virtues-back-btn');
    const virtuesList = document.getElementById('virtues-list');
    const virtuesSummaryText = document.getElementById('virtues-summary-text');
    const editVirtuesBtn = document.getElementById('edit-virtues-btn');

    const virtuesEditor = document.getElementById('virtues-editor');
    const closeVirtuesEditorBtn = document.getElementById('close-virtues-editor-btn');
    const virtuesEditorBackBtn = document.getElementById('virtues-editor-back-btn');
    const virtuesEditorList = document.getElementById('virtues-editor-list');
    const newVirtueInput = document.getElementById('new-virtue-input');
    const addVirtueBtn = document.getElementById('add-virtue-btn');

    // --- State ---
    let currentExamType = null;
    let currentExamStep = 0;
    let examAnswers = [];

    // ---- OPTION 1: Exam Flow ----

    function getExamType() {
        const h = new Date().getHours();
        if (h >= 6 && h < 11) return 'morning';
        if (h >= 11 && h < 14) return 'midday';
        if (h >= 14 && h < 18) return 'quick';
        return 'night';
    }

    function updateExamButtonTheme() {
        if (!btnExam) return;
        const type = getExamType();
        btnExam.classList.remove('exam-morning', 'exam-midday', 'exam-evening');
        if (type === 'morning') btnExam.classList.add('exam-morning');
        else if (type === 'midday') btnExam.classList.add('exam-midday');
        else btnExam.classList.add('exam-evening');
    }

    function getWeeklyExamCount() {
        let count = 0;
        const now = new Date();
        const dayOfWeek = now.getDay();
        for (let i = 0; i <= dayOfWeek; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = 'ora_exam_done_' + d.toDateString();
            if (SafeStorage.getItem(key)) count++;
        }
        return count;
    }

    function openExamTypeModal() {
        examTypeGrid.innerHTML = '';
        const suggested = getExamType();

        examSuggestion.textContent = `Sugestão: ${examTypes[suggested].icon} ${examTypes[suggested].label}`;

        Object.keys(examTypes).forEach(key => {
            const type = examTypes[key];
            const card = document.createElement('div');
            card.className = 'exam-type-card' + (key === suggested ? ' suggested' : '');
            card.innerHTML = `
                <span class="exam-type-icon">${type.icon}</span>
                <span class="exam-type-label">${type.label}</span>
                <span class="exam-type-count">${type.questions.length} ${type.questions.length === 1 ? 'pergunta' : 'perguntas'}</span>
            `;
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                startExam(key);
            });
            examTypeGrid.appendChild(card);
        });

        const weekCount = getWeeklyExamCount();
        examStreakText.textContent = `${weekCount} exame${weekCount !== 1 ? 's' : ''} esta semana`;

        animateModal(examTypeModal, true);
    }

    function closeExamTypeModal() {
        animateModal(examTypeModal, false);
    }

    function startExam(type) {
        currentExamType = type;
        currentExamStep = 0;
        examAnswers = new Array(examTypes[type].questions.length).fill('');
        closeExamTypeModal();

        examFlowTitle.textContent = `${examTypes[type].icon} ${examTypes[type].label}`;
        animateModal(examFlowModal, true);
        renderExamStep();
    }

    function renderExamStep() {
        const questions = examTypes[currentExamType].questions;
        const q = questions[currentExamStep];
        const total = questions.length;

        // Progress bar
        examProgressFill.style.width = `${((currentExamStep + 1) / total) * 100}%`;

        // Counter
        examStepCounter.textContent = `${currentExamStep + 1} / ${total}`;

        // Question
        examQuestionText.textContent = q.text;

        // Input area
        examInputArea.innerHTML = '';

        if (q.type === 'text') {
            const textarea = document.createElement('textarea');
            textarea.className = 'exam-textarea';
            textarea.placeholder = 'Escreva aqui...';
            textarea.value = examAnswers[currentExamStep] || '';
            textarea.addEventListener('input', (e) => {
                examAnswers[currentExamStep] = e.target.value;
            });
            examInputArea.appendChild(textarea);
            setTimeout(() => textarea.focus(), 100);
        } else if (q.type === 'thumbs') {
            const container = document.createElement('div');
            container.className = 'exam-thumbs';
            ['👍', '👎'].forEach(emoji => {
                const btn = document.createElement('button');
                btn.className = 'exam-emoji-btn' + (examAnswers[currentExamStep] === emoji ? ' active' : '');
                btn.textContent = emoji;
                btn.addEventListener('click', () => {
                    examAnswers[currentExamStep] = emoji;
                    renderExamStep();
                });
                container.appendChild(btn);
            });
            examInputArea.appendChild(container);
        } else if (q.type === 'emoji') {
            const container = document.createElement('div');
            container.className = 'exam-emoji-row';
            (q.options || []).forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'exam-emoji-btn' + (examAnswers[currentExamStep] === opt ? ' active' : '');
                btn.textContent = opt;
                btn.addEventListener('click', () => {
                    examAnswers[currentExamStep] = opt;
                    renderExamStep();
                });
                container.appendChild(btn);
            });
            examInputArea.appendChild(container);
        }

        // Nav button states
        examPrevBtn.style.visibility = currentExamStep > 0 ? 'visible' : 'hidden';
        // Last step: show check icon instead of arrow
        if (currentExamStep === total - 1) {
            examNextBtn.innerHTML = '<i class="ph ph-check"></i>';
            examNextBtn.title = 'Concluir';
        } else {
            examNextBtn.innerHTML = '<i class="ph ph-caret-right"></i>';
            examNextBtn.title = 'Próximo';
        }
    }

    function nextExamStep() {
        const questions = examTypes[currentExamType].questions;
        if (currentExamStep < questions.length - 1) {
            currentExamStep++;
            renderExamStep();
        } else {
            finishExam();
        }
    }

    function prevExamStep() {
        if (currentExamStep > 0) {
            currentExamStep--;
            renderExamStep();
        }
    }

    function finishExam() {
        // Save as done today
        const todayStr = new Date().toDateString();
        SafeStorage.setItem('ora_exam_done_' + todayStr, 'true');

        // Also mark the corresponding reminder as done
        if (currentExamType === 'night') {
            SafeStorage.setItem('ora_evening_done_' + todayStr, 'true');
            if (window.ReminderSystem) window.ReminderSystem.hideModal(document.getElementById('evening-reminder'));
        } else if (currentExamType === 'midday') {
            SafeStorage.setItem('ora_midday_done_' + todayStr, 'true');
            if (window.ReminderSystem) window.ReminderSystem.hideModal(document.getElementById('midday-reminder'));
        }

        // Save exam log
        const log = {
            type: currentExamType,
            date: new Date().toISOString(),
            answers: examAnswers
        };
        try {
            let logs = JSON.parse(SafeStorage.getItem('ora_exam_logs') || '[]');
            logs.push(log);
            // Keep last 30 entries
            if (logs.length > 30) logs = logs.slice(-30);
            SafeStorage.setItem('ora_exam_logs', JSON.stringify(logs));
        } catch (e) { /* ignore */ }

        animateModal(examFlowModal, false);
        showToast('Exame concluído! Deus te abençoe. 🙏', 'success');
        currentExamType = null;
    }

    function closeExamFlow() {
        animateModal(examFlowModal, false);
        currentExamType = null;
    }

    // Event Listeners - Exam
    console.log('[Ora] Exam: btnExam=', btnExam, 'examTypeModal=', examTypeModal);
    if (btnExam) {
        btnExam.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('[Ora] Exam button clicked! Modal display:', examTypeModal.style.display);
            if (!isModalVisible(examTypeModal)) {
                openExamTypeModal();
            } else {
                closeExamTypeModal();
            }
        });
    } else {
        console.error('[Ora] ERROR: btn-exam not found in DOM!');
    }

    if (closeExamTypeBtn) closeExamTypeBtn.addEventListener('click', closeExamTypeModal);
    if (closeExamFlowBtn) closeExamFlowBtn.addEventListener('click', closeExamFlow);
    if (examFlowBackBtn) {
        examFlowBackBtn.addEventListener('click', () => {
            closeExamFlow();
            openExamTypeModal();
        });
    }
    examNextBtn.addEventListener('click', nextExamStep);
    examPrevBtn.addEventListener('click', prevExamStep);

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (isModalVisible(examTypeModal) &&
            !examTypeModal.contains(e.target) &&
            !btnExam.contains(e.target)) {
            closeExamTypeModal();
        }
        if (isModalVisible(examFlowModal) &&
            !examFlowModal.contains(e.target)) {
            // Don't auto close exam flow (user might lose progress)
        }
    });

    // ---- OPTION 2: Pomodoro Check-in ----

    function showPomodoroCheckin() {
        checkinOptions.innerHTML = '';
        const options = examData.pomodoroCheckin.options;

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'checkin-emoji-btn';
            btn.innerHTML = `<span class="checkin-emoji">${opt.emoji}</span><span class="checkin-label">${opt.label}</span>`;
            btn.addEventListener('click', () => {
                animateModal(pomodoroCheckin, false);
                if (opt.id === 'heavy') {
                    showMicroPrayerOptions();
                } else {
                    showToast(`${opt.emoji} ${opt.label} — que bom!`, 'success');
                }
            });
            checkinOptions.appendChild(btn);
        });

        animateModal(pomodoroCheckin, true);
    }

    function showMicroPrayerOptions() {
        microPrayerOptionsEl.innerHTML = '';
        microPrayerTextEl.style.display = 'none';
        microPrayerOptionsEl.style.display = 'grid';

        examData.pomodoroCheckin.microPrayers.forEach(mp => {
            const card = document.createElement('div');
            card.className = 'micro-prayer-card';
            card.innerHTML = `
                <i class="ph ${mp.icon}"></i>
                <span>${mp.label}</span>
            `;
            card.addEventListener('click', () => {
                let text = mp.text;
                // Resolve prayer reference
                if (text.startsWith('prayer:')) {
                    const prayerId = text.split(':')[1];
                    const prayer = prayers.find(p => p.id === prayerId);
                    text = prayer ? prayer.text.pt : '';
                }
                microPrayerOptionsEl.style.display = 'none';
                microPrayerTextEl.textContent = text;
                microPrayerTextEl.style.display = 'block';
            });
            microPrayerOptionsEl.appendChild(card);
        });

        animateModal(microPrayerModal, true);
    }

    if (closeCheckinBtn) closeCheckinBtn.addEventListener('click', () => {
        animateModal(pomodoroCheckin, false);
    });
    if (closeMicroPrayerBtn) closeMicroPrayerBtn.addEventListener('click', () => {
        animateModal(microPrayerModal, false);
    });
    if (microPrayerBackBtn) microPrayerBackBtn.addEventListener('click', () => {
        microPrayerTextEl.style.display = 'none';
        microPrayerOptionsEl.style.display = 'grid';
    });

    // Hook into Pomodoro: after every 4th pomodoro, show check-in
    // We patch advancePhase to add this behavior
    const _originalAdvancePhase = advancePhase;
    // (advancePhase is already called, we add behavior via event)
    // Instead let's watch pomodoroCount changes via a setter approach
    // Simpler approach: check in the timer's interval if we just hit a multiple of 4
    let lastCheckinPomodoro = 0;



    // ---- OPTION 5: Virtues Checklist ----

    function loadVirtues() {
        try {
            const saved = SafeStorage.getItem('ora_virtues_list');
            if (saved) return JSON.parse(saved);
        } catch (e) { /* use defaults */ }
        return examData.defaultVirtues.map(v => ({ ...v }));
    }

    function saveVirtues(virtues) {
        SafeStorage.setItem('ora_virtues_list', JSON.stringify(virtues));
    }

    function getVirtueLog() {
        const todayStr = new Date().toDateString();
        try {
            const saved = SafeStorage.getItem('ora_virtues_log_' + todayStr);
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        return {};
    }

    function saveVirtueLog(log) {
        const todayStr = new Date().toDateString();
        SafeStorage.setItem('ora_virtues_log_' + todayStr, JSON.stringify(log));
    }

    function openVirtuesModal() {
        closeExamTypeModal();
        renderVirtuesList();
        animateModal(virtuesModal, true);
    }

    function closeVirtuesModal() {
        animateModal(virtuesModal, false);
    }

    function renderVirtuesList() {
        const virtues = loadVirtues();
        const log = getVirtueLog();
        virtuesList.innerHTML = '';

        let practiced = 0;
        let total = virtues.length;

        virtues.forEach(v => {
            const status = log[v.id]; // 'success', 'fail', or undefined
            const card = document.createElement('div');
            card.className = 'virtue-card' + (status ? ` virtue-${status}` : '');
            card.innerHTML = `
                <div class="virtue-info">
                    <i class="ph ${v.icon}"></i>
                    <span>${v.name}</span>
                </div>
                <div class="virtue-actions">
                    <button class="virtue-btn virtue-success-btn ${status === 'success' ? 'active' : ''}" title="Pratiquei"><i class="ph ph-check"></i></button>
                    <button class="virtue-btn virtue-fail-btn ${status === 'fail' ? 'active' : ''}" title="Falhei"><i class="ph ph-x"></i></button>
                </div>
            `;

            const successBtn = card.querySelector('.virtue-success-btn');
            const failBtn = card.querySelector('.virtue-fail-btn');

            successBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentLog = getVirtueLog();
                currentLog[v.id] = currentLog[v.id] === 'success' ? undefined : 'success';
                if (currentLog[v.id] === undefined) delete currentLog[v.id];
                saveVirtueLog(currentLog);
                renderVirtuesList();
            });

            failBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentLog = getVirtueLog();
                currentLog[v.id] = currentLog[v.id] === 'fail' ? undefined : 'fail';
                if (currentLog[v.id] === undefined) delete currentLog[v.id];
                saveVirtueLog(currentLog);
                renderVirtuesList();
            });

            if (status === 'success') practiced++;
            virtuesList.appendChild(card);
        });

        virtuesSummaryText.textContent = `${practiced}/${total} virtudes praticadas hoje`;
    }

    // Virtues Editor
    function openVirtuesEditor() {
        animateModal(virtuesModal, false);
        renderVirtuesEditor();
        animateModal(virtuesEditor, true);
    }

    function closeVirtuesEditor() {
        animateModal(virtuesEditor, false);
    }

    function renderVirtuesEditor() {
        const virtues = loadVirtues();
        virtuesEditorList.innerHTML = '';

        virtues.forEach(v => {
            const item = document.createElement('div');
            item.className = 'virtues-editor-item';
            item.innerHTML = `
                <i class="ph ${v.icon}"></i>
                <span>${v.name}</span>
                <button class="icon-btn-sm virtue-remove-btn" title="Remover"><i class="ph ph-trash"></i></button>
            `;
            item.querySelector('.virtue-remove-btn').addEventListener('click', () => {
                const updated = loadVirtues().filter(vv => vv.id !== v.id);
                saveVirtues(updated);
                renderVirtuesEditor();
            });
            virtuesEditorList.appendChild(item);
        });
    }

    function addNewVirtue() {
        const name = newVirtueInput.value.trim();
        if (!name) return;

        const virtues = loadVirtues();
        virtues.push({
            id: 'custom-' + Date.now(),
            name: name,
            icon: 'ph-star'
        });
        saveVirtues(virtues);
        newVirtueInput.value = '';
        renderVirtuesEditor();
        showToast(`"${name}" adicionada!`, 'success');
    }

    // Virtues Event Listeners
    if (openVirtuesBtn) openVirtuesBtn.addEventListener('click', openVirtuesModal);
    if (closeVirtuesBtn) closeVirtuesBtn.addEventListener('click', closeVirtuesModal);
    if (virtuesBackBtn) {
        virtuesBackBtn.addEventListener('click', () => {
            closeVirtuesModal();
            openExamTypeModal();
        });
    }
    if (editVirtuesBtn) editVirtuesBtn.addEventListener('click', openVirtuesEditor);
    if (closeVirtuesEditorBtn) closeVirtuesEditorBtn.addEventListener('click', closeVirtuesEditor);
    if (virtuesEditorBackBtn) {
        virtuesEditorBackBtn.addEventListener('click', () => {
            closeVirtuesEditor();
            openVirtuesModal();
        });
    }
    if (addVirtueBtn) addVirtueBtn.addEventListener('click', addNewVirtue);
    if (newVirtueInput) {
        newVirtueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addNewVirtue();
        });
    }

    // --- Exam Button Theme & Init ---
    updateExamButtonTheme();
    setInterval(updateExamButtonTheme, 60000);

    console.log('[Ora] Exam of Conscience initialized');

    // ============================================================
    // 8. ROSARY (TERÇO)
    // ============================================================

    // Initialize New Rosary System
    if (window.RosarySystem) {
        window.RosarySystem.init(data, {
            animateModal: animateModal,
            isModalVisible: isModalVisible,
            SafeStorage: SafeStorage,
            showToast: showToast
        });
    } else {
        console.error('[Ora] RosarySystem not loaded!');
    }

    console.log('[Ora] Rosary (Terço) initialized');
    // ============================================================
    // 8. SITE BLOCKER INTEGRATION
    // ============================================================
    if (window.Blocker) {
        window.Blocker.init();
        
        const btnBlocker = document.getElementById('btn-blocker');
        const blockerModal = document.getElementById('blocker-modal');
        const closeBlockerBtn = document.getElementById('close-blocker-btn');

        if (btnBlocker) {
            btnBlocker.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(blockerModal)) {
                    animateModal(blockerModal, true);
                } else {
                    animateModal(blockerModal, false);
                }
            });
        }

        if (closeBlockerBtn) {
            closeBlockerBtn.addEventListener('click', () => {
                animateModal(blockerModal, false);
            });
        }
        
        // Close on click outside
        document.addEventListener('click', (e) => {
             if (isModalVisible(blockerModal) && 
                !blockerModal.contains(e.target) && 
                !btnBlocker.contains(e.target)) {
                animateModal(blockerModal, false);
            }
        });
    }

    console.log('[Ora] App fully initialized');
}

// Start the app
initApp();
