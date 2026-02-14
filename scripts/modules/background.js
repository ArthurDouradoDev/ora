const BackgroundSystem = {
    data: [],
    
    async init(backgroundData) {
        // Accept data from script.js (which fetches it)
        this.data = backgroundData || [];
        await this.setBackground();
        console.log('[Ora] Background System Initialized');
    },

    async setBackground() {
        try {
            if (!this.data || this.data.length === 0) {
                console.warn('[Ora] No background images available.');
                return;
            }

            const today = new Date().toDateString();
            const savedDate = await AsyncStorage.get('catholic_dash_date');
            let imageUrl;

            // Check if we already have a saved image for today
            const savedImage = await AsyncStorage.get('catholic_dash_image');
            if (savedDate === today && savedImage) {
                imageUrl = savedImage;
            } else {
                // Select a new random image
                const randomIndex = Math.floor(Math.random() * this.data.length);
                imageUrl = this.data[randomIndex];
                
                // Persist the selection
                await AsyncStorage.set('catholic_dash_date', today);
                await AsyncStorage.set('catholic_dash_image', imageUrl);
            }

            // Apply to body
            document.body.style.backgroundImage = `url('${imageUrl}')`;
            console.log('[Ora] Background set to:', imageUrl);

        } catch (e) {
            console.error('Error in BackgroundSystem.setBackground:', e);
        }
    }
};
