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

    // Initialize New Rosary System
    if (window.RosarySystem) {
        window.RosarySystem.init(data, {
            animateModal: animateModal,
            isModalVisible: isModalVisible,
            SafeStorage: SafeStorage,
            showToast: showToast
        });
        console.log('[Ora] Rosary (Terço) initialized');
    } else {
        console.error('[Ora] RosarySystem not loaded!');
    }

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
        // Handled by ExamSystem
    });

    window.addEventListener('ora:minimize-focus', () => {
         // Focus system listener handles this now
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

    // Initialize Focus System
    if (window.FocusSystem) {
        window.FocusSystem.init({
            storage: SafeStorage,
            animateModal: animateModal,
            isModalVisible: isModalVisible,
            callbacks: {
                showPomodoroCheckin: (window.ExamSystem) ? window.ExamSystem.showPomodoroCheckin.bind(window.ExamSystem) : null
            }
        });
    } else {
        console.error('FocusSystem not found!');
    }

    // ============================================================
    // 8. EXAME DE CONSCIÊNCIA & VIRTUDES
    // ============================================================
    if (window.ExamSystem) {
        window.ExamSystem.init(data, {
            SafeStorage: SafeStorage,
            animateModal: animateModal,
            isModalVisible: isModalVisible,
            showToast: showToast,
            prayers: data.prayers
        });
    } else {
        console.error('[Ora] ExamSystem not found!');
    }

    // ============================================================
    // 9. SITE BLOCKER INTEGRATION
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
