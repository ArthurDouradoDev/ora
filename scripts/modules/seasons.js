// ============================================================
// TEMPOS LITÚRGICOS — preenche os pontos de encaixe de Hoje e Rezar
// ============================================================
// O tema do dia vem de SeasonsCore.resolveSeason(data, data/seasons.json).
// Hoje expõe #today-season (linha sob a data); Rezar expõe #rezar-season
// (símbolo), recriado a cada renderHome — por isso RezarSystem chama
// fillRezar() depois de montar a tela. Sem tema: os pontos ficam ocultos.
//
// Data simulada para testes: chrome.storage.local.set({ ora_debug_date: '2026-12-13' })
// — lida só com a extensão carregada sem pacote (sem update_url).

const SeasonsSystem = {
    DEBUG_KEY: 'ora_debug_date',
    ACCENTS: { roxo: '--lit-roxo', rosa: '--lit-rosa', branco: '--lit-branco', vermelho: '--lit-vermelho', verde: '--lit-verde' },

    registry: [],
    debugDate: null,
    current: null,
    dayKey: '',

    init: async function(registry) {
        this.registry = Array.isArray(registry) ? registry : [];
        if (this.isDevBuild()) {
            this.debugDate = LiturgicalCalendar.parseIsoDate(await AsyncStorage.get(this.DEBUG_KEY, ''));
            if (this.debugDate) console.info('[Ora] Tempos litúrgicos com data simulada:', LiturgicalCalendar.isoDate(this.debugDate));
        }
        this.cacheDOM();
        this.bindEvents();
        this.refresh();
    },

    cacheDOM: function() {
        this.todayLine = document.getElementById('today-season');
    },

    bindEvents: function() {
        window.addEventListener('ora:locale-changed', () => this.refresh());
        if (this.isDevBuild()) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes[this.DEBUG_KEY]) return;
                this.debugDate = LiturgicalCalendar.parseIsoDate(changes[this.DEBUG_KEY].newValue);
                this.refresh();
            });
        }
        // Virada do dia com a aba aberta
        setInterval(() => {
            if (LiturgicalCalendar.isoDate(this.date()) !== this.dayKey) this.refresh();
        }, 60000);
    },

    isDevBuild: function() {
        try { return !chrome.runtime.getManifest().update_url; } catch (e) { return false; }
    },

    // Data usada pelo tema: a simulada (só em desenvolvimento) ou a de hoje
    date: function() {
        return this.debugDate ? new Date(this.debugDate) : new Date();
    },

    region: function() {
        return LiturgicalCalendar.regionFor(window._i18nLocale || 'pt');
    },

    refresh: function() {
        const date = this.date();
        this.dayKey = LiturgicalCalendar.isoDate(date);
        try {
            this.current = SeasonsCore.resolveSeason(date, this.registry, this.region());
        } catch (e) {
            console.error('[Seasons] resolve failed:', e);
            this.current = null;
        }
        const root = document.documentElement;
        const accent = this.current && this.current.accent && this.ACCENTS[this.current.accent];
        if (accent) {
            root.dataset.season = this.current.season;
            root.style.setProperty('--season-accent', `var(${accent})`);
        } else {
            delete root.dataset.season;
            root.style.removeProperty('--season-accent');
        }
        this.fillToday();
        this.fillRezar();
    },

    text: function(key, params) {
        return key ? t(key, params || {}) : '';
    },

    lowerFirst: function(text) {
        return text ? text.charAt(0).toLocaleLowerCase(window._i18nLocale || 'pt') + text.slice(1) : text;
    },

    // Hoje: "1ª semana do Advento · acenda a primeira vela" ou "Faltam 5 dias para o Advento"
    fillToday: function() {
        const el = this.todayLine;
        if (!el) return;
        const today = this.current && this.current.today;
        if (!today) {
            el.hidden = true;
            el.textContent = '';
            return;
        }
        const parts = [];
        if (today.key) parts.push(this.text(today.key, today.params));
        if (today.countdown) {
            const sentence = this.text(today.countdown.key, today.countdown.params);
            parts.push(today.key ? this.lowerFirst(sentence) : sentence);
        } else if (today.hint) {
            parts.push(this.text(today.hint, today.params));
        }
        el.replaceChildren();
        const color = today.accent && this.ACCENTS[today.accent];
        if (color) {
            const dot = document.createElement('span');
            dot.className = 'season-dot';
            dot.style.setProperty('--dot', `var(${color})`);
            dot.setAttribute('aria-hidden', 'true');
            el.appendChild(dot);
        }
        const label = document.createElement('span');
        label.textContent = parts.join(' · ');
        el.appendChild(label);
        el.dataset.theme = today.theme || '';
        el.hidden = false;
    },

    // Rezar: símbolo do tema (coroa do Advento) com a oração da semana
    fillRezar: function() {
        const slot = document.getElementById('rezar-season');
        if (!slot) return;
        const rezar = this.current && this.current.rezar;
        const render = rezar && this.components[rezar.component];
        if (!render) {
            slot.hidden = true;
            slot.replaceChildren();
            return;
        }
        slot.innerHTML = render.call(this, rezar);
        slot.hidden = false;
        const btn = slot.querySelector('[data-season-prayer]');
        if (btn) {
            btn.addEventListener('click', () => {
                const prayer = window.PrayerSystem && PrayerSystem.prayers.find(p => p.id === btn.dataset.seasonPrayer);
                if (prayer) PrayerSystem.openReader(prayer);
            });
        }
    },

    components: {
        'advent-wreath': function(rezar) {
            const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const prayer = rezar.prayer && window.PrayerSystem && PrayerSystem.prayers.find(p => p.id === rezar.prayer);
            const title = this.text(rezar.key);
            const lit = t('season.advent.candles', { n: rezar.week || 0 });
            return `<div class="season-symbol" aria-hidden="true">${this.wreathSVG(rezar.week || 0)}</div>
                <div class="season-body">
                    <p class="label">${e(t('season.advent.label'))}</p>
                    <h2 id="rezar-season-title">${e(title)}</h2>
                    <p class="sr-only">${e(lit)}</p>
                    ${rezar.hint ? `<p class="meta">${e(this.text(rezar.hint))}</p>` : ''}
                    ${prayer ? `<button type="button" class="btn btn-quiet" data-season-prayer="${e(prayer.id)}"><i class="ph ph-fire" aria-hidden="true"></i>${e(t('season.advent.pray'))}</button>` : ''}
                </div>`;
        }
    },

    // Coroa: 3 velas roxas e a rosa (3ª semana); acesas até a semana atual.
    // Ordem de acendimento: 1ª e 2ª roxas, 3ª rosa, 4ª roxa.
    wreathSVG: function(week) {
        const candles = [
            { x: 46, h: 46, rose: false, order: 1 },
            { x: 80, h: 52, rose: false, order: 2 },
            { x: 114, h: 52, rose: true, order: 3 },
            { x: 148, h: 46, rose: false, order: 4 }
        ];
        const base = 104;
        const body = candles.map(c => {
            const top = base - c.h;
            const on = c.order <= week;
            return `<g class="candle${c.rose ? ' rose' : ''}${on ? ' lit' : ''}">
                <rect x="${c.x - 8}" y="${top}" width="16" height="${c.h}" rx="3"/>
                <line class="wick" x1="${c.x}" y1="${top}" x2="${c.x}" y2="${top - 5}"/>
                ${on ? `<g class="flame-wrap" style="transform-origin:${c.x}px ${top - 4}px"><ellipse class="glow" cx="${c.x}" cy="${top - 13}" rx="13" ry="16"/><path class="flame" d="M${c.x} ${top - 25} C ${c.x + 7} ${top - 15}, ${c.x + 6} ${top - 6}, ${c.x} ${top - 4} C ${c.x - 6} ${top - 6}, ${c.x - 7} ${top - 15}, ${c.x} ${top - 25} Z"/></g>` : ''}
            </g>`;
        }).join('');
        // Folhas atrás (metade de cima do aro) e na frente (metade de baixo) das velas
        const back = [], front = [];
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const x = 97 + Math.cos(a) * 80, y = 108 + Math.sin(a) * 15;
            const leaf = `<ellipse class="leaf${i % 2 ? ' alt' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="13" ry="5" transform="rotate(${(Math.sin(a + Math.PI / 2) * -22).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
            (Math.sin(a) < 0 ? back : front).push(leaf);
        }
        return `<svg class="advent-wreath" viewBox="0 0 194 132" role="presentation" focusable="false">
            <ellipse class="ring" cx="97" cy="108" rx="82" ry="17"/>
            ${back.join('')}
            ${body}
            ${front.join('')}
        </svg>`;
    }
};

window.SeasonsSystem = SeasonsSystem;
