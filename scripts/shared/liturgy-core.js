(function (g) {
    'use strict';
    function dateKey(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
    function days(date = new Date(), count = 7) { return Array.from({ length: count }, (_, i) => { const d = new Date(date); d.setDate(d.getDate() + i); return dateKey(d); }); }
    function source(locale, date) {
        const [year, month, day] = date.split('-');
        if (locale === 'pt') return { api: `https://liturgia.up.railway.app/v2/?dia=${day}&mes=${month}&ano=${year}`, external: `https://www.vaticannews.va/pt/palavra-do-dia/${year}/${month}/${day}.html` };
        if (locale === 'es') return { api: null, external: `https://evangeliodeldia.org/ES/gospel/${date}` };
        return { api: `https://cpbjr.github.io/catholic-readings-api/readings/${year}/${month}-${day}.json`, calendar: `https://cpbjr.github.io/catholic-readings-api/liturgical-calendar/${year}/${month}-${day}.json`, external: `https://bible.usccb.org/bible/readings/${month}${day}${year.slice(-2)}.cfm` };
    }
    function normalizePT(json, date) {
        const gospel = json && json.leituras && json.leituras.evangelho && json.leituras.evangelho[0];
        if (!gospel || !gospel.referencia || !gospel.texto) return null;
        if (json.data && json.data !== date.split('-').reverse().join('/')) return null;
        return { date, ref: String(gospel.referencia), text: String(gospel.texto).trim(), titulo: String(gospel.titulo || ''), liturgia: String(json.liturgia || ''), cor: String(json.cor || '') };
    }
    function normalizeEN(json, calendar, date) {
        if (!json || json.date !== date || !json.readings || !json.readings.gospel) return null;
        return { date, ref: String(json.readings.gospel), text: '', titulo: '', liturgia: calendar && calendar.date === date ? String(calendar.celebration && calendar.celebration.name || calendar.season || '') : '', cor: '' };
    }
    function read(cache, date, locale = 'pt') {
        if (!cache || typeof cache !== 'object') return null;
        const entry = cache.days && cache.days[date] && cache.days[date][locale];
        if (entry && entry.date === date) return entry;
        return locale === 'pt' && cache.date === date && cache.ref ? cache : null;
    }
    function merge(cache, updates, date = new Date()) {
        const dates = days(date), entries = {};
        for (const day of dates) {
            entries[day] = { ...((cache && cache.days && cache.days[day]) || {}) };
            const legacy = read(cache, day, 'pt');
            if (legacy) entries[day].pt = legacy;
            for (const locale of ['pt', 'en']) if (updates[day] && updates[day][locale]) entries[day][locale] = updates[day][locale];
        }
        // Keep today's legacy fields for consumers from earlier phases.
        return { ...(entries[dates[0]].pt || {}), version: 2, days: entries };
    }
    function pericope(ref) {
        return String(ref || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/^(lucas|luke|luca)\b/, 'lc').replace(/^(joao|john|juan)\b/, 'jo')
            .replace(/^(mateus|matthew|mateo)\b/, 'mt').replace(/^(marcos|mark)\b/, 'mc')
            .replace(/[,:\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
    }
    function artwork(index, ref) {
        const key = pericope(ref);
        const entries = Array.isArray(index) ? index : (index && index.entries || []);
        return entries.find(e => e.status === 'approved' && pericope(e.pericope) === key && /^https:\/\//.test(e.url || '') && e.caption && e.source && /^https:\/\//.test(e.source)) || null;
    }
    g.LiturgyCore = { dateKey, days, source, normalizePT, normalizeEN, read, merge, pericope, artwork };
})(typeof self !== 'undefined' ? self : this);
