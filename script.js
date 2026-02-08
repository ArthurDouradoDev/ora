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
const openExternalBtn = document.getElementById('open-external-btn');
const nowPlayingText = document.getElementById('now-playing-text');
const ytIframe = document.getElementById('youtube-iframe');
const spIframe = document.getElementById('spotify-iframe');

// Playback Controls
const prevBtn = document.getElementById('prev-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const nextBtn = document.getElementById('next-btn');
const volumeSlider = document.getElementById('volume-slider');

let currentPlaylistUrl = ''; // Store current external URL
let currentPlaylistIndex = -1; // Track which playlist is playing
let allPlaylists = []; // Combined playlists
let ytPlayer = null; // YouTube player API reference

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

// Open in External App
openExternalBtn.addEventListener('click', () => {
    if (currentPlaylistUrl) {
        window.open(currentPlaylistUrl, '_blank');
    }
});

// Playback Controls
prevBtn.addEventListener('click', () => {
    if (currentPlaylistIndex > 0) {
        currentPlaylistIndex--;
        playPlaylist(allPlaylists[currentPlaylistIndex]);
    }
});

nextBtn.addEventListener('click', () => {
    if (currentPlaylistIndex < allPlaylists.length - 1) {
        currentPlaylistIndex++;
        playPlaylist(allPlaylists[currentPlaylistIndex]);
    }
});

playPauseBtn.addEventListener('click', () => {
    // Note: Direct playback control of embedded iframes is very limited
    // This is more of a visual element - users control playback in the embed itself
    const icon = playPauseBtn.querySelector('i');
    if (icon.classList.contains('ph-play')) {
        icon.classList.remove('ph-play');
        icon.classList.add('ph-pause');
    } else {
        icon.classList.remove('ph-pause');
        icon.classList.add('ph-play');
    }
});

volumeSlider.addEventListener('input', (e) => {
    // Volume control for embedded players is limited
    // This provides visual feedback but actual control depends on the embed
    const volume = e.target.value;
    console.log('Volume set to:', volume);
});

function stopPlayback() {
    ytIframe.src = '';
    ytIframe.style.display = 'none';
    spIframe.src = '';
    spIframe.style.display = 'none';
    activePlayer = null;
    currentPlaylistUrl = '';
    currentPlaylistIndex = -1;
}

// Função auxiliar para buscar metadados reais (Capa e Título)
async function fetchMetadata(playlist, cardElement) {
    try {
        let url = '';
        
        // Constrói a URL pública baseada no ID
        if (playlist.source === 'spotify') {
            // Ex: https://open.spotify.com/playlist/ID
            url = `https://open.spotify.com/${playlist.idType}/${playlist.externalId}`;
        } else if (playlist.source === 'youtube') {
            // Ex: https://www.youtube.com/watch?v=ID
            if (playlist.idType === 'playlist') {
                url = `https://www.youtube.com/playlist?list=${playlist.externalId}`;
            } else {
                url = `https://www.youtube.com/watch?v=${playlist.externalId}`;
            }
        }

        // Usa o NoEmbed (API pública e gratuita) para pegar os dados
        const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.title) {
            // 1. Atualiza o Título Real
            const titleEl = cardElement.querySelector('.playlist-title');
            if (titleEl) {
                titleEl.textContent = data.title;
                titleEl.title = data.title; // Tooltip
            }

            // 2. Atualiza a Capa (Principalmente para Spotify)
            // Se for Spotify, usamos a thumb que a API devolveu
            if (playlist.source === 'spotify' && data.thumbnail_url) {
                const coverEl = cardElement.querySelector('.playlist-cover');
                // Substitui o ícone pela imagem
                coverEl.innerHTML = `
                    <img src="${data.thumbnail_url}" loading="lazy" alt="${data.title}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">
                    ${!playlist.id.startsWith('def-') ? '<button class="delete-btn" title="Remover"><i class="ph ph-trash"></i></button>' : ''}
                `;
                
                // Reatribui o evento de deletar (pois recriamos o HTML interno)
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
    }
}

// Render Playlists
function renderPlaylists() {
    playlistGrid.innerHTML = '';
    
    const allPlaylists = [...defaultPlaylists, ...userPlaylists];

    allPlaylists.forEach(playlist => {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        
        // HTML Inicial (Placeholder enquanto carrega)
        let coverHtml;
        
        // Para YouTube Vídeo, já usamos a capa padrão direto (é mais rápido que a API)
        if (playlist.source === 'youtube' && playlist.idType !== 'playlist') {
            const thumbUrl = `https://img.youtube.com/vi/${playlist.externalId}/mqdefault.jpg`;
            coverHtml = `<img src="${thumbUrl}" loading="lazy" alt="${playlist.title}">`;
        } else {
            // Placeholder com ícone para Spotify e Playlists
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

        // Lógica de Clique
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
        
        // CHAMA A API PARA ATUALIZAR ESSE CARD ESPECÍFICO
        // (Só chamamos se não for YouTube Vídeo simples, pois esse já tem capa)
        if (playlist.source === 'spotify' || playlist.idType === 'playlist') {
            fetchMetadata(playlist, card);
        }
    });
}

// Add Playlist Function (placeholder - you can expand this)
addPlaylistBtn.addEventListener('click', () => {
    const input = playlistInput.value.trim();
    if (!input) return;
    
    // Simple URL parser for YouTube/Spotify
    let newPlaylist = null;
    
    // YouTube detection
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
        const videoMatch = input.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const playlistMatch = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        
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
    else if (input.includes('spotify.com')) {
        const match = input.match(/spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
        if (match) {
            newPlaylist = {
                id: 'user-' + Date.now(),
                title: `Spotify ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`,
                source: 'spotify',
                idType: match[1],
                externalId: match[2],
                icon: 'ph-spotify-logo'
            };
        }
    }
    
    if (newPlaylist) {
        userPlaylists.push(newPlaylist);
        localStorage.setItem('ora_user_playlists', JSON.stringify(userPlaylists));
        playlistInput.value = '';
        renderPlaylists();
    } else {
        alert('URL não reconhecido. Use links do YouTube ou Spotify.');
    }
});

// Remove Playlist
function removePlaylist(id) {
    userPlaylists = userPlaylists.filter(p => p.id !== id);
    localStorage.setItem('ora_user_playlists', JSON.stringify(userPlaylists));
    renderPlaylists();
}

// Play Logic - FIXED with proper YouTube embedding
function playPlaylist(playlist) {
    miniPlayer.style.display = 'flex';
    nowPlayingText.textContent = `${playlist.title}`;

    if (playlist.source === 'youtube') {
        spIframe.style.display = 'none';
        spIframe.src = ''; // Stop Spotify
        ytIframe.style.display = 'block';
        
        // YouTube embed URL - using youtube-nocookie.com for better compatibility
        // Key parameters:
        // - autoplay=1: starts playing automatically
        // - controls=1: show player controls
        // - modestbranding=1: minimal YouTube branding
        // - rel=0: don't show related videos from other channels
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
        ytIframe.src = ''; // Stop YouTube
        spIframe.style.display = 'block';
        
        // Spotify Embed URL format - using full player for better visualization
        let embedSrc = `https://open.spotify.com/embed/${playlist.idType}/${playlist.externalId}?utm_source=generator&theme=0`;
        spIframe.src = embedSrc;
        
        // Set external URL
        currentPlaylistUrl = `https://open.spotify.com/${playlist.idType}/${playlist.externalId}`;
        
        activePlayer = 'spotify';
    }
    
    // Update play/pause button to pause state when new media starts
    const icon = playPauseBtn.querySelector('i');
    icon.classList.remove('ph-play');
    icon.classList.add('ph-pause');
}