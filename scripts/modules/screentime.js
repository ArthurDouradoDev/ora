// ============================================================
// TEMPO DE TELA — bloco de Frutos (fase 5)
// ============================================================
// O SW mede o tempo por domínio (aba ativa, janela em foco, pessoa presente)
// e grava ora_screentime. Aqui o bloco abre pela pergunta; os números ficam
// atrás de "Ver o tempo de tela" e são só tempo, sem vermelho/verde, metas
// ou comparação com a média (E16). O período é o mesmo de Frutos.
// Dependências: AsyncStorage, ScreentimeCore, FrutosSystem (formatação), t().

const ScreenTimeSystem = {
    KEY: 'ora_screentime',
    TOP: 6,
    store: {},
    period: null,
    expanded: false,
    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.load();

        // Notificação de reflexão (13h/19h) da versão anterior: ?reflect=… → Frutos
        try {
            const params = new URLSearchParams(location.search);
            if (params.has('reflect')) {
                history.replaceState(history.state, '', location.pathname);
                RouterSystem.navigate('frutos/tela');
            }
        } catch (e) { /* URL API indisponível */ }
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            section: $('frutos-screen'),
            question: $('frutos-screen-question'),
            toggle: $('frutos-screen-toggle'),
            toggleLabel: $('frutos-screen-toggle-label'),
            body: $('frutos-screen-body'),
            stats: $('frutos-screen-stats'),
            domains: $('frutos-domains'),
            empty: $('frutos-screen-empty')
        };
    },

    bindEvents: function() {
        if (this.elements.toggle) {
            this.elements.toggle.addEventListener('click', () => this.setExpanded(!this.expanded));
        }
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[this.KEY]) return;
            this.store = changes[this.KEY].newValue || {};
            // O SW grava a cada troca de aba: só redesenha o que está aberto
            if (this.expanded && this.period && RouterSystem.current().view === 'frutos') this.renderBody();
        });
    },

    // Liquida a medição em curso no SW e lê o histórico
    load: async function() {
        try { await chrome.runtime.sendMessage({ type: 'screentime:flush' }); } catch (e) { /* SW indisponível */ }
        const store = await AsyncStorage.get(this.KEY, {});
        this.store = store && typeof store === 'object' ? store : {};
    },

    setExpanded: function(open) {
        this.expanded = !!open;
        this.renderToggle();
        if (this.expanded) this.renderBody();
    },

    questionKey: function(period) {
        const kind = period.kind === 'mes' ? 'month' : 'week';
        return `frutos.st_q_${kind}_${period.current ? 'current' : 'past'}`;
    },

    // period: summary.period de FrutosCore + days (lista de datas)
    render: function(period, days, monthName) {
        this.period = period;
        this.days = days;
        const el = this.elements;
        if (!el.section) return;
        el.question.textContent = t(this.questionKey(period), { month: monthName || '' });
        this.renderToggle();
        if (this.expanded) this.renderBody();
    },

    renderToggle: function() {
        const el = this.elements;
        el.toggle.setAttribute('aria-expanded', String(this.expanded));
        el.toggleLabel.textContent = t(this.expanded ? 'frutos.st_hide' : 'frutos.st_show');
        el.body.hidden = !this.expanded;
    },

    renderBody: function() {
        const el = this.elements;
        const agg = ScreentimeCore.aggregate(this.store, this.days);
        const duration = (sec) => FrutosSystem.durationSec(sec);

        const stats = [
            [t('frutos.st_total'), duration(agg.totalSec)],
            [t('frutos.st_avg'), agg.recordedDays ? duration(agg.avgSec) : '—'],
            [t('frutos.st_days'), String(agg.recordedDays)],
            [t('frutos.st_newtabs'), String(agg.newTabs)]
        ];
        const statFragment = document.createDocumentFragment();
        for (const [label, value] of stats) {
            const div = document.createElement('div');
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.className = 'tnum';
            dd.textContent = value;
            div.append(dt, dd);
            statFragment.appendChild(div);
        }
        el.stats.replaceChildren(statFragment);

        el.empty.hidden = agg.totalSec > 0;
        el.domains.hidden = agg.totalSec === 0;
        const { top, otherSec, otherCount } = ScreentimeCore.topDomains(agg.domains, this.TOP);
        const max = top.length ? top[0].sec : 1;
        const fragment = document.createDocumentFragment();
        const row = (name, sec) => {
            const li = document.createElement('li');
            const head = document.createElement('div');
            head.className = 'frutos-domain-head';
            const n = document.createElement('span');
            n.className = 'frutos-domain-name';
            n.textContent = name;
            const v = document.createElement('span');
            v.className = 'frutos-domain-time tnum';
            v.textContent = duration(sec);
            head.append(n, v);
            const track = document.createElement('div');
            track.className = 'frutos-domain-track';
            track.setAttribute('aria-hidden', 'true');
            const fill = document.createElement('span');
            fill.style.width = Math.max(2, Math.round((sec / max) * 100)) + '%';
            track.appendChild(fill);
            li.append(head, track);
            fragment.appendChild(li);
        };
        top.forEach(d => row(d.domain, d.sec));
        if (otherCount) row(t(otherCount === 1 ? 'frutos.st_other_one' : 'frutos.st_other', { n: otherCount }), otherSec);
        el.domains.replaceChildren(fragment);
    },

    // Rota frutos/tela (notificação ou link): abre o bloco e leva o foco até ele
    reveal: function() {
        this.setExpanded(true);
        const section = this.elements.section;
        if (!section) return;
        requestAnimationFrame(() => {
            section.scrollIntoView({ block: 'start', behavior: 'auto' });
            section.focus({ preventScroll: true });
        });
    }
};

window.ScreenTimeSystem = ScreenTimeSystem;
