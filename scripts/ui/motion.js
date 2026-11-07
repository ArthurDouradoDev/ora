// ============================================================
// MOTION — animações curtas pela Web Animations API
// ============================================================
// Regras (ANALISE_ANIMACOES_ORA.md §2): só opacity e transform, que o
// navegador anima no compositor sem refazer layout nem pintura; nada em
// laço contínuo; movimento reduzido (sistema ou Configurações) e aba oculta
// viram corte simples. A regra global de animations.css não alcança
// animações criadas por JS, por isso a checagem fica aqui.
//
// Por que não View Transitions nas trocas de destino: o elemento capturado
// vira "raiz do fundo" e o vidro (backdrop-filter) dentro dele perde o
// desfoque durante a transição.

const Motion = {
    EASE: 'cubic-bezier(.2, .7, .2, 1)',

    reduced: function() {
        if (document.documentElement.dataset.motion === 'reduce') return true;
        return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    // Anima `el` e devolve a Animation (ou null quando não anima). Uma nova
    // animação do mesmo canal no mesmo elemento cancela a anterior, para
    // cliques rápidos não empilharem movimento.
    play: function(el, keyframes, options = {}) {
        if (!el || typeof el.animate !== 'function' || document.hidden || this.reduced()) return null;
        const channel = options.channel || 'default';
        el._oraMotion = el._oraMotion || {};
        const previous = el._oraMotion[channel];
        if (previous) previous.cancel();
        const { channel: _ignored, ...timing } = options;
        const animation = el.animate(keyframes, { duration: 300, easing: this.EASE, ...timing });
        el._oraMotion[channel] = animation;
        const clear = () => { if (el._oraMotion[channel] === animation) delete el._oraMotion[channel]; };
        animation.onfinish = clear;
        animation.oncancel = clear;
        return animation;
    }
};

window.Motion = Motion;
