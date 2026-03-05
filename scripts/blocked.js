function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function isWithinBlockedSchedule(schedule) {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
    const to = (schedule.toHour || 0) * 60 + (schedule.toMinute || 0);
    if (from === to) return false;
    return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
}

function minutesUntilBlockedWindow(schedule) {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
    return cur < from ? from - cur : (24 * 60) - cur + from;
}

// Known domain aliases (mirrored from blocker.js / sw.js)
const DOMAIN_ALIASES = {
    'gmail.com':          ['mail.google.com'],
    'mail.google.com':    ['gmail.com'],
    'twitter.com':        ['x.com'],
    'x.com':              ['twitter.com'],
    'facebook.com':       ['fb.com', 'www.facebook.com'],
    'fb.com':             ['facebook.com'],
    'instagram.com':      ['www.instagram.com'],
    'reddit.com':         ['old.reddit.com', 'www.reddit.com', 'new.reddit.com'],
    'old.reddit.com':     ['reddit.com'],
};

/**
 * Create allow rules for a domain AND all its known aliases.
 * Uses requestDomains for reliable matching (consistent with blocker.js).
 */
function buildAllowRules(primaryDomain) {
    const allDomains = [primaryDomain, ...(DOMAIN_ALIASES[primaryDomain] || [])];
    // Single allow rule with requestDomains covering all aliases
    const ruleId = 1000 + (Math.abs(hashCode(primaryDomain)) % 9000);
    return {
        ruleId,
        rules: [{
            id: ruleId,
            priority: 2,
            action: { type: 'allow' },
            condition: { requestDomains: allDomains, resourceTypes: ['main_frame'] }
        }]
    };
}

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

    // ALWAYS mode — hard block, no continue
    if (site.mode === 'always') {
        document.getElementById('always-section').style.display = 'block';
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
            const fromStr = `${pad(site.scheduleLimit.fromHour)}:${pad(site.scheduleLimit.fromMinute)}`;
            const toStr = `${pad(site.scheduleLimit.toHour)}:${pad(site.scheduleLimit.toMinute)}`;
            msg.textContent = `${site.url} está bloqueado das ${fromStr} às ${toStr}.`;
        } else {
            badgeText.textContent = 'Limite de acessos excedido';
            msg.textContent = `Você já acessou ${site.url} ${site.todayAccesses} de ${site.accessLimit.count} vezes hoje.`;
        }
        return;
    }

    /**
     * Helper: create allow rules, notify SW to set up revoke alarm,
     * then navigate to the target site.
     */
    async function allowAndNavigate(targetDomain, durationMinutes) {
        const { ruleId, rules } = buildAllowRules(site.url);

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

        window.location.replace('https://' + targetDomain);
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

    if (hasScheduleLimit) {
        const fromStr = `${pad(site.scheduleLimit.fromHour)}:${pad(site.scheduleLimit.fromMinute)}`;
        const toStr = `${pad(site.scheduleLimit.toHour)}:${pad(site.scheduleLimit.toMinute)}`;
        sessionNote.textContent = `Bloqueado das ${fromStr} às ${toStr}`;
    }

    document.getElementById('continue-btn').addEventListener('click', async () => {
        site.todayAccesses++;
        await chrome.storage.local.set({ blocker_config: config });

        let durationMinutes = 60;
        if (hasScheduleLimit) {
            durationMinutes = Math.min(durationMinutes, minutesUntilBlockedWindow(site.scheduleLimit));
        }

        await allowAndNavigate(domain, durationMinutes);
    });
})();
