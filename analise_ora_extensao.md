# 📊 Análise de Segurança e Melhorias - Extensão Ora

## 🎯 Visão Geral
Extensão Chrome para produtividade e espiritualidade com funcionalidades de Timer Pomodoro, Terço, Player de música, Bloqueador de sites e Exame de consciência.

---

## 🔴 VULNERABILIDADES CRÍTICAS DE SEGURANÇA

### 1. **XSS (Cross-Site Scripting) - CRÍTICO** 🚨

#### **Localização**: `scripts/modules/blocker.js` (linha ~87)
```javascript
item.innerHTML = `
    <span>${site.url}</span>
    <button class="icon-btn-sm text-danger" onclick="Blocker.removeSite(${site.id})">
        <i class="ph ph-trash"></i>
    </button>
`;
```

**Problema**: Inserção direta de `site.url` sem sanitização no innerHTML. Um atacante pode injetar código malicioso via URL.

**Exploit Exemplo**:
```javascript
// URL maliciosa que poderia ser adicionada
<img src=x onerror="alert('XSS')">
```

**Impacto**: 
- Execução de código JavaScript arbitrário
- Roubo de dados do localStorage
- Sequestro de sessão

**Solução**:
```javascript
// Usar textContent ao invés de innerHTML
const span = document.createElement('span');
span.textContent = site.url; // Escapa automaticamente

// Ou usar DOMPurify
item.innerHTML = DOMPurify.sanitize(`<span>${site.url}</span>...`);
```

---

#### **Localização**: `scripts/modules/links.js` (linhas ~104-112)
```javascript
linkEl.innerHTML = `
    <img src="${getFavicon(link.url)}" alt="${link.name}" class="link-icon">
    <span>${link.name}</span>
`;

item.innerHTML = `
    <div class="link-info">
        <img src="${getFavicon(link.url)}" class="link-icon-sm">
        <span>${link.name}</span>
    </div>
    ...
`;
```

**Problema**: `link.name` e `link.url` inseridos sem sanitização.

**Exploit Exemplo**:
```javascript
{
  name: '<img src=x onerror="alert(document.cookie)">',
  url: 'javascript:alert("XSS")'
}
```

**Solução**:
```javascript
// Criar elementos DOM manualmente
const linkEl = document.createElement('a');
linkEl.href = link.url;
linkEl.target = '_blank';
linkEl.className = 'quick-link glass-panel-sm';

const img = document.createElement('img');
img.src = getFavicon(link.url);
img.alt = link.name;
img.className = 'link-icon';

const span = document.createElement('span');
span.textContent = link.name; // Escapa automaticamente

linkEl.appendChild(img);
linkEl.appendChild(span);
```

---

### 2. **Content Security Policy (CSP) Fraca** ⚠️

#### **Localização**: `manifest.json`
```json
"content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; frame-src https://* http://*; connect-src https://* http://*; img-src 'self' https://* http://* data:;"
}
```

**Problemas**:
1. **`frame-src https://* http://*`** - Permite carregar qualquer iframe de qualquer origem
2. **`connect-src https://* http://*`** - Permite conexões a qualquer domínio
3. **Permite HTTP não seguro** - Deveria usar apenas HTTPS

**Impacto**:
- Possível clickjacking
- Vazamento de dados para servidores maliciosos
- Man-in-the-middle attacks via HTTP

**Solução Recomendada**:
```json
"content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; frame-src https://www.youtube.com https://open.spotify.com https://*.github.io; connect-src https://api.unsplash.com https://www.google.com; img-src 'self' https: data:; default-src 'self'; upgrade-insecure-requests;"
}
```

---

### 3. **Validação de URL Inadequada** ⚠️

#### **Localização**: `scripts/modules/links.js` (linha ~137)
```javascript
if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
}
```

**Problema**: Adiciona automaticamente `https://` sem validar se a URL é válida.

**Exploit Exemplo**:
```javascript
// URLs perigosas que passariam
"javascript:alert('XSS')"
"data:text/html,<script>alert('XSS')</script>"
"file:///etc/passwd"
```

**Solução**:
```javascript
function isValidURL(urlString) {
    try {
        const url = new URL(urlString);
        // Permitir apenas HTTP e HTTPS
        return ['http:', 'https:'].includes(url.protocol);
    } catch (e) {
        return false;
    }
}

function addNewLink() {
    const name = linkNameInput.value.trim();
    let url = linkUrlInput.value.trim();

    if (!name || !url) {
        showToast('Preencha nome e URL!', 'error');
        return;
    }

    // Adicionar protocolo se necessário
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // Validar URL
    if (!isValidURL(url)) {
        showToast('URL inválida! Use apenas HTTP ou HTTPS.', 'error');
        return;
    }

    // Resto do código...
}
```

---

### 4. **Uso de `onclick` Inline** ⚠️

#### **Localização**: Vários arquivos
```javascript
// blocker.js
onclick="Blocker.removeSite(${site.id})"
```

**Problema**: 
- Viola princípios de separação de código
- Pode ser explorado via XSS
- Dificulta CSP restritivo

**Solução**:
```javascript
const btn = document.createElement('button');
btn.className = 'icon-btn-sm text-danger';
btn.innerHTML = '<i class="ph ph-trash"></i>';
btn.addEventListener('click', () => this.removeSite(site.id));
```

---

## 🟡 PROBLEMAS DE CÓDIGO E ARQUITETURA

### 5. **Arquivo Obsoleto no Projeto** 📁

#### **Localização**: `script.js`
```markdown
`script.js`: (Obsoleto) Lógica antiga, migrada para `scripts/main.js`.
```

**Problema**: Código morto que polui o repositório e pode causar confusão.

**Solução**: Remover o arquivo ou mover para um diretório `/legacy` se precisar manter histórico.

---

### 6. **Permissões Excessivas** 🔓

#### **Localização**: `manifest.json`
```json
"host_permissions": ["<all_urls>"]
```

**Problema**: Permissão para acessar TODOS os sites. Violação do princípio do menor privilégio.

**Impacto**:
- Usuários podem desconfiar
- Vulnerabilidade se a extensão for comprometida
- Não segue as melhores práticas do Chrome Web Store

**Solução**: Especificar apenas os domínios necessários:
```json
"host_permissions": [
    "https://*.unsplash.com/*",
    "https://*.google.com/*",
    "https://*.youtube.com/*",
    "https://*.spotify.com/*"
]
```

---

### 7. **Falta de Tratamento de Erros** ❌

#### **Localização**: `scripts/modules/links.js` (getFavicon)
```javascript
function getFavicon(url) {
    try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
        return 'https://www.google.com/s2/favicons?domain=example.com';
    }
}
```

**Problema**: 
- Retorna favicon do example.com em caso de erro
- Não loga o erro para debugging
- Não informa o usuário

**Solução**:
```javascript
function getFavicon(url) {
    try {
        const urlObj = new URL(url);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Protocolo inválido');
        }
        const domain = urlObj.hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
        console.error('[Links] Erro ao obter favicon:', e);
        // Retornar um ícone genérico local
        return 'assets/icon-placeholder.png';
    }
}
```

---

### 8. **localStorage Pode Falhar Silenciosamente** 💾

#### **Localização**: `scripts/utils.js`
```javascript
const SafeStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { return null; }
    },
    setItem: (key, value) => {
        try { localStorage.setItem(key, value); }
        catch (e) { /* silently fail */ }
    }
};
```

**Problema**: 
- Falhas de gravação são silenciosas
- Usuário perde dados sem saber
- Dificulta debugging

**Solução**:
```javascript
const SafeStorage = {
    getItem: (key) => {
        try { 
            return localStorage.getItem(key); 
        } catch (e) { 
            console.error(`[Storage] Erro ao ler '${key}':`, e);
            return null; 
        }
    },
    setItem: (key, value) => {
        try { 
            localStorage.setItem(key, value); 
            return true;
        } catch (e) { 
            console.error(`[Storage] Erro ao salvar '${key}':`, e);
            showToast('Erro ao salvar dados. Verifique o espaço disponível.', 'error');
            return false;
        }
    }
};
```

---

### 9. **Race Condition no Blocker** 🏁

#### **Localização**: `scripts/modules/blocker.js` (updateRules)
```javascript
async updateRules() {
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map(rule => rule.id);
    
    // ...
    
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: oldRuleIds,
        addRules: newRules
    });
}
```

**Problema**: Se dois updates acontecerem simultaneamente, pode haver inconsistência.

**Solução**: Implementar um lock/mutex:
```javascript
let updateInProgress = false;

async updateRules() {
    // Evitar múltiplas atualizações simultâneas
    if (updateInProgress) {
        console.warn('[Blocker] Update já em progresso, aguardando...');
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.updateRules(); // Retry
    }

    updateInProgress = true;
    
    try {
        const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        const oldRuleIds = oldRules.map(rule => rule.id);
        
        // ... resto do código
        
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds,
            addRules: newRules
        });
    } catch (error) {
        console.error('[Blocker] Erro ao atualizar regras:', error);
        showToast('Erro ao atualizar bloqueador', 'error');
    } finally {
        updateInProgress = false;
    }
}
```

---

### 10. **Falta de Sanitização em Exames** ✍️

#### **Localização**: `scripts/modules/exam.js` (linha ~53)
```javascript
textarea.value = examAnswers[currentExamStep] || '';
textarea.addEventListener('input', (e) => {
    examAnswers[currentExamStep] = e.target.value;
});
```

**Problema**: Texto do usuário é armazenado sem validação. Pode causar problemas se renderizado incorretamente.

**Solução**: Adicionar limite de caracteres e sanitização:
```javascript
const MAX_ANSWER_LENGTH = 5000;

textarea.addEventListener('input', (e) => {
    let value = e.target.value;
    
    // Limitar tamanho
    if (value.length > MAX_ANSWER_LENGTH) {
        value = value.substring(0, MAX_ANSWER_LENGTH);
        e.target.value = value;
        showToast(`Limite de ${MAX_ANSWER_LENGTH} caracteres atingido`, 'info');
    }
    
    examAnswers[currentExamStep] = value;
});
```

---

## 🟢 MELHORIAS RECOMENDADAS

### 11. **Implementar Content Hash para Integridade** ✅

**Problema**: Arquivos JSON e backgrounds podem ser adulterados.

**Solução**: Adicionar verificação de integridade:
```javascript
async function loadDataWithIntegrity(url, expectedHash) {
    const response = await fetch(url);
    const data = await response.json();
    
    const dataStr = JSON.stringify(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', 
        new TextEncoder().encode(dataStr));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (hashHex !== expectedHash) {
        throw new Error('Integridade dos dados comprometida!');
    }
    
    return data;
}
```

---

### 12. **Migrar para Chrome Storage API** 💾

**Problema**: localStorage tem limitações e pode falhar.

**Solução**: Usar chrome.storage.local que é mais robusto:
```javascript
// Substituir SafeStorage
const SafeStorage = {
    async getItem(key) {
        try {
            const result = await chrome.storage.local.get([key]);
            return result[key] || null;
        } catch (e) {
            console.error(`[Storage] Erro ao ler '${key}':`, e);
            return null;
        }
    },
    
    async setItem(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
            return true;
        } catch (e) {
            console.error(`[Storage] Erro ao salvar '${key}':`, e);
            showToast('Erro ao salvar dados', 'error');
            return false;
        }
    }
};
```

---

### 13. **Adicionar Rate Limiting** ⏱️

**Problema**: Usuário pode spam de adições/remoções.

**Solução**: Implementar debounce/throttle:
```javascript
// utils.js
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

// Uso em links.js
const debouncedAddLink = debounce(addNewLink, 300);
addLinkBtn.addEventListener('click', debouncedAddLink);
```

---

### 14. **Adicionar Testes Unitários** 🧪

**Problema**: Nenhum teste automatizado.

**Solução**: Implementar Jest:
```javascript
// __tests__/blocker.test.js
describe('Blocker', () => {
    test('extractDomain deve extrair domínio corretamente', () => {
        expect(Blocker.extractDomain('https://www.facebook.com/page'))
            .toBe('facebook.com');
        expect(Blocker.extractDomain('facebook.com'))
            .toBe('facebook.com');
    });
    
    test('extractDomain deve retornar null para URLs inválidas', () => {
        expect(Blocker.extractDomain('javascript:alert(1)')).toBeNull();
        expect(Blocker.extractDomain('not a url')).toBeNull();
    });
});
```

---

### 15. **Documentar Código com JSDoc** 📝

**Problema**: Falta de documentação inline.

**Solução**:
```javascript
/**
 * Extrai o domínio de uma URL
 * @param {string} url - URL completa ou domínio
 * @returns {string|null} Domínio extraído ou null se inválido
 * @example
 * extractDomain('https://www.example.com') // 'example.com'
 */
extractDomain(url) {
    try {
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return null;
    }
}
```

---

### 16. **Adicionar Service Worker** 🔧

**Problema**: Extensão não usa background script (Manifest V3).

**Solução**: Criar service worker para tarefas em background:
```javascript
// background.js (novo arquivo)
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Setup inicial
        chrome.storage.local.set({
            firstInstall: Date.now(),
            version: chrome.runtime.getManifest().version
        });
    }
});

// Limpar dados antigos periodicamente
chrome.alarms.create('cleanupStorage', { periodInMinutes: 60 * 24 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanupStorage') {
        // Limpar dados antigos
    }
});
```

Adicionar ao manifest:
```json
"background": {
    "service_worker": "background.js"
}
```

---

### 17. **Melhorar Acessibilidade (a11y)** ♿

**Problemas**:
- Falta de labels ARIA
- Contraste de cores pode ser insuficiente
- Navegação por teclado limitada

**Soluções**:
```html
<!-- Adicionar ARIA labels -->
<button id="btn-music" aria-label="Abrir biblioteca de música">
    <i class="ph ph-music-notes"></i>
</button>

<!-- Melhorar contraste -->
<style>
:root {
    --text-primary: #ffffff; /* Contrast ratio > 4.5:1 */
    --text-secondary: #e0e0e0;
}
</style>

<!-- Suporte a teclado -->
<script>
// Adicionar navegação por Tab
document.querySelectorAll('.quick-link').forEach(link => {
    link.setAttribute('tabindex', '0');
});
</script>
```

---

### 18. **Implementar Backup/Export de Dados** 💾

**Problema**: Usuário não pode fazer backup de suas configurações.

**Solução**:
```javascript
// Adicionar botão de export
function exportData() {
    const data = {
        links: JSON.parse(SafeStorage.getItem('ora_quick_links') || '[]'),
        blockedSites: JSON.parse(SafeStorage.getItem('ora_blocked_sites') || '[]'),
        focusSettings: JSON.parse(SafeStorage.getItem('ora_focus_settings') || '{}'),
        playlists: JSON.parse(SafeStorage.getItem('ora_user_playlists') || '[]'),
        exportDate: new Date().toISOString(),
        version: '1.1'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], 
        { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ora-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast('Backup criado com sucesso!', 'success');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validar versão
            if (!data.version || data.version !== '1.1') {
                throw new Error('Versão incompatível');
            }
            
            // Restaurar dados
            SafeStorage.setItem('ora_quick_links', 
                JSON.stringify(data.links));
            SafeStorage.setItem('ora_blocked_sites', 
                JSON.stringify(data.blockedSites));
            // ... outros campos
            
            showToast('Dados importados com sucesso!', 'success');
            location.reload();
        } catch (error) {
            showToast('Erro ao importar dados: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO PRIORITÁRIA

### Segurança (Implementar IMEDIATAMENTE)
- [ ] **Crítico 1**: Corrigir XSS em blocker.js (usar textContent)
- [ ] **Crítico 2**: Corrigir XSS em links.js (criar elementos DOM)
- [ ] **Alto 1**: Validar URLs com whitelist de protocolos
- [ ] **Alto 2**: Restringir CSP no manifest.json
- [ ] **Alto 3**: Reduzir host_permissions para domínios específicos
- [ ] **Médio 1**: Remover onclick inline

### Qualidade de Código (1-2 semanas)
- [ ] Remover script.js obsoleto
- [ ] Adicionar tratamento de erros com logs
- [ ] Implementar debounce em inputs
- [ ] Adicionar limites de caracteres
- [ ] Migrar para chrome.storage.local

### Melhorias (1 mês)
- [ ] Adicionar testes unitários
- [ ] Documentar com JSDoc
- [ ] Implementar service worker
- [ ] Melhorar acessibilidade
- [ ] Adicionar backup/export

---

## 🎯 PRIORIZAÇÃO POR IMPACTO

| Prioridade | Item | Impacto | Esforço | ROI |
|------------|------|---------|---------|-----|
| 🔴 P0 | Corrigir XSS | Crítico | Baixo | ⭐⭐⭐⭐⭐ |
| 🔴 P0 | Validação de URL | Alto | Baixo | ⭐⭐⭐⭐⭐ |
| 🟡 P1 | Restringir CSP | Alto | Médio | ⭐⭐⭐⭐ |
| 🟡 P1 | Reduzir permissões | Médio | Baixo | ⭐⭐⭐⭐ |
| 🟢 P2 | chrome.storage.local | Médio | Médio | ⭐⭐⭐ |
| 🟢 P2 | Testes unitários | Baixo | Alto | ⭐⭐⭐ |
| 🔵 P3 | Acessibilidade | Médio | Alto | ⭐⭐ |
| 🔵 P3 | Backup/Export | Baixo | Médio | ⭐⭐ |

---

## 📚 RECURSOS RECOMENDADOS

1. **Segurança**:
   - [OWASP Top 10](https://owasp.org/www-project-top-ten/)
   - [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)

2. **Boas Práticas**:
   - [Chrome Extension Best Practices](https://developer.chrome.com/docs/extensions/mv3/devguide/)
   - [Web Security Academy](https://portswigger.net/web-security)

3. **Ferramentas**:
   - [DOMPurify](https://github.com/cure53/DOMPurify) - Sanitização HTML
   - [Jest](https://jestjs.io/) - Framework de testes
   - [ESLint](https://eslint.org/) - Linter JavaScript

---

## ✅ CONCLUSÃO

A extensão Ora tem um conceito excelente e código bem organizado, mas apresenta **vulnerabilidades críticas de segurança** que devem ser corrigidas imediatamente antes de qualquer publicação pública.

### Principais Ações:
1. ✅ Corrigir todos os pontos de XSS
2. ✅ Implementar validação robusta de URLs
3. ✅ Restringir permissões no manifest
4. ✅ Adicionar tratamento de erros adequado
5. ✅ Implementar testes automatizados

**Estimativa de tempo para correções críticas**: 1-2 dias
**Estimativa de tempo para melhorias completas**: 2-3 semanas

---

**Data da Análise**: {{ data_atual }}
**Versão Analisada**: 1.1
**Analista**: Claude (Anthropic)
