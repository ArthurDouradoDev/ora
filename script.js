// 1. Relógio
function updateClock() {
    try {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const clock = document.getElementById('clock');
        if (clock) clock.textContent = `${hours}:${minutes}`;
    } catch (e) { console.error(e); }
}
setInterval(updateClock, 1000);
updateClock();

// Helper for safe storage access (works on file:// where localStorage might be blocked)
const SafeStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { return null; }
    },
    setItem: (key, value) => {
        try { localStorage.setItem(key, value); }
        catch (e) { /* silently fail */ }
    }
};

// ============================================================
// LOAD DATA FROM JSON & INITIALIZE
// ============================================================

async function loadAppData() {
    try {
        const response = await fetch('data.json');
        return await response.json();
    } catch (e) {
        console.error('Failed to load data.json:', e);
        // Return minimal fallback so the app doesn't crash
        return {
            backgroundImages: [],
            defaultPlaylists: [],
            prayers: [],
            quotes: [{ text: "Fiat Voluntas Tua", author: "" }],
            greetings: ["Fiat Voluntas Tua"]
        };
    }
}

async function initApp() {
    const data = await loadAppData();
    console.log('[Ora] Data loaded:', Object.keys(data));

    // ============================================================
    // 2. Imagem de Fundo Dinâmica
    // ============================================================

    function setBackground() {
        try {
            if (data.backgroundImages.length === 0) return;

            const today = new Date().toDateString();
            const savedDate = SafeStorage.getItem('catholic_dash_date');
            let imageUrl;

            if (savedDate === today && SafeStorage.getItem('catholic_dash_image')) {
                imageUrl = SafeStorage.getItem('catholic_dash_image');
            } else {
                const randomIndex = Math.floor(Math.random() * data.backgroundImages.length);
                imageUrl = data.backgroundImages[randomIndex];
                SafeStorage.setItem('catholic_dash_date', today);
                SafeStorage.setItem('catholic_dash_image', imageUrl);
            }

            document.body.style.backgroundImage = `url('${imageUrl}')`;
        } catch (e) {
            console.error('Error in setBackground:', e);
        }
    }
    setBackground();
    console.log('[Ora] Background set');

    // ============================================================
    // 2b. Frase e Saudação Dinâmicas
    // ============================================================

    function setQuote() {
        try {
            if (!data.quotes || data.quotes.length === 0) return;
            const quoteText = document.querySelector('.quote-text');
            const quoteAuthor = document.querySelector('.quote-author');
            if (!quoteText || !quoteAuthor) return;

            const today = new Date().toDateString();
            const savedQuoteDate = SafeStorage.getItem('ora_quote_date');
            let quoteIndex;

            if (savedQuoteDate === today && SafeStorage.getItem('ora_quote_index') !== null) {
                quoteIndex = parseInt(SafeStorage.getItem('ora_quote_index'));
            } else {
                quoteIndex = Math.floor(Math.random() * data.quotes.length);
                SafeStorage.setItem('ora_quote_date', today);
                SafeStorage.setItem('ora_quote_index', quoteIndex.toString());
            }

            const quote = data.quotes[quoteIndex] || data.quotes[0];
            quoteText.textContent = `"${quote.text}"`;
            quoteAuthor.textContent = quote.author;
        } catch (e) {
            console.error('[Ora] Error in setQuote:', e);
        }
    }
    setQuote();

    function setGreeting() {
        try {
            if (!data.greetings || data.greetings.length === 0) return;
            const greetingEl = document.querySelector('.greeting');
            if (!greetingEl) return;

            const today = new Date().toDateString();
            const savedGreetingDate = SafeStorage.getItem('ora_greeting_date');
            let greetingIndex;

            if (savedGreetingDate === today && SafeStorage.getItem('ora_greeting_index') !== null) {
                greetingIndex = parseInt(SafeStorage.getItem('ora_greeting_index'));
            } else {
                greetingIndex = Math.floor(Math.random() * data.greetings.length);
                SafeStorage.setItem('ora_greeting_date', today);
                SafeStorage.setItem('ora_greeting_index', greetingIndex.toString());
            }

            greetingEl.textContent = data.greetings[greetingIndex] || data.greetings[0];
        } catch (e) {
            console.error('[Ora] Error in setGreeting:', e);
        }
    }
    setGreeting();

    // ============================================================
    // 3. Music Library & Player Logic
    // ============================================================

    // --- TOAST SYSTEM ---
    const toastContainer = document.getElementById('toast-container');

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let iconName = 'ph-check-circle';
        if (type === 'error') iconName = 'ph-warning-circle';
        if (type === 'info') iconName = 'ph-info';

        toast.innerHTML = `
            <i class="ph ${iconName}" style="font-size: 1.5rem;"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }

    // --- State ---
    const defaultPlaylists = data.defaultPlaylists;

    let userPlaylists = [];
    try {
        const stored = SafeStorage.getItem('ora_user_playlists');
        userPlaylists = stored ? JSON.parse(stored) : [];
    } catch (e) {
        userPlaylists = [];
    }

    let activePlayer = null;
    let isPlayerMinimized = false;
    let currentPlaylistUrl = '';
    let currentPlaylistIndex = -1;
    let allPlaylists = [];

    // --- DOM Elements ---
    const btnMusic = document.getElementById('btn-music');
    const musicLibrary = document.getElementById('music-library');
    const closeLibraryBtn = document.getElementById('close-library-btn');
    const playlistGrid = document.getElementById('playlist-grid');
    const playlistInput = document.getElementById('playlist-input');
    const addPlaylistBtn = document.getElementById('add-playlist-btn');

    const miniPlayer = document.getElementById('mini-player');
    const closePlayerBtn = document.getElementById('close-player-btn');
    const minimizePlayerBtn = document.getElementById('minimize-player-btn');
    const openExternalBtn = document.getElementById('open-external-btn');
    const nowPlayingText = document.getElementById('now-playing-text');
    const ytIframe = document.getElementById('youtube-iframe');
    const spIframe = document.getElementById('spotify-iframe');
    const iframeContainer = document.getElementById('iframe-container');

    // --- Toggle Library ---
    btnMusic.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = musicLibrary.style.display === 'none';
        musicLibrary.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) renderPlaylists();
    });

    closeLibraryBtn.addEventListener('click', () => {
        musicLibrary.style.display = 'none';
    });

    // Close Library on Click Outside
    document.addEventListener('click', (e) => {
        if (musicLibrary.style.display === 'flex' &&
            !musicLibrary.contains(e.target) &&
            e.target !== btnMusic &&
            !btnMusic.contains(e.target)) {
            musicLibrary.style.display = 'none';
        }
    });

    // --- Mini Player Controls ---
    closePlayerBtn.addEventListener('click', () => {
        miniPlayer.style.display = 'none';
        stopPlayback();
        isPlayerMinimized = false;
    });

    minimizePlayerBtn.addEventListener('click', () => {
        isPlayerMinimized = !isPlayerMinimized;

        if (isPlayerMinimized) {
            iframeContainer.style.display = 'none';
            miniPlayer.classList.add('minimized');
            minimizePlayerBtn.querySelector('i').classList.remove('ph-caret-down');
            minimizePlayerBtn.querySelector('i').classList.add('ph-caret-up');
        } else {
            iframeContainer.style.display = 'block';
            miniPlayer.classList.remove('minimized');
            minimizePlayerBtn.querySelector('i').classList.remove('ph-caret-up');
            minimizePlayerBtn.querySelector('i').classList.add('ph-caret-down');
        }
    });

    openExternalBtn.addEventListener('click', () => {
        if (currentPlaylistUrl) {
            window.open(currentPlaylistUrl, '_blank');
        }
    });

    // --- Playback ---
    function stopPlayback() {
        ytIframe.src = '';
        ytIframe.style.display = 'none';
        spIframe.src = '';
        spIframe.style.display = 'none';
        activePlayer = null;
        currentPlaylistUrl = '';
        currentPlaylistIndex = -1;
    }

    // --- Metadata Fetching ---
    async function fetchMetadata(playlist, cardElement) {
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

            const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
            const fetchedData = await response.json();

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
                        ${!playlist.id.startsWith('def-') ? '<button class="delete-btn" title="Remover"><i class="ph ph-trash"></i></button>' : ''}
                    `;
                    const newDelBtn = coverEl.querySelector('.delete-btn');
                    if (newDelBtn) {
                        newDelBtn.onclick = (e) => {
                            e.stopPropagation();
                            removePlaylist(playlist.id);
                        };
                    }
                }
            }
        } catch (error) {
            console.warn(`Não foi possível carregar dados para ${playlist.title}:`, error);
            const coverEl = cardElement.querySelector('.playlist-cover');
            if (coverEl) coverEl.classList.remove('loading');
        }
    }

    // --- Render Playlists ---
    function renderPlaylists() {
        playlistGrid.innerHTML = '';
        allPlaylists = [...defaultPlaylists, ...userPlaylists];

        allPlaylists.forEach((playlist) => {
            const card = document.createElement('div');
            card.className = 'playlist-card';

            let coverHtml;
            if (playlist.source === 'youtube' && playlist.idType !== 'playlist' && playlist.externalId) {
                const thumbUrl = `https://img.youtube.com/vi/${playlist.externalId}/mqdefault.jpg`;
                coverHtml = `<img src="${thumbUrl}" loading="lazy" alt="${playlist.title}" onerror="this.onerror=null; this.parentNode.innerHTML='<i class=\\'ph ph-youtube-logo\\'></i>'">`;
            } else {
                let iconClass = playlist.icon || (playlist.source === 'spotify' ? 'ph-spotify-logo' : 'ph-youtube-logo');
                coverHtml = `<i class="ph ${iconClass}"></i>`;
            }

            let deleteBtnHtml = '';
            if (!playlist.id.startsWith('def-')) {
                deleteBtnHtml = `<button class="delete-btn" title="Remover"><i class="ph ph-trash"></i></button>`;
            }

            card.innerHTML = `
                <div class="playlist-cover">
                    ${coverHtml}
                    ${deleteBtnHtml}
                </div>
                <div class="playlist-info">
                    <div class="playlist-title" title="${playlist.title}">${playlist.title}</div>
                    <div class="playlist-source">
                        <i class="ph ${playlist.source === 'spotify' ? 'ph-spotify-logo' : 'ph-youtube-logo'}"></i>
                        ${playlist.source === 'youtube' ? 'YouTube' : 'Spotify'}
                    </div>
                </div>
            `;

            card.onclick = (e) => {
                if (e.target.closest('.delete-btn')) return;
                playPlaylist(playlist);
                musicLibrary.style.display = 'none';
            };

            const delBtnEl = card.querySelector('.delete-btn');
            if (delBtnEl) {
                delBtnEl.onclick = (e) => {
                    e.stopPropagation();
                    removePlaylist(playlist.id);
                };
            }

            playlistGrid.appendChild(card);

            if (playlist.source === 'spotify' || playlist.idType === 'playlist') {
                fetchMetadata(playlist, card);
            }
        });
    }

    // --- ADD PLAYLIST (+ button) ---
    addPlaylistBtn.addEventListener('click', () => {
        const input = playlistInput.value.trim();

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
            userPlaylists.push(newPlaylist);
            SafeStorage.setItem('ora_user_playlists', JSON.stringify(userPlaylists));
            playlistInput.value = '';
            renderPlaylists();

            if (newPlaylist.idType === 'playlist') {
                showToast('Playlist adicionada!', 'success');
            } else {
                showToast('Música adicionada!', 'success');
            }
        } else {
            showToast('Não foi possível encontrar o vídeo/playlist.', 'error');
        }
    });

    // Also allow Enter key in input
    playlistInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addPlaylistBtn.click();
        }
    });

    // --- Remove Playlist ---
    function removePlaylist(id) {
        userPlaylists = userPlaylists.filter((p) => p.id !== id);
        SafeStorage.setItem('ora_user_playlists', JSON.stringify(userPlaylists));
        renderPlaylists();
        showToast('Removido com sucesso.', 'info');
    }

    // --- Play Logic ---
    // RELAY PAGE URL — Hospedar no GitHub Pages para resolver Erro 153/152
    const RELAY_URL = 'https://arthurdouradodev.github.io/ora-player-relay/';

    function playPlaylist(playlist) {
        miniPlayer.style.display = 'flex';
        nowPlayingText.textContent = playlist.title;

        if (isPlayerMinimized) {
            isPlayerMinimized = false;
            iframeContainer.style.display = 'block';
            miniPlayer.classList.remove('minimized');
            minimizePlayerBtn.querySelector('i').classList.remove('ph-caret-up');
            minimizePlayerBtn.querySelector('i').classList.add('ph-caret-down');
        }

        if (playlist.source === 'youtube') {
            spIframe.style.display = 'none';
            spIframe.src = '';
            ytIframe.style.display = 'block';

            const src = `${RELAY_URL}?source=youtube&type=${playlist.idType}&id=${playlist.externalId}`;

            if (playlist.idType === 'playlist') {
                currentPlaylistUrl = `https://www.youtube.com/playlist?list=${playlist.externalId}`;
            } else {
                currentPlaylistUrl = `https://www.youtube.com/watch?v=${playlist.externalId}`;
            }

            ytIframe.src = src;
            activePlayer = 'youtube';

        } else if (playlist.source === 'spotify') {
            ytIframe.style.display = 'none';
            ytIframe.src = '';
            spIframe.style.display = 'block';

            const src = `${RELAY_URL}?source=spotify&type=${playlist.idType}&id=${playlist.externalId}`;
            spIframe.src = src;
            currentPlaylistUrl = `https://open.spotify.com/${playlist.idType}/${playlist.externalId}`;
            activePlayer = 'spotify';
        }
    }

    // ============================================================
    // 4. PRAYER SYSTEM
    // ============================================================

    const prayers = data.prayers;
    console.log('[Ora] Prayers loaded:', prayers.length);

    // DOM Elements - Prayer System
    const btnPrayers = document.getElementById('btn-prayers');
    const prayerList = document.getElementById('prayer-list');
    const closePrayerListBtn = document.getElementById('close-prayer-list-btn');
    const prayerGrid = document.getElementById('prayer-grid');

    const prayerReader = document.getElementById('prayer-reader');
    const closePrayerReaderBtn = document.getElementById('close-prayer-reader-btn');
    const backToListBtn = document.getElementById('back-to-list-btn');
    const prayerReaderTitle = document.getElementById('prayer-reader-title');
    const prayerTextContent = document.getElementById('prayer-text');
    const langBtns = document.querySelectorAll('.lang-btn');

    let currentPrayer = null;
    let currentLang = 'pt';

    // --- Functions ---

    function openPrayerList() {
        renderPrayerGrid();
        prayerList.style.display = 'flex';
    }

    function closePrayerList() {
        prayerList.style.display = 'none';
    }

    function openPrayerReader(prayer) {
        currentPrayer = prayer;
        currentLang = 'pt';
        updatePrayerReader();
        
        prayerList.style.display = 'none';
        prayerReader.style.display = 'flex';
    }

    function closePrayerReader() {
        prayerReader.style.display = 'none';
        currentPrayer = null;
    }

    function updatePrayerReader() {
        if (!currentPrayer) return;
        
        prayerReaderTitle.textContent = currentPrayer.title;
        prayerTextContent.textContent = currentPrayer.text[currentLang];
        
        langBtns.forEach(btn => {
            if (btn.dataset.lang === currentLang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function renderPrayerGrid() {
        prayerGrid.innerHTML = '';
        prayers.forEach(prayer => {
            const card = document.createElement('div');
            card.className = 'prayer-card';
            card.innerHTML = `
                <div class="prayer-card-icon">
                    <i class="ph ${prayer.icon}"></i>
                </div>
                <div class="prayer-card-title">${prayer.title}</div>
                <i class="ph ph-caret-right prayer-card-arrow"></i>
            `;
            
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                openPrayerReader(prayer);
            });
            prayerGrid.appendChild(card);
        });
    }

    // --- Event Listeners ---

    if (btnPrayers) {
        btnPrayers.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = prayerList.style.display === 'none';
            if (isHidden) {
                openPrayerList();
            } else {
                closePrayerList();
            }
        });

        // Close modals on click outside
        document.addEventListener('click', (e) => {
            if (prayerList.style.display === 'flex' && 
                !prayerList.contains(e.target) && 
                !btnPrayers.contains(e.target)) {
                closePrayerList();
            }

            if (prayerReader.style.display === 'flex' && 
                !prayerReader.contains(e.target)) {
                closePrayerReader();
            }
        });
    }

    if (closePrayerListBtn) closePrayerListBtn.addEventListener('click', closePrayerList);

    if (closePrayerReaderBtn) closePrayerReaderBtn.addEventListener('click', closePrayerReader);

    if (backToListBtn) {
        backToListBtn.addEventListener('click', () => {
            closePrayerReader();
            openPrayerList();
        });
    }

    // Language Toggle
    langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            currentLang = lang;
            updatePrayerReader();
        });
    });

    // ============================================================
    // 5. ANGELUS REMINDER
    // ============================================================

    const angelusReminder = document.getElementById('angelus-reminder');
    const openAngelusBtn = document.getElementById('open-angelus-btn');
    const checkAngelusBtn = document.getElementById('check-angelus-btn');
    const angelusPrayerId = 'angelus'; 

    function checkAngelusTime() {
        const now = new Date();
        const hours = now.getHours();
        
        const todayStr = new Date().toDateString();
        const doneToday = SafeStorage.getItem('angelus_done_' + todayStr);

        if (hours === 12 && !doneToday) {
            showAngelusReminder();
            
            try {
                if ('Notification' in window && Notification.permission === 'granted') {
                    const notifSent = SafeStorage.getItem('angelus_notif_' + todayStr);
                    if (!notifSent) {
                        new Notification('Hora do Angelus', {
                            body: 'O Anjo do Senhor anunciou a Maria...',
                            icon: 'icon.png'
                        });
                        SafeStorage.setItem('angelus_notif_' + todayStr, 'true');
                    }
                }
            } catch (e) {
                console.warn('[Ora] Notification error:', e);
            }
        } else {
            hideAngelusReminder();
        }
    }

    function showAngelusReminder() {
        if (angelusReminder) angelusReminder.style.display = 'flex';
    }

    function hideAngelusReminder() {
        if (angelusReminder) angelusReminder.style.display = 'none';
    }

    // Actions
    if (openAngelusBtn) {
        openAngelusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const angelusPrayer = prayers.find(p => p.id === angelusPrayerId);
            if (angelusPrayer) {
                openPrayerReader(angelusPrayer);
            }
        });
    }

    if (checkAngelusBtn) {
        checkAngelusBtn.addEventListener('click', () => {
            const todayStr = new Date().toDateString();
            SafeStorage.setItem('angelus_done_' + todayStr, 'true');
            
            hideAngelusReminder();
            showToast('Angelus rezado!', 'success');
        });
    }

    // Request Notification Permission on load
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    // Check every minute
    setInterval(checkAngelusTime, 60000);
    checkAngelusTime();
    console.log('[Ora] App fully initialized');

    // ============================================================
    // 6. INTENTION INPUT PERSISTENCE
    // ============================================================

    const intentionInput = document.getElementById('intention-input');

    if (intentionInput) {
        const savedIntention = SafeStorage.getItem('ora_intention');
        if (savedIntention) {
            intentionInput.value = savedIntention;
        }

        intentionInput.addEventListener('input', (e) => {
            const value = e.target.value;
            SafeStorage.setItem('ora_intention', value);
        });

        window.addEventListener('storage', (e) => {
            if (e.key === 'ora_intention') {
                intentionInput.value = e.newValue || '';
            }
        });
    }
}

// Start the app
initApp();
