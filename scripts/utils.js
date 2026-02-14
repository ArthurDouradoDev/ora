// ============================================================
// UTILITIES (Global Helpers)
// ============================================================

// 1. Safe Storage Helper
// Works on file:// where localStorage might be blocked or throw errors
// 1. Safe Storage Helper (Synchronous - DEPRECATED)
// Kept for backward compatibility during migration
// SafeStorage removed - use AsyncStorage


// 1.5 Async Storage Helper (Chrome Storage API)
// Handles migration from localStorage on first access
const AsyncStorage = {
    get: async (key, defaultValue = null) => {
        try {
            const data = await chrome.storage.local.get([key]);
            
            // Check if key exists in chrome.storage
            if (data[key] !== undefined) {
                return data[key];
            }
            
            // If not, check localStorage (Migration)
            const localValue = localStorage.getItem(key);
            if (localValue !== null) {
                console.log(`[Storage] Migrating '${key}' from localStorage`);
                await chrome.storage.local.set({ [key]: localValue });
                // Optional: localStorage.removeItem(key); // Keep for safety for now
                return localValue;
            }

            return defaultValue;
        } catch (e) {
            console.error(`[AsyncStorage] Error getting '${key}':`, e);
            return defaultValue;
        }
    },

    set: async (key, value) => {
        try {
            await chrome.storage.local.set({ [key]: value });
            return true;
        } catch (e) {
            console.error(`[AsyncStorage] Error setting '${key}':`, e);
            return false;
        }
    },

    remove: async (key) => {
        try {
            await chrome.storage.local.remove(key);
            return true;
        } catch (e) {
            console.error(`[AsyncStorage] Error removing '${key}':`, e);
            return false;
        }
    }
};

// 1.1 Data Integrity Helper
async function loadDataWithIntegrity(url, expectedHash) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const dataStr = new TextDecoder().decode(buffer);
        const data = JSON.parse(dataStr); // Verify valid JSON first

        // Verify Hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashHex !== expectedHash) {
            console.error(`[Integrity] Mismatch for ${url}`);
            console.error(`Expected: ${expectedHash}`);
            console.error(`Actual:   ${hashHex}`);
            alert(`Atenção: A integridade do arquivo ${url} não pôde ser verificada. O arquivo pode ter sido alterado.`);
            throw new Error('Integrity check failed');
        }

        return data;
    } catch (e) {
        console.error(`[Integrity] Error loading ${url}:`, e);
        throw e;
    }
}
window.loadDataWithIntegrity = loadDataWithIntegrity;

// 2. Modal Animation Helpers
function animateModal(el, show) {
    if (!el) return;
    if (show) {
        el.classList.remove('modal-closing');
        el.style.display = 'flex';
        // Force reflow so the browser picks up the new animation
        void el.offsetWidth;
        el.classList.add('modal-opening');
    } else {
        if (el.style.display === 'none' || el.style.display === '') return;
        el.classList.remove('modal-opening');
        el.classList.add('modal-closing');
        const handler = (e) => {
            if (e.target !== el) return;
            if (!el.classList.contains('modal-closing')) return;
            el.style.display = 'none';
            el.classList.remove('modal-closing');
        };
        el.addEventListener('animationend', handler, { once: true });
        // Fallback in case animationend doesn't fire
        setTimeout(() => {
            if (el.classList.contains('modal-closing')) {
                el.style.display = 'none';
                el.classList.remove('modal-closing');
            }
        }, 500);
    }
}

function isModalVisible(el) {
    return el && el.style.display !== 'none' && el.style.display !== '' && !el.classList.contains('modal-closing');
}

// 3. Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Guard clause

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon;
    if (type === 'success') icon = 'ph-check-circle';
    else if (type === 'error') icon = 'ph-warning-circle';
    else icon = 'ph-info';

    toast.innerHTML = `<i class="ph ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

// Expose globally (explicitly, though const/function in root scope usually does this in non-module scripts)

window.animateModal = animateModal;
window.isModalVisible = isModalVisible;
window.showToast = showToast;

console.log('[Ora] Utils initialized');

// 4. Debounce Utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
window.debounce = debounce;
