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

// ============================================================
// 4. PRAYER SYSTEM
// ============================================================

const prayers = [
    {
        id: 'pai-nosso',
        title: 'Pai Nosso',
        icon: 'ph-hands-praying',
        text: {
            pt: `Pai nosso, que estais nos céus,
santificado seja o Vosso nome;
venha a nós o Vosso reino,
seja feita a Vossa vontade,
assim na terra como no céu.

O pão nosso de cada dia nos dai hoje;
perdoai-nos as nossas ofensas,
assim como nós perdoamos
a quem nos tem ofendido;
e não nos deixeis cair em tentação,
mas livrai-nos do mal. Amém.`,
            la: `Pater noster, qui es in caelis,
sanctificetur nomen tuum.
Adveniat regnum tuum.
Fiat voluntas tua,
sicut in caelo et in terra.

Panem nostrum quotidianum da nobis hodie,
et dimitte nobis debita nostra,
sicut et nos dimittimus debitoribus nostris.
Et ne nos inducas in tentationem,
sed libera nos a malo. Amen.`
        }
    },
    {
        id: 'ave-maria',
        title: 'Ave Maria',
        icon: 'ph-heart',
        text: {
            pt: `Ave Maria, cheia de graça,
o Senhor é convosco,
bendita sois vós entre as mulheres
e bendito é o fruto do vosso ventre, Jesus.

Santa Maria, Mãe de Deus,
rogai por nós, pecadores,
agora e na hora da nossa morte. Amém.`,
            la: `Ave Maria, gratia plena,
Dominus tecum.
Benedicta tu in mulieribus,
et benedictus fructus ventris tui, Iesus.

Sancta Maria, Mater Dei,
ora pro nobis peccatoribus,
nunc, et in hora mortis nostrae. Amen.`
        }
    },
    {
        id: 'gloria',
        title: 'Glória ao Pai',
        icon: 'ph-star',
        text: {
            pt: `Glória ao Pai, e ao Filho e ao Espírito Santo.
Como era no princípio, agora e sempre. Amém.`,
            la: `Gloria Patri, et Filio, et Spiritui Sancto.
Sicut erat in principio, et nunc, et semper,
et in saecula saeculorum. Amen.`
        }
    },
    {
        id: 'salve-rainha',
        title: 'Salve Rainha',
        icon: 'ph-crown',
        text: {
            pt: `Salve, Rainha, Mãe de misericórdia,
vida, doçura e esperança nossa, salve!
A vós bradamos, os degredados filhos de Eva;
a vós suspiramos, gemendo e chorando
neste vale de lágrimas.

Eia, pois, advogada nossa,
esses vossos olhos misericordiosos a nós volvei;
e depois deste desterro nos mostrai Jesus,
bendito fruto do vosso ventre,
ó clemente, ó piedosa,
ó doce sempre Virgem Maria.

V. Rogai por nós, santa Mãe de Deus.
R. Para que sejamos dignos das promessas de Cristo.`,
            la: `Salve, Regina, Mater misericordiae,
vita, dulcedo, et spes nostra, salve.
Ad te clamamus, exsules filii Hevae,
ad te suspiramus, gementes et flentes
in hac lacrimarum valle.

Eia, ergo, advocata nostra,
illos tuos misericordes oculos ad nos converte;
et Iesum, benedictum fructum ventris tui,
nobis post hoc exsilium ostende.
O clemens, O pia,
O dulcis Virgo Maria.

V. Ora pro nobis, sancta Dei Genetrix.
R. Ut digni efficiamur promissionibus Christi.`
        }
    },
    {
        id: 'credo',
        title: 'Credo',
        icon: 'ph-shield-check',
        text: {
            pt: `Creio em Deus Pai Todo-Poderoso,
Criador do céu e da terra;
e em Jesus Cristo, seu único Filho, nosso Senhor;
que foi concebido pelo poder do Espírito Santo;
nasceu da Virgem Maria,
padeceu sob Pôncio Pilatos,
foi crucificado, morto e sepultado;
desceu à mansão dos mortos;
ressuscitou ao terceiro dia;
subiu aos céus,
está sentado à direita de Deus Pai Todo-Poderoso,
donde há de vir a julgar os vivos e os mortos.

Creio no Espírito Santo,
na Santa Igreja Católica,
na comunhão dos Santos,
na remissão dos pecados,
na ressurreição da carne,
na vida eterna. Amém.`,
            la: `Credo in Deum Patrem omnipotentem,
Creatorem caeli et terrae.
Et in Iesum Christum, Filium eius unicum, Dominum nostrum,
qui conceptus est de Spiritu Sancto,
natus ex Maria Virgine,
passus sub Pontio Pilato,
crucifixus, mortuus, et sepultus,
descendit ad inferos,
tertia die resurrexit a mortuis,
ascendit ad caelos,
sedet ad dexteram Dei Patris omnipotentis,
inde venturus est iudicare vivos et mortuos.

Credo in Spiritum Sanctum,
sanctam Ecclesiam catholicam,
sanctorum communionem,
remissionem peccatorum,
carnis resurrectionem,
vitam aeternam. Amen.`
        }
    },
    {
        id: 'ato-contricao',
        title: 'Ato de Contrição',
        icon: 'ph-heart-break',
        text: {
            pt: `Meu Deus, eu me arrependo de todo o coração de vos ter ofendido,
porque sois tão bom e amável.
Prometo, com a vossa graça,
esforçar-me para não mais pecar.
Meu Jesus, misericórdia!`,
            la: `Deus meus, ex toto corde paenitet me omnium meorum peccatorum,
eaque detestor, quia peccando,
non solum poenas a Te iuste statutas promeritus sum,
sed praesertim quia Te summum bonum,
ac Te dignum qui super omnia ametur, offendi.
Ideo firmiter propono,
adiuvante gratia Tua,
de cetero me non peccaturum peccandique occasiones proximas fugiturum. Amen.`
        }
    },
    {
        id: 'sao-miguel',
        title: 'São Miguel Arcanjo',
        icon: 'ph-sword',
        text: {
            pt: `São Miguel Arcanjo, defendei-nos no combate,
sede o nosso refúgio contra as maldades e ciladas do demônio.
Ordene-lhe Deus, instantemente o pedimos,
e vós, príncipe da milícia celeste,
pela virtude divina,
precipitai no inferno a satanás e a todos os espíritos malignos,
que andam pelo mundo para perder as almas. Amém.`,
            la: `Sancte Michael Archangele, defende nos in proelio,
contra nequitiam et insidias diaboli esto praesidium.
Imperet illi Deus, supplices deprecamur:
tuque, Princeps militiae caelestis,
Satanam aliosque spiritus malignos,
qui ad perditionem animarum pervagantur in mundo,
divina virtute, in infernum detrude. Amen.`
        }
    },
    {
        id: 'angelus',
        title: 'Angelus',
        icon: 'ph-bell',
        text: {
            pt: `V. O Anjo do Senhor anunciou a Maria.
R. E ela concebeu do Espírito Santo.
Ave Maria...

V. Eis a escrava do Senhor.
R. Faça-se em mim segundo a vossa palavra.
Ave Maria...

V. E o Verbo se fez carne.
R. E habitou entre nós.
Ave Maria...

V. Rogai por nós, santa Mãe de Deus.
R. Para que sejamos dignos das promessas de Cristo.

Oremos: Infundi, Senhor, nós Vos pedimos,
a Vossa graça em nossas almas,
para que nós, que pela anunciação do Anjo
conhecemos a Encarnação de Jesus Cristo, Vosso Filho,
pela Sua paixão e cruz,
sejamos conduzidos à glória da ressurreição.
Pelo mesmo Cristo, Senhor nosso. Amém.`,
            la: `V. Angelus Domini nuntiavit Mariae.
R. Et concepit de Spiritu Sancto.
Ave Maria...

V. Ecce Ancilla Domini.
R. Fiat mihi secundum Verbum tuum.
Ave Maria...

V. Et Verbum caro factum est.
R. Et habitavit in nobis.
Ave Maria...

V. Ora pro nobis, Sancta Dei Genetrix.
R. Ut digni efficiamur promissionibus Christi.

Oremus: Gratiam tuam, quaesumus, Domine,
mentibus nostris infunde;
ut qui, Angelo nuntiante,
Christi Filii tui incarnationem cognovimus,
per passionem eius et crucem,
ad resurrectionis gloriam perducamur.
Per eundem Christum Dominum nostrum. Amen.`
        }
    }
];

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
    currentLang = 'pt'; // Default to PT
    updatePrayerReader();
    
    prayerList.style.display = 'none'; // Close list
    prayerReader.style.display = 'flex'; // Open reader
}

function closePrayerReader() {
    prayerReader.style.display = 'none';
    currentPrayer = null;
}

function updatePrayerReader() {
    if (!currentPrayer) return;
    
    prayerReaderTitle.textContent = currentPrayer.title;
    prayerTextContent.textContent = currentPrayer.text[currentLang];
    
    // Update Toggle UI
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
            console.log('Prayer clicked:', prayer.title);
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
        // Close Prayer List
        if (prayerList.style.display === 'flex' && 
            !prayerList.contains(e.target) && 
            !btnPrayers.contains(e.target)) {
            closePrayerList();
        }

        // Close Prayer Reader
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
    
    // Angelus time: 12:00 - 13:00
    // Also check if already done today
    const todayStr = new Date().toDateString();
    const doneToday = SafeStorage.getItem('angelus_done_' + todayStr);

    if (hours === 12 && !doneToday) {
        showAngelusReminder();
        
        // Try to send notification if improved permission
        if (Notification.permission === 'granted') {
            // Check if we already sent notification today to avoid spam loop
            const notifSent = SafeStorage.getItem('angelus_notif_' + todayStr);
            if (!notifSent) {
                new Notification('Hora do Angelus', {
                    body: 'O Anjo do Senhor anunciou a Maria...',
                    icon: 'icon.png' // Optional
                });
                SafeStorage.setItem('angelus_notif_' + todayStr, 'true');
            }
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
    openAngelusBtn.addEventListener('click', () => {
        // Find Angelus prayer object
        const angelusPrayer = prayers.find(p => p.id === angelusPrayerId);
        if (angelusPrayer) {
            openPrayerReader(angelusPrayer);
        }
    });
}

if (checkAngelusBtn) {
    checkAngelusBtn.addEventListener('click', () => {
        // Mark as done
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

// Check immediately on load
checkAngelusTime();