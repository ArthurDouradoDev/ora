// Shared logic — single source of truth in scripts/shared/blocker-core.js
const { DOMAIN_ALIASES, isWithinBlockedSchedule, minutesUntilBlockedWindow, buildAllowRules } = BlockerCore;

(async function () {
    // Read domain from query param (?domain=) with hash (#) fallback
    const params = new URLSearchParams(location.search);
    const domain = (params.get('domain') || location.hash.slice(1)).replace(/^www\./, '');

    if (!domain) {
        document.getElementById('always-section').style.display = 'block';
        return;
    }

    let config;
    try {
        const data = await chrome.storage.local.get(['blocker_config']);
        config = data.blocker_config;
    } catch (e) {
        console.error('[Blocked] Failed to load config:', e);
        document.getElementById('always-section').style.display = 'block';
        return;
    }

    if (!config || !config.sites) {
        document.getElementById('always-section').style.display = 'block';
        return;
    }

    // The domain is the primary domain set by blocker.js / sw.js.
    // Try exact match first, then endsWith for subdomains.
    const site = config.sites.find(s => s.url === domain)
              || config.sites.find(s => domain.endsWith(s.url));
    if (!site) {
        document.getElementById('always-section').style.display = 'block';
        return;
    }

    // Reset daily counters if date changed
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (site.lastAccessDate !== todayStr) {
        site.todayAccesses = 0;
        site.lastAccessDate = todayStr;
        await chrome.storage.local.set({ blocker_config: config });
    }

    // ALWAYS mode — hard block, with optional gospel unlock (global setting)
    if (site.mode === 'always') {
        document.getElementById('always-section').style.display = 'block';

        // Show gospel-unlock button if the global setting is enabled
        if (config.lock?.writeUnlockEnabled) {
            const alwaysUnlockBtn = document.getElementById('always-verse-unlock-btn');
            if (alwaysUnlockBtn) {
                alwaysUnlockBtn.style.display = '';
                alwaysUnlockBtn.addEventListener('click', () => {
                    showGospelUnlock(() => allowAndNavigate(domain, 60));
                });
            }
        }

        return;
    }

    // LIMITED mode — evaluate limits
    const hasAccessLimit = site.accessLimit?.enabled && (site.accessLimit.count || 0) > 0;
    const hasScheduleLimit = site.scheduleLimit?.enabled;

    const scheduleBlocked = hasScheduleLimit && isWithinBlockedSchedule(site.scheduleLimit);
    const accessExceeded = hasAccessLimit && site.todayAccesses >= site.accessLimit.count;

    const pad = n => String(n).padStart(2, '0');

    // ── Hard block (no continue option) ──────────────
    if (scheduleBlocked || accessExceeded) {
        const section = document.getElementById('overlimit-section');
        section.style.display = 'block';

        const badgeEl = document.getElementById('overlimit-badge');
        const badgeText = document.getElementById('overlimit-badge-text');
        const msg = document.getElementById('overlimit-message');

        if (scheduleBlocked) {
            badgeEl.className = 'reason-badge badge-time';
            badgeEl.innerHTML = '<i class="ph ph-clock"></i><span id="overlimit-badge-text">Fora do horário</span>';

            // Find the active schedule
            const now = new Date();
            const cur = now.getHours() * 60 + now.getMinutes();
            let activeSchedule = site.scheduleLimit.schedules[0];
            for (const schedule of site.scheduleLimit.schedules) {
                const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
                const to = (schedule.toHour || 0) * 60 + (schedule.toMinute || 0);
                const isBlocked = from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
                if (isBlocked) { activeSchedule = schedule; break; }
            }

            const fromStr = `${pad(activeSchedule.fromHour)}:${pad(activeSchedule.fromMinute)}`;
            const toStr = `${pad(activeSchedule.toHour)}:${pad(activeSchedule.toMinute)}`;
            msg.textContent = `${site.url} está bloqueado das ${fromStr} às ${toStr}.`;
        } else {
            badgeText.textContent = 'Limite de acessos excedido';
            msg.textContent = `Você já acessou ${site.url} ${site.todayAccesses} de ${site.accessLimit.count} vezes hoje.`;
        }

        // Show gospel-unlock button if the per-site feature is enabled
        if (site.writeUnlockEnabled) {
            const unlockBtn = document.getElementById('verse-unlock-btn');
            if (unlockBtn) {
                unlockBtn.innerHTML = '<i class="ph ph-book-open-text"></i> Acessar com evangelho';
                unlockBtn.style.display = '';
                unlockBtn.addEventListener('click', () => {
                    showGospelUnlock(() => allowAndNavigate(domain, 60));
                });
            }
        }

        return;
    }

    /**
     * Helper: create allow rules, notify SW to set up revoke alarm,
     * then navigate to the target site.
     */
    async function allowAndNavigate(targetDomain, durationMinutes) {
        const { ruleId, rules } = buildAllowRules(site.url);

        // Fetch original full URL to preserve path/query (UX improvement)
        let finalUrl = `https://${targetDomain}`;
        try {
            // First check if the fallback blocker passed it via query param
            let originalUrl = params.get('url');

            // If not, ask the Background SW (since DNR strips it)
            if (!originalUrl) {
                const response = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ action: 'get_original_url' }, resolve);
                });
                if (response && response.url) {
                    originalUrl = response.url;
                }
            }

            // Security check: ensure the retrieved URL belongs to the blocked domain
            // or one of its aliases so we don't accidentally redirect elsewhere.
            if (originalUrl) {
                const urlObj = new URL(originalUrl);
                const originalHostname = urlObj.hostname.replace(/^www\./, '');
                const allAllowedDomains = [targetDomain, ...(DOMAIN_ALIASES[targetDomain] || [])];
                
                if (allAllowedDomains.some(d => originalHostname === d || originalHostname.endsWith('.' + d))) {
                    finalUrl = originalUrl;
                }
            }
        } catch (e) {
            console.error('[Blocked] Failed to fetch original URL:', e);
        }

        // Create allow rules (primary + aliases via requestDomains)
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [ruleId],
            addRules: rules
        });

        // Wait for SW to register the session BEFORE navigating,
        // so the webNavigation fallback doesn't re-block the tab.
        await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { action: 'setup_revoke_alarm', ruleId, durationMinutes },
                () => resolve()
            );
        });

        window.location.replace(finalUrl);
    }

    // ── No limits blocking AND no access limit → auto-continue (transparent) ──
    if (!hasAccessLimit) {
        let durationMinutes = 60;
        if (hasScheduleLimit) {
            durationMinutes = Math.min(durationMinutes, minutesUntilBlockedWindow(site.scheduleLimit));
        }
        await allowAndNavigate(domain, durationMinutes);
        return;
    }

    // ── Access limit active and not exceeded → show counter + Continue ──
    document.getElementById('limited-section').style.display = 'block';

    const accessInfo = document.getElementById('access-info');
    const usageBar = document.getElementById('usage-bar-fill');
    const sessionNote = document.getElementById('session-note');

    accessInfo.innerHTML = `Acesso <strong>${site.todayAccesses + 1}</strong> de <strong>${site.accessLimit.count}</strong> (${site.accessLimit.period === 'hour' ? 'por hora' : 'por dia'})`;

    const barPct = ((site.todayAccesses + 1) / site.accessLimit.count) * 100;
    const cls = barPct >= 90 ? 'danger' : barPct >= 60 ? 'warning' : '';
    usageBar.className = 'usage-bar-fill ' + cls;
    usageBar.style.width = Math.min(100, barPct) + '%';

    if (hasScheduleLimit && site.scheduleLimit.schedules && site.scheduleLimit.schedules.length > 0) {
        sessionNote.textContent = `Possui restrições de horário`;
    }

    const continueBtn = document.getElementById('continue-btn');

    if (site.writeUnlockEnabled) {
        continueBtn.innerHTML = '<i class="ph ph-book-open-text"></i> Acessar com evangelho';
        continueBtn.addEventListener('click', () => {
            showGospelUnlock(async () => {
                site.todayAccesses++;
                await chrome.storage.local.set({ blocker_config: config });
                let durationMinutes = 60;
                if (hasScheduleLimit) {
                    durationMinutes = Math.min(durationMinutes, minutesUntilBlockedWindow(site.scheduleLimit));
                }
                await allowAndNavigate(domain, durationMinutes);
            });
        });
    } else {
        continueBtn.addEventListener('click', async () => {
            site.todayAccesses++;
            await chrome.storage.local.set({ blocker_config: config });
            let durationMinutes = 60;
            if (hasScheduleLimit) {
                durationMinutes = Math.min(durationMinutes, minutesUntilBlockedWindow(site.scheduleLimit));
            }
            await allowAndNavigate(domain, durationMinutes);
        });
    }
})();

// ── Gospel unlock (shared between limited and overlimit flows) ─────────────

const GOSPEL_CACHE_KEY = 'liturgy_gospel_cache';
const LITURGY_API = 'https://liturgia.up.railway.app/v2/';

async function getGospelOfDay() {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const data = await chrome.storage.local.get([GOSPEL_CACHE_KEY]);
    const cached = data[GOSPEL_CACHE_KEY];
    if (cached && cached.date === todayStr) return cached;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(LITURGY_API, { signal: controller.signal });
        clearTimeout(timeoutId);
        const json = await resp.json();
        const gospelEntry = json.leituras?.evangelho?.[0];
        if (gospelEntry) {
            const gospel = {
                date: todayStr,
                // Normalise newlines to spaces so single-line input can match
                text: (gospelEntry.texto || '').replace(/\n+/g, ' ').trim(),
                ref: gospelEntry.referencia || '',
                titulo: gospelEntry.titulo || '',
                liturgia: json.liturgia || ''
            };
            await chrome.storage.local.set({ [GOSPEL_CACHE_KEY]: gospel });
            return gospel;
        }
    } catch (e) {
        console.error('[Blocked] Failed to fetch gospel:', e);
    }
    return null;
}

// Module-level state for the overlay (only one instance on the page)
let _gospelTarget = '';
let _gospelOnSuccess = null;
let _gospelOverlayBound = false;
// Pre-built span elements — avoids rebuilding the entire DOM on every keystroke
let _gospelSpans = null;

// Cleans gospel text for the typing exercise:
// - removes verse numbers (standalone "12 " or glued "45Jesus")
// - normalises smart quotes, dashes, ellipsis to their ASCII equivalents
function cleanGospelText(text) {
    return text
        .replace(/\d+/g, '')                                         // strip all verse numbers
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')     // smart double quotes → "
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")     // smart single quotes → '
        .replace(/[\u2013\u2014\u2015]/g, '-')                        // en/em dash → -
        .replace(/\u2026/g, '...')                                    // ellipsis → ...
        .replace(/\s+/g, ' ')                                        // collapse whitespace
        .trim();
}

// Normalises a character for accent- and punctuation-insensitive comparison
function normalizeChar(ch) {
    return ch
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/[\u2013\u2014\u2015]/g, '-')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function _bindGospelOverlay() {
    if (_gospelOverlayBound) return;
    _gospelOverlayBound = true;

    const overlay = document.getElementById('verse-unlock-overlay');
    const input = document.getElementById('verse-unlock-input');
    const displayEl = document.getElementById('verse-unlock-display');
    const progressFill = document.getElementById('verse-unlock-progress-fill');
    const cancelBtn = document.getElementById('verse-unlock-cancel');

    cancelBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        input.value = '';
        _gospelOnSuccess = null;
    });

    // Block paste — user must type each character
    input.addEventListener('paste', (e) => e.preventDefault());

    input.addEventListener('input', async () => {
        const typed = input.value;
        const target = _gospelTarget;
        if (!target) return;

        let matchCount = 0;
        for (let i = 0; i < typed.length && i < target.length; i++) {
            if (normalizeChar(typed[i]) === normalizeChar(target[i])) {
                matchCount++;
            } else {
                input.classList.add('error');
                setTimeout(() => {
                    input.classList.remove('error');
                    input.value = typed.slice(0, matchCount);
                }, 400);
                _renderGospelDisplay(target, matchCount, displayEl);
                return;
            }
        }

        progressFill.style.width = ((matchCount / target.length) * 100) + '%';
        _renderGospelDisplay(target, matchCount, displayEl);

        if (matchCount >= target.length) {
            setTimeout(async () => {
                overlay.style.display = 'none';
                const cb = _gospelOnSuccess;
                _gospelOnSuccess = null;
                if (cb) await cb();
            }, 300);
        }
    });
}

function _renderGospelDisplay(text, matchedCount, el) {
    // Build spans once; on subsequent calls just update className (much faster)
    if (!_gospelSpans || _gospelSpans.length !== text.length) {
        el.innerHTML = '';
        _gospelSpans = [];
        const frag = document.createDocumentFragment();
        for (let i = 0; i < text.length; i++) {
            const span = document.createElement('span');
            span.textContent = text[i];
            span.className = i < matchedCount ? 'char-correct' : i === matchedCount ? 'char-current' : 'char-pending';
            _gospelSpans.push(span);
            frag.appendChild(span);
        }
        el.appendChild(frag);
    } else {
        for (let i = 0; i < _gospelSpans.length; i++) {
            const cls = i < matchedCount ? 'char-correct' : i === matchedCount ? 'char-current' : 'char-pending';
            if (_gospelSpans[i].className !== cls) _gospelSpans[i].className = cls;
        }
    }
    if (_gospelSpans[matchedCount]) {
        _gospelSpans[matchedCount].scrollIntoView({ block: 'nearest' });
    }
}

async function showGospelUnlock(onSuccess) {
    _bindGospelOverlay();
    _gospelOnSuccess = onSuccess;

    const overlay = document.getElementById('verse-unlock-overlay');
    const refEl = document.getElementById('verse-unlock-ref');
    const liturgiaEl = document.getElementById('verse-unlock-liturgia');
    const displayEl = document.getElementById('verse-unlock-display');
    const input = document.getElementById('verse-unlock-input');
    const progressFill = document.getElementById('verse-unlock-progress-fill');

    // Loading state
    refEl.textContent = '';
    if (liturgiaEl) liturgiaEl.textContent = '';
    displayEl.innerHTML = '<span style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Buscando o evangelho do dia...</span>';
    input.value = '';
    progressFill.style.width = '0%';
    overlay.style.display = 'flex';

    const gospel = await getGospelOfDay();

    if (!gospel) {
        displayEl.innerHTML = '<span style="color:#f87171;font-size:0.85rem;">Não foi possível obter o evangelho de hoje. Verifique sua conexão.</span>';
        return;
    }

    _gospelSpans = null; // force re-render for new gospel text
    _gospelTarget = cleanGospelText(gospel.text);
    refEl.textContent = gospel.ref;
    if (liturgiaEl) liturgiaEl.textContent = gospel.liturgia;
    _renderGospelDisplay(_gospelTarget, 0, displayEl);
    progressFill.style.width = '0%';
    setTimeout(() => input.focus(), 100);
}
