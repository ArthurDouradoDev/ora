const SettingsSystem = {
    sections: [
        ['aparencia', 'appearance', 'ph-paint-brush'],
        ['oracao', 'prayer', 'ph-hands-praying'],
        ['foco', 'focus', 'ph-timer'],
        ['lembretes', 'reminders', 'ph-bell'],
        ['dados', 'data', 'ph-database']
    ],
    state: {},
    controls: new Map(),
    localeRequest: 0,
    dictionaries: new Map(),

    async init() {
        const snapshot = await chrome.storage.local.get([...SettingsCore.KEYS, SettingsCore.READER_KEY, 'liturgy_gospel_cache']);
        for (const key of SettingsCore.KEYS) this.state[key] = SettingsCore.sanitize(key, snapshot[key]);
        const prayerReady = this.applyPrayerLocale(this.getPrayerLang(), false);
        this.reader = ReaderCore.preferences(snapshot[SettingsCore.READER_KEY] || {});
        this.cache = snapshot.liturgy_gospel_cache;
        this.notificationsAllowed = await this.hasNotificationPermission();
        this.root = document.getElementById('view-configuracoes');
        this.build();
        this.applyMotion();
        this.renderRoute(RouterSystem.current());
        window.addEventListener('ora:route', event => this.renderRoute(event.detail));
        window.addEventListener('ora:pomodoro', () => this.updateControls());
        window.addEventListener('ora:locale-changed', () => {
            this.updateControls();
            this.renderOffline();
            for (const status of this.root.querySelectorAll('[data-settings-message]')) {
                status.textContent = t(status.dataset.settingsMessage);
            }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') this.receive(changes);
        });
        const refreshPermission = async () => {
            this.notificationsAllowed = await this.hasNotificationPermission();
            this.updateControls();
        };
        chrome.permissions?.onAdded?.addListener(refreshPermission);
        chrome.permissions?.onRemoved?.addListener(refreshPermission);
        await prayerReady;
        if (this.prayerCopy?.locale !== this.getPrayerLang()) await this.applyPrayerLocale(this.getPrayerLang(), false);
        if (this.state.ora_locale !== getLocale()) await this.applyLocale(this.state.ora_locale);
    },

    loadDictionary(locale) {
        if (!this.dictionaries.has(locale)) {
            this.dictionaries.set(locale, loadJSON('data/i18n/' + locale + '.json').catch(error => {
                this.dictionaries.delete(locale);
                throw error;
            }));
        }
        return this.dictionaries.get(locale);
    },

    async applyLocale(locale, announce = true) {
        const request = ++this.localeRequest;
        const [strings, fallback] = await Promise.all([
            this.loadDictionary(locale),
            locale === 'pt' ? null : this.loadDictionary('pt')
        ]);
        if (request !== this.localeRequest) return;
        window._i18nLocale = locale;
        window._i18nStrings = strings;
        window._i18nFallback = fallback || strings;
        document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale;
        applyI18n();
        if (announce) window.dispatchEvent(new CustomEvent('ora:locale-changed', { detail: { locale } }));
    },

    async applyPrayerLocale(locale, announce = true) {
        const dictionary = await this.loadDictionary(locale === 'la' ? 'pt' : locale);
        const current = locale === this.getPrayerLang();
        if (current || !this.prayerCopy) this.prayerCopy = { locale, dictionary };
        if (announce && current) this.dispatch('prayerLang', locale);
    },

    prayerText(group, key) {
        const { locale, dictionary } = this.prayerCopy;
        return { lang: locale, text: dictionary[group][locale === 'la' ? key + '_la' : key] };
    },

    dispatch(key, value) {
        window.dispatchEvent(new CustomEvent('ora:settings-changed', { detail: { key, value } }));
    },

    async set(key, value) {
        if (!await AsyncStorage.set(key, SettingsCore.sanitize(key, value))) throw new Error('Preference was not saved');
    },

    setReader(changes) {
        const key = SettingsCore.READER_KEY;
        return navigator.locks.request(key, async () => {
            const current = (await chrome.storage.local.get(key))[key] || {};
            const next = ReaderCore.preferences({ ...current, ...changes });
            await chrome.storage.local.set({ [key]: next });
            return next;
        });
    },

    receive(changes) {
        for (const key of SettingsCore.KEYS) {
            if (!changes[key]) continue;
            const value = SettingsCore.sanitize(key, changes[key].newValue);
            if (this.state[key] === value) continue;
            this.state[key] = value;
            if (key === 'ora_locale') this.applyLocale(value).catch(error => this.report(error));
            if (key === 'ora_reduce_motion') this.applyMotion();
            if (key === 'ora_prayer_lang') this.applyPrayerLocale(value).catch(error => this.report(error));
            else this.dispatch(key === 'ora_user_name' ? 'userName' : key, value);
        }
        if (changes[SettingsCore.READER_KEY]) {
            this.reader = ReaderCore.preferences(changes[SettingsCore.READER_KEY].newValue || {});
        }
        if (changes.liturgy_gospel_cache) {
            this.cache = changes.liturgy_gospel_cache.newValue;
            this.renderOffline();
        }
        this.updateControls();
    },

    applyMotion() {
        document.documentElement.dataset.motion = this.state.ora_reduce_motion ? 'reduce' : '';
    },

    isReminderEnabled(name) { return this.state['ora_reminder_' + name] !== false; },
    // `notifications` is optional (it is not asked on install, so updating
    // from 1.1.5 never disables the extension); the switch asks for it.
    async hasNotificationPermission() {
        try { return await chrome.permissions.contains({ permissions: ['notifications'] }); }
        catch (e) { return false; }
    },

    async setNotificationPermission(allowed) {
        if (allowed) {
            // Called synchronously from the switch's change event (user gesture).
            this.notificationsAllowed = await chrome.permissions.request({ permissions: ['notifications'] });
            if (!this.notificationsAllowed) return { message: 'preferences.browser_notifications_denied' };
        } else {
            await chrome.permissions.remove({ permissions: ['notifications'] });
            this.notificationsAllowed = false;
        }
    },

    getUserName() { return this.state.ora_user_name || ''; },
    getPrayerLang() { return this.state.ora_prayer_lang || 'pt'; },
    get(key) { return this.state[key]; },

    build() {
        const nav = document.getElementById('settings-nav');
        const panels = document.getElementById('settings-panels');
        const groups = {};
        for (const [route, name, icon] of this.sections) {
            const link = document.createElement('a');
            link.href = '#configuracoes/' + route;
            link.dataset.settingsSection = route;
            link.innerHTML = '<i class="ph ' + icon + '" aria-hidden="true"></i><span data-i18n="preferences.' + name + '"></span>';
            link.addEventListener('click', event => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                RouterSystem.navigate('configuracoes/' + route);
            });
            nav.append(link);
            const panel = document.createElement('section');
            panel.dataset.settingsPanel = route;
            panel.innerHTML = '<h2 tabindex="-1" id="settings-' + route + '-title" data-i18n="preferences.' + name + '"></h2>';
            panel.setAttribute('aria-labelledby', 'settings-' + route + '-title');
            panel.hidden = true;
            groups[name] = panel;
            panels.append(panel);
        }

        const options = (list, prefix) => list.map(value => [value, prefix + value]);
        const reader = (part, label, values, hint) => this.addControl(groups.appearance, {
            id: 'settings-reader-' + part, label, hint, options: values, segmented: true, legacy: part === 'size',
            read: () => this.reader[part],
            write: async value => { await this.setReader({ [part]: value }); }
        });
        reader('appearance', 'preferences.reader', [['escuro', 'pray.dark'], ['papel', 'pray.paper']], 'preferences.reader_hint');
        reader('size', 'preferences.reader_size', options(SettingsCore.READER_SIZES, 'preferences.size_'), 'preferences.reader_size_hint');
        this.addPreference(groups.appearance, 'ora_reduce_motion', 'preferences.motion', { hint: 'preferences.motion_hint' });
        this.addPreference(groups.appearance, 'ora_locale', 'preferences.interface_language', { id: 'settings-locale', options: options(SettingsCore.LOCALES, 'pray.') });
        this.addPreference(groups.appearance, 'ora_user_name', 'settings.name_label', { id: 'settings-user-name', type: 'text' });

        this.addPreference(groups.prayer, 'ora_prayer_lang', 'preferences.prayer_language', { options: options(SettingsCore.PRAYER_LANGS, 'pray.') });
        this.addPreference(groups.prayer, 'ora_show_saint', 'preferences.saint');
        this.addPreference(groups.prayer, 'ora_rosary_weekday', 'preferences.weekday', { hint: 'preferences.weekday_hint' });
        this.addPreference(groups.prayer, 'ora_rosary_text_mode', 'pray.prayer_text', { options: options(['full', 'name'], 'pray.'), segmented: true });

        const minutes = list => list.map(value => [value, 'preferences.minutes']);
        this.addTimer(groups.focus, 'focus', 'preferences.default_duration', { options: minutes(SettingsCore.FOCUS_DURATIONS), segmented: true, legacy: true });
        this.addTimer(groups.focus, 'pause', 'preferences.short_break', { options: minutes(SettingsCore.SHORT_BREAKS), segmented: true, legacy: true });
        this.addTimer(groups.focus, 'longPause', 'preferences.long_break', { type: 'number', limits: PomodoroCore.LIMITS.longPause, hint: 'preferences.long_break_hint' });
        this.addPreference(groups.focus, 'ora_focus_protect', 'preferences.focus_protection', { hint: 'preferences.focus_protection_hint' });
        this.addTimer(groups.focus, 'wakeLock', 'preferences.wake_lock', { hint: 'preferences.wake_lock_hint' });

        this.addControl(groups.reminders, {
            id: 'settings-browser-notifications', label: 'preferences.browser_notifications', hint: 'preferences.browser_notifications_hint',
            read: () => this.notificationsAllowed === true, write: value => this.setNotificationPermission(value)
        });
        this.addPreference(groups.reminders, 'ora_reminder_angelus', 'settings.reminder_angelus');
        this.addPreference(groups.reminders, 'ora_reminder_mercy', 'pray.mercy');
        this.addPreference(groups.reminders, 'ora_reminder_evening', 'preferences.close_day');
        this.addPreference(groups.reminders, 'ora_notification_sound', 'preferences.notification_sound');

        // Preferences from the previous screen remain available in their group.
        for (const [group, add] of [[groups.focus, panel => {
            this.addTimer(panel, 'sound', 'focus.setting_sound');
            this.addTimer(panel, 'autoNext', 'focus.setting_auto_next');
            this.addTimer(panel, 'continuousAlarm', 'focus.setting_continuous_alarm');
        }], [groups.reminders, panel => {
            for (const name of ['carlo', 'morning', 'midday', 'screentime']) {
                this.addPreference(panel, 'ora_reminder_' + name, 'settings.reminder_' + name);
            }
        }]]) {
            const details = document.createElement('details');
            details.innerHTML = '<summary data-i18n="preferences.more"></summary>';
            add(details);
            group.append(details);
        }

        this.addAction(groups.data, 'export', 'preferences.export', 'preferences.export_hint', () => this.exportData());
        this.addAction(groups.data, 'offline', 'preferences.offline', null, async () => {
            const result = await chrome.runtime.sendMessage({ type: 'liturgy:refresh', force: true });
            if (!result?.success) throw new Error(result?.error || 'Liturgy refresh failed');
            this.cache = (await chrome.storage.local.get('liturgy_gospel_cache')).liturgy_gospel_cache;
            this.renderOffline();
            const info = SettingsCore.offlineInfo(this.cache);
            if (result.updatedPortuguese === 0) return 'preferences.offline_failed';
            return result.updatedPortuguese === info.total ? 'preferences.updated' : 'preferences.offline_partial';
        });
        this.addAction(groups.data, 'delete', 'preferences.delete', 'preferences.delete_hint', () => {
            document.getElementById('settings-delete-status').textContent = '';
            DialogSystem.open('settings-delete-dialog');
        }, true);
        this.addAction(groups.data, 'replay', 'onboarding.settings_replay', null, () => OnboardingSystem.open('full'));
        const confirm = document.getElementById('settings-delete-confirm');
        confirm.addEventListener('click', () => this.perform(confirm, document.getElementById('settings-delete-status'), async () => {
            const snapshot = await chrome.storage.local.get(['ora_rituals', 'ora_ritual_draft', 'ora_exam_logs']);
            await chrome.storage.local.set({ ...SettingsCore.clearReflections(snapshot), ora_reflections_cleared_at: Date.now() });
            DialogSystem.close('settings-delete-dialog');
            const result = document.getElementById('settings-delete-result');
            result.dataset.settingsMessage = 'preferences.deleted';
            result.textContent = t(result.dataset.settingsMessage);
        }));

        applyI18n();
        this.updateControls();
        this.renderOffline();
    },

    renderRoute(route) {
        const previous = this.activePanel;
        if (route?.view !== 'configuracoes') {
            previous?._oraMotion?.['settings-section']?.cancel();
            this.activePanel = null;
            return;
        }
        const section = this.sections.some(([name]) => name === route.path[0]) ? route.path[0] : 'aparencia';
        const active = this.root.querySelector(`[data-settings-panel="${section}"]`);
        for (const link of this.root.querySelectorAll('[data-settings-section]')) {
            if (link.dataset.settingsSection === section) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        for (const panel of this.root.querySelectorAll('[data-settings-panel]')) {
            panel.hidden = panel !== active;
        }
        this.activePanel = active;
        const switched = previous && previous !== active;
        if (switched) {
            previous._oraMotion?.['settings-section']?.cancel();
            window.Motion?.play(active, [
                { opacity: 0, transform: 'translateY(6px)' },
                { opacity: 1, transform: 'none' }
            ], { duration: 200, channel: 'settings-section' });
        }
        if (route.path.length || switched) active.firstElementChild.focus({ preventScroll: true });
        this.renderOffline();
    },

    row(panel, id, label, hint, labelControl = true) {
        const row = document.createElement('div');
        row.className = 'preference-row';
        const tag = labelControl ? 'label' : 'span';
        const target = labelControl ? ' for="' + id + '"' : '';
        row.innerHTML = '<div class="preference-copy"><' + tag + ' id="' + id + '-label"' + target + ' data-i18n="' + label +
            '"></' + tag + '><p class="meta" id="' + id + '-hint"' + (hint ? ' data-i18n="' + hint + '"' : '') +
            '></p><p class="preference-status meta" id="' + id + '-result" role="status"></p></div>';
        panel.append(row);
        return row;
    },

    addPreference(panel, key, label, config = {}) {
        this.addControl(panel, {
            id: 'settings-' + key.slice(4).replaceAll('_', '-'), label, ...config,
            read: () => this.state[key], write: value => this.set(key, value)
        });
    },

    addTimer(panel, key, label, config = {}) {
        this.addControl(panel, {
            id: 'setting-' + key, label, ...config,
            read: () => FocusSystem.settings[key],
            write: async value => {
                const state = await FocusSystem.sendCommand('pomodoro:updateSettings', {
                    settings: { [key]: typeof value === 'boolean' ? value : SettingsCore.duration(key, value) }
                });
                if (!state) throw new Error('Focus settings were not saved');
            }
        });
    },

    addControl(panel, { id, label, hint, options, limits, type = 'checkbox', read, write, legacy, segmented }) {
        const row = this.row(panel, id, label, hint, !segmented);
        if (segmented) {
            this.addSegments(row, id, options, legacy, read, write);
            return;
        }
        const control = document.createElement(options ? 'select' : 'input');
        control.id = id;
        control.setAttribute('aria-labelledby', id + '-label');
        control.setAttribute('aria-describedby', id + '-hint');
        if (options) {
            for (const [value, key] of options) {
                const option = new Option('', value);
                option.dataset.i18n = key;
                control.append(option);
            }
            control.className = 'input';
        } else {
            control.type = type;
            if (type === 'text') { control.maxLength = 30; control.autocomplete = 'given-name'; }
            if (limits) { [control.min, control.max] = limits; control.step = '1'; }
            if (type !== 'checkbox') control.className = 'input';
        }
        if (!options && type === 'checkbox') {
            control.setAttribute('role', 'switch');
            const toggle = document.createElement('label');
            toggle.className = 'toggle preference-toggle';
            toggle.innerHTML = '<span class="track" aria-hidden="true"></span>';
            toggle.prepend(control);
            row.append(toggle);
        } else row.append(control);
        const status = row.querySelector('[role="status"]');
        if (type === 'text' && !options) {
            this.bindName(control, status, read, write);
            return;
        }
        this.controls.set(control, () => {
            if (control.type === 'checkbox') control.checked = read() === true;
            else control.value = read();
        });
        control.addEventListener('change', () => this.perform(control, status,
            async () => (await write(control.type === 'checkbox' ? control.checked : control.value))?.message));
    },

    bindName(control, status, read, write) {
        let draft, pending = Promise.resolve();
        this.controls.set(control, () => {
            if (draft !== undefined || document.activeElement === control) return;
            control.value = read();
            window.LeaveGuard?.acceptField(control);
        });
        const save = debounce(() => {
            const value = draft;
            pending = pending.then(() => this.perform(control, status, async () => {
                await write(value);
                if (draft !== value) return;
                draft = undefined;
                control.value = SettingsCore.sanitize('ora_user_name', value);
            }));
        }, 500);
        control.addEventListener('input', () => {
            draft = control.value;
            save();
        });
        control.addEventListener('blur', () => this.controls.get(control)());
    },

    addSegments(row, id, options, legacy, read, write) {
        const group = document.createElement('div');
        group.id = id;
        group.className = 'seg';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', id + '-label');
        group.setAttribute('aria-describedby', id + '-hint');
        row.append(group);
        const status = row.querySelector('[role="status"]');
        const add = (value, key) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.value = value;
            if (key && key !== 'preferences.minutes') {
                button.dataset.i18n = key;
                button.textContent = t(key);
            }
            group.append(button);
            button.addEventListener('click', () => this.perform(group, status, () => write(value)));
            return button;
        };
        const entries = options.map(([value, key]) => ({ value, key, button: add(value, key) }));
        let oldButton;
        this.controls.set(group, () => {
            const current = read();
            for (const { value, key, button } of entries) {
                button.setAttribute('aria-pressed', String(value === current));
                if (key === 'preferences.minutes') button.textContent = t(key, { n: value });
            }
            if (legacy && !entries.some(({ value }) => value === current)) {
                oldButton ??= add(current);
                oldButton.dataset.value = current;
                oldButton.setAttribute('aria-pressed', 'true');
                oldButton.setAttribute('aria-disabled', 'true');
                oldButton.disabled = true;
                oldButton.textContent = t(id === 'settings-reader-size' ? 'preferences.pixels' : 'preferences.minutes', { n: current });
            } else if (oldButton) {
                oldButton.remove();
                oldButton = null;
            }
        });
    },

    updateControls() {
        for (const update of this.controls.values()) update();
    },

    addAction(panel, name, label, hint, action, danger = false) {
        const id = 'settings-' + name;
        const row = this.row(panel, id, label, hint, false);
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'btn ' + (danger ? 'btn-danger' : 'btn-aux');
        button.dataset.i18n = 'preferences.action_' + name;
        row.append(button);
        button.addEventListener('click', () => {
            if (danger || name === 'replay') { action(); return; }
            this.perform(button, row.querySelector('[role="status"]'), action);
        });
    },

    async perform(control, status, action) {
        if (control.getAttribute('aria-busy') === 'true') return;
        clearTimeout(status.savedTimer);
        control.setAttribute('aria-busy', 'true');
        status.dataset.settingsMessage = 'pray.saving';
        status.textContent = t(status.dataset.settingsMessage);
        status.classList.remove('is-error');
        try {
            const message = await action();
            status.dataset.settingsMessage = message || 'preferences.saved';
            if (!message) {
                status.savedTimer = setTimeout(() => {
                    if (status.dataset.settingsMessage !== 'preferences.saved') return;
                    delete status.dataset.settingsMessage;
                    status.textContent = '';
                }, 2200);
            }
            status.textContent = t(status.dataset.settingsMessage);
        } catch (error) {
            this.report(error);
            status.dataset.settingsMessage = 'preferences.save_error';
            status.textContent = t(status.dataset.settingsMessage);
            status.classList.add('is-error');
        } finally {
            control.removeAttribute('aria-busy');
            this.updateControls();
        }
    },

    report(error) { console.error('[Ora Settings]', error); },

    renderOffline() {
        const { available, total, bytes } = SettingsCore.offlineInfo(this.cache);
        const unit = bytes >= 1048576 ? 'megabyte' : 'kilobyte';
        const size = new Intl.NumberFormat(getLocale(), { style: 'unit', unit, maximumFractionDigits: 1 })
            .format(bytes / (unit === 'megabyte' ? 1048576 : 1024));
        document.getElementById('settings-offline-hint').textContent = t('preferences.offline_info', { available, total, size });
    },

    async exportData() {
        const now = new Date();
        const data = SettingsCore.exportData(await chrome.storage.local.get(null), now);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ora-' + LiturgyCore.dateKey(now) + '.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return 'preferences.exported';
    }
};

window.SettingsSystem = SettingsSystem;
