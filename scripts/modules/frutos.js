// ============================================================
// FRUTOS — o que ficou do tempo, por semana ou mês (fase 5)
// ============================================================
// Três níveis, como no protótipo 05-frutos-ritual: período → síntese em frase
// (com os dias e o "Sem registro" neutro) → pergunta para refletir. Abaixo,
// "Detalhes de uso" e o bloco de tempo de tela. Os dados vêm de FrutosCore
// (sessões do SW, práticas registradas, exames e tempo de tela). Nada aqui
// usa cor para julgar: só o dourado do tempo oferecido e o roxo do exame,
// sempre com texto ao lado.
// Dependências: AsyncStorage, FrutosCore, ScreenTimeSystem, LeaveGuard, t().

const FrutosSystem = {
    KEYS: {
        sessions: 'ora_sessions',
        practices: 'ora_practice_log',
        exams: 'ora_exam_logs',
        tasks: 'ora_tasks',
        history: 'ora_tasks_history',
        importedDays: 'ora_imported_active_days',
        reflections: 'ora_reflections'
    },

    kind: 'semana',
    offset: 0,
    questionShift: 0,
    data: {},
    reflections: [],
    unsaved: {},        // texto ainda não guardado, por período
    period: null,
    summary: null,
    saving: false,
    savedTimer: null,
    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.loadData();
        window.LeaveGuard?.watchEditor('frutos-reflection', this,
            () => (this.hasUnsaved() ? 'dirty' : ''), () => true);
        const route = RouterSystem.current();
        if (route && route.view === 'frutos') this.show(route);
        // Virada do dia sem nova aba
        this.day = FrutosCore.dayKey(Date.now());
        setInterval(() => {
            const day = FrutosCore.dayKey(Date.now());
            if (day !== this.day) {
                this.day = day;
                if (RouterSystem.current().view === 'frutos') this.render();
            }
        }, 60000);
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            view: $('view-frutos'),
            scroll: $('frutos-scroll'),
            period: $('frutos-period'),
            prev: $('frutos-prev'),
            next: $('frutos-next'),
            rangeLabel: $('frutos-range-label'),
            synth: $('frutos-synth'),
            emptyHint: $('frutos-empty-hint'),
            chart: $('frutos-chart'),
            counter: $('frutos-counter'),
            counterN: $('frutos-counter-n'),
            usageTable: $('frutos-usage-table'),
            question: $('frutos-question'),
            reflection: $('frutos-reflection'),
            save: $('frutos-save'),
            other: $('frutos-other'),
            saved: $('frutos-saved'),
            savedText: $('frutos-saved-text'),
            saveError: $('frutos-save-error'),
            saveRetry: $('frutos-save-retry'),
            past: $('frutos-past'),
            pastLabel: $('frutos-past-label'),
            pastList: $('frutos-past-list')
        };
    },

    bindEvents: function() {
        const el = this.elements;
        el.period.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-period]');
            if (!btn || btn.dataset.period === this.kind) return;
            this.kind = btn.dataset.period;
            this.offset = 0;
            this.questionShift = 0;
            this.render();
        });
        el.prev.addEventListener('click', () => this.shift(-1));
        el.next.addEventListener('click', () => this.shift(1));

        el.reflection.addEventListener('input', () => {
            if (!this.period) return;
            this.unsaved[FrutosCore.reflectionKey(this.period)] = el.reflection.value;
            el.saved.classList.remove('show');
        });
        el.save.addEventListener('click', () => this.saveReflection());
        el.saveRetry.addEventListener('click', () => this.saveReflection());
        el.other.addEventListener('click', () => {
            this.questionShift += 1;
            this.renderQuestion(true);
        });

        window.addEventListener('ora:route', (e) => {
            if (e.detail && e.detail.view === 'frutos') this.show(e.detail);
        });
        window.addEventListener('ora:locale-changed', () => {
            if (RouterSystem.current().view === 'frutos') this.render();
        });

        const watched = new Set(Object.values(this.KEYS));
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            const cleared = !!changes.ora_reflections_cleared_at;
            if (cleared) {
                this.unsaved = {};
                this.elements.reflection.value = '';
                this.elements.saved.classList.remove('show');
            }
            let changed = cleared;
            for (const [key, change] of Object.entries(changes)) {
                if (!watched.has(key)) continue;
                const name = Object.keys(this.KEYS).find(k => this.KEYS[k] === key);
                if (name === 'reflections') this.reflections = Array.isArray(change.newValue) ? change.newValue : [];
                else this.data[name] = change.newValue;
                changed = true;
            }
            if (changed && RouterSystem.current().view === 'frutos') this.render({ keepText: true });
        });
    },

    loadData: async function() {
        const keys = Object.values(this.KEYS);
        let stored = {};
        try { stored = await chrome.storage.local.get(keys); } catch (e) { console.error('[Frutos] Load failed:', e); }
        for (const [name, key] of Object.entries(this.KEYS)) {
            if (name === 'reflections') continue;
            this.data[name] = stored[key];
        }
        this.reflections = Array.isArray(stored[this.KEYS.reflections]) ? stored[this.KEYS.reflections] : [];
    },

    show: async function(route) {
        await Promise.all([this.loadData(), window.ScreenTimeSystem ? ScreenTimeSystem.load() : null]);
        this.render();
        if (route && route.path && route.path[0] === 'tela' && window.ScreenTimeSystem) ScreenTimeSystem.reveal();
    },

    shift: function(delta) {
        const next = Math.min(0, this.offset + delta);
        if (next === this.offset) return;
        this.offset = next;
        this.questionShift = 0;
        this.render();
    },

    // --- Formatação ---

    localeTag: function() {
        return { pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[window._i18nLocale || 'pt'] || 'pt-BR';
    },

    capitalize: function(text) {
        return text ? text.charAt(0).toLocaleUpperCase(this.localeTag()) + text.slice(1) : text;
    },

    parseIso: function(iso) {
        const [y, m, d] = String(iso).split('-').map(Number);
        return new Date(y, m - 1, d);
    },

    durationMin: function(minutes) {
        const total = Math.max(0, Math.round(Number(minutes) || 0));
        const h = Math.floor(total / 60);
        const m = total % 60;
        if (h && m) return t('frutos.dur_hm', { h, m: String(m).padStart(2, '0') });
        if (h) return t('frutos.dur_h', { h });
        return t('frutos.dur_m', { m });
    },

    durationSec: function(seconds) {
        const sec = Math.round(Number(seconds) || 0);
        if (sec < 60) return t('frutos.lt_minute');
        return this.durationMin(Math.floor(sec / 60));
    },

    rangeText: function(startIso, lastIso, kind) {
        const start = this.parseIso(startIso);
        if (kind === 'mes') {
            return this.capitalize(new Intl.DateTimeFormat(this.localeTag(), { month: 'long', year: 'numeric' }).format(start));
        }
        const last = this.parseIso(lastIso);
        const fmt = new Intl.DateTimeFormat(this.localeTag(), { day: 'numeric', month: 'long' });
        return typeof fmt.formatRange === 'function' ? fmt.formatRange(start, last) : `${fmt.format(start)} – ${fmt.format(last)}`;
    },

    monthName: function(startIso) {
        return new Intl.DateTimeFormat(this.localeTag(), { month: 'long' }).format(this.parseIso(startIso));
    },

    weekdayShort: function(iso) {
        return new Intl.DateTimeFormat(this.localeTag(), { weekday: 'short' }).format(this.parseIso(iso)).replace(/\.$/, '');
    },

    dayLong: function(iso) {
        return this.capitalize(new Intl.DateTimeFormat(this.localeTag(), { weekday: 'long', day: 'numeric', month: 'long' }).format(this.parseIso(iso)));
    },

    // Descrição do dia para leitores de tela e para o title
    dayDetail: function(day) {
        if (day.future) return t('frutos.day_future');
        if (day.none) return t('frutos.no_record');
        const parts = [];
        if (day.focusMin > 0) parts.push(t('frutos.day_focus', { time: this.durationMin(day.focusMin) }));
        if (day.rosary) parts.push(t('frutos.day_rosary'));
        else if (day.prayer) parts.push(t('frutos.day_prayer'));
        if (day.exam) parts.push(t('frutos.day_exam'));
        return this.list(parts);
    },

    list: function(items) {
        try { return new Intl.ListFormat(this.localeTag(), { style: 'long', type: 'conjunction' }).format(items); }
        catch (e) { return items.join(', '); }
    },

    // --- Desenho ---

    render: function({ keepText = false } = {}) {
        const now = new Date();
        const prevKey = this.period ? FrutosCore.reflectionKey(this.period) : null;
        const range = FrutosCore.periodRange(this.kind, now, this.offset);
        this.period = range;
        this.summary = FrutosCore.summarize(range, {
            sessions: this.data.sessions,
            practices: this.data.practices,
            exams: this.data.exams,
            screentime: window.ScreenTimeSystem ? ScreenTimeSystem.store : {},
            tasks: this.data.tasks,
            taskHistory: this.data.history,
            extraDays: this.data.importedDays,
            now
        });

        this.renderHead();
        this.renderSynth();
        this.renderChart();
        this.renderCounter();
        this.renderUsage();
        const samePeriod = prevKey === FrutosCore.reflectionKey(range);
        this.renderReflection(!(keepText && samePeriod));
        this.renderPast();
        if (window.ScreenTimeSystem) ScreenTimeSystem.render(this.summary.period, range.days, this.monthName(range.startIso));
    },

    renderHead: function() {
        const el = this.elements;
        el.period.querySelectorAll('[data-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === this.kind)));
        el.rangeLabel.textContent = this.rangeText(this.period.startIso, this.period.lastIso, this.kind);
        el.next.disabled = this.offset >= 0;
        el.prev.setAttribute('aria-label', t(this.kind === 'mes' ? 'frutos.prev_month' : 'frutos.prev_week'));
        el.next.setAttribute('aria-label', t(this.kind === 'mes' ? 'frutos.next_month' : 'frutos.next_week'));
    },

    renderSynth: function() {
        const el = this.elements;
        const s = this.summary;
        const current = s.period.current;
        const kindKey = this.kind === 'mes' ? 'month' : 'week';
        el.emptyHint.hidden = !s.empty;
        if (s.empty) {
            el.synth.textContent = t(`frutos.empty_${kindKey}_${current ? 'current' : 'past'}`, { month: this.monthName(s.period.startIso) });
            return;
        }

        const lead = this.kind === 'mes'
            ? t('frutos.lead_month', { month: this.monthName(s.period.startIso) })
            : t(current ? 'frutos.lead_week_current' : 'frutos.lead_week_past');
        const parts = FrutosCore.synthesisParts(s).map(p => this.partText(p));
        const fragment = document.createDocumentFragment();
        fragment.appendChild(document.createTextNode(lead + ' '));

        let pieces;
        try {
            pieces = new Intl.ListFormat(this.localeTag(), { style: 'long', type: 'conjunction' })
                .formatToParts(parts.map((_, i) => String(i)));
        } catch (e) {
            pieces = [];
            parts.forEach((_, i) => {
                if (i) pieces.push({ type: 'literal', value: ', ' });
                pieces.push({ type: 'element', value: String(i) });
            });
        }
        for (const piece of pieces) {
            if (piece.type !== 'element') {
                fragment.appendChild(document.createTextNode(piece.value));
                continue;
            }
            const part = parts[Number(piece.value)];
            const b = document.createElement('b');
            b.textContent = part.strong;
            fragment.appendChild(b);
            if (part.rest) fragment.appendChild(document.createTextNode(part.rest));
        }
        fragment.appendChild(document.createTextNode('.'));
        el.synth.replaceChildren(fragment);
    },

    partText: function(p) {
        const plural = (base, n) => t(`frutos.${base}${n === 1 ? '_one' : ''}`, { n });
        switch (p.kind) {
            case 'sessions': return { strong: plural('part_sessions', p.n), rest: ` (${this.durationMin(p.minutes)})` };
            case 'focus': return { strong: t('frutos.part_focus', { time: this.durationMin(p.minutes) }), rest: '' };
            case 'rosary': return { strong: plural('part_rosary', p.n), rest: '' };
            case 'prayer': return { strong: plural('part_prayer', p.n), rest: '' };
            case 'exams': return { strong: plural('part_exams', p.n), rest: '' };
            default: return { strong: '', rest: '' };
        }
    },

    srText: function(text) {
        const span = document.createElement('span');
        span.className = 'sr-only';
        span.textContent = text;
        return span;
    },

    renderChart: function() {
        if (this.kind === 'mes') this.renderMonth();
        else this.renderWeek();
    },

    renderWeek: function() {
        const days = this.summary.days;
        const max = Math.max(60, ...days.map(d => d.focusMin));
        const ol = document.createElement('ol');
        ol.className = 'frutos-strip';
        ol.setAttribute('aria-label', t('frutos.chart_week'));
        for (const day of days) {
            const li = document.createElement('li');
            li.className = 'frutos-day' + (day.none && !day.future ? ' none' : '') + (day.future ? ' future' : '') + (day.today ? ' is-today' : '');
            const detail = this.dayDetail(day);
            li.title = detail;

            const box = document.createElement('span');
            box.className = 'barbox';
            box.setAttribute('aria-hidden', 'true');
            if (day.focusMin > 0) {
                const bar = document.createElement('span');
                bar.style.height = Math.max(4, Math.round((day.focusMin / max) * 100)) + '%';
                box.appendChild(bar);
            }
            const marks = document.createElement('span');
            marks.className = 'marks';
            marks.setAttribute('aria-hidden', 'true');
            if (day.prayer) marks.appendChild(Object.assign(document.createElement('i'), { className: 'm-prayer' }));
            if (day.exam) marks.appendChild(Object.assign(document.createElement('i'), { className: 'm-exam' }));
            const lbl = document.createElement('span');
            lbl.className = 'lbl';
            lbl.setAttribute('aria-hidden', 'true');
            lbl.textContent = `${this.weekdayShort(day.date)} ${day.dayOfMonth}`;

            li.append(box, marks, lbl, this.srText(`${this.dayLong(day.date)}: ${detail}`));
            ol.appendChild(li);
        }
        this.elements.chart.replaceChildren(ol);
        this.growBars(ol);
    },

    // As barras da semana crescem da base uma vez por aba (P7), quando o
    // Frutos está à vista; atualizações seguintes não animam. Só transform.
    growBars: function(ol) {
        if (this._barsGrown || !window.Motion || RouterSystem.current().view !== 'frutos') return;
        this._barsGrown = true;
        ol.querySelectorAll('.barbox span').forEach((bar, i) => {
            Motion.play(bar, [{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 520, delay: 120 + i * 30, fill: 'backwards' });
        });
    },

    renderMonth: function() {
        const days = this.summary.days;
        const wrap = document.createElement('div');
        wrap.className = 'frutos-month-wrap';

        const head = document.createElement('div');
        head.className = 'frutos-month-head';
        head.setAttribute('aria-hidden', 'true');
        // Segunda a domingo (2026-11-02 é segunda)
        for (let i = 0; i < 7; i++) {
            const span = document.createElement('span');
            span.textContent = this.weekdayShort(FrutosCore.isoDate(new Date(2026, 10, 2 + i)));
            head.appendChild(span);
        }

        const ol = document.createElement('ol');
        ol.className = 'frutos-month';
        ol.setAttribute('aria-label', this.rangeText(this.period.startIso, this.period.lastIso, 'mes'));
        const lead = (days[0].weekday + 6) % 7;
        for (let i = 0; i < lead; i++) {
            const blank = document.createElement('li');
            blank.className = 'blank';
            blank.setAttribute('aria-hidden', 'true');
            ol.appendChild(blank);
        }
        for (const day of days) {
            const li = document.createElement('li');
            const level = FrutosCore.monthLevel(day);
            li.className = `c ${level}` + (day.prayer ? ' p' : '') + (day.exam ? ' x' : '') + (day.today ? ' is-today' : '');
            const detail = this.dayDetail(day);
            li.title = detail;
            const n = document.createElement('span');
            n.setAttribute('aria-hidden', 'true');
            n.textContent = String(day.dayOfMonth);
            li.append(n, this.srText(`${this.dayLong(day.date)}: ${detail}`));
            ol.appendChild(li);
        }
        wrap.append(head, ol);
        this.elements.chart.replaceChildren(wrap);
    },

    renderCounter: function() {
        const n = this.summary.daysWithOra;
        this.elements.counter.hidden = !(n > 0);
        if (n > 0) this.elements.counterN.textContent = String(n);
    },

    renderUsage: function() {
        const table = this.elements.usageTable;
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        for (const key of ['col_day', 'col_focus', 'col_prayer', 'col_exam', 'col_screen']) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = t('frutos.' + key);
            hr.appendChild(th);
        }
        thead.appendChild(hr);
        const tbody = document.createElement('tbody');
        const cell = (text, cls) => {
            const td = document.createElement('td');
            if (cls) td.className = cls;
            td.textContent = text;
            return td;
        };
        for (const day of this.summary.days.filter(d => !d.future)) {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            th.scope = 'row';
            th.textContent = `${this.weekdayShort(day.date)} ${day.dayOfMonth}`;
            tr.appendChild(th);
            if (day.none) {
                const na = cell(t('frutos.no_record'), 'na');
                na.colSpan = 3;
                tr.appendChild(na);
            } else {
                tr.appendChild(cell(day.focusMin ? this.durationMin(day.focusMin) : '—', 'tnum'));
                tr.appendChild(cell(day.rosary ? t('frutos.rosary_short') : (day.prayer ? t('frutos.yes') : '—')));
                tr.appendChild(cell(day.exams > 1 ? String(day.exams) : (day.exam ? t('frutos.yes') : '—')));
            }
            tr.appendChild(cell(day.screenSec ? this.durationSec(day.screenSec) : '—', 'tnum'));
            tbody.appendChild(tr);
        }
        table.replaceChildren(thead, tbody);
    },

    // --- Para refletir ---

    questions: function() {
        const list = t('frutos.questions');
        return Array.isArray(list) && list.length ? list : [t('frutos.question_fallback')];
    },

    currentReflection: function() {
        return FrutosCore.findReflection(this.reflections, FrutosCore.reflectionKey(this.period));
    },

    questionText: function() {
        const saved = this.currentReflection();
        const list = this.questions();
        if (saved && saved.question && this.questionShift === 0) return saved.question;
        return list[FrutosCore.questionIndex(this.period, list.length, this.questionShift)];
    },

    renderQuestion: function() {
        this.elements.question.textContent = this.questionText();
    },

    renderReflection: function(replaceText) {
        const el = this.elements;
        this.renderQuestion();
        const key = FrutosCore.reflectionKey(this.period);
        const saved = this.currentReflection();
        if (replaceText && document.activeElement !== el.reflection) {
            el.reflection.value = key in this.unsaved ? this.unsaved[key] : (saved ? saved.text : '');
        }
        el.saveError.hidden = true;
    },

    hasUnsaved: function() {
        return Object.entries(this.unsaved).some(([key, text]) => {
            const saved = FrutosCore.findReflection(this.reflections, key);
            return String(text).trim() !== (saved ? saved.text : '');
        });
    },

    saveReflection: async function() {
        if (this.saving || !this.period) return;
        const el = this.elements;
        const period = this.period;
        const key = FrutosCore.reflectionKey(period);
        const text = el.reflection.value;
        const question = this.questionText();
        const saved = this.currentReflection();
        if (!text.trim() && !saved) {
            el.reflection.focus();
            return;
        }
        this.saving = true;
        el.save.disabled = true;
        el.saveError.hidden = true;
        const next = FrutosCore.upsertReflection(this.reflections, {
            key, kind: period.kind, start: period.startIso, last: period.lastIso, question, text, savedAt: Date.now()
        });
        try {
            const ok = await AsyncStorage.set(this.KEYS.reflections, next);
            if (!ok) {
                // A falha fica visível e o texto continua no campo
                el.saveError.hidden = false;
                return;
            }
            this.reflections = next;
            delete this.unsaved[key];
            this.questionShift = 0;
            this.renderQuestion();
            this.renderPast();
            el.savedText.textContent = t(text.trim() ? 'frutos.saved' : 'frutos.removed');
            el.saved.classList.add('show');
            clearTimeout(this.savedTimer);
            this.savedTimer = setTimeout(() => el.saved.classList.remove('show'), 2500);
            window.LeaveGuard?.refresh();
        } finally {
            this.saving = false;
            el.save.disabled = false;
        }
    },

    renderPast: function() {
        const el = this.elements;
        const past = FrutosCore.pastReflections(this.reflections, FrutosCore.reflectionKey(this.period), 4);
        el.past.hidden = !past.length;
        if (!past.length) return;
        el.pastLabel.textContent = t('frutos.past_label');
        const fragment = document.createDocumentFragment();
        for (const r of past) {
            const article = document.createElement('article');
            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = `${this.rangeText(r.start, r.last, r.kind)} · ${r.question}`;
            const p = document.createElement('p');
            p.textContent = r.text;
            article.append(meta, p);
            fragment.appendChild(article);
        }
        el.pastList.replaceChildren(fragment);
    }
};

window.FrutosSystem = FrutosSystem;
