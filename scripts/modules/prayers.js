const PrayerSystem = {
    prayers: [], favorites: [], state: { query: '', category: 'all', favoritesOnly: false },
    async init(prayers) {
        this.prayers = prayers;
        const saved = await AsyncStorage.get('ora_prayer_favorites', []);
        this.favorites = Array.isArray(saved) ? saved : [];
        this.bindEvents();
    },
    bindEvents() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.ora_prayer_favorites) return;
            this.favorites = changes.ora_prayer_favorites.newValue || [];
            const r = RouterSystem.current();
            if (r && r.view === 'rezar' && !r.path.length && window.RezarSystem) RezarSystem.renderHome();
            if (r && r.view === 'rezar' && r.path[0] === 'biblioteca') this.renderResults();
        });
        document.getElementById('btn-prayers')?.addEventListener('click', () => this.openList());
    },
    cacheDOM() { this.root = document.getElementById('view-rezar'); },
    openList(query) { if (typeof query === 'string') this.state.query = query; RouterSystem.navigate('rezar/biblioteca'); },
    openReader(prayer) { if (prayer) ReaderSystem.openPrayer(prayer); },
    async toggleFavorite(id) {
        if (this.savingFavorite) return false;
        this.savingFavorite = true;
        try {
            const stored = await AsyncStorage.get('ora_prayer_favorites', []);
            const list = Array.isArray(stored) ? stored : [];
            const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
            if (!await PrayUI.save('ora_prayer_favorites', next)) return false;
            this.favorites = next;
            return true;
        } finally { this.savingFavorite = false; }
    },
    render() {
        const u = PrayUI;
        u.mount(`<div class="pray-wrap library-wrap">${u.heading(u.text('library'))}
            <form id="library-search" role="search"><label class="sr-only" for="prayer-search-input">${u.text('search')}</label>
            <div class="library-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input class="input" id="prayer-search-input" type="search" autocomplete="off" placeholder="${u.text('search')}" aria-describedby="search-scope" value="${u.e(this.state.query)}"></div></form>
            <div class="results-head"><p id="prayer-result-count" role="status" aria-live="polite"></p>${u.button('prayer-filter-toggle', 'filters', 'btn-aux btn-sm', 'aria-expanded="false" aria-controls="prayer-filters"')}</div>
            <div id="prayer-filters" class="prayer-filters"><label class="field"><span>${u.text('categories.all')}</span><select class="input" id="prayer-category">${['all','basic','marian','day','thanks','saints'].map(c => `<option value="${c}" ${this.state.category === c ? 'selected' : ''}>${u.text('categories.' + c)}</option>`).join('')}</select></label>
            <label class="toggle"><input id="prayer-only-favorites" type="checkbox" ${this.state.favoritesOnly ? 'checked' : ''}><span class="track"></span><span>${u.text('favorites')}</span></label></div>
            <p class="meta" id="search-scope"></p><ul class="prayer-results" id="prayer-results"></ul></div>`);
        u.back();
        u.on('library-search', 'submit', e => e.preventDefault());
        u.on('prayer-search-input', 'input', e => { this.state.query = e.target.value; this.renderResults(); });
        u.on('prayer-category', 'change', e => { this.state.category = e.target.value; this.renderResults(); });
        u.on('prayer-only-favorites', 'change', e => { this.state.favoritesOnly = e.target.checked; this.renderResults(); });
        u.on('prayer-filter-toggle', 'click', e => { const open = e.currentTarget.getAttribute('aria-expanded') !== 'true'; e.currentTarget.setAttribute('aria-expanded', open); document.getElementById('prayer-filters').classList.toggle('expanded', open); });
        this.renderResults();
    },
    renderResults() {
        const list = document.getElementById('prayer-results'); if (!list) return;
        const focusedFavorite = document.activeElement?.dataset.favorite;
        const u = PrayUI, found = SearchCore.search(this.prayers, { ...this.state, favorites: this.favorites });
        document.getElementById('prayer-result-count').textContent = t('pray.results', { n: found.length });
        document.getElementById('search-scope').textContent = t('pray.scope', { scope: t(this.state.favoritesOnly ? 'pray.favorites' : 'pray.all'), category: t('pray.categories.' + this.state.category) });
        list.innerHTML = found.map(p => `<li class="prayer-row"><button class="prayer-open" type="button" data-prayer="${u.e(p.id)}"><i class="ph ${u.e(p.icon)}" aria-hidden="true"></i><span><b>${u.e(u.title(p))}</b><small>${u.text('categories.' + p.category)}</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button><button class="prayer-star" type="button" data-favorite="${u.e(p.id)}" aria-pressed="${this.favorites.includes(p.id)}" aria-label="${u.text(this.favorites.includes(p.id) ? 'unfavorite' : 'favorite', { title: u.title(p) })}">★</button></li>`).join('') || `<li class="prayer-empty"><p>${u.text('empty')}</p>${u.button('prayer-reset', 'reset', 'btn-aux')}</li>`;
        list.querySelectorAll('[data-prayer]').forEach(btn => btn.addEventListener('click', () => this.openReader(this.prayers.find(p => p.id === btn.dataset.prayer))));
        list.querySelectorAll('[data-favorite]').forEach(btn => btn.addEventListener('click', async () => {
            const id = btn.dataset.favorite;
            if (await this.toggleFavorite(id)) {
                this.renderResults();
                const next = list.querySelector(`[data-favorite="${CSS.escape(id)}"]`);
                (next || document.getElementById('prayer-only-favorites')).focus();
            }
        }));
        if (document.activeElement?.id === 'prayer-search-input' && matchMedia('(max-width: 54rem)').matches) requestAnimationFrame(() => list.firstElementChild?.scrollIntoView({block:'nearest'}));
        if (focusedFavorite) list.querySelector(`[data-favorite="${CSS.escape(focusedFavorite)}"]`)?.focus({preventScroll:true});
        u.on('prayer-reset', 'click', () => { this.state = { query: '', category: 'all', favoritesOnly: false }; this.render(); document.getElementById('prayer-search-input').focus(); });
    }
};
window.PrayerSystem = PrayerSystem;
