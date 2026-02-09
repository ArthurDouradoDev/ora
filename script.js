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

// 2. Imagem de Fundo Dinâmica
const images = [
    "https://images.unsplash.com/photo-1698822079732-501a7e06860f?q=80&w=1920&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?q=80&w=1920&auto=format&fit=crop",
];

function setBackground() {
    try {
        const today = new Date().toDateString();
        const savedDate = SafeStorage.getItem('catholic_dash_date');
        let imageUrl;

        if (savedDate === today && SafeStorage.getItem('catholic_dash_image')) {
            imageUrl = SafeStorage.getItem('catholic_dash_image');
        } else {
            const randomIndex = Math.floor(Math.random() * images.length);
            imageUrl = images[randomIndex];
            SafeStorage.setItem('catholic_dash_date', today);
            SafeStorage.setItem('catholic_dash_image', imageUrl);
        }

        document.body.style.backgroundImage = `url('${imageUrl}')`;
    } catch (e) {
        console.error('Error in setBackground:', e);
    }
}
setBackground();

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
const defaultPlaylists = [
    {
        id: 'def-gregorian',
        title: 'Canto Gregoriano',
        source: 'youtube',
        idType: 'video',
        externalId: 'c79SszUBZUE',
        icon: 'ph-church'
    },
    {
        id: 'def-polyphony',
        title: 'Música Sacra',
        source: 'spotify',
        idType: 'playlist',
        externalId: '1HE6bfpFj8GtTrpmNuuxGp',
        icon: 'ph-music-notes'
    },
    {
        id: 'def-rosary',
        title: 'Santo Rosário (Latim)',
        source: 'youtube',
        idType: 'video',
        externalId: 'b2C8tJf8g7g',
        icon: 'ph-cross'
    }
];

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
        const data = await response.json();

        if (coverEl) coverEl.classList.remove('loading');

        if (data.title) {
            const titleEl = cardElement.querySelector('.playlist-title');
            if (titleEl) {
                titleEl.textContent = data.title;
                titleEl.title = data.title;
            }

            if (playlist.source === 'spotify' && data.thumbnail_url) {
                coverEl.innerHTML = `
                    <img src="${data.thumbnail_url}" loading="lazy" alt="${data.title}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">
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
        if (playlist.source === 'youtube' && playlist.idType !== 'playlist') {
            const thumbUrl = `https://img.youtube.com/vi/${playlist.externalId}/mqdefault.jpg`;
            coverHtml = `<img src="${thumbUrl}" loading="lazy" alt="${playlist.title}">`;
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

    // Empty input
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

        // Toast with specific message
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

        let src;
        if (playlist.idType === 'playlist') {
            src = `https://www.youtube-nocookie.com/embed/videoseries?list=${playlist.externalId}&autoplay=1&controls=1&modestbranding=1&rel=0`;
            currentPlaylistUrl = `https://www.youtube.com/playlist?list=${playlist.externalId}`;
        } else {
            src = `https://www.youtube-nocookie.com/embed/${playlist.externalId}?autoplay=1&controls=1&modestbranding=1&rel=0`;
            currentPlaylistUrl = `https://www.youtube.com/watch?v=${playlist.externalId}`;
        }

        ytIframe.src = src;
        activePlayer = 'youtube';

    } else if (playlist.source === 'spotify') {
        ytIframe.style.display = 'none';
        ytIframe.src = '';
        spIframe.style.display = 'block';

        spIframe.src = `https://open.spotify.com/embed/${playlist.idType}/${playlist.externalId}?utm_source=generator&theme=0`;
        currentPlaylistUrl = `https://open.spotify.com/${playlist.idType}/${playlist.externalId}`;
        activePlayer = 'spotify';
    }
}