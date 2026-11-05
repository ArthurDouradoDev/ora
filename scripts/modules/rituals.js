// ============================================================
// RITUAIS — começar e encerrar o dia, como convite (fase 5)
// ============================================================
// Nada abre sozinho: Hoje mostra a linha de convite (RemindersCore) e a pessoa
// escolhe "Começar". Cada ritual tem três passos, uma pergunta por vez, e a
// saída está sempre à vista. O rascunho é gravado a cada passo e volta ao
// reabrir no mesmo dia; as respostas da noite ficam guardadas neste navegador.
//   Manhã: prioridade → intenção (opcional) → começo (chega a Hoje e à preparação, M02).
//   Noite: gratidão → reflexão (com "Fazer o exame completo") → encerramento.
// Referência: prototypes/05-frutos-ritual.html (#ritual-manha, #ritual-noite).
// Dependências: AsyncStorage, RitualsCore, TasksCore, SessionsCore, BlockerCore,
// DialogSystem, TaskSystem, TodaySystem, FocusSystem, ReminderSystem, PracticeLog.

const RitualsSystem = {
    KEYS: { rituals: 'ora_rituals', drafts: 'ora_ritual_draft', sessions: 'ora_sessions', intention: 'ora_day_intention', blocker: 'blocker_config' },
    OTHER: '__other',

    rituals: {},
    drafts: {},
    sessions: [],
    blockerConfig: null,
    kind: null,          // 'manha' | 'noite' aberto agora
    state: null,
    finished: false,     // noite: tela de boa-noite depois de gravar
    busy: false,
    examReturn: false,
    draftTimer: null,
    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        const stored = await chrome.storage.local.get([this.KEYS.rituals, this.KEYS.drafts, this.KEYS.sessions, this.KEYS.blocker]);
        this.rituals = stored[this.KEYS.rituals] || {};
        this.drafts = stored[this.KEYS.drafts] || {};
        this.sessions = Array.isArray(stored[this.KEYS.sessions]) ? stored[this.KEYS.sessions] : [];
        this.blockerConfig = stored[this.KEYS.blocker] || null;
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            root: $('ritual'),
            exit: $('ritual-exit'),
            exitLabel: $('ritual-exit-label'),
            title: $('ritual-title'),
            steps: $('ritual-steps'),
            count: $('ritual-count'),
            body: $('ritual-body'),
            card: $('ritual-card')
        };
    },

    bindEvents: function() {
        this.elements.exit.addEventListener('click', () => this.close());
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            let refresh = false;
            if (changes[this.KEYS.rituals]) { this.rituals = changes[this.KEYS.rituals].newValue || {}; refresh = true; }
            if (changes[this.KEYS.drafts] && !this.kind) { this.drafts = changes[this.KEYS.drafts].newValue || {}; refresh = true; }
            if (changes[this.KEYS.sessions]) { this.sessions = changes[this.KEYS.sessions].newValue || []; refresh = true; }
            if (changes[this.KEYS.blocker]) this.blockerConfig = changes[this.KEYS.blocker].newValue || null;
            // Outra aba concluiu o ritual aberto aqui
            // (a própria gravação desta aba chega aqui também: busy a ignora)
            if (changes[this.KEYS.rituals] && this.kind && !this.finished && !this.busy && RitualsCore.isDone(this.rituals, this.kind, new Date())) this.close({ saveDraft: false });
            if (refresh && window.ReminderSystem) ReminderSystem.refresh();
        });
        window.addEventListener('ora:locale-changed', () => { if (this.kind) this.render(); });
    },

    // --- Convites ---

    focusedToday: function() {
        const today = TasksCore.isoDate(new Date());
        if (this.sessions.some(s => s && !s.imported && SessionsCore.sessionDay(s) === today)) return true;
        const pomodoro = window.FocusSystem && FocusSystem.state;
        const started = pomodoro && pomodoro.session && pomodoro.session.startedAt;
        return !!(started && TasksCore.isoDate(new Date(started)) === today);
    },

    // Convites que o ritual esconde agora (já feito; manhã depois de um foco)
    hiddenInvites: function() {
        return RitualsCore.hiddenInvites({ now: new Date(), rituals: this.rituals, focusedToday: this.focusedToday() });
    },

    hasDraft: function(kind) {
        return !!RitualsCore.draftFor(this.drafts, kind, new Date());
    },

    // --- Abrir e fechar ---

    open: function(kind, { opener, step } = {}) {
        if (!RitualsCore.KINDS.includes(kind)) return;
        if (this.kind) this.close();
        const now = new Date();
        const draft = RitualsCore.draftFor(this.drafts, kind, now);
        this.kind = kind;
        this.finished = false;
        this.state = draft ? this.fromDraft(kind, draft) : this.fresh(kind);
        if (typeof step === 'number') this.state.step = step;

        const el = this.elements;
        el.title.textContent = t(kind === 'manha' ? 'rituals.morning_title' : 'rituals.night_title');
        el.exitLabel.textContent = t('rituals.exit');
        if (kind === 'noite') document.documentElement.dataset.theme = 'noite';
        el.root.dataset.kind = kind;
        this.render();
        DialogSystem.open(el.root, { opener: opener || document.activeElement, onClose: () => this.onClosed() });
        this.focusCard();
        window.LeaveGuard?.watchEditor('ritual', this, () => JSON.stringify(this.draftData()), () => !!this.kind && !this.finished);
    },

    close: function({ saveDraft = true } = {}) {
        if (!this.kind) return;
        this._saveOnClose = saveDraft;
        DialogSystem.close(this.elements.root);
    },

    onClosed: function() {
        if (this._saveOnClose !== false && !this.finished) this.saveDraft({ now: true });
        this._saveOnClose = true;
        clearTimeout(this.draftTimer);
        if (this.kind === 'noite') delete document.documentElement.dataset.theme;
        this.kind = null;
        this.state = null;
        this.finished = false;
        window.LeaveGuard?.refresh();
        if (window.ReminderSystem) ReminderSystem.refresh();
    },

    fresh: function(kind) {
        if (kind === 'noite') return { step: 0, answers: ['', ''] };
        const next = window.TaskSystem ? TasksCore.nextStep(TaskSystem.tasks) : null;
        const intention = window.TodaySystem ? TodaySystem.dayIntention : '';
        return { step: 0, choice: next ? next.id : this.OTHER, other: '', minutes: null, intention: intention || '' };
    },

    fromDraft: function(kind, d) {
        if (kind === 'noite') {
            const answers = Array.isArray(d.answers) ? d.answers.slice(0, 2).map(a => String(a || '')) : [];
            while (answers.length < 2) answers.push('');
            return { step: Math.max(0, Math.min(2, Number(d.step) || 0)), answers };
        }
        return {
            step: Math.max(0, Math.min(2, Number(d.step) || 0)),
            choice: typeof d.choice === 'string' ? d.choice : this.OTHER,
            other: String(d.other || ''),
            minutes: Number(d.minutes) || null,
            intention: String(d.intention || '')
        };
    },

    draftData: function() {
        if (!this.state) return null;
        return Object.assign({}, this.state);
    },

    // Grava o rascunho; com { now: true } sem esperar a digitação parar
    saveDraft: function({ now = false } = {}) {
        if (!this.kind || this.finished) return Promise.resolve(true);
        clearTimeout(this.draftTimer);
        const kind = this.kind;
        const data = this.draftData();
        const write = async () => {
            const next = RitualsCore.withDraft(this.drafts, kind, new Date(), data);
            const ok = await AsyncStorage.set(this.KEYS.drafts, next);
            if (ok) {
                this.drafts = next;
                window.LeaveGuard?.savedEditor('ritual', JSON.stringify(data));
            }
            this.setStatus(ok ? '' : t('rituals.draft_failed'));
            return ok;
        };
        if (now) return write();
        return new Promise(resolve => { this.draftTimer = setTimeout(() => write().then(resolve), 400); });
    },

    setStatus: function(text) {
        const status = document.getElementById('ritual-status');
        if (status) status.textContent = text;
    },

    focusCard: function() {
        requestAnimationFrame(() => {
            const card = this.elements.card;
            const target = card.querySelector('[data-autofocus]') || card.querySelector('textarea, input:not([type="radio"]), input[type="radio"]:checked, .btn-primary') || card;
            if (target === card) card.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        });
    },

    goTo: async function(step) {
        this.state.step = step;
        this.render();
        this.focusCard();
        await this.saveDraft({ now: true });
    },

    // --- Desenho ---

    esc: function(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    renderSteps: function(step, total) {
        const el = this.elements;
        el.steps.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i <= step));
        el.count.textContent = step < total ? t('rituals.step_of', { n: step + 1, total }) : '';
    },

    render: function() {
        if (!this.kind) return;
        this.elements.body.scrollTop = 0;
        if (this.kind === 'manha') this.renderMorning();
        else this.renderNight();
    },

    actions: function(buttons) {
        return `<div class="actions">${buttons.join('')}</div><p class="meta ritual-status" id="ritual-status" role="status"></p>`;
    },

    // ── Manhã ──

    openTasks: function() {
        const tasks = window.TaskSystem ? TaskSystem.tasks : [];
        return tasks.filter(task => task && task.list === 'hoje' && !task.completedAt && !task.recurrence)
            .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt))
            .slice(0, 3);
    },

    morningChoice: function() {
        const s = this.state;
        if (s.choice !== this.OTHER) {
            const task = window.TaskSystem && TaskSystem.taskById(s.choice);
            if (task && !task.completedAt) return { taskId: task.id, title: task.title, estimate: task.estimateMin || null };
        }
        const title = s.other.trim();
        return title ? { taskId: null, title, estimate: null } : null;
    },

    defaultMinutes: function(choice) {
        const durations = FocusSystem.durations();
        if (this.state.minutes && durations.includes(this.state.minutes)) return this.state.minutes;
        if (choice && durations.includes(choice.estimate)) return choice.estimate;
        return FocusSystem.settings.focus;
    },

    renderMorning: function() {
        const s = this.state;
        const card = this.elements.card;
        this.renderSteps(s.step, 3);
        const e = (v) => this.esc(v);

        if (s.step === 0) {
            const tasks = this.openTasks();
            if (s.choice !== this.OTHER && !tasks.some(task => task.id === s.choice)) s.choice = tasks.length ? tasks[0].id : this.OTHER;
            const options = tasks.map(task => `<label class="choice"><input type="radio" name="ritual-prio" value="${e(task.id)}" ${s.choice === task.id ? 'checked' : ''}><span>${e(task.title)}</span>${task.estimateMin ? `<span class="m">${e(t('tasks.minutes', { n: task.estimateMin }))}</span>` : ''}</label>`).join('');
            const other = tasks.length
                ? `<label class="choice choice-other"><input type="radio" name="ritual-prio" value="${this.OTHER}" ${s.choice === this.OTHER ? 'checked' : ''} aria-label="${e(t('rituals.m_other_label'))}"><input class="input" id="ritual-other" maxlength="80" autocomplete="off" placeholder="${e(t('rituals.m_other'))}" aria-label="${e(t('rituals.m_other_label'))}" value="${e(s.other)}"></label>`
                : `<label class="field"><span class="sr-only">${e(t('rituals.m_other_label'))}</span><input class="input ritual-line" id="ritual-other" maxlength="80" autocomplete="off" placeholder="${e(t('rituals.m_first'))}" value="${e(s.other)}" data-autofocus></label>`;
            card.innerHTML = `<p class="label">${e(t('rituals.m_priority_label'))}</p>
                <h2 class="q" id="ritual-q">${e(t('rituals.m_priority_q'))}</h2>
                <div class="choices" ${tasks.length ? 'role="radiogroup" aria-labelledby="ritual-q"' : ''}>${options}${other}</div>
                <p class="meta ritual-error" id="ritual-error" role="alert" hidden></p>
                ${this.actions([`<button type="button" class="btn btn-primary btn-lg" id="ritual-next">${e(t('rituals.continue'))}</button>`])}`;
            card.querySelectorAll('input[name="ritual-prio"]').forEach(r => r.addEventListener('change', () => { s.choice = r.value; this.saveDraft(); }));
            const otherInput = document.getElementById('ritual-other');
            otherInput.addEventListener('focus', () => {
                const radio = card.querySelector(`input[name="ritual-prio"][value="${this.OTHER}"]`);
                if (radio) { radio.checked = true; s.choice = this.OTHER; }
            });
            otherInput.addEventListener('input', () => { s.other = otherInput.value; s.choice = this.OTHER; this.saveDraft(); });
            otherInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); this.morningNext(); } });
            if (!tasks.length) s.choice = this.OTHER;
            document.getElementById('ritual-next').addEventListener('click', () => this.morningNext());
        } else if (s.step === 1) {
            card.innerHTML = `<p class="label">${e(t('rituals.m_intent_label'))}</p>
                <h2 class="q" id="ritual-q">${e(t('rituals.m_intent_q'))}</h2>
                <label class="field"><span class="sr-only">${e(t('rituals.m_intent_field'))}</span><input class="input ritual-line" id="ritual-intent" maxlength="120" autocomplete="off" aria-describedby="ritual-q" placeholder="${e(t('rituals.m_intent_placeholder'))}" value="${e(s.intention)}" data-autofocus></label>
                ${this.actions([
                    `<button type="button" class="btn btn-primary btn-lg" id="ritual-next">${e(t('rituals.continue'))}</button>`,
                    `<button type="button" class="btn btn-quiet" id="ritual-skip">${e(t('rituals.skip'))}</button>`,
                    '<span class="spacer"></span>',
                    `<button type="button" class="btn btn-quiet" id="ritual-back">${e(t('rituals.back'))}</button>`
                ])}`;
            const input = document.getElementById('ritual-intent');
            input.addEventListener('input', () => { s.intention = input.value; this.saveDraft(); });
            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); this.goTo(2); } });
            document.getElementById('ritual-next').addEventListener('click', () => this.goTo(2));
            document.getElementById('ritual-skip').addEventListener('click', () => { s.intention = ''; this.goTo(2); });
            document.getElementById('ritual-back').addEventListener('click', () => this.goTo(0));
        } else {
            const choice = this.morningChoice();
            if (!choice) { this.state.step = 0; this.renderMorning(); return; }
            s.minutes = this.defaultMinutes(choice);
            const intention = s.intention.trim();
            const durations = FocusSystem.durations().map(min => `<button type="button" data-min="${min}" aria-pressed="${min === s.minutes}">${e(t('tasks.minutes', { n: min }))}</button>`).join('');
            card.innerHTML = `<p class="label">${e(t('rituals.m_start_label'))}</p>
                <h2 class="q" id="ritual-q">${e(choice.title)}</h2>
                ${intention ? `<p class="help ritual-offer">${e(this.offered(intention))}</p>` : ''}
                <div class="field"><span id="ritual-dur-label">${e(t('rituals.m_duration'))}</span><div class="seg" id="ritual-dur" role="group" aria-labelledby="ritual-dur-label">${durations}</div></div>
                <div class="banner err" id="ritual-error" role="alert" hidden><i class="ph ph-warning-circle" aria-hidden="true"></i><div><strong>${e(t('rituals.save_failed'))}</strong><span>${e(t('rituals.save_failed_detail'))}</span></div></div>
                ${this.actions([
                    `<button type="button" class="btn btn-primary btn-lg" id="ritual-start" data-autofocus><i class="ph-fill ph-play" aria-hidden="true"></i>${e(t('rituals.m_start_focus'))}</button>`,
                    `<button type="button" class="btn btn-aux" id="ritual-today">${e(t('rituals.m_go_today'))}</button>`,
                    '<span class="spacer"></span>',
                    `<button type="button" class="btn btn-quiet" id="ritual-back">${e(t('rituals.back'))}</button>`
                ])}`;
            document.getElementById('ritual-dur').addEventListener('click', (ev) => {
                const btn = ev.target.closest('[data-min]');
                if (!btn) return;
                s.minutes = Number(btn.dataset.min);
                card.querySelectorAll('#ritual-dur [data-min]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === s.minutes)));
                this.saveDraft();
            });
            document.getElementById('ritual-start').addEventListener('click', () => this.finishMorning(true));
            document.getElementById('ritual-today').addEventListener('click', () => this.finishMorning(false));
            document.getElementById('ritual-back').addEventListener('click', () => this.goTo(1));
        }
    },

    offered: function(intention) {
        return window.TodaySystem ? TodaySystem.offeredText(intention, 'rituals.m_offering') : intention;
    },

    morningNext: function() {
        const s = this.state;
        const checked = this.elements.card.querySelector('input[name="ritual-prio"]:checked');
        if (checked) s.choice = checked.value;
        const other = document.getElementById('ritual-other');
        if (other) s.other = other.value;
        if (!this.morningChoice()) {
            const error = document.getElementById('ritual-error');
            error.textContent = t('rituals.m_need_priority');
            error.hidden = false;
            if (other) other.focus();
            return;
        }
        this.goTo(1);
    },

    // A prioridade e a duração chegam a Hoje (próximo passo) e à preparação (M02)
    finishMorning: async function(startFocus) {
        if (this.busy) return;
        const choice = this.morningChoice();
        if (!choice) return;
        this.busy = true;
        const s = this.state;
        const error = document.getElementById('ritual-error');
        if (error) error.hidden = true;
        try {
            const now = new Date();
            const applied = await TaskSystem.applyMorningPriority({ taskId: choice.taskId, title: choice.title, minutes: s.minutes });
            if (!applied) throw new Error('tasks');
            const intention = s.intention.trim();
            const writes = {
                [this.KEYS.rituals]: RitualsCore.markDone(this.rituals, 'manha', now, { priority: choice.title, taskId: applied.taskId, minutes: s.minutes, intention }),
                [this.KEYS.drafts]: RitualsCore.withoutDraft(this.drafts, 'manha')
            };
            if (intention) {
                const map = await AsyncStorage.get(this.KEYS.intention, {});
                writes[this.KEYS.intention] = SessionsCore.setDayIntention(map, now, intention);
            }
            await chrome.storage.local.set(writes);
            this.rituals = writes[this.KEYS.rituals];
            this.drafts = writes[this.KEYS.drafts];
            if (window.PracticeLog) PracticeLog.record('morning');

            this.finished = true;
            this.close({ saveDraft: false });
            RouterSystem.navigate('hoje');
            if (startFocus && window.TodaySystem) {
                const task = applied.taskId && TaskSystem.taskById(applied.taskId);
                TodaySystem.openPrep({ taskId: task ? task.id : null, title: task ? task.title : choice.title, minutes: s.minutes, opener: TodaySystem.elements.start });
            }
        } catch (e) {
            console.error('[Rituals] Morning not saved:', e);
            if (error) { error.hidden = false; error.focus?.(); }
        } finally {
            this.busy = false;
        }
    },

    // ── Noite ──

    renderNight: function() {
        const s = this.state;
        const card = this.elements.card;
        const e = (v) => this.esc(v);
        this.renderSteps(this.finished ? 3 : s.step, 3);

        if (this.finished) {
            const name = window.SettingsSystem ? SettingsSystem.getUserName() : '';
            const gratitude = s.answers[0].trim();
            card.innerHTML = `<div class="ritual-final">
                <h2 class="q" id="ritual-q" tabindex="-1" data-autofocus>${e(name ? t('rituals.n_goodnight', { name }) : t('rituals.n_goodnight_anon'))}</h2>
                ${gratitude ? `<p class="help ritual-offer">${e(t('rituals.n_thanked', { text: gratitude }))}</p>` : ''}
                <div class="actions"><button type="button" class="btn btn-aux" id="ritual-close">${e(t('rituals.close'))}</button></div></div>`;
            document.getElementById('ritual-close').addEventListener('click', () => this.close({ saveDraft: false }));
            return;
        }

        if (s.step < 2) {
            const k = s.step === 0 ? 'gratitude' : 'reflection';
            const value = s.answers[s.step];
            card.innerHTML = `<p class="label">${e(t('rituals.n_' + k + '_label'))}</p>
                <h2 class="q" id="ritual-q">${e(t('rituals.n_' + k + '_q'))}</h2>
                <p class="help" id="ritual-help">${e(t('rituals.n_' + k + '_help'))}</p>
                <label class="field"><span class="sr-only">${e(t('rituals.n_answer'))}</span><textarea class="textarea ritual-text" id="ritual-text" maxlength="5000" aria-describedby="ritual-q ritual-help" placeholder="${e(t('rituals.n_placeholder'))}">${e(value)}</textarea></label>
                ${s.step === 1 ? `<button type="button" class="btn btn-quiet ritual-exam" id="ritual-exam"><i class="ph ph-heart" aria-hidden="true"></i>${e(t('rituals.n_full_exam'))}</button>` : ''}
                ${this.actions([
                    `<button type="button" class="btn btn-primary btn-lg" id="ritual-next">${e(t('rituals.continue'))}</button>`,
                    `<button type="button" class="btn btn-quiet" id="ritual-skip" ${value.trim() ? 'hidden' : ''}>${e(t('rituals.skip'))}</button>`,
                    s.step > 0 ? '<span class="spacer"></span>' : '',
                    s.step > 0 ? `<button type="button" class="btn btn-quiet" id="ritual-back">${e(t('rituals.back'))}</button>` : ''
                ])}`;
            const text = document.getElementById('ritual-text');
            const skip = document.getElementById('ritual-skip');
            text.addEventListener('input', () => {
                s.answers[s.step] = text.value;
                skip.hidden = !!text.value.trim();
                this.saveDraft();
            });
            document.getElementById('ritual-next').addEventListener('click', () => this.goTo(s.step + 1));
            skip.addEventListener('click', () => this.goTo(s.step + 1));
            document.getElementById('ritual-back')?.addEventListener('click', () => this.goTo(s.step - 1));
            document.getElementById('ritual-exam')?.addEventListener('click', (ev) => { ev.stopPropagation(); this.openFullExam(); });
            return;
        }

        const lines = t('rituals.n_prayer');
        const prayer = (Array.isArray(lines) ? lines : [String(lines)]).map(line => e(line)).join('<br>');
        const protect = this.protectionText();
        card.innerHTML = `<p class="label ritual-center">${e(t('rituals.n_closing_label'))}</p>
            <h2 class="sr-only" id="ritual-q">${e(t('rituals.n_closing_label'))}</h2>
            <p class="prayer-short" lang="${e(window._i18nLocale || 'pt')}">${prayer}</p>
            ${protect ? `<div class="banner info"><i class="ph ph-moon" aria-hidden="true"></i><div>${e(protect)}</div></div>` : ''}
            <div class="banner err" id="ritual-error" role="alert" hidden><i class="ph ph-warning-circle" aria-hidden="true"></i><div><strong>${e(t('rituals.save_failed'))}</strong><span>${e(t('rituals.save_failed_detail'))}</span></div></div>
            ${this.actions([
                `<button type="button" class="btn btn-primary btn-lg" id="ritual-finish" data-autofocus>${e(t('rituals.n_finish'))}</button>`,
                '<span class="spacer"></span>',
                `<button type="button" class="btn btn-quiet" id="ritual-back">${e(t('rituals.back'))}</button>`
            ])}`;
        document.getElementById('ritual-finish').addEventListener('click', () => this.finishNight());
        document.getElementById('ritual-back').addEventListener('click', () => this.goTo(1));
    },

    hourText: function(hhmm) {
        const locale = window._i18nLocale || 'pt';
        if (locale !== 'en') return BlockerCore.formatShortHour(hhmm);
        const [h, m] = String(hhmm).split(':').map(Number);
        return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: m ? '2-digit' : undefined }).format(new Date(2026, 0, 1, h, m || 0));
    },

    // "Bloqueio até 7h: Redes sociais. Bom descanso." — só quando há regra de horário
    protectionText: function() {
        const cfg = this.blockerConfig;
        if (!cfg) return '';
        const rules = RitualsCore.nightProtection(BlockerCore.profilesFromConfig(cfg), new Date(), cfg);
        if (!rules.length) return '';
        const names = (list) => {
            try { return new Intl.ListFormat(TodaySystem.localeTag(), { type: 'conjunction' }).format(list); }
            catch (e) { return list.join(', '); }
        };
        const groups = new Map();
        for (const r of rules) {
            const key = r.active ? `until|${r.to}` : `from|${r.from}|${r.to}`;
            if (!groups.has(key)) groups.set(key, { r, names: [] });
            groups.get(key).names.push(r.name);
        }
        const sentences = Array.from(groups.values()).map(({ r, names: n }) => r.active
            ? t('rituals.n_protect_until', { names: names(n), to: this.hourText(r.to) })
            : t('rituals.n_protect_from', { names: names(n), from: this.hourText(r.from), to: this.hourText(r.to) }));
        return `${sentences.join(' ')} ${t('rituals.n_rest')}`;
    },

    finishNight: async function() {
        if (this.busy) return;
        this.busy = true;
        const s = this.state;
        const error = document.getElementById('ritual-error');
        if (error) error.hidden = true;
        try {
            const now = new Date();
            const rituals = RitualsCore.markDone(this.rituals, 'noite', now, { gratitude: s.answers[0].trim(), reflection: s.answers[1].trim() });
            const drafts = RitualsCore.withoutDraft(this.drafts, 'noite');
            await chrome.storage.local.set({ [this.KEYS.rituals]: rituals, [this.KEYS.drafts]: drafts });
            this.rituals = rituals;
            this.drafts = drafts;
            if (window.PracticeLog) PracticeLog.record('night');
            if (window.ReminderSystem) await ReminderSystem.markDoneById('closeDay');
            this.finished = true;
            this.renderNight();
            this.focusCard();
            window.LeaveGuard?.refresh();
        } catch (e) {
            console.error('[Rituals] Night not saved:', e);
            if (error) error.hidden = false;
        } finally {
            this.busy = false;
        }
    },

    // "Fazer o exame completo": o rascunho fica, o exame da noite abre em Rezar
    // e, ao terminar, o ritual volta no Encerramento
    openFullExam: async function() {
        await this.saveDraft({ now: true });
        this.examReturn = true;
        this.close();
        if (window.ExamSystem) await ExamSystem.startExam('night');
    },

    // Chamado pelo exame ao concluir: devolve true se o ritual retoma
    resumeAfterExam: function(type) {
        if (!this.examReturn || type !== 'night') return false;
        this.examReturn = false;
        RouterSystem.navigate('hoje');
        this.open('noite', { step: 2 });
        return true;
    }
};

window.RitualsSystem = RitualsSystem;
