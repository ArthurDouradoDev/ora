
// ============================================================
// SITE BLOCKER — Advanced Tabbed Blocker
// ============================================================

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
            this.state.verses = [{ text: "Deus é amor.", ref: "1Jo 4,8" }];
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
                    s.scheduleLimit = { enabled: false, fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 };
                    delete s.timeLimit;
                    delete s.todayTimeSpent;
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
                scheduleLimit: { enabled: false, fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 },
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
            showToast('Bloqueador ativado!', 'success');
        } else {
            showToast('Bloqueador desativado.', 'info');
        }
    },

    updateSwitchUI() {
        if (this.dom.toggle) {
            this.dom.toggle.checked = this.state.enabled;
        }
        if (this.dom.statusText) {
            this.dom.statusText.textContent = this.state.enabled ? 'Ativo' : 'Inativo';
            this.dom.statusText.style.color = this.state.enabled ? 'var(--accent-color)' : 'var(--text-muted)';
        }
    },

    // ── Lock System ───────────────────────────────────

    getCurrentVerse() {
        const idx = this.state.lock.verseIndex % this.state.verses.length;
        return this.state.verses[idx];
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
            showToast('Trava ativada!', 'success');
        } else {
            if (this.state.lockUnlocked) {
                // Already typed verse this session — allow direct disable
                this.state.lock.enabled = false;
                await this.saveState();
                this.renderLockTab();
                showToast('Trava desativada.', 'info');
            } else {
                // Need to type verse to disable
                this.dom.lockToggle.checked = true; // Keep it checked
                this.showLockOverlay(() => {
                    this.state.lock.enabled = false;
                    this.state.lockUnlocked = true;
                    this.saveState();
                    this.renderLockTab();
                    showToast('Trava desativada.', 'info');
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
            showToast('URL inválida.', 'error');
            return;
        }

        if (this.state.sites.some(site => site.url === domain)) {
            showToast('Site já está na lista.', 'info');
            return;
        }

        this.state.sites.push({
            id: Date.now(),
            url: domain,
            mode: 'always',
            accessLimit: { enabled: false, count: 5, period: 'day' },
            scheduleLimit: { enabled: false, fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 },
            todayAccesses: 0,
            lastAccessDate: this.getTodayStr()
        });

        await this.saveState();
        await this.updateRules();
        this.renderSitesTab();
        showToast('Site bloqueado com sucesso!', 'success');
    },

    async removeSite(id) {
        this.state.sites = this.state.sites.filter(site => site.id !== id);
        await this.saveState();
        await this.updateRules();
        this.renderCurrentTab();
        showToast('Site removido da lista.', 'info');
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
            modeBadge.textContent = site.mode === 'always' ? 'Sempre' : 'Limitado';

            info.appendChild(urlSpan);
            info.appendChild(modeBadge);

            const actions = document.createElement('div');
            actions.className = 'blocked-site-actions';

            const modeBtn = document.createElement('button');
            modeBtn.className = 'mode-toggle-btn';
            modeBtn.textContent = site.mode === 'always' ? 'Limitar' : 'Bloquear';
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
            chkSpan.textContent = 'Limitar acessos';
            toggleLabel.appendChild(chk);
            toggleLabel.appendChild(chkSpan);
            toggleRow.appendChild(toggleLabel);

            // Count/period row (visible only when enabled)
            const configRow = document.createElement('div');
            configRow.className = 'config-card-row';
            configRow.style.display = site.accessLimit.enabled ? '' : 'none';

            const label1 = document.createElement('label');
            label1.textContent = 'Máximo';

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
            chkSpan.textContent = 'Bloquear por horário';
            toggleLabel.appendChild(chk);
            toggleLabel.appendChild(chkSpan);
            toggleRow.appendChild(toggleLabel);

            // Time range row (visible only when enabled)
            const timeRow = document.createElement('div');
            timeRow.className = 'config-card-row';
            timeRow.style.display = site.scheduleLimit.enabled ? '' : 'none';

            const fromLabel = document.createElement('label');
            fromLabel.textContent = 'Das';

            const fromInput = document.createElement('input');
            fromInput.type = 'time';
            fromInput.value = `${pad(site.scheduleLimit.fromHour)}:${pad(site.scheduleLimit.fromMinute)}`;
            fromInput.addEventListener('change', () => {
                const [h, m] = fromInput.value.split(':').map(Number);
                site.scheduleLimit.fromHour = h;
                site.scheduleLimit.fromMinute = m;
                this.saveState();
                this.renderScheduleTab();
            });

            const toLabel = document.createElement('label');
            toLabel.textContent = 'às';
            toLabel.style.flex = '0';

            const toInput = document.createElement('input');
            toInput.type = 'time';
            toInput.value = `${pad(site.scheduleLimit.toHour)}:${pad(site.scheduleLimit.toMinute)}`;
            toInput.addEventListener('change', () => {
                const [h, m] = toInput.value.split(':').map(Number);
                site.scheduleLimit.toHour = h;
                site.scheduleLimit.toMinute = m;
                this.saveState();
                this.renderScheduleTab();
            });

            timeRow.appendChild(fromLabel);
            timeRow.appendChild(fromInput);
            timeRow.appendChild(toLabel);
            timeRow.appendChild(toInput);

            card.appendChild(header);
            card.appendChild(toggleRow);
            card.appendChild(timeRow);

            // Status indicator when enabled
            if (site.scheduleLimit.enabled) {
                const status = document.createElement('div');
                status.className = 'config-card-usage';
                const blocked = this.isWithinBlockedSchedule(site.scheduleLimit);
                const fromStr = `${pad(site.scheduleLimit.fromHour)}:${pad(site.scheduleLimit.fromMinute)}`;
                const toStr = `${pad(site.scheduleLimit.toHour)}:${pad(site.scheduleLimit.toMinute)}`;
                if (blocked) {
                    status.innerHTML = `<span class="usage-text" style="color:#f87171;">⛔ Bloqueado agora (${fromStr}–${toStr})</span>`;
                } else {
                    status.innerHTML = `<span class="usage-text" style="color:#4ade80;">✓ Permitido agora · bloqueado das ${fromStr} às ${toStr}</span>`;
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

            const blockedPageUrl = chrome.runtime.getURL('/blocked.html');
            const newRules = [];
            let ruleId = 1;

            // ALL sites (always + limited) get redirected to blocked.html#domain
            // blocked.html reads the hash to determine which site was blocked,
            // checks config, and shows appropriate UI (blocked vs continue)
            this.state.sites.forEach(site => {
                const escapedDomain = this.escapeRegex(site.url);
                newRules.push({
                    id: ruleId++,
                    priority: 1,
                    action: {
                        type: 'redirect',
                        redirect: {
                            regexSubstitution: blockedPageUrl + '#\\1'
                        }
                    },
                    condition: {
                        regexFilter: `^https?://((?:[^/]*\\.)?${escapedDomain})(?:/.*)?$`,
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
            showToast('Erro ao atualizar bloqueador', 'error');
        } finally {
            this.state.updateInProgress = false;
        }
    },

    isWithinBlockedSchedule(schedule) {
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
        const to = (schedule.toHour || 0) * 60 + (schedule.toMinute || 0);
        if (from === to) return false;
        return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
    },

    minutesUntilBlockedWindow(schedule) {
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
        return cur < from ? from - cur : (24 * 60) - cur + from;
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
