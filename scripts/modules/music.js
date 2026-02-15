const MusicSystem = {
    state: {
        defaultPlaylists: [],
        userPlaylists: [],
        activePlayer: null,
        isPlayerMinimized: false,
        currentPlaylistUrl: '',
        currentPlaylistIndex: -1,
        allPlaylists: [],
        currentPlaylistIndex: -1,
        allPlaylists: [],
        deletedDefaultPlaylists: [],
        metadataCache: new Map()
    },

    deps: {}, // Deprecated, kept for structure but unused

    init: async function(defaultPlaylists) {
        this.state.defaultPlaylists = defaultPlaylists || [];
        // Dependencies are now global (AsyncStorage, animateModal, etc.)
        
        await this.loadUserPlaylists();
        this.cacheDOM();
        this.bindEvents();
        this.renderPlaylists();

        console.log('[Ora] Music System initialized');
    },

    loadUserPlaylists: async function() {
        try {
            const stored = await AsyncStorage.get('ora_user_playlists');
            this.state.userPlaylists = stored ? (typeof stored === 'string' ? JSON.parse(stored) : stored) : [];
            
            const deleted = await AsyncStorage.get('ora_deleted_default_playlists');
            this.state.deletedDefaultPlaylists = deleted ? (typeof deleted === 'string' ? JSON.parse(deleted) : deleted) : [];
        } catch (e) {
            console.error('[Music] Error loading playlists:', e);
            this.state.userPlaylists = [];
            this.state.deletedDefaultPlaylists = [];
        }
    },

    saveUserPlaylists: async function() {
        await AsyncStorage.set('ora_user_playlists', JSON.stringify(this.state.userPlaylists));
    },

    cacheDOM: function() {
        this.dom = {
            btnMusic: document.getElementById('btn-music'),
            musicLibrary: document.getElementById('music-library'),
            closeLibraryBtn: document.getElementById('close-library-btn'),
            playlistGrid: document.getElementById('playlist-grid'),
            playlistInput: document.getElementById('playlist-input'),
            addPlaylistBtn: document.getElementById('add-playlist-btn'),
            miniPlayer: document.getElementById('mini-player'),
            closePlayerBtn: document.getElementById('close-player-btn'),
            minimizePlayerBtn: document.getElementById('minimize-player-btn'),
            openExternalBtn: document.getElementById('open-external-btn'),
            nowPlayingText: document.getElementById('now-playing-text'),
            ytIframe: document.getElementById('youtube-iframe'),
            spIframe: document.getElementById('spotify-iframe'),
            iframeContainer: document.getElementById('iframe-container')
        };
    },

    bindEvents: function() {
        // Toggle Library
        this.dom.btnMusic.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isModalVisible(this.dom.musicLibrary)) {
                animateModal(this.dom.musicLibrary, true);
                this.renderPlaylists();
            } else {
                animateModal(this.dom.musicLibrary, false);
            }
        });

        this.dom.closeLibraryBtn.addEventListener('click', () => {
            animateModal(this.dom.musicLibrary, false);
        });

        // Close Library on Click Outside
        // Close Library on Click Outside
        document.addEventListener('click', (e) => {
            // If user is typing in an input inside the modal, don't close it
            if (this.dom.musicLibrary.contains(document.activeElement) && 
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            if (isModalVisible(this.dom.musicLibrary) &&
                !this.dom.musicLibrary.contains(e.target) &&
                e.target !== this.dom.btnMusic &&
                !this.dom.btnMusic.contains(e.target)) {
                animateModal(this.dom.musicLibrary, false);
            }
        });

        // Mini Player Controls
        this.dom.closePlayerBtn.addEventListener('click', () => {
            animateModal(this.dom.miniPlayer, false);
            this.stopPlayback();
            this.state.isPlayerMinimized = false;
        });

        this.dom.minimizePlayerBtn.addEventListener('click', () => {
            this.toggleMinimize();
        });

        this.dom.openExternalBtn.addEventListener('click', () => {
            if (this.state.currentPlaylistUrl) {
                window.open(this.state.currentPlaylistUrl, '_blank');
            }
        });

        // Add Playlist
        this.dom.addPlaylistBtn.addEventListener('click', () => this.handleAddPlaylist());
        this.dom.playlistInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleAddPlaylist();
        });
    },

    toggleMinimize: function() {
        this.state.isPlayerMinimized = !this.state.isPlayerMinimized;

        if (this.state.isPlayerMinimized) {
            this.dom.iframeContainer.style.display = 'none';
            this.dom.miniPlayer.classList.add('minimized');
            this.dom.minimizePlayerBtn.querySelector('i').classList.remove('ph-caret-down');
            this.dom.minimizePlayerBtn.querySelector('i').classList.add('ph-caret-up');
        } else {
            this.dom.iframeContainer.style.display = 'block';
            this.dom.miniPlayer.classList.remove('minimized');
            this.dom.minimizePlayerBtn.querySelector('i').classList.remove('ph-caret-up');
            this.dom.minimizePlayerBtn.querySelector('i').classList.add('ph-caret-down');
        }
    },

    stopPlayback: function() {
        this.dom.ytIframe.src = '';
        this.dom.ytIframe.style.display = 'none';
        this.dom.spIframe.src = '';
        this.dom.spIframe.style.display = 'none';
        this.state.activePlayer = null;
        this.state.currentPlaylistUrl = '';
        this.state.currentPlaylistIndex = -1;
    },

    async fetchMetadata(playlist, cardElement) {
        try {
            let url = '';
            if (playlist.source === 'spotify') {
                url = `https://open.spotify.com/${playlist.idType}/${playlist.externalId}`;
            } else if (playlist.source === 'youtube') {
                if (playlist.idType === 'playlist') {
                    url = `https://www.youtube.com/playlist?list=${playlist.externalId}`;
                } else {
                    url = `https://www.youtube.com/watch?v=${playlist.externalId}`;
                }
            }

            const coverEl = cardElement.querySelector('.playlist-cover');
            if (coverEl) coverEl.classList.add('loading');

            const cacheKey = `${playlist.source}_${playlist.externalId}`;
            let fetchedData;

            if (this.state.metadataCache.has(cacheKey)) {
                fetchedData = this.state.metadataCache.get(cacheKey);
            } else {
                const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
                fetchedData = await response.json();
                this.state.metadataCache.set(cacheKey, fetchedData);
            }

            if (coverEl) coverEl.classList.remove('loading');

            if (fetchedData.title) {
                const titleEl = cardElement.querySelector('.playlist-title');
                if (titleEl) {
                    titleEl.textContent = fetchedData.title;
                    titleEl.title = fetchedData.title;
                }

                if (playlist.source === 'spotify' && fetchedData.thumbnail_url) {
                    coverEl.innerHTML = `
                        <img src="${fetchedData.thumbnail_url}" loading="lazy" alt="${fetchedData.title}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">
                        <button class="delete-btn" title="Remover"><i class="ph ph-trash"></i></button>
                    `;
                    const newDelBtn = coverEl.querySelector('.delete-btn');
                    if (newDelBtn) {
                        newDelBtn.onclick = (e) => {
                            e.stopPropagation();
                            this.removePlaylist(playlist.id);
                        };
                    }
                }
            }
        } catch (error) {
            console.warn(`Não foi possível carregar dados para ${playlist.title}:`, error);
            const coverEl = cardElement.querySelector('.playlist-cover');
            if (coverEl) coverEl.classList.remove('loading');
        }
    },

    renderPlaylists: function() {
        this.dom.playlistGrid.innerHTML = '';
        this.state.allPlaylists = [...this.state.defaultPlaylists, ...this.state.userPlaylists];

        // Filter out deleted default playlists
        this.state.allPlaylists = this.state.allPlaylists.filter(p => !this.state.deletedDefaultPlaylists.includes(p.id));

        this.state.allPlaylists.forEach((playlist) => {
            const card = document.createElement('div');
            card.className = 'playlist-card';

            // Create cover container
            const coverDiv = document.createElement('div');
            coverDiv.className = 'playlist-cover';

            if (playlist.source === 'youtube' && playlist.idType !== 'playlist' && playlist.externalId) {
                const thumbUrl = `https://img.youtube.com/vi/${playlist.externalId}/mqdefault.jpg`;
                const img = document.createElement('img');
                img.src = thumbUrl;
                img.loading = 'lazy';
                img.alt = playlist.title;
                img.onerror = function() {
                    // Safe error handling without inline script
                    this.style.display = 'none';
                    const icon = document.createElement('i');
                    icon.className = 'ph ph-youtube-logo';
                    coverDiv.insertBefore(icon, this); 
                    this.remove();
                };
                coverDiv.appendChild(img);
            } else {
                let iconClass = playlist.icon || (playlist.source === 'spotify' ? 'ph-spotify-logo' : 'ph-youtube-logo');
                const icon = document.createElement('i');
                icon.className = `ph ${iconClass}`;
                coverDiv.appendChild(icon);
            }

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.title = 'Remover';
            deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.removePlaylist(playlist.id);
            };
            coverDiv.appendChild(deleteBtn);

            // Create info container
            const infoDiv = document.createElement('div');
            infoDiv.className = 'playlist-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'playlist-title';
            titleDiv.title = playlist.title;
            titleDiv.textContent = playlist.title;

            const sourceDiv = document.createElement('div');
            sourceDiv.className = 'playlist-source';
            sourceDiv.innerHTML = `
                <i class="ph ${playlist.source === 'spotify' ? 'ph-spotify-logo' : 'ph-youtube-logo'}"></i>
                ${playlist.source === 'youtube' ? 'YouTube' : 'Spotify'}
            `;

            infoDiv.appendChild(titleDiv);
            infoDiv.appendChild(sourceDiv);

            // Assemble card
            card.appendChild(coverDiv);
            card.appendChild(infoDiv);

            card.onclick = (e) => {
                // If clicked on delete button, do nothing (handled by stopPropagation)
                if (e.target.closest('.delete-btn')) return;
                this.playPlaylist(playlist);
                animateModal(this.dom.musicLibrary, false);
            };

            this.dom.playlistGrid.appendChild(card);

            if (playlist.source === 'spotify' || playlist.idType === 'playlist') {
                this.fetchMetadata(playlist, card);
            }
        });
    },

    handleAddPlaylist: function() {
        const input = this.dom.playlistInput.value.trim();

        if (!input) {
            showToast('Por favor, preencha com a URL.', 'info');
            return;
        }

        let newPlaylist = null;

        // YouTube detection
        if (input.includes('youtube.com') || input.includes('youtu.be') || input.includes('music.youtube.com')) {
            const playlistMatch = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
            const videoMatch = input.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);

            if (playlistMatch) {
                newPlaylist = {
                    id: 'user-' + Date.now(),
                    title: 'YouTube Playlist',
                    source: 'youtube',
                    idType: 'playlist',
                    externalId: playlistMatch[1],
                    icon: 'ph-youtube-logo'
                };
            } else if (videoMatch) {
                newPlaylist = {
                    id: 'user-' + Date.now(),
                    title: 'YouTube Video',
                    source: 'youtube',
                    idType: 'video',
                    externalId: videoMatch[1],
                    icon: 'ph-youtube-logo'
                };
            }
        }
        // Spotify detection
        else if (input.includes('spotify.com') || input.includes('spotify:')) {
            const urlMatch = input.match(/spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
            const uriMatch = input.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/);
            const match = urlMatch || uriMatch;

            if (match) {
                newPlaylist = {
                    id: 'user-' + Date.now(),
                    title: match[1] === 'playlist' ? 'Spotify Playlist' : (match[1] === 'album' ? 'Spotify Album' : 'Spotify Track'),
                    source: 'spotify',
                    idType: match[1],
                    externalId: match[2],
                    icon: 'ph-spotify-logo'
                };
            }
        }

        if (newPlaylist) {
            this.state.userPlaylists.push(newPlaylist);
            this.saveUserPlaylists();
            this.dom.playlistInput.value = '';
            this.renderPlaylists();

            if (newPlaylist.idType === 'playlist') {
                showToast('Playlist adicionada!', 'success');
            } else {
                showToast('Música adicionada!', 'success');
            }
        } else {
            showToast('Não foi possível encontrar o vídeo/playlist.', 'error');
        }
    },

    removePlaylist: function(id) {
        if (id.startsWith('def-')) {
            // It's a default playlist, add to deleted list
            if (!this.state.deletedDefaultPlaylists.includes(id)) {
                this.state.deletedDefaultPlaylists.push(id);
                AsyncStorage.set('ora_deleted_default_playlists', JSON.stringify(this.state.deletedDefaultPlaylists));
            }
        } else {
            // It's a user playlist, remove from list
            this.state.userPlaylists = this.state.userPlaylists.filter((p) => p.id !== id);
            this.saveUserPlaylists();
        }

        this.renderPlaylists();
        showToast('Removido com sucesso.', 'info');
    },

    playPlaylist: function(playlist) {
        animateModal(this.dom.miniPlayer, true);
        this.dom.nowPlayingText.textContent = playlist.title;

        if (this.state.isPlayerMinimized) {
            this.toggleMinimize();
        }

        const RELAY_URL = 'https://arthurdouradodev.github.io/ora-player-relay/';

        if (playlist.source === 'youtube') {
            this.dom.spIframe.style.display = 'none';
            this.dom.spIframe.src = '';
            this.dom.ytIframe.style.display = 'block';

            const src = `${RELAY_URL}?source=youtube&type=${playlist.idType}&id=${playlist.externalId}`;

            if (playlist.idType === 'playlist') {
                this.state.currentPlaylistUrl = `https://www.youtube.com/playlist?list=${playlist.externalId}`;
            } else {
                this.state.currentPlaylistUrl = `https://www.youtube.com/watch?v=${playlist.externalId}`;
            }

            this.dom.ytIframe.src = src;
            this.state.activePlayer = 'youtube';

        } else if (playlist.source === 'spotify') {
            this.dom.ytIframe.style.display = 'none';
            this.dom.ytIframe.src = '';
            this.dom.spIframe.style.display = 'block';

            const src = `${RELAY_URL}?source=spotify&type=${playlist.idType}&id=${playlist.externalId}`;
            this.dom.spIframe.src = src;
            this.state.currentPlaylistUrl = `https://open.spotify.com/${playlist.idType}/${playlist.externalId}`;
            this.state.activePlayer = 'spotify';
        }
    }
};

window.MusicSystem = MusicSystem;
