const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

let chromium;
try { ({ chromium } = require(process.env.ORA_PLAYWRIGHT || 'playwright')); } catch {
    ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')));
}

const root = path.resolve(__dirname, '..');
const temp = fs.realpathSync(os.tmpdir());
const profile = fs.mkdtempSync(path.join(temp, 'ora-phase7-qa-'));
const screenshotDir = process.env.ORA_PHASE7_SCREENSHOTS;

(async () => {
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.ORA_CHROMIUM,
        channel: process.env.ORA_CHROMIUM ? undefined : 'chromium',
        headless: true,
        args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
        viewport: { width: 1280, height: 850 },
        acceptDownloads: true
    });
    try {
        const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const url = 'chrome-extension://' + new URL(sw.url()).host + '/ora.html';
        const errors = [];
        const newPage = async () => {
            const page = await context.newPage();
            page.setDefaultTimeout(12000);
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(url);
            await page.waitForFunction(() => window.OnboardingSystem?.root);
            return page;
        };
        const screenshot = async (page, name) => {
            if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, name + '.png') });
        };
        await sw.evaluate(() => chrome.storage.session.set({ ora_bg_loaded: true }));
        let page = await newPage();
        await page.locator('#onboarding-dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#intro-progress').textContent(), await page.evaluate(() => t('pray.stage', { n: 1, total: 5 })));
        assert.ok(await page.evaluate(() => document.querySelector('#view-hoje').inert));
        await page.locator('#intro-skip').click();
        await page.locator('#onboarding-dialog').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.querySelector('#view-hoje').inert), false);
        await page.reload();
        await page.waitForFunction(() => window.OnboardingSystem?.root);
        assert.equal(await page.locator('#onboarding-dialog').isVisible(), false);
        console.log('PASS first launch, skip, Today and completion persistence');

        await page.close();
        await sw.evaluate(() => chrome.storage.local.clear());
        page = await newPage();
        await page.locator('#onboarding-dialog').waitFor({ state: 'visible' });
        await page.locator('#intro-name').fill('Ana');
        await page.locator('#intro-locale').selectOption('en');
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        await page.locator('#intro-next').click();
        assert.equal(await page.locator('.intro-step:visible h2').textContent(), 'A place to pray and focus');
        await page.locator('#intro-next').click();
        await page.locator('#intro-sites').fill('invalid');
        await page.locator('#intro-next').click();
        assert.match(await page.locator('#intro-status').textContent(), /Check the addresses/);
        await page.locator('#intro-sites').fill('example.com, https://www.example.org/path');
        await page.locator('#intro-profiles label').first().click();
        await page.locator('#intro-next').click();
        await page.locator('#intro-reminders label').first().click();
        await page.locator('#intro-next').click();
        assert.match(await page.locator('.intro-step:visible h2').textContent(), /What Ora can access/);
        assert.equal(await page.locator('#intro-skip').isVisible(), true);
        await page.locator('#intro-next').click();
        await page.locator('#onboarding-dialog').waitFor({ state: 'hidden' });
        const onboarding = await page.evaluate(() => chrome.storage.local.get(['ora_user_name', 'ora_reminder_angelus', 'blocker_config']));
        assert.equal(onboarding.ora_user_name, 'Ana');
        assert.equal(onboarding.ora_reminder_angelus, false);
        assert.deepEqual(onboarding.blocker_config.profiles.find(p => p.id === 'primeiros-sites').sites, ['example.com', 'example.org']);
        assert.deepEqual(onboarding.blocker_config.profiles.filter(p => p.enabled).map(p => p.id), ['redes-sociais', 'primeiros-sites']);
        console.log('PASS five steps, localization, optional profiles and reminders');

        await page.locator('#btn-settings').click();
        await page.locator('[data-settings-section="dados"]').click();
        await page.locator('#settings-replay').click();
        await page.locator('#intro-skip').click();
        await page.locator('#onboarding-dialog').waitFor({ state: 'hidden' });
        await page.locator('[data-settings-section="aparencia"]').click();
        await page.locator('#settings-locale').selectOption('pt');
        await page.waitForFunction(() => document.documentElement.lang === 'pt-BR');
        await screenshot(page, 'configuracoes-desktop');
        const other = await newPage();
        await other.locator('#btn-settings').click();
        await page.evaluate(() => chrome.storage.sync.set({ sync_settings: { v: 2, updatedAt: Date.now() + 10000, data: { ora_locale: 'es' } } }));
        for (const tab of [page, other]) {
            await tab.waitForFunction(() => document.documentElement.lang === 'es');
            assert.equal(await tab.locator('#settings-locale').inputValue(), 'es');
            assert.equal(await tab.locator('.preferences-heading h1').textContent(), 'Configuración');
        }
        await other.close();
        await page.locator('#settings-locale').selectOption('pt');
        await page.waitForFunction(() => document.documentElement.lang === 'pt-BR');
        console.log('PASS live local and remote language changes across tabs');

        await page.locator('#settings-reader-appearance [data-value="papel"]').click();
        await page.locator('#settings-reader-size [data-value="28"]').click();
        await page.locator('.preference-toggle:has(#settings-reduce-motion)').click();
        await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduce');
        await page.locator('[data-settings-section="oracao"]').click();
        await page.locator('#settings-prayer-lang').selectOption('la');
        await page.locator('.preference-toggle:has(#settings-show-saint)').click();
        await page.locator('.preference-toggle:has(#settings-rosary-weekday)').click();
        await page.locator('#settings-rosary-text-mode [data-value="name"]').click();
        assert.equal(await page.locator('.preferences-heading h1').textContent(), 'Configurações');
        await page.locator('.topbar a[href="#rezar"]').click();
        assert.equal(await page.locator('.pray-saints').count(), 0);
        await page.locator('[data-pray-route="rezar/terco"]').click();
        assert.equal(await page.locator('#rosary-language').inputValue(), 'la');
        assert.equal(await page.locator('[data-text-mode="name"]').getAttribute('aria-pressed'), 'true');
        await page.evaluate(() => RouterSystem.navigate('rezar/leitor/pai-nosso'));
        await page.locator('.prayer-prose[lang="la"]').waitFor();
        assert.equal(await page.locator('.prayer-reader').getAttribute('data-appearance'), 'papel');
        assert.equal(await page.locator('#reader-size').textContent(), '28');
        await page.locator('#reader-back').click();
        await page.locator('[data-pray-route="rezar/respiro"]').click();
        await page.locator('#respiro-begin').click();
        await page.locator('.prayer-prose[lang="la"]').waitFor();
        assert.match(await page.locator('.prayer-prose').textContent(), /^Domine/);
        await page.locator('#respiro-exit').click();
        console.log('PASS reading preferences, prayer language, saint and rosary defaults');

        await page.locator('#btn-settings').click();
        await page.locator('[data-settings-section="foco"]').click();
        assert.equal(await page.locator('#setting-longPause').inputValue(), '15');
        await page.locator('#setting-focus [data-value="50"]').click();
        await page.locator('#setting-pause [data-value="10"]').click();
        await page.locator('#setting-longPause').fill('21');
        await page.locator('#setting-longPause').press('Tab');
        await page.locator('.preference-toggle:has(#setting-wakeLock)').click();
        await page.locator('.preference-toggle:has(#settings-focus-protect)').click();
        await page.waitForFunction(() => FocusSystem.settings.focus === 50 && FocusSystem.settings.pause === 10 &&
            FocusSystem.settings.longPause === 21 && FocusSystem.settings.wakeLock && !TodaySystem.protectPref);
        console.log('PASS timer settings and default focus protection');

        await page.locator('[data-settings-section="lembretes"]').click();
        const sound = page.locator('.preference-toggle:has(#settings-notification-sound)');
        const notificationSilent = name => page.evaluate(async windowName => {
            const original = window.Notification;
            let silent;
            window.Notification = class {
                static permission = 'granted';
                constructor(title, options) { silent = options.silent; }
            };
            try { await ReminderSystem.trySendNotification({ window: windowName }); }
            finally { window.Notification = original; }
            return silent;
        }, name);
        assert.equal(await notificationSilent('phase7-silent'), true);
        await sound.click();
        await page.waitForFunction(() => SettingsSystem.get('ora_notification_sound') === true);
        assert.equal(await notificationSilent('phase7-audible'), false);
        assert.equal(await page.evaluate(() => ReminderSystem.enabledMap().evening), true);
        await page.locator('.preference-toggle:has(#settings-reminder-evening)').click();
        await page.waitForFunction(() => ReminderSystem.enabledMap().evening === false);
        console.log('PASS reminder preferences and notification sound option');

        await page.evaluate(async () => {
            const date = LiturgyCore.dateKey();
            const cache = LiturgyCore.merge(null, Object.fromEntries(LiturgyCore.days().map(day => [day, {
                pt: { date: day, ref: 'Jo 1', text: 'Texto de teste' }, en: { date: day, ref: 'Jn 1', liturgia: 'Test' }
            }])));
            await chrome.storage.local.set({
                liturgy_gospel_cache: cache,
                ora_reflections: [{ key: 'month:' + date.slice(0, 7), text: 'Uma reflexão privada' }],
                ora_exam_logs: [{ id: 'exam', type: 'night', date: new Date().toISOString(), answers: ['Uma resposta privada'] }],
                ora_rituals: { [date]: { noite: { doneAt: 1, gratitude: 'Gratidão privada', reflection: 'Texto privado' } } }
            });
        });
        await page.locator('[data-settings-section="dados"]').click();
        assert.match(await page.locator('#settings-offline-hint').textContent(), /7\/7.*kB/);
        await sw.evaluate(async () => {
            const fallback = globalThis.fetch;
            globalThis.fetch = (url, options) => {
                if (String(url).startsWith('https://liturgia.up.railway.app/')) {
                    return Promise.resolve(Response.json(LiturgyCore.days().map(day => ({
                        data: day.split('-').reverse().join('/'),
                        leituras: { evangelho: [{ referencia: 'Jo 2', texto: 'Evangelho atualizado' }] }
                    }))));
                }
                return fallback(url, options);
            };
            await gospelRefresh?.catch(() => {});
        });
        await page.locator('#settings-offline').click();
        await page.waitForFunction(() => document.getElementById('settings-offline-result').dataset.settingsMessage === 'preferences.updated');
        assert.equal(await page.evaluate(() => LiturgyCore.read(SettingsSystem.cache, LiturgyCore.dateKey()).ref), 'Jo 2');
        await sw.evaluate(() => { globalThis.fetch = () => Promise.reject(new TypeError('Offline in browser test')); });
        await page.locator('#settings-offline').click();
        await page.waitForFunction(() => document.getElementById('settings-offline-result').dataset.settingsMessage === 'preferences.offline_failed');
        assert.match(await page.locator('#settings-offline-hint').textContent(), /7\/7/);
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#settings-export').click();
        const download = await downloadPromise;
        const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8')).data;
        assert.ok(Array.isArray(exported.ora_tasks) && Array.isArray(exported.ora_sessions));
        assert.ok(exported.blocker_config.profiles.length);
        assert.equal(exported.ora_reflections[0].text, 'Uma reflexão privada');
        assert.equal(Object.hasOwn(exported, 'liturgy_gospel_cache'), false);
        await page.locator('#settings-delete').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#settings-delete-dialog').isVisible(), false);
        assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('ora_reflections')).ora_reflections.length), 1);
        await page.locator('#settings-delete').click();
        await page.locator('#settings-delete-confirm').click();
        await page.locator('#settings-delete-dialog').waitFor({ state: 'hidden' });
        const after = await page.evaluate(() => chrome.storage.local.get(['ora_reflections', 'ora_exam_logs', 'ora_rituals']));
        assert.deepEqual(after.ora_reflections, []);
        assert.equal(Object.hasOwn(after.ora_exam_logs[0], 'answers'), false);
        assert.deepEqual(Object.values(after.ora_rituals)[0].noite, { doneAt: 1 });
        await page.locator('.topbar a[href="#frutos"]').click();
        assert.equal(await page.locator('#frutos-reflection').inputValue(), '');
        console.log('PASS offline coverage, JSON export, cancellation, deletion and Fruits');

        await page.locator('#btn-settings').click();
        await page.setViewportSize({ width: 390, height: 740 });
        await screenshot(page, 'configuracoes-mobile');
        assert.equal(await page.locator('#view-configuracoes').evaluate(view => view.scrollWidth > view.clientWidth), false);
        await page.setViewportSize({ width: 800, height: 600 });
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.locator('#view-configuracoes').evaluate(view => view.scrollWidth > view.clientWidth), false);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        await page.locator('.preferences-heading a').click();
        assert.equal(await page.locator('#view-protecao').isVisible(), true);
        await page.goBack();
        assert.equal(await page.locator('#view-configuracoes').isVisible(), true);
        await page.close();

        const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'storage-1.1.5.json'), 'utf8'));
        await sw.evaluate(async snapshot => {
            await chrome.storage.sync.clear();
            await chrome.storage.local.clear();
            await chrome.storage.local.set({ ...snapshot, ora_onboarding_done: true });
        }, fixture);
        page = await newPage();
        await page.locator('#onboarding-dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#intro-title').textContent(), 'O que mudou');
        assert.equal(await page.locator('[data-intro-step]:visible').count(), 0);
        assert.equal(await page.locator('[data-intro-update]').isVisible(), true);
        await screenshot(page, 'onboarding-atualizacao');
        await page.locator('#intro-next').click();
        await page.locator('#onboarding-dialog').waitFor({ state: 'hidden' });
        await page.reload();
        await page.waitForFunction(() => window.OnboardingSystem?.root);
        assert.equal(await page.locator('#onboarding-dialog').isVisible(), false);
        assert.deepEqual(errors, []);
        console.log('PASS responsive layout, Protection link, legacy update and no page errors');
    } finally {
        await context.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    if (path.dirname(profile) === temp && path.basename(profile).startsWith('ora-phase7-qa-')) {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
});
