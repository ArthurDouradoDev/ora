// ============================================================
// HOJE — chegada, próximo passo e fluxo de foco no mesmo lugar
// ============================================================
// Orquestra os estados de Hoje (TodayCore.resolveTodayState) a partir das
// tarefas (TaskSystem), do pomodoro gravado pelo SW (FocusSystem), do convite
// do momento (ReminderSystem) e da Proteção (ProtectionSystem). Outras abas
// ficam em sincronia pelo chrome.storage.onChanged de cada módulo.
// Referência visual: prototypes/01d-hoje-melhorada.html.

const TodaySystem = {
    INTENTION_KEY: 'ora_day_intention',
    GOSPEL_KEY: 'liturgy_gospel_cache',
    PROTECT_PREF_KEY: 'ora_focus_protect',
    LIT_COLORS: { verde: 'lit-verde', roxo: 'lit-roxo', vermelho: 'lit-vermelho', rosa: 'lit-rosa', branco: 'lit-branco' },

    data: null,
    tasks: [],
    pomodoro: null,
    invite: null,
    protection: null,
    gospel: null,
    dayIntention: '',
    protectPref: true,
    prayerPref: { id: 'none', freq: 'first' }, // FocusPrayerCore.normalize
    prayerDay: null,     // dia em que a oração do foco já foi rezada (ou pulada)

    view: null,          // último resultado de TodayCore
    preparing: false,
    prepDraft: null,     // { taskId, title, minutes, intention, sound, protect, prayer, prayerFreq }
    prepOpener: null,
    prepStarting: false,
    praying: null,       // { prayer, params, sound }: momento de oração antes do cronômetro
    prayerStarting: false,
    prayerMore: false,   // "Mais orações" aberto no popover
    breakMin: null,      // pausa longa editada na tela de concluída
    error: null,         // { title, detail, retry }
    lastClock: '',
    elements: {},

    init: async function(appData) {
        this.data = appData || {};
        this.cacheDOM();
        this.bindEvents();

        this.tasks = window.TaskSystem ? TaskSystem.tasks : [];
        this.pomodoro = window.FocusSystem ? FocusSystem.state : null;
        this.invite = window.ReminderSystem ? ReminderSystem.current : null;
        this.protection = window.ProtectionSystem ? ProtectionSystem.status() : null;

        const FP = FocusPrayerCore;
        const stored = await chrome.storage.local.get([this.INTENTION_KEY, this.GOSPEL_KEY, this.PROTECT_PREF_KEY, FP.PREF_KEY, FP.DAY_KEY]);
        this.dayIntention = SessionsCore.dayIntention(stored[this.INTENTION_KEY], new Date());
        this.gospel = stored[this.GOSPEL_KEY] || null;
        this.protectPref = stored[this.PROTECT_PREF_KEY] !== false;
        this.prayerPref = FP.normalize(stored[FP.PREF_KEY]);
        this.prayerDay = stored[FP.DAY_KEY] || null;

        await this.setGreeting();
        await this.setQuote();
        this.renderDay();
        this.renderIntention();
        this.renderGospel();
        this.render();
        this.tick();
        setInterval(() => this.tick(), 1000);

        // Cinzel não tem algarismos de largura fixa: mede o mais largo
        if (document.fonts) document.fonts.ready.then(() => this.measureDigits());

        console.log('[Ora] Today initialized');
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            center: $('today-center'),
            arrival: $('today-arrival'),
            clock: $('today-clock'),
            greeting: $('today-greeting'),
            date: $('today-date'),
            celebration: $('today-celebration'),
            celebrationSep: $('today-celebration-sep'),
            intent: $('today-intent'),
            intentEdit: $('today-intent-edit'),
            intentInput: $('today-intent-input'),
            intentSet: $('today-intent-set'),
            intentText: $('today-intent-text'),
            intentChange: $('today-intent-change'),
            next: $('today-next'),
            nextTitle: $('today-next-title'),
            nextMeta: $('today-next-meta'),
            start: $('today-start'),
            choose: $('today-choose'),
            empty: $('today-empty'),
            quickForm: $('today-quick-form'),
            quickInput: $('today-quick-input'),
            shortcuts: $('shortcuts'),
            invite: $('today-invite'),
            inviteIcon: $('today-invite-icon'),
            inviteTitle: $('today-invite-title'),
            inviteMeta: $('today-invite-meta'),
            inviteGo: $('today-invite-go'),
            inviteLater: $('today-invite-later'),
            prep: $('today-prep'),
            prepTitle: $('today-prep-title'),
            prepDur: $('today-dur'),
            prepIntent: $('today-prep-intent'),
            prepIntentHint: $('today-prep-intent-hint'),
            prepProtect: $('today-prep-protect'),
            prepProtectHint: $('today-prep-protect-hint'),
            prepRules: $('today-prep-rules'),
            prepStart: $('today-prep-start'),
            prepStartLabel: $('today-prep-start-label'),
            prayerPick: $('today-prayer-pick'),
            prayerName: $('today-prayer-name'),
            prayerHint: $('today-prayer-hint'),
            prayerPop: $('today-prayer-pop'),
            prayerOpts: $('today-prayer-opts'),
            prayerMoreBtn: $('today-prayer-more'),
            prayerFreq: $('today-prayer-freq'),
            prayer: $('today-prayer'),
            prayerTitle: $('today-prayer-title'),
            prayerText: $('today-prayer-text'),
            prayerOffer: $('today-prayer-offer'),
            prayerAmen: $('today-prayer-amen'),
            prayerSkip: $('today-prayer-skip'),
            prayerMeta: $('today-prayer-meta'),
            session: $('today-session'),
            sessionDot: $('today-session-dot'),
            sessionState: $('today-session-state'),
            sessionTitle: $('today-session-title'),
            timer: $('today-timer'),
            progress: $('today-progress'),
            sessionMeta: $('today-session-meta'),
            sessionIntent: $('today-session-intent'),
            pauseNote: $('today-pause-note'),
            pause: $('today-pause'),
            resume: $('today-resume'),
            end: $('today-end'),
            sessionProtect: $('today-session-protect'),
            sessionProtectText: $('today-session-protect-text'),
            done: $('today-done'),
            doneTitle: $('today-done-title'),
            doneMeta: $('today-done-meta'),
            doneCheckRow: $('today-done-check-row'),
            doneCheck: $('today-done-check'),
            breakEdit: $('today-break-edit'),
            breakLess: $('today-break-less'),
            breakMore: $('today-break-more'),
            breakMinOut: $('today-break-min'),
            breakBtn: $('today-break'),
            breakLabel: $('today-break-label'),
            respiro: $('today-respiro'),
            more: $('today-more'),
            home: $('today-home'),
            after: $('today-after'),
            afterTitle: $('today-after-title'),
            alert: $('today-alert'),
            alertTitle: $('today-alert-title'),
            alertDetail: $('today-alert-detail'),
            alertRetry: $('today-alert-retry'),
            alertDismiss: $('today-alert-dismiss'),
            foot: $('today-foot'),
            gospelRef: $('today-gospel-ref'),
            gospelRead: $('today-gospel-read'),
            gospelFull: $('today-gospel-full'),
            quoteText: $('today-quote-text'),
            quoteAuthor: $('today-quote-author'),
            endDialog: $('today-end-dialog'),
            endDesc: $('today-end-desc'),
            endConfirm: $('today-end-confirm')
        };
    },

    bindEvents: function() {
        const el = this.elements;

        // Repouso
        el.start.addEventListener('click', () => {
            const next = this.view && this.view.next;
            this.openPrep({ taskId: next ? next.id : null, title: next ? next.title : '', opener: el.start });
        });
        el.choose.addEventListener('click', () => window.TaskSystem && TaskSystem.show());
        el.quickForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.openPrep({ taskId: null, title: el.quickInput.value.trim(), opener: el.quickInput });
        });

        // Intenção do dia
        el.intentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveIntention(el.intentInput.value);
            }
        });
        el.intentInput.addEventListener('blur', () => {
            if (el.intentInput.value.trim() && el.intentInput.value.trim() !== this.dayIntention) this.saveIntention(el.intentInput.value);
        });
        el.intentChange.addEventListener('click', () => {
            el.intentInput.value = this.dayIntention;
            el.intentEdit.hidden = false;
            el.intentSet.hidden = true;
            el.intentInput.focus();
            el.intentInput.select();
        });

        // Convite
        // Os modais da V0 (leitor, terço, exame, música) fecham com qualquer clique
        // fora deles: o clique que os abre não pode subir até o documento
        el.inviteGo.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.ReminderSystem) ReminderSystem.act(this.invite, el.inviteGo);
        });
        el.inviteLater.addEventListener('click', async () => {
            if (!window.ReminderSystem) return;
            await ReminderSystem.dismiss(this.invite);
            // O convite sumiu com o foco: segue para a ação principal de Hoje
            if (el.invite.hidden) (!el.next.hidden ? el.start : el.quickInput).focus({ preventScroll: true });
        });

        // Preparação
        el.prepDur.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-min]');
            if (!btn || !this.prepDraft) return;
            this.prepDraft.minutes = Number(btn.dataset.min);
            this.renderPrepDuration();
        });
        el.prepTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.startFromPrep();
            }
        });
        el.prepIntent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.startFromPrep();
            }
        });
        el.prepRules.addEventListener('click', (e) => {
            e.stopPropagation();
            // O painel do bloqueador (V0) fica fora do diálogo: a preparação fecha e guarda o rascunho
            this.closePrep({ keepDraft: true, refocus: false });
            if (window.ProtectionSystem) ProtectionSystem.openManager();
        });
        el.prepStart.addEventListener('click', () => this.startFromPrep());

        // Oração ao começar: escolha (popover) e momento antes do cronômetro
        el.prayerPick.addEventListener('click', (e) => {
            e.stopPropagation();
            if (DialogSystem.isOpen(el.prayerPop)) DialogSystem.close(el.prayerPop);
            else this.openPrayerPop();
        });
        el.prayerOpts.addEventListener('click', (e) => {
            const opt = e.target.closest('[data-prayer]');
            if (opt) this.choosePrayer(opt.dataset.prayer);
        });
        el.prayerOpts.addEventListener('keydown', (e) => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            const opts = [...el.prayerOpts.querySelectorAll('[role="radio"]')];
            const i = opts.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault();
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? opts.length - 1
                : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length;
            opts.forEach((o, n) => { o.tabIndex = n === next ? 0 : -1; });
            opts[next].focus();
        });
        el.prayerMoreBtn.addEventListener('click', () => {
            this.prayerMore = true;
            this.renderPrayerOpts();
            // Leva o foco à primeira oração nova
            const first = el.prayerOpts.querySelector('[data-more]');
            if (first) first.focus();
        });
        el.prayerFreq.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-freq]');
            if (!btn || !this.prepDraft) return;
            this.prepDraft.prayerFreq = btn.dataset.freq;
            this.renderPrepPrayer();
        });
        // Clique fora do popover o fecha (dentro da preparação o resto está inerte)
        document.addEventListener('click', (e) => {
            if (DialogSystem.isOpen(el.prayerPop) && !el.prayerPop.contains(e.target)) DialogSystem.close(el.prayerPop);
        });
        el.prayerAmen.addEventListener('click', () => this.finishPrayer());
        el.prayerSkip.addEventListener('click', () => this.finishPrayer());
        // Clique fora da preparação a fecha (o fundo está inerte)
        // (o mesmo clique que abriu a preparação ainda está subindo: é ignorado)
        document.addEventListener('click', (e) => {
            if (!this.preparing || performance.now() - this._prepOpenedAt < 100) return;
            if (DialogSystem.top()?.root === el.prep && !el.prep.contains(e.target) && document.contains(e.target)) this.closePrep({ keepDraft: true });
        });

        // Sessão
        el.pause.addEventListener('click', () => this.command(() => FocusSystem.pause()));
        el.resume.addEventListener('click', () => this.command(() => FocusSystem.resume()));
        el.end.addEventListener('click', () => this.askEnd());
        el.endConfirm.addEventListener('click', () => {
            DialogSystem.close(el.endDialog);
            this.command(() => FocusSystem.interrupt(), () => showToast(t('today.session_ended'), 'info'));
        });

        // Concluída
        el.doneCheck.addEventListener('change', async () => {
            const taskId = this.view && this.view.completed && this.view.completed.taskId;
            if (!taskId || !window.TaskSystem) return;
            const ok = await TaskSystem.setDone(taskId, el.doneCheck.checked);
            if (!ok) el.doneCheck.checked = !el.doneCheck.checked;
        });
        el.breakLess.addEventListener('click', () => this.adjustBreak(-5));
        el.breakMore.addEventListener('click', () => this.adjustBreak(5));
        el.breakBtn.addEventListener('click', () => {
            const c = this.view && this.view.completed;
            const minutes = c && c.breakKind === 'longPause' ? this.currentBreakMin() : undefined;
            this.command(() => FocusSystem.startBreak(minutes));
        });
        el.respiro.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.RespiroSystem) RespiroSystem.open({ view: 'hoje', path: [] });
        });
        el.more.addEventListener('click', () => {
            const c = this.view && this.view.completed;
            const keepTask = c && c.taskId && !c.taskDone;
            this.openPrep({ taskId: keepTask ? c.taskId : null, title: keepTask ? c.title : '', opener: el.more });
        });
        el.home.addEventListener('click', () => this.command(() => FocusSystem.goHome()));

        // Falhas
        el.alertRetry.addEventListener('click', () => {
            const retry = this.error && this.error.retry;
            this.setError(null);
            if (retry) retry();
        });
        el.alertDismiss.addEventListener('click', () => this.setError(null));

        // Evangelho
        el.gospelRead.addEventListener('click', (e) => {
            e.stopPropagation();
            this.readGospel();
        });

        // Estado vindo dos outros módulos
        window.addEventListener('ora:tasks', (e) => {
            this.tasks = e.detail.tasks;
            this.render();
        });
        window.addEventListener('ora:pomodoro', (e) => {
            this.pomodoro = e.detail;
            this.render();
        });
        window.addEventListener('ora:invite', (e) => {
            this.invite = e.detail;
            this.render();
        });
        window.addEventListener('ora:protection', (e) => {
            this.protection = e.detail;
            if (this.preparing) this.renderPrepProtection();
        });
        window.addEventListener('ora:focus-task', (e) => {
            const task = window.TaskSystem && TaskSystem.taskById(e.detail.taskId);
            if (task) this.openPrep({ taskId: task.id, title: task.title, opener: document.activeElement });
        });
        window.addEventListener('ora:phase-complete', () => this.render());
        window.addEventListener('ora:settings-changed', (e) => {
            if (e.detail && e.detail.key === 'userName') this.setGreeting();
        });
        window.addEventListener('ora:locale-changed', async () => {
            await this.setGreeting();
            await this.setQuote();
            this.renderDay();
            this.renderIntention();
            this.renderGospel();
            this.lastClock = '';
            this.render();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[this.INTENTION_KEY] && document.activeElement !== this.elements.intentInput) {
                this.dayIntention = SessionsCore.dayIntention(changes[this.INTENTION_KEY].newValue, new Date());
                this.renderIntention();
            }
            if (changes[this.PROTECT_PREF_KEY]) this.protectPref = changes[this.PROTECT_PREF_KEY].newValue !== false;
            if (changes[FocusPrayerCore.PREF_KEY]) this.prayerPref = FocusPrayerCore.normalize(changes[FocusPrayerCore.PREF_KEY].newValue);
            if (changes[FocusPrayerCore.DAY_KEY]) {
                this.prayerDay = changes[FocusPrayerCore.DAY_KEY].newValue || null;
                if (this.preparing) this.renderPrepPrayer();
            }
            if (changes[this.GOSPEL_KEY]) {
                this.gospel = changes[this.GOSPEL_KEY].newValue || null;
                if (window.RezarSystem) RezarSystem.cache = this.gospel;
                this.renderGospel();
                this.renderDay();
            }
        });
    },

    // --- Estado ---

    resolve: function() {
        return TodayCore.resolveTodayState({
            tasks: this.tasks,
            pomodoro: this.pomodoro,
            now: Date.now(),
            reminders: this.invite,
            // Entre "Começar" e a resposta do SW a preparação segue como estado
            // (sem cartão), para não piscar o repouso no meio da transição
            // (e também durante a oração antes do cronômetro)
            preparing: this.preparing || !!this.praying || this.isLaunching(),
            error: this.error
        });
    },

    render: function() {
        const el = this.elements;
        const prev = this.view ? this.view.state : null;
        let v = this.resolve();
        let launch = null;
        if (this.launch && (v.session || v.error || !this.isLaunching())) {
            launch = this.endLaunch();
            v = this.resolve();
        }
        this.view = v;
        document.documentElement.dataset.today = v.state;
        if (window.ReminderSystem) ReminderSystem.setSessionActive(!!v.session);

        // Outra aba começou uma sessão enquanto a preparação estava aberta
        if (this.preparing && v.session) this.closePrep({ keepDraft: false, refocus: false });
        if (this.praying && v.session) this.cancelPrayer();
        document.documentElement.classList.toggle('is-praying', !!this.praying);

        const rest = ['repouso', 'repouso-vazio', 'noite', 'falha'].includes(v.state);
        // Durante a oração só ela fica no centro (sem relógio)
        el.arrival.hidden = !(rest || (v.state === 'preparacao' && !this.praying));
        el.intent.hidden = !rest;
        el.next.hidden = !(rest && v.next);
        el.empty.hidden = !(rest && !v.next);
        el.shortcuts.hidden = !rest;
        el.invite.hidden = !(rest && v.invite);
        el.session.hidden = !v.session;
        el.done.hidden = v.state !== 'concluida';
        el.alert.hidden = !v.error;

        if (rest) {
            this.renderNext(v);
            this.renderInvite(v.invite);
        }
        if (v.session) this.renderSession(v);
        if (v.state === 'concluida') this.renderDone(v);
        else this.breakMin = null;
        this.renderTitle(v);
        this.moveFocus(prev, v.state);
        this.animateState(prev, v.state, launch);
        if (!this._motionReady) {
            this._motionReady = true;
            requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('today-motion')));
        }
    },

    // --- Movimento entre estados (ANALISE_ANIMACOES_ORA.md, P2) ---
    // Só opacity/transform (Motion). Blocos de vidro sobre a foto (próximo
    // passo, convite, chips) só se deslocam: opacidade < 1 tiraria o desfoque.

    LAUNCH_HOLD_MS: 2000,

    isLaunching: function() {
        return !!this.launch && performance.now() - this.launch.at < this.LAUNCH_HOLD_MS;
    },

    // Guarda onde estava o título da preparação para ele "voar" até a sessão
    startLaunch: function() {
        const input = this.elements.prepTitle;
        const rect = input.getBoundingClientRect();
        const cs = getComputedStyle(input);
        this.launch = {
            at: performance.now(),
            from: input.value.trim() && rect.width ? {
                left: rect.left + (parseFloat(cs.paddingLeft) || 0),
                centerY: rect.top + rect.height / 2,
                fontSize: parseFloat(cs.fontSize) || 24
            } : null
        };
        document.documentElement.classList.add('is-launching');
        clearTimeout(this._launchTimer);
        this._launchTimer = setTimeout(() => { if (this.launch) this.render(); }, this.LAUNCH_HOLD_MS + 50);
    },

    endLaunch: function() {
        const launch = this.launch;
        this.launch = null;
        clearTimeout(this._launchTimer);
        document.documentElement.classList.remove('is-launching');
        return launch;
    },

    animateState: function(prev, state, launch) {
        const M = window.Motion;
        if (!M || !prev || prev === state) return;
        if (window.RouterSystem && RouterSystem.current() && RouterSystem.current().view !== 'hoje') return;
        const el = this.elements;
        const rise = (node, delay = 0, { fade = true, y = 10, duration = 380 } = {}) => {
            if (!node || node.hidden) return;
            const from = fade ? { opacity: 0, transform: `translateY(${y}px)` } : { transform: `translateY(${y}px)` };
            const to = fade ? { opacity: 1, transform: 'none' } : { transform: 'none' };
            M.play(node, [from, to], { duration, delay, fill: 'backwards', channel: 'state' });
        };
        const rest = ['repouso', 'repouso-vazio', 'noite', 'falha'];

        if (state === 'preparacao') {
            M.play(el.prep, [
                { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
                { opacity: 1, transform: 'none' }
            ], { duration: 280, channel: 'state' });
            return;
        }

        if (rest.includes(state)) {
            rise(el.arrival, 0);
            rise(el.intent, 50);
            rise(el.next, 90, { fade: false, y: 8 });
            rise(el.empty, 90, { fade: false, y: 8 });
            rise(el.invite, 130, { fade: false, y: 8 });
            return;
        }

        // Entrar na sessão (foco ou pausa). Pausar/retomar não coreografa.
        if (state === 'ativa' && prev !== 'pausada') {
            if (!this.flyTitle(launch && launch.from)) rise(el.sessionTitle, 60, { y: 14, duration: 460 });
            rise(el.session.querySelector('.session-state'), 160, { y: 6 });
            M.play(el.timer, [
                { opacity: 0, transform: 'scale(0.96)' },
                { opacity: 1, transform: 'none' }
            ], { duration: 560, delay: 160, fill: 'backwards', channel: 'state' });
            rise(el.progress.parentElement, 260, { y: 6 });
            rise(el.sessionMeta, 290, { y: 6 });
            rise(el.sessionIntent, 320, { y: 6 });
            rise(el.session.querySelector('.controls'), 340, { y: 8 });
            rise(el.session.querySelector('.aux-row'), 380, { fade: false, y: 8 });
            return;
        }

        if (state === 'concluida') {
            // Gesto único de recompensa (P3), só quando a sessão acabou agora
            if (prev === 'ativa' || prev === 'pausada') {
                M.play(document.getElementById('today-done-glow'), [
                    { opacity: 0, transform: 'scale(0.8)' },
                    { opacity: 1, transform: 'scale(1)', offset: 0.35 },
                    { opacity: 0, transform: 'scale(1.1)' }
                ], { duration: 1400, easing: 'ease-out', channel: 'state' });
                const mark = document.getElementById('today-done-mark');
                if (mark) {
                    const [ring, tick] = mark.children;
                    M.play(ring, [{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }], { duration: 520, fill: 'backwards', channel: 'state' });
                    M.play(tick, [{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }], { duration: 360, delay: 380, fill: 'backwards', channel: 'state' });
                }
            }
            rise(el.done.querySelector('.label'), 0, { y: 6 });
            rise(el.doneTitle, 60, { y: 12, duration: 460 });
            rise(el.doneMeta, 140, { y: 6 });
            rise(el.doneCheckRow, 200, { fade: false, y: 8 });
            rise(el.breakEdit, 220, { y: 6 });
            rise(el.done.querySelector('.row'), 260, { y: 8 });
            rise(el.after, 300, { y: 6 });
        }
    },

    // FLIP: o título digitado na preparação desliza e cresce até o título da
    // sessão. Mede o texto (não a caixa, que é centralizada e mais larga).
    flyTitle: function(from) {
        const title = this.elements.sessionTitle;
        if (!from || !title.textContent || title.offsetParent === null) return false;
        const range = document.createRange();
        range.selectNodeContents(title);
        const text = range.getBoundingClientRect();
        const box = title.getBoundingClientRect();
        if (!text.width || !box.width) return false;
        const scale = from.fontSize / (parseFloat(getComputedStyle(title).fontSize) || from.fontSize);
        const dx = from.left - text.left;
        const dy = from.centerY - (text.top + (text.height * scale) / 2);
        const origin = `${text.left - box.left}px ${text.top - box.top}px`;
        const animation = window.Motion.play(title, [
            { transformOrigin: origin, transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.7 },
            { transformOrigin: origin, transform: 'none', opacity: 1 }
        ], { duration: 640, channel: 'state' });
        return !!animation;
    },

    // Leva o foco ao lugar certo quando o bloco em foco some
    moveFocus: function(prev, state) {
        if (!prev || prev === state) return;
        // Novo estado começa do alto (em janela baixa a página rola)
        if (state !== 'preparacao' && prev !== 'preparacao') {
            this.elements.center.scrollTop = 0;
            const view = document.getElementById('view-hoje');
            if (view) view.scrollTop = 0;
        }
        const active = document.activeElement;
        const lost = !active || active === document.body || active.offsetParent === null || active.closest('[hidden]');
        if (!lost) return;
        const el = this.elements;
        let target = null;
        if (state === 'ativa') target = el.pause;
        else if (state === 'pausada') target = el.resume;
        else if (state === 'concluida') target = el.doneTitle;
        else if (state === 'repouso') target = el.start;
        else if (state === 'repouso-vazio' || ((state === 'noite' || state === 'falha') && !this.view.next)) target = el.quickInput;
        else if (state === 'noite' || state === 'falha') target = el.start;
        if (!target) return;
        if (target === el.doneTitle) target.setAttribute('tabindex', '-1');
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
    },

    // A cada segundo: relógio e cronômetro. A cada 30 s: estado completo (noite, convites)
    tick: function() {
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (hhmm !== this.lastClock) {
            this.lastClock = hhmm;
            this.setDigits(this.elements.clock, hhmm);
            this.elements.clock.setAttribute('datetime', now.toISOString());
            if (now.getHours() === 0 && now.getMinutes() === 0) this.renderDay();
        }
        if (!this.view) return;
        if (this.view.session) {
            const v = this.resolve();
            if (v.session) {
                this.renderSession(v);
                this.renderTitle(v);
                // O SW acorda por alarme (até 30 s depois): pede para fechar a fase já
                if (v.session.running && v.session.remainingSec === 0 && !this._tickSent) {
                    this._tickSent = true;
                    FocusSystem.sendCommand('pomodoro:tick').catch(() => {}).finally(() => { this._tickSent = false; });
                }
            }
        }
        if (now.getSeconds() % 30 === 0) this.render();
    },

    command: function(run, onOk) {
        return run().then((state) => {
            if (onOk) onOk(state);
            return state;
        }).catch((e) => {
            console.error('[Today] Command failed:', e);
            this.setError({ title: t('today.error_engine'), detail: t('today.error_engine_detail'), retry: () => this.command(run, onOk) });
        });
    },

    setError: function(error) {
        this.error = error;
        if (error) {
            this.elements.alertTitle.textContent = error.title;
            this.elements.alertDetail.textContent = error.detail ? ' ' + error.detail : '';
            this.elements.alertRetry.hidden = !error.retry;
        }
        this.render();
    },

    // --- Chegada ---

    localeTag: function() {
        return { pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[window._i18nLocale || 'pt'] || 'pt-BR';
    },

    capitalize: function(text) {
        return text ? text.charAt(0).toLocaleUpperCase(this.localeTag()) + text.slice(1) : text;
    },

    renderDay: function() {
        const now = new Date();
        const date = new Intl.DateTimeFormat(this.localeTag(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
        this.elements.date.textContent = this.capitalize(date);

        // Celebration and reference follow the current interface language.
        const g = window.RezarSystem ? RezarSystem.gospel() : LiturgyCore.read(this.gospel, LiturgyCore.dateKey(), window._i18nLocale || 'pt');
        const isToday = g && g.date === TasksCore.isoDate(now);
        const show = isToday && g.liturgia;
        this.elements.celebration.hidden = !show;
        this.elements.celebrationSep.hidden = !show;
        if (show) {
            const color = this.LIT_COLORS[String(g.cor || '').trim().toLowerCase()] || null;
            this.elements.celebration.className = 'lit' + (color ? ' ' + color : '');
            this.elements.celebration.textContent = g.liturgia;
        }
    },

    async setGreeting() {
        try {
            const greetings = this.data.greetings || [];
            if (!greetings.length) return;
            const today = new Date().toDateString();
            let index;
            if ((await AsyncStorage.get('ora_greeting_date')) === today) {
                const saved = await AsyncStorage.get('ora_greeting_index');
                if (saved !== null) index = parseInt(saved, 10);
            }
            if (index === undefined || isNaN(index) || !greetings[index]) {
                index = Math.floor(Math.random() * greetings.length);
                await AsyncStorage.set('ora_greeting_date', today);
                await AsyncStorage.set('ora_greeting_index', String(index));
            }
            const greeting = greetings[index];
            let text = l(greeting);
            const name = window.SettingsSystem ? SettingsSystem.getUserName() : '';
            if (name && greeting.appendName !== false) text = `${text}, ${name}`;
            this.elements.greeting.textContent = text;
        } catch (e) {
            console.error('[Today] Greeting failed:', e);
        }
    },

    async setQuote() {
        try {
            const quotes = this.data.quotes || [];
            if (!quotes.length) return;
            const today = new Date().toDateString();
            let index;
            if ((await AsyncStorage.get('ora_quote_date')) === today) {
                const saved = await AsyncStorage.get('ora_quote_index');
                if (saved !== null) index = parseInt(saved, 10);
            }
            if (index === undefined || isNaN(index) || !quotes[index]) {
                index = Math.floor(Math.random() * quotes.length);
                await AsyncStorage.set('ora_quote_date', today);
                await AsyncStorage.set('ora_quote_index', String(index));
            }
            const quote = quotes[index];
            this.elements.quoteText.textContent = `“${l(quote.text)}”`;
            this.elements.quoteAuthor.textContent = quote.author || '';
        } catch (e) {
            console.error('[Today] Quote failed:', e);
        }
    },

    // Algarismos em caixas de largura fixa (ver .clock .dg)
    setDigits: function(el, text) {
        const fragment = document.createDocumentFragment();
        for (const ch of text) {
            if (/\d/.test(ch)) {
                const span = document.createElement('span');
                span.className = 'dg';
                span.textContent = ch;
                fragment.appendChild(span);
            } else {
                fragment.appendChild(document.createTextNode(ch));
            }
        }
        el.replaceChildren(fragment);
    },

    measureDigits: function() {
        try {
            const cs = getComputedStyle(this.elements.clock);
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
            const widest = Math.max(...'0123456789'.split('').map(d => ctx.measureText(d).width)) / 100;
            document.documentElement.style.setProperty('--dg-w', widest.toFixed(3) + 'em');
        } catch (e) { /* sem canvas: largura natural */ }
    },

    renderTitle: function(v) {
        if (v.session && v.session.running) document.title = `Ora - ${this.formatTimer(v.session.remainingSec)}`;
        else document.title = t('main.new_tab_title');
    },

    // --- Intenção do dia ---

    renderIntention: function() {
        const el = this.elements;
        const has = !!this.dayIntention;
        el.intentEdit.hidden = has;
        el.intentSet.hidden = !has;
        el.intentText.textContent = has ? this.offeredText(this.dayIntention, 'today.intent_set') : '';
        if (!has && document.activeElement !== el.intentInput) el.intentInput.value = '';
    },

    saveIntention: async function(value) {
        const text = value.trim();
        const map = await AsyncStorage.get(this.INTENTION_KEY, {});
        const ok = await AsyncStorage.set(this.INTENTION_KEY, SessionsCore.setDayIntention(map, new Date(), text));
        if (!ok) {
            // O texto continua no campo; a pessoa tenta de novo
            this.setError({ title: t('today.error_intention'), detail: t('tasks.save_failed_detail'), retry: () => this.saveIntention(value) });
            return;
        }
        const hadFocus = document.activeElement === this.elements.intentInput;
        this.dayIntention = text;
        this.renderIntention();
        if (hadFocus && text) this.elements.intentChange.focus();
    },

    // --- Próximo passo e convite ---

    renderNext: function(v) {
        if (!v.next) return;
        this.elements.nextTitle.textContent = v.next.title;
        const origin = t('today.next_origin');
        this.elements.nextMeta.textContent = v.next.estimateMin
            ? `${t('tasks.minutes', { n: v.next.estimateMin })} · ${origin}`
            : this.capitalize(origin);
    },

    renderInvite: function(invite) {
        const d = window.ReminderSystem ? ReminderSystem.describe(invite) : null;
        if (!d) return;
        this.elements.inviteIcon.className = `ph ${d.icon} lead`;
        this.elements.inviteTitle.textContent = d.title;
        this.elements.inviteMeta.textContent = d.meta;
        this.elements.inviteGo.textContent = d.go;
    },

    // --- Preparação ---

    // minutes: duração já escolhida (ritual da manhã, M02)
    openPrep: function({ taskId, title, opener, minutes }) {
        const v = this.resolve();
        if (v.session) {
            showToast(t('today.session_running'), 'info');
            return;
        }
        const task = taskId && window.TaskSystem ? TaskSystem.taskById(taskId) : null;
        const durations = FocusSystem.durations();
        const draft = this.prepDraft;
        if (draft && !minutes && draft.taskId === (task ? task.id : null) && (!title || title === draft.title)) {
            // Volta ao rascunho (ex.: depois de "ver regras")
        } else {
            const estimate = task && task.estimateMin;
            this.prepDraft = {
                taskId: task ? task.id : null,
                title: task ? task.title : (title || ''),
                minutes: durations.includes(minutes) ? minutes : (durations.includes(estimate) ? estimate : FocusSystem.settings.focus),
                intention: '',
                protect: this.protectPref,
                prayer: this.prayerPref.id,
                prayerFreq: this.prayerPref.freq
            };
        }

        const el = this.elements;
        el.prepTitle.value = this.prepDraft.title;
        el.prepIntent.value = this.prepDraft.intention;
        el.prepIntentHint.textContent = this.dayIntention
            ? t('today.prep_offer_hint_day', { text: this.dayIntention })
            : t('today.prep_offer_hint');
        this.renderPrepDuration();
        this.renderPrepProtection();
        this.prayerMore = false;
        this.renderPrepPrayer();
        window.LeaveGuard?.watchEditor('preparation', this.prepDraft,
            () => LeaveGuard.snapshot(el.prep) + JSON.stringify(this.prepDraft),
            () => !!this.prepDraft);

        this.prepOpener = opener || null;
        this.prepStarting = false;
        this._prepOpenedAt = performance.now();
        this.preparing = true;
        this.render();
        DialogSystem.open(el.prep, { opener: this.prepOpener, onClose: () => this.onPrepClosed() });
        // Atividade já escolhida: o foco vai direto para a duração
        const target = this.prepDraft.title ? el.prepDur.querySelector('[aria-pressed="true"]') : el.prepTitle;
        if (target) target.focus({ preventScroll: true });
    },

    // Fecha pela própria preparação (Cancelar, Esc, clique fora) ou pelo código
    closePrep: function({ keepDraft = true, refocus = true } = {}) {
        if (!this.preparing) return;
        this.syncDraft();
        if (!keepDraft) this.prepDraft = null;
        this._prepRefocus = refocus;
        DialogSystem.close(this.elements.prep);
    },

    onPrepClosed: function() {
        const refocus = this._prepRefocus !== false && !this.prepStarting;
        this._prepRefocus = true;
        if (!this.prepStarting) this.syncDraft();
        this.preparing = false;
        this.render();
        // Quem abriu pode ter ficado escondido durante a preparação
        if (refocus) {
            const opener = this.prepOpener;
            requestAnimationFrame(() => {
                if (opener && document.contains(opener) && opener.offsetParent !== null) opener.focus({ preventScroll: true });
                else if (!this.elements.next.hidden) this.elements.start.focus({ preventScroll: true });
                else if (!this.elements.empty.hidden) this.elements.quickInput.focus({ preventScroll: true });
            });
        }
    },

    syncDraft: function() {
        if (!this.prepDraft) return;
        this.prepDraft.title = this.elements.prepTitle.value;
        this.prepDraft.intention = this.elements.prepIntent.value;
        if (!this.elements.prepProtect.disabled) this.prepDraft.protect = this.elements.prepProtect.checked;
    },

    renderPrepDuration: function() {
        const draft = this.prepDraft;
        const fragment = document.createDocumentFragment();
        FocusSystem.durations().forEach(min => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.min = String(min);
            btn.setAttribute('aria-pressed', String(min === draft.minutes));
            btn.textContent = t('tasks.minutes', { n: min });
            fragment.appendChild(btn);
        });
        const hadFocus = this.elements.prepDur.contains(document.activeElement);
        this.elements.prepDur.replaceChildren(fragment);
        if (hadFocus) {
            const pressed = this.elements.prepDur.querySelector('[aria-pressed="true"]');
            if (pressed) pressed.focus();
        }
        this.renderPrepStart();
    },

    // Com oração, "Começar" leva a ela; os minutos aparecem no "Amém"
    renderPrepStart: function() {
        const draft = this.prepDraft;
        if (!draft) return;
        this.elements.prepStartLabel.textContent = this.duePrayer()
            ? t('today.prep_start_pray')
            : t('today.prep_start', { n: draft.minutes });
    },

    // --- Oração ao começar (FocusPrayerCore) ---

    prayerLang: function() {
        return window.SettingsSystem ? SettingsSystem.getPrayerLang() : (window._i18nLocale || 'pt');
    },

    prayerList: function() {
        return window.PrayerSystem ? PrayerSystem.prayers : [];
    },

    prayerTitle: function(p) {
        return window.PrayUI ? PrayUI.title(p) : (p.title || p.id);
    },

    // A oração que esta preparação vai rezar, ou null
    duePrayer: function() {
        const draft = this.prepDraft;
        if (!draft) return null;
        return FocusPrayerCore.due({ id: draft.prayer, freq: draft.prayerFreq }, this.prayerDay, Date.now(),
            this.prayerList(), this.prayerLang(), p => this.prayerTitle(p));
    },

    // A oração escolhida (mesmo que já rezada hoje), ou null se "Nenhuma" ou sem texto no idioma
    chosenPrayer: function() {
        const draft = this.prepDraft;
        if (!draft || draft.prayer === FocusPrayerCore.NONE) return null;
        return FocusPrayerCore.due({ id: draft.prayer, freq: 'every' }, null, Date.now(),
            this.prayerList(), this.prayerLang(), p => this.prayerTitle(p));
    },

    renderPrepPrayer: function() {
        const draft = this.prepDraft;
        if (!draft) return;
        const el = this.elements;
        const chosen = this.chosenPrayer();
        el.prayerPick.classList.toggle('is-none', !chosen);
        el.prayerName.textContent = chosen ? chosen.title : t('today.prayer_none');
        let hint = 'today.prayer_hint_none';
        if (chosen) {
            if (draft.prayerFreq === 'every') hint = 'today.prayer_hint_every';
            else hint = this.duePrayer() ? 'today.prayer_hint_first' : 'today.prayer_hint_done';
        }
        el.prayerHint.textContent = t(hint);
        el.prayerFreq.querySelectorAll('[data-freq]').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.freq === draft.prayerFreq));
        });
        if (DialogSystem.isOpen(el.prayerPop)) this.renderPrayerOpts();
        this.renderPrepStart();
    },

    renderPrayerOpts: function() {
        const draft = this.prepDraft;
        if (!draft) return;
        const el = this.elements;
        const FP = FocusPrayerCore;
        const lang = this.prayerLang();
        const title = p => this.prayerTitle(p);
        const main = FP.options(this.prayerList(), lang, draft.prayer, title);
        const more = this.prayerMore ? FP.library(this.prayerList(), lang, main.map(o => o.id), title) : [];
        const selected = [FP.NONE, ...main.map(o => o.id), ...more.map(o => o.id)].includes(draft.prayer) ? draft.prayer : FP.NONE;

        const make = (id, name, preview, { long = false, isMore = false, plain = false } = {}) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'prayer-opt' + (plain ? ' is-plain' : '');
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', String(id === selected));
            btn.tabIndex = id === selected ? 0 : -1;
            btn.dataset.prayer = id;
            if (isMore) btn.dataset.more = '';
            const b = document.createElement('b');
            b.textContent = name;
            if (long) {
                const len = document.createElement('span');
                len.className = 'len';
                len.textContent = t('today.prayer_long');
                b.append(' ', len);
            }
            const first = document.createElement('span');
            first.className = 'first';
            first.textContent = preview;
            if (!plain) first.lang = lang;
            const check = document.createElement('i');
            check.className = 'ph ph-check check';
            check.setAttribute('aria-hidden', 'true');
            btn.append(b, first, check);
            return btn;
        };

        const fragment = document.createDocumentFragment();
        fragment.appendChild(make(FP.NONE, t('today.prayer_none'), t('today.prayer_none_preview'), { plain: true }));
        main.forEach(o => fragment.appendChild(make(o.id, o.title, o.preview, { long: o.long })));
        if (more.length) {
            const sep = document.createElement('span');
            sep.className = 'prayer-sep';
            sep.setAttribute('aria-hidden', 'true');
            fragment.appendChild(sep);
            more.forEach(o => fragment.appendChild(make(o.id, o.title, o.preview, { long: o.long, isMore: true })));
        }
        el.prayerOpts.replaceChildren(fragment);
        el.prayerMoreBtn.hidden = this.prayerMore;
    },

    openPrayerPop: function() {
        const el = this.elements;
        this.renderPrayerOpts();
        el.prayerPop.classList.remove('is-up');
        el.prayerPick.setAttribute('aria-expanded', 'true');
        DialogSystem.open(el.prayerPop, {
            opener: el.prayerPick,
            onClose: () => el.prayerPick.setAttribute('aria-expanded', 'false')
        });
        // Abre para o lado com mais espaço (acima, sem passar por baixo do cabeçalho)
        // e limita a altura ao espaço livre; a lista rola por dentro
        el.prayerPop.style.maxHeight = '';
        const pick = el.prayerPick.getBoundingClientRect();
        const topbar = document.querySelector('.topbar');
        const ceiling = topbar ? topbar.getBoundingClientRect().bottom : 0;
        const below = window.innerHeight - pick.bottom - 12;
        const above = pick.top - ceiling - 12;
        const natural = el.prayerPop.getBoundingClientRect().height;
        const up = natural > below && above > below;
        el.prayerPop.classList.toggle('is-up', up);
        el.prayerPop.style.setProperty('--pick-h', `${pick.height}px`);
        const room = Math.floor(up ? above : below);
        if (natural > room) el.prayerPop.style.maxHeight = `${Math.max(160, room)}px`;
        window.Motion?.play(el.prayerPop, [
            { opacity: 0, transform: 'translateY(-4px)' },
            { opacity: 1, transform: 'none' }
        ], { duration: 160 });
        const checked = el.prayerOpts.querySelector('[aria-checked="true"]');
        if (checked) checked.focus({ preventScroll: true });
        if (checked) checked.scrollIntoView({ block: 'nearest' });
    },

    choosePrayer: function(id) {
        if (!this.prepDraft) return;
        this.prepDraft.prayer = id;
        DialogSystem.close(this.elements.prayerPop);
        this.renderPrepPrayer();
    },

    // Entre a preparação e o cronômetro: a oração sobre a paisagem
    openPrayer: function(prayer, params) {
        const el = this.elements;
        this.praying = { prayer, params };
        this.prepStarting = true;
        DialogSystem.close(el.prep);
        this.prepStarting = false;

        el.prayerTitle.textContent = prayer.title;
        el.prayerText.textContent = prayer.text;
        el.prayerText.lang = this.prayerLang();
        el.prayer.classList.toggle('is-long', prayer.long);
        // Texto longo rola: precisa ser alcançável pelo teclado
        if (prayer.long) el.prayerText.tabIndex = 0;
        else el.prayerText.removeAttribute('tabindex');
        el.prayerOffer.hidden = !params.intention;
        el.prayerOffer.textContent = params.intention ? this.offeredText(params.intention, 'today.prayer_offer') : '';
        el.prayerAmen.textContent = t('today.prayer_amen', { n: params.minutes });
        el.prayerMeta.textContent = t('today.prayer_meta', { title: params.title });

        this.render();
        DialogSystem.open(el.prayer, { onClose: () => this.onPrayerClosed() });
        el.prayerText.scrollTop = 0;
        el.prayerAmen.focus({ preventScroll: true });

        const M = window.Motion;
        if (M) {
            // Sem vidro aqui: opacidade não tira desfoque de ninguém
            [...el.prayer.children].forEach((node, i) => {
                if (node.hidden) return;
                M.play(node, [
                    { opacity: 0, transform: 'translateY(8px)' },
                    { opacity: 1, transform: 'none' }
                ], { duration: 520, delay: [0, 60, 180, 360, 360, 520, 560][i] || 0, fill: 'backwards', channel: 'state' });
            });
        }
    },

    // "Amém" ou "Pular": os dois contam como a oração do dia (com "primeira sessão")
    finishPrayer: async function() {
        const p = this.praying;
        if (!p || this.prayerStarting) return;
        const day = FocusPrayerCore.dayKey(Date.now());
        this.prayerDay = day;
        AsyncStorage.set(FocusPrayerCore.DAY_KEY, day);
        this.startLaunch();
        this.prayerStarting = true;
        DialogSystem.close(this.elements.prayer);
        this.prayerStarting = false;
        this.praying = null;
        await this.beginFocus(p.params);
    },

    // Esc: volta à preparação com o mesmo rascunho
    onPrayerClosed: function() {
        if (this.prayerStarting) return;
        this.praying = null;
        const draft = this.prepDraft;
        if (draft && !(this.view && this.view.session)) {
            this.openPrep({ taskId: draft.taskId, title: draft.title });
        } else {
            this.render();
        }
    },

    // Outra aba começou uma sessão durante a oração
    cancelPrayer: function() {
        if (!this.praying) return;
        this.prayerStarting = true;
        DialogSystem.close(this.elements.prayer);
        this.prayerStarting = false;
        this.praying = null;
        this.prepDraft = null;
    },

    renderPrepProtection: function() {
        if (!this.prepDraft) return;
        const st = this.protection || { key: 'empty', sites: [] };
        const toggle = this.elements.prepProtect;
        const hint = this.elements.prepProtectHint;
        if (st.key === 'empty' || st.key === 'no-perm') {
            toggle.checked = false;
            toggle.disabled = true;
            hint.textContent = t(st.key === 'no-perm' ? 'protection.summary_no_perm' : 'today.prep_protect_empty');
            this.elements.prepRules.textContent = t('today.prep_choose_sites');
        } else if (st.key === 'active' || st.key === 'focus') {
            toggle.disabled = false;
            toggle.checked = this.prepDraft.protect;
            hint.textContent = t('today.prep_protect_active', { n: st.sites.length });
            this.elements.prepRules.textContent = t('today.prep_rules');
        } else {
            toggle.disabled = false;
            toggle.checked = this.prepDraft.protect;
            hint.textContent = t('today.prep_protect_session', { n: st.sites.length });
            this.elements.prepRules.textContent = t('today.prep_rules');
        }
    },

    startFromPrep: async function() {
        if (!this.preparing || this.prepStarting) return;
        this.syncDraft();
        const draft = this.prepDraft;
        const task = draft.taskId && window.TaskSystem ? TaskSystem.taskById(draft.taskId) : null;
        const title = draft.title.trim() || t('today.free_focus');
        // Mudar o nome da atividade desliga a sessão da tarefa
        const taskId = task && task.title === title ? task.id : null;
        const st = this.protection || { key: 'empty' };
        const protect = st.key !== 'empty' && st.key !== 'no-perm' && Boolean(draft.protect);
        const params = { minutes: draft.minutes, taskId, title, intention: draft.intention.trim(), protect };

        if (!this.elements.prepProtect.disabled) {
            this.protectPref = draft.protect;
            AsyncStorage.set(this.PROTECT_PREF_KEY, draft.protect);
        }
        // A escolha da oração vale para as próximas preparações, como a proteção.
        const prayerPref = FocusPrayerCore.normalize({ id: draft.prayer, freq: draft.prayerFreq });
        if (prayerPref.id !== this.prayerPref.id || prayerPref.freq !== this.prayerPref.freq) {
            this.prayerPref = prayerPref;
            AsyncStorage.set(FocusPrayerCore.PREF_KEY, prayerPref);
        }
        const prayer = this.duePrayer();
        if (prayer) {
            this.openPrayer(prayer, params);
            return;
        }

        this.startLaunch();
        this.prepStarting = true;
        DialogSystem.close(this.elements.prep);
        this.prepStarting = false;
        await this.beginFocus(params);
    },

    beginFocus: async function(params) {
        try {
            await FocusSystem.startFocus(params);
            this.prepDraft = null;
            this.elements.quickInput.value = '';
        } catch (e) {
            console.error('[Today] Could not start focus:', e);
            if (this.launch) this.endLaunch();
            this.setError({ title: t('today.error_start'), detail: t('today.error_engine_detail'), retry: () => this.beginFocus(params) });
        }
    },

    // --- Sessão ---

    formatTimer: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    hhmm: function(ms) {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    // "pela minha equipe" → "Oferecida pela minha equipe"; "minha mãe" → "Oferecida por minha mãe"
    offeredText: function(intention, key) {
        const hasPrep = /^(por|pela|pelo|pelos|pelas|for|para|por el|por la)\b/i.test(intention);
        return t(hasPrep ? key + '_raw' : key, { text: intention });
    },

    renderSession: function(v) {
        const el = this.elements;
        const s = v.session;
        const focus = s.kind === 'focus';
        const paused = !s.running;

        el.sessionDot.className = 'dot' + (paused ? ' warn' : '');
        el.sessionState.textContent = focus
            ? t(paused ? 'today.state_paused' : 'today.state_focus')
            : t(paused ? 'today.state_break_paused' : (s.kind === 'longPause' ? 'today.state_long_break' : 'today.state_break'));
        const title = focus ? (s.title || t('today.free_focus')) : t('today.break_title');
        if (el.sessionTitle.textContent !== title) el.sessionTitle.textContent = title;
        this.setDigits(el.timer, this.formatTimer(s.remainingSec));
        el.progress.style.transform = `scaleX(${Math.min(1, Math.max(0, Number(s.progress) || 0)).toFixed(4)})`;
        el.sessionMeta.textContent = paused ? t('today.left_paused') : t('today.left_until', { time: this.hhmm(s.endsAt) });

        el.sessionIntent.hidden = !(focus && s.intention);
        if (focus && s.intention) el.sessionIntent.textContent = this.offeredText(s.intention, 'today.offered');

        el.pauseNote.hidden = !paused;
        if (paused) el.pauseNote.textContent = t(focus && s.protected ? 'today.pause_note_protected' : 'today.pause_note');

        el.pause.hidden = paused;
        el.resume.hidden = !paused;
        el.end.textContent = t(focus ? 'today.end_session' : 'today.end_break');


        el.sessionProtect.hidden = !(focus && s.protected);
        if (focus && s.protected) {
            el.sessionProtectText.textContent = paused ? t('today.protect_paused') : t('today.protect_until', { time: this.hhmm(s.endsAt) });
        }
    },

    askEnd: function() {
        const v = this.resolve();
        const s = v.session;
        if (!s) return;
        if (s.kind !== 'focus') {
            this.command(() => FocusSystem.goHome());
            return;
        }
        const left = Math.max(1, Math.ceil(s.remainingSec / 60));
        const session = this.pomodoro && this.pomodoro.session;
        const done = session ? Math.floor(SessionsCore.focusedMs(session, Date.now()) / 60000) : 0;
        this.elements.endDesc.textContent = done >= 1
            ? t('today.end_desc', { left, done })
            : t('today.end_desc_none', { left });
        DialogSystem.open(this.elements.endDialog, { opener: this.elements.end });
    },

    // --- Concluída ---

    currentBreakMin: function() {
        const c = this.view && this.view.completed;
        return this.breakMin || (c ? c.breakMin : 15);
    },

    adjustBreak: function(delta) {
        this.breakMin = Math.max(5, Math.min(60, this.currentBreakMin() + delta));
        this.renderDone(this.view);
    },

    renderDone: function(v) {
        const el = this.elements;
        const c = v.completed;
        el.doneTitle.textContent = c.title || t('today.free_focus');
        const minutes = t('tasks.minutes', { n: c.focusedMin || c.plannedMin });
        el.doneMeta.textContent = c.intention ? `${minutes} · ${this.offeredText(c.intention, 'today.offered_done')}` : minutes;

        el.doneCheckRow.hidden = !c.taskId;
        el.doneCheck.checked = !!c.taskDone;

        const long = c.breakKind === 'longPause';
        const breakMin = long ? this.currentBreakMin() : c.breakMin;
        el.breakEdit.hidden = !long;
        el.respiro.hidden = !long;
        if (long) {
            el.breakMinOut.textContent = t('tasks.minutes', { n: breakMin });
            el.breakLess.disabled = breakMin <= 5;
            el.breakMore.disabled = breakMin >= 60;
        }
        el.breakLabel.textContent = t(long ? 'today.long_break_start' : 'today.break_start', { n: breakMin });

        el.after.hidden = !c.after;
        el.afterTitle.textContent = c.after?.title || '';
    },

    // --- Evangelho ---

    renderGospel: function() {
        const el = this.elements;
        const g = window.RezarSystem ? RezarSystem.gospel() : LiturgyCore.read(this.gospel, LiturgyCore.dateKey(), window._i18nLocale || 'pt');
        const today = TasksCore.isoDate(new Date());
        const locale = window._i18nLocale || 'pt';
        el.gospelFull.href = LiturgyCore.source(locale,today).external;

        if (g && g.ref && g.date === today) {
            el.gospelRef.textContent = t('today.gospel_ref', { ref: g.ref });
        } else if (g && g.ref) {
            const [y, m, d] = String(g.date).split('-');
            el.gospelRef.textContent = t('today.gospel_stale', { date: `${d}/${m}`, ref: g.ref });
        } else {
            el.gospelRef.textContent = t('today.gospel_none');
        }
        // The reader chooses its source by interface language.
        el.gospelRead.hidden = false;
    },

    readGospel: function() {
        RouterSystem.navigate('rezar/evangelho');
    }
};

window.TodaySystem = TodaySystem;
