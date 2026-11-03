/* Shared rendering helpers for the Rezar screens. Data is always escaped. */
const PrayUI = {
    root: null,
    e(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    text(key, params) { return this.e(t('pray.' + key, params)); },
    title(p) { return p ? ((p.titles || {})[window._i18nLocale] || p.title || '') : ''; },
    button(id, key, cls = 'btn-quiet', extra = '') { return `<button type="button" class="btn ${cls}" id="${id}" ${extra}>${this.text(key)}</button>`; },
    link(url, label, cls = '') { return `<a class="text-link ext ${cls}" href="${this.e(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`; },
    on(id, event, callback) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, async e => { try { await callback(e); } catch (err) { console.error('[Rezar]', err); this.error(); } });
    },
    routeButtons() {
        this.root.querySelectorAll('[data-pray-route]').forEach(el => el.addEventListener('click', () => el.dataset.prayRoute === 'rezar/respiro' ? RespiroSystem.open() : RouterSystem.navigate(el.dataset.prayRoute)));
    },
    mount(html, mode = '') {
        this.root = document.getElementById('view-rezar');
        this.root.innerHTML = html;
        this.root.dataset.mode = mode;
        document.documentElement.dataset.prayerMode = mode;
        this.root.scrollTop = 0;
        this.routeButtons();
    },
    heading(title, back = 'rezar') {
        return `<div class="pray-heading">${this.button('pray-back', 'back')}<h1 tabindex="-1" data-route-focus>${title}</h1></div>`;
    },
    back(target = 'rezar') { this.on('pray-back', 'click', () => RouterSystem.navigate(target)); },
    error() { showToast(t('pray.error'), 'error'); },
    async save(key, value, status) {
        if (status) status.textContent = t('pray.saving');
        const ok = await AsyncStorage.set(key, value);
        if (status) status.textContent = t(ok ? 'pray.saved' : 'pray.error');
        if (!ok && !status) this.error();
        return ok;
    },
    confirm(title, body, action) {
        const root = document.getElementById('pray-confirm');
        document.getElementById('pray-confirm-title').textContent = t('pray.' + title);
        document.getElementById('pray-confirm-body').textContent = t('pray.' + body);
        const button = document.getElementById('pray-confirm-yes');
        button.textContent = t('pray.finish');
        button.onclick = async () => {
            button.disabled = true;
            try { const ok = await action(); if (ok !== false) { DialogSystem.close(root); if (document.activeElement === document.body) document.querySelector('#view-rezar [data-route-focus]')?.focus({preventScroll:true}); } }
            catch (err) { console.error(err); this.error(); }
            finally { button.disabled = false; }
        };
        DialogSystem.open(root);
    }
};
window.PrayUI = PrayUI;
