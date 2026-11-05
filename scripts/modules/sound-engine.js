// ============================================================
// SOUND ENGINE — sons do Ora com Web Audio
// ============================================================
// Cada camada é um AudioBuffer decodificado tocando em loop (sem a pausa que
// <audio loop> deixa na volta), com a emenda suavizada por SoundCore.loopCrossfade.
// Toda mudança de volume é uma rampa: entrar, sair, pausar e trocar de camada
// nunca cortam o som. Um <audio> em silêncio mantém a sessão de mídia do
// navegador (teclas de mídia, controles do Chrome) enquanto há som.

const SoundEngine = {
    FADE_IN: 1.2,
    FADE_OUT: 0.8,
    RAMP: 0.08,
    SEAM: 1.5,
    START_TIMEOUT: 2000,

    ctx: null,
    master: null,
    keepAlive: null,
    buffers: new Map(),   // id → Promise<AudioBuffer>
    layers: new Map(),    // id → { gain, source, volume }
    level: 0.65,
    paused: true,
    suspendTimer: null,

    context() {
        if (!this.ctx) {
            this.ctx = new AudioContext();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0;
            this.master.connect(this.ctx.destination);
        }
        return this.ctx;
    },

    get running() {
        return !!this.ctx && this.ctx.state === 'running' && !this.paused;
    },

    ids() {
        return [...this.layers.keys()];
    },

    // Ganho final de uma camada (0–1): volume geral × volume da camada.
    gain(id) {
        const layer = this.layers.get(id);
        return layer ? Math.round(this.level * layer.volume * 1000) / 1000 : 0;
    },

    ramp(param, value, seconds) {
        const now = this.ctx.currentTime;
        if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
        else {
            const current = param.value;
            param.cancelScheduledValues(now);
            param.setValueAtTime(current, now);
        }
        param.linearRampToValueAtTime(value, now + seconds);
    },

    load(id) {
        if (!this.buffers.has(id)) {
            const file = SoundCore.AMBIENCES[id];
            const promise = fetch('assets/sounds/' + file)
                .then(response => {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.arrayBuffer();
                })
                .then(data => this.context().decodeAudioData(data))
                .then(buffer => this.seamless(buffer));
            promise.catch(() => this.buffers.delete(id));
            this.buffers.set(id, promise);
        }
        return this.buffers.get(id);
    },

    seamless(buffer) {
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        const looped = SoundCore.loopCrossfade(channels, buffer.sampleRate, this.SEAM);
        if (looped === channels) return buffer;
        const out = this.ctx.createBuffer(buffer.numberOfChannels, looped[0].length, buffer.sampleRate);
        looped.forEach((data, i) => out.copyToChannel(data, i));
        return out;
    },

    // Define as camadas que devem soar ({ id, volume 0–100 }). Camadas novas entram
    // com fade, as que saem somem com fade e as que ficam só ajustam o volume.
    // Resolve quando todas as camadas pedidas estão tocando.
    async setLayers(layers) {
        this.context();
        const wanted = new Map(layers.map(layer => [layer.id, SoundCore.level(layer.volume, 75) / 100]));
        for (const [id, layer] of this.layers) {
            if (!wanted.has(id)) this.release(id, layer);
        }
        const loads = [];
        for (const [id, volume] of wanted) {
            const existing = this.layers.get(id);
            if (existing) {
                existing.volume = volume;
                if (existing.source) this.ramp(existing.gain.gain, volume, this.RAMP);
                continue;
            }
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            gain.connect(this.master);
            const layer = { gain, source: null, volume };
            this.layers.set(id, layer);
            loads.push(this.load(id).then(buffer => {
                if (this.layers.get(id) !== layer) return;
                const source = this.ctx.createBufferSource();
                source.buffer = buffer;
                source.loop = true;
                source.connect(gain);
                source.start();
                layer.source = source;
                this.ramp(gain.gain, layer.volume, this.FADE_IN);
            }, error => {
                if (this.layers.get(id) === layer) this.release(id, layer);
                throw error;
            }));
        }
        await Promise.all(loads);
    },

    setLayerVolume(id, volume) {
        const layer = this.layers.get(id);
        if (!layer) return;
        layer.volume = SoundCore.level(volume, 75) / 100;
        if (layer.source) this.ramp(layer.gain.gain, layer.volume, this.RAMP);
    },

    release(id, layer) {
        this.layers.delete(id);
        if (!layer.source) {
            layer.gain.disconnect();
            return;
        }
        this.ramp(layer.gain.gain, 0, this.FADE_OUT);
        const { source, gain } = layer;
        source.stop(this.ctx.currentTime + this.FADE_OUT + 0.05);
        source.addEventListener('ended', () => {
            source.disconnect();
            gain.disconnect();
        }, { once: true });
    },

    setVolume(volume) {
        this.level = SoundCore.level(volume) / 100;
        if (this.ctx && !this.paused) this.ramp(this.master.gain, this.level, this.RAMP);
    },

    async play() {
        const ctx = this.context();
        this.paused = false;
        clearTimeout(this.suspendTimer);
        if (ctx.state !== 'running') {
            // Sem gesto da pessoa, o navegador pode manter o contexto suspenso:
            // resume() fica pendente em vez de falhar, então o tempo é limitado aqui.
            let timer;
            const started = await Promise.race([
                ctx.resume().then(() => true),
                new Promise(resolve => { timer = setTimeout(() => resolve(false), this.START_TIMEOUT); })
            ]);
            clearTimeout(timer);
            if (!started || ctx.state !== 'running') {
                this.paused = true;
                throw new Error('AudioContext did not start');
            }
        }
        if (this.paused) return;
        this.ramp(this.master.gain, this.level, this.FADE_IN);
        this.keepSessionAlive(true);
    },

    pause() {
        if (!this.ctx || this.paused) return;
        this.paused = true;
        this.ramp(this.master.gain, 0, this.FADE_OUT);
        this.keepSessionAlive(false);
        this.scheduleSuspend();
    },

    stop() {
        if (!this.ctx) return;
        for (const [id, layer] of this.layers) this.release(id, layer);
        this.paused = true;
        this.ramp(this.master.gain, 0, this.FADE_OUT);
        this.keepSessionAlive(false);
        this.scheduleSuspend();
    },

    // Contexto suspenso não gasta CPU; espera o fade terminar antes.
    scheduleSuspend() {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = setTimeout(() => {
            if (this.paused && this.ctx?.state === 'running') this.ctx.suspend();
        }, (this.FADE_OUT + 0.2) * 1000);
    },

    keepSessionAlive(on) {
        if (!('mediaSession' in navigator)) return;
        if (on) {
            if (!this.keepAlive) {
                const blob = new Blob([SoundCore.silentWav()], { type: 'audio/wav' });
                this.keepAlive = new Audio(URL.createObjectURL(blob));
                this.keepAlive.loop = true;
            }
            this.keepAlive.play().catch(() => {});
            navigator.mediaSession.playbackState = 'playing';
        } else if (this.keepAlive) {
            this.keepAlive.pause();
            navigator.mediaSession.playbackState = 'paused';
        }
    }
};

window.SoundEngine = SoundEngine;
