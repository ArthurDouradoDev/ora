const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const http = require('node:http');

let playwrightMod = process.env.ORA_PLAYWRIGHT || 'playwright';
let chromium;
try { ({ chromium } = require(playwrightMod)); } catch {
    ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')));
}

const root = path.resolve(__dirname, '..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ora-phase4-qa-'));
let checks = 0;
const errors = [];

function check(name, condition) {
    assert.ok(condition, name);
    checks++;
    console.log('PASS ' + name);
}

(async () => {
    const context = await chromium.launchPersistentContext(path.join(artifacts, 'profile'), {
        executablePath: process.env.ORA_CHROMIUM,
        channel: process.env.ORA_CHROMIUM ? undefined : 'chromium',
        headless: true,
        args: ['--disable-gpu', '--disable-extensions-except=' + root, '--load-extension=' + root],
        viewport: { width: 1440, height: 900 }
    });

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
        const type = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.css': 'text/css'
        }[path.extname(file)] || 'application/octet-stream';
        fs.readFile(file, (error, data) => {
            res.writeHead(error ? 404 : 200, { 'Content-Type': type + '; charset=utf-8' });
            res.end(error ? '' : data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
        // 1. Pure-function test suite in browser
        const suite = await context.newPage();
        await suite.goto(`http://127.0.0.1:${server.address().port}/tests/tests.html`);
        await suite.waitForFunction(() =>
            Array.isArray(window.__oraTestResults) &&
            window.__oraTestResults.length >= 334 &&
            document.getElementById('summary').classList.contains('ok')
        );
        check('browser pure-function suite passes all 334+ tests with fixtures', await suite.evaluate(() => __oraTestResults.every(r => r.pass && !r.skipped)));
        await suite.close();

        let sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const id = new URL(sw.url()).host;
        await sw.evaluate(async () => {
            await chrome.storage.local.set({
                ora_onboarding_done: true,
                ora_debug_short_focus: true,
                ora_debug_fast_friction: true
            });
            await chrome.storage.session.set({ ora_bg_loaded: true });
        });

        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER ERROR ' + msg.text()); });
        await page.goto(`chrome-extension://${id}/ora.html`);
        await page.waitForFunction(() => window.Blocker?.config && window.ProtectionSystem?.elements?.chip && window.TodaySystem?.elements?.gospelRead);
        await page.waitForFunction(() => document.body.classList.contains('app-ready') || !document.body.classList.contains('app-loading'));

        check('legacy #blocker-modal removed from DOM', await page.evaluate(() => document.getElementById('blocker-modal') === null));

        // 2. Header pill popover -> Gerenciar proteção -> #protecao view
        await page.locator('#protection-chip').click();
        await page.locator('#protection-popover').waitFor({ state: 'visible' });
        check('protection popover opens and shows profiles summary', await page.locator('#protection-list li').count() >= 1);
        await page.locator('#protection-manage').click();
        await page.waitForFunction(() => RouterSystem.current().view === 'protecao');
        check('navigates to #protecao view', await page.locator('#view-protecao').isVisible());
        await page.screenshot({ path: path.join(artifacts, 'protecao-1440.png'), animations: 'disabled' });

        // 3. Profiles list and integrated editor
        check('default profiles rendered with checkboxes', await page.locator('.protecao-profile .protecao-profile-check').count() === 3);
        await page.locator('button[data-edit-profile="redes-sociais"]').click();
        await page.waitForFunction(() => document.getElementById('view-protecao').dataset.editing === 'true');
        check('editor opens for selected profile', await page.locator('#protecao-editor').isVisible());
        check('consequence preview has aria-live="polite"', await page.locator('#consequence').getAttribute('aria-live') === 'polite');

        // 4. M06: Consequence preview respects weekday rules (Friday night never says "amanhã")
        const fridayNightDesc = await page.evaluate(() => {
            const p = {
                id: 'trabalho',
                name: 'Redes sociais',
                enabled: true,
                sites: ['instagram.com', 'x.com'],
                rules: {
                    duringFocus: false,
                    schedule: { enabled: true, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] },
                    dailyLimitMin: 0,
                    temporaryAccess: { enabled: true, minutes: 5, perDay: 3 }
                }
            };
            // Friday 2026-10-30 21:00
            return BlockerCore.describeConsequence([p], new Date(2026, 9, 30, 21, 0, 0), { locale: 'pt' });
        });
        check('M06: Friday night weekday rule says "segunda às 09:00" and never "amanhã"',
            fridayNightDesc.includes('segunda às 09:00') && !fridayNightDesc.toLowerCase().includes('amanhã'));

        // Live editor update: enable schedule + daily limit and check consequence updates live
        await page.locator('#rSched').check();
        await page.locator('#tFrom').fill('09:00');
        await page.locator('#tTo').fill('18:00');
        await page.locator('#rLimit').check();
        await page.locator('#limitMin').fill('30');
        const liveConsequence = await page.locator('#consequence').innerText();
        check('live consequence preview updates when rules change in editor',
            liveConsequence.includes('instagram.com') && liveConsequence.includes('30 min'));

        // 5. Add and remove site in editor
        await page.locator('#siteInput').fill('reddit.com');
        await page.locator('#siteForm button[type="submit"]').click();
        check('new site chip added in editor', await page.locator('#siteChips .protecao-site-chip', { hasText: 'reddit.com' }).count() === 1);
        await page.locator('#siteChips .protecao-site-chip', { hasText: 'reddit.com' }).locator('button').click();
        check('site chip removed in editor', await page.locator('#siteChips .protecao-site-chip', { hasText: 'reddit.com' }).count() === 0);

        // 6. M11: Save failure simulation does NOT show "Salvo", shows error banner with retry, preserves previous rules
        await page.evaluate(async () => {
            await chrome.storage.local.set({ ora_debug_blocker_fail_save: true });
        });
        await page.locator('#saveBtn').click();
        await page.locator('#editorErrorBanner').waitFor({ state: 'visible' });
        check('M11: failed save does NOT show #saved', !(await page.locator('#saved').evaluate(el => el.classList.contains('show'))));
        check('M11: failed save shows error banner', (await page.locator('#editorErrorBanner').innerText()).includes('As regras não foram salvas'));

        // Clear failure flag and click retry
        await page.evaluate(async () => {
            await chrome.storage.local.remove('ora_debug_blocker_fail_save');
        });
        await page.locator('#retryBtn').click();
        await page.waitForFunction(() => document.getElementById('saved').classList.contains('show'));
        check('M11: retry after failure saves rules and shows Salvo', true);

        // Reload and verify saved rules persisted in chrome.storage.local
        await page.reload();
        await page.waitForFunction(() => window.Blocker?.config && window.RouterSystem?.current()?.view === 'protecao');
        const persistedProfile = await page.evaluate(async () => {
            const d = await chrome.storage.local.get('blocker_config');
            return d.blocker_config.profiles.find(p => p.id === 'redes-sociais');
        });
        check('M11: saved profile rules persist after reload',
            persistedProfile && persistedProfile.rules.schedule.enabled === true && persistedProfile.rules.dailyLimitMin === 30);

        // Reset redes-sociais to focus-only for clean focus test
        await page.locator('button[data-edit-profile="redes-sociais"]').click();
        await page.locator('#rSched').uncheck();
        await page.locator('#rLimit').uncheck();
        await page.locator('#saveBtn').click();
        await page.waitForFunction(() => document.getElementById('saved').classList.contains('show'));
        await page.locator('#editorCloseBtn').click();

        // 7. M10: Unchecking a profile disables it and never includes it in DNR rules or consequence
        await page.locator('input.protecao-profile-check[data-profile-toggle="redes-sociais"]').uncheck();
        await page.waitForFunction(() => {
            const p = Blocker.config.profiles.find(x => x.id === 'redes-sociais');
            return p && p.enabled === false;
        });
        await page.locator('input.protecao-profile-check[data-profile-toggle="videos"]').uncheck();
        await page.waitForFunction(() => {
            const p = Blocker.config.profiles.find(x => x.id === 'videos');
            return p && p.enabled === false;
        });
        await page.locator('input.protecao-profile-check[data-profile-toggle="noticias"]').uncheck();
        await page.waitForFunction(() => {
            const p = Blocker.config.profiles.find(x => x.id === 'noticias');
            return p && p.enabled === false;
        });
        const rulesWhileDisabled = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
        check('M10: unchecked profiles have zero DNR block rules', rulesWhileDisabled.filter(r => r.id < 1000).length === 0);

        // Re-check redes-sociais
        await page.locator('input.protecao-profile-check[data-profile-toggle="redes-sociais"]').check();
        await page.waitForFunction(() => {
            const p = Blocker.config.profiles.find(x => x.id === 'redes-sociais');
            return p && p.enabled === true;
        });

        // 8. Dialogs: Add profile dialog focus trap & Esc, Preview modal without iOS button
        await page.locator('#addProfileBtn').click();
        await page.locator('#protection-add-dialog').waitFor({ state: 'visible' });
        await page.keyboard.press('Shift+Tab');
        check('add profile dialog traps Shift+Tab', await page.evaluate(() => document.getElementById('protection-add-dialog').contains(document.activeElement)));
        await page.keyboard.press('Escape');
        check('Esc closes add profile dialog and returns focus',
            await page.locator('#protection-add-dialog').isHidden() && await page.evaluate(() => document.activeElement.id === 'addProfileBtn'));

        check('preview section has 3 web states and no iOS button',
            await page.locator('#view-protecao [data-preview-block]').count() === 3 &&
            await page.locator('#view-protecao [data-preview-block="ios"]').count() === 0);
        await page.locator('#view-protecao button[data-preview-block="focus"]').click();
        await page.locator('#protection-preview-scrim').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.locator('#protection-preview-scrim').waitFor({ state: 'hidden' });

        // 9. Without permission state (ora_debug_blocker_no_permission)
        await page.evaluate(async () => {
            await chrome.storage.local.set({ ora_debug_blocker_no_permission: true });
        });
        await page.waitForFunction(() => !document.getElementById('protecao-perm-banner').hidden);
        check('no-permission state shows #protecao-perm-banner and #grantBtn',
            await page.locator('#protecao-perm-banner').isVisible() && await page.locator('#grantBtn').isVisible());
        check('header pill reflects no-permission state',
            (await page.locator('#protection-label').innerText()).includes('sem permissão'));
        await page.screenshot({ path: path.join(artifacts, 'protecao-sem-permissao.png'), animations: 'disabled' });
        await page.evaluate(async () => {
            await chrome.storage.local.remove('ora_debug_blocker_no_permission');
        });
        await page.waitForFunction(() => document.getElementById('protecao-perm-banner').hidden);

        // 10. Real 1-min focus session with "Bloquear distrações" -> DNR redirect to blocked.html -> 3x temp access allowed, 4th denied -> Respiro return
        await page.evaluate(() => {
            RouterSystem.navigate('hoje');
            TodaySystem.openPrep({ title: 'Revisar relatório trimestral' });
        });
        await page.locator('#today-prep').waitFor({ state: 'visible' });
        await page.locator('#today-dur button[data-min="1"]').click();
        const protectChecked = await page.locator('#today-prep-protect').isChecked();
        if (!protectChecked) await page.locator('label.toggle').filter({ has: page.locator('#today-prep-protect') }).click();
        await page.locator('#today-prep-start').click();

        await page.waitForFunction(() => TodaySystem.view?.state === 'ativa');
        check('focus session active and header pill shows Proteção em foco',
            (await page.locator('#protection-label').innerText()).includes('em foco'));

        const activeDnrRules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
        check('DNR dynamic redirect rules created for instagram.com during focus',
            activeDnrRules.some(r => r.id < 1000 && r.action?.type === 'redirect' && r.condition?.requestDomains?.includes('instagram.com')));

        // Open a tab and navigate to https://instagram.com/ -> DNR redirects to blocked.html
        const blockedTab = await context.newPage();
        blockedTab.on('pageerror', error => errors.push(error.message));
        await blockedTab.goto('https://instagram.com/', { waitUntil: 'domcontentloaded' });
        await blockedTab.waitForURL(/blocked\.html\?domain=instagram\.com/);
        await blockedTab.waitForFunction(() => document.getElementById('blkWhy')?.textContent.trim().length > 0);
        check('navigating to https://instagram.com/ redirects to blocked.html', blockedTab.url().includes('blocked.html?domain=instagram.com'));
        check('blocked.html shows focus badge, domain title, and active task name',
            (await blockedTab.locator('#blkKicker').innerText()).toLowerCase().includes('foco') &&
            (await blockedTab.locator('#blkSite').innerText()).includes('instagram.com') &&
            (await blockedTab.locator('#blkWhy').innerText()).includes('Revisar relatório trimestral'));
        await blockedTab.screenshot({ path: path.join(artifacts, 'blocked-focus.png'), animations: 'disabled' });

        // Test "Fazer um respiro" on blocked.html and return to blocked.html (M12)
        await blockedTab.locator('#blocked-respiro').click();
        await blockedTab.locator('#respiro-exit').waitFor({ state: 'visible' });
        await blockedTab.locator('#respiro-exit').click();
        await blockedTab.waitForURL(/blocked\.html\?domain=instagram\.com/);
        check('M12: Fazer um respiro from blocked.html returns to blocked.html', blockedTab.url().includes('blocked.html?domain=instagram.com'));

        // Intercept https://instagram.com/ so when temporary access grants an allow rule and redirects to https://instagram.com, it resolves locally
        await context.route('https://instagram.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Instagram allowed</body></html>' }));

        // Test temporary access: 1st, 2nd, 3rd allowed; 4th denied
        for (let attempt = 1; attempt <= 3; attempt++) {
            await blockedTab.goto(`chrome-extension://${id}/blocked.html?domain=instagram.com&profile=redes-sociais&reason=focus`);
            await blockedTab.waitForFunction(() => document.getElementById('blkWhy')?.textContent.trim().length > 0);
            await blockedTab.locator('#blkTemp').waitFor({ state: 'visible' });
            await blockedTab.locator('#blkTemp').click();
            await blockedTab.locator('#blkTempBox').waitFor({ state: 'visible' });
            const noteText = await blockedTab.locator('#tempNote').innerText();
            const expectedBefore = 4 - attempt;
            check(`temp access attempt #${attempt} shows ${expectedBefore} remaining before click`, noteText.includes(String(expectedBefore)));
            await blockedTab.locator('#openTemp').click();
            await blockedTab.waitForURL(/https:\/\/instagram\.com/);
        }

        // Verify DNR allow rule was added and revoke alarm exists
        const allowRulesAfter3 = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
        check('DNR allow rule (id >= 1000) active after temporary access grant',
            allowRulesAfter3.some(r => r.id >= 1000 && r.action?.type === 'allow'));

        // 4th visit to blocked.html: temporary access must be denied (#blkTemp hidden)
        await blockedTab.goto(`chrome-extension://${id}/blocked.html?domain=instagram.com&profile=redes-sociais&reason=focus`);
        await blockedTab.waitForFunction(() => document.getElementById('blkWhy')?.textContent.trim().length > 0);
        check('4th temporary access is denied (#blkTemp hidden)',
            await blockedTab.locator('#blkTemp').isHidden() && await blockedTab.locator('#blkTempBox').isHidden());
        await blockedTab.close();

        // End focus session and verify DNR redirect rules are removed
        await page.evaluate(async () => {
            await chrome.runtime.sendMessage({ type: 'pomodoro:interrupt' });
        });
        await page.waitForFunction(() => TodaySystem.view?.state !== 'ativa');
        const rulesAfterFocusEnd = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
        check('ending focus session removes focus-only DNR redirect rules',
            rulesAfterFocusEnd.filter(r => r.id < 1000).length === 0);

        // 11. Contemplative pause and resume
        await page.evaluate(() => RouterSystem.navigate('protecao'));
        await page.locator('button[data-edit-profile="redes-sociais"]').click();
        await page.locator('#rSched').check();
        await page.locator('#tFrom').fill('00:00');
        await page.locator('#tTo').fill('23:59');
        for (let d = 0; d < 7; d++) {
            const btn = page.locator(`#days button[data-day="${d}"]`);
            if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
        }
        await page.locator('#saveBtn').click();
        await page.waitForFunction(() => document.getElementById('saved').classList.contains('show'));
        await page.locator('#editorCloseBtn').click();

        await page.locator('#pauseBtn').click();
        await page.locator('#protection-pause-dialog').waitFor({ state: 'visible' });
        await page.locator('#friction-confirm-btn').click();
        await page.waitForFunction(() => Boolean(Blocker.config.reenableAt));
        check('contemplative pause sets reenableAt, schedules alarm, and clears DNR block rules',
            await sw.evaluate(async () => {
                const alarm = await chrome.alarms.get('blocker_reenable');
                const rules = await chrome.declarativeNetRequest.getDynamicRules();
                return Boolean(alarm) && rules.filter(r => r.id < 1000).length === 0;
            }));

        await page.locator('#resumeBtn').click();
        await page.waitForFunction(() => !Blocker.config.reenableAt && Blocker.config.enabled);
        check('resuming protection re-applies DNR block rules immediately',
            await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).filter(r => r.id < 1000).length > 0));

        // 12. Schedule transition alarm in SW with ora.html closed
        await page.close();
        const swScheduleApplied = await sw.evaluate(async () => {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id),
                addRules: []
            });
            await syncBlockerRules();
            const rules = await chrome.declarativeNetRequest.getDynamicRules();
            const alarm = await chrome.alarms.get('blocker_schedule_transition');
            return { blockCount: rules.filter(r => r.id < 1000).length, hasScheduleAlarm: Boolean(alarm) };
        });
        check('SW applies schedule DNR rules and schedules transition alarm with ora.html closed',
            swScheduleApplied.blockCount > 0 && swScheduleApplied.hasScheduleAlarm);

        // 13. Migration from 1.1.5 fixture in real extension storage
        const fixture115 = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'storage-1.1.5.json'), 'utf8'));
        await sw.evaluate(async (fixture) => {
            await chrome.storage.local.clear();
            await chrome.storage.local.set(Object.assign({}, fixture, { ora_onboarding_done: true }));
            migrationPromise = null;
            await ensureMigrated();
            await syncBlockerRules();
        }, fixture115);

        const reopened = await context.newPage();
        reopened.on('pageerror', error => errors.push(error.message));
        await reopened.goto(`chrome-extension://${id}/ora.html#protecao`);
        await reopened.waitForFunction(() => window.Blocker?.config && window.RouterSystem?.current()?.view === 'protecao');
        check('1.1.5 migration creates "Meus sites" profile with instagram.com and youtube.com',
            await reopened.evaluate(() => {
                const p = Blocker.config.profiles.find(x => x.id === 'meus-sites');
                return p && p.name === 'Meus sites' && p.sites.includes('instagram.com') && p.sites.includes('youtube.com') && Blocker.config.lock?.enabled === true;
            }));

        // 14. Responsive 800x600, 200% text zoom, reduced motion, offline, and i18n (pt, en, es)
        await reopened.setViewportSize({ width: 800, height: 600 });
        await reopened.screenshot({ path: path.join(artifacts, 'protecao-800.png'), animations: 'disabled' });
        check('800x600 #protecao has no horizontal overflow',
            await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        await reopened.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await reopened.screenshot({ path: path.join(artifacts, 'protecao-200.png'), animations: 'disabled' });
        check('200% text size on #protecao has no horizontal overflow',
            await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await reopened.evaluate(() => { document.documentElement.style.fontSize = ''; });

        await reopened.emulateMedia({ reducedMotion: 'reduce' });
        await context.setOffline(true);
        await reopened.reload();
        await reopened.waitForFunction(() => window.Blocker?.config && window.RouterSystem?.current()?.view === 'protecao');
        check('#protecao works offline without errors', await reopened.locator('#view-protecao').isVisible());
        await context.setOffline(false);

        for (const locale of ['pt', 'en', 'es']) {
            await reopened.evaluate(async (loc) => {
                window._i18nLocale = loc;
                window._i18nStrings = await loadJSON(`data/i18n/${loc}.json`);
                applyI18n();
                Blocker.render();
                ProtectionSystem.render();
            }, locale);
            const text = await reopened.locator('#view-protecao').innerText();
            check(`${locale} #protecao contains no raw i18n keys`, !text.includes('protection.') && !text.includes('blocked.'));
        }

        check('no uncaught browser errors', errors.length === 0);
        console.log(JSON.stringify({ checks, errors, artifacts }, null, 2));
    } finally {
        await context.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error);
    console.log(JSON.stringify({ checks, errors, artifacts }));
    process.exitCode = 1;
});
