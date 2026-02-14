// ============================================================
// UTILITIES (Global Helpers)
// ============================================================

// 1. Safe Storage Helper
// Works on file:// where localStorage might be blocked or throw errors
const SafeStorage = {
    getItem: (key) => {
        try { 
            return localStorage.getItem(key); 
        } catch (e) { 
            console.error(`[Storage] Error reading '${key}':`, e);
            return null; 
        }
    },
    setItem: (key, value) => {
        try { 
            localStorage.setItem(key, value); 
            return true;
        } catch (e) { 
            console.error(`[Storage] Error saving '${key}':`, e);
            if (window.showToast) window.showToast('Erro ao salvar dados. Armazenamento cheio?', 'error');
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
window.SafeStorage = SafeStorage;
window.animateModal = animateModal;
window.isModalVisible = isModalVisible;
window.showToast = showToast;

console.log('[Ora] Utils initialized');
