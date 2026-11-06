const ReaderSystem = {
    state: { size: 19, appearance: 'escuro' }, token: 0, active: null, custom: {}, returnRoute: 'rezar',
    async init() {
        this.state = ReaderCore.preferences(await AsyncStorage.get(SettingsCore.READER_KEY, {}));
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[SettingsCore.READER_KEY]) {
                this.applyPreferences(ReaderCore.preferences(changes[SettingsCore.READER_KEY].newValue || {}));
            }
        });
        window.addEventListener('pagehide', () => this.leave());
        this.cacheDOM(); this.bindEvents();
    },
    cacheDOM() {}, bindEvents() {},
    openPrayer(prayer) {
        this.custom[prayer.id] = prayer;
        this.returnRoute = RouteCore.serializeRoute(RouterSystem.current());
        RouterSystem.navigate('rezar/leitor/' + encodeURIComponent(prayer.id));
        history.replaceState({ ...history.state, prayerReturn: this.returnRoute }, '', location.href);
    },
    async render(id) {
        const prayer = PrayerSystem.prayers.find(p => p.id === id) || this.custom[id];
        if (!prayer) { PrayerSystem.render(); return; }
        this.prayer = prayer;
        const preferred = window.SettingsSystem ? SettingsSystem.getPrayerLang() : (window._i18nLocale || 'pt');
        // The initial installation used pt for all locales; respect that explicit preference.
        this.lang = this.overrideLang || preferred;
        const text = prayer.text[this.lang];
        const u = PrayUI;
        await this.present({ id: prayer.id, title: u.title(prayer), lang: this.lang,
            content: `<h1 tabindex="-1" data-route-focus>${u.e(u.title(prayer))}</h1>${text ? `<div class="prayer-prose" lang="${u.e(this.lang)}">${u.e(text)}</div>` : `<p>${u.text('translation_missing')}</p>`}`,
            languages: Object.keys(prayer.text).filter(lang => prayer.text[lang]?.trim()), favorite: true });
        // Frutos: oração aberta no leitor (uma vez por oração e por dia)
        if (text && this.prayer === prayer && window.PracticeLog) PracticeLog.record('prayer', { id: prayer.id });
    },
    async renderGospel(lectio) {
        this.prayer = null;
        const u = PrayUI, locale = window._i18nLocale || 'pt', date = LiturgyCore.dateKey(), g = RezarSystem.gospel(locale);
        const source = LiturgyCore.source(locale, date);
        const content = `${RezarSystem.figure(g)}<p class="label">${u.text('gospel')}</p><h1 tabindex="-1" data-route-focus>${u.e(g?.ref || t('pray.no_reference'))}</h1><p class="meta">${u.e(g?.liturgia || '')}</p>${g && g.text && locale === 'pt' ? `<div class="prayer-prose" lang="pt">${u.e(g.text)}</div>` : `<p>${u.text(g ? 'external_gospel' : 'unavailable')}</p>${u.link(source.external,u.text('read'),'btn btn-primary')}`}<p>${u.link(source.external,u.text('liturgy'))}</p>`;
        await this.present({ id: 'evangelho-' + date, title: t('pray.' + (lectio ? 'lectio' : 'gospel')), lang: locale, content, lectio });
    },
    async present(doc) {
        this.leave();
        const token = ++this.token, u = PrayUI;
        const key = `ora_reader_position_${doc.id}_${doc.lang}`;
        const saved = await AsyncStorage.get(key, 0);
        if (token !== this.token || RouterSystem.current().view !== 'rezar') return;
        const title = u.e(doc.title);
        u.mount(`<div class="prayer-reader" data-appearance="${this.state.appearance}"><div class="reading-bar">${u.button('reader-back','back')}<span class="reading-context">${title}</span><div class="reading-options">${doc.languages ? `<label class="reader-language"><span class="sr-only">${u.text('language')}</span><select id="reader-language" class="input"><option value="" disabled ${!doc.languages.includes(doc.lang) ? 'selected' : ''}>${u.text('language')}</option>${doc.languages.map(lang => `<option value="${lang}" ${lang === doc.lang ? 'selected' : ''}>${u.text(lang)}</option>`).join('')}</select></label>` : ''}<div class="seg" role="group" aria-label="${u.text('reader')}"><button id="reader-size-down" aria-label="${u.text('smaller')}">A−</button><output id="reader-size">${this.state.size}</output><button id="reader-size-up" aria-label="${u.text('larger')}">A+</button></div><div class="seg" role="group" aria-label="${u.text('reader')}">${['escuro','papel'].map(ap => `<button id="reader-${ap}" aria-pressed="${this.state.appearance === ap}">${u.text(ap === 'papel' ? 'paper' : 'dark')}</button>`).join('')}</div></div>${doc.favorite ? `<button id="reader-favorite" class="prayer-star" aria-pressed="${PrayerSystem.favorites.includes(doc.id)}" aria-label="${u.text(PrayerSystem.favorites.includes(doc.id) ? 'unfavorite' : 'favorite',{title:doc.title})}">★</button>` : ''}</div>

            <div class="reading-progress" aria-hidden="true"><span id="reading-progress-fill"></span></div>
            ${doc.lectio ? `<nav class="lectio-access">${u.button('lectio-to-guide','to_guide')}${u.button('lectio-to-text','to_text')}</nav>` : ''}
            <div class="reading-layout ${doc.lectio ? 'with-lectio' : ''}" id="reading-scroll" tabindex="0" aria-label="${title}"><article class="reading-inner" style="--read-size:${this.state.size / 16}rem">${doc.content}</article>${doc.lectio ? '<aside class="lectio-guide" id="lectio-guide" tabindex="-1"></aside>' : ''}</div><p class="reading-status meta" id="reader-status" role="status"></p></div>`, 'reading');
        const scroll = document.getElementById('reading-scroll');
        this.active = { key, scroll, ready: false, listener: null };
        this.progress(saved);
        u.on('reader-back','click', () => { this.overrideLang = null; RouterSystem.navigate(history.state?.prayerReturn || (doc.favorite ? this.returnRoute : 'rezar')); });
        u.on('reader-favorite','click', async () => { if (await PrayerSystem.toggleFavorite(doc.id)) { const button = document.getElementById('reader-favorite'); button.setAttribute('aria-pressed', PrayerSystem.favorites.includes(doc.id)); button.setAttribute('aria-label', t(PrayerSystem.favorites.includes(doc.id) ? 'pray.unfavorite' : 'pray.favorite',{title:doc.title})); } });
        u.on('reader-language','change', e => { this.overrideLang = e.target.value; this.render(doc.id); });
        u.on('reader-size-down','click', () => this.preference({ size: Math.max(16,this.state.size - 2) }));
        u.on('reader-size-up','click', () => this.preference({ size: Math.min(38,this.state.size + 2) }));
        for (const appearance of ['escuro','papel']) u.on('reader-' + appearance,'click', () => this.preference({ appearance }));
        if (doc.lectio) {
            this.lectioDate = LiturgyCore.dateKey();
            this.lectio = await AsyncStorage.get('ora_lectio_' + this.lectioDate, { step: 0, notes: {} });
            if (token !== this.token) return;
            this.lectio.step = Math.max(0,Math.min(3,Number(this.lectio.step) || 0)); this.lectio.notes ||= {};
            this.renderGuide();
            u.on('lectio-to-guide','click', () => document.getElementById('lectio-guide').focus());
            u.on('lectio-to-text','click', () => scroll.focus());
        }
        PrayUI.root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.closest('figure').remove(), { once: true }));
        await document.fonts.ready;
        // Do not let a late artwork load move the restored reading position.
        await Promise.all([...PrayUI.root.querySelectorAll('img')].map(async img => {
            let timer;
            await Promise.race([img.decode().catch(() => img.closest('figure')?.remove()),new Promise(resolve => { timer = setTimeout(() => { if (!img.complete) img.closest('figure')?.remove(); resolve(); },5000); })]);
            clearTimeout(timer);
        }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (token !== this.token || !this.active) return;
        // Restore first; only then subscribe. Initial layout/scroll events must never overwrite the saved position.
        scroll.scrollTop = ReaderCore.restore(saved,scroll.scrollHeight,scroll.clientHeight);
        this.active.ready = true;
        this.active.listener = () => { if (!this.active?.ready) return; this.progress(this.ratio()); clearTimeout(this.scrollTimer); this.scrollTimer = setTimeout(() => this.savePosition(),150); };
        scroll.addEventListener('scroll',this.active.listener,{ passive:true });
    },
    ratio() { const s = this.active?.scroll; return s ? ReaderCore.proportion(s.scrollTop,s.scrollHeight,s.clientHeight) : 0; },
    progress(ratio) { const fill = document.getElementById('reading-progress-fill'); if (fill) fill.style.width = `${ratio * 100}%`; },
    savePosition() {
        if (!this.active?.ready) return;
        return AsyncStorage.set(this.active.key,this.ratio()).then(ok => {
            if (!ok) { const status = document.getElementById('reader-status'); if (status) status.textContent = t('pray.error'); }
            return ok;
        });
    },
    leave() {
        ++this.token; clearTimeout(this.scrollTimer);
        if (this.active) { this.savePosition(); if (this.active.listener) this.active.scroll.removeEventListener('scroll',this.active.listener); this.active = null; }
    },
    async preference(changes) {
        if (!this.active || this.prefSaving) return;
        this.prefSaving = true;
        const status = document.getElementById('reader-status');
        status.textContent = t('pray.saving');
        try {
            await SettingsSystem.setReader(changes);
            status.textContent = t('pray.saved');
        } catch (error) {
            console.error('[Ora Reader]', error);
            status.textContent = t('pray.error');
        } finally { this.prefSaving = false; }
    },
    applyPreferences(next) {
        this.state = next;
        const active = this.active;
        if (!active) return;
        const ratio = this.ratio();
        const ready = active.ready;
        active.ready = false;
        document.querySelector('.prayer-reader').dataset.appearance = next.appearance;
        document.querySelector('.reading-inner').style.setProperty('--read-size', (next.size / 16) + 'rem');
        document.getElementById('reader-size').textContent = next.size;
        for (const appearance of ['escuro', 'papel']) {
            document.getElementById('reader-' + appearance).setAttribute('aria-pressed', appearance === next.appearance);
        }
        if (ready) {
            const scroll = active.scroll;
            scroll.scrollTop = ReaderCore.restore(ratio, scroll.scrollHeight, scroll.clientHeight);
            active.ready = true;
            this.progress(ratio);
        }
    },
    renderGuide() {
        const u = PrayUI, step = this.lectio.step, names = ['Lectio','Meditatio','Oratio','Contemplatio'];
        const guide = document.getElementById('lectio-guide'); if (!guide) return;
        guide.innerHTML = `<div class="lectio-steps" aria-hidden="true">${names.map((_,n) => `<span class="${n <= step ? 'filled' : ''}"></span>`).join('')}</div><p class="label">${u.text('stage',{n:step + 1,total:4})}</p><h2>${names[step]}</h2><p class="reflect">${u.text('lectio_' + step)}</p>${[1,2].includes(step) ? `<label class="field"><span>${u.text('note')}</span><textarea class="textarea" id="lectio-note" maxlength="5000">${u.e(this.lectio.notes[step] || '')}</textarea></label>` : ''}<p id="lectio-status" role="status" class="meta"></p><div class="row">${u.button('lectio-prev','previous','btn-quiet',step === 0 ? 'disabled' : '')}${u.button('lectio-next',step === 3 ? 'finish' : 'next_stage','btn-primary')}</div>`;
        u.on('lectio-note','input', e => { this.lectio.notes[step] = e.target.value; return this.saveLectio(); });
        u.on('lectio-prev','click', async () => { if (await this.saveLectio(step - 1)) { this.renderGuide(); document.getElementById('lectio-guide').focus(); } });
        u.on('lectio-next','click', async () => { if (await this.saveLectio(step === 3 ? 0 : step + 1)) { if (step === 3) { if (window.PracticeLog) PracticeLog.record('lectio'); RouterSystem.navigate('rezar'); } else { this.renderGuide(); document.getElementById('lectio-guide').focus(); } } });
    },
    saveLectio(step = this.lectio.step) {
        const next = { ...this.lectio, step, notes: { ...this.lectio.notes } }, key = 'ora_lectio_' + this.lectioDate;
        this.noteQueue = (this.noteQueue || Promise.resolve()).then(async () => {
            const ok = await PrayUI.save(key,next,document.getElementById('lectio-status'));
            if (ok) this.lectio.step = step;
            return ok;
        });
        return this.noteQueue;
    }
};
window.ReaderSystem = ReaderSystem;
