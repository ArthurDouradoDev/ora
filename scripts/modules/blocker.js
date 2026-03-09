
// ============================================================
// SITE BLOCKER — Advanced Tabbed Blocker
// ============================================================

// Known domain aliases — when a user blocks one domain, all its aliases
// are also blocked. This handles sites that redirect to different domains
// (e.g. gmail.com → mail.google.com, twitter.com → x.com).
const DOMAIN_ALIASES = {
    'gmail.com':          ['mail.google.com'],
    'mail.google.com':    ['gmail.com'],
    'twitter.com':        ['x.com'],
    'x.com':              ['twitter.com'],
    'facebook.com':       ['fb.com', 'www.facebook.com'],
    'fb.com':             ['facebook.com'],
    'instagram.com':      ['www.instagram.com'],
    'reddit.com':         ['old.reddit.com', 'www.reddit.com', 'new.reddit.com'],
    'old.reddit.com':     ['reddit.com'],
};

const Blocker = {
    state: {
        enabled: false,
        sites: [], // Array of site objects
        lock: { enabled: false, verseIndex: 0 },
        verses: [],
        updateInProgress: false,
        lockUnlocked: false, // true after user types verse this session
        activeTab: 'sites'
    },

    // ── Lifecycle ──────────────────────────────────────

    async init() {
        await this.loadVerses();
        await this.loadState();
        this.cacheDOM();
        this.setupTabListeners();
        this.setupSitesListeners();
        this.setupLockListeners();
        this.renderCurrentTab();
        this.updateSwitchUI();
        // Re-apply DNR rules on init — rules are cleared on extension reload/reinstall
        // but storage state persists, so we must restore them here.
        if (this.state.enabled) {
            await this.updateRules();
        }
    },

    async loadVerses() {
        try {
            this.state.verses = await loadJSON('data/verses.json');
        } catch (e) {
            console.error('[Blocker] Failed to load verses:', e);
            this.state.verses = [{ text: { pt: "Deus é amor.", en: "God is love.", es: "Dios es amor." }, ref: "1Jo 4,8" }];
        }
    },

    async loadState() {
        const data = await chrome.storage.local.get(['blocker_config', 'blocker_enabled', 'blocker_sites']);

        if (data.blocker_config) {
            const config = data.blocker_config;
            this.state.enabled = config.enabled || false;
            this.state.lock = config.lock || { enabled: false, verseIndex: 0 };

            let needsMigration = false;
            this.state.sites = (config.sites || []).map(site => {
                const s = { ...site };
                // Migrate: add enabled flag to accessLimit if missing
                if (!s.accessLimit || !('enabled' in s.accessLimit)) {
                    s.accessLimit = {
                        enabled: (s.accessLimit?.count || 0) > 0,
                        count: s.accessLimit?.count || 5,
                        period: s.accessLimit?.period || 'day'
                    };
                    needsMigration = true;
                }
                // Migrate: timeLimit → scheduleLimit
                if (!s.scheduleLimit) {
                    s.scheduleLimit = { 
                        enabled: false, 
                        schedules: [{ fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 }] 
                    };
                    delete s.timeLimit;
                    delete s.todayTimeSpent;
                    needsMigration = true;
                }
                
                // Migrate: single schedule to schedules array
                if (s.scheduleLimit && !Array.isArray(s.scheduleLimit.schedules)) {
                    s.scheduleLimit.schedules = [{
                        fromHour: s.scheduleLimit.fromHour ?? 22,
                        fromMinute: s.scheduleLimit.fromMinute ?? 0,
                        toHour: s.scheduleLimit.toHour ?? 8,
                        toMinute: s.scheduleLimit.toMinute ?? 0
                    }];
                    delete s.scheduleLimit.fromHour;
                    delete s.scheduleLimit.fromMinute;
                    delete s.scheduleLimit.toHour;
                    delete s.scheduleLimit.toMinute;
                    needsMigration = true;
                }
                return s;
            });

            this.migrateDaily();
            if (needsMigration) await this.saveState();
        } else if (data.blocker_enabled !== undefined || data.blocker_sites) {
            // Migrate from old format
            this.state.enabled = data.blocker_enabled || false;
            const oldSites = data.blocker_sites || [];
            this.state.sites = oldSites.map(site => ({
                id: site.id,
                url: site.url,
                mode: 'always',
                accessLimit: { enabled: false, count: 5, period: 'day' },
                scheduleLimit: { enabled: false, schedules: [{ fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 }] },
                todayAccesses: 0,
                lastAccessDate: this.getTodayStr()
            }));
            this.state.lock = { enabled: false, verseIndex: 0 };
            await this.saveState();
            chrome.storage.local.remove(['blocker_enabled', 'blocker_sites']);
        }
    },

    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    migrateDaily() {
        const today = this.getTodayStr();
        let changed = false;
        this.state.sites.forEach(site => {
            if (site.lastAccessDate !== today) {
                site.todayAccesses = 0;
                site.lastAccessDate = today;
                changed = true;
            }
        });
        if (changed) this.saveState();
    },

    async saveState() {
        await chrome.storage.local.set({
            blocker_config: {
                enabled: this.state.enabled,
                sites: this.state.sites,
                lock: this.state.lock
            }
        });
    },

    // ── DOM Cache ──────────────────────────────────────

    cacheDOM() {
        this.dom = {
            modal: document.getElementById('blocker-modal'),
            toggle: document.getElementById('blocker-toggle'),
            statusText: document.getElementById('blocker-status-text'),
            tabBtns: document.querySelectorAll('.blocker-tab-btn'),
            tabPanels: {
                sites: document.getElementById('tab-sites'),
                limits: document.getElementById('tab-limits'),
                time: document.getElementById('tab-time'),
                lock: document.getElementById('tab-lock')
            },
            // Sites tab
            siteInput: document.getElementById('blocked-site-input'),
            addSiteBtn: document.getElementById('add-blocked-site-btn'),
            sitesList: document.getElementById('blocked-sites-list'),
            emptySites: document.getElementById('blocker-empty-sites'),
            // Limits tab
            limitsList: document.getElementById('limits-sites-list'),
            emptyLimits: document.getElementById('blocker-empty-limits'),
            // Time tab
            timeList: document.getElementById('time-sites-list'),
            emptyTime: document.getElementById('blocker-empty-time'),
            // Lock tab
            lockToggle: document.getElementById('lock-toggle'),
            lockPreview: document.getElementById('lock-preview'),
            lockPreviewVerse: document.getElementById('lock-preview-verse'),
            lockPreviewRef: document.getElementById('lock-preview-ref'),
            // Lock overlay
            lockOverlay: document.getElementById('blocker-lock-overlay'),
            lockVerseRef: document.getElementById('lock-verse-ref'),
            lockVerseDisplay: document.getElementById('lock-verse-display'),
            lockVerseInput: document.getElementById('lock-verse-input'),
            lockProgressFill: document.getElementById('lock-progress-fill'),
            lockCancelBtn: document.getElementById('lock-cancel-btn')
        };
    },

    // ── Tab Navigation ────────────────────────────────

    setupTabListeners() {
        this.dom.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Global toggle
        if (this.dom.toggle) {
            this.dom.toggle.addEventListener('change', () => this.toggleBlocker());
        }
    },

    switchTab(tabName) {
        this.state.activeTab = tabName;

        // Update tab buttons
        this.dom.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update panels
        Object.entries(this.dom.tabPanels).forEach(([key, panel]) => {
            if (panel) panel.classList.toggle('active', key === tabName);
        });

        this.renderCurrentTab();
    },

    renderCurrentTab() {
        switch (this.state.activeTab) {
            case 'sites': this.renderSitesTab(); break;
            case 'limits': this.renderLimitsTab(); break;
            case 'time': this.renderScheduleTab(); break;
            case 'lock': this.renderLockTab(); break;
        }
    },

    // ── Global Toggle ─────────────────────────────────

    async toggleBlocker() {
        this.state.enabled = !this.state.enabled;
        await this.saveState();
        await this.updateRules();
        this.updateSwitchUI();

        if (this.state.enabled) {
            showToast(t('toast.blocker_activated'), 'success');
        } else {
            showToast(t('toast.blocker_deactivated'), 'info');
        }
    },

    updateSwitchUI() {
        if (this.dom.toggle) {
            this.dom.toggle.checked = this.state.enabled;
        }
        if (this.dom.statusText) {
            this.dom.statusText.textContent = this.state.enabled ? t('blocker.status_active') : t('blocker.status_inactive');
            this.dom.statusText.style.color = this.state.enabled ? 'var(--accent-color)' : 'var(--text-muted)';
        }
    },

    // ── Lock System ───────────────────────────────────

    getCurrentVerse() {
        const idx = this.state.lock.verseIndex % this.state.verses.length;
        const verse = this.state.verses[idx];
        const locale = window._i18nLocale || 'pt';
        const verseText = (typeof verse.text === 'object') ? (verse.text[locale] || verse.text.pt || '') : verse.text;
        return { text: verseText, ref: verse.ref };
    },

    setupLockListeners() {
        if (this.dom.lockToggle) {
            this.dom.lockToggle.addEventListener('change', () => this.toggleLock());
        }

        if (this.dom.lockCancelBtn) {
            this.dom.lockCancelBtn.addEventListener('click', () => {
                this.hideLockOverlay();
                // Close entire modal when cancelling lock — don't let user access settings
                animateModal(this.dom.modal, false);
            });
        }

        if (this.dom.lockVerseInput) {
            this.dom.lockVerseInput.addEventListener('input', (e) => this.handleVerseInput(e));
        }
    },

    async toggleLock() {
        // If the lock is being turned ON, just enable it
        // If the lock is being turned OFF, check if already unlocked this session
        if (this.dom.lockToggle.checked) {
            this.state.lock.enabled = true;
            this.state.lock.verseIndex = Math.floor(Math.random() * this.state.verses.length);
            await this.saveState();
            this.renderLockTab();
            showToast(t('toast.blocker_lock_activated'), 'success');
        } else {
            if (this.state.lockUnlocked) {
                // Already typed verse this session — allow direct disable
                this.state.lock.enabled = false;
                await this.saveState();
                this.renderLockTab();
                showToast(t('toast.blocker_lock_deactivated'), 'info');
            } else {
                // Need to type verse to disable
                this.dom.lockToggle.checked = true; // Keep it checked
                this.showLockOverlay(() => {
                    this.state.lock.enabled = false;
                    this.state.lockUnlocked = true;
                    this.saveState();
                    this.renderLockTab();
                    showToast(t('toast.blocker_lock_deactivated'), 'info');
                });
            }
        }
    },

    showLockOverlay(onSuccess) {
        this._lockOnSuccess = onSuccess;
        const verse = this.getCurrentVerse();

        if (this.dom.lockVerseRef) {
            this.dom.lockVerseRef.textContent = verse.ref;
        }

        this.renderVerseDisplay(verse.text, 0);

        if (this.dom.lockVerseInput) {
            this.dom.lockVerseInput.value = '';
        }
        if (this.dom.lockProgressFill) {
            this.dom.lockProgressFill.style.width = '0%';
        }

        if (this.dom.lockOverlay) {
            this.dom.lockOverlay.style.display = 'flex';
            setTimeout(() => {
                if (this.dom.lockVerseInput) this.dom.lockVerseInput.focus();
            }, 100);
        }
    },

    hideLockOverlay() {
        if (this.dom.lockOverlay) {
            this.dom.lockOverlay.style.display = 'none';
        }
        if (this.dom.lockVerseInput) {
            this.dom.lockVerseInput.value = '';
        }
    },

    renderVerseDisplay(verseText, matchedCount) {
        if (!this.dom.lockVerseDisplay) return;

        let html = '';
        for (let i = 0; i < verseText.length; i++) {
            let cls = '';
            if (i < matchedCount) cls = 'char-correct';
            else if (i === matchedCount) cls = 'char-current';
            else cls = 'char-pending';

            const ch = verseText[i] === ' ' ? '&nbsp;' : this.escapeHTML(verseText[i]);
            html += `<span class="${cls}">${ch}</span>`;
        }
        this.dom.lockVerseDisplay.innerHTML = html;
    },

    handleVerseInput(e) {
        const verse = this.getCurrentVerse();
        const typed = this.dom.lockVerseInput.value;
        const target = verse.text;

        // Check how many characters match from the start
        let matchCount = 0;
        for (let i = 0; i < typed.length && i < target.length; i++) {
            if (typed[i].toLowerCase() === target[i].toLowerCase()) {
                matchCount++;
            } else {
                // Wrong character — shake and clear
                this.dom.lockVerseInput.classList.add('error');
                setTimeout(() => {
                    this.dom.lockVerseInput.classList.remove('error');
                    this.dom.lockVerseInput.value = typed.slice(0, matchCount);
                }, 400);
                this.renderVerseDisplay(target, matchCount);
                return;
            }
        }

        // Update progress
        const progress = (matchCount / target.length) * 100;
        if (this.dom.lockProgressFill) {
            this.dom.lockProgressFill.style.width = progress + '%';
        }

        this.renderVerseDisplay(target, matchCount);

        // Complete!
        if (matchCount >= target.length) {
            // Advance to next verse for next time
            this.state.lock.verseIndex = (this.state.lock.verseIndex + 1) % this.state.verses.length;

            setTimeout(() => {
                const callback = this._lockOnSuccess;
                this._lockOnSuccess = null;
                this.hideLockOverlay();
                if (callback) {
                    callback();
                }
            }, 300);
        }
    },

    shouldShowLock() {
        return this.state.lock.enabled && !this.state.lockUnlocked;
    },

    // Called when the modal is opened — show lock overlay if needed
    onModalOpen() {
        if (this.shouldShowLock()) {
            this.showLockOverlay(() => {
                this.state.lockUnlocked = true;
            });
        }
    },

    // Called when the modal is closed natively
    onModalClose() {
        // Reset the unlocked state so it asks for the verse again next time
        this.state.lockUnlocked = false;
        this.hideLockOverlay();
    },

    // ── Sites Tab ─────────────────────────────────────

    setupSitesListeners() {
        const addAction = () => {
            const url = this.dom.siteInput?.value.trim();
            if (url) {
                this.addSite(url);
                if (this.dom.siteInput) this.dom.siteInput.value = '';
            }
        };

        if (this.dom.addSiteBtn) {
            this.dom.addSiteBtn.addEventListener('click', addAction);
        }
        if (this.dom.siteInput) {
            this.dom.siteInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') addAction();
            });
        }
    },

    async addSite(urlInput) {
        const domain = this.extractDomain(urlInput);
        if (!domain) {
            showToast(t('toast.blocker_invalid_url'), 'error');
            return;
        }

        if (this.state.sites.some(site => site.url === domain)) {
            showToast(t('toast.blocker_already_listed'), 'info');
            return;
        }

        this.state.sites.push({
            id: Date.now(),
            url: domain,
            mode: 'always',
            accessLimit: { enabled: false, count: 5, period: 'day' },
            scheduleLimit: { enabled: false, schedules: [{ fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 }] },
            todayAccesses: 0,
            lastAccessDate: this.getTodayStr()
        });

        await this.saveState();
        await this.updateRules();
        this.renderSitesTab();
        showToast(t('toast.blocker_site_added'), 'success');
    },

    async removeSite(id) {
        this.state.sites = this.state.sites.filter(site => site.id !== id);
        await this.saveState();
        await this.updateRules();
        this.renderCurrentTab();
        showToast(t('toast.blocker_site_removed'), 'info');
    },

    async toggleSiteMode(id) {
        const site = this.state.sites.find(s => s.id === id);
        if (!site) return;

        site.mode = site.mode === 'always' ? 'limited' : 'always';
        await this.saveState();
        await this.updateRules();
        this.renderSitesTab();
    },

    renderSitesTab() {
        const list = this.dom.sitesList;
        const empty = this.dom.emptySites;
        if (!list) return;

        list.innerHTML = '';

        if (this.state.sites.length === 0) {
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';

        this.state.sites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'blocked-site-item';

            const info = document.createElement('div');
            info.className = 'blocked-site-info';

            const urlSpan = document.createElement('span');
            urlSpan.className = 'blocked-site-url';
            urlSpan.textContent = site.url;

            const modeBadge = document.createElement('span');
            modeBadge.className = `blocked-site-mode ${site.mode === 'always' ? 'mode-always' : 'mode-limited'}`;
            modeBadge.textContent = site.mode === 'always' ? t('blocker.mode_always') : t('blocker.mode_limited');

            info.appendChild(urlSpan);
            info.appendChild(modeBadge);

            const actions = document.createElement('div');
            actions.className = 'blocked-site-actions';

            const modeBtn = document.createElement('button');
            modeBtn.className = 'mode-toggle-btn';
            modeBtn.textContent = site.mode === 'always' ? t('blocker.btn_limit') : t('blocker.btn_block');
            modeBtn.title = site.mode === 'always' ? 'Alternar para modo limitado' : 'Alternar para sempre bloqueado';
            modeBtn.addEventListener('click', () => this.toggleSiteMode(site.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'icon-btn-sm text-danger';
            deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
            deleteBtn.title = 'Remover site';
            deleteBtn.addEventListener('click', () => this.removeSite(site.id));

            actions.appendChild(modeBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(info);
            item.appendChild(actions);
            list.appendChild(item);
        });
    },

    // ── Limits Tab ────────────────────────────────────

    renderLimitsTab() {
        const list = this.dom.limitsList;
        const empty = this.dom.emptyLimits;
        if (!list) return;

        list.innerHTML = '';

        const limitedSites = this.state.sites.filter(s => s.mode === 'limited');
        if (limitedSites.length === 0) {
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';

        limitedSites.forEach(site => {
            const card = document.createElement('div');
            card.className = 'blocker-config-card';

            const header = document.createElement('div');
            header.className = 'config-card-header';
            header.innerHTML = `
                <span class="config-card-url">${this.escapeHTML(site.url)}</span>
                <span class="config-card-badge mode-limited">Limitado</span>
            `;

            // Toggle row
            const toggleRow = document.createElement('div');
            toggleRow.className = 'config-card-row';

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'config-toggle-label';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = site.accessLimit.enabled;
            chk.addEventListener('change', () => {
                site.accessLimit.enabled = chk.checked;
                if (site.accessLimit.enabled && !site.accessLimit.count) {
                    site.accessLimit.count = 5;
                }
                this.saveState();
                this.updateRules();
                this.renderLimitsTab();
            });
            const chkSpan = document.createElement('span');
            chkSpan.textContent = t('blocker.limit_label');
            toggleLabel.appendChild(chk);
            toggleLabel.appendChild(chkSpan);
            toggleRow.appendChild(toggleLabel);

            // Count/period row (visible only when enabled)
            const configRow = document.createElement('div');
            configRow.className = 'config-card-row';
            configRow.style.display = site.accessLimit.enabled ? '' : 'none';

            const label1 = document.createElement('label');
            label1.textContent = t('blocker.max_label');

            const countInput = document.createElement('input');
            countInput.type = 'number';
            countInput.min = '1';
            countInput.max = '100';
            countInput.value = site.accessLimit.count || 5;
            countInput.addEventListener('change', () => {
                site.accessLimit.count = Math.max(1, parseInt(countInput.value) || 5);
                this.saveState();
                this.updateRules();
                this.renderLimitsTab();
            });

            const periodSelect = document.createElement('select');
            periodSelect.innerHTML = `
                <option value="day" ${site.accessLimit.period === 'day' ? 'selected' : ''}>por dia</option>
                <option value="hour" ${site.accessLimit.period === 'hour' ? 'selected' : ''}>por hora</option>
            `;
            periodSelect.addEventListener('change', () => {
                site.accessLimit.period = periodSelect.value;
                this.saveState();
                this.updateRules();
            });

            configRow.appendChild(label1);
            configRow.appendChild(countInput);
            configRow.appendChild(periodSelect);

            card.appendChild(header);
            card.appendChild(toggleRow);
            card.appendChild(configRow);

            // Usage bar (only when enabled and count > 0)
            if (site.accessLimit.enabled && site.accessLimit.count > 0) {
                const usage = document.createElement('div');
                usage.className = 'config-card-usage';
                const pct = Math.min(100, (site.todayAccesses / site.accessLimit.count) * 100);
                const cls = pct >= 100 ? 'danger' : pct >= 70 ? 'warning' : '';
                usage.innerHTML = `
                    <div class="usage-bar"><div class="usage-bar-fill ${cls}" style="width: ${pct}%"></div></div>
                    <span class="usage-text">${site.todayAccesses} / ${site.accessLimit.count} acessos</span>
                `;
                card.appendChild(usage);
            }

            list.appendChild(card);
        });
    },

    // ── Schedule Tab ──────────────────────────────────

    renderScheduleTab() {
        const list = this.dom.timeList;
        const empty = this.dom.emptyTime;
        if (!list) return;

        list.innerHTML = '';

        const limitedSites = this.state.sites.filter(s => s.mode === 'limited');
        if (limitedSites.length === 0) {
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';

        const pad = n => String(n).padStart(2, '0');

        limitedSites.forEach(site => {
            const card = document.createElement('div');
            card.className = 'blocker-config-card';

            const header = document.createElement('div');
            header.className = 'config-card-header';
            header.innerHTML = `
                <span class="config-card-url">${this.escapeHTML(site.url)}</span>
                <span class="config-card-badge mode-limited">Limitado</span>
            `;

            // Toggle row
            const toggleRow = document.createElement('div');
            toggleRow.className = 'config-card-row';

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'config-toggle-label';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = site.scheduleLimit.enabled;
            chk.addEventListener('change', () => {
                site.scheduleLimit.enabled = chk.checked;
                this.saveState();
                this.renderScheduleTab();
            });
            const chkSpan = document.createElement('span');
            chkSpan.textContent = t('blocker.time_block_label');
            toggleLabel.appendChild(chk);
            toggleLabel.appendChild(chkSpan);
            toggleRow.appendChild(toggleLabel);

            // Schedules container (visible only when enabled)
            const schedulesContainer = document.createElement('div');
            schedulesContainer.style.display = site.scheduleLimit.enabled ? 'flex' : 'none';
            schedulesContainer.style.flexDirection = 'column';
            schedulesContainer.style.gap = '8px';
            schedulesContainer.style.marginTop = '8px';

            const renderSchedules = () => {
                schedulesContainer.innerHTML = '';
                site.scheduleLimit.schedules.forEach((schedule, index) => {
                    const row = document.createElement('div');
                    row.className = 'config-card-row';
                    
                    const fromLabel = document.createElement('label');
                    fromLabel.textContent = t('blocker.time_from');

                    const fromInput = document.createElement('input');
                    fromInput.type = 'time';
                    fromInput.value = `${pad(schedule.fromHour)}:${pad(schedule.fromMinute)}`;
                    fromInput.addEventListener('change', () => {
                        const [h, m] = fromInput.value.split(':').map(Number);
                        schedule.fromHour = h;
                        schedule.fromMinute = m;
                        this.saveState();
                        this.renderScheduleTab();
                    });

                    const toLabel = document.createElement('label');
                    toLabel.textContent = t('blocker.time_to');
                    toLabel.style.flex = '0';

                    const toInput = document.createElement('input');
                    toInput.type = 'time';
                    toInput.value = `${pad(schedule.toHour)}:${pad(schedule.toMinute)}`;
                    toInput.addEventListener('change', () => {
                        const [h, m] = toInput.value.split(':').map(Number);
                        schedule.toHour = h;
                        schedule.toMinute = m;
                        this.saveState();
                        this.renderScheduleTab();
                    });

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'icon-btn-sm text-danger';
                    deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
                    deleteBtn.title = 'Remover horário';
                    deleteBtn.style.marginLeft = 'auto';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        site.scheduleLimit.schedules.splice(index, 1);
                        this.saveState();
                        this.renderScheduleTab();
                    });

                    row.appendChild(fromLabel);
                    row.appendChild(fromInput);
                    row.appendChild(toLabel);
                    row.appendChild(toInput);
                    if (site.scheduleLimit.schedules.length > 1) {
                        row.appendChild(deleteBtn);
                    }
                    
                    schedulesContainer.appendChild(row);
                });
                
                const addRow = document.createElement('div');
                addRow.className = 'config-card-row';
                addRow.style.justifyContent = 'center';
                const addBtn = document.createElement('button');
                addBtn.className = 'mode-toggle-btn';
                addBtn.style.padding = '6px 14px';
                addBtn.style.marginTop = '4px';
                addBtn.innerHTML = '<i class="ph ph-plus"></i> Adicionar horário';
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    site.scheduleLimit.schedules.push({ fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 });
                    this.saveState();
                    this.renderScheduleTab();
                });
                addRow.appendChild(addBtn);
                schedulesContainer.appendChild(addRow);
            };

            if (site.scheduleLimit.schedules) {
                renderSchedules();
            }

            card.appendChild(header);
            card.appendChild(toggleRow);
            card.appendChild(schedulesContainer);

            // Status indicator when enabled
            if (site.scheduleLimit.enabled && site.scheduleLimit.schedules && site.scheduleLimit.schedules.length > 0) {
                const status = document.createElement('div');
                status.className = 'config-card-usage';
                const blocked = this.isWithinBlockedSchedule(site.scheduleLimit);
                
                if (blocked) {
                    status.innerHTML = `<span class="usage-text" style="color:#f87171;">⛔ Bloqueado agora</span>`;
                } else {
                    status.innerHTML = `<span class="usage-text" style="color:#4ade80;">✓ Permitido agora</span>`;
                }
                card.appendChild(status);
            }

            list.appendChild(card);
        });
    },

    // ── Lock Tab ──────────────────────────────────────

    renderLockTab() {
        if (this.dom.lockToggle) {
            this.dom.lockToggle.checked = this.state.lock.enabled;
        }

        if (this.state.lock.enabled && this.state.verses.length > 0) {
            const verse = this.getCurrentVerse();
            if (this.dom.lockPreview) this.dom.lockPreview.style.display = 'block';
            if (this.dom.lockPreviewVerse) this.dom.lockPreviewVerse.textContent = `"${verse.text}"`;
            if (this.dom.lockPreviewRef) this.dom.lockPreviewRef.textContent = verse.ref;
        } else {
            if (this.dom.lockPreview) this.dom.lockPreview.style.display = 'none';
        }
    },

    // ── Rules (declarativeNetRequest) ─────────────────

    extractDomain(url) {
        try {
            if (!url.startsWith('http')) url = 'https://' + url;
            const hostname = new URL(url).hostname;
            return hostname.replace(/^www\./, '');
        } catch (e) {
            return null;
        }
    },

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    },

    async updateRules() {
        if (this.state.updateInProgress) {
            await new Promise(resolve => setTimeout(resolve, 200));
            if (this.state.updateInProgress) return;
        }

        this.state.updateInProgress = true;

        try {
            const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
            // Only remove block rules (IDs < 1000). Allow rules (IDs 1000–9999) are
            // temporary session grants added by blocked.html and must not be wiped here.
            const oldRuleIds = oldRules
                .filter(rule => rule.id < 1000)
                .map(rule => rule.id);

            if (!this.state.enabled) {
                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: oldRuleIds,
                    addRules: []
                });
                return;
            }

            const blockedPageUrl = chrome.runtime.getURL('blocked.html');
            const newRules = [];
            let ruleId = 1;

            // ALL sites (always + limited) get redirected to blocked.html?domain=X
            // blocked.html reads the query param to determine which site was blocked,
            // checks config, and shows appropriate UI (blocked vs continue).
            //
            // We use requestDomains (explicit domain list) for maximum reliability
            // across all Chromium browsers. Each site also includes its known aliases
            // so that e.g. blocking gmail.com also blocks mail.google.com.
            // Domain is passed as a query parameter (not hash) since DNR may strip
            // fragment identifiers.
            this.state.sites.forEach(site => {
                // Collect all domains: primary + aliases (skip aliases that are separate entries)
                const allDomains = [site.url];
                const aliases = DOMAIN_ALIASES[site.url] || [];
                aliases.forEach(alias => {
                    if (!this.state.sites.some(s => s.url === alias)) {
                        allDomains.push(alias);
                    }
                });

                newRules.push({
                    id: ruleId++,
                    priority: 1,
                    action: {
                        type: 'redirect',
                        redirect: {
                            url: blockedPageUrl + '?domain=' + encodeURIComponent(site.url)
                        }
                    },
                    condition: {
                        requestDomains: allDomains,
                        resourceTypes: ['main_frame']
                    }
                });
            });

            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: oldRuleIds,
                addRules: newRules
            });

            // Immediately revoke allow rules for any site currently inside a blocked
            // schedule window. This enforces schedule priority even if an allow rule
            // was granted before the window started.
            const staleAllowIds = this.state.sites
                .filter(s => s.mode === 'limited'
                    && s.scheduleLimit?.enabled
                    && this.isWithinBlockedSchedule(s.scheduleLimit))
                .map(s => 1000 + (this.hashCode(s.url) % 9000));

            if (staleAllowIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: staleAllowIds });
            }
        } catch (error) {
            console.error('[Blocker] Failed to update rules:', error);
            showToast(t('toast.blocker_update_error'), 'error');
        } finally {
            this.state.updateInProgress = false;
        }
    },

    isWithinBlockedSchedule(scheduleLimit) {
        if (!scheduleLimit || !Array.isArray(scheduleLimit.schedules)) return false;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        
        for (const schedule of scheduleLimit.schedules) {
            const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
            const to = (schedule.toHour || 0) * 60 + (schedule.toMinute || 0);
            if (from === to) continue;
            const isBlocked = from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
            if (isBlocked) return true;
        }
        return false;
    },

    minutesUntilBlockedWindow(scheduleLimit) {
        if (!scheduleLimit || !Array.isArray(scheduleLimit.schedules) || scheduleLimit.schedules.length === 0) return 0;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        
        let minMinutes = 24 * 60;
        for (const schedule of scheduleLimit.schedules) {
            const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
            const diff = cur < from ? from - cur : (24 * 60) - cur + from;
            if (diff < minMinutes) minMinutes = diff;
        }
        return minMinutes === 24 * 60 ? 0 : minMinutes;
    },

    isSiteOverLimit(site) {
        if (site.scheduleLimit?.enabled && this.isWithinBlockedSchedule(site.scheduleLimit)) {
            return true;
        }
        if (site.accessLimit?.enabled && site.accessLimit.count > 0
            && site.todayAccesses >= site.accessLimit.count) {
            return true;
        }
        return false;
    },

    // ── Helpers ───────────────────────────────────────

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Expose a method for external callers (main.js, sw.js)
    async recordAccess(domain) {
        const site = this.state.sites.find(s => s.url === domain && s.mode === 'limited');
        if (!site) return;

        this.migrateDaily();
        site.todayAccesses++;
        await this.saveState();
        await this.updateRules();
    }
};

// Expose to global scope
window.Blocker = Blocker;
