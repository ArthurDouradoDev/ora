// ============================================================
// ORA — tema litúrgico do dia (puro)
// ============================================================
// resolveSeason(date, registry, region) decide o que os pontos de encaixe
// mostram, a partir do registro data/seasons.json e do LiturgicalCalendar.
//
// Regras:
// - Só temas com `enabled: true` contam (incluindo seus contadores).
// - Hoje tem UMA linha: festa no próprio dia > tempo > contador. Entre temas
//   do mesmo tipo, vence a maior `priority`.
// - Com um tema ativo, o contador mais próximo vira sufixo da linha
//   ("4ª semana do Advento · faltam 4 dias para o Natal"), no lugar da dica.
// - Rezar mostra o símbolo do tema ativo de maior prioridade que tiver um
//   (na Imaculada, a coroa do Advento continua).
// - Sem nada ativo e sem contador: null (pontos de encaixe vazios).

(function (g) {
    'use strict';

    function calendar() { return g.LiturgicalCalendar; }

    function matches(theme, date, region) {
        const cal = calendar(), m = theme.match || {};
        if (m.season) return cal.seasonFor(date, region) === m.season;
        if (m.event) return cal.eventOn(date, m.event, region);
        if (m.devotion === 'michaelLent') return cal.michaelLent(date);
        return false;
    }

    function rank(theme) {
        return (theme.match && theme.match.event ? 2000 : 1000) + (Number(theme.priority) || 0);
    }

    function fill(key, params) {
        return String(key).replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? params[name] : ''));
    }

    // Parâmetros que as chaves de texto podem usar
    function paramsFor(date) {
        const cal = calendar();
        return { n: cal.adventWeek(date) || '' };
    }

    // Contadores de todos os temas habilitados que caem na janela (1..daysBefore)
    function countdowns(date, registry, region) {
        const cal = calendar(), found = [];
        for (const theme of registry) {
            if (!theme || theme.enabled !== true) continue;
            for (const c of [].concat(theme.countdown || [])) {
                if (!c || !c.event) continue;
                const next = cal.nextEvent(date, [c.event], region);
                if (!next || next.daysUntil < 1 || next.daysUntil > (Number(c.daysBefore) || 0)) continue;
                found.push({ event: c.event, days: next.daysUntil, date: next.date, theme: theme.id, accent: theme.accent || null });
            }
        }
        // O mais próximo primeiro; empate: o de maior prioridade
        const prio = id => Number((registry.find(t => t && t.id === id) || {}).priority) || 0;
        return found.sort((a, b) => a.days - b.days || prio(b.theme) - prio(a.theme));
    }

    function countdownText(c) {
        return { key: c.days === 1 ? `season.countdown.${c.event}_1` : `season.countdown.${c.event}`, params: { n: c.days } };
    }

    function resolveSeason(date, registry, region = 'br') {
        const list = Array.isArray(registry) ? registry : [];
        const active = list.filter(t => t && t.enabled === true && matches(t, date, region)).sort((a, b) => rank(b) - rank(a));
        const counts = countdowns(date, list, region);
        const params = paramsFor(date);

        const top = active.find(t => t.today) || null;
        const symbolTheme = active.find(t => t.rezar) || null;
        const accentTheme = active.find(t => t.accent) || null;

        let today = null;
        if (top) {
            const suffix = counts.find(c => !(top.match && top.match.event === c.event)) || null;
            today = {
                theme: top.id,
                key: fill(top.today.key, params),
                hint: suffix ? null : (top.today.hint ? fill(top.today.hint, params) : null),
                countdown: suffix ? countdownText(suffix) : null,
                params,
                accent: top.accent || null
            };
        } else if (counts.length) {
            today = { theme: counts[0].theme, key: null, hint: null, countdown: countdownText(counts[0]), params, accent: counts[0].accent };
        }

        if (!today && !symbolTheme) return null;
        return {
            theme: (top || symbolTheme || {}).id || (today && today.theme) || null,
            season: calendar().seasonFor(date, region),
            accent: accentTheme ? accentTheme.accent : null,
            today,
            rezar: symbolTheme ? {
                theme: symbolTheme.id,
                component: symbolTheme.rezar.component,
                key: fill(symbolTheme.rezar.key || symbolTheme.today.key, params),
                hint: symbolTheme.rezar.hint ? fill(symbolTheme.rezar.hint, params) : null,
                prayer: symbolTheme.rezar.prayer || null,
                week: calendar().adventWeek(date),
                gaudete: calendar().isGaudete(date),
                accent: symbolTheme.accent || null
            } : null
        };
    }

    g.SeasonsCore = { resolveSeason, countdowns, matches };
})(typeof self !== 'undefined' ? self : this);
