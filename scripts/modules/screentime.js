// Screen Time Reflection — popup de reflexão sobre o uso digital.
// Dois momentos por dia (meridiano ~13h / noturno ~19h), disparados por
// notificação do sistema (ver sw.js). Mostra dados — não diagnóstico nem
// conselho — para que o usuário reflita e melhore por conta própria.
//
// Dependências globais: animateModal, isModalVisible, t, AsyncStorage, debounce.

const ScreenTimeSystem = {
    elements: {},
    state: { moment: 'midday', report: null },

    init: function() {
        this.cacheDOM();
        this.bindEvents();

        // Aberto a partir do clique na notificação? (?reflect=midday|evening)
        try {
            const params = new URLSearchParams(location.search);
            const reflect = params.get('reflect');
            if (reflect === 'midday' || reflect === 'evening') {
                const enabled = !window.SettingsSystem || window.SettingsSystem.isReminderEnabled('screentime');
                if (enabled) {
                    setTimeout(() => this.openReflection(reflect), 400);
                }
                // Limpa a URL para que um reload não reabra o popup.
                history.replaceState(null, '', location.pathname);
            }
        } catch (e) { /* URL API indisponível */ }

        console.log('[Ora] Screen Time System initialized');
    },

    cacheDOM: function() {
        this.elements.openBtn = document.getElementById('btn-screentime');
        this.elements.modal = document.getElementById('screentime-modal');
        this.elements.closeBtn = document.getElementById('close-screentime-btn');
        this.elements.title = document.getElementById('screentime-title');
        this.elements.subtitle = document.getElementById('screentime-subtitle');
        this.elements.newTabs = document.getElementById('screentime-newtabs');
        this.elements.total = document.getElementById('screentime-total');
        this.elements.compare = document.getElementById('screentime-compare');
        this.elements.bars = document.getElementById('screentime-bars');
        this.elements.empty = document.getElementById('screentime-empty');
        this.elements.questions = document.getElementById('screentime-questions');
    },

    bindEvents: function() {
        // Botão-ícone no header abre o popup manualmente. O momento (meridiano/
        // noturno) é escolhido pelo horário atual.
        if (this.elements.openBtn) {
            this.elements.openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isModalVisible(this.elements.modal)) {
                    this.close();
                } else {
                    const moment = new Date().getHours() < 17 ? 'midday' : 'evening';
                    this.openReflection(moment);
                }
            });
        }

        if (this.elements.closeBtn) {
            this.elements.closeBtn.addEventListener('click', () => this.close());
        }

        // Clique fora do painel fecha (textareas ficam dentro → não fecham).
        document.addEventListener('click', (e) => {
            if (this.elements.modal &&
                isModalVisible(this.elements.modal) &&
                !this.elements.modal.contains(e.target)) {
                this.close();
            }
        });
    },

    openReflection: async function(moment) {
        this.state.moment = (moment === 'evening') ? 'evening' : 'midday';

        let report = null;
        try {
            report = await chrome.runtime.sendMessage({ type: 'screentime:getReport' });
        } catch (e) {
            console.error('[Ora] Screen time report failed:', e);
        }
        this.state.report = (report && !report.error)
            ? report
            : { today: { domains: {}, newTabs: 0 }, averages: {}, avgDailyTotal: 0, prevDaysCount: 0 };

        this.render();
        animateModal(this.elements.modal, true);
    },

    close: function() {
        animateModal(this.elements.modal, false);
    },

    render: function() {
        const moment = this.state.moment;
        const r = this.state.report;
        const today = r.today || { domains: {}, newTabs: 0 };
        const domains = today.domains || {};

        if (this.elements.title) this.elements.title.textContent = t('screentime.title_' + moment);
        if (this.elements.subtitle) this.elements.subtitle.textContent = t('screentime.subtitle_' + moment);
        if (this.elements.newTabs) this.elements.newTabs.textContent = String(today.newTabs || 0);

        const totalSec = Object.values(domains).reduce((a, b) => a + b, 0);
        if (this.elements.total) this.elements.total.textContent = this.formatDuration(totalSec);
        if (this.elements.compare) this.elements.compare.textContent = this.buildComparison();

        this.renderBars(domains, r.averages || {});
        this.renderQuestions(moment);
    },

    // Destaca o domínio com maior alta vs a própria média diária anterior.
    buildComparison: function() {
        const r = this.state.report;
        if (!r || !r.prevDaysCount) return t('screentime.compare_none');

        const domains = (r.today && r.today.domains) || {};
        const averages = r.averages || {};
        let best = null;
        for (const [d, sec] of Object.entries(domains)) {
            const avg = averages[d];
            if (avg && avg > 60) { // ignora domínios marginais
                const ratio = (sec - avg) / avg;
                if (ratio > 0.15 && (!best || ratio > best.ratio)) {
                    best = { domain: d, ratio };
                }
            }
        }
        if (best) {
            return t('screentime.compare_highlight', { domain: best.domain, pct: Math.round(best.ratio * 100) });
        }
        return t('screentime.compare_ok');
    },

    renderBars: function(domains, averages) {
        const container = this.elements.bars;
        if (!container) return;
        container.innerHTML = '';

        const entries = Object.entries(domains).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
            if (this.elements.empty) this.elements.empty.style.display = 'block';
            container.style.display = 'none';
            return;
        }
        if (this.elements.empty) this.elements.empty.style.display = 'none';
        container.style.display = '';

        const top = entries.slice(0, 6);
        const max = top[0][1] || 1;

        for (const [domain, sec] of top) {
            const widthPct = Math.max(2, Math.round((sec / max) * 100));

            const row = document.createElement('div');
            row.className = 'st-bar-row';

            const head = document.createElement('div');
            head.className = 'st-bar-head';

            const name = document.createElement('span');
            name.className = 'st-bar-domain';
            name.textContent = domain;
            head.appendChild(name);

            const avg = averages[domain];
            if (avg && avg > 0) {
                const ratio = (sec - avg) / avg;
                const pctNum = Math.round(ratio * 100);
                const chip = document.createElement('span');
                chip.className = 'st-bar-delta ' + (ratio > 0.05 ? 'st-up' : (ratio < -0.05 ? 'st-down' : 'st-flat'));
                chip.textContent = (pctNum > 0 ? '+' : '') + pctNum + '%';
                head.appendChild(chip);
            }

            const time = document.createElement('span');
            time.className = 'st-bar-time';
            time.textContent = this.formatDuration(sec);
            head.appendChild(time);

            const track = document.createElement('div');
            track.className = 'st-bar-track';
            const fill = document.createElement('div');
            fill.className = 'st-bar-fill';
            fill.style.width = widthPct + '%';
            track.appendChild(fill);

            row.appendChild(head);
            row.appendChild(track);
            container.appendChild(row);
        }
    },

    renderQuestions: function(moment) {
        const container = this.elements.questions;
        if (!container) return;
        container.innerHTML = '';

        const raw = t('screentime.questions_' + moment);
        const list = Array.isArray(raw) ? raw : [];
        const dateStr = new Date().toDateString();

        list.forEach((q, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'st-question';

            const label = document.createElement('label');
            label.className = 'st-question-text';
            label.textContent = q;

            const ta = document.createElement('textarea');
            ta.className = 'st-question-input';
            ta.rows = 2;
            ta.placeholder = t('screentime.answer_placeholder');

            const key = `ora_screentime_reflection_${dateStr}_${moment}_${i}`;
            AsyncStorage.get(key).then(v => { if (v) ta.value = v; });

            const save = window.debounce((val) => AsyncStorage.set(key, val), 500);
            ta.addEventListener('input', (e) => save(e.target.value));

            wrap.appendChild(label);
            wrap.appendChild(ta);
            container.appendChild(wrap);
        });
    },

    formatDuration: function(sec) {
        sec = Math.round(sec || 0);
        if (sec < 60) return t('screentime.lt_minute');
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0 && m > 0) return `${h}h ${m}min`;
        if (h > 0) return `${h}h`;
        return `${m}min`;
    }
};

window.ScreenTimeSystem = ScreenTimeSystem;
