// ============================================================
// UTILITIES (Global Helpers)
// ============================================================

// 0. i18n System
window._i18nStrings = {};
window._i18nFallback = {};
window._i18nLocale = 'pt';

/**
 * Get a translated string by dot-notation key.
 * Supports template interpolation: t('toast.link_name_max', { max: 20 })
 * Falls back to Portuguese if key not found in active locale.
 */
function t(key, params) {
    const keys = key.split('.');
    let value = window._i18nStrings;
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            value = undefined;
            break;
        }
    }
    // Fallback to Portuguese
    if (value === undefined) {
        value = window._i18nFallback;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                value = key; // Return the key itself as last resort
                break;
            }
        }
    }
    // Template interpolation
    if (typeof value === 'string' && params) {
        for (const [pKey, pVal] of Object.entries(params)) {
            value = value.replace(new RegExp(`\\{${pKey}\\}`, 'g'), pVal);
        }
    }
    return value;
}
window.t = t;

/**
 * Apply translations to all DOM elements with data-i18n attributes.
 * - data-i18n="key" → sets textContent
 * - data-i18n-placeholder="key" → sets placeholder
 * - data-i18n-title="key" → sets title attribute
 * - data-i18n-html="key" → sets innerHTML (for elements with icons)
 */
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = t(key);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (key) {
            // Preserve existing icon markup, replace text after last </i>
            const icon = el.querySelector('i');
            if (icon) {
                // Keep icon, replace text
                const iconHtml = icon.outerHTML;
                el.innerHTML = iconHtml + ' ' + t(key);
            } else {
                el.textContent = t(key);
            }
        }
    });
    document.querySelectorAll('[data-i18n-href]').forEach(el => {
        const key = el.getAttribute('data-i18n-href');
        if (key) el.href = t(key);
    });
}
window.applyI18n = applyI18n;

/**
 * Resolve a locale-aware value from an object with {pt, en, es} keys.
 * If the input is a plain string, returns it as-is.
 * Usage: l(verse.text) → returns the string for the active locale.
 */
function l(obj) {
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj === 'object') {
        const locale = window._i18nLocale || 'pt';
        return obj[locale] || obj.pt || '';
    }
    return '';
}
window.l = l;

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

// 1.1 Data Loading Helper
async function loadJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`[Data] Error loading ${url}:`, e);
        throw e;
    }
}
window.loadJSON = loadJSON;

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
