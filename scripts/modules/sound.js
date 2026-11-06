// ============================================================
// SOM — biblioteca (ambientes do Ora + playlists próprias) e mini controle
// ============================================================
// O popup troca de vista sem fechar: biblioteca em grade → ajustar ambiente
// (camadas e volumes), detalhes da playlist ou adicionar música.
// Em Hoje, escolher na biblioteca toca na hora. Na preparação do foco
// (options.onChoose), a escolha é um rascunho confirmado em "Usar no foco".
// Os sons do Ora tocam pelo SoundEngine (Web Audio); YouTube e Spotify pelo relay.

const SoundSystem = {
    PREF: 'ora_focus_sound',
    PLAYLISTS: 'ora_user_playlists',
    DELETED: 'ora_deleted_default_playlists',
    RELAY: 'https://arthurdouradodev.github.io',
    ICONS: {
        rain: 'ph-cloud-rain', church: 'ph-church', bells: 'ph-bell', monastery: 'ph-hands-praying',
        fire: 'ph-flame', gloria: 'ph-music-notes', chapel_rain: 'ph-church', monastery_night: 'ph-moon-stars',
        vigil: 'ph-flame', lauds: 'ph-sun-horizon', custom: 'ph-sliders-horizontal', silence: 'ph-speaker-slash',
        youtube: 'ph-youtube-logo', spotify: 'ph-spotify-logo', add: 'ph-plus'
    },
    active: null,
    focus: null,
    editor: null,

    async init(defaults) {
        this.defaults = defaults || [];
        const keys = [this.PREF, this.PLAYLISTS, this.DELETED];
        this.setLibrary(await chrome.storage.local.get(keys));
        const $ = id => document.getElementById(id);
        this.root = $('sound-dialog');
        this.panel = this.root.querySelector('.sound-dialog');
        this.views = {
            library: $('sound-view-library'), mixer: $('sound-view-mixer'),
            playlist: $('sound-view-playlist'), add: $('sound-view-add')
        };
        this.title = $('sound-title');
        this.back = $('sound-back');
        this.addOpen = $('sound-add-open');
        this.reset = $('sound-reset');
        this.filters = $('sound-filters');
        this.grid = $('sound-grid');
        this.now = $('sound-now');
        this.layers = $('sound-layers');
        this.input = $('playlist-input');
        this.status = $('sound-status');
        this.footer = $('sound-footer');
        this.action = $('sound-apply');
        this.pauseSetting = $('sound-pause-with-focus');
        this.mini = $('sound-mini');
        this.toggle = $('sound-toggle');
        this.volume = $('sound-volume');
        this.controls = $('sound-controls');
        this.playerToggle = $('sound-player-toggle');
        this.remote = $('sound-remote');
        this.frame = $('sound-frame');
        this.external = $('sound-external');

        this.bind();
        this.bindMediaSession();
        SoundEngine.setVolume(this.preference.volume);
        this.render();
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !keys.some(key => changes[key])) return;
            for (const key of keys) {
                if (changes[key]) this.library[key] = changes[key].newValue;
            }
            const previousVolume = this.preference.volume;
            this.setLibrary(this.library);
            if (previousVolume !== this.preference.volume) this.applyVolume();
            if (this.editor) {
                this.editor.draft = SoundCore.choice(this.editor.draft, this.playlists);
                if (this.editor.view === 'playlist' && !this.playlist({ id: this.editor.target })) this.setView('library');
                else this.renderEditor();
            }
            if (this.active?.choice.kind === 'playlist' && !this.playlist(this.active.choice)) this.stop();
            this.render();
        });
    },

    setLibrary(values) {
        const array = value => {
            try { if (typeof value === 'string') value = JSON.parse(value); } catch { return []; }
            return Array.isArray(value) ? value : [];
        };
        this.library = values;
        const removed = array(values[this.DELETED]);
        const entries = [...this.defaults.filter(item => !removed.includes(item.id)), ...array(values[this.PLAYLISTS])];
        this.playlists = entries.filter(item => item?.id && SoundCore.media(item.source, item.idType, item.externalId));
        this.preference = SoundCore.preference(values[this.PREF], this.playlists);
    },

    bind() {
        const choose = document.getElementById('sound-open');
        choose.addEventListener('click', () => this.open(choose));
        this.toggle.addEventListener('click', () => this.togglePlayback());
        document.getElementById('sound-stop').addEventListener('click', () => {
            this.stop();
            choose.focus();
        });
        this.volume.addEventListener('input', () => {
            this.preference.volume = this.volume.valueAsNumber;
            this.applyVolume();
        });
        this.volume.addEventListener('change', () => this.savePreference(this.preference));
        this.playerToggle.addEventListener('click', () => this.setPlayerHidden(!this.preference.playerHidden));
        document.getElementById('sound-player-hide').addEventListener('click', () => {
            this.setPlayerHidden(true);
            this.playerToggle.focus();
        });

        this.back.addEventListener('click', () => this.setView('library'));
        this.addOpen.addEventListener('click', () => this.setView('add'));
        this.reset.addEventListener('click', () => {
            const scene = SoundCore.sceneOf(this.editor.draft);
            if (scene) this.choose(SoundCore.sceneChoice(scene));
            this.setStatus(t('sound.reset_done'));
        });
        this.now.addEventListener('click', () => {
            if (this.active) this.openDetail(this.active.choice);
        });
        this.pauseSetting.addEventListener('change', () => {
            this.savePreference({ ...this.preference, pauseWithFocus: this.pauseSetting.checked });
        });
        document.getElementById('sound-add-form').addEventListener('submit', event => {
            event.preventDefault();
            this.addPlaylist();
        });
        document.getElementById('sound-playlist-use').addEventListener('click', () => {
            this.choose({ kind: 'playlist', id: this.editor.target });
        });
        document.getElementById('sound-playlist-remove').addEventListener('click', event => {
            const item = this.playlist({ id: this.editor.target });
            if (item) this.removePlaylist(item, event.currentTarget);
        });
        this.action.addEventListener('click', () => this.applyEditor());

        window.addEventListener('ora:pomodoro', event => this.onFocus(event.detail));
        window.addEventListener('ora:locale-changed', () => {
            this.render();
            if (this.editor) this.renderEditor();
        });
        window.addEventListener('message', event => this.onPlayerMessage(event));
        window.addEventListener('resize', () => { if (this.editor) this.position(); });
        new IntersectionObserver(([entry]) => {
            this.frameVisible = entry.intersectionRatio >= 0.5;
            this.startVisiblePlayer();
        }, { threshold: [0, 0.5] }).observe(this.frame);
        window.addEventListener('offline', () => { this.render(); if (this.editor) this.renderEditor(); });
        window.addEventListener('online', () => { this.render(); if (this.editor) this.renderEditor(); });
    },

    bindMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const handlers = {
            play: () => this.active?.choice.kind === 'ambient' && this.resume(),
            pause: () => this.active?.choice.kind === 'ambient' && this.pause('manual'),
            stop: () => this.active?.choice.kind === 'ambient' && this.stop()
        };
        for (const [action, handler] of Object.entries(handlers)) {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* ação não suportada */ }
        }
    },

    updateMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const player = this.active;
        if (player?.choice.kind !== 'ambient') {
            if (!player) navigator.mediaSession.metadata = null;
            return;
        }
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: this.name(player.choice),
                artist: 'Ora',
                artwork: [{ src: chrome.runtime.getURL('assets/icon.png'), sizes: '128x128', type: 'image/png' }]
            });
        } catch { /* MediaMetadata indisponível */ }
    },

    // --- Catálogo ---

    playlist(choice) {
        return this.playlists.find(item => item.id === choice?.id);
    },

    name(choice) {
        if (choice?.kind === 'ambient') {
            const scene = SoundCore.sceneOf(choice);
            if (scene) return this.sceneName(scene);
            return choice.layers.map(layer => t('sound.' + layer.id)).join(' + ');
        }
        const playlist = this.playlist(choice);
        return playlist ? this.playlistName(playlist) : t('sound.silence');
    },

    sceneName(id) {
        return Object.hasOwn(SoundCore.AMBIENCES, id) ? t('sound.' + id) : t('sound.scene_' + id);
    },

    playlistName(playlist) {
        return playlist.title || t('sound.media_' + playlist.idType, { provider: this.provider(playlist) });
    },

    // Playlists padrão trazem um ícone próprio; as da pessoa usam o do serviço.
    playlistIcon(playlist) {
        return /^ph-[a-z-]+$/.test(playlist.icon || '') ? playlist.icon : this.ICONS[playlist.source];
    },

    provider(playlist) {
        return playlist.source === 'spotify' ? 'Spotify' : 'YouTube';
    },

    getChoice() {
        return this.active?.choice || this.preference.choice;
    },

    // Itens da grade: { key, kind, title, icon, tone, choice?, playlist? }
    items() {
        const draft = this.editor.draft;
        const list = [{ key: 'silence', kind: 'silence', title: t('sound.silence'), icon: this.ICONS.silence, tone: 'silence', choice: { kind: 'silence' } }];
        if (draft.kind === 'ambient' && !SoundCore.sceneOf(draft)) {
            list.push({ key: 'custom', kind: 'ambient', title: t('sound.custom'), subtitle: this.name(draft), icon: this.ICONS.custom, tone: 'custom', choice: draft });
        }
        for (const scene of SoundCore.SCENES) {
            list.push({ key: 'scene-' + scene.id, kind: 'ambient', title: this.sceneName(scene.id), icon: this.ICONS[scene.id],
                tone: scene.id, choice: SoundCore.sceneChoice(scene.id) });
        }
        for (const playlist of this.playlists) {
            list.push({ key: 'pl-' + playlist.id, kind: 'playlist', source: playlist.source, title: this.playlistName(playlist),
                subtitle: playlist.title ? this.provider(playlist) : null, icon: this.playlistIcon(playlist), tone: playlist.source,
                choice: { kind: 'playlist', id: playlist.id }, playlist });
        }
        return list;
    },

    matches(item, choice) {
        if (!choice) return false;
        if (item.kind === 'silence') return choice.kind === 'silence';
        if (item.kind === 'playlist') return choice.kind === 'playlist' && choice.id === item.playlist.id;
        if (choice.kind !== 'ambient') return false;
        return item.key === 'custom' ? !SoundCore.sceneOf(choice) : SoundCore.sceneOf(choice) === item.key.slice(6);
    },

    isPlaying(item) {
        return !!this.active && !this.active.paused && this.matches(item, this.active.choice);
    },

    // --- Popup ---

    open(opener, options = {}) {
        if (this.editor) return;
        const draft = SoundCore.choice(options.choice ?? this.getChoice(), this.playlists);
        this.editor = { draft, onChoose: options.onChoose, opener, view: 'library', filter: 'all', target: null };
        this.pauseSetting.checked = this.preference.pauseWithFocus;
        this.input.value = '';
        this.setView('library', { focus: false });
        DialogSystem.open(this.root, { opener, onClose: () => { this.editor = null; } });
        this.position();
        // Só depois de visível: com o popup oculto, scrollTop não tem efeito.
        this.views.library.scrollTop = 0;
        const selected = this.grid.querySelector('.sound-tile-main[aria-pressed="true"]');
        this.focusTile(selected || this.grid.querySelector('.sound-tile-main'));
    },

    // Foca a capa e rola a vista só o necessário para mostrá-la.
    focusTile(tile) {
        if (!tile) return;
        tile.focus({ preventScroll: true });
        const view = this.views.library;
        const top = tile.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
        const bottom = top + tile.offsetHeight;
        if (bottom > view.scrollTop + view.clientHeight) view.scrollTop = bottom - view.clientHeight + 8;
    },

    setView(view, { focus = true, returnKey = null } = {}) {
        const editor = this.editor;
        const previous = editor.view;
        editor.view = view;
        for (const [name, el] of Object.entries(this.views)) el.hidden = name !== view;
        // Cada vista começa do topo (filtros e cabeçalho à vista).
        this.views[view].scrollTop = 0;
        this.setStatus('');
        this.renderEditor();
        this.position();
        if (!focus) return;
        if (view === 'library') {
            const key = returnKey || editor.returnKey;
            const tile = key && [...this.grid.querySelectorAll('[data-sound-focus]')].find(el => el.dataset.soundFocus === key);
            this.focusTile(tile || this.grid.querySelector('.sound-tile-main'));
        } else if (view === 'add') {
            this.input.focus();
        } else if (previous !== view) {
            this.back.focus({ preventScroll: true });
        }
    },

    // Abre o ajuste do ambiente ou os detalhes da playlist escolhida.
    openDetail(choice, returnKey = null) {
        this.editor.returnKey = returnKey;
        if (choice.kind === 'playlist') {
            this.editor.target = choice.id;
            this.setView('playlist');
        } else if (choice.kind === 'ambient') {
            this.setView('mixer');
        }
    },

    // Âncora o popup junto do botão que o abriu (como um menu); em telas
    // estreitas fica centralizado como os demais diálogos.
    position() {
        const opener = this.editor?.opener;
        const panel = this.panel;
        const anchored = !!opener?.isConnected && window.innerWidth >= 600;
        this.root.classList.toggle('is-anchored', anchored);
        if (!anchored) {
            panel.style.left = panel.style.top = panel.style.maxHeight = '';
            return;
        }
        const margin = 12, gap = 8;
        const rect = opener.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - gap - margin;
        const above = rect.top - gap - margin;
        panel.style.maxHeight = '';
        const height = panel.offsetHeight;
        const down = below >= height || below >= above;
        const room = down ? below : above;
        panel.style.maxHeight = room + 'px';
        const width = panel.offsetWidth;
        const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), window.innerWidth - width - margin);
        panel.style.left = left + 'px';
        panel.style.top = (down ? rect.bottom + gap : rect.top - gap - Math.min(height, room)) + 'px';
    },

    setStatus(text) {
        this.status.textContent = text;
    },

    renderEditor() {
        const editor = this.editor;
        if (!editor) return;
        const focusKey = document.activeElement?.dataset.soundFocus;
        const view = editor.view;
        const prep = !!editor.onChoose;
        const titles = { library: t('sound.title'), mixer: this.name(editor.draft), add: t('sound.add_music') };
        const target = this.playlist({ id: editor.target });
        this.title.textContent = view === 'playlist' ? (target ? this.playlistName(target) : t('sound.title')) : titles[view];
        this.back.hidden = view === 'library';
        this.addOpen.hidden = view !== 'library';
        this.reset.hidden = view !== 'mixer' || !SoundCore.sceneOf(editor.draft);
        this.footer.hidden = !prep;
        this.action.textContent = t('sound.choose');

        if (view === 'library') this.renderLibrary();
        else if (view === 'mixer') this.renderMixer();
        else if (view === 'playlist') this.renderPlaylist(target);

        if (focusKey) [...this.panel.querySelectorAll('[data-sound-focus]')]
            .find(el => el.dataset.soundFocus === focusKey)?.focus({ preventScroll: true });
    },

    renderLibrary() {
        const editor = this.editor;
        const items = this.items();
        const sources = new Set(this.playlists.map(item => item.source));
        const filters = [['all', t('sound.filter_all')], ['ambient', t('sound.ambient')],
            ...['youtube', 'spotify'].filter(source => sources.has(source)).map(source => [source, source === 'spotify' ? 'Spotify' : 'YouTube'])];
        if (!filters.some(([id]) => id === editor.filter)) editor.filter = 'all';
        this.filters.replaceChildren(...filters.map(([id, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sound-filter';
            button.textContent = label;
            button.dataset.soundFocus = 'filter-' + id;
            button.setAttribute('aria-pressed', String(editor.filter === id));
            button.addEventListener('click', () => {
                editor.filter = id;
                this.renderEditor();
                this.position();
            });
            return button;
        }));

        const visible = items.filter(item => editor.filter === 'all'
            || (editor.filter === 'ambient' ? item.kind !== 'playlist' : item.source === editor.filter));
        const tiles = visible.map(item => this.tile(item));
        if (editor.filter === 'all') tiles.push(this.addTile());
        this.grid.replaceChildren(...tiles);

        const playing = this.active;
        this.now.hidden = !playing;
        if (playing) {
            this.now.classList.toggle('is-paused', !!playing.paused);
            this.now.querySelector('.sound-now-name').textContent = this.name(playing.choice);
            this.now.setAttribute('aria-label', t('sound.now_playing', { name: this.name(playing.choice) }));
        }
    },

    cover(icon, tone, playing) {
        const cover = document.createElement('span');
        cover.className = 'sound-cover';
        cover.dataset.tone = tone;
        const glyph = document.createElement('i');
        glyph.className = 'ph ' + icon;
        glyph.setAttribute('aria-hidden', 'true');
        cover.append(glyph);
        if (playing) cover.append(this.equalizer());
        return cover;
    },

    equalizer() {
        const eq = document.createElement('span');
        eq.className = 'sound-eq';
        eq.setAttribute('aria-hidden', 'true');
        eq.append(...[0, 1, 2].map(() => document.createElement('span')));
        return eq;
    },

    tile(item) {
        const editor = this.editor;
        const selected = this.matches(item, editor.draft);
        const playing = this.isPlaying(item);
        const offline = item.kind === 'playlist' && !navigator.onLine;
        const li = document.createElement('li');
        li.className = 'sound-tile';
        li.classList.toggle('is-selected', selected);
        li.classList.toggle('is-offline', offline);

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'sound-tile-main';
        main.dataset.soundFocus = item.key;
        main.setAttribute('aria-pressed', String(selected));
        main.append(this.cover(item.icon, item.tone, playing));
        const title = document.createElement('span');
        title.className = 'sound-tile-title';
        title.textContent = item.title;
        main.append(title);
        if (item.subtitle) {
            const sub = document.createElement('span');
            sub.className = 'sound-tile-sub';
            sub.textContent = item.subtitle;
            main.append(sub);
        }
        const state = playing ? t('sound.state_playing') : offline ? t('sound.offline_short') : '';
        if (state) main.setAttribute('aria-description', state);
        main.addEventListener('click', () => this.pick(item));
        li.append(main);

        if (item.kind !== 'silence') {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'btn-icon sm sound-tile-more';
            more.dataset.soundFocus = item.key + '-more';
            const label = t(item.kind === 'playlist' ? 'sound.details' : 'sound.adjust', { name: item.title });
            more.setAttribute('aria-label', label);
            more.title = label;
            const icon = document.createElement('i');
            icon.className = 'ph ' + (item.kind === 'playlist' ? 'ph-dots-three' : 'ph-sliders-horizontal');
            icon.setAttribute('aria-hidden', 'true');
            more.append(icon);
            more.addEventListener('click', () => {
                if (item.kind === 'ambient' && !this.matches(item, editor.draft)) this.choose(item.choice);
                else if (item.kind === 'ambient' && !editor.onChoose && !this.active) this.choose(editor.draft);
                this.openDetail(item.kind === 'ambient' ? editor.draft : item.choice, item.key + '-more');
            });
            li.append(more);
        }
        return li;
    },

    addTile() {
        const li = document.createElement('li');
        li.className = 'sound-tile sound-tile-add';
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'sound-tile-main';
        main.dataset.soundFocus = 'add';
        main.append(this.cover(this.ICONS.add, 'add', false));
        const title = document.createElement('span');
        title.className = 'sound-tile-title';
        title.textContent = t('sound.add_music');
        main.append(title);
        main.addEventListener('click', () => {
            this.editor.returnKey = 'add';
            this.setView('add');
        });
        li.append(main);
        return li;
    },

    // Clique num item da biblioteca. Em Hoje toca (ou pausa o que já toca);
    // na preparação só marca o rascunho.
    pick(item) {
        const editor = this.editor;
        if (!editor.onChoose && this.active && this.matches(item, this.active.choice)) {
            this.togglePlayback();
            this.renderEditor();
            return;
        }
        this.choose(item.choice);
    },

    choose(value) {
        const editor = this.editor;
        const choice = SoundCore.choice(value, this.playlists);
        if (!editor.onChoose && choice.kind === 'playlist' && !navigator.onLine) {
            this.setStatus(t('sound.offline'));
            return false;
        }
        editor.draft = choice;
        if (!editor.onChoose) {
            this.savePreference({ ...this.preference, choice });
            this.play(choice, this.focus?.id ?? null);
        }
        this.setStatus('');
        this.renderEditor();
        this.position();
        return true;
    },

    renderMixer() {
        const draft = this.editor.draft;
        const selected = draft.kind === 'ambient' ? draft.layers : [];
        this.layers.replaceChildren(...Object.keys(SoundCore.AMBIENCES).map(id => {
            const layer = selected.find(item => item.id === id);
            const row = document.createElement('div');
            row.className = 'sound-layer';
            row.classList.toggle('is-on', !!layer);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'sound-layer-toggle';
            toggle.dataset.soundFocus = 'layer-' + id;
            toggle.setAttribute('aria-pressed', String(!!layer));
            const icon = document.createElement('i');
            icon.className = 'ph ' + this.ICONS[id];
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = t('sound.' + id);
            toggle.append(icon, label);
            toggle.addEventListener('click', () => this.toggleLayer(id));
            const range = document.createElement('input');
            range.type = 'range';
            range.value = layer ? layer.volume : 0;
            range.disabled = !layer;
            range.dataset.soundFocus = 'layer-' + id + '-volume';
            range.setAttribute('aria-label', t('sound.layer_volume', { name: t('sound.' + id) }));
            range.addEventListener('input', () => this.setLayerVolume(id, range.valueAsNumber));
            range.addEventListener('change', () => {
                if (!this.editor.onChoose) this.savePreference({ ...this.preference, choice: this.editor.draft });
            });
            row.append(toggle, range);
            return row;
        }));
    },

    toggleLayer(id) {
        const draft = this.editor.draft;
        const layers = draft.kind === 'ambient' ? draft.layers : [];
        const on = layers.some(layer => layer.id === id);
        if (!on && layers.length >= SoundCore.MAX_LAYERS) {
            this.setStatus(t('sound.layer_limit', { max: SoundCore.MAX_LAYERS }));
            return;
        }
        const next = on ? layers.filter(layer => layer.id !== id) : [...layers, { id, volume: 60 }];
        this.choose({ kind: 'ambient', layers: next });
    },

    setLayerVolume(id, volume) {
        const layer = this.editor.draft.layers?.find(item => item.id === id);
        if (!layer) return;
        layer.volume = volume;
        if (this.editor.onChoose) return;
        const live = this.active?.choice.kind === 'ambient' && this.active.choice.layers.find(item => item.id === id);
        if (live) {
            live.volume = volume;
            SoundEngine.setLayerVolume(id, volume);
        }
    },

    renderPlaylist(item) {
        if (!item) return;
        const editor = this.editor;
        const cover = document.getElementById('sound-playlist-cover');
        cover.replaceWith(Object.assign(this.cover(this.playlistIcon(item), item.source, false), { id: 'sound-playlist-cover' }));
        document.getElementById('sound-playlist-meta').textContent = t('sound.media_' + item.idType, { provider: this.provider(item) });
        const hint = document.getElementById('sound-playlist-hint');
        hint.textContent = !navigator.onLine ? t('sound.offline') : item.source === 'spotify' ? t('sound.spotify_hint') : '';
        hint.hidden = !hint.textContent;
        const use = document.getElementById('sound-playlist-use');
        const chosen = editor.draft.kind === 'playlist' && editor.draft.id === item.id;
        use.hidden = chosen && (!!editor.onChoose || !!this.active);
        use.textContent = t(editor.onChoose ? 'sound.select' : 'sound.play');
        document.getElementById('sound-playlist-external').href = SoundCore.mediaUrl(item);
        const remove = document.getElementById('sound-playlist-remove');
        remove.disabled = false;
        remove.setAttribute('aria-label', t('sound.remove', { name: this.playlistName(item) }));
    },

    async addPlaylist() {
        const parsed = SoundCore.parseLink(this.input.value);
        if (!parsed) {
            this.setStatus(t('sound.invalid_link'));
            this.input.focus();
            return;
        }
        const matches = item => item?.source === parsed.source
            && item.idType === parsed.idType && item.externalId === parsed.externalId;
        const existing = this.playlists.find(matches);
        const editor = this.editor;
        if (!existing) {
            const item = { ...parsed, id: 'user-' + crypto.randomUUID() };
            const saved = await this.editLibrary(this.PLAYLISTS, items => items.some(matches) ? items : [...items, item]);
            if (!saved) return;
        }
        if (this.editor !== editor) return;
        this.input.value = '';
        const added = this.playlists.find(matches);
        if (!added) {
            this.setStatus(t('sound.removed'));
            return;
        }
        const key = 'pl-' + added.id;
        editor.filter = 'all';
        this.setView('library', { returnKey: key });
        const played = this.choose({ kind: 'playlist', id: added.id });
        if (played || editor.onChoose) this.setStatus(t(existing ? 'sound.already_added' : 'sound.added'));
        [...this.grid.querySelectorAll('[data-sound-focus]')].find(el => el.dataset.soundFocus === key)?.focus({ preventScroll: true });
    },

    async removePlaylist(item, button) {
        const isDefault = this.defaults.some(entry => entry.id === item.id);
        button.disabled = true;
        const saved = isDefault
            ? await this.editLibrary(this.DELETED, items => [...items, item.id])
            : await this.editLibrary(this.PLAYLISTS, items => items.filter(entry => entry.id !== item.id));
        if (!saved) button.disabled = false;
        else if (this.editor) {
            if (this.editor.view === 'playlist') this.setView('library');
            this.setStatus(t('sound.removed'));
        }
    },

    async editLibrary(key, update) {
        try {
            return await navigator.locks.request('ora-sound-library', async () => {
                const stored = await chrome.storage.local.get([this.PREF, this.PLAYLISTS, this.DELETED]);
                let items = stored[key];
                try { if (typeof items === 'string') items = JSON.parse(items); } catch { items = []; }
                stored[key] = update(Array.isArray(items) ? items : []);
                await chrome.storage.local.set({ [key]: stored[key] });
                this.setLibrary(stored);
                if (this.editor) this.editor.draft = SoundCore.choice(this.editor.draft, this.playlists);
                return true;
            });
        } catch (error) {
            console.error('[Sound] Playlist storage failed:', error);
            if (this.editor) this.setStatus(t('sound.save_error'));
            return false;
        }
    },

    setPlayerHidden(hidden) {
        this.savePreference({ ...this.preference, playerHidden: hidden });
        this.render();
    },

    savePreference(preference) {
        this.preference = preference;
        chrome.storage.local.set({ [this.PREF]: preference }).catch(error => {
            console.error('[Sound] Preference storage failed:', error);
            showToast(t('sound.save_error'), 'error');
        });
    },

    // Preparação do foco: confirma o rascunho.
    applyEditor() {
        const { draft, onChoose } = this.editor;
        if (!onChoose) return;
        this.savePreference({ ...this.preference, choice: draft });
        onChoose(draft);
        DialogSystem.close(this.root);
    },

    // --- Reprodução ---

    play(choice, focusId = null, { preservePause = false } = {}) {
        choice = SoundCore.choice(choice, this.playlists);
        if (choice.kind === 'silence') {
            this.stop();
            return;
        }
        const active = this.active;
        if (active && active.choice.kind === choice.kind && this.sameMedia(active.choice, choice)) {
            active.choice = choice;
            this.applyVolume();
            // Iniciar foco mantém a posição e o estado do som que já estava na aba.
            if (!preservePause && active.paused) this.resume();
            this.render();
            return;
        }
        const playlist = this.playlist(choice);
        if (playlist && !navigator.onLine) {
            showToast(t('sound.offline'), 'info');
            return;
        }
        if (active?.choice.kind === 'ambient' && choice.kind === 'ambient') {
            // Trocar camadas de um ambiente que já toca: as novas entram com fade.
            active.choice = choice;
            active.focusId = focusId;
            this.startLayers(active);
            if (!preservePause && active.paused) this.resume();
            this.updateMediaSession();
            this.render();
            return;
        }
        this.stop();
        const player = this.active = { choice, focusId, paused: !!playlist, ready: !playlist, pauseReason: null };
        if (playlist) {
            player.startPending = true;
            const params = new URLSearchParams({ source: playlist.source, type: playlist.idType,
                id: playlist.externalId, ora: 'sound' });
            this.external.href = SoundCore.mediaUrl(playlist);
            this.frame.src = this.RELAY + '/ora-player-relay/?' + params;
            player.loadTimeout = setTimeout(() => {
                if (this.active === player && !player.ready) {
                    player.failed = true;
                    this.render();
                }
            }, 12000);
        } else {
            this.startLayers(player);
            this.resume();
        }
        this.render();
        if (playlist) this.frame.scrollIntoView({ block: 'nearest' });
    },

    startLayers(player) {
        SoundEngine.setLayers(player.choice.layers).catch(error => {
            if (this.active !== player) return;
            console.warn('[Sound] Could not load ambient audio:', error);
            this.pause('manual');
            showToast(t('sound.play_error'), 'error');
        });
    },

    sameMedia(first, second) {
        if (first.kind === 'playlist') return first.id === second.id;
        return SoundCore.sameLayers(first, second);
    },

    togglePlayback() {
        if (!this.active) return;
        if (this.active.paused || this.active.pauseReason) {
            if (this.active.choice.kind === 'playlist') this.frame.scrollIntoView({ block: 'nearest' });
            this.resume();
        } else this.pause('manual');
    },

    stop() {
        const player = this.active;
        this.active = null;
        if (player) {
            clearTimeout(player.loadTimeout);
            if (player.choice.kind === 'ambient') SoundEngine.stop();
            else this.frame.removeAttribute('src');
        }
        this.updateMediaSession();
        this.render();
    },

    pause(reason) {
        if (!this.active) return;
        this.active.pauseReason = reason;
        this.active.startPending = false;
        this.active.paused = true;
        if (this.active.choice.kind === 'ambient') SoundEngine.pause();
        this.sendPlayer('pause');
        this.render();
    },

    resume() {
        const player = this.active;
        if (!player) return;
        player.pauseReason = null;
        if (player.choice.kind === 'playlist') {
            player.startPending = true;
            this.startVisiblePlayer();
        } else {
            player.paused = false;
            SoundEngine.setVolume(this.preference.volume);
            SoundEngine.play().catch(error => {
                if (this.active !== player || player.pauseReason) return;
                console.warn('[Sound] Could not play ambient audio:', error);
                this.pause('manual');
                showToast(t('sound.play_error'), 'error');
            });
            this.updateMediaSession();
        }
        this.render();
    },

    applyVolume() {
        SoundEngine.setVolume(this.preference.volume);
        if (!this.active) return;
        if (this.active.choice.kind === 'ambient') {
            for (const layer of this.active.choice.layers) SoundEngine.setLayerVolume(layer.id, layer.volume);
        }
        this.sendPlayer('volume', this.preference.volume);
    },

    onFocus(state) {
        const previous = this.focus;
        this.focus = state.phase === 'focus' && state.session
            ? { id: state.session.id, paused: !state.isRunning } : null;
        if (!this.active || !previous) return;
        if (this.focus?.id !== previous.id) {
            if (this.active.focusId === previous.id) this.stop();
            else if (this.active.pauseReason === 'focus') this.resume();
        } else if (this.focus.paused !== previous.paused) {
            if (this.focus.paused && this.preference.pauseWithFocus
                && (!this.active.paused || this.active.startPending)) this.pause('focus');
            if (!this.focus.paused && this.active.pauseReason === 'focus') this.resume();
        }
    },

    startVisiblePlayer() {
        const player = this.active;
        if (!player?.ready || !player.startPending || !this.frameVisible) return;
        player.startPending = false;
        this.sendPlayer('play');
    },

    sendPlayer(command, volume) {
        if (this.active?.choice.kind !== 'playlist' || !this.active.ready) return;
        this.frame.contentWindow.postMessage({ oraSound: command, volume }, this.RELAY);
    },

    onPlayerMessage(event) {
        const player = this.active;
        if (player?.choice.kind !== 'playlist' || event.origin !== this.RELAY
            || event.source !== this.frame.contentWindow) return;
        const data = event.data;
        if (data?.id !== this.playlist(player.choice)?.externalId) return;
        if (data.oraSound === 'ready') {
            clearTimeout(player.loadTimeout);
            player.ready = true;
            player.failed = false;
            this.applyVolume();
            this.startVisiblePlayer();
        } else if (data.oraSound === 'state' && typeof data.paused === 'boolean') {
            player.paused = data.paused;
            if (!data.paused && player.pauseReason === 'focus') this.sendPlayer('pause');
            else if (!data.paused) {
                player.pauseReason = null;
                player.startPending = false;
            }
        } else if (data.oraSound === 'error') {
            player.failed = true;
        } else return;
        this.render();
    },

    render() {
        const player = this.active;
        const playlist = this.playlist(player?.choice);
        const name = player ? this.name(player.choice) : t('sound.title');
        document.getElementById('sound-name').textContent = name;
        this.mini.classList.toggle('surface-glass', !!player);
        this.mini.classList.toggle('is-active', !!player);
        this.mini.classList.toggle('is-playing', !!player && !player.paused);
        this.controls.hidden = !player;
        this.toggle.disabled = !!playlist && !player.ready;
        const paused = player?.paused;
        this.toggle.setAttribute('aria-label', t(paused ? 'sound.play' : 'sound.pause'));
        this.toggle.title = t(paused ? 'sound.play' : 'sound.pause');
        this.toggle.firstElementChild.className = paused ? 'ph-fill ph-play' : 'ph ph-pause';
        this.volume.parentElement.hidden = !player || playlist?.source === 'spotify';
        this.volume.value = this.preference.volume;
        // O player só some da vista: o iframe continua carregado e tocando.
        const hidden = !!playlist && this.preference.playerHidden;
        this.playerToggle.hidden = !playlist;
        this.playerToggle.setAttribute('aria-expanded', String(!!playlist && !hidden));
        const playerLabel = t(hidden ? 'sound.player_show' : 'sound.player_hide');
        this.playerToggle.setAttribute('aria-label', playerLabel);
        this.playerToggle.title = playerLabel;
        this.remote.hidden = !playlist;
        this.remote.classList.toggle('is-concealed', hidden);
        this.remote.inert = hidden;
        this.frame.hidden = !playlist || !navigator.onLine;
        if (playlist) this.frame.title = t('sound.provider_player', { provider: this.provider(playlist) });
        const status = document.getElementById('sound-player-status');
        status.textContent = playlist && !navigator.onLine ? t('sound.offline')
            : player?.failed ? t('sound.provider_error')
            : playlist?.source === 'spotify' ? t('sound.spotify_hint') : '';
        status.hidden = !status.textContent;
        if (this.editor?.view === 'library') this.renderEditor();
        window.LeaveGuard?.refresh();
    }
};

window.SoundSystem = SoundSystem;
