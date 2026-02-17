
// ============================================================
// SITE BLOCKER LOGIC
// ============================================================

const Blocker = {
    state: {
        isEnabled: false,
        blockedSites: [], // Array of { id: number, url: string }
        updateInProgress: false
    },

    async init() {
        await this.loadState();
        this.renderUI();
        this.setupListeners();
    },

    async loadState() {
        const data = await chrome.storage.local.get(['blocker_enabled', 'blocker_sites']);
        this.state.isEnabled = data.blocker_enabled || false;
        this.state.blockedSites = data.blocker_sites || [];
        this.updateSwitchUI();
    },

    async saveState() {
        await chrome.storage.local.set({
            blocker_enabled: this.state.isEnabled,
            blocker_sites: this.state.blockedSites
        });
    },

    async toggleBlocker() {
        this.state.isEnabled = !this.state.isEnabled;
        await this.saveState();
        await this.updateRules();
        this.updateSwitchUI();
        
        if (this.state.isEnabled) {
            showToast('Bloqueador ativado!', 'success');
        } else {
            showToast('Bloqueador desativado.', 'info');
        }
    },

    async addSite(urlInput) {
        const domain = this.extractDomain(urlInput);
        if (!domain) {
            showToast('URL inválida.', 'error');
            return;
        }

        if (this.state.blockedSites.some(site => site.url === domain)) {
            showToast('Site já está na lista.', 'info');
            return;
        }

        const newId = Date.now(); // Simple ID generation
        this.state.blockedSites.push({ id: newId, url: domain });
        await this.saveState();
        await this.updateRules();
        this.renderUI();
        showToast('Site bloqueado com sucesso!', 'success');
    },

    async removeSite(id) {
        this.state.blockedSites = this.state.blockedSites.filter(site => site.id !== id);
        await this.saveState();
        await this.updateRules();
        this.renderUI();
        showToast('Site removido da lista.', 'info');
    },

    extractDomain(url) {
        try {
            // Add protocol if missing for URL parsing
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }
            const hostname = new URL(url).hostname;
            return hostname.replace(/^www\./, '');
        } catch (e) {
            return null;
        }
    },

    async updateRules() {
        // Mutex to prevent race conditions
        if (this.state.updateInProgress) {
            console.warn('[Blocker] Update already in progress, queuing retry...');
            await new Promise(resolve => setTimeout(resolve, 200));
            // Simple retry once
            if (this.state.updateInProgress) return; 
        }

        this.state.updateInProgress = true;

        try {
            // First, remove all existing dynamic rules to avoid conflicts
            const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
            const oldRuleIds = oldRules.map(rule => rule.id);
            
            // If disabled, just clear rules
            if (!this.state.isEnabled) {
                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: oldRuleIds,
                    addRules: []
                });
                return;
            }

            // Create new rules
            const newRules = this.state.blockedSites.map((site, index) => ({
                id: index + 1, // Rule IDs must be integers
                priority: 1,
                action: { 
                    type: 'redirect',
                    redirect: { extensionPath: '/blocked.html' }
                },
                condition: {
                    urlFilter: `||${site.url}`,
                    resourceTypes: ['main_frame']
                }
            }));

            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: oldRuleIds,
                addRules: newRules
            });
        } catch (error) {
            console.error('[Blocker] Failed to update rules:', error);
            showToast('Erro ao atualizar bloqueador', 'error');
        } finally {
            this.state.updateInProgress = false;
        }
    },

    // UI Handling
    renderUI() {
        const list = document.getElementById('blocked-sites-list');
        if (!list) return;

        list.innerHTML = '';
        this.state.blockedSites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'blocked-site-item glass-panel-sm';
            
            // Create span for URL (safe against XSS)
            const span = document.createElement('span');
            span.textContent = site.url;
            
            // Create delete button
            const btn = document.createElement('button');
            btn.className = 'icon-btn-sm text-danger';
            btn.innerHTML = '<i class="ph ph-trash"></i>';
            btn.title = 'Remover site';
            
            // Add event listener safely
            btn.addEventListener('click', () => this.removeSite(site.id));
            
            item.appendChild(span);
            item.appendChild(btn);
            
            list.appendChild(item);
        });
    },

    updateSwitchUI() {
        const toggle = document.getElementById('blocker-toggle');
        const statusText = document.getElementById('blocker-status-text');
        
        if (toggle) {
            toggle.checked = this.state.isEnabled;
        }
        
        if (statusText) {
            statusText.textContent = this.state.isEnabled ? 'Ativo' : 'Inativo';
            statusText.style.color = this.state.isEnabled ? 'var(--accent-color)' : 'var(--text-muted)';
        }
    },

    setupListeners() {
        const toggle = document.getElementById('blocker-toggle');
        if (toggle) {
            toggle.addEventListener('change', () => this.toggleBlocker());
        }

        const addBtn = document.getElementById('add-blocked-site-btn');
        const input = document.getElementById('blocked-site-input');
        
        if (addBtn && input) {
            const addAction = () => {
                const url = input.value.trim();
                if (url) {
                    this.addSite(url);
                    input.value = '';
                }
            };
            
            addBtn.addEventListener('click', addAction);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') addAction();
            });
        }
    }
};

// Expose to global scope for HTML constraints (thought modules are better, sticking to current pattern)
window.Blocker = Blocker;
