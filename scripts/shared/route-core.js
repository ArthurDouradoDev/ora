// ============================================================
// ROUTE CORE — rotas da nova aba (Hoje · Rezar · Frutos · Proteção)
// ============================================================
// Pure functions only: no chrome.* calls, no DOM access.
// Uma rota é { view, path }: view é o destino ("rezar"), path são as
// subtelas (["biblioteca"]). Serializada como "#rezar/biblioteca".
(function (global) {
    'use strict';

    const VIEWS = ['hoje', 'rezar', 'frutos', 'protecao', 'configuracoes'];
    const DEFAULT_VIEW = 'hoje';

    function normalizeViews(views) {
        return Array.isArray(views) && views.length ? views : VIEWS;
    }

    // Aceita "#rezar/biblioteca", "rezar/biblioteca", "#/rezar/" ou vazio.
    // Destino desconhecido cai no primeiro destino da lista (Hoje).
    function parseRoute(hash, views) {
        const known = normalizeViews(views);
        const raw = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
        const segments = raw.split('/')
            .map(s => {
                try { return decodeURIComponent(s).trim(); } catch (e) { return ''; }
            })
            .filter(Boolean);

        const view = segments.length ? segments[0].toLowerCase() : '';
        if (!known.includes(view)) return { view: known[0], path: [] };
        return { view, path: segments.slice(1) };
    }

    function serializeRoute(route) {
        if (!route || !route.view) return '#' + DEFAULT_VIEW;
        const parts = [route.view].concat(Array.isArray(route.path) ? route.path : []);
        return '#' + parts.map(p => encodeURIComponent(String(p))).join('/');
    }

    function sameRoute(a, b) {
        return serializeRoute(a) === serializeRoute(b);
    }

    // Valida uma rota vinda de history.state (pode ser de outra versão).
    function sanitizeRoute(route, views) {
        if (!route || typeof route !== 'object') return parseRoute('', views);
        return parseRoute(serializeRoute(route), views);
    }

    // Sentido da troca, para a animação: 1 = avança (destino à direita na
    // ordem dos destinos, ou subtela mais funda), -1 = volta, 0 = nenhuma.
    function direction(from, to, views) {
        if (!from || !to || sameRoute(from, to)) return 0;
        const known = normalizeViews(views);
        const a = known.indexOf(from.view);
        const b = known.indexOf(to.view);
        if (a !== b) return b > a ? 1 : -1;
        const depthA = Array.isArray(from.path) ? from.path.length : 0;
        const depthB = Array.isArray(to.path) ? to.path.length : 0;
        return depthB < depthA ? -1 : 1;
    }

    global.RouteCore = {
        VIEWS,
        DEFAULT_VIEW,
        parseRoute,
        serializeRoute,
        sameRoute,
        sanitizeRoute,
        direction
    };
})(typeof self !== 'undefined' ? self : this);
