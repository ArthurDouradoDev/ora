// Ponte local do Ora para o relay hospedado. Só aceita mensagens da aba
// desta extensão e dos dois embeds esperados.
(() => {
    const params = new URLSearchParams(location.search);
    const extension = chrome.runtime.getURL('').slice(0, -1);
    if (window.parent === window || params.get('ora') !== 'sound'
        || location.ancestorOrigins[0] !== extension) return;

    const player = document.getElementById('player');
    const id = params.get('id');
    const spotify = params.get('source') === 'spotify';
    const provider = spotify ? 'https://open.spotify.com' : 'https://www.youtube-nocookie.com';
    if (!player || !id || !player.src.startsWith(provider + '/embed/')) return;

    const notify = (oraSound, data) => parent.postMessage({ oraSound, id, ...data }, extension);
    const send = data => player.contentWindow.postMessage(spotify ? data : JSON.stringify(data), provider);
    let ready = false;
    let paused = true;
    let initialPlay = false;

    function reportReady() {
        if (ready) return;
        ready = true;
        if (spotify) send({ command: 'load_complete_ack' });
        notify('ready');
    }

    function reportState(next) {
        if (next === paused) return;
        paused = next;
        notify('state', { paused });
    }

    function connectYouTube() {
        if (ready) return;
        send({ event: 'listening', id: 'ora-sound', channel: 'widget' });
        for (const event of ['onReady', 'onStateChange', 'onError']) {
            send({ event: 'command', func: 'addEventListener', args: [event], id: 'ora-sound', channel: 'widget' });
        }
    }

    window.addEventListener('message', event => {
        if (event.source === parent && event.origin === extension) {
            const command = event.data?.oraSound;
            if (!ready) return;
            if (spotify) {
                if (command === 'play') {
                    send({ command: initialPlay ? 'resume' : 'play' });
                    initialPlay = true;
                } else if (command === 'pause') send({ command: 'pause' });
            } else {
                const func = { play: 'playVideo', pause: 'pauseVideo', volume: 'setVolume' }[command];
                if (!func) return;
                const args = command === 'volume' ? [Math.min(100, Math.max(0, Number(event.data.volume) || 0))] : [];
                send({ event: 'command', func, args, id: 'ora-sound', channel: 'widget' });
            }
            return;
        }
        if (event.source !== player.contentWindow || event.origin !== provider) return;
        let data = event.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { return; }
        }
        if (spotify) {
            if (data?.type === 'ready') reportReady();
            if (data?.type === 'playback_started') {
                initialPlay = true;
                reportState(false);
            }
            if (data?.type === 'playback_update' && typeof data.payload?.isPaused === 'boolean') {
                reportState(data.payload.isPaused);
            }
            if (data?.type === 'error') notify('error');
        } else {
            if (['onReady', 'initialDelivery', 'infoDelivery'].includes(data?.event)) reportReady();
            const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
            if ([0, 1, 2, 5].includes(state)) reportState(state !== 1);
            if (data?.event === 'onError') notify('error');
        }
    });

    if (!spotify) {
        const url = new URL(player.src);
        url.searchParams.set('enablejsapi', '1');
        url.searchParams.set('origin', location.origin);
        // Os controles do provedor continuam disponíveis se o navegador negar autoplay.
        url.searchParams.set('autoplay', '0');
        player.addEventListener('load', connectYouTube);
        player.src = url.href;
        const handshake = setInterval(() => {
            if (ready) clearInterval(handshake);
            else connectYouTube();
        }, 400);
        setTimeout(() => clearInterval(handshake), 12000);
    }
})();
