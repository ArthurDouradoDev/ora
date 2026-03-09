const SettingsSystem = {
    // Storage keys
    KEYS: {
        LOCALE: 'ora_locale',
        USER_NAME: 'ora_user_name',
        PRAYER_LANG: 'ora_prayer_lang',
        REMINDER_CARLO: 'ora_reminder_carlo',
        REMINDER_ANGELUS: 'ora_reminder_angelus',
        REMINDER_MERCY: 'ora_reminder_mercy',
        REMINDER_MIDDAY: 'ora_reminder_midday',
        REMINDER_EVENING: 'ora_reminder_evening',
        REMINDER_ROSARY: 'ora_reminder_rosary',
    },

    // Cached settings
    state: {
        locale: 'pt',
        userName: '',
        prayerLang: 'pt',
        reminders: {
            carlo: true,
            angelus: true,
            mercy: true,
            midday: true,
            evening: true,
            rosary: true,
        },
    },

    elements: {},

    init: async function() {
        await this.loadSettings();
        this.cacheDOM();
        this.bindEvents();
        this.loadSettingsUI();
        console.log('[Ora] Settings System initialized');
    },

    loadSettings: async function() {
        this.state.locale = await AsyncStorage.get(this.KEYS.LOCALE, 'pt');
        this.state.userName = await AsyncStorage.get(this.KEYS.USER_NAME, '');
        this.state.prayerLang = await AsyncStorage.get(this.KEYS.PRAYER_LANG, 'pt');
        this.state.reminders.carlo = await AsyncStorage.get(this.KEYS.REMINDER_CARLO, true);
        this.state.reminders.angelus = await AsyncStorage.get(this.KEYS.REMINDER_ANGELUS, true);
        this.state.reminders.mercy = await AsyncStorage.get(this.KEYS.REMINDER_MERCY, true);
        this.state.reminders.midday = await AsyncStorage.get(this.KEYS.REMINDER_MIDDAY, true);
        this.state.reminders.evening = await AsyncStorage.get(this.KEYS.REMINDER_EVENING, true);
        this.state.reminders.rosary = await AsyncStorage.get(this.KEYS.REMINDER_ROSARY, true);
    },

    cacheDOM: function() {
        this.elements.btnSettings = document.getElementById('btn-settings');
        this.elements.modal = document.getElementById('settings-modal');
        this.elements.closeBtn = document.getElementById('close-settings-btn');
        this.elements.localeSelect = document.getElementById('settings-locale');
        this.elements.userNameInput = document.getElementById('settings-user-name');
        this.elements.prayerLangBtns = document.querySelectorAll('#settings-modal [data-prayer-lang]');
        this.elements.toggleCarlo = document.getElementById('toggle-reminder-carlo');
        this.elements.toggleAngelus = document.getElementById('toggle-reminder-angelus');
        this.elements.toggleMercy = document.getElementById('toggle-reminder-mercy');
        this.elements.toggleMidday = document.getElementById('toggle-reminder-midday');
        this.elements.toggleEvening = document.getElementById('toggle-reminder-evening');
        this.elements.toggleRosary = document.getElementById('toggle-reminder-rosary');
    },

    bindEvents: function() {
        // Open/close modal
        if (this.elements.btnSettings) {
            this.elements.btnSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(this.elements.modal)) {
                    animateModal(this.elements.modal, true);
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

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.elements.modal && this.elements.btnSettings &&
                isModalVisible(this.elements.modal) &&
                !this.elements.modal.contains(e.target) &&
                !this.elements.btnSettings.contains(e.target)) {
                animateModal(this.elements.modal, false);
            }
        });

        // Locale change
        if (this.elements.localeSelect) {
            this.elements.localeSelect.addEventListener('change', async (e) => {
                const newLocale = e.target.value;
                await this.saveSetting(this.KEYS.LOCALE, newLocale);
                this.state.locale = newLocale;

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
                window.dispatchEvent(new CustomEvent('ora:locale-changed', { detail: { locale: newLocale } }));
                console.log(`[Ora] Locale changed to: ${newLocale}`);
            });
        }

        // User name (debounced)
        if (this.elements.userNameInput) {
            const saveNameDebounced = debounce(async (value) => {
                await this.saveSetting(this.KEYS.USER_NAME, value);
                this.state.userName = value;
                this.dispatchChanged('userName', value);
            }, 500);
            this.elements.userNameInput.addEventListener('input', (e) => {
                saveNameDebounced(e.target.value.trim());
            });
        }

        // Prayer language toggle
        this.elements.prayerLangBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const lang = e.target.dataset.prayerLang;
                await this.saveSetting(this.KEYS.PRAYER_LANG, lang);
                this.state.prayerLang = lang;
                this.elements.prayerLangBtns.forEach(b => b.classList.toggle('active', b.dataset.prayerLang === lang));
                this.dispatchChanged('prayerLang', lang);
            });
        });

        // Reminder toggles
        const toggleMap = {
            toggleCarlo: { key: this.KEYS.REMINDER_CARLO, prop: 'carlo' },
            toggleAngelus: { key: this.KEYS.REMINDER_ANGELUS, prop: 'angelus' },
            toggleMercy: { key: this.KEYS.REMINDER_MERCY, prop: 'mercy' },
            toggleMidday: { key: this.KEYS.REMINDER_MIDDAY, prop: 'midday' },
            toggleEvening: { key: this.KEYS.REMINDER_EVENING, prop: 'evening' },
            toggleRosary: { key: this.KEYS.REMINDER_ROSARY, prop: 'rosary' },
        };

        for (const [elName, config] of Object.entries(toggleMap)) {
            const el = this.elements[elName];
            if (el) {
                el.addEventListener('change', async (e) => {
                    const value = e.target.checked;
                    await this.saveSetting(config.key, value);
                    this.state.reminders[config.prop] = value;
                    this.dispatchChanged('reminder_' + config.prop, value);
                });
            }
        }
    },

    loadSettingsUI: function() {
        if (this.elements.localeSelect) this.elements.localeSelect.value = this.state.locale;
        if (this.elements.userNameInput) this.elements.userNameInput.value = this.state.userName;

        this.elements.prayerLangBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.prayerLang === this.state.prayerLang);
        });

        if (this.elements.toggleCarlo) this.elements.toggleCarlo.checked = this.state.reminders.carlo;
        if (this.elements.toggleAngelus) this.elements.toggleAngelus.checked = this.state.reminders.angelus;
        if (this.elements.toggleMercy) this.elements.toggleMercy.checked = this.state.reminders.mercy;
        if (this.elements.toggleMidday) this.elements.toggleMidday.checked = this.state.reminders.midday;
        if (this.elements.toggleEvening) this.elements.toggleEvening.checked = this.state.reminders.evening;
        if (this.elements.toggleRosary) this.elements.toggleRosary.checked = this.state.reminders.rosary;
    },

    saveSetting: async function(key, value) {
        await AsyncStorage.set(key, value);
    },

    dispatchChanged: function(key, value) {
        window.dispatchEvent(new CustomEvent('ora:settings-changed', { detail: { key, value } }));
    },

    // Public API
    isReminderEnabled: function(name) {
        return this.state.reminders[name] !== false;
    },

    getUserName: function() {
        return this.state.userName || '';
    },

    getPrayerLang: function() {
        return this.state.prayerLang || 'pt';
    },
};

window.SettingsSystem = SettingsSystem;
