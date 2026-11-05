// ============================================================
// BLOCKER CORE — Shared, dependency-free Protection & Blocker logic
// ============================================================
// Single source of truth used by three contexts:
//   - scripts/modules/blocker.js     (new tab Protection view)
//   - scripts/modules/protection.js  (header pill + popover)
//   - scripts/blocked.js             (blocked site interception page)
//   - sw.js                          (background service worker, via importScripts)
//
// Pure functions only: no chrome.* calls, no DOM access. Time-dependent
// functions accept an optional `now` parameter for testability.
(function (global) {
    'use strict';

    // Known domain aliases — when a user blocks one domain, all its aliases
    // are also blocked. This handles sites that redirect to different domains
    // (e.g. gmail.com → mail.google.com, twitter.com → x.com).
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

    // Global exceptions for Google OAuth (so sign-ins keep working when
    // youtube.com / google.com domains are blocked).
    const OAUTH_EXCEPTION_FILTERS = [
        '||youtube.com/signin*',
        '||youtube.com/accounts*',
        '||youtube.com/account_redirect*',
        '||accounts.youtube.com/*',
        '||google.com/signin*',
        '||google.com/accounts*',
        '||google.com/account_redirect*',
        '||google.com/ServiceLogin*',
        '||accounts.google.com/*'
    ];

    const AUTH_WHITELIST_REGEXES = [
        /^https?:\/\/(www\.)?youtube\.com\/(signin|accounts|account_redirect)/i,
        /^https?:\/\/accounts\.youtube\.com/i,
        /^https?:\/\/(www\.)?google\.com\/(signin|accounts|account_redirect|ServiceLogin)/i,
        /^https?:\/\/accounts\.google\.com/i
    ];

    const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
    const WEEKDAYS = [1, 2, 3, 4, 5];

    const DAY_NAMES = {
        pt: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
        en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    };

    const DAY_SHORT = {
        pt: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
        en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
        es: ['D', 'L', 'M', 'X', 'J', 'V', 'S']
    };

    const SUGGESTED_PROFILES = [
        {
            id: 'redes-sociais',
            name: 'Redes sociais',
            icon: 'ph-users-three',
            enabled: true,
            sites: ['instagram.com', 'x.com', 'tiktok.com', 'facebook.com'],
            rules: {
                duringFocus: true,
                schedule: { enabled: true, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
                dailyLimitMin: null,
                temporaryAccess: { enabled: true, minutes: 5, perDay: 3 }
            }
        },
        {
            id: 'videos',
            name: 'Vídeos',
            icon: 'ph-play-circle',
            enabled: true,
            sites: ['youtube.com', 'twitch.tv'],
            rules: {
                duringFocus: true,
                schedule: { enabled: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
                dailyLimitMin: 30,
                temporaryAccess: { enabled: true, minutes: 5, perDay: 3 }
            }
        },
        {
            id: 'noticias',
            name: 'Notícias',
            icon: 'ph-newspaper',
            enabled: true,
            sites: ['g1.globo.com', 'uol.com.br'],
            rules: {
                duringFocus: true,
                schedule: { enabled: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
                dailyLimitMin: null,
                temporaryAccess: { enabled: false, minutes: 5, perDay: 3 }
            }
        }
    ];

    function toDate(now) {
        if (now instanceof Date) return now;
        if (typeof now === 'number' && Number.isFinite(now)) return new Date(now);
        if (typeof now === 'string' && !isNaN(Date.parse(now))) return new Date(Date.parse(now));
        return new Date();
    }

    function isoDate(d) {
        const dt = toDate(d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }

    function pad2(n) {
        return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, '0');
    }

    function isAuthWhitelisted(url) {
        return AUTH_WHITELIST_REGEXES.some(re => re.test(url));
    }

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    // Allow rules (temporary session grants) live in the ID range 1000–9999.
    // Block/redirect rules use IDs < 1000.
    function allowRuleIdFor(domain) {
        return 1000 + (Math.abs(hashCode(domain)) % 9000);
    }

    function extractDomain(url) {
        try {
            if (typeof url !== 'string') return null;
            let raw = url.trim().toLowerCase();
            if (!raw) return null;
            if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = 'https://' + raw;
            const hostname = new URL(raw).hostname.replace(/^www\./, '');
            if (!hostname || !hostname.includes('.') || /\s/.test(hostname)) return null;
            return hostname;
        } catch (e) {
            return null;
        }
    }

    function siteDomain(siteOrDomain) {
        if (typeof siteOrDomain === 'string') return extractDomain(siteOrDomain) || siteOrDomain.trim().toLowerCase();
        if (siteOrDomain && typeof siteOrDomain.url === 'string') return extractDomain(siteOrDomain.url) || siteOrDomain.url.trim().toLowerCase();
        return '';
    }

    function matchesSiteOrAlias(hostname, site) {
        if (!hostname) return false;
        const cleanHost = String(hostname).toLowerCase().replace(/^www\./, '');
        const primary = siteDomain(site);
        if (!primary) return false;
        const candidates = [primary, ...(DOMAIN_ALIASES[primary] || [])];
        for (const d of candidates) {
            if (cleanHost === d || cleanHost.endsWith('.' + d)) return true;
        }
        return false;
    }

    // ── Legacy schedule helpers (preserved for existing callers & tests) ──

    function isWithinBlockedSchedule(scheduleLimit, now = new Date()) {
        if (!scheduleLimit || !Array.isArray(scheduleLimit.schedules)) return false;
        const dt = toDate(now);
        const cur = dt.getHours() * 60 + dt.getMinutes();

        for (const schedule of scheduleLimit.schedules) {
            const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
            const to = (schedule.toHour || 0) * 60 + (schedule.toMinute || 0);
            if (from === to) continue;
            const isBlocked = from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
            if (isBlocked) return true;
        }
        return false;
    }

    function minutesUntilBlockedWindow(scheduleLimit, now = new Date()) {
        if (!scheduleLimit || !Array.isArray(scheduleLimit.schedules) || scheduleLimit.schedules.length === 0) return 0;
        const dt = toDate(now);
        const cur = dt.getHours() * 60 + dt.getMinutes();

        let minMinutes = 24 * 60;
        for (const schedule of scheduleLimit.schedules) {
            const from = (schedule.fromHour || 0) * 60 + (schedule.fromMinute || 0);
            const diff = cur < from ? from - cur : (24 * 60) - cur + from;
            if (diff < minMinutes) minMinutes = diff;
        }
        return minMinutes === 24 * 60 ? 0 : minMinutes;
    }

    /**
     * Build the temporary allow rule for a domain and all its known aliases.
     */
    function buildAllowRules(primaryDomain) {
        const domain = siteDomain(primaryDomain);
        const allDomains = [domain, ...(DOMAIN_ALIASES[domain] || [])];
        const ruleId = allowRuleIdFor(domain);
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

    /**
     * Build the full set of dynamic block rules for the given site list.
     * Accepts `[{ url: 'x.com' }]` or `['x.com']`.
     */
    function buildBlockRules(sites, blockedPageUrl) {
        const list = Array.isArray(sites) ? sites : [];
        const normalized = [];
        const seen = new Set();
        list.forEach(item => {
            const url = siteDomain(item);
            if (url && !seen.has(url)) {
                seen.add(url);
                normalized.push({ url });
            }
        });

        const rules = [];
        let ruleId = 1;
        const baseUrl = blockedPageUrl || 'blocked.html';

        OAUTH_EXCEPTION_FILTERS.forEach(filter => {
            rules.push({
                id: ruleId++,
                priority: 3,
                action: { type: 'allow' },
                condition: {
                    urlFilter: filter,
                    resourceTypes: ['main_frame', 'sub_frame']
                }
            });
        });

        normalized.forEach(site => {
            const allDomains = [site.url];
            const aliases = DOMAIN_ALIASES[site.url] || [];
            aliases.forEach(alias => {
                if (!normalized.some(s => s.url === alias)) {
                    allDomains.push(alias);
                }
            });

            rules.push({
                id: ruleId++,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        url: baseUrl + '?domain=' + encodeURIComponent(site.url)
                    }
                },
                condition: {
                    requestDomains: allDomains,
                    resourceTypes: ['main_frame']
                }
            });
        });

        return rules;
    }

    // ── Time & Schedule Parsing (Phase 4) ─────────────

    function parseTimeMinutes(hhmm) {
        if (typeof hhmm !== 'string') return null;
        const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
        if (!m) return null;
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (h < 0 || h > 23 || min < 0 || min > 59) return null;
        return h * 60 + min;
    }

    function formatTimeMinutes(totalMin) {
        const clean = ((Math.round(Number(totalMin) || 0) % 1440) + 1440) % 1440;
        const h = Math.floor(clean / 60);
        const m = clean % 60;
        return `${pad2(h)}:${pad2(m)}`;
    }

    function formatShortHour(hhmm) {
        const min = parseTimeMinutes(hhmm);
        if (min === null) return String(hhmm || '');
        const h = Math.floor(min / 60);
        const m = min % 60;
        return m === 0 ? `${h}h` : `${h}h${pad2(m)}`;
    }

    function formatDuration(minutes) {
        const m = Math.max(1, Math.round(Number(minutes) || 0));
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const rem = m % 60;
            return rem ? `${h}h${pad2(rem)}` : `${h}h`;
        }
        return `${m} min`;
    }

    function normalizeDays(days, defaultAll = true) {
        if (!Array.isArray(days)) return defaultAll ? ALL_DAYS.slice() : [];
        const set = new Set();
        days.forEach(d => {
            const n = Number(d);
            if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
        });
        return Array.from(set).sort((a, b) => a - b);
    }

    function normalizeSchedule(raw) {
        if (!raw || typeof raw !== 'object') return null;
        let from = typeof raw.from === 'string' ? raw.from.trim() : null;
        let to = typeof raw.to === 'string' ? raw.to.trim() : null;

        if (!from && Number.isFinite(Number(raw.fromHour))) {
            from = `${pad2(raw.fromHour)}:${pad2(raw.fromMinute || 0)}`;
        }
        if (!to && Number.isFinite(Number(raw.toHour))) {
            to = `${pad2(raw.toHour)}:${pad2(raw.toMinute || 0)}`;
        }
        if (parseTimeMinutes(from) === null) from = '22:00';
        if (parseTimeMinutes(to) === null) to = '07:00';

        const hasExplicitDays = Array.isArray(raw.days);
        const days = hasExplicitDays ? normalizeDays(raw.days, false) : ALL_DAYS.slice();
        const enabled = raw.enabled !== false;

        const out = { enabled, from, to, days };
        if (Array.isArray(raw.windows) && raw.windows.length > 1) {
            out.windows = raw.windows
                .map(w => ({
                    from: parseTimeMinutes(w?.from) !== null ? w.from : from,
                    to: parseTimeMinutes(w?.to) !== null ? w.to : to,
                    days: Array.isArray(w?.days) ? normalizeDays(w.days, false) : days.slice()
                }));
        }
        return out;
    }

    function normalizeTemporaryAccess(raw) {
        if (raw === false || (raw && typeof raw === 'object' && raw.enabled === false)) {
            return {
                enabled: false,
                minutes: Math.max(1, parseInt(raw && raw.minutes, 10) || 5),
                perDay: Math.max(1, parseInt(raw && (raw.perDay ?? raw.count), 10) || 3)
            };
        }
        if (raw === true || !raw || typeof raw !== 'object') {
            return { enabled: true, minutes: 5, perDay: 3 };
        }
        return {
            enabled: raw.enabled !== false,
            minutes: Math.max(1, parseInt(raw.minutes, 10) || 5),
            perDay: Math.max(1, parseInt(raw.perDay ?? raw.count, 10) || 3)
        };
    }

    function slugify(text) {
        return String(text || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function inferProfileIcon(name) {
        const s = slugify(name);
        if (s.includes('rede') || s.includes('social') || s.includes('sociais')) return 'ph-users-three';
        if (s.includes('video') || s.includes('stream') || s.includes('jogo')) return 'ph-play-circle';
        if (s.includes('noticia') || s.includes('news') || s.includes('jornal')) return 'ph-newspaper';
        return 'ph-shield-check';
    }

    function normalizeSitesList(rawSites) {
        if (!Array.isArray(rawSites)) return [];
        const seen = new Set();
        const result = [];
        rawSites.forEach(item => {
            const domain = siteDomain(item);
            if (domain && !seen.has(domain)) {
                seen.add(domain);
                result.push(domain);
            }
        });
        return result;
    }

    function normalizeProfile(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Meus sites';
        const id = typeof raw.id === 'string' && raw.id.trim()
            ? raw.id.trim()
            : (raw.id !== undefined && raw.id !== null ? String(raw.id) : (slugify(name) || `perfil-${idx + 1}`));
        const icon = typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : inferProfileIcon(name);
        // M10: an unchecked/disabled profile does not enter rules
        const enabled = raw.enabled !== false && raw.selected !== false && raw.checked !== false;
        const sites = normalizeSitesList(raw.sites);

        const rawRules = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
        const duringFocus = rawRules.duringFocus !== undefined ? Boolean(rawRules.duringFocus) : Boolean(raw.duringFocus !== false);
        const schedule = normalizeSchedule(rawRules.schedule !== undefined ? rawRules.schedule : raw.schedule);

        let dailyLimitMin = null;
        const rawLimit = rawRules.dailyLimitMin !== undefined ? rawRules.dailyLimitMin : raw.dailyLimitMin;
        if (rawLimit && typeof rawLimit === 'object') {
            if (rawLimit.enabled !== false && Number(rawLimit.minutes || rawLimit.dailyLimitMin) > 0) {
                dailyLimitMin = Math.round(Number(rawLimit.minutes || rawLimit.dailyLimitMin));
            }
        } else if (Number.isFinite(Number(rawLimit)) && Number(rawLimit) > 0) {
            dailyLimitMin = Math.round(Number(rawLimit));
        }

        const temporaryAccess = normalizeTemporaryAccess(
            rawRules.temporaryAccess !== undefined ? rawRules.temporaryAccess : raw.temporaryAccess
        );

        const profile = {
            id,
            name,
            icon,
            enabled,
            sites,
            rules: {
                duringFocus,
                schedule,
                dailyLimitMin,
                temporaryAccess
            }
        };

        if (raw.tempAccess && typeof raw.tempAccess === 'object') {
            profile.tempAccess = {
                date: typeof raw.tempAccess.date === 'string' ? raw.tempAccess.date : '',
                count: Math.max(0, parseInt(raw.tempAccess.count, 10) || 0),
                reasons: Array.isArray(raw.tempAccess.reasons) ? raw.tempAccess.reasons.slice(0, 20) : []
            };
        }
        if (Number.isFinite(Number(raw.usedMin))) profile.usedMin = Number(raw.usedMin);
        else if (Number.isFinite(Number(raw.todayUsedMin))) profile.usedMin = Number(raw.todayUsedMin);

        return profile;
    }

    function normalizeProfiles(profiles) {
        if (!Array.isArray(profiles)) return [];
        const seenIds = new Set();
        const out = [];
        profiles.forEach((raw, idx) => {
            const p = normalizeProfile(raw, idx);
            if (!p) return;
            let uniqueId = p.id;
            let suffix = 2;
            while (seenIds.has(uniqueId)) {
                uniqueId = `${p.id}-${suffix++}`;
            }
            p.id = uniqueId;
            seenIds.add(uniqueId);
            out.push(p);
        });
        return out;
    }

    // Converts legacy 1.1.5 / 1.2.0 `blocker_config` + `blocker_sites` into a
    // single "Meus sites" profile with equivalent rules.
    function legacyToProfiles(blockerConfig, blockerSites) {
        const cfgSites = blockerConfig && Array.isArray(blockerConfig.sites) ? blockerConfig.sites : [];
        const oldSites = Array.isArray(blockerSites) ? blockerSites : [];
        const combined = cfgSites.concat(oldSites);
        const sites = normalizeSitesList(combined);
        if (!sites.length) return [];

        const windows = [];
        let perDay = 3;
        let hasAccessLimit = false;
        let hasAlways = false;
        let maxTodayAccesses = 0;
        let lastAccessDate = '';

        cfgSites.forEach(s => {
            if (!s || typeof s !== 'object') return;
            if (s.mode === 'always' || !s.mode) hasAlways = true;
            if (s.accessLimit && s.accessLimit.enabled) {
                hasAccessLimit = true;
                if (Number(s.accessLimit.count) > 0) perDay = Math.max(1, parseInt(s.accessLimit.count, 10));
            }
            if ((s.todayAccesses || 0) > maxTodayAccesses) {
                maxTodayAccesses = parseInt(s.todayAccesses, 10) || 0;
                lastAccessDate = typeof s.lastAccessDate === 'string' ? s.lastAccessDate : '';
            }
            const sched = s.scheduleLimit;
            if (sched && sched.enabled) {
                const rawList = Array.isArray(sched.schedules) && sched.schedules.length
                    ? sched.schedules
                    : [sched];
                rawList.forEach(w => {
                    if (!w) return;
                    const from = `${pad2(w.fromHour ?? 22)}:${pad2(w.fromMinute ?? 0)}`;
                    const to = `${pad2(w.toHour ?? 7)}:${pad2(w.toMinute ?? 0)}`;
                    if (!windows.some(x => x.from === from && x.to === to)) {
                        windows.push({ from, to, days: ALL_DAYS.slice() });
                    }
                });
            }
        });

        const primaryWindow = windows[0] || { from: '22:00', to: '07:00', days: ALL_DAYS.slice() };
        const schedule = {
            enabled: windows.length > 0,
            from: primaryWindow.from,
            to: primaryWindow.to,
            days: ALL_DAYS.slice()
        };
        if (windows.length > 1) schedule.windows = windows;

        const profile = {
            id: 'meus-sites',
            name: 'Meus sites',
            icon: 'ph-shield-check',
            enabled: true,
            sites,
            rules: {
                duringFocus: true,
                schedule,
                dailyLimitMin: null,
                temporaryAccess: {
                    enabled: hasAccessLimit || !hasAlways,
                    minutes: 5,
                    perDay
                }
            }
        };

        if (maxTodayAccesses > 0 && lastAccessDate) {
            profile.tempAccess = { date: lastAccessDate, count: maxTodayAccesses, reasons: [] };
        }

        return [profile];
    }

    function profilesFromConfig(config, legacySites) {
        if (config && Array.isArray(config.profiles)) {
            return normalizeProfiles(config.profiles);
        }
        return legacyToProfiles(config, legacySites);
    }

    function flattenSites(profiles) {
        const list = normalizeProfiles(profiles);
        const seen = new Set();
        const out = [];
        list.forEach(p => {
            if (p.enabled === false) return;
            p.sites.forEach(domain => {
                if (!seen.has(domain)) {
                    seen.add(domain);
                    out.push({ url: domain, profileId: p.id });
                }
            });
        });
        return out;
    }

    // ── Schedule & Consequence Logic ──────────────────

    function isWindowBlockingAt(w, dt) {
        if (!w) return false;
        const days = Array.isArray(w.days) ? w.days : ALL_DAYS;
        if (!days.length || !days.includes(dt.getDay())) return false;
        const from = parseTimeMinutes(w.from);
        const to = parseTimeMinutes(w.to);
        if (from === null || to === null || from === to) return false;
        const cur = dt.getHours() * 60 + dt.getMinutes();
        return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
    }

    function isScheduleBlocking(schedule, now = new Date()) {
        const norm = normalizeSchedule(schedule);
        if (!norm || !norm.enabled) return false;
        const dt = toDate(now);
        const windows = Array.isArray(norm.windows) && norm.windows.length ? norm.windows : [norm];
        return windows.some(w => isWindowBlockingAt(w, dt));
    }

    function scheduleEndTime(schedule, now = new Date()) {
        const norm = normalizeSchedule(schedule);
        if (!norm || !norm.enabled) return null;
        const dt = toDate(now);
        if (!isScheduleBlocking(norm, dt)) return null;

        const from = parseTimeMinutes(norm.from);
        const to = parseTimeMinutes(norm.to);
        const cur = dt.getHours() * 60 + dt.getMinutes();
        const end = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), Math.floor(to / 60), to % 60, 0, 0);

        if (from > to && cur >= from) {
            // Crosses midnight into the next day
            const tomorrowDay = (dt.getDay() + 1) % 7;
            if (norm.days.includes(tomorrowDay)) {
                end.setDate(end.getDate() + 1);
            } else {
                // Next day is excluded from rule days -> ends at midnight (00:00)
                return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0, 0);
            }
        }
        return end;
    }

    function nextMidnight(now = new Date()) {
        const dt = toDate(now);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0, 0);
    }

    /**
     * Computes the next valid occurrence of a schedule rule from `now`,
     * respecting `schedule.days` (M06).
     */
    function nextScheduleOccurrence(schedule, now = new Date()) {
        const norm = normalizeSchedule(schedule);
        if (!norm || !norm.enabled) return null;
        if (!norm.days || norm.days.length === 0) {
            return { active: false, noDays: true };
        }
        const from = parseTimeMinutes(norm.from);
        const to = parseTimeMinutes(norm.to);
        if (from === null || to === null || from === to) {
            return { active: false, invalid: true };
        }

        const dt = toDate(now);
        const cur = dt.getHours() * 60 + dt.getMinutes();
        const todayDay = dt.getDay();

        if (isScheduleBlocking(norm, dt)) {
            const endsAt = scheduleEndTime(norm, dt);
            const endDayOffset = endsAt.getDate() !== dt.getDate() ? 1 : 0;
            return {
                active: true,
                immediate: true,
                startDayOffset: 0,
                startDay: todayDay,
                endDayOffset,
                endDay: endsAt.getDay(),
                from: norm.from,
                to: formatTimeMinutes(endsAt.getHours() * 60 + endsAt.getMinutes()),
                minutesUntilStart: 0,
                startsAt: dt,
                endsAt
            };
        }

        for (let offset = 0; offset <= 7; offset++) {
            const candDay = (todayDay + offset) % 7;
            if (!norm.days.includes(candDay)) continue;
            if (offset === 0 && cur >= from) continue;

            const startsAt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + offset, Math.floor(from / 60), from % 60, 0, 0);
            const minutesUntilStart = Math.max(1, Math.round((startsAt.getTime() - dt.getTime()) / 60000));
            const crossesMidnight = from > to;
            const endDayOffset = offset + (crossesMidnight ? 1 : 0);
            const endDay = (todayDay + endDayOffset) % 7;
            const endsAt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + endDayOffset, Math.floor(to / 60), to % 60, 0, 0);

            return {
                active: false,
                immediate: false,
                startDayOffset: offset,
                startDay: candDay,
                endDayOffset,
                endDay,
                crossesMidnight,
                tomorrowInDays: norm.days.includes((todayDay + 1) % 7),
                from: norm.from,
                to: norm.to,
                minutesUntilStart,
                startsAt,
                endsAt
            };
        }

        return { active: false, noDays: true };
    }

    function dayPhrase(dayIndex, locale = 'pt') {
        const names = DAY_NAMES[locale] || DAY_NAMES.pt;
        const name = names[dayIndex] || names[0];
        if (locale === 'en') return `on ${name}`;
        if (locale === 'es') return `el ${name}`;
        return (dayIndex === 0 || dayIndex === 6) ? `no ${name}` : `na ${name}`;
    }

    function formatSitesSummary(sites, locale = 'pt') {
        const list = normalizeSitesList(sites);
        if (!list.length) {
            return locale === 'en' ? 'no sites' : locale === 'es' ? 'ningún sitio' : 'nenhum site';
        }
        if (list.length <= 3) return list.join(', ');
        const more = list.length - 3;
        if (locale === 'en') return `${list.slice(0, 3).join(', ')} and ${more} more`;
        if (locale === 'es') return `${list.slice(0, 3).join(', ')} y ${more} más`;
        return `${list.slice(0, 3).join(', ')} e mais ${more}`;
    }

    /**
     * Builds structured consequence details for a single profile or rule draft.
     * Respects rule days and never says "amanhã" on Friday night for a weekday rule (M06).
     */
    function consequenceDetails(profileOrRules, now = new Date(), locale = 'pt') {
        const dt = toDate(now);
        const nowStr = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

        let profile;
        if (Array.isArray(profileOrRules)) {
            const enabled = normalizeProfiles(profileOrRules).filter(p => p.enabled !== false);
            if (!enabled.length) {
                const title = locale === 'en' ? 'When saved, no sites will be blocked.' : locale === 'es' ? 'Al guardar, ningún sitio será bloqueado.' : 'Ao salvar, nenhum site será bloqueado.';
                const note = locale === 'en' ? 'No active profiles.' : locale === 'es' ? 'Ningún perfil activo.' : 'Nenhuma regra ativa neste perfil.';
                return { hasRules: false, immediate: false, title, items: [], note, text: `${title} ${note}` };
            }
            profile = enabled[0];
            if (enabled.length > 1) {
                profile = Object.assign({}, profile, {
                    sites: enabled.reduce((acc, p) => acc.concat(p.sites), [])
                });
            }
        } else if (profileOrRules && typeof profileOrRules === 'object' && ('duringFocus' in profileOrRules || 'schedule' in profileOrRules || 'dailyLimitMin' in profileOrRules)) {
            profile = normalizeProfile({ name: 'Meus sites', sites: profileOrRules.sites || [], rules: profileOrRules });
        } else {
            profile = normalizeProfile(profileOrRules || {});
        }

        const sitesLabel = formatSitesSummary(profile.sites, locale);
        const rules = profile.rules || {};
        const focus = Boolean(rules.duringFocus);
        const sched = rules.schedule && rules.schedule.enabled ? rules.schedule : null;
        const limit = rules.dailyLimitMin > 0 ? rules.dailyLimitMin : null;
        const temp = rules.temporaryAccess || { enabled: false, minutes: 5, perDay: 3 };

        const occ = sched ? nextScheduleOccurrence(sched, dt) : null;
        const hasValidSched = Boolean(occ && !occ.noDays && !occ.invalid);
        const hasRules = focus || hasValidSched || Boolean(limit);

        if (!hasRules) {
            const title = locale === 'en'
                ? `When saved, ${sitesLabel} will not be blocked.`
                : locale === 'es'
                    ? `Al guardar, ${sitesLabel} no serán bloqueados.`
                    : `Ao salvar, ${sitesLabel} não serão bloqueados.`;
            const note = (occ && occ.noDays)
                ? (locale === 'en' ? 'Select at least one day of the week for the schedule.' : locale === 'es' ? 'Selecciona al menos un día de la semana para el horario.' : 'Selecione pelo menos um dia da semana para o horário.')
                : (locale === 'en' ? 'No active rule in this profile.' : locale === 'es' ? 'Ninguna regla activa en este perfil.' : 'Nenhuma regra ativa neste perfil.');
            return { hasRules: false, immediate: false, title, items: [], note, text: `${title} ${note}` };
        }

        const items = [];
        let immediate = false;

        if (hasValidSched) {
            if (occ.active) {
                immediate = true;
                if (locale === 'en') {
                    items.push(`Blocking starts immediately (it is now ${nowStr}, inside the schedule until ${occ.to}).`);
                } else if (locale === 'es') {
                    items.push(`El bloqueo comienza inmediatamente (ahora son las ${nowStr}, dentro del horario hasta las ${occ.to}).`);
                } else {
                    items.push(`O bloqueio começa imediatamente (agora são ${nowStr}, dentro do horário, até ${occ.to}).`);
                }
            } else if (occ.startDayOffset === 0) {
                const dur = formatDuration(occ.minutesUntilStart);
                if (!occ.crossesMidnight) {
                    if (locale === 'en') items.push(`Today from ${occ.from} to ${occ.to} (in ${dur}).`);
                    else if (locale === 'es') items.push(`Hoy de ${occ.from} a ${occ.to} (en ${dur}).`);
                    else items.push(`Hoje das ${occ.from} às ${occ.to} (em ${dur}).`);
                } else if (occ.tomorrowInDays) {
                    if (locale === 'en') items.push(`Today at ${occ.from} (in ${dur}) until ${occ.to} tomorrow.`);
                    else if (locale === 'es') items.push(`Hoy a las ${occ.from} (en ${dur}) hasta las ${occ.to} de mañana.`);
                    else items.push(`Hoje às ${occ.from} (em ${dur}) até ${occ.to} de amanhã.`);
                } else {
                    const endDayName = (DAY_NAMES[locale] || DAY_NAMES.pt)[occ.endDay];
                    if (locale === 'en') items.push(`Today at ${occ.from} (in ${dur}) until ${occ.to} on ${endDayName}.`);
                    else if (locale === 'es') items.push(`Hoy a las ${occ.from} (en ${dur}) hasta las ${occ.to} del ${endDayName}.`);
                    else items.push(`Hoje às ${occ.from} (em ${dur}) até ${occ.to} de ${endDayName}.`);
                }
            } else if (occ.startDayOffset === 1 && occ.tomorrowInDays) {
                if (!occ.crossesMidnight) {
                    if (locale === 'en') items.push(`Tomorrow from ${occ.from} to ${occ.to}.`);
                    else if (locale === 'es') items.push(`Mañana de ${occ.from} a ${occ.to}.`);
                    else items.push(`Amanhã, das ${occ.from} às ${occ.to}.`);
                } else {
                    if (locale === 'en') items.push(`Tomorrow at ${occ.from} until ${occ.to} the next day.`);
                    else if (locale === 'es') items.push(`Mañana a las ${occ.from} hasta las ${occ.to} del día siguiente.`);
                    else items.push(`Amanhã às ${occ.from} até ${occ.to} do dia seguinte.`);
                }
            } else {
                const whenDay = dayPhrase(occ.startDay, locale);
                const capWhen = whenDay.charAt(0).toUpperCase() + whenDay.slice(1);
                if (!occ.crossesMidnight) {
                    if (locale === 'en') items.push(`${capWhen} at ${occ.from} until ${occ.to}.`);
                    else if (locale === 'es') items.push(`${capWhen} a las ${occ.from} hasta las ${occ.to}.`);
                    else items.push(`${capWhen} às ${occ.from} até ${occ.to}.`);
                } else {
                    const endDayName = (DAY_NAMES[locale] || DAY_NAMES.pt)[occ.endDay];
                    if (locale === 'en') items.push(`${capWhen} at ${occ.from} until ${occ.to} on ${endDayName}.`);
                    else if (locale === 'es') items.push(`${capWhen} a las ${occ.from} hasta las ${occ.to} del ${endDayName}.`);
                    else items.push(`${capWhen} às ${occ.from} até ${occ.to} de ${endDayName}.`);
                }
            }
        }

        if (focus) {
            items.push(
                locale === 'en'
                    ? 'Whenever you start a focus session.'
                    : locale === 'es'
                        ? 'Siempre que comiences una sesión de foco.'
                        : 'Sempre que você começar uma sessão de foco.'
            );
        }

        if (limit) {
            items.push(
                locale === 'en'
                    ? `After ${limit} min of use per day.`
                    : locale === 'es'
                        ? `Después de ${limit} min de uso por día.`
                        : `Depois de ${limit} min de uso por dia.`
            );
        }

        if (temp && temp.enabled) {
            items.push(
                locale === 'en'
                    ? `On the blocked screen, you can open for ${temp.minutes} min up to ${temp.perDay} times a day.`
                    : locale === 'es'
                        ? `En la pantalla de bloqueo, podrás abrir por ${temp.minutes} min hasta ${temp.perDay} veces al día.`
                        : `Na tela de bloqueio, você poderá abrir por ${temp.minutes} min até ${temp.perDay} vezes por dia.`
            );
        } else {
            items.push(
                locale === 'en'
                    ? 'No temporary access on the blocked screen.'
                    : locale === 'es'
                        ? 'Sin acceso temporal en la pantalla de bloqueo.'
                        : 'Sem acesso temporário na tela de bloqueio.'
            );
        }

        const title = locale === 'en'
            ? `When saved, ${sitesLabel} will be blocked:`
            : locale === 'es'
                ? `Al guardar, ${sitesLabel} serán bloqueados:`
                : `Ao salvar, ${sitesLabel} serão bloqueados:`;

        return {
            hasRules: true,
            immediate,
            title,
            items,
            note: '',
            text: `${title} ${items.join(' ')}`
        };
    }

    function describeConsequence(profilesOrProfile, now = new Date(), locale = 'pt') {
        return consequenceDetails(profilesOrProfile, now, locale).text;
    }

    function describeDaysCompact(days, locale = 'pt') {
        const norm = normalizeDays(days, true);
        if (norm.length === 7) return '';
        if (JSON.stringify(norm) === JSON.stringify(WEEKDAYS)) {
            return locale === 'en' ? 'Mon–Fri' : locale === 'es' ? 'lun–vie' : 'seg a sex';
        }
        const short = DAY_SHORT[locale] || DAY_SHORT.pt;
        return norm.map(d => short[d]).join(' ');
    }

    function describeProfileRule(profile, locale = 'pt') {
        const p = normalizeProfile(profile);
        if (!p) return '';
        const r = p.rules;
        const parts = [];

        if (r.dailyLimitMin > 0) {
            parts.push(
                locale === 'en'
                    ? `${r.dailyLimitMin} min daily limit`
                    : locale === 'es'
                        ? `Límite de ${r.dailyLimitMin} min por día`
                        : `Limite de ${r.dailyLimitMin} min por dia`
            );
        }

        const sched = r.schedule && r.schedule.enabled && r.schedule.days && r.schedule.days.length ? r.schedule : null;
        const daysLabel = sched ? describeDaysCompact(sched.days, locale) : '';
        const fromShort = sched ? formatShortHour(sched.from) : '';
        const toShort = sched ? formatShortHour(sched.to) : '';

        if (r.duringFocus && sched && !parts.length) {
            const base = locale === 'en'
                ? `Blocked during focus and between ${fromShort} and ${toShort}`
                : locale === 'es'
                    ? `Bloqueados durante foco y entre ${fromShort} y ${toShort}`
                    : `Bloqueadas durante foco e entre ${fromShort} e ${toShort}`;
            return daysLabel ? `${base} (${daysLabel})` : base;
        }

        if (r.duringFocus) {
            parts.push(
                parts.length === 0 && !sched
                    ? (locale === 'en' ? 'Blocked only during focus' : locale === 'es' ? 'Bloqueados solo durante foco' : 'Bloqueadas só durante foco')
                    : (locale === 'en' ? 'blocked during focus' : locale === 'es' ? 'bloqueados durante foco' : 'bloqueados durante foco')
            );
        }

        if (sched) {
            const schedText = locale === 'en'
                ? `between ${fromShort} and ${toShort}`
                : locale === 'es'
                    ? `entre ${fromShort} y ${toShort}`
                    : `entre ${fromShort} e ${toShort}`;
            parts.push(daysLabel ? `${schedText} (${daysLabel})` : schedText);
        }

        if (!parts.length) {
            return locale === 'en' ? 'No active rules' : locale === 'es' ? 'Sin reglas activas' : 'Nenhuma regra ativa';
        }
        const joined = parts.join(' · ');
        return joined.charAt(0).toUpperCase() + joined.slice(1);
    }

    // ── Daily Usage & Profile Evaluation ──────────────

    function usedMinutesForProfile(profile, context = {}, now = new Date()) {
        if (!profile) return 0;
        if (Number.isFinite(Number(profile.usedMin))) return Math.max(0, Number(profile.usedMin));
        if (Number.isFinite(Number(profile.todayUsedMin))) return Math.max(0, Number(profile.todayUsedMin));
        if (Number.isFinite(Number(profile.usedMinutes))) return Math.max(0, Number(profile.usedMinutes));
        if (profile.rules && Number.isFinite(Number(profile.rules.usedMin))) return Math.max(0, Number(profile.rules.usedMin));

        const ctx = context && typeof context === 'object' ? context : {};
        if (ctx.usageByProfile && Number.isFinite(Number(ctx.usageByProfile[profile.id]))) {
            return Math.max(0, Number(ctx.usageByProfile[profile.id]));
        }
        if (ctx.usage && Number.isFinite(Number(ctx.usage[profile.id]))) {
            return Math.max(0, Number(ctx.usage[profile.id]));
        }

        const sites = normalizeSitesList(profile.sites);
        if (!sites.length) return 0;

        if (ctx.domainMinutes && typeof ctx.domainMinutes === 'object') {
            let min = 0;
            for (const [dom, val] of Object.entries(ctx.domainMinutes)) {
                if (sites.some(s => matchesSiteOrAlias(dom, s))) min += Number(val) || 0;
            }
            return Math.max(0, Math.round(min));
        }

        const todayKey = isoDate(now);
        let domainsSec = null;
        if (ctx.screentime && typeof ctx.screentime === 'object') {
            if (ctx.screentime[todayKey] && ctx.screentime[todayKey].domains) {
                domainsSec = ctx.screentime[todayKey].domains;
            } else if (ctx.screentime.domains && typeof ctx.screentime.domains === 'object') {
                domainsSec = ctx.screentime.domains;
            }
        } else if (ctx.domains && typeof ctx.domains === 'object') {
            domainsSec = ctx.domains;
        }

        if (!domainsSec) return 0;
        let totalSec = 0;
        for (const [dom, sec] of Object.entries(domainsSec)) {
            if (sites.some(s => matchesSiteOrAlias(dom, s))) {
                totalSec += Number(sec) || 0;
            }
        }
        return Math.floor(totalSec / 60);
    }

    function isDailyLimitReached(profile, context = {}, now = new Date()) {
        const p = normalizeProfile(profile);
        if (!p || !(p.rules.dailyLimitMin > 0)) return false;
        const used = usedMinutesForProfile(profile, context, now);
        return used >= p.rules.dailyLimitMin;
    }

    function evaluateProfile(profile, context = {}, now = new Date()) {
        const dt = toDate(now);
        const nowMs = dt.getTime();
        const ctx = context && typeof context === 'object' ? context : {};
        const locale = ctx.locale || 'pt';
        const p = normalizeProfile(profile);

        if (!p) {
            return { blocked: false, reason: 'disabled', until: null, untilText: '', pillKind: '', pillText: '' };
        }

        const usedMin = usedMinutesForProfile(profile, ctx, dt);
        const limitMin = p.rules.dailyLimitMin > 0 ? p.rules.dailyLimitMin : null;
        const meterPct = limitMin ? Math.min(100, Math.round((usedMin / limitMin) * 100)) : null;

        if (ctx.hasPermission === false) {
            return {
                blocked: false,
                reason: 'no-permission',
                until: null,
                untilText: '',
                pillKind: 'err',
                pillText: locale === 'en' ? 'Not working' : locale === 'es' ? 'No funciona' : 'Não funciona',
                usedMin,
                limitMin,
                meterPct
            };
        }

        if (p.enabled === false) {
            return {
                blocked: false,
                reason: 'disabled',
                until: null,
                untilText: '',
                pillKind: '',
                pillText: locale === 'en' ? 'Disabled' : locale === 'es' ? 'Desactivado' : 'Desativado',
                usedMin,
                limitMin,
                meterPct
            };
        }

        if (ctx.pausedUntil && Number(ctx.pausedUntil) > nowMs) {
            const d = new Date(Number(ctx.pausedUntil));
            const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
            return {
                blocked: false,
                reason: 'paused',
                until: d,
                untilText: time,
                pillKind: 'warn',
                pillText: locale === 'en' ? 'Paused' : locale === 'es' ? 'En pausa' : 'Pausado',
                usedMin,
                limitMin,
                meterPct
            };
        }

        if (ctx.enabled === false && !ctx.focusActive) {
            return {
                blocked: false,
                reason: 'off',
                until: null,
                untilText: '',
                pillKind: '',
                pillText: locale === 'en' ? 'Off' : locale === 'es' ? 'Apagado' : 'Desligado',
                usedMin,
                limitMin,
                meterPct
            };
        }

        // 1. Focus session
        if (ctx.focusActive && p.rules.duringFocus) {
            const until = ctx.focusEndsAt ? new Date(Number(ctx.focusEndsAt)) : null;
            const untilTime = until ? `${pad2(until.getHours())}:${pad2(until.getMinutes())}` : '';
            return {
                blocked: true,
                reason: 'focus',
                until,
                untilTime,
                untilText: untilTime
                    ? (locale === 'en' ? `Available at ${untilTime}` : locale === 'es' ? `Liberado a las ${untilTime}` : `Liberado às ${untilTime}`)
                    : '',
                focusTitle: ctx.focusTitle || '',
                pillKind: 'focus',
                pillText: locale === 'en' ? 'Blocked · focus' : locale === 'es' ? 'Bloqueado · foco' : 'Bloqueado · foco',
                usedMin,
                limitMin,
                meterPct
            };
        }

        // 2. Schedule window
        if (p.rules.schedule && p.rules.schedule.enabled && isScheduleBlocking(p.rules.schedule, dt)) {
            const until = scheduleEndTime(p.rules.schedule, dt);
            const untilTime = until ? `${pad2(until.getHours())}:${pad2(until.getMinutes())}` : p.rules.schedule.to;
            const isTomorrow = until && until.getDate() !== dt.getDate();
            const untilText = isTomorrow
                ? (locale === 'en' ? `Available tomorrow at ${untilTime}` : locale === 'es' ? `Liberado mañana a las ${untilTime}` : `Liberado amanhã às ${untilTime}`)
                : (locale === 'en' ? `Available at ${untilTime}` : locale === 'es' ? `Liberado a las ${untilTime}` : `Liberado às ${untilTime}`);
            return {
                blocked: true,
                reason: 'schedule',
                until,
                untilTime,
                untilText,
                pillKind: 'on',
                pillText: locale === 'en' ? `Blocked until ${formatShortHour(untilTime)}` : locale === 'es' ? `Bloqueado hasta ${formatShortHour(untilTime)}` : `Bloqueado até ${formatShortHour(untilTime)}`,
                usedMin,
                limitMin,
                meterPct
            };
        }

        // 3. Daily limit reached -> blocks until 00:00 (midnight)
        if (limitMin && usedMin >= limitMin) {
            const until = nextMidnight(dt);
            return {
                blocked: true,
                reason: 'limit',
                until,
                untilTime: '0:00',
                untilText: locale === 'en' ? 'Available tomorrow at 0:00' : locale === 'es' ? 'Liberado mañana a las 0:00' : 'Liberado amanhã às 0:00',
                pillKind: 'warn',
                pillText: locale === 'en' ? 'Limit reached' : locale === 'es' ? 'Límite alcanzado' : 'Limite atingido',
                usedMin,
                limitMin,
                meterPct: 100
            };
        }

        // 4. Not blocked right now
        let pillText = locale === 'en' ? 'Allowed' : locale === 'es' ? 'Liberado' : 'Liberado';
        if (limitMin) {
            const rem = Math.max(0, limitMin - usedMin);
            pillText = locale === 'en' ? `${rem} min left` : locale === 'es' ? `${rem} min restantes` : `${rem} min restantes`;
        } else if (p.rules.schedule && p.rules.schedule.enabled) {
            const occ = nextScheduleOccurrence(p.rules.schedule, dt);
            if (occ && !occ.noDays && !occ.invalid && occ.startDayOffset === 0) {
                const shortFrom = formatShortHour(occ.from);
                pillText = locale === 'en' ? `Allowed until ${shortFrom}` : locale === 'es' ? `Liberado hasta ${shortFrom}` : `Liberado até ${shortFrom}`;
            }
        }

        return {
            blocked: false,
            reason: 'free',
            until: null,
            untilText: '',
            pillKind: '',
            pillText,
            usedMin,
            limitMin,
            meterPct
        };
    }

    function nextChangeInfo(profiles, now = new Date(), context = {}) {
        const dt = toDate(now);
        const locale = (context && context.locale) || 'pt';
        const list = normalizeProfiles( Array.isArray(profiles) ? profiles : (profiles ? [profiles] : []) )
            .filter(p => p.enabled !== false && p.sites.length > 0);

        let best = null;

        list.forEach(p => {
            const ev = evaluateProfile(p, context, dt);
            if (ev.blocked && ev.until instanceof Date) {
                const when = ev.until.getTime();
                if (when > dt.getTime() && (!best || when < best.when)) {
                    const shortTime = formatShortHour(`${pad2(ev.until.getHours())}:${pad2(ev.until.getMinutes())}`);
                    const fem = /^(redes|not[ií]cias)/i.test(p.name);
                    const verbUnlockPt = fem ? 'serão liberadas' : 'serão liberados';
                    const text = locale === 'en'
                        ? `${p.name} will be unlocked at ${shortTime}`
                        : locale === 'es'
                            ? `${p.name} se liberarán a las ${shortTime}`
                            : `${p.name} ${verbUnlockPt} às ${shortTime}`;
                    best = {
                        type: 'unblock',
                        profileId: p.id,
                        profileName: p.name,
                        when,
                        at: when,
                        time: `${pad2(ev.until.getHours())}:${pad2(ev.until.getMinutes())}`,
                        shortTime,
                        dayOffset: ev.until.getDate() !== dt.getDate() ? 1 : 0,
                        text
                    };
                }
                return;
            }

            if (p.rules.schedule && p.rules.schedule.enabled) {
                const occ = nextScheduleOccurrence(p.rules.schedule, dt);
                if (occ && !occ.active && !occ.noDays && !occ.invalid && occ.startsAt instanceof Date) {
                    const when = occ.startsAt.getTime();
                    if (!best || when < best.when) {
                        const shortTime = formatShortHour(occ.from);
                        const fem = /^(redes|not[ií]cias)/i.test(p.name);
                        const verbPt = fem ? 'serão bloqueadas' : 'serão bloqueados';
                        let text;
                        if (occ.startDayOffset === 0) {
                            text = locale === 'en'
                                ? `${p.name} will be blocked at ${shortTime}`
                                : locale === 'es'
                                    ? `${p.name} se bloquearán a las ${shortTime}`
                                    : `${p.name} ${verbPt} às ${shortTime}`;
                        } else if (occ.startDayOffset === 1 && occ.tomorrowInDays) {
                            text = locale === 'en'
                                ? `${p.name} will be blocked tomorrow at ${shortTime}`
                                : locale === 'es'
                                    ? `${p.name} se bloquearán mañana a las ${shortTime}`
                                    : `${p.name} ${verbPt} amanhã às ${shortTime}`;
                        } else {
                            const dayPh = dayPhrase(occ.startDay, locale);
                            text = locale === 'en'
                                ? `${p.name} will be blocked ${dayPh} at ${shortTime}`
                                : locale === 'es'
                                    ? `${p.name} se bloquearán ${dayPh} a las ${shortTime}`
                                    : `${p.name} ${verbPt} ${dayPh} às ${shortTime}`;
                        }
                        best = {
                            type: 'block',
                            profileId: p.id,
                            profileName: p.name,
                            when,
                            at: when,
                            time: occ.from,
                            shortTime,
                            dayOffset: occ.startDayOffset,
                            text
                        };
                    }
                }
            }
        });

        return best;
    }

    function nextChange(profiles, now = new Date(), context = {}) {
        const info = nextChangeInfo(profiles, now, context);
        return info ? info.text : null;
    }

    /**
     * Builds DNR block rules from profiles.
     * - Unchecked profiles (`enabled: false` / `selected: false`) are never included (M10).
     * - When `context` (or a `Date`) is passed, only profiles that are currently blocking
     *   at that moment enter the rules.
     * - When `context` is omitted, all enabled profiles with at least one active rule
     *   (and not already excluded by a non-matching schedule/limit in the profile) enter the rules.
     */
    function buildRulesFromProfiles(profiles, blockedPageUrl, context) {
        let url = blockedPageUrl;
        let ctx = context;
        if (blockedPageUrl && typeof blockedPageUrl === 'object') {
            ctx = blockedPageUrl;
            url = ctx.blockedPageUrl || 'blocked.html';
        }
        if (ctx instanceof Date || typeof ctx === 'number') {
            ctx = { now: ctx };
        }
        url = url || 'blocked.html';

        const list = normalizeProfiles(profiles).filter(p => p.enabled !== false && p.sites.length > 0);
        const activeDomains = [];

        list.forEach(p => {
            if (ctx && typeof ctx === 'object') {
                const ev = evaluateProfile(p, ctx, ctx.now || new Date());
                if (ev.blocked) activeDomains.push(...p.sites);
                return;
            }
            // No runtime context passed: include enabled profiles that have at least one active rule
            const r = p.rules;
            const hasSched = Boolean(r.schedule && r.schedule.enabled && r.schedule.days && r.schedule.days.length);
            const hasLimit = Boolean(r.dailyLimitMin > 0);
            if (r.duringFocus || hasSched || hasLimit) {
                activeDomains.push(...p.sites);
            }
        });

        if (!activeDomains.length) return [];
        return buildBlockRules(activeDomains, url);
    }

    function findBlockingProfile(profiles, domainOrHostname, context = {}, now = new Date()) {
        const clean = siteDomain(domainOrHostname);
        if (!clean) return null;
        const list = normalizeProfiles(profiles).filter(p => p.enabled !== false);
        const matching = list.filter(p => p.sites.some(s => matchesSiteOrAlias(clean, s)));
        if (!matching.length) return null;

        for (const p of matching) {
            const ev = evaluateProfile(p, context, now);
            if (ev.blocked) return { profile: p, evaluation: ev };
        }
        const first = matching[0];
        return { profile: first, evaluation: evaluateProfile(first, context, now) };
    }

    // ── Temporary Access Counters ─────────────────────

    function resolveTempUsage(profile, stateOrNow, now) {
        let dt = now;
        let state = null;
        if (stateOrNow instanceof Date || typeof stateOrNow === 'number' || typeof stateOrNow === 'string') {
            dt = stateOrNow;
        } else if (stateOrNow && typeof stateOrNow === 'object') {
            state = stateOrNow;
            if (stateOrNow.now) dt = stateOrNow.now;
        }
        const today = isoDate(dt);
        const raw = (state && (state[profile.id] || state.tempAccess || state)) || profile.tempAccess || {};
        const count = raw.date === today ? Math.max(0, parseInt(raw.count, 10) || 0) : 0;
        const reasons = raw.date === today && Array.isArray(raw.reasons) ? raw.reasons.slice() : [];
        return { today, count, reasons, dt: toDate(dt) };
    }

    function remainingTemporaryAccesses(profile, stateOrNow, now) {
        const p = normalizeProfile(profile);
        if (!p || !p.rules.temporaryAccess || !p.rules.temporaryAccess.enabled) return 0;
        const { count } = resolveTempUsage(p, stateOrNow, now);
        return Math.max(0, p.rules.temporaryAccess.perDay - count);
    }

    function canUseTemporaryAccess(profile, stateOrNow, now) {
        return remainingTemporaryAccesses(profile, stateOrNow, now) > 0;
    }

    function consumeTemporaryAccess(profile, stateOrNow, now) {
        const p = normalizeProfile(profile);
        const { today, count, reasons, dt } = resolveTempUsage(p || { id: 'default' }, stateOrNow, now);
        const tempCfg = p && p.rules && p.rules.temporaryAccess
            ? p.rules.temporaryAccess
            : { enabled: false, minutes: 5, perDay: 3 };

        if (!p || p.enabled === false || !tempCfg.enabled || count >= tempCfg.perDay) {
            return {
                allowed: false,
                used: count,
                remaining: 0,
                perDay: tempCfg.perDay,
                minutes: tempCfg.minutes,
                expiresAt: null,
                profile: p
            };
        }

        const nextCount = count + 1;
        const remaining = Math.max(0, tempCfg.perDay - nextCount);
        const expiresAt = dt.getTime() + tempCfg.minutes * 60 * 1000;
        const reason = stateOrNow && typeof stateOrNow === 'object' && typeof stateOrNow.reason === 'string'
            ? stateOrNow.reason.trim()
            : '';
        if (reason) reasons.push({ at: dt.getTime(), text: reason.slice(0, 120) });

        const updatedProfile = Object.assign({}, p, {
            tempAccess: {
                date: today,
                count: nextCount,
                reasons
            }
        });

        return {
            allowed: true,
            used: nextCount,
            remaining,
            perDay: tempCfg.perDay,
            minutes: tempCfg.minutes,
            expiresAt,
            profile: updatedProfile
        };
    }

    global.BlockerCore = {
        DOMAIN_ALIASES,
        OAUTH_EXCEPTION_FILTERS,
        ALL_DAYS,
        WEEKDAYS,
        DAY_NAMES,
        DAY_SHORT,
        SUGGESTED_PROFILES,
        isAuthWhitelisted,
        hashCode,
        allowRuleIdFor,
        extractDomain,
        matchesSiteOrAlias,
        isWithinBlockedSchedule,
        minutesUntilBlockedWindow,
        buildAllowRules,
        buildBlockRules,
        // Phase 4 profile & rule APIs
        parseTimeMinutes,
        formatTimeMinutes,
        formatShortHour,
        formatDuration,
        normalizeDays,
        normalizeSchedule,
        normalizeTemporaryAccess,
        normalizeProfile,
        normalizeProfiles,
        legacyToProfiles,
        profilesFromConfig,
        flattenSites,
        isScheduleBlocking,
        scheduleEndTime,
        nextMidnight,
        nextScheduleOccurrence,
        consequenceDetails,
        describeConsequence,
        describeProfileRule,
        usedMinutesForProfile,
        isDailyLimitReached,
        evaluateProfile,
        nextChangeInfo,
        nextChange,
        buildRulesFromProfiles,
        findBlockingProfile,
        remainingTemporaryAccesses,
        canUseTemporaryAccess,
        consumeTemporaryAccess
    };
})(typeof self !== 'undefined' ? self : this);
