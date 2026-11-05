// ============================================================
// SCREENTIME CORE — tempo de tela por domínio e período
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// ora_screentime: { 'YYYY-MM-DD': { domains: { 'site.com': segundos }, newTabs } }
// (escrito só pelo SW). Aqui só se soma e ordena: nenhum domínio é "bom" ou
// "ruim", e não há comparação com metas. O bloco de Frutos abre pela pergunta.
(function (global) {
    'use strict';

    const KEEP_DAYS = 62; // dois meses: o bloco acompanha a visão por mês

    function positive(n) {
        const v = Number(n);
        return Number.isFinite(v) && v > 0 ? v : 0;
    }

    /**
     * aggregate(store, days)
     *   store — ora_screentime
     *   days  — lista de 'YYYY-MM-DD' do período (FrutosCore.periodRange().days)
     * Devolve { totalSec, recordedDays, avgSec, newTabs, domains: [{ domain, sec, share }], byDay }.
     * domains vem ordenado só pelo tempo (maior primeiro), sem rótulos de valor.
     */
    function aggregate(store, days) {
        const s = store && typeof store === 'object' ? store : {};
        const list = Array.isArray(days) ? days : Object.keys(s).sort();
        const totals = new Map();
        const byDay = {};
        let totalSec = 0;
        let newTabs = 0;
        let recordedDays = 0;

        for (const iso of list) {
            const entry = s[iso];
            if (!entry || typeof entry !== 'object') continue;
            let daySec = 0;
            const domains = entry.domains && typeof entry.domains === 'object' ? entry.domains : {};
            for (const [domain, sec] of Object.entries(domains)) {
                const v = positive(sec);
                if (!v || !domain) continue;
                totals.set(domain, (totals.get(domain) || 0) + v);
                daySec += v;
            }
            newTabs += positive(entry.newTabs);
            if (daySec > 0) {
                byDay[iso] = daySec;
                totalSec += daySec;
                recordedDays += 1;
            }
        }

        const domains = Array.from(totals.entries())
            .map(([domain, sec]) => ({ domain, sec, share: totalSec ? sec / totalSec : 0 }))
            .sort((a, b) => (b.sec - a.sec) || a.domain.localeCompare(b.domain));

        return {
            totalSec,
            recordedDays,
            avgSec: recordedDays ? Math.round(totalSec / recordedDays) : 0,
            newTabs,
            domains,
            byDay
        };
    }

    // Os primeiros N domínios e o resto somado ("Outros"), para não esconder tempo
    function topDomains(domains, limit) {
        const list = Array.isArray(domains) ? domains : [];
        const n = Math.max(1, Number(limit) || 6);
        if (list.length <= n) return { top: list.slice(), otherSec: 0, otherCount: 0 };
        const rest = list.slice(n);
        return {
            top: list.slice(0, n),
            otherSec: rest.reduce((sum, d) => sum + d.sec, 0),
            otherCount: rest.length
        };
    }

    // Poda o histórico mantendo os últimos KEEP_DAYS dias a partir de `now`
    function prune(store, now, keepDays) {
        const s = store && typeof store === 'object' ? store : {};
        const date = now instanceof Date ? now : new Date(now || Date.now());
        const keep = Number(keepDays) || KEEP_DAYS;
        const cutoff = new Date(date.getFullYear(), date.getMonth(), date.getDate() - keep + 1);
        const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
        const next = {};
        for (const [iso, entry] of Object.entries(s)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= cutoffIso) next[iso] = entry;
        }
        return next;
    }

    global.ScreentimeCore = {
        KEEP_DAYS,
        aggregate,
        topDomains,
        prune
    };
})(typeof self !== 'undefined' ? self : this);
