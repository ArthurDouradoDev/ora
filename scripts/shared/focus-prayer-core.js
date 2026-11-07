// ============================================================
// FOCUS PRAYER CORE — oração opcional ao começar o foco (puro)
// ============================================================
// Preferência em ora_focus_prayer: { id, freq } ("none" = sem oração;
// freq "first" = só na primeira sessão do dia, "every" = em toda sessão).
// O dia em que a oração já foi rezada (ou pulada) fica em ora_focus_prayer_day.
// Na escolha aparecem primeiro as orações sugeridas para o trabalho; as da
// biblioteca entram em "Mais orações". Cada oração pode ter uma versão curta
// (campo short em data/prayers.json), usada aqui no lugar do texto completo.
// Referência visual: prototypes/08-oracao-foco.html.

(function (global) {
    'use strict';

    const PREF_KEY = 'ora_focus_prayer';
    const DAY_KEY = 'ora_focus_prayer_day';
    const NONE = 'none';
    const SUGGESTED = ['inspirai-senhor', 'vinde-espirito-santo', 'sao-tomas-estudo', 'trabalho-sao-jose'];
    // Acima disso a oração é marcada como "longa" e lida com rolagem (São José tem ~870)
    const LONG_CHARS = 450;
    // Muito longas para o começo de uma sessão (ex.: Súplica aos Anjos): ficam só em Rezar
    const MAX_CHARS = 1600;

    function normalize(pref) {
        const p = pref && typeof pref === 'object' ? pref : {};
        return {
            id: typeof p.id === 'string' && p.id ? p.id : NONE,
            freq: p.freq === 'every' ? 'every' : 'first'
        };
    }

    function dayKey(now) {
        const d = new Date(now);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Versão curta no idioma pedido; senão o texto completo; senão vazio
    function text(prayer, lang) {
        if (!prayer) return '';
        const short = prayer.short && prayer.short[lang];
        const full = prayer.text && prayer.text[lang];
        return String((short && short.trim()) ? short : (full || '')).trim();
    }

    function usable(prayer, lang) {
        const body = text(prayer, lang);
        return !!body && body.length <= MAX_CHARS;
    }

    function isLong(body) {
        return String(body || '').length > LONG_CHARS;
    }

    const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

    // Uma linha que diferencie a oração na lista: a primeira que não repete o título
    function preview(body, title) {
        const lines = String(body || '').split('\n').map(l => l.trim()).filter(Boolean);
        const t = plain(title);
        const line = lines.find(l => plain(l) !== t && !(t && plain(l).startsWith(t) && plain(l).length - t.length < 4)) || lines[0] || '';
        return line.replace(/[,;:]$/, '');
    }

    function entry(prayer, lang, title) {
        const body = text(prayer, lang);
        return { id: prayer.id, title, text: body, long: isLong(body), preview: preview(body, title) };
    }

    // Sugeridas (na ordem de SUGGESTED) + a escolhida da biblioteca, se for outra.
    // titleOf(prayer) devolve o título no idioma da interface.
    function options(prayers, lang, chosenId, titleOf) {
        const list = Array.isArray(prayers) ? prayers : [];
        const name = titleOf || (p => p.title || p.id);
        const out = [];
        SUGGESTED.forEach(id => {
            const p = list.find(x => x.id === id);
            if (p && usable(p, lang)) out.push(entry(p, lang, name(p)));
        });
        if (chosenId && chosenId !== NONE && !SUGGESTED.includes(chosenId)) {
            const p = list.find(x => x.id === chosenId);
            if (p && usable(p, lang)) out.push(entry(p, lang, name(p)));
        }
        return out;
    }

    // As demais orações da biblioteca com texto no idioma (fora as já listadas)
    function library(prayers, lang, excludeIds, titleOf) {
        const list = Array.isArray(prayers) ? prayers : [];
        const skip = new Set(excludeIds || []);
        const name = titleOf || (p => p.title || p.id);
        return list.filter(p => !skip.has(p.id) && usable(p, lang)).map(p => entry(p, lang, name(p)));
    }

    // A oração a rezar agora, ou null (sem oração, já rezada hoje ou sem texto no idioma)
    function due(pref, lastDay, now, prayers, lang, titleOf) {
        const p = normalize(pref);
        if (p.id === NONE) return null;
        if (p.freq === 'first' && lastDay === dayKey(now)) return null;
        const prayer = (Array.isArray(prayers) ? prayers : []).find(x => x.id === p.id);
        if (!prayer || !usable(prayer, lang)) return null;
        return entry(prayer, lang, (titleOf || (x => x.title || x.id))(prayer));
    }

    global.FocusPrayerCore = { PREF_KEY, DAY_KEY, NONE, SUGGESTED, LONG_CHARS, MAX_CHARS, normalize, dayKey, text, isLong, preview, options, library, due };
})(typeof self !== 'undefined' ? self : this);
