const PrayerSystem = {
    prayers: [],
    currentPrayer: null,
    currentLang: 'pt',
    
    // Dependencies (Global)
    // animateModal, isModalVisible
    
    // DOM Elements
    elements: {
        grid: null,
        listModal: null,
        readerModal: null,
        readerTitle: null,
        readerText: null,
        langBtns: null,
        searchInput: null
    },

    init: function(prayersData) {
        this.prayers = prayersData;
        
        this.cacheDOM();
        this.bindEvents();
    },

    cacheDOM: function() {
        this.elements.grid = document.getElementById('prayer-grid');
        this.elements.listModal = document.getElementById('prayer-list');
        this.elements.readerModal = document.getElementById('prayer-reader');
        this.elements.readerTitle = document.getElementById('prayer-reader-title');
        this.elements.readerText = document.getElementById('prayer-text');
        this.elements.langBtns = document.querySelectorAll('.lang-btn');
        this.elements.langToggle = document.querySelector('#prayer-reader .lang-toggle');
        this.elements.searchInput = document.getElementById('prayer-search-input');
        this.elements.btnPrayers = document.getElementById('btn-prayers');
    },

    bindEvents: function() {
        // Open Button
        if (this.elements.btnPrayers) {
            this.elements.btnPrayers.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isModalVisible && isModalVisible(this.elements.listModal)) {
                    this.closeList();
                } else {
                    this.openList();
                }
            });
        }
        // Search Input
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                this.filterPrayers(e.target.value);
            });
        }

        // Language Toggle
        this.elements.langBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lang = e.target.dataset.lang;
                this.setLanguage(lang);
            });
        });

        // Close Buttons (handled in script.js for now or here? 
        // Better to handle specific prayer logic here, but generic close buttons are often handled centrally.
        // I will adhere to the existing pattern where specific buttons were handled in the prayer section of script.js)
        
        const closeListBtn = document.getElementById('close-prayer-list-btn');
        if (closeListBtn) closeListBtn.addEventListener('click', () => this.closeList());

        const closeReaderBtn = document.getElementById('close-prayer-reader-btn');
        if (closeReaderBtn) closeReaderBtn.addEventListener('click', () => this.closeReader());

        const backBtn = document.getElementById('back-to-list-btn');
        if (backBtn) backBtn.addEventListener('click', () => {
            this.closeReader();
            this.openList();
        });
        
        // Modal Outside Click (Managed globally in script.js usually, but we can add specific checks here if needed)
        // script.js handles the global click listener for these modals. I'll rely on script.js for that 
        // OR move that logic here. Moving it here makes this module more self-contained.
        // Modal Outside Click
        document.addEventListener('click', (e) => {
            if (isModalVisible && isModalVisible(this.elements.listModal) && 
                !this.elements.listModal.contains(e.target) && 
                !document.getElementById('btn-prayers').contains(e.target)) {
                this.closeList();
            }

            if (isModalVisible && isModalVisible(this.elements.readerModal) && 
                !this.elements.readerModal.contains(e.target)) {
                this.closeReader();
            }
        });
    },

    openList: function() {
        this.renderGrid(this.prayers); // Render all or filtered? Reset filter on open?
        // Let's reset filter on open
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        animateModal(this.elements.listModal, true);
        // Focus search
        setTimeout(() => {
             if (this.elements.searchInput) this.elements.searchInput.focus();
        }, 100);
    },

    closeList: function() {
        animateModal(this.elements.listModal, false);
    },

    openReader: function(prayer) {
        if (!prayer) return;
        this.currentPrayer = prayer;
        this.currentLang = 'pt'; // Default to PT
        this.updateReader();
        
        animateModal(this.elements.listModal, false);
        animateModal(this.elements.readerModal, true);
    },

    closeReader: function() {
        animateModal(this.elements.readerModal, false);
        this.currentPrayer = null;
    },

    setLanguage: function(lang) {
        this.currentLang = lang;
        this.updateReader();
    },

    updateReader: function() {
        if (!this.currentPrayer) return;
        
        this.elements.readerTitle.textContent = this.currentPrayer.title;
        // Check if lang exists, fallback to pt
        const text = this.currentPrayer.text[this.currentLang] || this.currentPrayer.text['pt'];
        this.elements.readerText.textContent = text;
        
        // Check availability of Latin
        const hasLatin = this.currentPrayer.text.la && this.currentPrayer.text.la.trim() !== '';
        
        if (this.elements.langToggle) {
             this.elements.langToggle.style.display = hasLatin ? 'flex' : 'none';
        }

        this.elements.langBtns.forEach(btn => {
            if (btn.dataset.lang === this.currentLang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    // --- Search Logic ---
    filterPrayers: function(query) {
        if (!query) {
            this.renderGrid(this.prayers);
            return;
        }

        const lowerQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const filtered = this.prayers.filter(p => {
            const title = p.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const textPt = (p.text.pt || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const textLa = (p.text.la || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            return title.includes(lowerQuery) || textPt.includes(lowerQuery) || textLa.includes(lowerQuery);
        });

        this.renderGrid(filtered);
    },

    renderGrid: function(prayersToRender) {
        this.elements.grid.innerHTML = '';
        
        if (prayersToRender.length === 0) {
            this.elements.grid.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.5);">Nenhuma oração encontrada.</div>';
            return;
        }

        prayersToRender.forEach(prayer => {
            const card = document.createElement('div');
            card.className = 'prayer-card';
            card.innerHTML = `
                <div class="prayer-card-icon">
                    <i class="ph ${prayer.icon}"></i>
                </div>
                <div class="prayer-card-title">${prayer.title}</div>
                <i class="ph ph-caret-right prayer-card-arrow"></i>
            `;
            
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openReader(prayer);
            });
            this.elements.grid.appendChild(card);
        });
    }
};

// Expose to window
window.PrayerSystem = PrayerSystem;
