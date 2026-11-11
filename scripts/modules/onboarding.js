const OnboardingSystem = {
    busy: false,
    reminderNames: ['angelus', 'mercy', 'evening'],

    async init() {
        this.root = document.getElementById('onboarding-dialog');
        const get = id => document.getElementById('intro-' + id);
        this.controls = Object.fromEntries(['locale', 'name', 'sites', 'profiles', 'reminders', 'progress', 'status', 'skip', 'back', 'next', 'title']
            .map(id => [id, get(id)]));
        this.steps = [...this.root.querySelectorAll('[data-intro-step]')];
        this.buildOptions();
        this.controls.locale.addEventListener('change', () => this.run(async () => {
            await SettingsSystem.set('ora_locale', this.controls.locale.value);
        }));
        this.controls.name.addEventListener('keydown', event => {
            if (event.key === 'Enter') this.controls.next.click();
        });
        this.controls.back.addEventListener('click', () => { if (!this.busy) this.showStep(this.step - 1); });
        this.controls.next.addEventListener('click', () => this.run(async () => {
            if (this.mode === 'update' || this.step === this.steps.length - 1) {
                await this.finish();
                return;
            }
            if (this.step === 2 && !this.selectedProfiles()) return;
            this.showStep(this.step + 1);
        }));
        this.controls.skip.addEventListener('click', () => this.run(() => this.finish(true)));
        window.addEventListener('ora:locale-changed', () => {
            if (!DialogSystem.isOpen(this.root)) return;
            this.controls.locale.value = getLocale();
            this.renderProgress();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[OnboardingCore.DONE_KEY]?.newValue && !this.busy && !this.replaying) {
                DialogSystem.close(this.root);
            }
        });
        const mode = OnboardingCore.mode(await chrome.storage.local.get(null));
        if (mode) this.open(mode, false);
    },

    buildOptions() {
        const add = (container, id, label, description) => {
            const item = document.createElement('label');
            item.className = 'toggle';
            item.innerHTML = '<input type="checkbox" role="switch"><span class="track" aria-hidden="true"></span><span><b></b><small class="meta"></small></span>';
            item.firstElementChild.value = id;
            item.querySelector('b').dataset.i18n = label;
            item.querySelector('small').textContent = description || '';
            container.append(item);
        };
        for (const profile of BlockerCore.SUGGESTED_PROFILES) {
            add(this.controls.profiles, profile.id, 'introduction.profile_' + profile.id.replaceAll('-', '_'), profile.sites.join(', '));
        }
        for (const [i, name] of this.reminderNames.entries()) {
            add(this.controls.reminders, name, ['settings.reminder_angelus', 'pray.mercy', 'preferences.close_day'][i]);
        }
        // Optional `notifications` permission (not asked on install, so the
        // update from 1.1.5 never disables Ora): asked right on the switch,
        // in the reminders step and in the update screen.
        for (const container of [this.controls.reminders, document.getElementById('intro-update-options')]) {
            if (!container) continue;
            add(container, 'notifications', 'preferences.browser_notifications');
            const input = container.querySelector('input[value="notifications"]');
            input.closest('label').querySelector('small').dataset.i18n = 'preferences.browser_notifications_hint';
            input.addEventListener('change', async () => {
                const result = await SettingsSystem.setNotificationPermission(input.checked).catch(() => null);
                for (const item of this.root.querySelectorAll('input[value="notifications"]')) item.checked = SettingsSystem.notificationsAllowed === true;
                if (result?.message) this.controls.status.textContent = t(result.message);
            });
        }
        applyI18n();
    },

    open(mode, replaying = true) {
        if (!this.root || DialogSystem.isOpen(this.root)) return;
        this.mode = mode;
        this.replaying = replaying;
        this.controls.locale.value = getLocale();
        this.controls.name.value = SettingsSystem.getUserName();
        this.controls.sites.value = '';
        for (const input of this.controls.profiles.querySelectorAll('input')) input.checked = false;
        for (const input of this.root.querySelectorAll('input[value="notifications"]')) input.checked = SettingsSystem.notificationsAllowed === true;
        for (const input of this.controls.reminders.querySelectorAll('input')) {
            if (input.value !== 'notifications') input.checked = SettingsSystem.isReminderEnabled(input.value);
            input.dataset.initial = String(input.checked);
        }
        DialogSystem.open(this.root, { onClose: () => {
            this.replaying = false;
        } });
        this.showStep(0);
    },

    showStep(step) {
        this.step = step;
        this.controls.status.textContent = '';
        for (const panel of this.root.querySelectorAll('[data-intro-step], [data-intro-update]')) {
            panel.hidden = this.mode === 'update' ? !panel.hasAttribute('data-intro-update') : panel !== this.steps[step];
        }
        this.controls.back.hidden = this.mode === 'update' || step === 0;
        if (step === 2) this.setProfileAvailability(Blocker.isLocked());
        this.renderProgress();
        this.root.querySelector('.intro-step:not([hidden]) h2').focus({ preventScroll: true });
    },

    renderProgress() {
        this.controls.title.textContent = t(this.mode === 'update' ? 'introduction.update_label' : 'introduction.label');
        this.controls.progress.textContent = this.mode === 'update' ? '' :
            t('pray.stage', { n: this.step + 1, total: this.steps.length });
        const key = this.mode === 'update' || this.step === this.steps.length - 1 ? 'btn_finish' : 'btn_next';
        this.controls.next.textContent = t('onboarding.' + key);
    },

    setProfileAvailability(locked) {
        document.getElementById('intro-protection-locked').hidden = !locked;
        this.controls.sites.disabled = locked;
        for (const input of this.controls.profiles.querySelectorAll('input')) input.disabled = locked;
    },

    selectedProfiles() {
        if (this.controls.sites.disabled) return [];
        const inputs = [...this.controls.profiles.querySelectorAll('input:checked')];
        const profiles = BlockerCore.SUGGESTED_PROFILES.filter(profile => inputs.some(input => input.value === profile.id));
        const raw = this.controls.sites.value.trim().split(/[\s,;]+/).filter(Boolean);
        const sites = raw.map(value => BlockerCore.extractDomain(value));
        if (sites.some(site => !site)) {
            this.controls.status.textContent = t('introduction.invalid_sites');
            return null;
        }
        if (sites.length) profiles.push({ id: 'primeiros-sites', name: t('introduction.custom_profile'), sites, rules: { duringFocus: true } });
        return profiles;
    },

    async finish(skipped = false) {
        const full = this.mode === 'full';
        const changes = {};
        if (full) {
            const name = SettingsCore.sanitize('ora_user_name', this.controls.name.value);
            if (name !== SettingsSystem.getUserName()) changes.ora_user_name = name;
        }
        if (full && !skipped) {
            const selected = this.selectedProfiles();
            if (!selected) { this.showStep(2); this.selectedProfiles(); return; }
            if (selected.length) {
                const stored = (await chrome.storage.local.get('blocker_config')).blocker_config;
                const config = Blocker.normalizeConfig(stored || Blocker.config);
                if (config.lock.enabled && !Blocker.unlockedInSession) {
                    this.showStep(2);
                    this.setProfileAvailability(true);
                    return;
                }
                const pristine = !this.replaying && JSON.stringify(config) === JSON.stringify(Blocker.defaultConfig());
                const profiles = config.profiles.map(profile => {
                    const choice = selected.find(candidate => candidate.id === profile.id);
                    if (!choice) return pristine ? { ...profile, enabled: false } : profile;
                    const sites = profile.id === 'primeiros-sites'
                        ? [...new Set([...profile.sites, ...choice.sites])]
                        : profile.sites;
                    return { ...profile, enabled: true, sites };
                });
                profiles.push(...selected.filter(profile => !config.profiles.some(existing => existing.id === profile.id)));
                if (!await Blocker.applyAndSaveConfig({ ...config, profiles }, { source: 'list' })) {
                    throw new Error('Protection profiles were not saved');
                }
            }
            for (const input of this.controls.reminders.querySelectorAll('input')) {
                if (input.value === 'notifications') continue;
                if (String(input.checked) !== input.dataset.initial) changes['ora_reminder_' + input.value] = input.checked;
            }
        }
        await chrome.storage.local.set({ ...changes, [OnboardingCore.DONE_KEY]: true, ora_onboarding_done: true });
        DialogSystem.close(this.root);
    },

    async run(action) {
        if (this.busy) return;
        this.busy = true;
        this.controls.status.textContent = '';
        try { await action(); }
        catch (error) {
            console.error('[Ora Onboarding]', error);
            this.controls.locale.value = getLocale();
            this.controls.status.textContent = t('preferences.save_error');
        } finally { this.busy = false; }
    }
};

window.OnboardingSystem = OnboardingSystem;
