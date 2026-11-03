const RezarSystem = {
    cache: null, saints: {}, artIndex: [], renderId: 0,
    async init(data) {
        this.saints = data.saints || {};
        this.books = data.bibleBooks || [];
        this.cache = await AsyncStorage.get('liturgy_gospel_cache');
        this.cacheDOM(); this.bindEvents();
        await this.show(RouterSystem.current());
        // The image index is optional until the curated collection is published (phase 10).
        const indexURL = await AsyncStorage.get('ora_acervo_url', '');
        if (/^https:\/\/cdn\.jsdelivr\.net\//.test(indexURL)) {
            try { const response = await fetch(indexURL, { signal: AbortSignal.timeout(8000) }); if (response.ok) this.artIndex = await response.json(); }
            catch (_) { /* same layout without artwork */ }
        }
        const initial = RouterSystem.current();
        if ((this.artIndex.length || this.artIndex.entries?.length) && initial.view === 'rezar' && !initial.path.length) this.renderHome();
        if (window.TodaySystem) { TodaySystem.renderGospel(); TodaySystem.renderDay(); }
        chrome.runtime.sendMessage({ type: 'liturgy:refresh' }).catch(() => {});
    },
    cacheDOM() { this.root = document.getElementById('view-rezar'); },
    bindEvents() {
        window.addEventListener('ora:route', e => this.show(e.detail));
        window.addEventListener('ora:locale-changed', () => this.show(RouterSystem.current()));
        window.addEventListener('ora:settings-changed', e => { if (['ora_prayer_lang','prayerLang'].includes(e.detail.key)) this.show(RouterSystem.current()); });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.liturgy_gospel_cache) {
                this.cache = changes.liturgy_gospel_cache.newValue;
                const r = RouterSystem.current();
                if (r.view === 'rezar' && !r.path.length) this.renderHome();
            }
        });
        // Refresh across midnight without requiring a new tab.
        this.day = LiturgyCore.dateKey();
        setInterval(() => { const day = LiturgyCore.dateKey(); if (day !== this.day) { this.day = day; this.show(RouterSystem.current()); chrome.runtime.sendMessage({ type: 'liturgy:refresh' }).catch(() => {}); } }, 60000);
    },
    async show(route) {
        if (window.ReaderSystem) ReaderSystem.leave();
        document.documentElement.dataset.prayerMode = '';
        const token = ++this.renderId;
        if (!route || route.view !== 'rezar') return;
        try {
            switch (route.path[0]) {
                case 'biblioteca': PrayerSystem.render(); break;
                case 'leitor': await ReaderSystem.render(route.path[1]); break;
                case 'evangelho': await ReaderSystem.renderGospel(false); break;
                case 'lectio': await ReaderSystem.renderGospel(true); break;
                case 'terco': RosarySystem.render(route.path[1] === 'oracao'); break;
                case 'respiro': RespiroSystem.render(); break;
                case 'exame': await ExamSystem.render(route.path.slice(1),token); break;
                case 'biblia': await this.renderBible(token); break;
                default: this.renderHome();
            }
            if (token !== this.renderId) return;
            const target = this.root.querySelector('[data-route-focus]');
            if (target) target.focus({ preventScroll: true });
        } catch (err) { console.error('[Rezar]', err); PrayUI.error(); }
    },
    gospel(locale = window._i18nLocale || 'pt') {
        const date = LiturgyCore.dateKey();
        if (locale !== 'es') return LiturgyCore.read(this.cache, date, locale);
        const en = LiturgyCore.read(this.cache, date, 'en');
        const saints = SaintsCore.forDate(this.saints, new Date());
        if (!en) return null;
        let ref = en.ref;
        for (const [from, to] of [['Matthew','Mateo'],['Mark','Marcos'],['Luke','Lucas'],['John','Juan']]) ref = ref.replace(from, to);
        const seasons = { 'Ordinary Time': 'Tiempo Ordinario', 'Advent': 'Adviento', 'Lent': 'Cuaresma', 'Easter': 'Pascua', 'Christmas': 'Navidad' };
        return { ...en, ref, liturgia: saints[0] ? l(saints[0].name) : (seasons[en.liturgia] || '') };
    },
    artwork(gospel) { return gospel ? LiturgyCore.artwork(this.artIndex, gospel.ref) : null; },
    figure(gospel) {
        const art = this.artwork(gospel); if (!art) return '';
        return `<figure class="gospel-art"><img src="${PrayUI.e(art.url)}" alt="${PrayUI.e(l(art.alt || art.caption))}" loading="lazy"><figcaption>${PrayUI.link(art.source, PrayUI.e(l(art.caption)))}</figcaption></figure>`;
    },
    renderHome() {
        const u = PrayUI, g = this.gospel(), date = new Date(), locale = window._i18nLocale || 'pt';
        const favorites = PrayerSystem.prayers.filter(p => PrayerSystem.favorites.includes(p.id));
        const personal = favorites.length ? favorites : PrayerSystem.prayers.filter(p => p.essential);
        const saintList = SaintsCore.forDate(this.saints, date);
        const source = LiturgyCore.source(locale, LiturgyCore.dateKey());
        const practice = (route, icon, title, hint) => `<button class="practice-link" data-pray-route="rezar/${route}"><i class="ph ${icon}" aria-hidden="true"></i><span><b>${u.text(title)}</b><small>${hint}</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button>`;
        u.mount(`<div class="pray-wrap pray-home"><header class="pray-home-heading"><div><p class="label">${u.text('kicker')}</p><h1 tabindex="-1" data-route-focus>${u.text('title')}</h1><p class="meta">${u.text('intro')}</p></div><form id="pray-home-search" role="search"><label class="sr-only" for="pray-search">${u.text('search')}</label><input class="input" id="pray-search" type="search" placeholder="${u.text('search')}"><button class="btn btn-quiet" aria-label="${u.text('search')}"><i class="ph ph-magnifying-glass" aria-hidden="true"></i></button></form></header>
            <section class="pray-personal" aria-labelledby="pray-personal-title"><div class="section-head"><h2 id="pray-personal-title">${u.text(favorites.length ? 'yours' : 'essentials')}</h2><button class="text-link" data-pray-route="rezar/biblioteca">${u.text('choose')}</button></div><div class="personal-prayers">${personal.map(p => `<button class="personal-prayer" data-prayer="${u.e(p.id)}"><i class="ph ${u.e(p.icon)}" aria-hidden="true"></i>${u.e(u.title(p))}<i class="ph ph-arrow-right" aria-hidden="true"></i></button>`).join('')}</div></section>
            <section class="pray-gospel" aria-labelledby="pray-gospel-title"><div class="section-head"><p class="label">${u.text('gospel')}</p><time class="meta">${u.e(new Intl.DateTimeFormat(locale, { day:'numeric', month:'long' }).format(date))}</time></div><div class="gospel-story">${this.figure(g)}<div><h2 id="pray-gospel-title">${u.e(g?.ref || t('pray.no_reference'))}</h2><p class="meta">${u.e(g?.liturgia || '')}</p>${!g ? `<p class="meta">${u.text('unavailable')}</p>` : ''}<div class="row"><button class="btn btn-primary" data-pray-route="rezar/evangelho">${u.text('read')}</button><button class="btn btn-quiet" data-pray-route="rezar/lectio">${u.text('lectio')}</button></div>${u.link(source.external, u.text('liturgy'))}</div></div></section>
            <section class="pray-practices" aria-labelledby="pray-practices-title"><h2 id="pray-practices-title">${u.text('practices')}</h2><div class="practice-grid">${practice('terco','ph-circles-four','rosary',u.text(RosaryCore.mysteryForDay(date)))}${practice('respiro','ph-wind','breath',u.text('breath_hint'))}${practice('exame','ph-heart','exam',u.text('exam_hint'))}${practice('biblia','ph-book-bookmark','bible',u.text('book') + ' · ' + u.text('chapter'))}</div></section>
            <section class="pray-saints" aria-labelledby="pray-saints-title"><p class="label" id="pray-saints-title">${u.text('saints')}</p>${saintList.map(s => `<article>${s.image && /^https:\/\//.test(s.image) ? `<img class="pray-saint-portrait" src="${u.e(s.image)}" alt="${u.e(l(s.name))}" loading="lazy">` : ''}<h3>${u.e(l(s.name))}</h3><p class="meta">${u.e(l(s.identity))}</p>${s.quote ? `<blockquote>${u.e(l(s.quote.text))}</blockquote>${u.link(s.quote.source,u.text('source'))}` : ''}</article>`).join('')}${u.link(t('pray.saints_url'),u.text('saints_more'))}</section>
            <div id="rezar-season" class="pray-season" hidden></div><footer class="pray-footer"><button class="text-link" data-pray-route="rezar/biblioteca">${u.text('explore')} →</button></footer></div>`);
        u.on('pray-home-search', 'submit', e => { e.preventDefault(); PrayerSystem.openList(document.getElementById('pray-search').value); });
        this.root.querySelectorAll('[data-prayer]').forEach(btn => btn.addEventListener('click', () => PrayerSystem.openReader(PrayerSystem.prayers.find(p => p.id === btn.dataset.prayer))));
        this.updateBibleHint();
        this.root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => (img.closest('figure') || img).remove(), { once: true }));
    },
    async updateBibleHint() {
        const bible = await AsyncStorage.get('ora_bible_last');
        const hint = this.root.querySelector('[data-pray-route="rezar/biblia"] small');
        if (bible && hint) hint.textContent = t('pray.continue_bible', { chapter: `${l(this.books.find(b => b.id === bible.bookId)?.name) || bible.book} ${bible.chapter}` });
    },
    async renderBible(token = this.renderId) {
        const last = await AsyncStorage.get('ora_bible_last', {bookId:'gn',chapter:1}), u = PrayUI;
        if (token !== this.renderId) return;
        const selected = this.books.find(b => b.id === last.bookId) || this.books[0];
        u.mount(`<div class="pray-wrap pray-narrow">${u.heading(u.text('bible'))}<form class="stack" id="bible-form"><label class="field"><span>${u.text('book')}</span><select class="input" id="bible-book">${this.books.map(book => `<option value="${u.e(book.id)}" ${selected.id === book.id ? 'selected' : ''}>${u.e(l(book.name))}</option>`).join('')}</select></label><label class="field"><span>${u.text('chapter')}</span><input class="input" id="bible-chapter" type="number" min="1" max="${selected.chaptersByLocale?.[window._i18nLocale] || selected.chapters}" value="${u.e(Math.min(selected.chapters,Number(last.chapter) || 1))}" required></label><button class="btn btn-primary" type="submit">${u.text('open_bible')} ↗</button><p role="status" id="bible-status"></p></form></div>`);
        u.back();
        u.on('bible-book','change',e => {
            const book = this.books.find(b => b.id === e.target.value), chapter = document.getElementById('bible-chapter');
            chapter.max = book.chaptersByLocale?.[window._i18nLocale] || book.chapters; chapter.value = Math.min(Number(chapter.value) || 1,Number(chapter.max));
        });
        u.on('bible-form','submit',async e => {
            e.preventDefault();
            const book = this.books.find(b => b.id === document.getElementById('bible-book').value), chapter = Number(document.getElementById('bible-chapter').value);
            const url = BibleCore.chapterURL(book,chapter,window._i18nLocale || 'pt');
            if (!url) return;
            if (await u.save('ora_bible_last',{bookId:book.id,book:l(book.name),chapter},document.getElementById('bible-status'))) await chrome.tabs.create({url});
        });
    }
};
window.RezarSystem = RezarSystem;
