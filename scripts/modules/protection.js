// ============================================================
// PROTEÇÃO NO CABEÇALHO — pílula com o estado real e resumo
// ============================================================
// Lê blocker_config (o mesmo do bloqueador) e mostra: ativa, pausada até
// HH:MM, desligada ou sem sites. O popover resume cada site da lista e
// leva a "Gerenciar proteção". A tela de Proteção por perfis é da fase 4;
// até lá, "Gerenciar" abre o painel atual do bloqueador.

const ProtectionSystem = {
    config: null,
    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        const data = await chrome.storage.local.get(['blocker_config']);
        this.config = data.blocker_config || null;
        this.render();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.blocker_config) {
                this.config = changes.blocker_config.newValue || null;
                this.render();
            }
        });
        // A pausa termina sozinha: o rótulo "pausada até" precisa expirar
        setInterval(() => this.render(), 60000);
        window.addEventListener('ora:locale-changed', () => this.render());
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
            manage: $('protection-manage'),
            blockerModal: $('blocker-modal')
        };
    },

    bindEvents: function() {
        const el = this.elements;
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
            if (!el.popover.hidden && !el.popover.contains(e.target)) this.closePopover({ returnFocus: false });
        });
        el.popover.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.closePopover();
            }
        });
        // Foco que sai do popover o fecha (sem prender a navegação por Tab)
        el.popover.addEventListener('focusout', (e) => {
            if (e.relatedTarget && !el.popover.contains(e.relatedTarget) && e.relatedTarget !== el.chip) {
                this.closePopover({ returnFocus: false });
            }
        });

        // Painel do bloqueador (V0) fecha com clique fora, como antes
        document.addEventListener('click', (e) => {
            const modal = el.blockerModal;
            if (!modal || !isModalVisible(modal) || modal.contains(e.target)) return;
            if (modal.contains(document.activeElement) &&
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) return;
            animateModal(modal, false);
        });
        const closeBtn = document.getElementById('close-blocker-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => animateModal(el.blockerModal, false));
    },

    // Estado para a pílula, o popover e a preparação do foco
    status: function() {
        const cfg = this.config;
        const sites = cfg && Array.isArray(cfg.sites) ? cfg.sites : [];
        if (!sites.length) return { key: 'empty', sites };
        if (cfg.enabled) return { key: 'active', sites };
        if (cfg.reenableAt && cfg.reenableAt > Date.now()) return { key: 'paused', sites, until: cfg.reenableAt };
        return { key: 'off', sites };
    },

    hhmm: function(ms) {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    render: function() {
        const el = this.elements;
        const st = this.status();
        const labels = {
            active: t('protection.chip_active'),
            paused: t('protection.chip_paused', { time: st.until ? this.hhmm(st.until) : '' }),
            off: t('protection.chip_off'),
            empty: t('protection.chip_empty')
        };
        el.dot.className = 'dot' + (st.key === 'active' ? '' : st.key === 'paused' ? ' warn' : ' off');
        el.label.innerHTML = '';
        el.label.append(document.createTextNode(t('protection.title') + ' '));
        const state = document.createElement('span');
        state.className = 'chip-long';
        state.textContent = labels[st.key];
        el.label.appendChild(state);
        el.chip.setAttribute('aria-label', `${t('protection.title')} ${labels[st.key]}`);

        const summaries = {
            active: t('protection.summary_active', { n: st.sites.length }),
            paused: t('protection.summary_paused', { time: st.until ? this.hhmm(st.until) : '' }),
            off: t('protection.summary_off'),
            empty: t('protection.summary_empty')
        };
        el.summary.textContent = summaries[st.key];

        const fragment = document.createDocumentFragment();
        st.sites.slice(0, 8).forEach(site => {
            const li = document.createElement('li');
            const dot = document.createElement('span');
            dot.className = 'dot' + (st.key === 'active' && this.isBlockingNow(site) ? '' : ' off');
            dot.setAttribute('aria-hidden', 'true');
            const name = document.createElement('b');
            name.textContent = site.url;
            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = this.describeSite(site);
            li.append(dot, name, meta);
            fragment.appendChild(li);
        });
        if (st.sites.length > 8) {
            const li = document.createElement('li');
            li.className = 'meta';
            li.textContent = t('protection.more', { n: st.sites.length - 8 });
            fragment.appendChild(li);
        }
        el.list.replaceChildren(fragment);
        el.list.hidden = !st.sites.length;
        el.manage.textContent = t(st.sites.length ? 'protection.manage' : 'protection.choose_sites');

        window.dispatchEvent(new CustomEvent('ora:protection', { detail: st }));
    },

    isBlockingNow: function(site) {
        if (site.mode !== 'limited') return true;
        if (site.scheduleLimit && site.scheduleLimit.enabled && BlockerCore.isWithinBlockedSchedule(site.scheduleLimit)) return true;
        return !!(site.accessLimit && site.accessLimit.enabled && site.accessLimit.count > 0 &&
            (site.todayAccesses || 0) >= site.accessLimit.count);
    },

    describeSite: function(site) {
        if (site.mode !== 'limited') return t('protection.site_always');
        const parts = [];
        const sched = site.scheduleLimit;
        if (sched && sched.enabled && Array.isArray(sched.schedules)) {
            sched.schedules.forEach(w => {
                parts.push(t('protection.site_schedule', {
                    from: `${String(w.fromHour).padStart(2, '0')}:${String(w.fromMinute || 0).padStart(2, '0')}`,
                    to: `${String(w.toHour).padStart(2, '0')}:${String(w.toMinute || 0).padStart(2, '0')}`
                }));
            });
        }
        const limit = site.accessLimit;
        if (limit && limit.enabled && limit.count > 0) {
            parts.push(t(limit.period === 'hour' ? 'protection.site_limit_hour' : 'protection.site_limit_day', {
                used: site.todayAccesses || 0, n: limit.count
            }));
        }
        return parts.length ? parts.join(' · ') : t('protection.site_free');
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

    // Painel atual do bloqueador (fase 4 traz a subtela Proteção)
    openManager: function() {
        const modal = this.elements.blockerModal;
        if (!modal || !window.Blocker) return;
        if (!isModalVisible(modal)) {
            animateModal(modal, true);
            if (typeof Blocker.onModalOpen === 'function') Blocker.onModalOpen();
        }
    }
};

window.ProtectionSystem = ProtectionSystem;
