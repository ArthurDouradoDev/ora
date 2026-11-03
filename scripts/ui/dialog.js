// ============================================================
// DIALOG — diálogos com foco contido e fundo inerte (M09)
// ============================================================
// Marcação esperada:
//   <div class="scrim" id="x" hidden>
//     <div class="dialog surface-solid" role="dialog" aria-modal="true" aria-labelledby="...">…</div>
//   </div>
// DialogSystem.open('x') mostra o diálogo, torna o resto da página inerte,
// prende Tab/Shift+Tab dentro dele, fecha com Esc e devolve o foco a quem
// abriu. Elementos com [data-dialog-close] fecham o diálogo.
// Os modais da V0 continuam com animateModal() até cada tela ser migrada.

const DialogSystem = {
    state: {
        stack: [] // { root, opener, inerted: Element[], onClose }
    },

    FOCUSABLE: [
        'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
    ].join(','),

    init: function() {
        this.bindEvents();
    },

    bindEvents: function() {
        document.addEventListener('keydown', (e) => {
            const top = this.top();
            if (!top) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.close(top.root);
            } else if (e.key === 'Tab') {
                this.trapTab(e, top.root);
            }
        }, true);

        document.addEventListener('click', (e) => {
            const top = this.top();
            if (!top) return;
            const closer = e.target.closest('[data-dialog-close]');
            if (closer && top.root.contains(closer)) {
                this.close(top.root);
                return;
            }
            // Clique no fundo escurecido (fora do painel) fecha, se permitido
            if (e.target === top.root && top.root.dataset.dismissOnScrim !== 'false') {
                this.close(top.root);
            }
        });
    },

    top: function() {
        return this.state.stack[this.state.stack.length - 1] || null;
    },

    resolve: function(target) {
        return typeof target === 'string' ? document.getElementById(target) : target;
    },

    open: function(target, { opener, onClose } = {}) {
        const root = this.resolve(target);
        if (!root || this.state.stack.some(entry => entry.root === root)) return;

        // Tudo que é irmão do diálogo (ou de seus ancestrais) fica inerte
        const inerted = [];
        let node = root;
        while (node && node.parentElement) {
            Array.from(node.parentElement.children).forEach(sibling => {
                if (sibling === node || sibling.inert || sibling.id === 'toast-container') return;
                if (sibling.tagName === 'SCRIPT') return;
                sibling.inert = true;
                inerted.push(sibling);
            });
            node = node.parentElement;
            if (node === document.body) break;
        }

        this.state.stack.push({
            root,
            opener: opener || document.activeElement,
            inerted,
            onClose
        });

        root.hidden = false;
        const panel = root.querySelector('[role="dialog"], [role="alertdialog"]') || root;
        const first = panel.querySelector('[autofocus]') || this.focusables(panel)[0] || panel;
        if (first === panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        first.focus({ preventScroll: true });
    },

    close: function(target) {
        const root = this.resolve(target);
        const index = this.state.stack.findIndex(entry => entry.root === root);
        if (index === -1) return;

        const [entry] = this.state.stack.splice(index, 1);
        entry.root.hidden = true;
        entry.inerted.forEach(el => { el.inert = false; });

        if (entry.opener && document.contains(entry.opener) && typeof entry.opener.focus === 'function') {
            entry.opener.focus({ preventScroll: true });
        }
        if (typeof entry.onClose === 'function') entry.onClose();
    },

    isOpen: function(target) {
        const root = this.resolve(target);
        return this.state.stack.some(entry => entry.root === root);
    },

    focusables: function(container) {
        return Array.from(container.querySelectorAll(this.FOCUSABLE))
            .filter(el => !el.hidden && el.offsetParent !== null);
    },

    trapTab: function(e, root) {
        const items = this.focusables(root);
        if (!items.length) {
            e.preventDefault();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    }
};

window.DialogSystem = DialogSystem;
