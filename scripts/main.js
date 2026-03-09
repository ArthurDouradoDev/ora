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

// Helper for safe storage access is now in utils.js


// ============================================================
// LOAD DATA FROM JSON & INITIALIZE
// ============================================================

// --- TOAST SYSTEM ---
const toastContainer = document.getElementById('toast-container');

// --- Modal Animation Helper & Toast System are now in utils.js ---


async function loadAppData() {
    try {
        const [backgrounds, playlists, prayers, quotes, greetings, rosary, exam] = await Promise.all([
            loadJSON('data/backgrounds.json'),
            loadJSON('data/playlists.json'),
            loadJSON('data/prayers.json'),
            loadJSON('data/quotes.json'),
            loadJSON('data/greetings.json'),
            loadJSON('data/rosary.json'),
            loadJSON('data/exam.json')
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
            quotes: [{ text: { pt: "Fiat Voluntas Tua", en: "Thy Will Be Done", es: "Hágase Tu Voluntad" }, author: "" }],
            greetings: [{ pt: "Fiat Voluntas Tua", en: "Thy Will Be Done", es: "Hágase Tu Voluntad" }],
            rosary: { structure: [], mysteries: {}, extraPrayers: {} },
            exam: { types: {}, defaultVirtues: [], pomodoroCheckin: {} }
        };
    }
}

async function initApp() {
    // ============================================================
    // CHECK IF LOADING SCREEN IS NEEDED (only first open per session)
    // ============================================================
    let showLoading = false;
    try {
        const session = await chrome.storage.session.get('ora_bg_loaded');
        if (!session.ora_bg_loaded) {
            showLoading = true;
            // First open in this session — activate loading screen
            const ls = document.getElementById('loading-screen');
            if (ls) ls.classList.add('active');
            document.body.classList.add('app-loading');
            
            // ============================================================
            // LOADING SCREEN DISMISSAL (Setup early to catch fast cache responses)
            // ============================================================
            function dismissLoading() {
                const loadingScreen = document.getElementById('loading-screen');
                if (!loadingScreen || loadingScreen.classList.contains('fade-out')) return;

                loadingScreen.classList.add('fade-out');
                document.body.classList.remove('app-loading');
                document.body.classList.add('app-ready');

                // Remove from DOM after transition
                loadingScreen.addEventListener('transitionend', () => {
                    loadingScreen.remove();
                }, { once: true });
            }

            // Listen for background image ready right now, before starting any promises
            window.addEventListener('ora:background-ready', dismissLoading, { once: true });

            // Safety timeout — never leave user stuck on loading
            setTimeout(dismissLoading, 8000);
        }
    } catch (e) {
        console.warn('[Ora] session storage check failed:', e);
    }

    // ============================================================
    // LOAD i18n LOCALE (must happen before any module init)
    // ============================================================
    try {
        const savedLocale = await AsyncStorage.get('ora_locale', 'pt');
        window._i18nLocale = savedLocale;
        const [localeStrings, fallbackStrings] = await Promise.all([
            loadJSON(`data/i18n/${savedLocale}.json`).catch(() => null),
            savedLocale !== 'pt' ? loadJSON('data/i18n/pt.json').catch(() => ({})) : Promise.resolve(null)
        ]);
        window._i18nStrings = localeStrings || {};
        window._i18nFallback = fallbackStrings || localeStrings || {};
        if (savedLocale === 'pt') window._i18nFallback = window._i18nStrings;
        applyI18n();
        console.log(`[Ora] i18n loaded: ${savedLocale}`);
    } catch (e) {
        console.warn('[Ora] i18n load failed, using defaults:', e);
    }

    // Start background preload early — in parallel with JSON data loading
    let bgPreloadPromise = Promise.resolve();
    if (typeof BackgroundSystem !== 'undefined') {
        const bgDataPromise = loadJSON('data/backgrounds.json');
        bgPreloadPromise = bgDataPromise.then(bgData => {
            return BackgroundSystem.init(bgData);
        }).catch(e => console.error('[Ora] Early bg preload failed:', e));
    }

    const data = await loadAppData();
    console.log('[Ora] Data loaded:', Object.keys(data));

    // Wait for background init if it hasn't finished yet
    await bgPreloadPromise;

    // ============================================================
    // 2b. Frase e Saudação Dinâmicas
    // ============================================================

    async function setQuote() {
        try {
            if (!data.quotes || data.quotes.length === 0) return;
            const quoteText = document.querySelector('.quote-text');
            const quoteAuthor = document.querySelector('.quote-author');
            if (!quoteText || !quoteAuthor) return;

            const today = new Date().toDateString();
            const savedQuoteDate = await AsyncStorage.get('ora_quote_date');
            
            let quoteIndex;

            if (savedQuoteDate === today) {
                const savedIndex = await AsyncStorage.get('ora_quote_index');
                if (savedIndex !== null) {
                    quoteIndex = parseInt(savedIndex);
                }
            } 
            
            if (quoteIndex === undefined) {
                quoteIndex = Math.floor(Math.random() * data.quotes.length);
                await AsyncStorage.set('ora_quote_date', today);
                await AsyncStorage.set('ora_quote_index', quoteIndex.toString());
            }

            const quote = data.quotes[quoteIndex] || data.quotes[0];
            const locale = window._i18nLocale || 'pt';
            const qText = (typeof quote.text === 'object') ? (quote.text[locale] || quote.text.pt || '') : quote.text;
            quoteText.textContent = `"${qText}"`;
            quoteAuthor.textContent = quote.author;
        } catch (e) {
            console.error('[Ora] Error in setQuote:', e);
        }
    }
    await setQuote();

    async function setGreeting() {
        try {
            if (!data.greetings || data.greetings.length === 0) return;
            const greetingEl = document.querySelector('.greeting');
            if (!greetingEl) return;

            const today = new Date().toDateString();
            const savedGreetingDate = await AsyncStorage.get('ora_greeting_date');
            
            let greetingIndex;

            if (savedGreetingDate === today) {
                 const savedIndex = await AsyncStorage.get('ora_greeting_index');
                 if (savedIndex !== null) {
                     greetingIndex = parseInt(savedIndex);
                 }
            }
            
            if (greetingIndex === undefined) {
                greetingIndex = Math.floor(Math.random() * data.greetings.length);
                await AsyncStorage.set('ora_greeting_date', today);
                await AsyncStorage.set('ora_greeting_index', greetingIndex.toString());
            }

            const greeting = data.greetings[greetingIndex] || data.greetings[0];
            const locale = window._i18nLocale || 'pt';
            greetingEl.textContent = (typeof greeting === 'object') ? (greeting[locale] || greeting.pt || '') : greeting;
        } catch (e) {
            console.error('[Ora] Error in setGreeting:', e);
        }
    }
    await setGreeting();

    // ============================================================
    // 3. Music Library & Player Logic
    // ============================================================

    // Initialize Music System
    if (window.MusicSystem) {
        await window.MusicSystem.init(data.defaultPlaylists);
        // Dependencies are now global

    } else {
        console.error('MusicSystem not found!');
    }

    // ============================================================
    // ============================================================
    // 4. PRAYER SYSTEM
    // ============================================================

    // Initialize Prayer System
    if (window.PrayerSystem) {
        window.PrayerSystem.init(data.prayers);
        console.log('[Ora] Prayer System initialized');
    }

    // ============================================================
    // 5. REMINDERS (Angelus, Exam, Rosary)
    // ============================================================

    // Initialize New Rosary System
    if (window.RosarySystem) {
        window.RosarySystem.init(data);

        console.log('[Ora] Rosary (Terço) initialized');
    } else {
        console.error('[Ora] RosarySystem not loaded!');
    }

    if (window.ReminderSystem) {
        window.ReminderSystem.init({
            prayers: data.prayers,
            exam: data.exam
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
        const savedIntention = await AsyncStorage.get('ora_intention');
        if (savedIntention) {
            intentionInput.value = savedIntention;
        }

        const saveIntention = window.debounce((value) => {
             AsyncStorage.set('ora_intention', value);
        }, 500);

        intentionInput.addEventListener('input', (e) => {
            saveIntention(e.target.value);
        });

        // Listen for storage changes from other windows/tabs (requires background script usually, chrome.storage.onChanged)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.ora_intention) {
                 intentionInput.value = changes.ora_intention.newValue || '';
            }
        });
    }

    // ============================================================
    // 7. FOCUS TIMER (POMODORO)
    // ============================================================

    // Initialize Focus System
    if (window.FocusSystem) {
        await window.FocusSystem.init();
    } else {
        console.error('FocusSystem not found!');
    }

    // ============================================================
    // 8. EXAME DE CONSCIÊNCIA & VIRTUDES
    // ============================================================
    if (window.ExamSystem) {
        window.ExamSystem.init(data);
    } else {
        console.error('[Ora] ExamSystem not found!');
    }

    // ============================================================
    // 9. SITE BLOCKER INTEGRATION
    // ============================================================
    if (window.Blocker) {
        await window.Blocker.init();
        
        const btnBlocker = document.getElementById('btn-blocker');
        const blockerModal = document.getElementById('blocker-modal');
        const closeBlockerBtn = document.getElementById('close-blocker-btn');

        if (btnBlocker) {
            btnBlocker.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(blockerModal)) {
                    animateModal(blockerModal, true);
                    window.Blocker.onModalOpen();
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
        
        // Close on click outside (but not if clicking inside lock overlay/inputs)
        document.addEventListener('click', (e) => {
            if (blockerModal && blockerModal.contains(document.activeElement) && 
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
                return;
            }
             if (isModalVisible(blockerModal) && 
                !blockerModal.contains(e.target) && 
                !btnBlocker.contains(e.target)) {
                animateModal(blockerModal, false);
            }
        });
    }

    // ============================================================
    // 10. LANGUAGE SELECTOR
    // ============================================================
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.value = window._i18nLocale || 'pt';
        langSelect.addEventListener('change', async (e) => {
            const newLocale = e.target.value;
            await AsyncStorage.set('ora_locale', newLocale);
            window._i18nLocale = newLocale;
            try {
                const [newStrings, newFallback] = await Promise.all([
                    loadJSON(`data/i18n/${newLocale}.json`).catch(() => null),
                    newLocale !== 'pt' ? loadJSON('data/i18n/pt.json').catch(() => ({})) : Promise.resolve(null)
                ]);
                window._i18nStrings = newStrings || {};
                window._i18nFallback = newFallback || newStrings || {};
                if (newLocale === 'pt') window._i18nFallback = window._i18nStrings;
            } catch (err) {
                console.error('[Ora] Failed to load locale:', err);
            }
            applyI18n();
            // Re-set quote and greeting with new locale
            await setQuote();
            await setGreeting();
            // Notify other modules
            window.dispatchEvent(new CustomEvent('ora:locale-changed', { detail: { locale: newLocale } }));
            console.log(`[Ora] Locale changed to: ${newLocale}`);
        });
    }

    console.log('[Ora] App fully initialized');
}

// Start the app
initApp();
