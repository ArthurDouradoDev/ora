// ============================================================
// BLOCKED PAGE (Fase 4) — Interceptação com motivo concreto e acesso temporário
// ============================================================
// Depende de BlockerCore (scripts/shared/blocker-core.js).

(async function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const rawDomain = (params.get('domain') || location.hash.slice(1) || '').trim();
    const hostname = BlockerCore.extractDomain(rawDomain);
    const domain = hostname || rawDomain.replace(/^www\./i, '').toLowerCase();

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
    if (hostname && window.top === window) {
        showFavicon(hostname, match?.evaluation.blocked);
    }

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

    async function loadFavicon(src) {
        if (!src) return null;
        const image = new Image();
        image.alt = '';
        image.src = src;
        try {
            await image.decode();
            return image;
        } catch {
            return null;
        }
    }

    function publicHttps(url, base) {
        try {
            const parsed = new URL(url, base);
            const host = parsed.hostname.replace(/\.$/, '');
            if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port &&
                host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':') &&
                !/\.(localhost|local|internal)$/i.test(host)) return parsed;
        } catch {
            // Links inválidos ou que não podem ser resolvidos a partir da página.
        }
        return null;
    }

    async function fetchIconResource(url, deadline, maxBytes, acceptType) {
        try {
            const response = await fetch(url, {
                credentials: 'omit', referrerPolicy: 'no-referrer',
                signal: AbortSignal.any([deadline, AbortSignal.timeout(2200)])
            });
            const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
            if (!response.ok || !response.body || !publicHttps(response.url) || !acceptType(type) ||
                Number(response.headers.get('content-length')) > maxBytes) {
                await response.body?.cancel();
                return null;
            }

            const chunks = [];
            let size = 0;
            for await (const chunk of response.body) {
                size += chunk.byteLength;
                if (size > maxBytes) return null;
                chunks.push(chunk);
            }
            return { chunks, type, url: response.url };
        } catch {
            return null;
        }
    }

    async function fetchFavicon(url, deadline) {
        const resource = await fetchIconResource(url, deadline, 256 * 1024, type =>
            type.startsWith('image/') || ['', 'application/octet-stream', 'binary/octet-stream', 'application/ico'].includes(type));
        if (!resource) return null;
        const { chunks, type } = resource;
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                // O navegador ainda precisa decodificar a imagem antes de ela aparecer.
                reader.readAsDataURL(new Blob(chunks, { type: type.startsWith('image/') ? type : 'image/x-icon' }));
            });
            return loadFavicon(dataUrl);
        } catch {
            return null;
        }
    }

    async function findOnlineFavicon(origins) {
        const deadline = AbortSignal.timeout(6500);
        const pages = origins.filter(origin => publicHttps(origin));
        const tried = new Set();
        for (const origin of pages) {
            const url = new URL('/favicon.ico', origin).href;
            tried.add(url);
            const icon = await fetchFavicon(url, deadline);
            if (icon) return icon;
        }
        const parsedPages = new Set();
        for (const origin of pages) {
            // Consulta apenas a página inicial, sem enviar o caminho da navegação bloqueada.
            const page = await fetchIconResource(origin, deadline, 1024 * 1024, type =>
                type === 'text/html' || type === 'application/xhtml+xml');
            if (!page || parsedPages.has(page.url)) continue;
            parsedPages.add(page.url);

            // O conteúdo do template fica inerte. Apenas os links dos ícones são usados.
            const template = document.createElement('template');
            template.innerHTML = await new Blob(page.chunks).text();
            const links = template.content.querySelectorAll('link[rel~="icon" i][href], link[rel~="apple-touch-icon" i][href]');
            const candidates = new Set(Array.from(links, link => publicHttps(link.getAttribute('href'), page.url)?.href));
            for (const url of [...candidates].filter(url => url && !tried.has(url)).slice(0, 4)) {
                tried.add(url);
                const icon = await fetchFavicon(url, deadline);
                if (icon) return icon;
            }
        }
        return null;
    }

    function faviconPixels(image) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        canvas.getContext('2d').drawImage(image, 0, 0, 32, 32);
        return canvas.toDataURL();
    }

    async function showFavicon(hostname, isBlocked) {
        const target = new URL(await resolveTargetUrl(hostname));
        const origins = [...new Set([`https://${target.hostname}`, `https://${hostname}`, `https://www.${hostname}`])];
        const pages = new Set([target.href, ...origins.map(origin => origin + '/')]);

        // Chromium returns a generic image on a miss and can cache Ora's own
        // favicon for the original URL after redirecting to this page.
        let icon;
        try {
            const fallbackPages = [
                'https://ora-favicon-placeholder.invalid/',
                chrome.runtime.getURL('ora.html'),
                location.href
            ];
            const images = await Promise.all([
                ...fallbackPages,
                ...pages
            ].map(url => loadFavicon(SiteFavicon.cacheUrl(url))));
            const fallbackPixels = images.slice(0, fallbackPages.length).filter(Boolean).map(faviconPixels);
            icon = images.slice(fallbackPages.length).find(image => image && !fallbackPixels.includes(faviconPixels(image)));
        } catch {
            // Some browser privacy settings restrict canvas reads.
        }

        if (!icon && isBlocked && navigator.onLine) icon = await findOnlineFavicon(origins);
        if (!icon) return;
        $('blkFav').replaceChildren(icon);
        $('blkFav').classList.add('has-icon');
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
                if (['http:', 'https:'].includes(urlObj.protocol) &&
                    allAllowedDomains.some(d => originalHostname === d || originalHostname.endsWith('.' + d))) {
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
