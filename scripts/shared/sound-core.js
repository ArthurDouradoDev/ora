// Preferências, catálogo offline, ambientes prontos e identificação de links dos players.
(function (global) {
    'use strict';

    const AMBIENCES = Object.freeze({
        rain: 'rain.wav', church: 'church.wav', bells: 'bells.wav',
        monastery: 'monastery.wav', fire: 'fire.wav', gloria: 'gloria.ogg'
    });
    // Camadas tocando ao mesmo tempo num ambiente.
    const MAX_LAYERS = 3;
    // Ambientes prontos: receitas de camadas com o volume pensado para cada uma.
    // Um ambiente é reconhecido pelas camadas que usa, não por um id gravado.
    const SCENES = Object.freeze([
        { id: 'chapel_rain', layers: [{ id: 'church', volume: 70 }, { id: 'rain', volume: 45 }] },
        { id: 'monastery_night', layers: [{ id: 'monastery', volume: 70 }, { id: 'fire', volume: 35 }] },
        { id: 'vigil', layers: [{ id: 'fire', volume: 65 }, { id: 'church', volume: 35 }, { id: 'bells', volume: 20 }] },
        { id: 'lauds', layers: [{ id: 'gloria', volume: 70 }, { id: 'bells', volume: 35 }] },
        ...Object.keys(AMBIENCES).map(id => ({ id, layers: [{ id, volume: 75 }] }))
    ].map(scene => Object.freeze({ ...scene, layers: Object.freeze(scene.layers.map(Object.freeze)) })));
    const SPOTIFY_TYPES = ['playlist', 'album', 'track'];
    const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'];

    function media(source, idType, externalId) {
        if (typeof externalId !== 'string') return null;
        if (source === 'spotify' && SPOTIFY_TYPES.includes(idType) && /^[a-zA-Z0-9]+$/.test(externalId)) {
            return { source, idType, externalId };
        }
        if (source === 'youtube' && (idType === 'video' ? /^[\w-]{11}$/.test(externalId)
            : idType === 'playlist' && /^[\w-]+$/.test(externalId))) {
            return { source, idType, externalId };
        }
        return null;
    }

    function parseLink(value) {
        const input = String(value ?? '').trim();
        const uri = /^spotify:(playlist|album|track):([a-zA-Z0-9]+)$/.exec(input);
        if (uri) return media('spotify', uri[1], uri[2]);

        let url;
        try {
            url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : 'https://' + input);
        } catch {
            return null;
        }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
        const path = url.pathname.split('/').filter(Boolean);
        if (url.hostname === 'open.spotify.com') {
            if (/^intl-[a-z-]+$/.test(path[0])) path.shift();
            if (path[0] === 'embed') path.shift();
            return path.length === 2 ? media('spotify', path[0], path[1]) : null;
        }
        if (!YOUTUBE_HOSTS.includes(url.hostname)) return null;
        const playlist = url.searchParams.get('list');
        if (playlist) return media('youtube', 'playlist', playlist);
        const video = url.hostname === 'youtu.be' ? path[0]
            : ['embed', 'shorts', 'live'].includes(path[0]) ? path[1] : url.searchParams.get('v');
        return media('youtube', 'video', video);
    }

    function mediaUrl(item) {
        const { source, idType, externalId } = item;
        if (source === 'spotify') return 'https://open.spotify.com/' + idType + '/' + externalId;
        return 'https://www.youtube.com/' + (idType === 'playlist' ? 'playlist?list=' : 'watch?v=') + externalId;
    }

    function level(value, fallback = 65) {
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.min(100, Math.max(0, Math.round(value))) : fallback;
    }

    function choice(value, playlists) {
        const id = typeof value === 'string' ? value : value?.id;
        if (id && playlists.some(item => item.id === id)) return { kind: 'playlist', id };
        const layers = [];
        if (value?.kind === 'ambient' && Array.isArray(value.layers)) {
            for (const layer of value.layers) {
                if (!Object.hasOwn(AMBIENCES, layer?.id) || layers.some(item => item.id === layer.id)) continue;
                layers.push({ id: layer.id, volume: level(layer.volume, 75) });
                if (layers.length === MAX_LAYERS) break;
            }
        }
        return layers.length ? { kind: 'ambient', layers } : { kind: 'silence' };
    }

    function preference(value, playlists) {
        return { choice: choice(value?.choice ?? value, playlists), volume: level(value?.volume), pauseWithFocus: value?.pauseWithFocus === true, playerHidden: value?.playerHidden === true };
    }

    function sameLayers(first, second) {
        const a = first?.layers || [];
        const b = second?.layers || [];
        return a.length === b.length && a.every(layer => b.some(item => item.id === layer.id));
    }

    // Id do ambiente pronto que usa exatamente essas camadas, ou null para uma mistura própria.
    function sceneOf(value) {
        if (value?.kind !== 'ambient') return null;
        return SCENES.find(scene => sameLayers(scene, value))?.id ?? null;
    }

    function sceneChoice(id) {
        const scene = SCENES.find(item => item.id === id);
        return scene ? { kind: 'ambient', layers: scene.layers.map(layer => ({ ...layer })) } : { kind: 'silence' };
    }

    // Emenda do loop: os últimos `seconds` se fundem ao início (potência constante),
    // então o fim do trecho devolvido continua exatamente no começo dele.
    // Recebe e devolve um Float32Array por canal; trechos curtos voltam sem mudança.
    function loopCrossfade(channels, sampleRate, seconds = 1.5) {
        const length = channels[0]?.length || 0;
        const fade = Math.min(Math.floor(seconds * sampleRate), Math.floor(length / 3));
        if (fade < 2) return channels;
        return channels.map(data => {
            const out = new Float32Array(length - fade);
            for (let i = 0; i < fade; i++) {
                const t = (i / fade) * Math.PI / 2;
                out[i] = data[i] * Math.sin(t) + data[length - fade + i] * Math.cos(t);
            }
            out.set(data.subarray(fade, length - fade), fade);
            return out;
        });
    }

    // --- Capas (oEmbed público do YouTube e do Spotify, sem chave) ---

    function mediaKey(item) {
        return item.source + ':' + item.idType + ':' + item.externalId;
    }

    function oembedUrl(item) {
        const url = encodeURIComponent(mediaUrl(item));
        return item.source === 'spotify'
            ? 'https://open.spotify.com/oembed?url=' + url
            : 'https://www.youtube.com/oembed?format=json&url=' + url;
    }

    const COVER_HOST = /^(i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com|i[0-9]?\.ytimg\.com)$/;

    // Só aceita imagens https dos CDNs conhecidos. No YouTube usa a mqdefault
    // (16:9 sem as faixas pretas da hqdefault).
    function coverUrl(value) {
        let url;
        try { url = new URL(String(value ?? '')); } catch { return null; }
        if (url.protocol !== 'https:' || !COVER_HOST.test(url.hostname)) return null;
        if (url.hostname.endsWith('ytimg.com')) url.pathname = url.pathname.replace(/\/(hq|sd|maxres)?default\.jpg$/, '/mqdefault.jpg');
        return url.href;
    }

    // Resultado de uma busca: data é o JSON do oEmbed ou null (mídia privada, removida...).
    function artwork(item, data, now = Date.now()) {
        let cover = coverUrl(data?.thumbnail_url);
        if (!cover && item.source === 'youtube' && item.idType === 'video') {
            cover = 'https://i.ytimg.com/vi/' + item.externalId + '/mqdefault.jpg';
        }
        const title = typeof data?.title === 'string' ? data.title.trim().slice(0, 120) : '';
        return { cover, title, at: now };
    }

    const DAY = 24 * 60 * 60 * 1000;

    // Capa encontrada vale 30 dias (a de playlist muda); falha tenta de novo no dia seguinte.
    function artworkStale(entry, now = Date.now()) {
        if (!entry || typeof entry.at !== 'number' || entry.at > now) return true;
        return now - entry.at > (entry.cover ? 30 : 1) * DAY;
    }

    // WAV PCM 8 bits, mono, em silêncio: mantém a sessão de mídia do navegador ativa
    // enquanto o Web Audio toca (teclas de mídia e controles do Chrome).
    function silentWav(seconds = 1, sampleRate = 8000) {
        const samples = Math.max(1, Math.round(seconds * sampleRate));
        const bytes = new Uint8Array(44 + samples);
        const view = new DataView(bytes.buffer);
        const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
        text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE');
        text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true);
        view.setUint16(32, 1, true); view.setUint16(34, 8, true);
        text(36, 'data'); view.setUint32(40, samples, true);
        bytes.fill(128, 44);
        return bytes;
    }

    global.SoundCore = {
        AMBIENCES, MAX_LAYERS, SCENES, media, parseLink, mediaUrl, level, choice, preference,
        sameLayers, sceneOf, sceneChoice, loopCrossfade, silentWav,
        mediaKey, oembedUrl, coverUrl, artwork, artworkStale
    };
})(typeof window !== 'undefined' ? window : globalThis);
