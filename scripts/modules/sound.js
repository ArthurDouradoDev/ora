// ============================================================
// SOM — biblioteca (ambientes do Ora + playlists próprias) e mini controle
// ============================================================
// O popup troca de vista sem fechar: biblioteca em grade → ajustar ambiente
// (camadas e volumes), detalhes da playlist ou adicionar música.
// Escolher um som na biblioteca inicia a reprodução.
// Os sons do Ora tocam pelo SoundEngine (Web Audio); YouTube e Spotify pelo relay.
// O player do relay (#sound-frame) mora na vista da playlist e nunca muda de
// lugar: mover um iframe recarrega a página dele. Com o popup fechado e uma
// playlist ativa, o popup fica adormecido (.is-dormant: invisível, inerte e
// ainda renderizado) em vez de [hidden], para a música seguir tocando.

const SoundSystem = {
    PREF: 'ora_focus_sound',
    PLAYLISTS: 'ora_user_playlists',
    DELETED: 'ora_deleted_default_playlists',
    ARTWORK: 'ora_sound_artwork',   // { 'fonte:tipo:id': { cover, title, at } } do oEmbed
    RELAY: 'https://arthurdouradodev.github.io',
    RELAY_HELLO_TIMEOUT: 5000,
    BLOCKED_TIMEOUT: 4000,
    relay: null,            // página no iframe: 0 = v2 abrindo, 2 = v2, 1 = v1, null = nenhuma
    relayV2Missing: false,
    ICONS: {
        rain: 'ph-cloud-rain', church: 'ph-church', bells: 'ph-bell', monastery: 'ph-hands-praying',
        fire: 'ph-flame', gloria: 'ph-music-notes', chapel_rain: 'ph-church', monastery_night: 'ph-moon-stars',
        vigil: 'ph-flame', lauds: 'ph-sun-horizon', custom: 'ph-sliders-horizontal', silence: 'ph-speaker-slash',
        youtube: 'ph-youtube-logo', spotify: 'ph-spotify-logo', add: 'ph-plus'
    },
    active: null,
    focus: null,
    artwork: {},
    artworkPending: new Set(),
    editor: null,

    async init(defaults) {
        this.defaults = defaults || [];
        const keys = [this.PREF, this.PLAYLISTS, this.DELETED];
        const stored = await chrome.storage.local.get([...keys, this.ARTWORK]);
        this.setLibrary(stored);
        this.setArtwork(stored[this.ARTWORK]);
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
        this.pauseSetting = $('sound-pause-with-focus');
        this.mini = $('sound-mini');
        this.toggle = $('sound-toggle');
        this.nextButton = $('sound-next');
        this.volume = $('sound-volume');
        this.controls = $('sound-controls');
        this.stage = $('sound-stage');
        this.frame = $('sound-frame');
        this.playlistCard = $('sound-playlist-card');
        this.chipCover = $('sound-chip-cover');
        this.chipCover.addEventListener('error', () => { this.chipCover.dataset.failed = this.chipCover.getAttribute('src'); this.render(); });
        this.chipIcon = $('sound-chip-icon');

        this.bind();
        this.bindMediaSession();
        SoundEngine.setVolume(this.preference.volume);
        this.render();
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[this.ARTWORK]) {
                this.setArtwork(changes[this.ARTWORK].newValue);
                this.render();
                if (this.editor?.view === 'playlist') this.renderEditor();
            }
            if (!keys.some(key => changes[key])) return;
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
        this.nextButton.addEventListener('click', () => this.next());
        this.volume.addEventListener('input', () => {
            this.preference.volume = this.volume.valueAsNumber;
            this.applyVolume();
        });
        this.volume.addEventListener('change', () => this.savePreference(this.preference));

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

        window.addEventListener('ora:pomodoro', event => this.onFocus(event.detail));
        window.addEventListener('ora:locale-changed', () => {
            this.render();
            if (this.editor) this.renderEditor();
        });
        window.addEventListener('message', event => this.onPlayerMessage(event));
        window.addEventListener('resize', () => {
            if (!this.editor) return;
            this.panel._oraMotion?.size?.cancel();
            this.position();
        });
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
        return playlist.title || this.art(playlist)?.title || t('sound.media_' + playlist.idType, { provider: this.provider(playlist) });
    },

    // Playlists padrão trazem um ícone próprio; as da pessoa usam o do serviço.
    playlistIcon(playlist) {
        return /^ph-[a-z-]+$/.test(playlist.icon || '') ? playlist.icon : this.ICONS[playlist.source];
    },

    // --- Capas ---

    setArtwork(value) {
        this.artwork = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    },

    art(playlist) {
        return playlist ? this.artwork[SoundCore.mediaKey(playlist)] : null;
    },

    // Busca capa e título no oEmbed das mídias sem registro (ou vencido).
    // Erro de rede não fica registrado: tenta de novo na próxima vez.
    async ensureArtwork(playlists) {
        if (!navigator.onLine) return;
        const now = Date.now();
        const missing = playlists.filter(item => {
            const key = SoundCore.mediaKey(item);
            return !this.artworkPending.has(key) && SoundCore.artworkStale(this.artwork[key], now);
        });
        if (!missing.length) return;
        missing.forEach(item => this.artworkPending.add(SoundCore.mediaKey(item)));
        const results = await Promise.all(missing.map(async item => {
            try {
                const response = await fetch(SoundCore.oembedUrl(item), { credentials: 'omit', signal: AbortSignal.timeout(8000) });
                if (response.status >= 500) return null;
                const data = response.ok ? await response.json() : null;
                return [SoundCore.mediaKey(item), SoundCore.artwork(item, data)];
            } catch {
                return null;
            } finally {
                this.artworkPending.delete(SoundCore.mediaKey(item));
            }
        }));
        const found = results.filter(Boolean);
        if (!found.length) return;
        try {
            await navigator.locks.request('ora-sound-artwork', async () => {
                const current = (await chrome.storage.local.get(this.ARTWORK))[this.ARTWORK];
                const valid = new Set(this.playlists.map(item => SoundCore.mediaKey(item)));
                const next = {};
                for (const [key, entry] of Object.entries(current && typeof current === 'object' ? current : {})) {
                    if (valid.has(key)) next[key] = entry;
                }
                for (const [key, entry] of found) next[key] = entry;
                await chrome.storage.local.set({ [this.ARTWORK]: next });
            });
        } catch (error) {
            console.warn('[Sound] Artwork storage failed:', error);
        }
    },

    provider(playlist) {
        return playlist.source === 'spotify' ? 'Spotify' : 'YouTube';
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
            const art = this.art(playlist);
            list.push({ key: 'pl-' + playlist.id, kind: 'playlist', source: playlist.source, title: this.playlistName(playlist),
                subtitle: playlist.title || art?.title ? this.provider(playlist) : null, icon: this.playlistIcon(playlist), tone: playlist.source,
                image: art?.cover || null,
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

    open(opener) {
        if (this.editor) return;
        const draft = SoundCore.choice(this.active?.choice || this.preference.choice, this.playlists);
        this.editor = { draft, opener, view: 'library', filter: 'all', target: null };
        this.pauseSetting.checked = this.preference.pauseWithFocus;
        this.input.value = '';
        this.setView('library', { focus: false });
        this.ensureArtwork(this.playlists);
        // Adormecido, o popup já está no DOM: só volta a responder.
        this.root.classList.remove('is-dormant');
        this.root.inert = false;
        DialogSystem.open(this.root, { opener, onClose: () => {
            this.editor = null;
            this.park();
        } });
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
        this.finishViewExit();
        const animate = previous !== view && DialogSystem.isOpen(this.root) && !Motion.reduced() && !document.hidden;
        const from = animate ? { height: this.panel.offsetHeight, top: this.panel.offsetTop } : null;
        this.panel._oraMotion?.size?.cancel();
        const x = view === 'library' ? -12 : 12;
        if (animate) this.leaveView(previous, x);
        editor.view = view;
        for (const [name, el] of Object.entries(this.views)) {
            const shown = name === view;
            el.inert = !shown;
            if (this.leavingView?.name === name) continue;
            // A vista da playlist guarda o player: estaciona em vez de sumir.
            if (name === 'playlist') el.classList.toggle('is-parked', !shown);
            else el.hidden = !shown;
        }
        // Cada vista começa do topo (filtros e cabeçalho à vista).
        this.views[view].scrollTop = 0;
        this.setStatus('');
        this.renderEditor();
        this.position();
        if (animate) {
            Motion.play(this.views[view], [
                { opacity: 0, transform: `translateX(${x}px)` },
                { opacity: 1, transform: 'none' }
            ], { duration: 220, channel: 'view' });
            const to = { height: this.panel.offsetHeight, top: this.panel.offsetTop };
            if (from.height !== to.height || from.top !== to.top) {
                const anchored = this.root.classList.contains('is-anchored');
                const maxHeight = Math.max(from.height, to.height) + 'px';
                const size = rect => ({ height: rect.height + 'px', maxHeight, ...(anchored ? { top: rect.top + 'px' } : {}) });
                const resize = Motion.play(this.panel, [size(from), size(to)], { duration: 220, easing: 'ease-in-out', channel: 'size' });
                resize?.finished.then(() => this.position(), () => {});
            }
        }
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

    leaveView(name, x) {
        const el = this.views[name];
        const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = el;
        const { opacity, transform } = getComputedStyle(el);
        const animation = Motion.play(el, [
            { opacity, transform },
            { opacity: 0, transform: `translateX(${-x}px)` }
        ], { duration: 160, channel: 'view', fill: 'forwards' });
        if (!animation) return;
        Object.assign(el.style, {
            top: offsetTop + 'px', left: offsetLeft + 'px', width: offsetWidth + 'px', height: offsetHeight + 'px'
        });
        el.classList.add('is-leaving');
        this.leavingView = { name, el, animation };
        animation.finished.then(() => {
            if (this.leavingView?.animation === animation) this.finishViewExit();
        }, () => {});
    },

    finishViewExit() {
        if (!this.leavingView) return;
        const { name, el, animation } = this.leavingView;
        this.leavingView = null;
        if (name === 'playlist') el.classList.add('is-parked');
        else el.hidden = true;
        el.classList.remove('is-leaving');
        Object.assign(el.style, { top: '', left: '', width: '', height: '' });
        animation.cancel();
        this.renderStage();
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
        if (!this.editor || panel._oraMotion?.size?.playState === 'running') return;
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
        // O popup cresce a partir do botão que o abriu (ui.css: entrada do diálogo)
        panel.style.setProperty('--sound-origin', `${Math.round(rect.left + rect.width / 2 - left)}px ${down ? '0' : '100%'}`);
    },

    setStatus(text) {
        this.status.textContent = text;
    },

    renderEditor() {
        const editor = this.editor;
        if (!editor) return;
        const focusKey = document.activeElement?.dataset.soundFocus;
        const view = editor.view;
        const titles = { library: t('sound.title'), mixer: this.name(editor.draft), add: t('sound.add_music') };
        const target = this.playlist({ id: editor.target });
        this.title.textContent = view === 'playlist' ? (target ? this.playlistName(target) : t('sound.title')) : titles[view];
        this.back.hidden = view === 'library';
        this.addOpen.hidden = view !== 'library';
        this.reset.hidden = view !== 'mixer' || !SoundCore.sceneOf(editor.draft);

        if (view === 'library') this.renderLibrary();
        else if (view === 'mixer') this.renderMixer();
        else if (view === 'playlist') this.renderPlaylist(target);
        this.renderStage();

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

    // Capa: ícone sobre o degradê do tom; com imagem, ela cobre o ícone
    // (que volta se a imagem não carregar).
    cover(icon, tone, playing, image = null) {
        const cover = document.createElement('span');
        cover.className = 'sound-cover';
        cover.dataset.tone = tone;
        const glyph = document.createElement('i');
        glyph.className = 'ph ' + icon;
        glyph.setAttribute('aria-hidden', 'true');
        cover.append(glyph);
        if (image) {
            const img = document.createElement('img');
            img.alt = '';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', () => img.remove(), { once: true });
            img.src = image;
            cover.append(img);
        }
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
        main.append(this.cover(item.icon, item.tone, playing, item.image));
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
                else if (item.kind === 'ambient' && !this.active) this.choose(editor.draft);
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

    // Um ambiente toca ou pausa sem sair da grade; uma playlist abre o player.
    pick(item) {
        const live = this.active && this.matches(item, this.active.choice);
        if (live && item.kind === 'playlist') {
            this.openDetail(item.choice, item.key);
        } else if (live) {
            this.togglePlayback();
            this.renderEditor();
        } else if (this.choose(item.choice) && item.kind === 'playlist') {
            this.openDetail(item.choice, item.key);
        }
    },

    choose(value) {
        const editor = this.editor;
        const choice = SoundCore.choice(value, this.playlists);
        if (choice.kind === 'playlist' && !navigator.onLine) {
            this.setStatus(t('sound.offline'));
            return false;
        }
        editor.draft = choice;
        this.savePreference({ ...this.preference, choice });
        this.play(choice, this.focus?.id ?? null);
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
                this.savePreference({ ...this.preference, choice: this.editor.draft });
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
        const live = this.active?.choice.kind === 'ambient' && this.active.choice.layers.find(item => item.id === id);
        if (live) {
            live.volume = volume;
            SoundEngine.setLayerVolume(id, volume);
        }
    },

    // O player só aparece no detalhe da playlist que está tocando; nos outros
    // casos fica estacionado (fora da vista, ainda carregado).
    renderStage() {
        const player = this.active;
        const playlist = this.playlist(player?.choice);
        const editor = this.editor;
        // Mantém o mesmo iframe visível durante a saída da vista ou do popup.
        const leaving = this.leavingView?.name === 'playlist' || (!editor && this.root.classList.contains('is-dormant'));
        const shown = !!playlist && (editor?.view === 'playlist' && editor.target === playlist.id ||
            leaving && !this.stage.classList.contains('is-parked'));
        this.stage.classList.toggle('is-parked', !shown);
        if (this.stage.inert !== !shown) this.stage.inert = !shown;
        this.playlistCard.hidden = shown;
        if (playlist) Object.assign(this.stage.dataset, { source: playlist.source, type: playlist.idType });
        this.frame.hidden = !playlist || !navigator.onLine;
        if (playlist) this.frame.title = t('sound.provider_player', { provider: this.provider(playlist) });
        const status = document.getElementById('sound-player-status');
        status.textContent = !playlist ? '' : player.failed ? t('sound.provider_error')
            : player.blocked ? t('sound.tap_play') : '';
        status.hidden = !status.textContent;
    },

    // Popup fechado com playlist ativa: adormece em vez de sumir. Sem playlist,
    // volta a ficar oculto como os outros diálogos.
    park() {
        if (this.editor) return;
        const keep = this.active?.choice.kind === 'playlist';
        if (keep === this.root.classList.contains('is-dormant')) return;
        this.root.classList.toggle('is-dormant', keep);
        this.root.hidden = !keep;
        this.root.inert = keep;
    },

    renderPlaylist(item) {
        if (!item) return;
        const editor = this.editor;
        const cover = document.getElementById('sound-playlist-cover');
        cover.replaceWith(Object.assign(this.cover(this.playlistIcon(item), item.source, false, this.art(item)?.cover), { id: 'sound-playlist-cover' }));
        document.getElementById('sound-playlist-meta').textContent = t('sound.media_' + item.idType, { provider: this.provider(item) });
        const hint = document.getElementById('sound-playlist-hint');
        hint.textContent = !navigator.onLine ? t('sound.offline') : item.source === 'spotify' ? t('sound.spotify_hint') : '';
        hint.hidden = !hint.textContent;
        const use = document.getElementById('sound-playlist-use');
        const chosen = editor.draft.kind === 'playlist' && editor.draft.id === item.id;
        use.hidden = chosen && !!this.active;
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
        this.ensureArtwork([added]);
        const key = 'pl-' + added.id;
        editor.filter = 'all';
        // Em Hoje, a música nova toca e abre o player (o Voltar leva à capa dela).
        if (navigator.onLine) {
            this.choose({ kind: 'playlist', id: added.id });
            this.openDetail({ kind: 'playlist', id: added.id }, key);
            this.setStatus(t(existing ? 'sound.already_added' : 'sound.added'));
            return;
        }
        this.setView('library', { returnKey: key });
        this.setStatus(t('sound.offline'));
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

    savePreference(preference) {
        this.preference = preference;
        chrome.storage.local.set({ [this.PREF]: preference }).catch(error => {
            console.error('[Sound] Preference storage failed:', error);
            showToast(t('sound.save_error'), 'error');
        });
    },

    // --- Reprodução ---

    play(choice, focusId = null) {
        choice = SoundCore.choice(choice, this.playlists);
        if (choice.kind === 'silence') {
            this.stop();
            return;
        }
        const active = this.active;
        if (active && active.choice.kind === choice.kind && this.sameMedia(active.choice, choice)) {
            active.choice = choice;
            this.applyVolume();
            if (active.paused) this.resume();
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
            if (active.paused) this.resume();
            this.updateMediaSession();
            this.render();
            return;
        }
        // Com o relay v2 já aberto, trocar de playlist só pede outra mídia ao mesmo player.
        const reuse = !!playlist && active?.choice.kind === 'playlist' && this.relay === 2;
        if (reuse) this.release(active);
        else this.stop();
        const player = this.active = { choice, focusId, paused: !!playlist, ready: !playlist, pauseReason: null };
        if (playlist) {
            player.startPending = true;
            const media = { source: playlist.source, type: playlist.idType, id: playlist.externalId };
            if (reuse) this.frame.contentWindow.postMessage({ oraRelay: 2, cmd: 'load', media }, this.RELAY);
            else this.loadRelay(player, media);
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
            const blocked = this.active.blocked;
            this.resume();
            // O navegador já barrou o início: abre o player para um toque no play dele.
            if (blocked && !this.editor) {
                this.open(document.getElementById('sound-open'));
                if (this.editor && this.active) this.openDetail(this.active.choice);
            }
        } else this.pause('manual');
    },

    stop() {
        const player = this.active;
        this.active = null;
        if (player) {
            this.release(player);
            if (player.choice.kind === 'ambient') SoundEngine.stop();
            else {
                this.frame.removeAttribute('src');
                this.relay = null;
            }
        }
        this.updateMediaSession();
        this.render();
    },

    release(player) {
        clearTimeout(player.loadTimeout);
        clearTimeout(player.helloTimeout);
        clearTimeout(player.blockedTimeout);
    },

    // Abre o relay v2 (APIs oficiais do YouTube e do Spotify). Se a página não
    // responder (ainda não publicada, fora do ar), cai para o relay v1, que é
    // conduzido pelo content script sound-relay.js.
    loadRelay(player, media) {
        const params = new URLSearchParams({ source: media.source, type: media.type, id: media.id, ora: 'sound' });
        const v1 = () => {
            this.relay = 1;
            this.frame.src = this.RELAY + '/ora-player-relay/?' + params;
        };
        if (this.relayV2Missing) return v1();
        this.relay = 0;
        this.frame.src = this.RELAY + '/ora-player-relay/v2/?' + params;
        player.helloTimeout = setTimeout(() => {
            if (this.active !== player || this.relay !== 0) return;
            this.relayV2Missing = true;
            v1();
        }, this.RELAY_HELLO_TIMEOUT);
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
            this.startPlayer();
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

    // O pedido de tocar vai direto ao relay, visível ou não (o iframe tem
    // allow="autoplay"). Se o navegador não deixar tocar em alguns segundos, o
    // player fica marcado como barrado: o aviso aparece no player e o ▶ do mini
    // abre o popup nele.
    startPlayer() {
        const player = this.active;
        if (!player?.ready || !player.startPending) return;
        player.startPending = false;
        this.sendPlayer('play');
        clearTimeout(player.blockedTimeout);
        player.blockedTimeout = setTimeout(() => {
            if (this.active !== player || !player.paused || player.pauseReason) return;
            player.blocked = true;
            this.render();
        }, this.BLOCKED_TIMEOUT);
    },

    sendPlayer(command, volume) {
        if (this.active?.choice.kind !== 'playlist' || !this.active.ready) return;
        const message = this.relay === 2 ? { oraRelay: 2, cmd: command, volume } : { oraSound: command, volume };
        if (this.relay === 2 || command !== 'next') this.frame.contentWindow.postMessage(message, this.RELAY);
    },

    next() {
        if (this.active?.canNext) this.sendPlayer('next');
    },

    // Mensagens do relay: v2 ({ oraRelay: 2, event }) ou v1 ({ oraSound }).
    onPlayerMessage(event) {
        if (event.origin !== this.RELAY || event.source !== this.frame.contentWindow) return;
        const data = event.data;
        const v2 = data?.oraRelay === 2;
        const type = v2 ? data.event : data?.oraSound;
        if (v2 && type === 'hello') {
            if (this.relay === 0) this.relay = 2;
            clearTimeout(this.active?.helloTimeout);
            return;
        }
        const player = this.active;
        if (player?.choice.kind !== 'playlist' || data?.id !== this.playlist(player.choice)?.externalId) return;
        if (type === 'ready') {
            clearTimeout(player.loadTimeout);
            player.ready = true;
            player.failed = false;
            player.canNext = v2 && data.canNext === true;
            this.applyVolume();
            this.startPlayer();
        } else if (type === 'state' && typeof data.paused === 'boolean') {
            player.paused = data.paused;
            if (!data.paused && player.pauseReason === 'focus') this.sendPlayer('pause');
            else if (!data.paused) {
                clearTimeout(player.blockedTimeout);
                player.pauseReason = null;
                player.startPending = false;
                player.blocked = false;
            }
        } else if (type === 'error') {
            clearTimeout(player.loadTimeout);
            player.failed = true;
        } else return;
        this.render();
    },

    // Ícone do mini controle quando não há capa: o do ambiente ou do serviço.
    miniIcon(player, playlist) {
        if (!player) return 'ph-music-notes';
        if (playlist) return this.playlistIcon(playlist);
        const scene = SoundCore.sceneOf(player.choice);
        return (scene && this.ICONS[scene]) || this.ICONS.custom;
    },

    render() {
        const player = this.active;
        const playlist = this.playlist(player?.choice);
        const name = player ? this.name(player.choice) : t('sound.title');
        document.getElementById('sound-name').textContent = name;
        const art = this.art(playlist)?.cover;
        const cover = art && this.chipCover.dataset.failed !== art ? art : null;
        if (playlist) this.ensureArtwork([playlist]);
        if (cover && this.chipCover.getAttribute('src') !== cover) this.chipCover.src = cover;
        this.chipCover.hidden = !cover;
        this.mini.classList.toggle('has-cover', !!cover);
        this.mini.classList.toggle('surface-glass', !!player);
        this.mini.classList.toggle('is-active', !!player);
        this.mini.classList.toggle('is-playing', !!player && !player.paused);
        // Sem nome à vista: a capa ou o ícone do ambiente identificam; o nome
        // fica no rótulo do botão (lido pelo leitor de tela e na dica).
        this.chipIcon.className = 'ph sound-chip-icon ' + this.miniIcon(player, playlist);
        const chip = document.getElementById('sound-open');
        if (player) chip.title = name;
        else chip.removeAttribute('title');
        this.toggle.hidden = !player;
        this.toggle.disabled = !!playlist && !player.ready;
        const paused = player?.paused;
        this.toggle.setAttribute('aria-label', t(paused ? 'sound.play' : 'sound.pause'));
        this.toggle.title = t(paused ? 'sound.play' : 'sound.pause');
        this.toggle.firstElementChild.className = paused ? 'ph-fill ph-play' : 'ph-fill ph-pause';
        this.volume.parentElement.hidden = !player || playlist?.source === 'spotify';
        this.volume.value = this.preference.volume;
        this.nextButton.hidden = !player?.canNext;
        // Spotify sem "próxima" não tem o que mostrar ao lado do ⏸.
        this.controls.hidden = this.volume.parentElement.hidden && this.nextButton.hidden;
        this.renderStage();
        this.park();
        if (this.editor?.view === 'library') this.renderEditor();
        window.LeaveGuard?.refresh();
    }
};

window.SoundSystem = SoundSystem;
