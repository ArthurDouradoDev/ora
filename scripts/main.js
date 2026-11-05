// ============================================================
// LOAD DATA FROM JSON & INITIALIZE
// ============================================================

// --- TOAST SYSTEM ---
const toastContainer = document.getElementById('toast-container');

// --- Modal Animation Helper & Toast System are now in utils.js ---


async function loadAppData() {
    try {
        const [backgrounds, playlists, prayers, quotes, greetings, rosary, exam, saints, bibleBooks] = await Promise.all([
            loadJSON('data/backgrounds.json'),
            loadJSON('data/playlists.json'),
            loadJSON('data/prayers.json'),
            loadJSON('data/quotes.json'),
            loadJSON('data/greetings.json'),
            loadJSON('data/rosary.json'),
            loadJSON('data/exam.json'),
            loadJSON('data/saints.json'),
            loadJSON('data/bible-books.json')
        ]);

        return {
            backgroundImages: backgrounds,
            defaultPlaylists: playlists,
            prayers: prayers,
            quotes: quotes,
            greetings: greetings,
            rosary: rosary,
            exam: exam,
            saints: saints,
            bibleBooks: bibleBooks
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
            exam: { types: {}, defaultVirtues: [] }
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
    // DATA MIGRATION (1.1.5 / 1.2.0 → schema 2) — before any module
    // reads storage. The SW runs the same idempotent migration.
    // ============================================================
    await runMigration();

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

    // ============================================================
    // SHELL: destinos (Hoje · Rezar · Frutos) e diálogos
    // ============================================================
    if (window.LeaveGuard) LeaveGuard.init();
    if (window.DialogSystem) DialogSystem.init();
    if (window.RouterSystem) RouterSystem.init();
    bindShellHelpers();

    // ============================================================
    // SETTINGS SYSTEM (before other modules)
    // ============================================================
    if (window.SettingsSystem) {
        await window.SettingsSystem.init();
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

    await SoundSystem.init(data.defaultPlaylists);

    // ============================================================
    // 4. PRAYER SYSTEM
    // ============================================================

    // Initialize Prayer System
    if (window.PrayerSystem) {
        await window.PrayerSystem.init(data.prayers);
        await ReaderSystem.init();
        await RespiroSystem.init(data);
        console.log('[Ora] Prayer System initialized');
    }

    // ============================================================
    // 5. ROSARY
    // ============================================================

    // Initialize New Rosary System
    if (window.RosarySystem) {
        await window.RosarySystem.init(data);

        console.log('[Ora] Rosary (Terço) initialized');
    } else {
        console.error('[Ora] RosarySystem not loaded!');
    }

    // Registro de práticas para Frutos (terço, leitor, exame, rituais)
    if (window.PracticeLog) {
        window.PracticeLog.init();
    }
    // Conta esta nova aba para o relatório de tempo de tela (SW é o escritor)
    try {
        chrome.runtime.sendMessage({ type: 'screentime:newtab' });
    } catch (e) { /* SW indisponível */ }

    // ============================================================
    // 7. FOCUS TIMER (POMODORO)
    // ============================================================

    // Initialize Focus System
    if (window.FocusSystem) {
        await window.FocusSystem.init();
    } else {
        console.error('FocusSystem not found!');
    }

    // Initialize Task System
    if (window.TaskSystem) {
        await window.TaskSystem.init();
    } else {
        console.error('TaskSystem not found!');
    }

    // ============================================================
    // 8. EXAME DE CONSCIÊNCIA & VIRTUDES
    // ============================================================
    if (window.ExamSystem) {
        await window.ExamSystem.init(data);
    } else {
        console.error('[Ora] ExamSystem not found!');
    }

    // ============================================================
    // 9. SITE BLOCKER + PROTECTION PILL
    // ============================================================
    if (window.Blocker) {
        await window.Blocker.init();
    }
    if (window.ProtectionSystem) {
        await window.ProtectionSystem.init();
    }

    // ============================================================
    // 10. HOJE — atalhos, convites e a tela (depois dos módulos que ela lê)
    // ============================================================
    if (window.LinksSystem) {
        await window.LinksSystem.init();
    }
    // Rituais antes dos convites: eles dizem quais convites já não cabem hoje
    if (window.RitualsSystem) {
        await window.RitualsSystem.init();
    }
    if (window.ReminderSystem) {
        await window.ReminderSystem.init({ prayers: data.prayers });
    }
    if (window.TodaySystem) {
        await window.TodaySystem.init({ quotes: data.quotes, greetings: data.greetings });
    }

    // ============================================================
    // Rezar renders the restored route after all its modules are ready.
    await RezarSystem.init(data);
    // Frutos (com o bloco de tempo de tela) lê sessões, práticas e exames já migrados
    if (window.ScreenTimeSystem) {
        await window.ScreenTimeSystem.init();
    }
    if (window.FrutosSystem) {
        await window.FrutosSystem.init();
    }

    // 11. CROSS-DEVICE SYNC (after all modules, so merges land on
    //     fully-migrated data)
    // ============================================================
    if (window.SyncSystem) {
        await window.SyncSystem.init();
    }

    // ============================================================
    // 12. ONBOARDING (first run — shows the welcome wizard)
    // ============================================================
    if (window.OnboardingSystem) {
        await window.OnboardingSystem.init();
    }

    console.log('[Ora] App fully initialized');
}

// Migração de dados para o esquema 2 (ver scripts/shared/migrate-core.js)
async function runMigration() {
    try {
        const snapshot = await chrome.storage.local.get(null);
        if (!MigrateCore.needsMigration(snapshot)) return;
        const result = MigrateCore.migrate(snapshot);
        await chrome.storage.local.set(result.changes);
        if (result.removals.length) await chrome.storage.local.remove(result.removals);
        console.log(`[Ora] Data migrated to schema ${result.schemaVersion}:`, Object.keys(result.changes), 'removed:', result.removals);
    } catch (e) {
        // Nothing was removed: the legacy data stays intact and the next tab retries
        console.error('[Ora] Data migration failed:', e);
    }
}

// Atalhos provisórios do shell enquanto as telas da V0 convivem com as novas
function bindShellHelpers() {
    // Botões antigos feitos de <div role="button">: Enter e Espaço acionam o clique
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target;
        if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'button') return;
        if (el.tagName === 'BUTTON' || el.tagName === 'A') return;
        e.preventDefault();
        el.click();
    });
}

// Start the app
initApp();
