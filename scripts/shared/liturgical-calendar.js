// ============================================================
// ORA — calendário litúrgico (puro, offline)
// ============================================================
// Datas sempre como Date local à meia-noite. Sem DOM e sem chrome.*:
// a página e o SW podem consumir via <script> / importScripts.
// Regiões: 'br' (Epifania no domingo entre 2 e 8/01), 'us' (idem) e
// 'universal' (Epifania em 06/01).

(function (g) {
    'use strict';

    const DAY_MS = 86400000;

    function day(y, m, d) { return new Date(y, m, d); }
    function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
    function addDays(date, n) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n); }

    // Diferença em dias de calendário locais (não em horas): imune ao horário de verão
    function daysUntil(from, to) {
        const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
        const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
        return Math.round((b - a) / DAY_MS);
    }

    function isoDate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    // "2026-12-13" → Date local; inválido → null
    function parseIsoDate(text) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
        if (!m) return null;
        const date = day(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return isoDate(date) === m[0] ? date : null;
    }

    function regionFor(locale) {
        return { pt: 'br', en: 'us', es: 'universal' }[locale] || 'br';
    }

    // Cômputo gregoriano (algoritmo anônimo de Meeus/Jones/Butcher)
    function easter(year) {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const gg = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - gg + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const dd = ((h + l - 7 * m + 114) % 31) + 1;
        return day(year, month - 1, dd);
    }

    function ashWednesday(year) { return addDays(easter(year), -46); }
    function palmSunday(year) { return addDays(easter(year), -7); }
    function holyThursday(year) { return addDays(easter(year), -3); }
    function pentecost(year) { return addDays(easter(year), 49); }

    // 1º Domingo do Advento: 4º domingo antes do Natal
    function adventStart(year) {
        const eve = day(year, 11, 24);
        const fourthSunday = addDays(eve, -eve.getDay());
        return addDays(fourthSunday, -21);
    }

    function epiphany(year, region = 'br') {
        if (region === 'universal') return day(year, 0, 6);
        const jan2 = day(year, 0, 2);
        return addDays(jan2, (7 - jan2.getDay()) % 7); // domingo entre 2 e 8/01
    }

    // Batismo do Senhor (fim do Tempo do Natal) do ano civil `year`
    function baptismOfTheLord(year, region = 'br') {
        const epi = epiphany(year, region);
        // Epifania transferida para 7 ou 8/01: o Batismo vai para a segunda-feira seguinte
        if (region !== 'universal' && epi.getDate() >= 7) return addDays(epi, 1);
        return addDays(epi, 7 - epi.getDay() || 7);
    }

    // Fim do Tempo do Natal que começa em 25/12 de `year`
    function christmasSeasonEnd(year, region = 'br') {
        return baptismOfTheLord(year + 1, region);
    }

    // Imaculada Conceição: num domingo do Advento passa para a segunda-feira
    function immaculateConception(year) {
        const d = day(year, 11, 8);
        return d.getDay() === 0 ? addDays(d, 1) : d;
    }

    function inRange(date, from, to) {
        const t = startOfDay(date).getTime();
        return t >= from.getTime() && t <= to.getTime();
    }

    function seasonFor(date, region = 'br') {
        const d = startOfDay(date), y = d.getFullYear();
        const christmas = day(y, 11, 25);
        if (d >= christmas) return 'natal';
        if (d >= adventStart(y)) return 'advento';
        if (d <= baptismOfTheLord(y, region)) return 'natal';
        const e = easter(y);
        if (d >= ashWednesday(y) && d < holyThursday(y)) return 'quaresma';
        if (d >= holyThursday(y) && d < e) return 'triduo';
        if (d >= e && d <= pentecost(y)) return 'pascoa';
        return 'comum';
    }

    function adventWeek(date) {
        const d = startOfDay(date);
        if (seasonFor(d) !== 'advento') return null;
        return Math.min(4, Math.floor(daysUntil(adventStart(d.getFullYear()), d) / 7) + 1);
    }

    // Domingo Gaudete: 3º domingo do Advento
    function isGaudete(date) {
        const d = startOfDay(date);
        return daysUntil(adventStart(d.getFullYear()), d) === 14;
    }

    // Quaresma de São Miguel: 15/08 a 29/09 (devoção, não tempo litúrgico)
    function michaelLent(date) {
        const y = date.getFullYear();
        return inRange(date, day(y, 7, 15), day(y, 8, 29));
    }

    function principalFeast(date) {
        const d = startOfDay(date), y = d.getFullYear();
        if (daysUntil(day(y, 11, 25), d) === 0) return 'natal';
        if (daysUntil(easter(y), d) === 0) return 'pascoa';
        if (daysUntil(pentecost(y), d) === 0) return 'pentecostes';
        return null;
    }

    // Eventos datados de um ano civil: início de tempos e festas
    function events(year, region = 'br') {
        return [
            { id: 'epifania', date: epiphany(year, region), kind: 'feast' },
            { id: 'cinzas', date: ashWednesday(year), kind: 'season' },
            { id: 'ramos', date: palmSunday(year), kind: 'feast' },
            { id: 'pascoa', date: easter(year), kind: 'feast' },
            { id: 'pentecostes', date: pentecost(year), kind: 'feast' },
            { id: 'quaresma-sao-miguel', date: day(year, 7, 15), kind: 'season' },
            { id: 'sao-miguel', date: day(year, 8, 29), kind: 'feast' },
            { id: 'advento', date: adventStart(year), kind: 'season' },
            { id: 'imaculada', date: immaculateConception(year), kind: 'feast' },
            { id: 'natal', date: day(year, 11, 25), kind: 'feast' }
        ].sort((a, b) => a.date - b.date);
    }

    function eventOn(date, id, region = 'br') {
        return events(date.getFullYear(), region).some(ev => ev.id === id && daysUntil(ev.date, date) === 0);
    }

    // Próximo evento a partir de hoje (inclusive): { id, date, kind, daysUntil }
    function nextEvent(date, ids, region = 'br') {
        const today = startOfDay(date), y = today.getFullYear();
        const list = events(y, region).concat(events(y + 1, region))
            .filter(ev => (!ids || ids.includes(ev.id)) && daysUntil(today, ev.date) >= 0);
        if (!list.length) return null;
        const ev = list[0];
        return { ...ev, daysUntil: daysUntil(today, ev.date) };
    }

    g.LiturgicalCalendar = {
        daysUntil, isoDate, parseIsoDate, regionFor, addDays, startOfDay,
        easter, ashWednesday, palmSunday, holyThursday, pentecost,
        adventStart, adventWeek, isGaudete, epiphany, baptismOfTheLord, christmasSeasonEnd,
        immaculateConception, seasonFor, michaelLent, principalFeast,
        events, eventOn, nextEvent
    };
})(typeof self !== 'undefined' ? self : this);
