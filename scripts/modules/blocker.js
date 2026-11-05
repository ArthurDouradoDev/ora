// ============================================================
// PROTEÇÃO (Fase 4) — Subtela #protecao, perfis, editor integrado e DNR
// ============================================================
// Depende de BlockerCore, DialogSystem, RouterSystem e ProtectionSystem.

const Blocker = {
    config: null,
    pomodoro: null,
    screentime: null,
    lockVerses: [],
    hasPermission: true,
    unlockedInSession: false,
    editingProfileId: null,
    isNewDraft: false,
    draftProfile: null,
    lastFailedAttempt: null,
    frictionInterval: null,
    frictionMinutes: 15,
    pendingLockAction: null,
    elements: {},

    init: async function(appData) {
        this.lockVerses = (appData && appData.lockVerses) || [];
        this.cacheDOM();
        await this.loadState();
        this.bindEvents();
        this.render();
        await this.syncDnrRulesQuietly();
    },

    defaultConfig: function() {
        return {
            enabled: false,
            reenableAt: null,
            lock: { enabled: false, verseIndex: 0, writeUnlockEnabled: false },
            profiles: BlockerCore.SUGGESTED_PROFILES.map(p => BlockerCore.normalizeProfile(p))
        };
    },

    normalizeConfig: function(raw) {
        if (!raw || typeof raw !== 'object') {
            return this.defaultConfig();
        }
        const profiles = BlockerCore.profilesFromConfig(raw);
        const finalProfiles = profiles.length
            ? profiles
            : BlockerCore.SUGGESTED_PROFILES.map(p => BlockerCore.normalizeProfile(p));
        const rawLock = raw.lock && typeof raw.lock === 'object' ? raw.lock : {};
        return {
            enabled: Boolean(raw.enabled),
            reenableAt: Number.isFinite(Number(raw.reenableAt)) && Number(raw.reenableAt) > 0 ? Number(raw.reenableAt) : null,
            lock: {
                enabled: Boolean(rawLock.enabled),
                verseIndex: Number.isFinite(Number(rawLock.verseIndex)) ? Number(rawLock.verseIndex) : 0,
                writeUnlockEnabled: Boolean(rawLock.writeUnlockEnabled)
            },
            profiles: finalProfiles
        };
    },

    loadState: async function() {
        const data = await chrome.storage.local.get([
            'blocker_config',
            'ora_pomodoro_state',
            'ora_screentime',
            'ora_debug_blocker_no_permission'
        ]);
        this.config = this.normalizeConfig(data.blocker_config);
        if (!data.blocker_config) {
            await chrome.storage.local.set({ blocker_config: this.config });
        }
        this.pomodoro = data.ora_pomodoro_state || null;
        this.screentime = data.ora_screentime || null;
        this.hasPermission = await this.checkPermission(data.ora_debug_blocker_no_permission);

        if (this.config.reenableAt && this.config.reenableAt <= Date.now()) {
            this.config.enabled = true;
            this.config.reenableAt = null;
        }
    },

    checkPermission: async function(debugNoPermFlag) {
        let flag = debugNoPermFlag;
        if (flag === undefined) {
            const d = await chrome.storage.local.get(['ora_debug_blocker_no_permission']);
            flag = d.ora_debug_blocker_no_permission;
        }
        if (flag === true) return false;
        if (!chrome.declarativeNetRequest || typeof chrome.declarativeNetRequest.updateDynamicRules !== 'function') {
            return false;
        }
        if (chrome.permissions && typeof chrome.permissions.contains === 'function') {
            try {
                const granted = await chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] });
                if (!granted) return false;
            } catch (e) {
                // Ignore if permissions API is restricted
            }
        }
        return true;
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            view: $('view-protecao'),
            lockBtn: $('protecao-lock-btn'),
            lockBtnText: $('protecao-lock-btn-text'),
            status: $('status'),
            statusIcon: $('statusIcon'),
            statusTitle: $('statusTitle'),
            statusText: $('statusText'),
            statusActions: $('statusActions'),
            permBanner: $('protecao-perm-banner'),
            grantBtn: $('grantBtn'),
            whyPermBtn: $('whyPermBtn'),
            listError: $('protecao-list-error'),
            listRetryBtn: $('listRetryBtn'),
            listSaved: $('listSaved'),
            profiles: $('profiles'),
            addProfileBtn: $('addProfileBtn'),
            editor: $('protecao-editor'),
            editorTitle: $('editorTitle'),
            editorCloseBtn: $('editorCloseBtn'),
            editorProfileName: $('editorProfileName'),
            siteChips: $('siteChips'),
            siteForm: $('siteForm'),
            siteInput: $('siteInput'),
            rFocus: $('rFocus'),
            rSched: $('rSched'),
            schedFields: $('schedFields'),
            tFrom: $('tFrom'),
            tTo: $('tTo'),
            days: $('days'),
            rLimit: $('rLimit'),
            limitFields: $('limitFields'),
            limitMin: $('limitMin'),
            tempSeg: $('tempSeg'),
            consequence: $('consequence'),
            editorErrorBanner: $('editorErrorBanner'),
            retryBtn: $('retryBtn'),
            saveBtn: $('saveBtn'),
            cancelEditBtn: $('cancelEditBtn'),
            deleteProfileBtn: $('deleteProfileBtn'),
            saved: $('saved'),
            pauseDialog: $('protection-pause-dialog'),
            frictionVerseText: $('friction-verse-text'),
            frictionVerseRef: $('friction-verse-ref'),
            frictionDurationSeg: $('friction-duration-seg'),
            frictionKeepBtn: $('friction-keep-btn'),
            frictionConfirmBtn: $('friction-confirm-btn'),
            lockDialog: $('protection-lock-dialog'),
            lockConfigView: $('protection-lock-config-view'),
            lockChallengeView: $('protection-lock-challenge-view'),
            lockToggle: $('lock-toggle'),
            lockPreview: $('lock-preview'),
            lockPreviewVerse: $('lock-preview-verse'),
            lockPreviewRef: $('lock-preview-ref'),
            lockVerseRef: $('lock-verse-ref'),
            lockVerseDisplay: $('lock-verse-display'),
            lockVerseInput: $('lock-verse-input'),
            lockProgressFill: $('lock-progress-fill'),
            addDialog: $('protection-add-dialog'),
            presetList: $('protection-preset-list'),
            customProfileForm: $('protection-custom-profile-form'),
            customProfileName: $('custom-profile-name'),
            deleteDialog: $('protection-delete-dialog'),
            deleteTitle: $('protection-delete-title'),
            deleteConfirmBtn: $('protection-delete-confirm'),
            whyPermDialog: $('protection-why-perm-dialog'),
            previewScrim: $('protection-preview-scrim'),
            previewFav: $('preview-blk-fav'),
            previewSite: $('preview-blk-site'),
            previewKicker: $('preview-blk-kicker'),
            previewTitle: $('preview-blk-title'),
            previewWhy: $('preview-blk-why'),
            previewUntil: $('preview-blk-until'),
            previewActions: $('preview-blk-actions'),
            previewPrimary: $('preview-blk-primary'),
            previewTempBtn: $('preview-blk-temp'),
            previewRespiroBtn: $('preview-blk-respiro'),
            previewTempBox: $('preview-blk-temp-box'),
            previewTempTitle: $('preview-temp-title'),
            previewTempNote: $('preview-temp-note'),
            previewTempReason: $('preview-temp-reason'),
            previewTempBack: $('preview-temp-back'),
            previewTempOpen: $('preview-temp-open')
        };
    },

    bindEvents: function() {
        const el = this.elements;
        if (!el.view) return;

        window.addEventListener('ora:route', async (e) => {
            const route = e.detail;
            if (route && route.view === 'protecao') {
                this.hasPermission = await this.checkPermission();
                window.dispatchEvent(new CustomEvent('ora:blocker-permission', { detail: { hasPermission: this.hasPermission } }));
                this.render();
            } else {
                this.unlockedInSession = false;
                this.closeEditor({ refocus: false });
            }
        });

        window.addEventListener('ora:pomodoro', (e) => {
            this.pomodoro = e.detail || null;
            this.render();
        });

        window.addEventListener('ora:locale-changed', () => {
            this.render();
            if (this.draftProfile) this.renderEditor();
        });

        chrome.storage.onChanged.addListener(async (changes, area) => {
            if (area !== 'local') return;
            if (changes.blocker_config || changes.ora_pomodoro_state || changes.ora_screentime || changes.ora_debug_blocker_no_permission) {
                await this.loadState();
                window.dispatchEvent(new CustomEvent('ora:blocker-permission', { detail: { hasPermission: this.hasPermission } }));
                this.render();
            }
        });

        // Permission banner actions
        el.grantBtn.addEventListener('click', () => {
            const url = `chrome://extensions/?id=${chrome.runtime.id}`;
            if (chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url });
            }
        });
        el.whyPermBtn.addEventListener('click', () => {
            DialogSystem.open(el.whyPermDialog, { opener: el.whyPermBtn });
        });

        // Retry buttons
        el.retryBtn.addEventListener('click', () => {
            if (this.lastFailedAttempt) this.lastFailedAttempt();
        });
        el.listRetryBtn.addEventListener('click', () => {
            if (this.lastFailedAttempt) this.lastFailedAttempt();
        });

        // Lock button
        el.lockBtn.addEventListener('click', () => {
            this.requireUnlock(() => this.openLockConfig(), el.lockBtn);
        });
        el.lockToggle.addEventListener('change', async () => {
            const next = JSON.parse(JSON.stringify(this.config));
            if (el.lockToggle.checked) {
                const idx = this.lockVerses.length ? Math.floor(Math.random() * this.lockVerses.length) : 0;
                next.lock = { enabled: true, verseIndex: idx, writeUnlockEnabled: false };
                this.unlockedInSession = true;
            } else {
                next.lock = { enabled: false, verseIndex: 0, writeUnlockEnabled: false };
            }
            const ok = await this.applyAndSaveConfig(next, { source: 'list' });
            if (!ok) {
                el.lockToggle.checked = !el.lockToggle.checked;
            }
            this.renderLockPreview();
        });
        el.lockVerseInput.addEventListener('input', () => this.onLockVerseInput());
        el.lockVerseInput.addEventListener('paste', (e) => e.preventDefault());

        // Add profile
        el.addProfileBtn.addEventListener('click', () => {
            this.requireUnlock(() => this.openAddProfileDialog(), el.addProfileBtn);
        });
        el.customProfileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = el.customProfileName.value.trim();
            if (!name) return;
            DialogSystem.close(el.addDialog);
            const newProfile = BlockerCore.normalizeProfile({
                id: 'perfil-' + Date.now(),
                name,
                enabled: true,
                sites: [],
                rules: {
                    duringFocus: true,
                    schedule: { enabled: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
                    dailyLimitMin: null,
                    temporaryAccess: { enabled: true, minutes: 5, perDay: 3 }
                }
            });
            this.openEditor(newProfile, { isNew: true });
        });

        // Profile list delegation (checkbox toggle + Edit button)
        el.profiles.addEventListener('click', (e) => {
            const editBtn = e.target.closest('[data-edit-profile]');
            if (editBtn) {
                const id = editBtn.dataset.editProfile;
                const prof = this.config.profiles.find(p => p.id === id);
                if (prof) {
                    this.requireUnlock(() => this.openEditor(prof, { isNew: false, opener: editBtn }), editBtn);
                }
            }
        });
        el.profiles.addEventListener('change', async (e) => {
            const check = e.target.closest('[data-profile-toggle]');
            if (!check) return;
            const id = check.dataset.profileToggle;
            const wantEnabled = check.checked;

            const performToggle = async () => {
                const next = JSON.parse(JSON.stringify(this.config));
                const target = next.profiles.find(p => p.id === id);
                if (!target) return;
                target.enabled = wantEnabled;
                if (wantEnabled) {
                    next.enabled = true;
                    next.reenableAt = null;
                } else if (!next.profiles.some(p => p.enabled !== false && p.sites.length > 0)) {
                    next.enabled = false;
                }
                const ok = await this.applyAndSaveConfig(next, { source: 'list' });
                if (!ok) {
                    check.checked = !wantEnabled;
                }
            };

            if (!wantEnabled && this.isLocked()) {
                check.checked = true;
                this.requireUnlock(performToggle, check);
            } else {
                await performToggle();
            }
        });

        // Editor events
        el.editorCloseBtn.addEventListener('click', () => this.closeEditor());
        el.cancelEditBtn.addEventListener('click', () => this.closeEditor());
        el.editorProfileName.addEventListener('input', () => {
            if (!this.draftProfile) return;
            this.draftProfile.name = el.editorProfileName.value.trim() || this.draftProfile.name;
            el.editorTitle.textContent = this.draftProfile.name;
            this.renderConsequence();
        });
        el.siteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSiteFromInput();
        });
        ['rFocus', 'rSched', 'rLimit', 'tFrom', 'tTo', 'limitMin'].forEach(key => {
            el[key].addEventListener('input', () => this.syncEditorControlsToDraft());
            el[key].addEventListener('change', () => this.syncEditorControlsToDraft());
        });
        el.tempSeg.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-t]');
            if (!btn || !this.draftProfile) return;
            el.tempSeg.querySelectorAll('button[data-t]').forEach(b => {
                b.setAttribute('aria-pressed', String(b === btn));
            });
            this.draftProfile.rules.temporaryAccess.enabled = btn.dataset.t !== 'none';
            this.renderConsequence();
        });
        el.saveBtn.addEventListener('click', () => this.saveEditor());
        el.deleteProfileBtn.addEventListener('click', () => this.confirmDeleteProfile());
        el.deleteConfirmBtn.addEventListener('click', () => this.executeDeleteProfile());

        // Contemplative pause dialog events
        el.frictionDurationSeg.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-minutes]');
            if (!btn) return;
            el.frictionDurationSeg.querySelectorAll('button[data-minutes]').forEach(b => {
                b.setAttribute('aria-pressed', String(b === btn));
            });
            const raw = btn.dataset.minutes;
            if (raw === 'eod') {
                const now = new Date();
                const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                this.frictionMinutes = Math.max(1, Math.round((eod - now) / 60000));
            } else {
                this.frictionMinutes = parseInt(raw, 10) || 15;
            }
            this.updateFrictionConfirmLabel();
        });
        el.frictionKeepBtn.addEventListener('click', () => {
            this.stopFrictionCountdown();
            showToast(t('toast.blocker_kept'), 'info');
        });
        el.frictionConfirmBtn.addEventListener('click', () => this.confirmContemplativePause());

        // "Ver como aparece" preview buttons
        el.view.querySelectorAll('[data-preview-block]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openBlockPreview(btn.dataset.previewBlock, btn);
            });
        });
        el.previewTempBtn.addEventListener('click', () => {
            el.previewActions.hidden = true;
            el.previewTempBox.hidden = false;
        });
        el.previewTempBack.addEventListener('click', () => {
            el.previewTempBox.hidden = true;
            el.previewActions.hidden = false;
        });
        el.previewRespiroBtn.addEventListener('click', () => {
            DialogSystem.close(el.previewScrim);
            if (window.RespiroSystem) {
                RespiroSystem.open({ view: 'protecao', path: [] });
            }
        });
    },

    isLocked: function() {
        return Boolean(this.config && this.config.lock && this.config.lock.enabled && !this.unlockedInSession);
    },

    isFocusBlocking: function() {
        const p = this.pomodoro;
        if (!p || p.phase !== 'focus') return false;
        const activeOrPaused = Boolean(p.isRunning || p.session);
        if (!activeOrPaused) return false;
        if (p.protection && p.protection.active === false) return false;
        return Boolean((this.config && this.config.enabled) || (p.protection && p.protection.active));
    },

    focusEndsAt: function() {
        const p = this.pomodoro;
        if (!p) return null;
        if (p.isRunning && p.expectedEndTime) return p.expectedEndTime;
        if (p.timeRemaining) return Date.now() + p.timeRemaining * 1000;
        return null;
    },

    focusTitle: function() {
        const p = this.pomodoro;
        if (p && p.session && p.session.title) return p.session.title;
        return t('today.free_focus');
    },

    hhmm: function(ms) {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    evalContext: function(configOverride) {
        const cfg = configOverride || this.config;
        const locale = typeof getLocale === 'function' ? getLocale() : 'pt';
        return {
            locale,
            hasPermission: this.hasPermission,
            enabled: Boolean(cfg && cfg.enabled),
            pausedUntil: cfg && cfg.reenableAt ? cfg.reenableAt : null,
            focusActive: this.isFocusBlocking(),
            focusEndsAt: this.focusEndsAt(),
            focusTitle: this.focusTitle(),
            screentime: this.screentime
        };
    },

    // ── Renderização principal ────────────────────────

    render: function() {
        const el = this.elements;
        if (!el.view || !this.config) return;

        const locked = Boolean(this.config.lock && this.config.lock.enabled);
        el.lockBtnText.textContent = locked ? t('protection.lock_active_badge') : t('protection.lock_btn');
        el.permBanner.hidden = this.hasPermission;

        this.renderStatus();
        this.renderProfiles();
        if (this.draftProfile) {
            this.renderConsequence();
        }
    },

    renderStatus: function() {
        const el = this.elements;
        const cfg = this.config;
        const ctx = this.evalContext(cfg);
        const now = new Date();
        const enabledProfiles = cfg.profiles.filter(p => p.enabled !== false && p.sites.length > 0);

        el.status.className = 'protecao-status';
        el.statusActions.innerHTML = '';

        // 1. Sem permissão
        if (!this.hasPermission) {
            el.status.classList.add('err');
            el.statusIcon.className = 'ph ph-shield-slash';
            el.statusTitle.textContent = t('protection.status_no_perm_title');
            el.statusText.textContent = t('protection.status_no_perm_sub');
            return;
        }

        // 2. Em foco
        if (ctx.focusActive && enabledProfiles.some(p => p.rules.duringFocus)) {
            el.status.classList.add('focus');
            el.statusIcon.className = 'ph ph-target';
            const endStr = ctx.focusEndsAt ? this.hhmm(ctx.focusEndsAt) : '';
            const focusNames = enabledProfiles.filter(p => p.rules.duringFocus).map(p => p.name).join(', ');
            el.statusTitle.textContent = t('protection.status_focus_title', { time: endStr });
            el.statusText.textContent = t('protection.status_focus_sub', { profiles: focusNames, task: ctx.focusTitle });
            return;
        }

        // 3. Pausada
        if (cfg.reenableAt && cfg.reenableAt > Date.now()) {
            el.status.classList.add('warn');
            el.statusIcon.className = 'ph ph-pause-circle';
            const timeStr = this.hhmm(cfg.reenableAt);
            el.statusTitle.textContent = t('protection.status_paused_title', { time: timeStr });
            el.statusText.textContent = t('protection.status_paused_sub', { time: timeStr });
            const resumeBtn = document.createElement('button');
            resumeBtn.type = 'button';
            resumeBtn.className = 'btn btn-primary btn-sm';
            resumeBtn.id = 'resumeBtn';
            resumeBtn.textContent = t('protection.resume_now');
            resumeBtn.addEventListener('click', () => this.resumeProtectionNow());
            el.statusActions.appendChild(resumeBtn);
            return;
        }

        // 4. Ativa
        if (cfg.enabled && enabledProfiles.length > 0) {
            el.statusIcon.className = 'ph ph-shield-check';
            const evals = enabledProfiles.map(p => BlockerCore.evaluateProfile(p, ctx, now));
            const blockingCount = evals.filter(ev => ev.blocked).length;
            el.statusTitle.textContent = blockingCount > 0
                ? t('protection.status_active_blocking', { n: blockingCount })
                : t('protection.status_active_free');

            const next = BlockerCore.nextChange(enabledProfiles, now, ctx);
            el.statusText.textContent = next
                ? t('protection.status_active_sub_next', { next })
                : t('protection.status_active_sub_none');

            const pauseBtn = document.createElement('button');
            pauseBtn.type = 'button';
            pauseBtn.className = 'btn btn-aux btn-sm';
            pauseBtn.id = 'pauseBtn';
            pauseBtn.textContent = t('protection.pause_15');
            pauseBtn.addEventListener('click', () => {
                this.requireUnlock(() => this.openContemplativePause(pauseBtn), pauseBtn);
            });
            el.statusActions.appendChild(pauseBtn);
            return;
        }

        // 5. Desligada / Sem perfis ativos
        el.status.classList.add('off');
        el.statusIcon.className = 'ph ph-shield';
        el.statusTitle.textContent = t('protection.status_off_title');
        el.statusText.textContent = t('protection.status_off_sub');

        if (cfg.profiles.some(p => p.sites.length > 0)) {
            const onBtn = document.createElement('button');
            onBtn.type = 'button';
            onBtn.className = 'btn btn-primary btn-sm';
            onBtn.id = 'turnOnBtn';
            onBtn.textContent = t('protection.turn_on');
            onBtn.addEventListener('click', async () => {
                const next = JSON.parse(JSON.stringify(this.config));
                next.enabled = true;
                next.reenableAt = null;
                if (!next.profiles.some(p => p.enabled !== false && p.sites.length > 0)) {
                    next.profiles.forEach(p => { if (p.sites.length > 0) p.enabled = true; });
                }
                await this.applyAndSaveConfig(next, { source: 'list' });
            });
            el.statusActions.appendChild(onBtn);
        }
    },

    renderProfiles: function() {
        const el = this.elements;
        const cfg = this.config;
        const ctx = this.evalContext(cfg);
        const locale = ctx.locale;
        const now = new Date();

        const fragment = document.createDocumentFragment();
        cfg.profiles.forEach(profile => {
            const ev = BlockerCore.evaluateProfile(profile, ctx, now);
            const card = document.createElement('div');
            card.className = 'protecao-profile'
                + (this.editingProfileId === profile.id ? ' is-editing' : '')
                + (profile.enabled === false ? ' is-disabled' : '');
            card.dataset.profileId = profile.id;

            const lead = document.createElement('div');
            lead.className = 'protecao-profile-lead';

            const check = document.createElement('input');
            check.type = 'checkbox';
            check.className = 'protecao-profile-check';
            check.checked = profile.enabled !== false;
            check.dataset.profileToggle = profile.id;
            check.setAttribute('aria-label', t('protection.profile_toggle_label', { name: profile.name }));

            const ic = document.createElement('span');
            ic.className = 'ic';
            ic.innerHTML = `<i class="ph ${profile.icon || 'ph-shield-check'}" aria-hidden="true"></i>`;

            lead.append(check, ic);

            const body = document.createElement('div');
            body.className = 'protecao-profile-body';

            const h3 = document.createElement('h3');
            h3.textContent = profile.name;

            const ruleP = document.createElement('p');
            ruleP.className = 'rule';
            ruleP.textContent = BlockerCore.describeProfileRule(profile, locale);

            const sitesP = document.createElement('p');
            sitesP.className = 'sites';
            sitesP.textContent = profile.sites.length ? profile.sites.join(', ') : t('protection.chip_empty');

            body.append(h3, ruleP, sitesP);

            if (ev.limitMin) {
                const meterWrap = document.createElement('div');
                meterWrap.className = 'protecao-meter-wrap';
                const meter = document.createElement('div');
                meter.className = 'protecao-meter' + (ev.meterPct >= 100 ? ' warn' : '');
                meter.setAttribute('role', 'meter');
                meter.setAttribute('aria-valuenow', String(ev.usedMin));
                meter.setAttribute('aria-valuemin', '0');
                meter.setAttribute('aria-valuemax', String(ev.limitMin));
                meter.setAttribute('aria-label', t('protection.meter_aria', { name: profile.name }));
                const fill = document.createElement('span');
                fill.style.width = `${ev.meterPct}%`;
                meter.appendChild(fill);

                const meterCaption = document.createElement('span');
                meterCaption.className = 'meta';
                meterCaption.textContent = t('protection.meter_used', { used: ev.usedMin, limit: ev.limitMin });
                meterWrap.append(meter, meterCaption);
                body.appendChild(meterWrap);
            }

            const side = document.createElement('div');
            side.className = 'side';

            const pill = document.createElement('span');
            pill.className = 'protecao-pill' + (ev.pillKind ? ' ' + ev.pillKind : '');
            pill.textContent = ev.pillText;

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-aux btn-sm';
            editBtn.dataset.editProfile = profile.id;
            editBtn.textContent = t('protection.edit');

            side.append(pill, editBtn);
            card.append(lead, body, side);
            fragment.appendChild(card);
        });

        el.profiles.replaceChildren(fragment);
    },

    // ── Editor integrado ──────────────────────────────

    openEditor: function(profile, { isNew = false, opener = null } = {}) {
        const el = this.elements;
        this.editingProfileId = profile.id;
        this.isNewDraft = isNew;
        this.draftProfile = BlockerCore.normalizeProfile(JSON.parse(JSON.stringify(profile)));
        this.editorOpener = opener || el.addProfileBtn;

        el.editorErrorBanner.hidden = true;
        el.saved.classList.remove('show');
        el.view.dataset.editing = 'true';
        el.editor.inert = false;

        this.renderProfiles();
        this.renderEditor();
        window.LeaveGuard?.watchEditor('protection', this.draftProfile,
            () => LeaveGuard.snapshot(el.editor) + JSON.stringify(this.draftProfile),
            () => !!this.draftProfile);

        setTimeout(() => {
            if (el.siteInput) el.siteInput.focus({ preventScroll: true });
        }, 80);
    },

    closeEditor: function({ refocus = true } = {}) {
        const el = this.elements;
        if (!el.view) return;
        this.editingProfileId = null;
        this.isNewDraft = false;
        this.draftProfile = null;
        delete el.view.dataset.editing;
        el.editor.inert = true;
        el.editorErrorBanner.hidden = true;
        this.renderProfiles();
        if (refocus && this.editorOpener && document.contains(this.editorOpener)) {
            this.editorOpener.focus({ preventScroll: true });
        }
    },

    renderEditor: function() {
        const el = this.elements;
        const p = this.draftProfile;
        if (!p) return;

        el.editorTitle.textContent = p.name;
        el.editorProfileName.value = p.name;
        el.rFocus.checked = Boolean(p.rules.duringFocus);

        const sched = p.rules.schedule || { enabled: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] };
        el.rSched.checked = Boolean(sched.enabled);
        el.tFrom.value = sched.from || '22:00';
        el.tTo.value = sched.to || '07:00';
        el.schedFields.hidden = !sched.enabled;
        el.days.hidden = !sched.enabled;

        this.renderDaysButtons(sched.days || [0, 1, 2, 3, 4, 5, 6]);

        const hasLimit = p.rules.dailyLimitMin > 0;
        el.rLimit.checked = hasLimit;
        el.limitFields.hidden = !hasLimit;
        el.limitMin.value = String(hasLimit ? p.rules.dailyLimitMin : 30);

        const tempEnabled = p.rules.temporaryAccess && p.rules.temporaryAccess.enabled !== false;
        el.tempSeg.querySelectorAll('button[data-t]').forEach(btn => {
            const match = (btn.dataset.t === '3x' && tempEnabled) || (btn.dataset.t === 'none' && !tempEnabled);
            btn.setAttribute('aria-pressed', String(match));
        });

        el.deleteProfileBtn.hidden = this.isNewDraft || this.config.profiles.length <= 1;

        this.renderSiteChips();
        this.renderConsequence();
    },

    renderDaysButtons: function(selectedDays) {
        const el = this.elements;
        const locale = typeof getLocale === 'function' ? getLocale() : 'pt';
        const shortLabels = (BlockerCore.DAY_SHORT && BlockerCore.DAY_SHORT[locale]) || BlockerCore.DAY_SHORT.pt;
        const fullNames = (BlockerCore.DAY_NAMES && BlockerCore.DAY_NAMES[locale]) || BlockerCore.DAY_NAMES.pt;

        const frag = document.createDocumentFragment();
        for (let d = 0; d < 7; d++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.day = String(d);
            btn.setAttribute('aria-pressed', String(selectedDays.includes(d)));
            btn.setAttribute('aria-label', fullNames[d]);
            btn.textContent = shortLabels[d];
            btn.addEventListener('click', () => {
                const pressed = btn.getAttribute('aria-pressed') === 'true';
                btn.setAttribute('aria-pressed', String(!pressed));
                this.syncEditorControlsToDraft();
            });
            frag.appendChild(btn);
        }
        el.days.replaceChildren(frag);
    },

    renderSiteChips: function() {
        const el = this.elements;
        const p = this.draftProfile;
        if (!p) return;

        const frag = document.createDocumentFragment();
        p.sites.forEach((site, idx) => {
            const chip = document.createElement('span');
            chip.className = 'protecao-site-chip';
            chip.append(document.createTextNode(site));
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.setAttribute('aria-label', t('protection.remove_site', { site }));
            rm.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
            rm.addEventListener('click', () => {
                p.sites.splice(idx, 1);
                this.renderSiteChips();
                this.renderConsequence();
            });
            chip.appendChild(rm);
            frag.appendChild(chip);
        });
        el.siteChips.replaceChildren(frag);
    },

    addSiteFromInput: function() {
        const el = this.elements;
        if (!this.draftProfile) return false;
        const raw = el.siteInput.value.trim();
        if (!raw) return false;
        const domain = BlockerCore.extractDomain(raw);
        if (!domain) {
            showToast(t('toast.blocker_invalid_url'), 'error');
            return false;
        }
        if (!this.draftProfile.sites.includes(domain)) {
            this.draftProfile.sites.push(domain);
            this.renderSiteChips();
            this.renderConsequence();
        }
        el.siteInput.value = '';
        return true;
    },

    syncEditorControlsToDraft: function() {
        const el = this.elements;
        const p = this.draftProfile;
        if (!p) return;

        p.name = el.editorProfileName.value.trim() || p.name;
        p.rules.duringFocus = el.rFocus.checked;

        const schedEnabled = el.rSched.checked;
        el.schedFields.hidden = !schedEnabled;
        el.days.hidden = !schedEnabled;

        const days = [];
        el.days.querySelectorAll('button[data-day]').forEach(btn => {
            if (btn.getAttribute('aria-pressed') === 'true') {
                days.push(Number(btn.dataset.day));
            }
        });
        p.rules.schedule = {
            enabled: schedEnabled,
            from: el.tFrom.value || '22:00',
            to: el.tTo.value || '07:00',
            days
        };

        const limitEnabled = el.rLimit.checked;
        el.limitFields.hidden = !limitEnabled;
        p.rules.dailyLimitMin = limitEnabled ? Math.max(5, parseInt(el.limitMin.value, 10) || 30) : null;

        this.renderConsequence();
    },

    renderConsequence: function() {
        const el = this.elements;
        if (!this.draftProfile || !el.consequence) return;
        const locale = typeof getLocale === 'function' ? getLocale() : 'pt';
        const details = BlockerCore.consequenceDetails(this.draftProfile, new Date(), locale);

        el.consequence.innerHTML = '';
        const titleB = document.createElement('b');
        titleB.textContent = details.title;
        el.consequence.appendChild(titleB);

        if (!details.hasRules) {
            el.consequence.appendChild(document.createTextNode(details.note));
            return;
        }

        const ul = document.createElement('ul');
        details.items.forEach((itemText, idx) => {
            const li = document.createElement('li');
            if (idx === 0 && details.immediate) {
                const parenIdx = itemText.indexOf('(');
                if (parenIdx > 0) {
                    const immSpan = document.createElement('span');
                    immSpan.className = 'imm';
                    immSpan.textContent = itemText.slice(0, parenIdx).trim();
                    li.append(immSpan, document.createTextNode(' ' + itemText.slice(parenIdx)));
                } else {
                    li.textContent = itemText;
                }
            } else {
                li.textContent = itemText;
            }
            ul.appendChild(li);
        });
        el.consequence.appendChild(ul);
    },

    saveEditor: async function() {
        if (!this.draftProfile) return;
        if (this.elements.siteInput.value.trim()) {
            this.addSiteFromInput();
        }
        this.syncEditorControlsToDraft();

        const savedProfile = BlockerCore.normalizeProfile(Object.assign({}, this.draftProfile, {
            enabled: this.draftProfile.sites.length > 0
        }));

        const savedEditorState = window.LeaveGuard
            ? LeaveGuard.snapshot(this.elements.editor) + JSON.stringify(savedProfile) : null;
        const next = JSON.parse(JSON.stringify(this.config));
        const idx = next.profiles.findIndex(p => p.id === this.editingProfileId);
        if (idx >= 0) {
            next.profiles[idx] = savedProfile;
        } else {
            next.profiles.push(savedProfile);
        }

        if (savedProfile.enabled && savedProfile.sites.length > 0) {
            next.enabled = true;
            next.reenableAt = null;
        }

        const ok = await this.applyAndSaveConfig(next, { source: 'editor' });
        if (ok) {
            this.isNewDraft = false;
            this.draftProfile = JSON.parse(JSON.stringify(savedProfile));
            this.elements.deleteProfileBtn.hidden = this.config.profiles.length <= 1;
            window.LeaveGuard?.savedEditor('protection', savedEditorState);
        }
    },

    confirmDeleteProfile: function() {
        if (!this.draftProfile) return;
        this.elements.deleteTitle.textContent = t('protection.delete_confirm_title', { name: this.draftProfile.name });
        DialogSystem.open(this.elements.deleteDialog, { opener: this.elements.deleteProfileBtn });
    },

    executeDeleteProfile: async function() {
        DialogSystem.close(this.elements.deleteDialog);
        if (!this.editingProfileId) return;
        const next = JSON.parse(JSON.stringify(this.config));
        next.profiles = next.profiles.filter(p => p.id !== this.editingProfileId);
        if (!next.profiles.some(p => p.enabled !== false && p.sites.length > 0)) {
            next.enabled = false;
        }
        const ok = await this.applyAndSaveConfig(next, { source: 'editor' });
        if (ok) {
            this.closeEditor();
        }
    },

    openAddProfileDialog: function() {
        const el = this.elements;
        el.customProfileName.value = '';
        const locale = typeof getLocale === 'function' ? getLocale() : 'pt';
        const frag = document.createDocumentFragment();

        BlockerCore.SUGGESTED_PROFILES.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'protecao-preset-btn';
            btn.innerHTML = `<i class="ph ${preset.icon}" aria-hidden="true"></i><div><strong style="display:block">${preset.name}</strong><span class="meta">${BlockerCore.describeProfileRule(preset, locale)} · ${preset.sites.join(', ')}</span></div>`;
            btn.addEventListener('click', () => {
                DialogSystem.close(el.addDialog);
                const existing = this.config.profiles.find(p => p.id === preset.id || p.name.toLowerCase() === preset.name.toLowerCase());
                if (existing) {
                    this.openEditor(existing, { isNew: false });
                } else {
                    const copy = BlockerCore.normalizeProfile(Object.assign({}, JSON.parse(JSON.stringify(preset)), { enabled: true }));
                    this.openEditor(copy, { isNew: true });
                }
            });
            frag.appendChild(btn);
        });

        el.presetList.replaceChildren(frag);
        DialogSystem.open(el.addDialog, { opener: el.addProfileBtn });
    },

    // ── Aplicação das regras DNR + Persistência (M11) ──

    buildCurrentDnrRules: function(cfg) {
        const blockedPageUrl = chrome.runtime.getURL('blocked.html');
        const ctx = this.evalContext(cfg);
        return BlockerCore.buildRulesFromProfiles(cfg.profiles, {
            blockedPageUrl,
            now: new Date(),
            enabled: Boolean(cfg.enabled),
            pausedUntil: cfg.reenableAt,
            focusActive: ctx.focusActive,
            screentime: this.screentime
        });
    },

    applyDnrRules: async function(cfg) {
        const debugData = await chrome.storage.local.get(['ora_debug_blocker_fail_save']);
        if (debugData.ora_debug_blocker_fail_save === true) {
            throw new Error('Simulated DNR update failure (ora_debug_blocker_fail_save)');
        }
        if (!chrome.declarativeNetRequest || typeof chrome.declarativeNetRequest.updateDynamicRules !== 'function') {
            throw new Error('declarativeNetRequest unavailable');
        }

        const addRules = this.buildCurrentDnrRules(cfg);
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const activeDomains = new Set(BlockerCore.flattenSites(cfg.profiles).map(s => s.url));
        const activeAllowRuleIds = new Set([...activeDomains].map(d => BlockerCore.allowRuleIdFor(d)));

        const removeRuleIds = existingRules
            .map(r => r.id)
            .filter(id => id < 1000 || !activeAllowRuleIds.has(id));

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds,
            addRules
        });
    },

    syncDnrRulesQuietly: async function() {
        if (!this.hasPermission || !this.config) return;
        try {
            await this.applyDnrRules(this.config);
        } catch (e) {
            console.warn('[Protecao] Initial DNR sync warning:', e);
        }
    },

    applyAndSaveConfig: async function(nextConfig, { source = 'editor' } = {}) {
        const el = this.elements;
        const normalized = this.normalizeConfig(nextConfig);

        try {
            // 1. Apply DNR rules first — if browser refuses, abort before saving!
            await this.applyDnrRules(normalized);

            // 2. Persist in chrome.storage.local
            await chrome.storage.local.set({ blocker_config: normalized });

            // 3. Notify Service Worker to reschedule transition & midnight alarms
            chrome.runtime.sendMessage({ action: 'blocker:sync' }).catch(() => {});

            this.config = normalized;
            this.lastFailedAttempt = null;
            el.editorErrorBanner.hidden = true;
            el.listError.hidden = true;

            this.render();
            if (window.ProtectionSystem) {
                ProtectionSystem.config = normalized;
                ProtectionSystem.render();
            }

            // Show "Salvo" only AFTER both DNR and storage succeed (M11)
            const badge = source === 'editor' ? el.saved : el.listSaved;
            if (badge) {
                badge.classList.add('show');
                clearTimeout(this._savedTimer);
                this._savedTimer = setTimeout(() => badge.classList.remove('show'), 2200);
            }
            return true;
        } catch (err) {
            console.error('[Protecao] Failed to apply and save rules:', err);
            this.lastFailedAttempt = () => this.applyAndSaveConfig(normalized, { source });
            if (source === 'editor') {
                el.saved.classList.remove('show');
                el.editorErrorBanner.hidden = false;
            } else {
                el.listSaved.classList.remove('show');
                el.listError.hidden = false;
            }
            return false;
        }
    },

    // ── Pausa contemplativa ───────────────────────────

    openContemplativePause: async function(opener) {
        const el = this.elements;
        if (this.lockVerses.length) {
            const v = this.lockVerses[Math.floor(Math.random() * this.lockVerses.length)];
            el.frictionVerseText.textContent = `“${l(v.text)}”`;
            el.frictionVerseRef.textContent = `— ${l(v.ref)}`;
        }
        this.frictionMinutes = 15;
        el.frictionDurationSeg.querySelectorAll('button[data-minutes]').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.minutes === '15'));
        });

        const debugFast = (await chrome.storage.local.get(['ora_debug_fast_friction'])).ora_debug_fast_friction === true;
        let remaining = debugFast ? 0 : 10;

        this.stopFrictionCountdown();
        if (remaining <= 0) {
            el.frictionConfirmBtn.disabled = false;
            this.updateFrictionConfirmLabel();
        } else {
            el.frictionConfirmBtn.disabled = true;
            el.frictionConfirmBtn.textContent = t('blocker.friction_breathe', { s: remaining });
            this.frictionInterval = setInterval(() => {
                remaining -= 1;
                if (remaining > 0) {
                    el.frictionConfirmBtn.textContent = t('blocker.friction_breathe', { s: remaining });
                } else {
                    this.stopFrictionCountdown();
                    el.frictionConfirmBtn.disabled = false;
                    this.updateFrictionConfirmLabel();
                }
            }, 1000);
        }

        DialogSystem.open(el.pauseDialog, {
            opener,
            onClose: () => this.stopFrictionCountdown()
        });
    },

    stopFrictionCountdown: function() {
        if (this.frictionInterval) {
            clearInterval(this.frictionInterval);
            this.frictionInterval = null;
        }
    },

    updateFrictionConfirmLabel: function() {
        const el = this.elements;
        if (el.frictionConfirmBtn.disabled) return;
        const pressed = el.frictionDurationSeg.querySelector('button[aria-pressed="true"]');
        const label = pressed ? pressed.textContent : '15 min';
        el.frictionConfirmBtn.textContent = t('blocker.friction_disable_for', { duration: label });
    },

    confirmContemplativePause: async function() {
        const el = this.elements;
        this.stopFrictionCountdown();
        const reenableAt = Date.now() + this.frictionMinutes * 60 * 1000;
        const next = JSON.parse(JSON.stringify(this.config));
        next.enabled = false;
        next.reenableAt = reenableAt;

        const ok = await this.applyAndSaveConfig(next, { source: 'list' });
        if (ok) {
            chrome.runtime.sendMessage({ action: 'blocker:scheduleReenable', reenableAt }).catch(() => {});
            DialogSystem.close(el.pauseDialog);
            showToast(t('toast.blocker_paused_until', { time: this.hhmm(reenableAt) }), 'info');
        }
    },

    resumeProtectionNow: async function() {
        const next = JSON.parse(JSON.stringify(this.config));
        next.enabled = true;
        next.reenableAt = null;
        const ok = await this.applyAndSaveConfig(next, { source: 'list' });
        if (ok) {
            chrome.runtime.sendMessage({ action: 'blocker:cancelReenable' }).catch(() => {});
            showToast(t('toast.blocker_activated'), 'success');
        }
    },

    // ── Trava de versículo ────────────────────────────

    requireUnlock: function(action, opener) {
        if (!this.isLocked()) {
            action();
            return;
        }
        this.pendingLockAction = action;
        const el = this.elements;
        el.lockConfigView.hidden = true;
        el.lockChallengeView.hidden = false;

        const idx = (this.config.lock && this.config.lock.verseIndex) || 0;
        const verse = this.lockVerses[idx] || this.lockVerses[0] || { ref: 'Fl 4, 13', text: 'Tudo posso naquele que me fortalece.' };
        this.activeLockVerseText = l(verse.text);
        el.lockVerseRef.textContent = l(verse.ref);
        el.lockVerseDisplay.textContent = this.activeLockVerseText;
        el.lockVerseInput.value = '';
        el.lockProgressFill.style.width = '0%';

        DialogSystem.open(el.lockDialog, { opener });
        setTimeout(() => el.lockVerseInput.focus({ preventScroll: true }), 60);
    },

    openLockConfig: function() {
        const el = this.elements;
        el.lockChallengeView.hidden = true;
        el.lockConfigView.hidden = false;
        el.lockToggle.checked = Boolean(this.config.lock && this.config.lock.enabled);
        this.renderLockPreview();
        DialogSystem.open(el.lockDialog, { opener: el.lockBtn });
    },

    renderLockPreview: function() {
        const el = this.elements;
        const enabled = Boolean(this.config.lock && this.config.lock.enabled);
        el.lockPreview.hidden = !enabled;
        if (enabled && this.lockVerses.length) {
            const v = this.lockVerses[this.config.lock.verseIndex] || this.lockVerses[0];
            el.lockPreviewVerse.textContent = `“${l(v.text)}”`;
            el.lockPreviewRef.textContent = `— ${l(v.ref)}`;
        }
    },

    normalizeVerseText: function(str) {
        return String(str || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    onLockVerseInput: function() {
        const el = this.elements;
        const target = this.normalizeVerseText(this.activeLockVerseText || '');
        const typed = this.normalizeVerseText(el.lockVerseInput.value);
        if (!target) return;

        let matchCount = 0;
        for (let i = 0; i < typed.length && i < target.length; i++) {
            if (typed[i] === target[i]) matchCount++;
            else break;
        }
        const pct = Math.min(100, Math.round((matchCount / target.length) * 100));
        el.lockProgressFill.style.width = `${pct}%`;

        if (typed === target) {
            this.unlockedInSession = true;
            const cb = this.pendingLockAction;
            this.pendingLockAction = null;
            DialogSystem.close(el.lockDialog);
            if (cb) cb();
        }
    },

    // ── Prévia ("Ver como aparece") ───────────────────

    openBlockPreview: function(kind, opener) {
        const el = this.elements;
        const firstSite = (this.config.profiles.find(p => p.sites.length > 0) || {}).sites?.[0] || 'instagram.com';
        const domain = kind === 'limit' ? 'youtube.com' : firstSite;

        el.previewFav.textContent = domain.charAt(0).toUpperCase();
        el.previewSite.textContent = domain;
        el.previewTempBox.hidden = true;
        el.previewActions.hidden = false;

        if (kind === 'focus') {
            el.previewKicker.textContent = t('blocked.focus_kicker');
            el.previewTitle.textContent = t('blocked.focus_title');
            el.previewWhy.textContent = t('blocked.focus_sub_task', { task: 'Preparar apresentação', min: 18 });
            el.previewUntil.textContent = t('blocked.focus_until', { time: '14:47' });
            el.previewPrimary.textContent = t('blocked.back_to_task');
            el.previewTempBtn.hidden = false;
            el.previewTempTitle.textContent = t('blocked.temp_title', { domain, min: 5 });
            el.previewTempNote.innerHTML = t('blocked.temp_note', { min: 5, rem: 2 });
            el.previewTempBack.textContent = t('blocked.back_to_task');
            el.previewTempOpen.textContent = t('blocked.open_5min', { min: 5 });
        } else if (kind === 'schedule') {
            el.previewKicker.textContent = t('blocked.schedule_kicker');
            el.previewTitle.textContent = t('blocked.schedule_title');
            el.previewWhy.textContent = t('blocked.schedule_sub', { profile: 'Redes sociais', from: '22:00', to: '07:00' });
            el.previewUntil.textContent = t('blocked.schedule_until', { when: t('blocked.tomorrow'), time: '07:00' });
            el.previewPrimary.textContent = t('blocked.back_to_ora');
            el.previewTempBtn.hidden = true;
        } else {
            el.previewKicker.textContent = t('blocked.limit_kicker');
            el.previewTitle.textContent = t('blocked.limit_title', { limit: 30 });
            el.previewWhy.textContent = t('blocked.limit_sub', { domain, profile: 'Vídeos', limit: 30 });
            el.previewUntil.textContent = t('blocked.limit_until');
            el.previewPrimary.textContent = t('blocked.back_to_ora');
            el.previewTempBtn.hidden = true;
        }

        DialogSystem.open(el.previewScrim, { opener });
    }
};

window.Blocker = Blocker;
