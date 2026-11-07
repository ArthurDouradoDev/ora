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
        this.elements.protectionChip = document.getElementById('protection-chip');
        this.elements.nav = document.querySelector('.topbar .nav');
        this.elements.indicator = document.querySelector('.topbar .nav-indicator');
        this.elements.backdrop = document.getElementById('backdrop');
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

        // A largura dos itens muda com a janela, o idioma e o carregamento das fontes
        let resizeFrame = 0;
        window.addEventListener('resize', () => {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => this.moveIndicator({ instant: true }));
        });
        window.addEventListener('ora:locale-changed', () => this.moveIndicator({ instant: true }));
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.moveIndicator({ instant: true }));
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
        const previous = this.state.route;
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

        this.moveIndicator({ instant: !previous });
        this.animateChange(previous, route, active);

        if (this.elements.protectionChip) {
            const isProtecao = route.view === 'protecao';
            this.elements.protectionChip.classList.toggle('current', isProtecao);
            if (isProtecao) this.elements.protectionChip.setAttribute('aria-current', 'page');
            else this.elements.protectionChip.removeAttribute('aria-current');
        }

        // Leva o foco ao título do destino para que leitores de tela anunciem a troca
        if (focus && active) {
            const target = active.querySelector('[data-route-focus]') || active;
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }

        window.dispatchEvent(new CustomEvent('ora:route', { detail: route }));
    },

    // Sublinhado dourado único que desliza até o destino atual
    moveIndicator: function({ instant = false } = {}) {
        const { nav, indicator } = this.elements;
        if (!nav || !indicator || !this.state.route) return;
        const link = nav.querySelector('[aria-current="page"]');
        if (!link || !link.offsetWidth) {
            indicator.classList.remove('is-on');
            return;
        }
        // Mesmo recuo do antigo ::after: 0.875rem de cada lado do item
        const inset = parseFloat(getComputedStyle(link).paddingLeft) || 14;
        const width = Math.max(0, link.offsetWidth - inset * 2);
        if (instant) indicator.classList.remove('is-ready');
        indicator.style.setProperty('--ind-x', (link.offsetLeft + inset) + 'px');
        indicator.style.setProperty('--ind-w', String(width));
        indicator.classList.add('is-on');
        if (instant) {
            void indicator.offsetWidth; // aplica a posição sem animar antes de religar a transição
            indicator.classList.add('is-ready');
        }
    },

    // Troca de destino com continuidade (ANALISE_ANIMACOES_ORA.md, P1):
    // - destinos de superfície sólida (Rezar, Frutos…) sobem e aparecem por
    //   cima da fotografia, que recua e escurece um pouco;
    // - voltar a Hoje: a fotografia se reaproxima e o centro desce de leve.
    //   Hoje não anima opacidade: opacity < 1 tiraria o desfoque do vidro.
    animateChange: function(previous, route, active) {
        if (!window.Motion || !previous || !active) return;
        const dir = RouteCore.direction(previous, route);
        if (!dir) return;
        const backdrop = this.elements.backdrop;
        const toHoje = route.view === 'hoje';
        const fromHoje = previous.view === 'hoje';

        if (toHoje) {
            const center = active.querySelector('.today-center') || active;
            Motion.play(center, [
                { transform: 'translateY(-10px)' },
                { transform: 'none' }
            ], { duration: 380, channel: 'route' });
            if (!fromHoje) {
                Motion.play(backdrop, [
                    { opacity: 0.45, transform: 'scale(1.035)' },
                    { opacity: 1, transform: 'none' }
                ], { duration: 520, channel: 'route' });
            }
            return;
        }

        Motion.play(active, [
            { opacity: 0, transform: `translateY(${dir > 0 ? 18 : -12}px)` },
            { opacity: 1, transform: 'none' }
        ], { duration: 340, channel: 'route' });
        if (fromHoje) {
            Motion.play(backdrop, [
                { opacity: 1, transform: 'none' },
                { opacity: 0.55, transform: 'scale(1.035)' }
            ], { duration: 340, channel: 'route' });
        }
    },

    current: function() {
        return this.state.route;
    }
};

window.RouterSystem = RouterSystem;
