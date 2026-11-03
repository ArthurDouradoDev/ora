// ============================================================
// ONBOARDING SYSTEM
// First-run wizard: language → name → features tour → prefs → done
// ============================================================

const OnboardingSystem = {
    KEY_DONE: 'ora_onboarding_done',
    TOTAL_STEPS: 5,

    state: {
        step: 0,
        locale: 'pt',
        userName: '',
        prayerLang: 'pt',
        reminders: {
            carlo: true,
            angelus: true,
            mercy: true,
            midday: true,
            evening: true,
        },
    },

    elements: {},

    init: async function() {
        this.cacheDOM();
        if (!this.elements.overlay) return;

        this.buildDots();
        this.bindEvents();

        const done = await AsyncStorage.get(this.KEY_DONE, false);
        if (!done) {
            this.open();
        }
        console.log('[Ora] Onboarding System initialized');
    },

    cacheDOM: function() {
        this.elements.overlay = document.getElementById('onboarding-overlay');
        this.elements.steps = document.querySelectorAll('#onboarding-overlay .onboarding-step');
        this.elements.dots = document.getElementById('onboarding-dots');
        this.elements.btnNext = document.getElementById('onboarding-next');
        this.elements.btnBack = document.getElementById('onboarding-back');
        this.elements.btnSkip = document.getElementById('onboarding-skip');
        this.elements.langCards = document.querySelectorAll('#onboarding-overlay .onboarding-lang-card');
        this.elements.nameInput = document.getElementById('onboarding-name-input');
        this.elements.namePreview = document.getElementById('onboarding-name-preview');
        this.elements.prayerLangBtns = document.querySelectorAll('#onboarding-overlay [data-ob-prayer-lang]');
        this.elements.reminderToggles = {
            carlo: document.getElementById('ob-reminder-carlo'),
            angelus: document.getElementById('ob-reminder-angelus'),
            mercy: document.getElementById('ob-reminder-mercy'),
            midday: document.getElementById('ob-reminder-midday'),
            evening: document.getElementById('ob-reminder-evening'),
        };
        this.elements.btnReplay = document.getElementById('settings-replay-onboarding');
    },

    buildDots: function() {
        if (!this.elements.dots) return;
        this.elements.dots.innerHTML = '';
        for (let i = 0; i < this.TOTAL_STEPS; i++) {
            const dot = document.createElement('span');
            dot.className = 'onboarding-dot' + (i === 0 ? ' active' : '');
            this.elements.dots.appendChild(dot);
        }
    },

    bindEvents: function() {
        this.elements.btnNext.addEventListener('click', () => {
            if (this.state.step >= this.TOTAL_STEPS - 1) {
                this.finish();
            } else {
                this.goToStep(this.state.step + 1);
            }
        });

        this.elements.btnBack.addEventListener('click', () => {
            if (this.state.step > 0) this.goToStep(this.state.step - 1);
        });

        this.elements.btnSkip.addEventListener('click', () => this.finish(true));

        // Language cards — applied live so the rest of the wizard is translated
        this.elements.langCards.forEach(card => {
            card.addEventListener('click', async () => {
                const locale = card.dataset.locale;
                if (!locale || locale === this.state.locale) return;
                this.state.locale = locale;
                this.elements.langCards.forEach(c => c.classList.toggle('selected', c.dataset.locale === locale));
                await this.applyLocale(locale);
            });
        });

        // Name (kept in state, persisted on finish)
        if (this.elements.nameInput) {
            this.elements.nameInput.addEventListener('input', (e) => {
                this.state.userName = e.target.value.trim();
                this.updateNamePreview();
            });
            this.elements.nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.elements.btnNext.click();
            });
        }

        // Prayer language toggle
        this.elements.prayerLangBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.obPrayerLang;
                this.state.prayerLang = lang;
                this.elements.prayerLangBtns.forEach(b => b.classList.toggle('active', b.dataset.obPrayerLang === lang));
            });
        });

        // Reminder toggles
        for (const [name, el] of Object.entries(this.elements.reminderToggles)) {
            if (el) {
                el.addEventListener('change', (e) => {
                    this.state.reminders[name] = e.target.checked;
                });
            }
        }

        // Replay from settings modal
        if (this.elements.btnReplay) {
            this.elements.btnReplay.addEventListener('click', (e) => {
                e.stopPropagation();
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal) animateModal(settingsModal, false);
                this.open();
            });
        }
    },

    open: function() {
        this.prefillFromSettings();
        this.goToStep(0);
        this.elements.overlay.classList.remove('closing');
        this.elements.overlay.classList.add('active');
    },

    // Use current settings as wizard defaults (relevant on replay)
    prefillFromSettings: function() {
        const s = window.SettingsSystem ? window.SettingsSystem.state : null;
        if (!s) return;

        this.state.locale = s.locale || 'pt';
        this.state.userName = s.userName || '';
        this.state.prayerLang = s.prayerLang || 'pt';
        this.state.reminders = Object.assign({}, this.state.reminders, s.reminders);

        this.elements.langCards.forEach(c => c.classList.toggle('selected', c.dataset.locale === this.state.locale));
        if (this.elements.nameInput) this.elements.nameInput.value = this.state.userName;
        this.elements.prayerLangBtns.forEach(b => b.classList.toggle('active', b.dataset.obPrayerLang === this.state.prayerLang));
        for (const [name, el] of Object.entries(this.elements.reminderToggles)) {
            if (el) el.checked = this.state.reminders[name] !== false;
        }
    },

    goToStep: function(step) {
        this.state.step = step;

        this.elements.steps.forEach(el => {
            const isActive = parseInt(el.dataset.step) === step;
            el.classList.remove('active');
            if (isActive) {
                // Force reflow so the entry animation replays
                void el.offsetWidth;
                el.classList.add('active');
            }
        });

        if (this.elements.dots) {
            this.elements.dots.querySelectorAll('.onboarding-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === step);
            });
        }

        this.elements.btnBack.style.display = step === 0 ? 'none' : '';
        this.elements.btnSkip.style.display = step === this.TOTAL_STEPS - 1 ? 'none' : '';
        this.elements.btnNext.textContent = step === this.TOTAL_STEPS - 1
            ? t('onboarding.btn_finish')
            : t('onboarding.btn_next');

        if (step === 1 && this.elements.nameInput) {
            this.updateNamePreview();
            setTimeout(() => this.elements.nameInput.focus(), 250);
        }
    },

    // Live greeting preview under the name input
    updateNamePreview: function() {
        if (!this.elements.namePreview) return;
        this.elements.namePreview.textContent = this.state.userName
            ? t('onboarding.name_preview', { name: this.state.userName })
            : '';
    },

    // Load and apply a locale immediately (mirrors SettingsSystem locale change)
    applyLocale: async function(locale) {
        await AsyncStorage.set('ora_locale', locale);
        window._i18nLocale = locale;
        try {
            const [newStrings, newFallback] = await Promise.all([
                loadJSON(`data/i18n/${locale}.json`).catch(() => null),
                locale !== 'pt' ? loadJSON('data/i18n/pt.json').catch(() => ({})) : Promise.resolve(null)
            ]);
            window._i18nStrings = newStrings || {};
            window._i18nFallback = newFallback || newStrings || {};
            if (locale === 'pt') window._i18nFallback = window._i18nStrings;
        } catch (err) {
            console.error('[Ora] Onboarding: failed to load locale:', err);
        }
        applyI18n();

        // Refresh the Next/Finish button label (set via JS, not data-i18n)
        this.goToStep(this.state.step);

        if (window.SettingsSystem) {
            window.SettingsSystem.state.locale = locale;
            const select = document.getElementById('settings-locale');
            if (select) select.value = locale;
        }
        window.dispatchEvent(new CustomEvent('ora:locale-changed', { detail: { locale } }));
    },

    finish: async function(skipped = false) {
        const S = window.SettingsSystem;

        // Persist all choices using the same keys SettingsSystem owns
        await AsyncStorage.set('ora_locale', this.state.locale);
        await AsyncStorage.set('ora_user_name', this.state.userName);
        await AsyncStorage.set('ora_prayer_lang', this.state.prayerLang);
        await AsyncStorage.set('ora_reminder_carlo', this.state.reminders.carlo);
        await AsyncStorage.set('ora_reminder_angelus', this.state.reminders.angelus);
        await AsyncStorage.set('ora_reminder_mercy', this.state.reminders.mercy);
        await AsyncStorage.set('ora_reminder_midday', this.state.reminders.midday);
        await AsyncStorage.set('ora_reminder_evening', this.state.reminders.evening);
        await AsyncStorage.set(this.KEY_DONE, true);

        // Sync the in-memory settings state + UI
        if (S) {
            S.state.locale = this.state.locale;
            S.state.userName = this.state.userName;
            S.state.prayerLang = this.state.prayerLang;
            S.state.reminders = Object.assign({}, this.state.reminders);
            S.loadSettingsUI();
            S.dispatchChanged('userName', this.state.userName);
            S.dispatchChanged('prayerLang', this.state.prayerLang);
        }

        this.close();

        if (!skipped) {
            showToast(t('onboarding.toast_welcome'), 'success');
        }
    },

    close: function() {
        const overlay = this.elements.overlay;
        overlay.classList.add('closing');
        overlay.addEventListener('animationend', () => {
            overlay.classList.remove('active', 'closing');
        }, { once: true });
        // Fallback in case animationend doesn't fire
        setTimeout(() => overlay.classList.remove('active', 'closing'), 600);
    },
};

window.OnboardingSystem = OnboardingSystem;
