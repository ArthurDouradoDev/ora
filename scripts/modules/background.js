const BackgroundSystem = {
    data: [],
    
    async init(backgroundData) {
        // Accept data from script.js (which fetches it)
        this.data = backgroundData || [];
        await this.setBackground();
        console.log('[Ora] Background System Initialized');
    },

    /**
     * Resolves the image URL for today (from storage or random selection).
     * Can be called independently to start preloading early.
     */
    async resolveImageUrl(backgroundData) {
        const data = backgroundData || this.data;
        if (!data || data.length === 0) return null;

        const today = new Date().toDateString();
        const savedDate = await AsyncStorage.get('catholic_dash_date');
        const savedImage = await AsyncStorage.get('catholic_dash_image');

        if (savedDate === today && savedImage) {
            return savedImage;
        }

        const randomIndex = Math.floor(Math.random() * data.length);
        const imageUrl = data[randomIndex];
        await AsyncStorage.set('catholic_dash_date', today);
        await AsyncStorage.set('catholic_dash_image', imageUrl);
        return imageUrl;
    },

    async setBackground() {
        try {
            if (!this.data || this.data.length === 0) {
                console.warn('[Ora] No background images available.');
                window.dispatchEvent(new Event('ora:background-ready'));
                return;
            }

            const imageUrl = await this.resolveImageUrl();
            if (!imageUrl) {
                window.dispatchEvent(new Event('ora:background-ready'));
                return;
            }

            // Check if image was already loaded this session (cached)
            const session = await chrome.storage.session.get('ora_bg_loaded');
            if (session.ora_bg_loaded) {
                // Image is in browser cache — apply directly, no preload needed
                document.body.style.backgroundImage = `url('${imageUrl}')`;
                window.dispatchEvent(new Event('ora:background-ready'));
                console.log('[Ora] Background set from cache:', imageUrl);
                return;
            }

            // First load — preload image before applying
            const img = new Image();
            img.onload = () => {
                document.body.style.backgroundImage = `url('${imageUrl}')`;
                chrome.storage.session.set({ ora_bg_loaded: true });
                window.dispatchEvent(new Event('ora:background-ready'));
                console.log('[Ora] Background set to:', imageUrl);
            };
            img.onerror = () => {
                console.warn('[Ora] Background image failed to load:', imageUrl);
                chrome.storage.session.set({ ora_bg_loaded: true });
                window.dispatchEvent(new Event('ora:background-ready'));
            };
            img.src = imageUrl;

        } catch (e) {
            console.error('Error in BackgroundSystem.setBackground:', e);
            window.dispatchEvent(new Event('ora:background-ready'));
        }
    }
};
