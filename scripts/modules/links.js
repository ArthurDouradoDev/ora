// links.js

document.addEventListener('DOMContentLoaded', () => {
    const linksContainer = document.getElementById('quick-links-container');
    const linksModal = document.getElementById('links-modal');
    const linksList = document.getElementById('manage-links-list');
    
    // Buttons
    const openLinksBtn = document.getElementById('manage-links-btn'); // Button in the main view
    const closeLinksBtn = document.getElementById('close-links-btn');
    const addLinkBtn = document.getElementById('add-link-btn');
    
    // Inputs
    const linkNameInput = document.getElementById('link-name-input');
    const linkUrlInput = document.getElementById('link-url-input');

    // Default Links
    const DEFAULT_LINKS = [
        { name: 'Google', url: 'https://google.com' },
        { name: 'ChatGPT', url: 'https://chatgpt.com' },
        { name: 'Liturgia das Horas', url: 'https://www.paulus.com.br/portal/liturgia-diaria-das-horas/' }
    ];

    // State
    let links = JSON.parse(localStorage.getItem('oraLinks'));
    
    if (!links) {
        links = DEFAULT_LINKS;
        // Save defaults immediately so they persist
        localStorage.setItem('oraLinks', JSON.stringify(links));
    }

    // Max limits
    const MAX_LINKS = 6;
    const MAX_NAME_LENGTH = 20;

    // --- Init ---
    renderLinks();
    setupEventListeners();

    function setupEventListeners() {
        // Open/Close Modal
        if (openLinksBtn) {
            openLinksBtn.addEventListener('click', () => {
                renderManageList();
                openModal(linksModal);
            });
        }

        if (closeLinksBtn) {
            closeLinksBtn.addEventListener('click', () => {
                closeModal(linksModal);
            });
        }

        // Close on click outside
        window.addEventListener('click', (e) => {
            // If user is typing in an input inside the modal, don't close it
            if (linksModal.contains(document.activeElement) && 
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            if (e.target === linksModal) {
                closeModal(linksModal);
            }
        });

        // Add Link
        if (addLinkBtn) {
            addLinkBtn.addEventListener('click', addNewLink);
        }
    }

    function getFavicon(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch (e) {
            return 'https://www.google.com/s2/favicons?domain=example.com';
        }
    }

    function isValidURL(urlString) {
        try {
            const url = new URL(urlString);
            return ['http:', 'https:'].includes(url.protocol);
        } catch (e) {
            return false;
        }
    }

    function renderLinks() {
        if (!linksContainer) return;
        
        linksContainer.innerHTML = '';

        // If no links, maybe show a placeholder or just the manage button?
        // User asked for a button to open the popup IN the section.
        // So we render the links + the manage button at the end.

        links.forEach(link => {
            const linkEl = document.createElement('a');
            linkEl.href = link.url;
            linkEl.target = '_blank';
            linkEl.className = 'quick-link glass-panel-sm';
            
            const img = document.createElement('img');
            img.src = getFavicon(link.url);
            img.alt = link.name;
            img.className = 'link-icon';
            
            const span = document.createElement('span');
            span.textContent = link.name;
            
            linkEl.appendChild(img);
            linkEl.appendChild(span);
            
            linksContainer.appendChild(linkEl);
        });

        // Append the "Manage" button at the end of the grid/row
        const manageBtn = document.createElement('button');
        manageBtn.id = 'manage-links-btn-dynamic';
        manageBtn.className = 'quick-link-add glass-panel-sm';
        manageBtn.title = 'Gerenciar Links';
        
        let iconClass = 'ph-plus';
        if (links.length === 0 || links.length >= MAX_LINKS) {
            iconClass = 'ph-link';
        }
        
        manageBtn.innerHTML = `<i class="ph ${iconClass}"></i>`;
        
        manageBtn.addEventListener('click', () => {
             renderManageList();
             openModal(linksModal);
        });

        linksContainer.appendChild(manageBtn);
    }

    function renderManageList() {
        if (!linksList) return;
        linksList.innerHTML = '';

        links.forEach((link, index) => {
            const item = document.createElement('div');
            item.className = 'manage-link-item glass-panel-sm';
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'link-info';
            
            const img = document.createElement('img');
            img.src = getFavicon(link.url);
            img.className = 'link-icon-sm';
            
            const span = document.createElement('span');
            span.textContent = link.name;
            
            infoDiv.appendChild(img);
            infoDiv.appendChild(span);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'icon-btn-sm delete-link-btn';
            deleteBtn.dataset.index = index;
            deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
            
            item.appendChild(infoDiv);
            item.appendChild(deleteBtn);
            
            linksList.appendChild(item);
        });

        // Add event listeners for delete buttons
        document.querySelectorAll('.delete-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                deleteLink(index);
            });
        });
        
        // Update Add Button State
        if (links.length >= MAX_LINKS) {
            addLinkBtn.disabled = true;
            addLinkBtn.style.opacity = '0.5';
            addLinkBtn.title = 'Limite máximo de 6 links atingido';
        } else {
            addLinkBtn.disabled = false;
            addLinkBtn.style.opacity = '1';
            addLinkBtn.title = 'Adicionar';
        }
    }

    function addNewLink() {
        const name = linkNameInput.value.trim();
        let url = linkUrlInput.value.trim();

        if (!name || !url) {
            showToast('Preencha nome e URL!', 'error');
            return;
        }

        if (name.length > MAX_NAME_LENGTH) {
            showToast(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`, 'error');
            return;
        }

        if (links.length >= MAX_LINKS) {
            showToast('Limite de 6 links atingido.', 'error');
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        if (!isValidURL(url)) {
            showToast('URL inválida! Use apenas HTTP ou HTTPS.', 'error');
            return;
        }

        links.push({ name, url });
        saveLinks();
        
        linkNameInput.value = '';
        linkUrlInput.value = '';
        
        renderManageList();
        renderLinks();
        showToast('Link adicionado!', 'success');
    }

    function deleteLink(index) {
        links.splice(index, 1);
        saveLinks(links);
        renderManageList();
        renderLinks();
        showToast('Link removido.', 'info');
    }

    // Load links
    function loadLinks() {
        try {
            const saved = SafeStorage.getItem('ora_quick_links');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    // Save links
    function saveLinks(links) {
        SafeStorage.setItem('ora_quick_links', JSON.stringify(links));
    }

    // Reuse existing helper if available, or define local
    function openModal(modal) {
        if (!modal) return;
        modal.style.display = 'flex';
        // Add animation class if not present
        if (!modal.classList.contains('active')) {
             modal.classList.add('active'); // Assuming css handles .glass-panel.active or similar
        }
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
});
