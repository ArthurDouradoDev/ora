const BackgroundSystem = {
    data: [],
    
    init(backgroundData) {
        // Accept data from script.js (which fetches it)
        this.data = backgroundData || [];
        this.setBackground();
        console.log('[Ora] Background System Initialized');
    },

    setBackground() {
        try {
            if (!this.data || this.data.length === 0) {
                console.warn('[Ora] No background images available.');
                return;
            }

            const today = new Date().toDateString();
            const savedDate = SafeStorage.getItem('catholic_dash_date');
            let imageUrl;

            // Check if we already have a saved image for today
            if (savedDate === today && SafeStorage.getItem('catholic_dash_image')) {
                imageUrl = SafeStorage.getItem('catholic_dash_image');
            } else {
                // Select a new random image
                const randomIndex = Math.floor(Math.random() * this.data.length);
                imageUrl = this.data[randomIndex];
                
                // Persist the selection
                SafeStorage.setItem('catholic_dash_date', today);
                SafeStorage.setItem('catholic_dash_image', imageUrl);
            }

            // Apply to body
            document.body.style.backgroundImage = `url('${imageUrl}')`;
            console.log('[Ora] Background set to:', imageUrl);

        } catch (e) {
            console.error('Error in BackgroundSystem.setBackground:', e);
        }
    }
};
