// Run: node tests/leave-guard-browser.cjs
// Uses an isolated extension profile; never touches the user's browser data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const browsers = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(browsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
let chromium;
try { ({ chromium } = require(process.env.ORA_PLAYWRIGHT || 'playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'))); }
const root = path.resolve(__dirname, '..');
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
(async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ora-leave-guard-'));
    const context = await chromium.launchPersistentContext(profile, {
        headless: true, executablePath: process.env.ORA_CHROMIUM,
        channel: process.env.ORA_CHROMIUM ? undefined : 'chromium',
        ignoreDefaultArgs: ['--mute-audio'],
        args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
        viewport: { width: 1280, height: 800 }
    });
    try {
        await context.route('https://**/*', route => route.abort());
        const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        await sw.evaluate(async () => {
            await chrome.storage.local.set({ ora_onboarding_done: true, ora_schema_version: 2 });
            await chrome.storage.session.set({ ora_bg_loaded: true });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('chrome-extension://' + new URL(sw.url()).host + '/ora.html');
        await page.waitForFunction(() => window.TodaySystem?.view && LeaveGuard.initialized && !LeaveGuard.pendingWrites);
        const protectedNow = () => page.evaluate(() => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        });
        check('idle tab has no confirmation', !await protectedNow());
        await page.evaluate(() => TaskSystem.show());
        await page.locator('#tasks-add-input').fill('Tarefa de teste');
        check('unsaved task capture is protected', await protectedNow());
        await page.locator('#tasks-add-input').fill('');
        check('reverting the capture removes confirmation', !await protectedNow());
        await page.locator('#tasks-add-input').fill('Tarefa de teste');
        await page.locator('#tasks-add-form button[type=submit]').click();
        await page.waitForFunction(() => TaskSystem.tasks.length && !LeaveGuard.pendingWrites && !document.getElementById('tasks-add-input').value);
        check('successfully added task is clean', !await protectedNow());
        await page.locator('.task-title').first().click();
        check('opening an unchanged editor is clean', !await protectedNow());
        await page.locator('.task-edit input[name=title]').fill('Titulo alterado');
        check('task editor changes are protected', await protectedNow());
        const draftTitle = await page.locator('.task-edit [name="title"]').inputValue();
        await page.evaluate(() => SettingsSystem.set('ora_locale', 'en'));
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        check('live translation preserves the task draft and warning',
            await page.locator('.task-edit [name="title"]').inputValue() === draftTitle && await protectedNow());
        await page.evaluate(() => SettingsSystem.set('ora_locale', 'pt'));
        await page.waitForFunction(() => document.documentElement.lang === 'pt-BR');
        const dialogSeen = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Native beforeunload dialog did not appear')), 5000);
            page.once('dialog', async dialog => {
                clearTimeout(timeout);
                check('browser shows a native beforeunload dialog', dialog.type() === 'beforeunload');
                await dialog.dismiss(); resolve();
            });
        });
        await page.close({ runBeforeUnload: true });
        await dialogSeen;
        check('cancelling keeps the tab and edited title', !page.isClosed() && await page.locator('.task-edit input[name=title]').inputValue() === 'Titulo alterado');
        await page.locator('[data-action=cancel]').click();
        check('cancelled task edit is clean', !await protectedNow());
        await page.locator('.task-title').first().click();
        await page.locator('.task-edit input[name=title]').fill('Titulo salvo');
        await page.locator('[data-action=save]').click();
        await page.waitForFunction(() => !LeaveGuard.pendingWrites && !TaskSystem.editingId);
        check('saved task edit is clean', !await protectedNow());
        await page.evaluate(() => TaskSystem.hide());
        await page.evaluate(() => FocusSystem.startFocus({ minutes: 25, title: 'Teste de foco', intention: '', protect: false }));
        check('running focus is protected', await protectedNow());
        await page.evaluate(() => FocusSystem.pause());
        check('paused focus is protected', await protectedNow());
        await page.evaluate(async () => { await FocusSystem.interrupt(); await FocusSystem.goHome(); });
        check('ended focus is clean', !await protectedNow());
        await page.evaluate(() => { SoundSystem.active = { choice: { kind: 'playlist' } }; LeaveGuard.refresh(); });
        check('silent open player is clean', !await protectedNow());
        await page.evaluate(async () => {
            window.testAudio = new AudioContext();
            window.testTone = testAudio.createOscillator();
            testTone.connect(testAudio.destination); testTone.start(); await testAudio.resume();
        });
        await page.waitForFunction(() => LeaveGuard.audible, null, { timeout: 15000 }).catch(async error => { console.log(await page.evaluate(async () => ({ audio: testAudio.state, tab: await chrome.tabs.getCurrent(), guardTab: LeaveGuard.tabId }))); throw error; });
        check('music audio protects the tab', await protectedNow());
        await page.evaluate(async () => { testTone.stop(); await testAudio.close(); });
        await page.waitForFunction(() => !LeaveGuard.audible, null, { timeout: 15000 });
        check('paused or ended audio is clean', !await protectedNow());
        await page.evaluate(() => { SoundSystem.active = null; LeaveGuard.refresh(); });
        // Exercise the actual persistence hook with writes completing after newer typing.
        await page.locator('#btn-settings').click();
        await page.locator('#settings-user-name').focus();
        const race = await page.evaluate(() => {
            const field = document.getElementById('settings-user-name');
            field.value = 'Primeiro';
            const older = LeaveGuard.beginSave('ora_user_name', 'Primeiro');
            field.value = 'Segundo';
            LeaveGuard.endSave(older, true);
            const stillDirty = LeaveGuard.shouldConfirm();
            const latest = LeaveGuard.beginSave('ora_user_name', 'Segundo');
            LeaveGuard.endSave(latest, false);
            const failedDirty = LeaveGuard.shouldConfirm();
            const retry = LeaveGuard.beginSave('ora_user_name', 'Segundo');
            LeaveGuard.endSave(retry, true);
            LeaveGuard.refresh();
            return { stillDirty, failedDirty, clean: !LeaveGuard.shouldConfirm() };
        });
        check('older save cannot clear newer typing', race.stillDirty);
        check('failed save remains protected', race.failedDirty);
        check('successful retry removes protection', race.clean);
        await page.locator('#settings-user-name').fill('Nome gravado');
        check('debounced name edit is protected before saving', await protectedNow());
        await page.waitForFunction(() => SettingsSystem.getUserName() === 'Nome gravado' && !LeaveGuard.pendingWrites);
        check('real autosave removes confirmation', !await protectedNow());
        await page.locator('.preferences-heading a').click();
        await page.evaluate(() => Blocker.openEditor(Blocker.config.profiles[0]));
        check('unchanged protection editor is clean', !await protectedNow());
        await page.locator('#editorProfileName').fill('Perfil modificado');
        check('protection draft is protected', await protectedNow());
        await page.evaluate(() => Blocker.saveEditor());
        await page.waitForFunction(() => !LeaveGuard.pendingWrites);
        check('saved protection draft is clean', !await protectedNow());
        await page.locator('#editorProfileName').fill('Outra modificacao');
        await page.evaluate(() => Blocker.closeEditor());
        check('discarded protection draft is clean', !await protectedNow());
        await page.evaluate(() => RouterSystem.navigate('rezar/terco'));
        await page.locator('#rosary-intention').fill('Intencao nao salva');
        check('prayer preparation is protected', await protectedNow());
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        await page.waitForFunction(() => !document.querySelector('.rosary-preparation'));
        check('discarded prayer preparation is clean', !await protectedNow());
        await page.evaluate(() => { RouterSystem.navigate('hoje'); TaskSystem.show(); TaskSystem.tasks[0].estimateMin = 60; TaskSystem.render(); });
        await page.locator('.task-title').first().click();
        check('60 minute estimate is shown in the editor', await page.locator('[name=estimate]').inputValue() === '60');
        await page.locator('.task-edit input[name=title]').fill('Duracao preservada');
        await page.locator('[data-action=save]').click();
        await page.waitForFunction(() => !TaskSystem.editingId && !LeaveGuard.pendingWrites);
        check('title edit preserves 60 minutes', await page.evaluate(() => TaskSystem.tasks[0].estimateMin === 60));
        await page.locator('.task-title').first().click();
        await page.locator('[name=estimate]').fill('37');
        await page.locator('[data-action=save]').click();
        await page.waitForFunction(() => !TaskSystem.editingId && !LeaveGuard.pendingWrites);
        check('custom minutes are saved', await page.evaluate(() => TaskSystem.tasks[0].estimateMin === 37));
        await page.locator('.task-title').first().click();
        await page.setViewportSize({width:360,height:640});
        check('task editor fits narrow panel', await page.evaluate(() => {
            const panel = document.querySelector('.tasks-panel'), editor = document.querySelector('.task-edit');
            return editor.getBoundingClientRect().right <= innerWidth && panel.scrollWidth <= panel.clientWidth + 1;
        }));
        await page.screenshot({path:path.join(profile,'tasks-360.png')});
        await page.locator('[data-action=cancel]').click();
        await page.evaluate(() => { TaskSystem.hide(); RouterSystem.navigate('rezar/leitor/pai-nosso'); });
        await page.locator('#reader-language').waitFor();
        check('language selector belongs to reading toolbar', await page.locator('.reading-options #reader-language').count() === 1);
        check('back control uses an accessible arrow', await page.locator('#reader-back[aria-label] svg').count() === 1);
        check('reader fits narrow screen', await page.evaluate(() => document.querySelector('.reading-bar').scrollWidth <= innerWidth));
        check('reader scrollbar follows shared style', await page.evaluate(() => getComputedStyle(document.getElementById('reading-scroll')).scrollbarWidth === 'thin'));
        await page.screenshot({path:path.join(profile,'reader-360.png')});
        await page.setViewportSize({width:1440,height:900});
        check('reader controls share one row on desktop', await page.evaluate(() => {
            const bar = document.querySelector('.reading-bar').getBoundingClientRect();
            return bar.height < 85 && document.querySelector('#reader-language').getBoundingClientRect().top < bar.bottom;
        }));
        await page.screenshot({path:path.join(profile,'reader-1440.png')});
        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await page.waitForFunction(() => document.querySelector('.sc .fav img')?.naturalWidth > 0);
        check('shortcut favicon loads through browser cache', await page.locator('.sc .fav img').first().getAttribute('src').then(src => src.includes('/_favicon/')));
        await page.screenshot({path:path.join(profile,'today-1440.png')});
        console.log('UI screenshots: ' + profile);
        check('no page errors', errors.length === 0 || (console.log(errors), false));
        const closed = page.waitForEvent('close');
        await page.close({ runBeforeUnload: true });
        await closed;
        check('clean tab closes without confirmation', page.isClosed());
        console.log(`${checks} leave-guard browser checks passed.`);
    } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
