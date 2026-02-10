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

    // ============================================================
    // 7. FOCUS TIMER (POMODORO)
    // ============================================================

    // --- Settings ---
    let focusSettings = { focus: 25, pause: 5, longPause: 15 };
    try {
        const savedSettings = SafeStorage.getItem('ora_focus_settings');
        if (savedSettings) focusSettings = JSON.parse(savedSettings);
    } catch (e) { /* use defaults */ }

    // --- State ---
    let focusPhase = 'focus'; // 'focus', 'pause', 'longPause'
    let pomodoroCount = 0;
    let timeRemaining = focusSettings.focus * 60;
    let totalDuration = focusSettings.focus * 60;
    let timerInterval = null;
    let isTimerRunning = false;
    let isFocusMiniMinimized = false;
    let focusMode = 'compact'; // 'compact' or 'fullscreen'

    // Total focus today
    const todayKey = 'ora_focus_total_' + new Date().toDateString();
    let totalFocusSeconds = parseInt(SafeStorage.getItem(todayKey)) || 0;

    // --- DOM Elements ---
    const btnFocus = document.getElementById('btn-focus');
    const focusMini = document.getElementById('focus-mini');
    const focusMiniPhase = focusMini.querySelector('.focus-mini-phase');
    const focusMiniTimer = focusMini.querySelector('.focus-mini-timer');
    const focusMiniTotal = focusMini.querySelector('.focus-mini-total');
    const focusMiniDots = focusMini.querySelector('.focus-mini-dots');
    const focusMiniPlayBtn = document.getElementById('focus-mini-play');
    const focusMiniSkipBtn = document.getElementById('focus-mini-skip');
    const focusMiniResetBtn = document.getElementById('focus-mini-reset');
    const focusMiniExpandBtn = document.getElementById('focus-mini-expand');
    const focusMiniMinimizeBtn = document.getElementById('focus-mini-minimize');
    const focusMiniCloseBtn = document.getElementById('focus-mini-close');

    const focusFullscreen = document.getElementById('focus-fullscreen');
    const focusFsPhase = focusFullscreen.querySelector('.focus-fs-phase');
    const focusFsTimer = focusFullscreen.querySelector('.focus-fs-timer');
    const focusFsTotal = focusFullscreen.querySelector('.focus-fs-total');
    const focusFsDots = focusFullscreen.querySelector('.focus-fs-dots');
    const focusRingProgress = focusFullscreen.querySelector('.focus-ring-progress');
    const focusFsPlayBtn = document.getElementById('focus-fs-play');
    const focusFsSkipBtn = document.getElementById('focus-fs-skip');
    const focusFsResetBtn = document.getElementById('focus-fs-reset');
    const focusFsCollapseBtn = document.getElementById('focus-fs-collapse');
    const focusFsSettingsBtn = document.getElementById('focus-fs-settings-btn');
    const focusSettingsPanel = document.getElementById('focus-settings');

    const settingFocusInput = document.getElementById('setting-focus');
    const settingPauseInput = document.getElementById('setting-pause');
    const settingLongPauseInput = document.getElementById('setting-long-pause');

    // SVG ring circumference
    const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ~565.48

    // --- Helper Functions ---

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function formatTotalFocus(seconds) {
        if (seconds < 60) return `${seconds}s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    function getPhaseLabel(phase) {
        if (phase === 'focus') return 'Foco';
        if (phase === 'pause') return 'Pausa';
        if (phase === 'longPause') return 'Pausa Longa';
        return 'Foco';
    }

    function getPhaseDuration(phase) {
        if (phase === 'focus') return focusSettings.focus * 60;
        if (phase === 'pause') return focusSettings.pause * 60;
        if (phase === 'longPause') return focusSettings.longPause * 60;
        return focusSettings.focus * 60;
    }

    function playTone() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 528;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.5);
        } catch (e) { /* audio not available */ }
    }

    // --- Update Display ---

    function updateFocusDisplay() {
        const timeStr = formatTime(timeRemaining);
        const label = getPhaseLabel(focusPhase);
        const totalStr = formatTotalFocus(totalFocusSeconds);
        const playIcon = isTimerRunning ? 'ph-pause' : 'ph-play';

        // Update compact modal
        focusMiniTimer.textContent = timeStr;
        focusMiniPhase.textContent = label;
        focusMiniTotal.innerHTML = `<i class="ph ph-fire"></i> Total: ${totalStr}`;
        focusMiniPlayBtn.innerHTML = `<i class="ph ${playIcon}"></i>`;

        // Update fullscreen
        focusFsTimer.textContent = timeStr;
        focusFsPhase.textContent = label;
        focusFsTotal.innerHTML = `<i class="ph ph-fire"></i> Total hoje: ${totalStr}`;
        focusFsPlayBtn.innerHTML = `<i class="ph ${playIcon}"></i>`;

        // Update SVG ring
        const progress = totalDuration > 0 ? timeRemaining / totalDuration : 1;
        const offset = RING_CIRCUMFERENCE * (1 - progress);
        focusRingProgress.style.strokeDashoffset = offset;

        // Phase color classes
        focusMini.classList.remove('focus-phase-pause', 'focus-phase-longPause');
        focusFullscreen.classList.remove('focus-phase-pause', 'focus-phase-longPause');
        if (focusPhase === 'pause') {
            focusMini.classList.add('focus-phase-pause');
            focusFullscreen.classList.add('focus-phase-pause');
        } else if (focusPhase === 'longPause') {
            focusMini.classList.add('focus-phase-longPause');
            focusFullscreen.classList.add('focus-phase-longPause');
        }

        // Dots
        renderDots(focusMiniDots);
        renderDots(focusFsDots);
    }

    function renderDots(container) {
        container.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('div');
            dot.className = 'focus-dot';
            if (i < pomodoroCount % 4) {
                dot.classList.add('completed');
            } else if (i === pomodoroCount % 4 && focusPhase === 'focus') {
                dot.classList.add('active');
            }
            container.appendChild(dot);
        }
    }

    // --- Timer Logic ---

    function startTimer() {
        if (timerInterval) return;
        isTimerRunning = true;
        timerInterval = setInterval(() => {
            timeRemaining--;

            if (focusPhase === 'focus') {
                totalFocusSeconds++;
                SafeStorage.setItem(todayKey, totalFocusSeconds.toString());
            }

            updateFocusDisplay();

            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                isTimerRunning = false;
                playTone();
                advancePhase();
            }
        }, 1000);
        updateFocusDisplay();
    }

    function pauseTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        isTimerRunning = false;
        updateFocusDisplay();
    }

    function toggleTimer() {
        if (isTimerRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    }

    function resetTimer() {
        pauseTimer();
        timeRemaining = getPhaseDuration(focusPhase);
        totalDuration = timeRemaining;
        updateFocusDisplay();
    }

    function advancePhase() {
        if (focusPhase === 'focus') {
            pomodoroCount++;
            if (pomodoroCount % 4 === 0) {
                focusPhase = 'longPause';
            } else {
                focusPhase = 'pause';
            }
        } else {
            focusPhase = 'focus';
        }

        timeRemaining = getPhaseDuration(focusPhase);
        totalDuration = timeRemaining;
        updateFocusDisplay();

        // Auto-start next phase
        startTimer();
    }

    function skipPhase() {
        pauseTimer();
        if (focusPhase === 'focus') {
            pomodoroCount++;
            if (pomodoroCount % 4 === 0) {
                focusPhase = 'longPause';
            } else {
                focusPhase = 'pause';
            }
        } else {
            focusPhase = 'focus';
        }
        timeRemaining = getPhaseDuration(focusPhase);
        totalDuration = timeRemaining;
        updateFocusDisplay();
    }

    // --- Mode Switching ---

    function showCompact() {
        focusMode = 'compact';
        focusMini.style.display = 'flex';
        focusFullscreen.style.display = 'none';
        focusSettingsPanel.style.display = 'none';
        updateFocusDisplay();
    }

    function showFullscreen() {
        focusMode = 'fullscreen';
        focusMini.style.display = 'none';
        focusFullscreen.style.display = 'flex';
        updateFocusDisplay();
    }

    function closeFocusTimer() {
        pauseTimer();
        focusMini.style.display = 'none';
        focusFullscreen.style.display = 'none';
        focusSettingsPanel.style.display = 'none';
        isFocusMiniMinimized = false;
        focusMini.classList.remove('minimized');
    }

    // --- Settings ---

    function loadSettingsUI() {
        settingFocusInput.value = focusSettings.focus;
        settingPauseInput.value = focusSettings.pause;
        settingLongPauseInput.value = focusSettings.longPause;
    }

    function saveSettings() {
        const f = parseInt(settingFocusInput.value) || 25;
        const p = parseInt(settingPauseInput.value) || 5;
        const lp = parseInt(settingLongPauseInput.value) || 15;

        focusSettings = {
            focus: Math.max(1, Math.min(120, f)),
            pause: Math.max(1, Math.min(30, p)),
            longPause: Math.max(1, Math.min(60, lp))
        };

        SafeStorage.setItem('ora_focus_settings', JSON.stringify(focusSettings));

        // If timer is not running, update the current phase duration
        if (!isTimerRunning) {
            timeRemaining = getPhaseDuration(focusPhase);
            totalDuration = timeRemaining;
            updateFocusDisplay();
        }
    }

    // --- Event Listeners ---

    // Open timer
    if (btnFocus) {
        btnFocus.addEventListener('click', (e) => {
            e.stopPropagation();
            if (focusMini.style.display === 'none' && focusFullscreen.style.display === 'none') {
                showCompact();
            } else if (focusMini.style.display !== 'none') {
                focusMini.style.display = 'none';
            } else {
                focusFullscreen.style.display = 'none';
                focusSettingsPanel.style.display = 'none';
            }
        });
    }

    // Compact controls
    focusMiniPlayBtn.addEventListener('click', toggleTimer);
    focusMiniSkipBtn.addEventListener('click', skipPhase);
    focusMiniResetBtn.addEventListener('click', resetTimer);

    focusMiniExpandBtn.addEventListener('click', showFullscreen);
    focusMiniCloseBtn.addEventListener('click', closeFocusTimer);

    focusMiniMinimizeBtn.addEventListener('click', () => {
        isFocusMiniMinimized = !isFocusMiniMinimized;
        if (isFocusMiniMinimized) {
            focusMini.classList.add('minimized');
            focusMiniMinimizeBtn.querySelector('i').classList.remove('ph-caret-down');
            focusMiniMinimizeBtn.querySelector('i').classList.add('ph-caret-up');
        } else {
            focusMini.classList.remove('minimized');
            focusMiniMinimizeBtn.querySelector('i').classList.remove('ph-caret-up');
            focusMiniMinimizeBtn.querySelector('i').classList.add('ph-caret-down');
        }
    });

    // Fullscreen controls
    focusFsPlayBtn.addEventListener('click', toggleTimer);
    focusFsSkipBtn.addEventListener('click', skipPhase);
    focusFsResetBtn.addEventListener('click', resetTimer);
    focusFsCollapseBtn.addEventListener('click', showCompact);

    // Settings toggle
    focusFsSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = focusSettingsPanel.style.display === 'none';
        focusSettingsPanel.style.display = isHidden ? 'flex' : 'none';
    });

    // Settings input change
    [settingFocusInput, settingPauseInput, settingLongPauseInput].forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Close settings on click outside
    focusFullscreen.addEventListener('click', (e) => {
        if (focusSettingsPanel.style.display !== 'none' &&
            !focusSettingsPanel.contains(e.target) &&
            !focusFsSettingsBtn.contains(e.target)) {
            focusSettingsPanel.style.display = 'none';
        }
    });

    // Initialize
    loadSettingsUI();
    updateFocusDisplay();
    console.log('[Ora] Focus Timer initialized');

    // ============================================================
    // 8. ROSARY (TERÇO)
    // ============================================================

    const rosaryData = data.rosary;
    const rosaryStructure = rosaryData.structure;
    const rosaryMysteries = rosaryData.mysteries;
    const rosaryExtraPrayers = rosaryData.extraPrayers;

    // --- DOM Elements ---
    const btnRosary = document.getElementById('btn-rosary');
    const rosaryModal = document.getElementById('rosary-modal');
    const rosaryModalTitle = document.getElementById('rosary-modal-title');
    const closeRosaryBtn = document.getElementById('close-rosary-btn');
    const rosaryBeadsContainer = rosaryModal.querySelector('.rosary-beads-container');
    const rosaryMysteryName = rosaryModal.querySelector('.rosary-mystery-name');
    const rosaryPrayerTitle = rosaryModal.querySelector('.rosary-prayer-title');
    const rosaryPrayerText = rosaryModal.querySelector('.rosary-prayer-text');
    const rosaryCounter = rosaryModal.querySelector('.rosary-counter');
    const rosaryPrevBtn = document.getElementById('rosary-prev');
    const rosaryNextBtn = document.getElementById('rosary-next');
    const rosaryMysteryBtns = rosaryModal.querySelectorAll('.rosary-mystery-btn');
    const rosaryChapletBtns = rosaryModal.querySelectorAll('.rosary-chaplet-btn');

    const rosaryLangBtns = rosaryModal.querySelectorAll('.lang-toggle-rosary .lang-btn');

    // --- State ---
    let rosaryCurrentBead = 0;
    let rosaryMystery = 'gozosos';
    let chapletType = 'terco'; // 'terco' or 'misericordia'
    let rosaryLang = 'pt';

    // Load saved progress
    try {
        const saved = SafeStorage.getItem('ora_rosary_progress');
        if (saved) {
            const parsed = JSON.parse(saved);
            rosaryCurrentBead = parsed.bead || 0;
            rosaryMystery = parsed.mystery || 'gozosos';
            chapletType = parsed.chapletType || 'terco';
            rosaryLang = parsed.lang || 'pt'; // Load saved language
        }
    } catch (e) { /* use defaults */ }

    // --- Misericórdia: which beads are disabled ---
    // In misericordia mode: intro beads 4,5,6 (2nd/3rd Ave Maria + Gloria) are unused
    // Also all gloria and fatima beads in decades are unused
    function isBeadDisabled(index) {
        if (chapletType !== 'misericordia') return false;
        const bead = rosaryStructure[index];
        // Intro unused beads (indices 4, 5, 6)
        if (bead.decade === 0 && (index === 4 || index === 5 || index === 6)) return true;
        // Gloria and Fatima in decades 1-5
        if (bead.decade >= 1 && bead.decade <= 5 && (bead.type === 'gloria' || bead.type === 'fatima')) return true;
        return false;
    }

    // --- Misericórdia prayer mapping ---
    // Intro: bead 0 = Sinal da Cruz, bead 1 = Pai Nosso, bead 2 = Ave Maria, bead 3 = Credo
    // Decades: pai-nosso → Pai Eterno, ave-maria → Dolorosa Paixão
    // End: salve-rainha → Santo Deus (×3)
    function getMisericordiaPrayerText(bead, index) {
        // Intro beads
        if (bead.decade === 0) {
            if (index === 0) return { title: 'Sinal da Cruz', text: rosaryExtraPrayers['sinal-cruz'].pt };
            if (index === 1) {
                const p = prayers.find(pr => pr.id === 'pai-nosso');
                return { title: 'Pai Nosso', text: p ? p.text.pt : '' };
            }
            if (index === 2) {
                const p = prayers.find(pr => pr.id === 'ave-maria');
                return { title: 'Ave Maria', text: p ? p.text.pt : '' };
            }
            if (index === 3) {
                const p = prayers.find(pr => pr.id === 'credo');
                return { title: 'Credo', text: p ? p.text.pt : '' };
            }
            // Last bead (Salve Rainha position → Santo Deus)
            if (bead.type === 'salve-rainha') {
                return { title: 'Santo Deus (×3)', text: rosaryExtraPrayers['santo-deus'][rosaryLang] };
            }
        }
        // Decade beads
        if (bead.decade >= 1 && bead.decade <= 5) {
            if (bead.type === 'pai-nosso') {
                return { title: 'Pai Eterno', text: rosaryExtraPrayers['pai-eterno'][rosaryLang] };
            }
            if (bead.type === 'ave-maria') {
                const title = rosaryLang === 'pt' ? bead.label.replace('Ave Maria', 'Pela Sua Dolorosa Paixão') : 'Pro dolorosa Eius Passione';
                return { title: title, text: rosaryExtraPrayers['dolorosa-paixao'][rosaryLang] };
            }
        }
        // End bead
        if (bead.type === 'salve-rainha') {
            return { title: 'Santo Deus (×3)', text: rosaryExtraPrayers['santo-deus'][rosaryLang] };
        }
        return { title: bead.label, text: '' };
    }

    // --- Helper: Get prayer text for a bead ---
    function getRosaryPrayerText(bead, index) {
        // Use misericordia mapping if in that mode
        if (chapletType === 'misericordia') {
            return getMisericordiaPrayerText(bead, index);
        }

        // Check extra prayers first (sinal-cruz, fatima)
        if (rosaryExtraPrayers[bead.type] && (bead.type === 'sinal-cruz' || bead.type === 'fatima')) {
            return {
                title: bead.label,
                text: rosaryExtraPrayers[bead.type][rosaryLang]
            };
        }

        // Map bead type to prayer ID
        const typeToId = {
            'pai-nosso': 'pai-nosso',
            'ave-maria': 'ave-maria',
            'gloria': 'gloria',
            'credo': 'credo',
            'salve-rainha': 'salve-rainha'
        };

        const prayerId = typeToId[bead.type];
        if (prayerId) {
            const prayer = prayers.find(p => p.id === prayerId);
            if (prayer) {
                return {
                    title: bead.label,
                    text: prayer.text[rosaryLang]
                };
            }
        }

        return { title: bead.label, text: '' };
    }

    // --- Render Beads ---
    function renderRosaryBeads() {
        rosaryBeadsContainer.innerHTML = '';
        let lastDecade = -1;

        rosaryStructure.forEach((bead, index) => {
            // Add separator between decades
            if (bead.decade !== lastDecade && lastDecade !== -1) {
                const sep = document.createElement('div');
                sep.className = 'rosary-bead-separator';
                rosaryBeadsContainer.appendChild(sep);
            }
            lastDecade = bead.decade;

            const beadEl = document.createElement('div');
            beadEl.className = 'rosary-bead';

            const disabled = isBeadDisabled(index);

            // Larger beads for special prayers
            if (['pai-nosso', 'credo', 'salve-rainha', 'sinal-cruz'].includes(bead.type)) {
                beadEl.classList.add('bead-large');
            }

            if (disabled) {
                beadEl.classList.add('disabled');
            } else {
                // Mark visited beads (only non-disabled)
                if (index < rosaryCurrentBead) {
                    beadEl.classList.add('visited');
                }

                // Mark active bead
                if (index === rosaryCurrentBead) {
                    beadEl.classList.add('active');
                }

                // Click to navigate (with stopPropagation to prevent modal close)
                beadEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    rosaryGoTo(index);
                });
            }

            beadEl.title = disabled ? '' : bead.label;
            rosaryBeadsContainer.appendChild(beadEl);
        });

        // Scroll to active bead
        scrollToActiveBead();
    }

    // --- Scroll to Active Bead ---
    function scrollToActiveBead() {
        const activeBead = rosaryBeadsContainer.querySelector('.rosary-bead.active');
        if (activeBead) {
            const containerRect = rosaryBeadsContainer.getBoundingClientRect();
            const beadRect = activeBead.getBoundingClientRect();
            const scrollLeft = rosaryBeadsContainer.scrollLeft;
            const targetScroll = scrollLeft + (beadRect.left - containerRect.left) - (containerRect.width / 2) + (beadRect.width / 2);
            rosaryBeadsContainer.scrollTo({ left: targetScroll, behavior: 'smooth' });
        }
    }

    // --- Update Display ---
    function updateRosaryDisplay() {
        const bead = rosaryStructure[rosaryCurrentBead];
        if (!bead) return;

        // Prayer text
        const prayerInfo = getRosaryPrayerText(bead, rosaryCurrentBead);
        rosaryPrayerTitle.textContent = prayerInfo.title;
        rosaryPrayerText.textContent = prayerInfo.text;

        // Mystery name (only for terco mode, decades 1-5)
        if (chapletType === 'terco' && bead.decade >= 1 && bead.decade <= 5) {
            const mysteries = rosaryMysteries[rosaryMystery];
            rosaryMysteryName.textContent = `${bead.decade}º Mistério: ${mysteries[bead.decade - 1]}`;
        } else if (chapletType === 'misericordia' && bead.decade >= 1 && bead.decade <= 5) {
            rosaryMysteryName.textContent = `${bead.decade}ª Dezena`;
        } else {
            rosaryMysteryName.textContent = '';
        }

        // Counter (count only active beads in misericordia)
        rosaryCounter.textContent = `${rosaryCurrentBead + 1} / ${rosaryStructure.length}`;

        // Update mystery selector buttons
        rosaryMysteryBtns.forEach(btn => {
            if (btn.dataset.mystery === rosaryMystery) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update chaplet selector buttons
        rosaryChapletBtns.forEach(btn => {
            if (btn.dataset.chaplet === chapletType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update language buttons
        rosaryLangBtns.forEach(btn => {
            if (btn.dataset.lang === rosaryLang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle mystery selector visibility
        if (chapletType === 'misericordia') {
            rosaryModal.classList.add('mode-misericordia');
            rosaryModalTitle.textContent = 'Terço da Misericórdia';
        } else {
            rosaryModal.classList.remove('mode-misericordia');
            rosaryModalTitle.textContent = 'Santo Terço';
        }

        // Re-render beads for visual update
        renderRosaryBeads();

        // Save progress
        saveRosaryProgress();
    }

    // --- Navigation (skips disabled beads) ---
    function rosaryGoTo(index) {
        if (index < 0) index = 0;
        if (index >= rosaryStructure.length) index = rosaryStructure.length - 1;
        rosaryCurrentBead = index;
        updateRosaryDisplay();
    }

    function findNextActiveBead(from, direction) {
        let i = from + direction;
        while (i >= 0 && i < rosaryStructure.length) {
            if (!isBeadDisabled(i)) return i;
            i += direction;
        }
        return from; // stay if no active bead found
    }

    function rosaryNext() {
        const next = findNextActiveBead(rosaryCurrentBead, 1);
        if (next !== rosaryCurrentBead) rosaryGoTo(next);
    }

    function rosaryPrev() {
        const prev = findNextActiveBead(rosaryCurrentBead, -1);
        if (prev !== rosaryCurrentBead) rosaryGoTo(prev);
    }

    // --- Persistence ---
    function saveRosaryProgress() {
        SafeStorage.setItem('ora_rosary_progress', JSON.stringify({
            bead: rosaryCurrentBead,
            mystery: rosaryMystery,
            chapletType: chapletType,
            lang: rosaryLang
        }));
    }

    // --- Open/Close ---
    function openRosary() {
        rosaryModal.style.display = 'flex';
        updateRosaryDisplay();
    }

    function closeRosary() {
        rosaryModal.style.display = 'none';
    }

    // --- Event Listeners ---

    if (btnRosary) {
        btnRosary.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = rosaryModal.style.display === 'none';
            if (isHidden) {
                openRosary();
            } else {
                closeRosary();
            }
        });
    }

    if (closeRosaryBtn) {
        closeRosaryBtn.addEventListener('click', closeRosary);
    }

    // Arrow buttons
    rosaryPrevBtn.addEventListener('click', rosaryPrev);
    rosaryNextBtn.addEventListener('click', rosaryNext);

    // Mystery selector
    rosaryMysteryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            rosaryMystery = btn.dataset.mystery;
            updateRosaryDisplay();
        });
    });

    // Chaplet type selector
    rosaryChapletBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            chapletType = btn.dataset.chaplet;
            // If switching modes, reset to first active bead
            rosaryCurrentBead = 0;
            updateRosaryDisplay();
        });
    });

    // Language selector
    rosaryLangBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            rosaryLang = btn.dataset.lang;
            updateRosaryDisplay();
        });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (rosaryModal.style.display !== 'flex') return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            rosaryNext();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            rosaryPrev();
        }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (rosaryModal.style.display === 'flex' &&
            !rosaryModal.contains(e.target) &&
            !btnRosary.contains(e.target)) {
            closeRosary();
        }
    });

    console.log('[Ora] Rosary (Terço) initialized');
}

// Start the app
initApp();
