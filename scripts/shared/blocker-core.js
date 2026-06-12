// ============================================================
// BLOCKER CORE — Shared, dependency-free blocker logic
// ============================================================
// Single source of truth used by three contexts:
//   - scripts/modules/blocker.js  (new tab page)
//   - scripts/blocked.js          (blocked page)
//   - sw.js                       (background service worker, via importScripts)
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
            if (!url.startsWith('http')) url = 'https://' + url;
            const hostname = new URL(url).hostname;
            return hostname.replace(/^www\./, '');
        } catch (e) {
            return null;
        }
    }

    function matchesSiteOrAlias(hostname, site) {
        const candidates = [site.url, ...(DOMAIN_ALIASES[site.url] || [])];
        for (const d of candidates) {
            if (hostname === d || hostname.endsWith('.' + d)) return true;
        }
        return false;
    }

    function isWithinBlockedSchedule(scheduleLimit, now = new Date()) {
        if (!scheduleLimit || !Array.isArray(scheduleLimit.schedules)) return false;
        const cur = now.getHours() * 60 + now.getMinutes();

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
        const cur = now.getHours() * 60 + now.getMinutes();

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
     * Used by blocked.html when the user earns access ("Continuar" / gospel).
     */
    function buildAllowRules(primaryDomain) {
        const allDomains = [primaryDomain, ...(DOMAIN_ALIASES[primaryDomain] || [])];
        const ruleId = allowRuleIdFor(primaryDomain);
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
     * Includes the OAuth allow exceptions (priority 3) followed by one
     * redirect rule per site (priority 1). IDs start at 1 and stay < 1000.
     *
     * ALL sites (always + limited) get redirected to blocked.html?domain=X;
     * the blocked page reads the query param, checks the config and shows
     * the appropriate UI. Domain aliases are bundled into each rule via
     * requestDomains, except aliases that exist as separate entries.
     */
    function buildBlockRules(sites, blockedPageUrl) {
        const rules = [];
        let ruleId = 1;

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

        sites.forEach(site => {
            const allDomains = [site.url];
            const aliases = DOMAIN_ALIASES[site.url] || [];
            aliases.forEach(alias => {
                if (!sites.some(s => s.url === alias)) {
                    allDomains.push(alias);
                }
            });

            rules.push({
                id: ruleId++,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        url: blockedPageUrl + '?domain=' + encodeURIComponent(site.url)
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

    global.BlockerCore = {
        DOMAIN_ALIASES,
        OAUTH_EXCEPTION_FILTERS,
        isAuthWhitelisted,
        hashCode,
        allowRuleIdFor,
        extractDomain,
        matchesSiteOrAlias,
        isWithinBlockedSchedule,
        minutesUntilBlockedWindow,
        buildAllowRules,
        buildBlockRules
    };
})(typeof self !== 'undefined' ? self : this);
