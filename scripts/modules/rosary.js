const RosarySystem = {
    // State
    currentBead: 0,
    mystery: 'gozosos',
    chapletType: 'terco', // 'terco' or 'misericordia'
    lang: 'pt',
    
    // Data
    structure: [],
    mysteries: {},
    extraPrayers: {},
    basePrayers: [], // from injected data (prayers)

    // Dependencies (Global)
    // animateModal, isModalVisible, SafeStorage, showToast

    // DOM Elements
    elements: {
        modal: null,
        modalTitle: null,
        closeBtn: null,
        container: null,
        mysteryName: null,
        prayerTitle: null,
        prayerText: null,
        counter: null,
        prevBtn: null,
        nextBtn: null,
        mysteryBtns: null,
        chapletBtns: null,
        langBtns: null,
        resetBtn: null,
        btnRosary: null,
        rosarySuggestion: null // The reminder/suggestion modal
    },

    init: async function(data) {
        // Unpack data
        this.structure = data.rosary.structure;
        this.mysteries = data.rosary.mysteries;
        this.extraPrayers = data.rosary.extraPrayers;
        this.basePrayers = data.prayers;

        this.cacheDOM();
        await this.loadProgress();
        this.bindEvents();
        
        console.log('[Ora] Rosary System Initialized');
    },

    cacheDOM: function() {
        this.elements.modal = document.getElementById('rosary-modal');
        this.elements.modalTitle = document.getElementById('rosary-modal-title');
        this.elements.closeBtn = document.getElementById('close-rosary-btn');
        this.elements.container = this.elements.modal.querySelector('.rosary-beads-container');
        this.elements.mysteryName = this.elements.modal.querySelector('.rosary-mystery-name');
        this.elements.prayerTitle = this.elements.modal.querySelector('.rosary-prayer-title');
        this.elements.prayerText = this.elements.modal.querySelector('.rosary-prayer-text');
        this.elements.counter = this.elements.modal.querySelector('.rosary-counter');
        this.elements.prevBtn = document.getElementById('rosary-prev');
        this.elements.nextBtn = document.getElementById('rosary-next');
        this.elements.mysteryBtns = this.elements.modal.querySelectorAll('.rosary-mystery-btn');
        this.elements.chapletBtns = this.elements.modal.querySelectorAll('.rosary-chaplet-btn');
        this.elements.langBtns = this.elements.modal.querySelectorAll('.lang-toggle-rosary .lang-btn');
        this.elements.resetBtn = document.getElementById('reset-rosary-btn');
        this.elements.btnRosary = document.getElementById('btn-rosary');
        this.elements.rosarySuggestion = document.getElementById('rosary-reminder');

        if (!this.elements.container) console.error('[Rosary] Container not found!');
    },

    loadProgress: async function() {
        try {
            const saved = await AsyncStorage.get('ora_rosary_progress');
            if (saved) {
                const parsed = (typeof saved === 'string') ? JSON.parse(saved) : saved;
                this.currentBead = parsed.bead || 0;
                this.mystery = parsed.mystery || 'gozosos';
                this.chapletType = parsed.chapletType || 'terco';
                this.lang = parsed.lang || 'pt';
            }
        } catch (e) { console.error(e); }
    },

    saveProgress: async function() {
        await AsyncStorage.set('ora_rosary_progress', JSON.stringify({
            bead: this.currentBead,
            mystery: this.mystery,
            chapletType: this.chapletType,
            lang: this.lang
        }));
    },

    // --- Core Logic ---

    isBeadDisabled: function(index) {
        if (this.chapletType !== 'misericordia') return false;
        const bead = this.structure[index];
        // Intro unused beads (indices 4, 5, 6)
        if (bead.decade === 0 && (index === 4 || index === 5 || index === 6)) return true;
        // Gloria and Fatima in decades 1-5
        if (bead.decade >= 1 && bead.decade <= 5 && (bead.type === 'gloria' || bead.type === 'fatima')) return true;
        return false;
    },

    getPrayerText: function(bead, index) {
        // Misericordia
        if (this.chapletType === 'misericordia') {
            if (bead.decade === 0) {
                if (index === 0) return { title: 'Sinal da Cruz', text: this.extraPrayers['sinal-cruz'].pt }; // Misericordia starts with sign of cross usually? Or keep default
                if (index === 1) {
                    const p = this.basePrayers.find(pr => pr.id === 'pai-nosso');
                    return { title: 'Pai Nosso', text: p ? p.text.pt : '' };
                }
                if (index === 2) {
                    const p = this.basePrayers.find(pr => pr.id === 'ave-maria');
                    return { title: 'Ave Maria', text: p ? p.text.pt : '' };
                }
                if (index === 3) {
                    const p = this.basePrayers.find(pr => pr.id === 'credo');
                    return { title: 'Credo', text: p ? p.text.pt : '' };
                }
                if (bead.type === 'salve-rainha') {
                    return { title: 'Deus Santo (×3)', text: this.extraPrayers['santo-deus'][this.lang] };
                }
            }
            if (bead.decade >= 1 && bead.decade <= 5) {
                if (bead.type === 'pai-nosso') {
                    return { title: 'Eterno Pai', text: this.extraPrayers['pai-eterno'][this.lang] };
                }
                if (bead.type === 'ave-maria') {
                    const title = this.lang === 'pt' ? bead.label.replace('Ave Maria', 'Pela Sua Dolorosa Paixão') : 'Pro dolorosa Eius Passione';
                    return { title: title, text: this.extraPrayers['dolorosa-paixao'][this.lang] };
                }
            }
            if (bead.type === 'salve-rainha') {
                return { title: 'Santo Deus (×3)', text: this.extraPrayers['santo-deus'][this.lang] };
            }
            return { title: bead.label, text: '' };
        }

        // Santo Terço
        if (this.extraPrayers[bead.type] && (bead.type === 'sinal-cruz' || bead.type === 'fatima')) {
            return {
                title: bead.label,
                text: this.extraPrayers[bead.type][this.lang]
            };
        }

        const typeToId = {
            'pai-nosso': 'pai-nosso',
            'ave-maria': 'ave-maria',
            'gloria': 'gloria',
            'credo': 'credo',
            'salve-rainha': 'salve-rainha'
        };

        const prayerId = typeToId[bead.type];
        if (prayerId) {
            const prayer = this.basePrayers.find(p => p.id === prayerId);
            if (prayer) {
                return {
                    title: bead.label,
                    text: prayer.text[this.lang]
                };
            }
        }

        return { title: bead.label, text: '' };
    },

    // --- Rendering ---

    renderBeads: function() {
        // Full Re-render of beads DOM - Only called on init or mode change
        this.elements.container.innerHTML = '';
        let lastDecade = -1;

        this.structure.forEach((bead, index) => {
            if (bead.decade !== lastDecade && lastDecade !== -1) {
                const sep = document.createElement('div');
                sep.className = 'rosary-bead-separator';
                this.elements.container.appendChild(sep);
            }
            lastDecade = bead.decade;

            const beadEl = document.createElement('div');
            beadEl.className = 'rosary-bead';
            beadEl.dataset.index = index; // Useful for efficient updates

            const disabled = this.isBeadDisabled(index);

            if (['pai-nosso', 'credo', 'salve-rainha', 'sinal-cruz'].includes(bead.type)) {
                beadEl.classList.add('bead-large');
            }

            if (disabled) {
                beadEl.classList.add('disabled');
            } else {
                beadEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.goTo(index);
                });
            }

            beadEl.title = disabled ? '' : bead.label;
            this.elements.container.appendChild(beadEl);
        });
        
        // Initial class application
        this.updateBeadClasses();
    },

    updateBeadClasses: function() {
        // Optimized update - NO DOM rebuilding
        const beads = this.elements.container.querySelectorAll('.rosary-bead');
        
        beads.forEach(beadEl => {
            const index = parseInt(beadEl.dataset.index);
            const disabled = this.isBeadDisabled(index); // Re-check disabled status (dynamic based on mode)
            
            // Reset base classes (keep 'rosary-bead' and 'bead-large' if present)
            beadEl.classList.remove('active', 'visited', 'disabled');

            if (disabled) {
                beadEl.classList.add('disabled');
            } else {
                if (index < this.currentBead) {
                    beadEl.classList.add('visited');
                }
                if (index === this.currentBead) {
                    beadEl.classList.add('active');
                }
            }
        });
        
        this.scrollToActive();
    },

    scrollToActive: function() {
        const activeBead = this.elements.container.querySelector('.rosary-bead.active');
        if (activeBead) {
            const containerRect = this.elements.container.getBoundingClientRect();
            const beadRect = activeBead.getBoundingClientRect();
            const scrollLeft = this.elements.container.scrollLeft;
            
            // Center the bead
            const targetScroll = scrollLeft + (beadRect.left - containerRect.left) - (containerRect.width / 2) + (beadRect.width / 2);
            this.elements.container.scrollTo({ left: targetScroll, behavior: 'smooth' });
        }
    },

    updateTextAndUI: function() {
        const bead = this.structure[this.currentBead];
        if (!bead) return;

        // Text
        const info = this.getPrayerText(bead, this.currentBead);
        this.elements.prayerTitle.textContent = info.title;
        this.elements.prayerText.textContent = info.text;

        // Mystery Name (Decades 1-5 only for Terço)
        if (this.chapletType === 'terco' && bead.decade >= 1 && bead.decade <= 5) {
            const mysteries = this.mysteries[this.mystery];
            this.elements.mysteryName.textContent = `${bead.decade}º Mistério: ${mysteries[bead.decade - 1]}`;
        } else if (this.chapletType === 'misericordia' && bead.decade >= 1 && bead.decade <= 5) {
            this.elements.mysteryName.textContent = `${bead.decade}ª Dezena`;
        } else {
            this.elements.mysteryName.textContent = '';
        }

        // Counter
        this.elements.counter.textContent = `${this.currentBead + 1} / ${this.structure.length}`;

        // Language Buttons Active State
        this.elements.langBtns.forEach(btn => {
            if (btn.dataset.lang === this.lang) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Mystery Buttons Active State
        this.elements.mysteryBtns.forEach(btn => {
            if (btn.dataset.mystery === this.mystery) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Chaplet Buttons Active State
        this.elements.chapletBtns.forEach(btn => {
            if (btn.dataset.chaplet === this.chapletType) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Modal Title & Theme
        if (this.chapletType === 'misericordia') {
            this.elements.modal.classList.add('mode-misericordia');
            this.elements.modalTitle.textContent = 'Terço da Misericórdia';
        } else {
            this.elements.modal.classList.remove('mode-misericordia');
            this.elements.modalTitle.textContent = 'Santo Terço';
        }

        this.saveProgress();
    },

    refreshDisplay: function() {
         // Full update wrapper
         this.updateBeadClasses();
         this.updateTextAndUI();
    },

    // --- Navigation ---
    goTo: function(index) {
        if (index < 0) index = 0;
        if (index >= this.structure.length) index = this.structure.length - 1;
        this.currentBead = index;
        this.refreshDisplay();
    },

    findNextActive: function(from, dir) {
        let i = from + dir;
        while (i >= 0 && i < this.structure.length) {
            if (!this.isBeadDisabled(i)) return i;
            i += dir;
        }
        return from;
    },

    next: function() {
        const nextIdx = this.findNextActive(this.currentBead, 1);
        if (nextIdx !== this.currentBead) this.goTo(nextIdx);
    },

    prev: function() {
        const prevIdx = this.findNextActive(this.currentBead, -1);
        if (prevIdx !== this.currentBead) this.goTo(prevIdx);
    },

    open: function() {
        // If first time or structure changed (not really expected at runtime but safe)
        if (this.elements.container.children.length === 0) {
            this.renderBeads();
        }
        
        animateModal(this.elements.modal, true);
        
        // Ensure UI is synced (beads classes, text, scroll)
        // We call renderBeads above if empty, but we might need to just update classes if already rendered.
        // However, if we change modes while closed, we might need a re-render.
        // Safest is:
        this.renderBeads(); // Re-render to ensure correct disabled beads for current mode
        this.refreshDisplay();

        // Also check prompt
        if (isModalVisible(this.elements.rosarySuggestion)) {
            animateModal(this.elements.rosarySuggestion, false);
        }
    },

    close: function() {
        animateModal(this.elements.modal, false);
    },

    bindEvents: function() {
        // Open
        if (this.elements.btnRosary) {
            this.elements.btnRosary.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isModalVisible(this.elements.modal)) this.open();
                else this.close();
            });
        }
        
        // Close
        if (this.elements.closeBtn) this.elements.closeBtn.addEventListener('click', () => this.close());
        
        // Reset
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentBead = 0;
                this.refreshDisplay();
                showToast('Terço reiniciado!', 'success');
            });
        }

        // Nav Buttons
        if (this.elements.prevBtn) this.elements.prevBtn.addEventListener('click', () => this.prev());
        if (this.elements.nextBtn) this.elements.nextBtn.addEventListener('click', () => this.next());

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!isModalVisible(this.elements.modal)) return;
            
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.next();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.prev();
            }
        });

        // Mystery Selectors
        this.elements.mysteryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.mystery = btn.dataset.mystery;
                this.refreshDisplay();
            });
        });

        // Chaplet Selectors
        this.elements.chapletBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.chapletType = btn.dataset.chaplet;
                this.currentBead = 0;
                this.renderBeads(); // Re-render because disabled beads change
                this.refreshDisplay();
            });
        });

        // JS Language Selectors
        this.elements.langBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.lang = btn.dataset.lang;
                this.refreshDisplay();
            });
        });

        // Click Outside
        document.addEventListener('click', (e) => {
            if (isModalVisible(this.elements.modal) &&
                !this.elements.modal.contains(e.target) &&
                !this.elements.btnRosary.contains(e.target)) {
                this.close();
            }
        });
    }
};

window.RosarySystem = RosarySystem;
