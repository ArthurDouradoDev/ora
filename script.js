// 1. Relógio
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}`;
}
setInterval(updateClock, 1000);
updateClock();

// 2. Imagem de Fundo Dinâmica (Simplificada e Robusta)
const images = [
    "https://images.unsplash.com/photo-1698822079732-501a7e06860f?q=80&w=1920&auto=format&fit=crop", // Natureza
    "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?q=80&w=1920&auto=format&fit=crop", // Igreja Névoa
];

function setBackground() {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('catholic_dash_date');
    
    let imageUrl;

    // Lógica: Se já tem imagem salva HOJE, usa ela. Se não, sorteia nova.
    if (savedDate === today && localStorage.getItem('catholic_dash_image')) {
        imageUrl = localStorage.getItem('catholic_dash_image');
        console.log("Usando imagem salva do cache.");
    } else {
        const randomIndex = Math.floor(Math.random() * images.length);
        imageUrl = images[randomIndex];
        
        // Salva para a próxima vez
        localStorage.setItem('catholic_dash_date', today);
        localStorage.setItem('catholic_dash_image', imageUrl);
        console.log("Nova imagem sorteada e salva.");
    }

    // Aplica a imagem
    document.body.style.backgroundImage = `url('${imageUrl}')`;
}

// Executa a função
setBackground();

// 3. Music Library & Player Logic

// State
const defaultPlaylists = [
    {
        id: 'def-gregorian',
        title: 'Canto Gregoriano',
        source: 'youtube',
        idType: 'video', // or playlist
        externalId: 'c79SszUBZUE', // Famous 3 hour gregorian chant
        icon: 'ph-church'
    },
    {
        id: 'def-polyphony',
        title: 'Música Sacra',
        source: 'spotify',
        idType: 'playlist',
        externalId: '1HE6bfpFj8GtTrpmNuuxGp', // Spotify Peaceful Choral
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

let userPlaylists = JSON.parse(localStorage.getItem('ora_user_playlists')) || [];
let activePlayer = null; // 'youtube' or 'spotify'

// DOM Elements
const btnMusic = document.getElementById('btn-music');
const musicLibrary = document.getElementById('music-library');
const closeLibraryBtn = document.getElementById('close-library-btn');
const playlistGrid = document.getElementById('playlist-grid');
const playlistInput = document.getElementById('playlist-input');
const addPlaylistBtn = document.getElementById('add-playlist-btn');

// Mini Player Elements
const miniPlayer = document.getElementById('mini-player');
const closePlayerBtn = document.getElementById('close-player-btn');
const nowPlayingText = document.getElementById('now-playing-text');
const ytIframe = document.getElementById('youtube-iframe');
const spIframe = document.getElementById('spotify-iframe');

// Toggle Library
btnMusic.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent immediate close
    const isHidden = musicLibrary.style.display === 'none';
    musicLibrary.style.display = isHidden ? 'flex' : 'none';
    
    // If opening library, we might want to hide mini player temporarily? 
    // Or keep it visible. Let's keep it visible if playing.
    if (isHidden) renderPlaylists();
});

closeLibraryBtn.addEventListener('click', () => {
    musicLibrary.style.display = 'none';
});

// Close Library on Click Outside
document.addEventListener('click', (e) => {
    if (musicLibrary.style.display === 'flex' && 
        !musicLibrary.contains(e.target) && 
        e.target !== btnMusic) {
        musicLibrary.style.display = 'none';
    }
});

// Close Mini Player
closePlayerBtn.addEventListener('click', () => {
    miniPlayer.style.display = 'none';
    stopPlayback();
});

function stopPlayback() {
    ytIframe.src = '';
    spIframe.src = '';
    activePlayer = null;
}

// Render Playlists
function renderPlaylists() {
    playlistGrid.innerHTML = '';
    
    // Combine defaults and user playlists
    const allPlaylists = [...defaultPlaylists, ...userPlaylists];

    allPlaylists.forEach(playlist => {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        
        // Icon based on source/type
        let iconClass = playlist.icon || (playlist.source === 'spotify' ? 'ph-spotify-logo' : 'ph-youtube-logo');
        
        card.innerHTML = `
            <div class="playlist-icon"><i class="ph ${iconClass}"></i></div>
            <div class="playlist-info">
                <div class="playlist-title">${playlist.title}</div>
                <div class="playlist-source">
                    ${playlist.source === 'youtube' ? 'YouTube' : 'Spotify'}
                </div>
            </div>
        `;

        // Delete button for user playlists
        if (!playlist.id.startsWith('def-')) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '<i class="ph ph-trash"></i>';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                removePlaylist(playlist.id);
            };
            card.appendChild(delBtn);
        }

        // Play action
        card.onclick = () => {
            playPlaylist(playlist);
            musicLibrary.style.display = 'none'; // Close library on select
        };

        playlistGrid.appendChild(card);
    });
}

// ... (Add/Remove Playlist logic remains the same) ...

// Play Logic
function playPlaylist(playlist) {
    miniPlayer.style.display = 'flex';
    nowPlayingText.textContent = `Tocando: ${playlist.title}`;

    if (playlist.source === 'youtube') {
        spIframe.style.display = 'none';
        spIframe.src = ''; // Stop Spotify
        ytIframe.style.display = 'block';
        
        const origin = window.location.origin;
        let src = `https://www.youtube.com/embed/${playlist.externalId}?autoplay=1&enablejsapi=1&origin=${origin}`;
        if (playlist.idType === 'playlist') {
            src = `https://www.youtube.com/embed/videoseries?list=${playlist.externalId}&autoplay=1&enablejsapi=1&origin=${origin}`;
        }
        ytIframe.src = src;
        activePlayer = 'youtube';
    } else if (playlist.source === 'spotify') {
        ytIframe.style.display = 'none';
        ytIframe.src = ''; // Stop YouTube
        spIframe.style.display = 'block';
        
        // Spotify Embed URL format
        let embedSrc = `https://open.spotify.com/embed/${playlist.idType}/${playlist.externalId}`;
        spIframe.src = embedSrc;
        activePlayer = 'spotify';
    }
}
