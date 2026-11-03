// ============================================================
// ROUTER — troca de destino sem recarregar a nova aba
// ============================================================
// A rota fica em history.state, não na URL: a nova aba continua com o
// endereço limpo, e Voltar/Avançar do navegador funcionam. Uma nova aba
// sempre começa em Hoje; recarregar mantém o destino atual.
// Links aceitos: <a href="#rezar" data-route="rezar">. Ctrl/Shift/meio
// clique seguem o comportamento padrão (abrem a rota em outra aba).

const RouterSystem = {
    state: {
        route: null
    },

    elements: {},

    init: function() {
        this.cacheDOM();
        this.bindEvents();

        // Prioridade: estado da própria aba (recarregar) > hash (aberta por link) > Hoje
        const fromState = history.state && history.state.oraRoute;
        const route = fromState
            ? RouteCore.sanitizeRoute(fromState)
            : RouteCore.parseRoute(location.hash);

        history.replaceState({ ...history.state, oraRoute: route }, '', location.pathname + location.search);
        this.render(route, { focus: false });
    },

    cacheDOM: function() {
        this.elements.views = Array.from(document.querySelectorAll('.view[data-view]'));
        this.elements.links = Array.from(document.querySelectorAll('[data-route]'));
    },

    bindEvents: function() {
        this.elements.links.forEach(link => {
            link.addEventListener('click', (e) => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                this.navigate(RouteCore.parseRoute(link.getAttribute('href')));
            });
        });

        window.addEventListener('popstate', (e) => {
            const route = RouteCore.sanitizeRoute(e.state && e.state.oraRoute);
            this.render(route, { focus: true });
        });
    },

    // Aceita uma rota { view, path } ou um texto "rezar/biblioteca".
    navigate: function(target) {
        const route = typeof target === 'string'
            ? RouteCore.parseRoute(target)
            : RouteCore.sanitizeRoute(target);
        if (this.state.route && RouteCore.sameRoute(route, this.state.route)) return;

        history.pushState({ oraRoute: route }, '', location.pathname + location.search);
        this.render(route, { focus: true });
    },

    render: function(route, { focus }) {
        this.state.route = route;
        document.documentElement.dataset.view = route.view;

        let active = null;
        this.elements.views.forEach(view => {
            const isActive = view.dataset.view === route.view;
            view.hidden = !isActive;
            if (isActive) active = view;
        });

        this.elements.links.forEach(link => {
            const linkView = RouteCore.parseRoute(link.getAttribute('href')).view;
            if (linkView === route.view) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        // Leva o foco ao título do destino para que leitores de tela anunciem a troca
        if (focus && active) {
            const target = active.querySelector('[data-route-focus]') || active;
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }

        window.dispatchEvent(new CustomEvent('ora:route', { detail: route }));
    },

    current: function() {
        return this.state.route;
    }
};

window.RouterSystem = RouterSystem;
