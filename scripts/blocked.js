// ============================================================
// BLOCKED PAGE (Fase 4) — Interceptação com motivo concreto e acesso temporário
// ============================================================
// Depende de BlockerCore (scripts/shared/blocker-core.js).

(async function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const rawDomain = (params.get('domain') || location.hash.slice(1) || '').trim();
    const domain = BlockerCore.extractDomain(rawDomain) || rawDomain.replace(/^www\./i, '').toLowerCase();

    // Load storage state and locale messages
    let storage = {};
    try {
        storage = await chrome.storage.local.get([
            'ora_locale',
            'blocker_config',
            'ora_pomodoro_state',
            'ora_screentime',
            'catholic_dash_image'
        ]);
    } catch (e) {
        console.warn('[Blocked] Storage read failed:', e);
    }

    const locale = ['pt', 'en', 'es'].includes(storage.ora_locale) ? storage.ora_locale : 'pt';
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale;

    let messages = {};
    try {
        const res = await fetch(chrome.runtime.getURL(`data/i18n/${locale}.json`));
        messages = await res.json();
    } catch (e) {
        console.warn('[Blocked] Failed to load i18n:', e);
    }

    function tr(path, vars = {}) {
        const parts = path.split('.');
        let val = messages;
        for (const p of parts) {
            val = val && val[p];
        }
        if (typeof val !== 'string') return path;
        return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
    }

    // Optional cached background photo (never fetches over network if offline)
    if (storage.catholic_dash_image && typeof storage.catholic_dash_image === 'string' && navigator.onLine) {
        document.body.style.backgroundImage = `url('${storage.catholic_dash_image}')`;
    }

    document.title = tr('blocked.page_title');

    // Configure Respiro link (#blocked-respiro) so return to blocked.html works (M12)
    const respiroLink = $('blocked-respiro');
    const respiroText = $('blkRespiroText');
    if (respiroText) {
        respiroText.textContent = tr('blocked.do_respiro');
    }
    if (respiroLink) {
        respiroLink.href = chrome.runtime.getURL('ora.html')
            + '?from=blocked&domain=' + encodeURIComponent(domain || 'site')
            + '#rezar/respiro';
    }

    const oraTodayUrl = chrome.runtime.getURL('ora.html') + '#hoje';
    $('blkPrimary').href = oraTodayUrl;
    $('tempBackBtn').href = oraTodayUrl;

    const displayDomain = domain || 'site';
    $('blkSite').textContent = displayDomain;
    $('blkFav').textContent = displayDomain.charAt(0).toUpperCase();

    const config = storage.blocker_config || {};
    const pomodoro = storage.ora_pomodoro_state || null;
    const screentime = storage.ora_screentime || null;
    const profiles = BlockerCore.profilesFromConfig(config);

    const focusActive = Boolean(
        pomodoro &&
        pomodoro.phase === 'focus' &&
        (pomodoro.isRunning || pomodoro.session) &&
        (!pomodoro.protection || pomodoro.protection.active !== false) &&
        (config.enabled || (pomodoro.protection && pomodoro.protection.active))
    );

    const focusEndsAt = pomodoro
        ? (pomodoro.isRunning && pomodoro.expectedEndTime
            ? pomodoro.expectedEndTime
            : (pomodoro.timeRemaining ? Date.now() + pomodoro.timeRemaining * 1000 : null))
        : null;

    const focusRemainingMin = pomodoro
        ? Math.max(1, Math.ceil((pomodoro.isRunning && pomodoro.expectedEndTime
            ? Math.max(0, (pomodoro.expectedEndTime - Date.now()) / 1000)
            : (pomodoro.timeRemaining || 1500)) / 60))
        : 25;

    const focusTaskTitle = (pomodoro && pomodoro.session && pomodoro.session.title) || '';

    const now = new Date();
    const evalCtx = {
        locale,
        hasPermission: true,
        enabled: Boolean(config.enabled || focusActive),
        pausedUntil: config.reenableAt || null,
        focusActive,
        focusEndsAt,
        focusTitle: focusTaskTitle,
        screentime
    };

    const match = BlockerCore.findBlockingProfile(profiles, displayDomain, evalCtx, now);
    const profile = (match && match.profile)
        || profiles.find(p => p.sites.some(s => BlockerCore.matchesSiteOrAlias(displayDomain, s)))
        || profiles[0]
        || BlockerCore.normalizeProfile({
            id: 'meus-sites',
            name: 'Meus sites',
            sites: [displayDomain],
            rules: { duringFocus: true, temporaryAccess: { enabled: true, minutes: 5, perDay: 3 } }
        });

    const evaluation = (match && match.evaluation) || BlockerCore.evaluateProfile(profile, evalCtx, now);
    const reason = evaluation.blocked ? evaluation.reason : (focusActive ? 'focus' : 'schedule');

    function hhmm(dateOrMs) {
        const d = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    // Populate text according to reason (focus, schedule, limit)
    if (reason === 'focus') {
        $('blkKicker').textContent = tr('blocked.focus_kicker');
        $('blkTitle').textContent = tr('blocked.focus_title');
        $('blkWhy').textContent = focusTaskTitle
            ? tr('blocked.focus_sub_task', { task: focusTaskTitle, min: focusRemainingMin })
            : tr('blocked.focus_sub_free', { min: focusRemainingMin });
        const endStr = focusEndsAt ? hhmm(focusEndsAt) : hhmm(Date.now() + focusRemainingMin * 60000);
        $('blkUntil').textContent = tr('blocked.focus_until', { time: endStr });
        $('blkPrimary').textContent = tr('blocked.back_to_task');
        $('tempBackBtn').textContent = tr('blocked.back_to_task');
    } else if (reason === 'limit') {
        const limitMin = (profile.rules && profile.rules.dailyLimitMin) || 30;
        $('blkKicker').textContent = tr('blocked.limit_kicker');
        $('blkTitle').textContent = tr('blocked.limit_title', { limit: limitMin });
        $('blkWhy').textContent = tr('blocked.limit_sub', { domain: displayDomain, profile: profile.name, limit: limitMin });
        $('blkUntil').textContent = tr('blocked.limit_until');
        $('blkPrimary').textContent = tr('blocked.back_to_ora');
        $('tempBackBtn').textContent = tr('blocked.back_to_ora');
    } else {
        const sched = (profile.rules && profile.rules.schedule) || { from: '22:00', to: '07:00' };
        const untilDate = evaluation.until instanceof Date ? evaluation.until : null;
        const untilTime = evaluation.untilTime || sched.to || '07:00';
        const isTomorrow = untilDate ? untilDate.getDate() !== now.getDate() : true;
        $('blkKicker').textContent = tr('blocked.schedule_kicker');
        $('blkTitle').textContent = tr('blocked.schedule_title');
        $('blkWhy').textContent = tr('blocked.schedule_sub', {
            profile: profile.name,
            from: sched.from || '22:00',
            to: sched.to || '07:00'
        });
        $('blkUntil').textContent = tr('blocked.schedule_until', {
            when: isTomorrow ? tr('blocked.tomorrow') : tr('blocked.today'),
            time: untilTime
        });
        $('blkPrimary').textContent = tr('blocked.back_to_ora');
        $('tempBackBtn').textContent = tr('blocked.back_to_ora');
    }

    // Temporary access availability (3rd allowed, 4th denied)
    const canTemp = BlockerCore.canUseTemporaryAccess(profile, now);
    const remaining = BlockerCore.remainingTemporaryAccesses(profile, now);
    const tempMinutes = (profile.rules && profile.rules.temporaryAccess && profile.rules.temporaryAccess.minutes) || 5;

    const tempBtn = $('blkTemp');
    const tempBox = $('blkTempBox');
    const actionsBox = $('blkActions');

    if (canTemp && domain) {
        tempBtn.hidden = false;
        tempBtn.textContent = tr('blocked.access_5min');
        $('tempTitle').textContent = tr('blocked.temp_title', { domain: displayDomain, min: tempMinutes });
        $('tempNote').innerHTML = (reason === 'focus' ? tr('blocked.temp_note', { min: tempMinutes, rem: remaining }) : tr('blocked.temp_note_no_focus', { min: tempMinutes, rem: remaining }));
        $('tempReasonLabel').textContent = tr('blocked.temp_reason_label');
        $('tempReasonInput').placeholder = tr('blocked.temp_reason_placeholder');
        $('openTemp').textContent = tr('blocked.open_5min', { min: tempMinutes });

        tempBtn.addEventListener('click', () => {
            actionsBox.hidden = true;
            tempBox.hidden = false;
            $('tempReasonInput').focus();
        });
    } else {
        tempBtn.hidden = true;
        tempBox.hidden = true;
    }

    async function resolveTargetUrl(targetDomain) {
        let finalUrl = `https://${targetDomain}`;
        try {
            let originalUrl = params.get('url');
            if (!originalUrl) {
                const response = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ action: 'get_original_url' }, resolve);
                });
                if (response && response.url) originalUrl = response.url;
            }
            if (originalUrl) {
                const urlObj = new URL(originalUrl);
                const originalHostname = urlObj.hostname.replace(/^www\./, '');
                const allAllowedDomains = [targetDomain, ...(BlockerCore.DOMAIN_ALIASES[targetDomain] || [])];
                if (allAllowedDomains.some(d => originalHostname === d || originalHostname.endsWith('.' + d))) {
                    finalUrl = originalUrl;
                }
            }
        } catch (e) {
            console.warn('[Blocked] Could not restore original URL:', e);
        }
        return finalUrl;
    }

    $('openTemp').addEventListener('click', async () => {
        const freshData = await chrome.storage.local.get(['blocker_config']);
        const freshCfg = freshData.blocker_config || config;
        const freshProfiles = BlockerCore.profilesFromConfig(freshCfg);
        const targetIdx = freshProfiles.findIndex(p => p.id === profile.id);
        const currentProfile = targetIdx >= 0 ? freshProfiles[targetIdx] : profile;

        const consumed = BlockerCore.consumeTemporaryAccess(
            currentProfile,
            new Date(),
            $('tempReasonInput').value
        );

        if (!consumed.allowed) {
            tempBox.hidden = true;
            tempBtn.hidden = true;
            actionsBox.hidden = false;
            return;
        }

        if (targetIdx >= 0) {
            freshProfiles[targetIdx] = consumed.profile;
        } else {
            freshProfiles.push(consumed.profile);
        }

        const nextConfig = Object.assign({}, freshCfg, { profiles: freshProfiles });
        await chrome.storage.local.set({ blocker_config: nextConfig });

        const primaryDomain = profile.sites.find(s => BlockerCore.matchesSiteOrAlias(displayDomain, s)) || displayDomain;
        const { ruleId, rules } = BlockerCore.buildAllowRules(primaryDomain);

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [ruleId],
            addRules: rules
        });

        await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { action: 'setup_revoke_alarm', ruleId, durationMinutes: tempMinutes, domain: primaryDomain },
                () => resolve()
            );
        });

        const finalUrl = await resolveTargetUrl(primaryDomain);
        window.location.replace(finalUrl);
    });
})();
