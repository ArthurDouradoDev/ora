// ============================================================
// SEUS ATALHOS — sites que a pessoa abre a partir de Hoje
// ============================================================
// Lê os atalhos migrados da 1.1.5 (ora_quick_links). Sem atalhos gravados,
// começa com Google, ChatGPT e Liturgia das Horas. Gerenciar abre um
// diálogo (DialogSystem): remover, adicionar (até 6).

const LinksSystem = {
    STORAGE_KEY: 'ora_quick_links',
    MAX_LINKS: 6,
    MAX_NAME_LENGTH: 20,
    DEFAULT_LINKS: [
        { name: 'Google', url: 'https://google.com' },
        { name: 'ChatGPT', url: 'https://chatgpt.com' },
        { name: 'Liturgia das Horas', url: 'https://www.paulus.com.br/portal/liturgia-diaria-das-horas/' }
    ],

    links: [],
    elements: {},

    init: async function() {
        this.cacheDOM();
        this.bindEvents();
        await this.load();
        this.render();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[this.STORAGE_KEY]) {
                const next = this.normalize(changes[this.STORAGE_KEY].newValue) || [];
                if (JSON.stringify(next) === JSON.stringify(this.links)) return; // a própria gravação
                this.links = next;
                this.render();
                if (DialogSystem.isOpen(this.elements.dialog)) this.renderManage();
            }
        });
    },

    cacheDOM: function() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            list: $('shortcuts-list'),
            dialog: $('shortcuts-dialog'),
            manage: $('shortcuts-manage'),
            form: $('shortcuts-form'),
            name: $('shortcut-name'),
            url: $('shortcut-url'),
            add: $('shortcut-add'),
            note: $('shortcuts-note')
        };
    },

    bindEvents: function() {
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.add();
        });
        this.elements.manage.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove]');
            if (btn) this.remove(Number(btn.dataset.remove));
        });
    },

    normalize: function(raw) {
        let value = raw;
        if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch (e) { return null; }
        }
        if (!Array.isArray(value)) return null;
        return value
            .filter(l => l && typeof l.name === 'string' && this.isValidURL(l.url))
            .map(l => ({ name: l.name.slice(0, this.MAX_NAME_LENGTH), url: l.url }))
            .slice(0, this.MAX_LINKS);
    },

    load: async function() {
        const stored = this.normalize(await AsyncStorage.get(this.STORAGE_KEY, null));
        if (stored) {
            this.links = stored;
        } else {
            this.links = this.DEFAULT_LINKS.slice();
            await AsyncStorage.set(this.STORAGE_KEY, this.links);
        }
    },

    isValidURL: function(value) {
        try {
            return ['http:', 'https:'].includes(new URL(value).protocol);
        } catch (e) {
            return false;
        }
    },

    favicon: function(url) {
        try {
            const icon = new URL(chrome.runtime.getURL('/_favicon/'));
            icon.searchParams.set('pageUrl', url);
            icon.searchParams.set('size', '32');
            return icon.href;
        } catch (e) {
            return null;
        }
    },

    initials: function(name) {
        const words = name.trim().split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w));
        const letters = (words.length > 1 ? words.slice(0, 2).map(w => w[0]) : [name.trim()[0] || '?']).join('');
        return letters.toUpperCase();
    },

    // Ícone do site; sem rede, as iniciais
    makeFav: function(link) {
        const fav = document.createElement('span');
        fav.className = 'fav';
        fav.setAttribute('aria-hidden', 'true');
        fav.textContent = this.initials(link.name);
        const src = this.favicon(link.url);
        if (src) {
            const img = new Image();
            img.alt = '';
            img.onload = () => fav.replaceChildren(img);
            img.src = src;
        }
        return fav;
    },

    render: function() {
        const fragment = document.createDocumentFragment();
        this.links.forEach(link => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.className = 'sc surface-glass';
            a.href = link.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.append(this.makeFav(link), document.createTextNode(link.name));
            li.appendChild(a);
            fragment.appendChild(li);
        });

        const li = document.createElement('li');
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'sc sc-add surface-glass';
        add.innerHTML = '<span class="fav" aria-hidden="true"><i class="ph ph-plus"></i></span>';
        add.append(document.createTextNode(t(this.links.length ? 'shortcuts.manage' : 'shortcuts.add')));
        add.addEventListener('click', () => this.openDialog(add));
        li.appendChild(add);
        fragment.appendChild(li);

        this.elements.list.replaceChildren(fragment);
    },

    openDialog: function(opener) {
        this.renderManage();
        this.elements.note.textContent = t('shortcuts.limit', { max: this.MAX_LINKS });
        // O botão é recriado a cada mudança: ao fechar, o foco volta ao "Adicionar" atual
        DialogSystem.open(this.elements.dialog, {
            opener,
            onClose: () => {
                const add = this.elements.list.querySelector('.sc-add');
                if (add && !document.contains(opener)) add.focus({ preventScroll: true });
            }
        });
        if (this.links.length < this.MAX_LINKS) this.elements.name.focus();
    },

    renderManage: function() {
        const fragment = document.createDocumentFragment();
        this.links.forEach((link, index) => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = link.name;
            name.title = link.url;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn-icon sm';
            remove.dataset.remove = String(index);
            remove.setAttribute('aria-label', t('shortcuts.remove', { name: link.name }));
            remove.innerHTML = '<i class="ph ph-trash" aria-hidden="true"></i>';
            li.append(this.makeFav(link), name, remove);
            fragment.appendChild(li);
        });
        this.elements.manage.replaceChildren(fragment);
        const full = this.links.length >= this.MAX_LINKS;
        this.elements.name.disabled = full;
        this.elements.url.disabled = full;
        this.elements.add.disabled = full;
    },

    save: async function(next) {
        const ok = await AsyncStorage.set(this.STORAGE_KEY, next);
        if (!ok) {
            this.elements.note.textContent = t('shortcuts.save_failed');
            return false;
        }
        this.links = next;
        this.render();
        this.renderManage();
        return true;
    },

    add: async function() {
        const name = this.elements.name.value.trim();
        let url = this.elements.url.value.trim();
        const note = this.elements.note;

        if (!name || !url) {
            note.textContent = t('toast.link_fill_fields');
            (name ? this.elements.url : this.elements.name).focus();
            return;
        }
        if (this.links.length >= this.MAX_LINKS) {
            note.textContent = t('toast.link_limit_reached');
            return;
        }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (!this.isValidURL(url)) {
            note.textContent = t('toast.link_invalid_url');
            this.elements.url.focus();
            return;
        }

        const ok = await this.save(this.links.concat([{ name: name.slice(0, this.MAX_NAME_LENGTH), url }]));
        if (!ok) return;
        this.elements.name.value = '';
        this.elements.url.value = '';
        note.textContent = t('toast.link_added');
        if (!this.elements.name.disabled) this.elements.name.focus();
    },

    remove: async function(index) {
        const link = this.links[index];
        if (!link) return;
        const ok = await this.save(this.links.filter((_, i) => i !== index));
        if (!ok) return;
        this.elements.note.textContent = t('shortcuts.removed', { name: link.name });
        // Foco não se perde quando o botão removido some
        const buttons = this.elements.manage.querySelectorAll('[data-remove]');
        (buttons[Math.min(index, buttons.length - 1)] || this.elements.name).focus();
    }
};

window.LinksSystem = LinksSystem;
