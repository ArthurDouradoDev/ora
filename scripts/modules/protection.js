// ============================================================
// PROTEÇÃO NO CABEÇALHO — pílula com o estado real e resumo por perfil (Fase 4)
// ============================================================
// Lê blocker_config, ora_pomodoro_state e ora_screentime e mostra na pílula:
// ativa, em foco, pausada até HH:MM, sem permissão, desligada ou sem sites.
// O popover resume cada perfil com sua regra/uso do dia e leva a #protecao.

const ProtectionSystem = {
    config: null,
    pomodoro: null,
    screentime: null,
    hasPermission: true,
    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.refreshState();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.blocker_config || changes.ora_pomodoro_state || changes.ora_screentime || changes.ora_debug_blocker_no_permission) {
                this.refreshState();
            }
        });

        window.addEventListener('ora:pomodoro', (e) => {
            this.pomodoro = e.detail || null;
            this.render();
        });
        window.addEventListener('ora:blocker-permission', (e) => {
            if (e.detail && typeof e.detail.hasPermission === 'boolean') {
                this.hasPermission = e.detail.hasPermission;
                this.render();
            }
        });
        window.addEventListener('ora:locale-changed', () => this.render());

        // A pausa e as janelas de horário mudam com o relógio
        setInterval(() => this.render(), 30000);
    },

    refreshState: async function() {
        const data = await chrome.storage.local.get([
            'blocker_config',
            'ora_pomodoro_state',
            'ora_screentime',
            'ora_debug_blocker_no_permission'
        ]);
        this.config = data.blocker_config || null;
        this.pomodoro = data.ora_pomodoro_state || null;
        this.screentime = data.ora_screentime || null;
        this.hasPermission = await this.checkPermission(data.ora_debug_blocker_no_permission);
        this.render();
    },

    checkPermission: async function(debugNoPermFlag) {
        if (debugNoPermFlag === true) return false;
        if (!chrome.declarativeNetRequest || typeof chrome.declarativeNetRequest.updateDynamicRules !== 'function') {
            return false;
        }
        if (chrome.permissions && typeof chrome.permissions.contains === 'function') {
            try {
                const granted = await chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] });
                if (!granted) return false;
            } catch (e) {
                // Ignore if permissions API is restricted in this context
            }
        }
        return true;
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            chip: $('protection-chip'),
            dot: $('protection-dot'),
            label: $('protection-label'),
            popover: $('protection-popover'),
            summary: $('protection-summary'),
            list: $('protection-list'),
            manage: $('protection-manage')
        };
    },

    bindEvents: function() {
        const el = this.elements;
        if (!el.chip) return;

        el.chip.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePopover();
        });
        el.manage.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePopover({ returnFocus: false });
            this.openManager();
        });
        document.addEventListener('click', (e) => {
            if (!el.popover.hidden && !el.popover.contains(e.target) && e.target !== el.chip) {
                this.closePopover({ returnFocus: false });
            }
        });
        el.popover.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.closePopover();
            }
        });
        el.popover.addEventListener('focusout', (e) => {
            if (e.relatedTarget && !el.popover.contains(e.relatedTarget) && e.relatedTarget !== el.chip) {
                this.closePopover({ returnFocus: false });
            }
        });
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

    // Estado para a pílula, o popover e a preparação do foco
    status: function() {
        const cfg = this.config;
        const profiles = BlockerCore.profilesFromConfig(cfg);
        const sites = BlockerCore.flattenSites(profiles);

        if (!this.hasPermission) {
            return { key: 'no-perm', sites, profiles };
        }
        if (!sites.length) {
            return { key: 'empty', sites, profiles };
        }
        if (cfg && cfg.reenableAt && cfg.reenableAt > Date.now()) {
            return { key: 'paused', sites, profiles, until: cfg.reenableAt };
        }
        if (this.isFocusBlocking() && profiles.some(p => p.enabled !== false && p.rules.duringFocus && p.sites.length > 0)) {
            return { key: 'focus', sites, profiles, until: this.focusEndsAt() };
        }
        if (cfg && cfg.enabled) {
            return { key: 'active', sites, profiles };
        }
        return { key: 'off', sites, profiles };
    },

    hhmm: function(ms) {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    describeProfileForPopover: function(profile, ev) {
        if (profile.enabled === false) return t('protection.popover_disabled');
        if (ev.blocked) {
            if (ev.reason === 'focus') return t('protection.popover_blocked_focus');
            if (ev.reason === 'schedule') {
                return t('protection.popover_blocked_sched', { to: BlockerCore.formatShortHour(ev.untilTime || profile.rules.schedule.to) });
            }
            if (ev.reason === 'limit') {
                return t('protection.popover_blocked_limit', { limit: ev.limitMin });
            }
        }
        if (ev.limitMin) {
            return t('protection.popover_used_today', { used: ev.usedMin, limit: ev.limitMin });
        }
        const r = profile.rules || {};
        const sched = r.schedule && r.schedule.enabled ? r.schedule : null;
        if (r.duringFocus && sched) {
            return t('protection.popover_free_focus_sched', {
                from: BlockerCore.formatShortHour(sched.from),
                to: BlockerCore.formatShortHour(sched.to)
            });
        }
        if (r.duringFocus) return t('protection.popover_free_focus');
        if (sched) {
            return t('protection.popover_free_sched', {
                from: BlockerCore.formatShortHour(sched.from),
                to: BlockerCore.formatShortHour(sched.to)
            });
        }
        const locale = typeof getLocale === 'function' ? getLocale() : 'pt';
        return BlockerCore.describeProfileRule(profile, locale);
    },

    render: function() {
        const el = this.elements;
        if (!el.chip) return;
        const st = this.status();
        const labels = {
            active: t('protection.chip_active'),
            focus: '· ' + t('protection.chip_focus'),
            paused: t('protection.chip_paused', { time: st.until ? this.hhmm(st.until) : '' }),
            'no-perm': t('protection.chip_no_perm'),
            off: t('protection.chip_off'),
            empty: t('protection.chip_empty')
        };

        let dotClass = 'dot off';
        if (st.key === 'active' || st.key === 'focus') dotClass = 'dot';
        else if (st.key === 'paused') dotClass = 'dot warn';
        else if (st.key === 'no-perm') dotClass = 'dot err';

        el.dot.className = dotClass;
        el.label.innerHTML = '';
        el.label.append(document.createTextNode(t('protection.title') + ' '));
        const state = document.createElement('span');
        state.className = 'chip-long';
        state.textContent = labels[st.key] || labels.off;
        el.label.appendChild(state);
        el.chip.setAttribute('aria-label', `${t('protection.title')} ${labels[st.key] || ''}`.trim());

        const summaries = {
            active: t('protection.summary_active', { n: st.sites.length }),
            focus: t('protection.summary_focus'),
            paused: t('protection.summary_paused', { time: st.until ? this.hhmm(st.until) : '' }),
            'no-perm': t('protection.summary_no_perm'),
            off: t('protection.summary_off'),
            empty: t('protection.summary_empty')
        };
        el.summary.textContent = summaries[st.key] || summaries.off;

        const locale = typeof getLocale === 'function' ? getLocale() : 'pt';
        const evalCtx = {
            locale,
            hasPermission: this.hasPermission,
            enabled: Boolean(this.config && this.config.enabled),
            pausedUntil: this.config && this.config.reenableAt ? this.config.reenableAt : null,
            focusActive: this.isFocusBlocking(),
            focusEndsAt: this.focusEndsAt(),
            screentime: this.screentime
        };

        const fragment = document.createDocumentFragment();
        const visibleProfiles = st.profiles.filter(p => p.sites.length > 0);
        visibleProfiles.forEach(profile => {
            const ev = BlockerCore.evaluateProfile(profile, evalCtx, new Date());
            const li = document.createElement('li');
            const dot = document.createElement('span');
            let pDot = 'dot off';
            if (ev.blocked) pDot = ev.reason === 'limit' ? 'dot warn' : 'dot';
            else if (profile.enabled !== false && st.key === 'active') pDot = 'dot';
            dot.className = pDot;
            dot.setAttribute('aria-hidden', 'true');

            const name = document.createElement('b');
            name.textContent = profile.name;

            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = this.describeProfileForPopover(profile, ev);

            li.append(dot, name, meta);
            fragment.appendChild(li);
        });

        el.list.replaceChildren(fragment);
        el.list.hidden = visibleProfiles.length === 0;
        el.manage.textContent = t(st.sites.length ? 'protection.manage' : 'protection.choose_sites');

        window.dispatchEvent(new CustomEvent('ora:protection', { detail: st }));
    },

    togglePopover: function() {
        if (this.elements.popover.hidden) this.openPopover();
        else this.closePopover();
    },

    openPopover: function() {
        this.render();
        this.elements.popover.hidden = false;
        this.elements.chip.setAttribute('aria-expanded', 'true');
        this.elements.manage.focus({ preventScroll: true });
    },

    closePopover: function({ returnFocus = true } = {}) {
        if (this.elements.popover.hidden) return;
        this.elements.popover.hidden = true;
        this.elements.chip.setAttribute('aria-expanded', 'false');
        if (returnFocus) this.elements.chip.focus({ preventScroll: true });
    },

    openManager: function() {
        if (window.RouterSystem) {
            RouterSystem.navigate('protecao');
        }
    }
};

window.ProtectionSystem = ProtectionSystem;
