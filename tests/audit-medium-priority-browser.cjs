// Audit B06–B11. B05 is exercised for focus/schedule/limit by
// audit-high-priority-browser.cjs. All writes use an isolated extension profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require(process.env.ORA_PLAYWRIGHT || 'playwright')); } catch {
    ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')));
}
const root = path.resolve(__dirname, '..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ora-medium-qa-'));
let checks = 0;
function check(name, actual, expected = true) {
    assert.deepEqual(actual, expected, name);
    checks++;
    console.log('PASS ' + name);
}

(async () => {
    const context = await chromium.launchPersistentContext(path.join(artifacts, 'profile'), {
        executablePath: process.env.ORA_CHROMIUM,
        channel: process.env.ORA_CHROMIUM ? undefined : 'chromium',
        headless: true,
        args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
        viewport: { width: 1280, height: 850 }
    });
    const errors = [];
    context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
    try {
        const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const base = 'chrome-extension://' + new URL(sw.url()).host;
        await sw.evaluate(async () => {
            await ensureMigrated();
            await chrome.storage.local.set({ ora_onboarding_done: true, ora_reduce_motion: true });
            await chrome.storage.session.set({ ora_bg_loaded: true });
        });
        // No HTTP request is allowed and there is no prior font/CSS cache.
        await context.setOffline(true);
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        await page.goto(base + '/ora.html');
        await page.waitForFunction(() => window.TodaySystem?.view && window.FrutosSystem?.elements?.reflection && window.SyncSystem?._meta);
        await page.evaluate(() => document.fonts.ready);
        const icon = await page.locator('#btn-settings i').evaluate(el => ({
            content: getComputedStyle(el, '::before').content,
            width: el.getBoundingClientRect().width,
            loaded: document.fonts.check('20px Phosphor')
        }));
        check('B10: settings icon has a glyph and loaded local font on first offline opening',
            icon.loaded && icon.width > 0 && !['none', 'normal', '""', ''].includes(icon.content));
        check('B10: every icon weight can load offline', await page.evaluate(async () => {
            const fonts = ['Phosphor', 'Phosphor-Bold', 'Phosphor-Duotone', 'Phosphor-Fill', 'Phosphor-Light', 'Phosphor-Thin'];
            return (await Promise.all(fonts.map(async name => (await document.fonts.load(`20px "${name}"`)).length > 0))).every(Boolean);
        }));
        check('B10: all six icon stylesheets are bundled', await page.evaluate(() => {
            const links = [...document.querySelectorAll('link[href*="phosphor/"]')];
            return links.length === 6 && links.every(link => link.href.startsWith(location.origin + '/assets/'));
        }));
        await page.screenshot({ path: path.join(artifacts, 'offline-today.png') });
        const blocked = await context.newPage();
        await blocked.goto(base + '/blocked.html?domain=example.test&reason=focus');
        await blocked.evaluate(() => document.fonts.ready);
        check('B10: interception icon also loads offline', await blocked.locator('.ph-wind').evaluate(el =>
            document.fonts.check('20px Phosphor') && el.getBoundingClientRect().width > 0));
        await blocked.close();

        // B06: hold a real reflection write while the user types a newer draft.
        await page.evaluate(() => RouterSystem.navigate('frutos'));
        await page.waitForFunction(() => FrutosSystem.period !== null);
        const reflection = page.locator('#frutos-reflection');
        await reflection.fill('Primeira versão');
        await page.evaluate(() => {
            window.__realSet = AsyncStorage.set;
            AsyncStorage.set = async function(key, value) {
                if (key === 'ora_reflections') {
                    window.__writePending = true;
                    await new Promise(resolve => { window.__releaseWrite = resolve; });
                }
                return window.__realSet.call(this, key, value);
            };
            window.__saving = FrutosSystem.saveReflection();
        });
        await page.waitForFunction(() => window.__writePending);
        await reflection.fill('Segunda versão digitada durante a gravação');
        await page.evaluate(async () => {
            window.__releaseWrite();
            await window.__saving;
            AsyncStorage.set = window.__realSet;
        });
        check('B06: newer draft remains dirty after older save finishes', await page.evaluate(() => FrutosSystem.hasUnsaved()));
        check('B06: saved confirmation does not acknowledge newer text', await page.locator('#frutos-saved').evaluate(el => !el.classList.contains('show')));
        check('B06: only submitted version was persisted', await page.evaluate(() => FrutosSystem.currentReflection().text), 'Primeira versão');
        await page.locator('[data-period="mes"]').click();
        await page.locator('[data-period="semana"]').click();
        check('B06: newer draft survives period changes', await reflection.inputValue(), 'Segunda versão digitada durante a gravação');
        await page.locator('#frutos-save').click();
        await page.waitForFunction(() => !FrutosSystem.saving && !FrutosSystem.hasUnsaved());
        check('B06: saving the newer draft persists it', await page.evaluate(() => FrutosSystem.currentReflection().text), 'Segunda versão digitada durante a gravação');

        // Finish an older period's write after a different period was edited.
        await reflection.fill('Terceira versão');
        await page.evaluate(() => {
            window.__writePending = false;
            AsyncStorage.set = async function(key, value) {
                if (key === 'ora_reflections') {
                    window.__writePending = true;
                    await new Promise(resolve => { window.__releaseWrite = resolve; });
                }
                return window.__realSet.call(this, key, value);
            };
            window.__saving = FrutosSystem.saveReflection();
        });
        await page.waitForFunction(() => window.__writePending);
        await page.locator('[data-period="mes"]').click();
        await reflection.fill('Rascunho independente do mês');
        await page.evaluate(async () => { window.__releaseWrite(); await window.__saving; AsyncStorage.set = window.__realSet; });
        check('B06: save for another period preserves current draft', await reflection.inputValue(), 'Rascunho independente do mês');
        check('B06: no misleading saved toast in the other period', await page.locator('#frutos-saved').evaluate(el => !el.classList.contains('show')));
        await page.locator('#frutos-save').click();
        await page.waitForFunction(() => !FrutosSystem.saving && !FrutosSystem.hasUnsaved());

        // B07: first tab holds a write; second tab must wait before reading.
        await sw.evaluate(() => chrome.storage.local.set({ ora_practice_log: [] }));
        const second = await context.newPage();
        await second.goto(base + '/ora.html');
        await second.waitForFunction(() => window.TodaySystem?.view && window.PracticeLog);
        await page.evaluate(() => {
            AsyncStorage.set = async function(key, value) {
                if (key === 'ora_practice_log') {
                    window.__practicePending = true;
                    await new Promise(resolve => { window.__releasePractice = resolve; });
                }
                return window.__realSet.call(this, key, value);
            };
            window.__recording = PracticeLog.record('prayer', { id: 'audit-first' });
        });
        await page.waitForFunction(() => window.__practicePending);
        await second.evaluate(() => {
            const realGet = AsyncStorage.get;
            AsyncStorage.get = function(key, fallback) {
                if (key === 'ora_practice_log') window.__practiceRead = true;
                return realGet.call(this, key, fallback);
            };
            window.__recording = PracticeLog.record('prayer', { id: 'audit-second' });
        });
        await page.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name === 'ora-practices-write'));
        check('B07: second tab waits before reading shared history', await second.evaluate(() => !window.__practiceRead));
        const firstOK = await page.evaluate(async () => { window.__releasePractice(); const ok = await window.__recording; AsyncStorage.set = window.__realSet; return ok; });
        check('B07: both tabs receive confirmed writes', [firstOK, await second.evaluate(() => window.__recording)], [true, true]);
        check('B07: both distinct practices persist', await sw.evaluate(async () =>
            (await chrome.storage.local.get('ora_practice_log')).ora_practice_log.map(e => e.id).sort()), ['audit-first', 'audit-second']);
        check('B07: concurrent repeated prayer remains deduplicated', await Promise.all([
            page.evaluate(() => PracticeLog.record('prayer', { id: 'audit-first' })),
            second.evaluate(() => PracticeLog.record('prayer', { id: 'audit-first' }))
        ]), [true, true]);
        check('B07: deduplication does not add extra history', await sw.evaluate(async () =>
            (await chrome.storage.local.get('ora_practice_log')).ora_practice_log.length), 2);
        // One rejected write must release the lock and allow a subsequent one.
        check('B07: storage failure is reported and the queue recovers', await page.evaluate(async () => {
            AsyncStorage.set = async () => false;
            const failed = await PracticeLog.record('prayer', { id: 'audit-retry' });
            AsyncStorage.set = window.__realSet;
            return [failed, await PracticeLog.record('prayer', { id: 'audit-retry' })];
        }), [false, true]);
        await second.close();

        // B08: use the actual remote-sync listener and TasksCore reload path.
        await page.evaluate(async () => {
            const date = TasksCore.isoDate(new Date());
            await chrome.storage.local.set({ ora_tasks: [
                { id: 'audit-routine', title: 'Rotina', list: 'hoje', recurrence: { days: [0,1,2,3,4,5,6] } },
                { id: 'audit-skipped', title: 'Pulada', list: 'hoje', fromRecurrence: 'audit-routine', date, skipped: true },
                { id: 'audit-open', title: 'Aberta', list: 'hoje', fromRecurrence: 'audit-routine', date },
                { id: 'audit-done', title: 'Concluída', list: 'hoje', fromRecurrence: 'audit-routine', date, completedAt: Date.now() }
            ] });
            await chrome.storage.sync.set({ sync_routine: { v: 2, updatedAt: Date.now() + 60000, data: [] } });
        });
        await page.waitForFunction(async () => {
            const { ora_tasks } = await chrome.storage.local.get('ora_tasks');
            return !ora_tasks.some(t => t.id === 'audit-routine' || t.id === 'audit-skipped');
        });
        check('B08: skipped occurrence stays absent through remote deletion and reload', await page.evaluate(() =>
            !TasksCore.visibleTasks(TasksCore.normalizeTasks(TaskSystem.tasks)).some(t => t.id === 'audit-skipped')));
        check('B08: open and completed tasks are preserved without the deleted template', await page.evaluate(async () => {
            const tasks = TasksCore.normalizeTasks((await chrome.storage.local.get('ora_tasks')).ora_tasks);
            return tasks.some(t => t.id === 'audit-open' && !t.fromRecurrence && !t.completedAt) &&
                tasks.some(t => t.id === 'audit-done' && !t.fromRecurrence && !!t.completedAt);
        }));

        // B09: real parallel messages, then interleave domain-time writes.
        const sender = await context.newPage();
        await sender.goto(base + '/tests/tests.html');
        await sw.evaluate(async () => { await stSetActive(null); await chrome.storage.local.set({ [SCREENTIME_KEY]: {} }); });
        for (let batch = 1; batch <= 3; batch++) {
            check('B09: eight concurrent messages all confirm, batch ' + batch, await sender.evaluate(() => Promise.all(
                Array.from({ length: 8 }, () => chrome.runtime.sendMessage({ type: 'screentime:newtab' }))
            )), Array.from({ length: 8 }, () => ({ ok: true })));
            check('B09: every new tab was counted, batch ' + batch, await sw.evaluate(async () =>
                (await chrome.storage.local.get(SCREENTIME_KEY))[SCREENTIME_KEY][stDateStr()].newTabs), batch * 8);
        }
        await Promise.all([
            sender.evaluate(() => Promise.all(Array.from({ length: 8 }, () => chrome.runtime.sendMessage({ type: 'screentime:newtab' })))),
            sw.evaluate(() => Promise.all(Array.from({ length: 8 }, () => stAddSeconds('medium-audit.test', 7))))
        ]);
        check('B09: interleaved counts and seconds both survive', await sw.evaluate(async () => {
            const day = (await chrome.storage.local.get(SCREENTIME_KEY))[SCREENTIME_KEY][stDateStr()];
            return [day.newTabs, day.domains['medium-audit.test']];
        }), [32, 56]);
        await sw.evaluate(() => {
            self.__originalSet = chrome.storage.local.set.bind(chrome.storage.local);
            let rejectOnce = true;
            chrome.storage.local.set = async values => {
                if (values[SCREENTIME_KEY] && rejectOnce) { rejectOnce = false; throw new Error('audit induced storage failure'); }
                return self.__originalSet(values);
            };
        });
        const failedIncrement = await sender.evaluate(() => chrome.runtime.sendMessage({ type: 'screentime:newtab' }));
        const retriedIncrement = await sender.evaluate(() => chrome.runtime.sendMessage({ type: 'screentime:newtab' }));
        const recoveredCount = await sw.evaluate(async () => {
            chrome.storage.local.set = self.__originalSet;
            const day = (await chrome.storage.local.get(SCREENTIME_KEY))[SCREENTIME_KEY][stDateStr()];
            return day.newTabs;
        });
        check('B09: write errors propagate and do not poison following increments',
            [!!failedIncrement.error, retriedIncrement.ok, recoveredCount], [true, true, 33]);
        await sender.close();

        // B11: verify node identity, focus and selection as the cache changes.
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        const search = page.locator('#pray-search');
        await search.fill('misericórdia');
        await search.evaluate(el => { window.__searchNode = el; el.focus(); el.setSelectionRange(2, 7); });
        await sw.evaluate(async () => {
            const day = LiturgyCore.dateKey();
            const cache = LiturgyCore.merge(null, { [day]: { pt: {
                date: day, ref: 'Lucas 15,1-7', liturgia: 'Atualização auditada', text: 'Texto para o teste de atualização.'
            } } }, new Date());
            await chrome.storage.local.set({ liturgy_gospel_cache: cache });
        });
        await page.waitForFunction(() => document.querySelector('#pray-gospel-title')?.textContent === 'Lucas 15,1-7');
        check('B11: search node, text, focus and selection survive liturgy refresh', await search.evaluate(el => ({
            sameNode: el === window.__searchNode, text: el.value, focused: document.activeElement === el,
            selection: [el.selectionStart, el.selectionEnd]
        })), { sameNode: true, text: 'misericórdia', focused: true, selection: [2, 7] });
        await page.screenshot({ path: path.join(artifacts, 'rezar-refreshed.png') });
        await search.press('Enter');
        await page.waitForFunction(() => RouterSystem.current().path[0] === 'biblioteca');
        check('B11: preserved search still submits to the library', await page.locator('#prayer-search-input').inputValue(), 'misericórdia');
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        await page.evaluate(() => RezarSystem.refreshHomeGospel());
        await page.locator('.pray-gospel [data-pray-route="rezar/evangelho"]').click();
        await page.waitForFunction(() => RouterSystem.current().path[0] === 'evangelho');
        check('B11: refreshed gospel buttons remain functional', await page.evaluate(() => RouterSystem.current().path[0]), 'evangelho');
        check('no uncaught page exceptions', errors, []);
        console.log(`\n${checks} medium-priority regression checks passed. Evidence: ${artifacts}`);
    } finally {
        await context.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
