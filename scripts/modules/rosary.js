const RosarySystem = {
    state: null, saved: null, structure: [], data: null, busy: false,
    async init(data) {
        this.data = data; this.structure = data.rosary.structure;
        const stored = await AsyncStorage.get('ora_rosary_progress');
        this.state = RosaryCore.restore(stored,this.structure);
        this.saved = stored ? { ...this.state } : null;
        this.cacheDOM(); this.bindEvents();
    },
    cacheDOM() {},
    bindEvents() {
        document.getElementById('btn-rosary')?.addEventListener('click', () => this.open());
        window.addEventListener('keydown', e => {
            const route = RouterSystem.current();
            if (route.view !== 'rezar' || route.path.join('/') !== 'terco/oracao' || this.state.completed || DialogSystem.top()) return;
            if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
            if (e.key === ' ' && e.target.closest('button,a,[role="button"]')) return;
            if (!['ArrowLeft','ArrowRight',' '].includes(e.key) || e.repeat) return;
            e.preventDefault(); this.advance(e.key === 'ArrowLeft' ? -1 : 1);
        });
        chrome.storage.onChanged.addListener((changes,area) => {
            if (area !== 'local' || !changes.ora_rosary_progress || this.busy) return;
            this.saved = RosaryCore.restore(changes.ora_rosary_progress.newValue,this.structure);
            const route = RouterSystem.current();
            if (route.view === 'rezar' && route.path.join('/') === 'terco/oracao') { this.state = { ...this.saved }; this.renderPrayer(); }
        });
    },
    open() { RouterSystem.navigate('rezar/terco'); },
    async startChaplet(type) {
        this.prep = { ...this.state, chapletType: type, bead: 0, completed: false };
        if (await this.persist(this.prep)) RouterSystem.navigate('rezar/terco/oracao');
    },
    render(praying) {
        if (!this.structure.length) { PrayUI.mount(`<div class="pray-wrap">${PrayUI.heading(PrayUI.text('rosary'))}</div>`); PrayUI.back(); return; }
        if (praying) this.renderPrayer(); else this.renderPreparation();
    },
    renderPreparation() {
        const u = PrayUI;
        this.prep = { ...this.state, mystery: RosaryCore.mysteryForDay(new Date()), chapletType: 'terco', completed: false };
        const resumable = this.saved && !this.saved.completed && this.saved.bead > 0;
        const position = resumable ? this.describe(this.saved) : null;
        u.mount(`<div class="pray-wrap pray-narrow rosary-preparation">${u.heading(u.text('prepare'))}<p class="meta">${u.text('suggested',{mystery:t('pray.' + this.prep.mystery)})}</p>
            <div class="seg" role="group" aria-label="${u.text('rosary')}"><button id="rosary-type-terco" aria-pressed="true">${u.text('rosary')}</button><button id="rosary-type-misericordia" aria-pressed="false">${u.text('mercy')}</button></div>
            <div id="rosary-mystery-fields"><div class="seg" role="group" aria-label="${u.text('mysteries')}">${RosaryCore.MYSTERIES.map(m => `<button data-mystery="${m}" aria-pressed="${m === this.prep.mystery}">${u.text(m)}</button>`).join('')}</div><ol id="rosary-mystery-list"></ol></div>
            <label class="field"><span>${u.text('intention')}</span><input class="input" id="rosary-intention" maxlength="240" value="${u.e(this.prep.intention)}" autocomplete="off"></label>
            <div class="field"><span>${u.text('prayer_text')}</span><div class="seg" role="group" aria-label="${u.text('prayer_text')}">${['full','name'].map(mode => `<button data-text-mode="${mode}" aria-pressed="${this.prep.textMode === mode}">${u.text(mode)}</button>`).join('')}</div></div>
            <label class="field"><span>${u.text('language')}</span><select class="input" id="rosary-language">${['pt','en','es','la'].map(lang => `<option value="${lang}" ${this.prep.lang === lang ? 'selected' : ''}>${u.text(lang)}</option>`).join('')}</select></label>
            ${resumable ? `<div class="banner info"><p>${u.text('resume_position',{mystery:this.saved.chapletType === 'misericordia' ? t('pray.mercy') : t('pray.' + this.saved.mystery),decade:position.decade,prayer:position.title})}</p>${u.button('rosary-resume','resume','btn-aux')}</div>` : ''}
            <div class="row">${u.button('rosary-start','start','btn-primary btn-lg')}</div><p class="meta" id="rosary-status" role="status"></p></div>`);
        u.back(); this.renderMysteries();
        for (const type of ['terco','misericordia']) u.on('rosary-type-' + type,'click', () => {
            this.prep.chapletType = type;
            for (const option of ['terco','misericordia']) document.getElementById('rosary-type-' + option).setAttribute('aria-pressed',option === type);
            document.getElementById('rosary-mystery-fields').hidden = type === 'misericordia';
        });
        PrayUI.root.querySelectorAll('[data-mystery]').forEach(button => button.addEventListener('click', () => {
            this.prep.mystery = button.dataset.mystery;
            PrayUI.root.querySelectorAll('[data-mystery]').forEach(b => b.setAttribute('aria-pressed',b === button)); this.renderMysteries();
        }));
        PrayUI.root.querySelectorAll('[data-text-mode]').forEach(button => button.addEventListener('click', () => { this.prep.textMode = button.dataset.textMode; PrayUI.root.querySelectorAll('[data-text-mode]').forEach(b => b.setAttribute('aria-pressed',b === button)); }));
        u.on('rosary-language','change', e => this.prep.lang = e.target.value);
        u.on('rosary-resume','click', () => { this.state = { ...this.saved }; RouterSystem.navigate('rezar/terco/oracao'); });
        const begin = async () => {
            this.prep.intention = document.getElementById('rosary-intention').value.trim();
            const ok = await this.persist({ ...this.prep, bead: 0, completed: false });
            if (ok) RouterSystem.navigate('rezar/terco/oracao');
            return ok;
        };
        u.on('rosary-start','click', () => resumable ? u.confirm('restart_title','restart_body',begin) : begin());
    },
    renderMysteries() {
        const locale = window._i18nLocale || 'pt', mysteries = this.data.rosary.mysteries[this.prep.mystery];
        document.getElementById('rosary-mystery-list').innerHTML = (mysteries[locale] || []).map(name => `<li>${PrayUI.e(name)}</li>`).join('');
    },
    prayerInfo(state = this.state) {
        const bead = this.structure[state.bead]; if (!bead) return { title:'', text:'' };
        let type = bead.type;
        if (state.chapletType === 'misericordia') {
            if (state.bead === 1) type = 'pai-nosso';
            else if (state.bead === 2) type = 'ave-maria';
            else if (state.bead === 3) type = 'credo';
            else if (bead.type === 'salve-rainha') type = 'santo-deus';
            else if (bead.decade > 0) type = bead.type === 'pai-nosso' ? 'pai-eterno' : 'dolorosa-paixao';
        }
        const prayer = this.data.prayers.find(p => p.id === type), extra = this.data.rosary.extraPrayers[type];
        const title = prayer ? PrayUI.title(prayer) : t('pray.' + type);
        const text = prayer ? prayer.text[state.lang] : extra?.[state.lang];
        return { title, text: text || t('pray.translation_missing') };
    },
    describe(state) {
        const p = RosaryCore.position(state,this.structure), info = this.prayerInfo(state);
        return { ...p, title: p.hail ? t('pray.hail_n',{prayer:info.title,n:p.hail,total:p.decade ? 10 : 3}) : info.title };
    },
    renderPrayer() {
        const u = PrayUI, s = this.state, bead = this.structure[s.bead], pos = this.describe(s), info = this.prayerInfo();
        const locale = window._i18nLocale || 'pt', names = this.data.rosary.mysteries[s.mystery];
        const mysteryName = bead.decade > 0 ? names[locale]?.[bead.decade - 1] : '';
        const allowed = RosaryCore.indices(this.structure,s.chapletType), last = s.bead === allowed[allowed.length - 1];
        const title = s.chapletType === 'misericordia' ? t('pray.mercy') : t('pray.rosary');
        const art = bead.type === 'pai-nosso' && s.chapletType === 'terco' ? names.images?.[bead.decade - 1] : null;
        u.mount(`<div class="rosary-screen"><header class="rosary-top">${u.button('rosary-exit','close')}<span>${u.e(title)}</span><span class="meta">${u.e(s.intention)}</span></header><div class="rosary-main">
            <nav class="mystery-bar" aria-label="${u.text('mysteries')}">${[1,2,3,4,5].map(n => `<button data-decade="${n}" ${bead.decade === n ? 'aria-current="step"' : ''} aria-label="${(s.chapletType === 'misericordia' ? u.text('stage',{n,total:5}) : u.text('mystery_n',{n,mystery:t('pray.' + s.mystery)}))}"><span>${n}</span></button>`).join('')}</nav>
            ${s.completed ? `<h1 tabindex="-1" data-route-focus>${u.text('completed_rosary')}</h1>${u.button('rosary-done','return','btn-primary')}` : `<div class="mystery-heading"><p class="label">${u.e(bead.decade ? (s.chapletType === 'misericordia' ? t('pray.stage',{n:bead.decade,total:5}) : t('pray.mystery_n',{n:bead.decade,mystery:t('pray.' + s.mystery)})) : t('pray.' + (bead.type === 'salve-rainha' ? 'closing_rosary' : 'intro_rosary')))}</p><h1 tabindex="-1" data-route-focus>${u.e(s.chapletType === 'terco' ? mysteryName : title)}</h1></div>
            ${art?.url && /^(https:\/\/|assets\/)/.test(art.url) ? `<figure class="mystery-art"><img src="${u.e(art.url)}" alt="${u.e(mysteryName)}">${art.caption ? `<figcaption>${u.e(l(art.caption))}</figcaption>` : ''}</figure>` : ''}
            <div class="rosary-beads" role="group" aria-label="${u.text('prayer_text')}">${allowed.filter(i => this.structure[i].decade === bead.decade).map(i => `<button data-bead="${i}" class="rosary-bead-control ${i < s.bead ? 'visited' : ''}" ${i === s.bead ? 'aria-current="step"' : ''} aria-label="${u.e(this.describe({...s,bead:i}).title)}"><span></span></button>`).join('')}</div>
            <div class="rosary-prayer" aria-live="polite" aria-atomic="true"><h2>${u.e(pos.title)}</h2>${s.textMode === 'full' ? `<p class="prayer-prose" lang="${u.e(s.lang)}">${u.e(info.text)}</p>` : ''}</div><div class="row rosary-controls">${u.button('rosary-previous','previous','btn-aux btn-lg',s.bead === allowed[0] ? 'disabled' : '')}${u.button('rosary-next',last ? 'finish' : 'next','btn-primary btn-lg')}</div><p class="meta">${u.text('keyboard')}</p>`}
            <p class="meta" id="rosary-status" role="status"></p></div></div>`,'praying');
        u.on('rosary-exit','click', () => RouterSystem.navigate('rezar'));
        u.on('rosary-done','click', () => RouterSystem.navigate('rezar'));
        u.on('rosary-previous','click', () => this.advance(-1));
        u.on('rosary-next','click', () => this.advance(1));
        this.rootButtons('[data-decade]',b => this.goTo(this.structure.findIndex(be => be.decade === Number(b.dataset.decade) && be.type === 'pai-nosso')));
        this.rootButtons('[data-bead]',b => this.goTo(Number(b.dataset.bead)));
        u.root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.closest('figure').remove(),{once:true}));
    },
    rootButtons(selector, action) { PrayUI.root.querySelectorAll(selector).forEach(b => b.addEventListener('click', () => action(b))); },
    async persist(next) {
        if (this.busy) return false;
        this.busy = true;
        try {
            const clean = RosaryCore.restore(next,this.structure);
            if (!await PrayUI.save('ora_rosary_progress',clean,document.getElementById('rosary-status'))) return false;
            this.state = clean; this.saved = { ...clean }; return true;
        } finally { this.busy = false; }
    },
    async advance(delta) {
        const allowed = RosaryCore.indices(this.structure,this.state.chapletType);
        const last = this.state.bead === allowed[allowed.length - 1];
        const next = delta > 0 && last ? { ...this.state, completed:true } : RosaryCore.move(this.state,delta,this.structure);
        if (await this.persist(next)) {
            this.renderPrayer();
            document.getElementById(delta > 0 ? 'rosary-next' : 'rosary-previous')?.focus({ preventScroll:true });
        }
    },
    async goTo(bead) { if (bead >= 0 && await this.persist({ ...this.state, bead, completed:false })) { this.renderPrayer(); document.getElementById('rosary-next')?.focus({ preventScroll:true }); } }
};
window.RosarySystem = RosarySystem;
