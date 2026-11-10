// Regression coverage for B01–B04 in RELATORIO_AUDITORIA_BUGS_ORA_2026-11-10.md.
// Uses real extension messages, storage, DNR and navigation in an isolated profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

let chromium;
try { ({ chromium } = require(process.env.ORA_PLAYWRIGHT || 'playwright')); } catch {
    ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')));
}
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ora-audit-high-'));
let checks = 0;
function check(name, actual, expected = true) {
    assert.deepEqual(actual, expected, name);
    console.log('PASS ' + name);
    checks++;
}
async function waitUntil(read, description) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
        if (await read()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out: ' + description);
}

(async () => {
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.ORA_CHROMIUM,
        channel: process.env.ORA_CHROMIUM ? undefined : 'chromium',
        headless: true,
        args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
        viewport: { width: 1280, height: 850 }
    });
    try {
        const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const extension = 'chrome-extension://' + new URL(sw.url()).host;
        await sw.evaluate(async () => {
            await ensureMigrated();
            await chrome.storage.local.set({ ora_onboarding_done: true, ora_reduce_motion: true });
            await chrome.storage.session.set({ ora_bg_loaded: true });
            self.__auditFind = BlockerCore.findBlockingProfile;
            self.__auditHits = [];
            BlockerCore.findBlockingProfile = (...args) => {
                const result = self.__auditFind(...args);
                self.__auditHits.push({ domain: args[1], blocked: result?.evaluation.blocked });
                return result;
            };
        });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        // A lightweight extension page sends commands without an automatic UI tick.
        await page.goto(extension + '/tests/tests.html');
        const send = (type, data = {}) => page.evaluate(message => chrome.runtime.sendMessage(message), { type, ...data });
        const rules = () => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).filter(r => r.action.type === 'redirect'));
        const snapshot = () => sw.evaluate(() => chrome.storage.local.get([
            POMODORO_STATE_KEY, SESSIONS_KEY, 'blocker_config', getTodayKey()
        ]));
        const configure = options => sw.evaluate(async options => {
            await chrome.alarms.clear(POMODORO_ALARM);
            await chrome.alarms.clear(BLOCKER_REENABLE_ALARM);
            await stSetActive(null);
            const state = getDefaultState();
            if (options.focus) {
                state.session = SessionsCore.startSession({ id: 'audit-focus', plannedMin: 15, now: Date.now() });
                state.isRunning = true;
                state.expectedEndTime = Date.now() + state.timeRemaining * 1000;
            }
            const minutes = offset => {
                const dt = new Date(Date.now() + offset * 60000);
                return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
            };
            const config = {
                enabled: options.enabled !== false,
                reenableAt: options.paused ? Date.now() + 3600000 : null,
                profiles: [{
                    id: 'audit', name: 'Audit', enabled: options.profileEnabled !== false,
                    sites: options.sites || ['audit.ora-audit.test'],
                    rules: {
                        duringFocus: options.mode === 'focus',
                        schedule: { enabled: options.mode === 'schedule', days: [0, 1, 2, 3, 4, 5, 6],
                            from: minutes(options.inactive ? 60 : -60), to: minutes(options.inactive ? 120 : 60) },
                        dailyLimitMin: options.limit || 0,
                        temporaryAccess: { enabled: true, minutes: 5, perDay: 3 }
                    }
                }]
            };
            await chrome.storage.local.set({
                [POMODORO_STATE_KEY]: state, blocker_config: config,
                [SESSIONS_KEY]: [], [SCREENTIME_KEY]: {}, [state.todayKey]: '0'
            });
            await chrome.storage.session.set({ blocker_sessions: {} });
            await syncBlockerRules();
            self.__auditHits = [];
        }, options);

        await context.route('https://*.ora-audit.test/**', route => route.fulfill({
            contentType: 'text/html', body: '<html><title>Allowed test site</title><h1>Allowed test site</h1></html>'
        }));
        const web = await context.newPage();
        web.setDefaultTimeout(12000);
        const visitAllowed = async name => {
            await web.goto('https://audit.ora-audit.test/' + name);
            await sw.evaluate(() => new Promise((resolve, reject) => {
                const deadline = Date.now() + 10000;
                const poll = () => {
                    if (self.__auditHits.some(h => h.domain === 'audit.ora-audit.test')) return resolve();
                    if (Date.now() >= deadline) return reject(new Error('Fallback navigation was not evaluated'));
                    setTimeout(poll, 50);
                };
                poll();
            }));
            check('B01: ' + name + ' remains accessible', new URL(web.url()).hostname, 'audit.ora-audit.test');
        };
        for (const [name, options] of [
            ['focus inactive', { mode: 'focus' }],
            ['schedule inactive', { mode: 'schedule', inactive: true }],
            ['limit not reached', { limit: 2 }],
            ['profile disabled', { mode: 'focus', focus: true, profileEnabled: false }],
            ['contemplative pause', { mode: 'focus', focus: true, paused: true }]
        ]) {
            await configure(options);
            check('B01: ' + name + ' has no DNR redirect', (await rules()).length, 0);
            await visitAllowed(name);
        }
        // Deliberately remove DNR to exercise the navigation fallback itself.
        for (const reason of ['focus', 'schedule', 'limit']) {
            await configure({ mode: reason, focus: reason === 'focus', limit: reason === 'limit' ? 1 : 0 });
            if (reason === 'limit') await sw.evaluate(() => stAddSeconds('audit.ora-audit.test', 60));
            await sw.evaluate(async () => chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id)
            }));
            const original = 'https://audit.ora-audit.test/path?q=' + reason;
            await web.goto(original).catch(error => { if (!error.message.includes('interrupted')) throw error; });
            await web.waitForURL(url => url.pathname === '/blocked.html');
            const params = new URL(web.url()).searchParams;
            check('B01/B05: active fallback parameters for ' + reason, Object.fromEntries(params), {
                domain: 'audit.ora-audit.test', profile: 'audit', reason, url: original
            });
        }
        await web.close();
        await sw.evaluate(() => { BlockerCore.findBlockingProfile = self.__auditFind; });

        await configure({ mode: 'focus', enabled: false });
        const ui = await context.newPage();
        ui.setDefaultTimeout(12000);
        await ui.goto(extension + '/ora.html');
        await ui.waitForFunction(() => window.TodaySystem?.view && window.SettingsSystem?.root);
        await send('pomodoro:startFocus', { minutes: 15, title: 'Keep this session', intention: 'Audit intention', protect: true });
        await send('pomodoro:pause');
        await sw.evaluate(async () => {
            const data = await chrome.storage.local.get(POMODORO_STATE_KEY);
            const state = data[POMODORO_STATE_KEY];
            state.timeRemaining = 835;
            state.session.focusedMs = 65000;
            await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
        });
        const paused = (await snapshot()).ora_pomodoro_state;
        await ui.locator('#btn-settings').click();
        await ui.locator('[data-settings-section="foco"]').click();
        await ui.locator('[data-settings-panel="foco"] details summary').click();
        await ui.locator('.preference-toggle:has(#setting-sound)').click();
        await ui.waitForFunction(sound => FocusSystem.settings.sound !== sound, paused.settings.sound);
        let current = (await snapshot()).ora_pomodoro_state;
        check('B02: UI sound change preserves paused progress, session and protection',
            { ...current, settings: paused.settings }, paused);
        check('B02: changing settings creates no interrupted record', (await snapshot()).ora_sessions, []);
        check('B02: protection still blocks during paused focus', (await rules()).length > 0);
        const updated = await send('pomodoro:updateSettings', { settings: { focus: 50, pause: 8, longPause: 20, autoNext: true, continuousAlarm: true, wakeLock: true } });
        check('B02: duration and other preferences preserve the current session',
            { ...updated.state, settings: paused.settings }, paused);
        await ui.reload();
        await ui.waitForFunction(() => window.FocusSystem?.state?.session);
        check('B02: paused state survives reload', await ui.evaluate(() => FocusSystem.state.session), paused.session);
        const resumed = await send('pomodoro:start');
        check('B02: resume uses the same session and remaining time',
            [resumed.state.session.id, resumed.state.totalDuration, resumed.state.timeRemaining],
            [paused.session.id, 900, 835]);
        await send('pomodoro:interrupt');
        check('B02: interruption restores session-owned protection', (await snapshot()).blocker_config.enabled, false);
        check('B02: interruption removes focus rules', (await rules()).length, 0);
        await ui.close();
        await send('pomodoro:updateSettings', { settings: { focus: 30 } });
        check('B02: an unstarted phase follows its changed default', (await snapshot()).ora_pomodoro_state.timeRemaining, 1800);
        await sw.evaluate(async () => {
            const state = getDefaultState();
            state.phase = 'pause'; state.totalDuration = 300; state.timeRemaining = 123;
            await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
        });
        const rest = await send('pomodoro:updateSettings', { settings: { sound: false, pause: 10 } });
        check('B02: paused break keeps its progress', [rest.state.timeRemaining, rest.state.totalDuration], [123, 300]);

        await configure({ limit: 1, sites: ['example.com', 'another.test'] });
        await sw.evaluate(() => stAddSeconds('sub.example.com', 30));
        check('B03: no block below daily limit', (await rules()).length, 0);
        await sw.evaluate(() => stAddSeconds('another.test', 30));
        check('B03: aggregated domains and subdomains trigger DNR at the limit', (await rules()).length > 0);
        await configure({ limit: 30, sites: ['x.com'] });
        await sw.evaluate(() => stAddSeconds('twitter.com', 1799));
        check('B03: no block one second below a larger limit', (await rules()).length, 0);
        await sw.evaluate(() => stAddSeconds('twitter.com', 1));
        check('B03: alias usage triggers a larger daily limit', (await rules()).length > 0);
        await configure({ limit: 1, enabled: false });
        await sw.evaluate(() => stAddSeconds('audit.ora-audit.test', 60));
        check('B03: disabled protection stays unblocked at the limit', (await rules()).length, 0);

        const injectFailure = () => sw.evaluate(() => {
            self.__auditSet = chrome.storage.local.set.bind(chrome.storage.local);
            chrome.storage.local.set = async changes => {
                if (Object.hasOwn(changes, POMODORO_STATE_KEY)) throw new Error('audit: timer write rejected');
                return self.__auditSet(changes);
            };
        });
        const restoreStorage = () => sw.evaluate(() => { chrome.storage.local.set = self.__auditSet; });
        await configure({ mode: 'focus', enabled: false, paused: true });
        await sw.evaluate(() => chrome.alarms.create(BLOCKER_REENABLE_ALARM, { when: Date.now() + 3600000 }));
        const beforeStart = await snapshot();
        await injectFailure();
        const failed = await send('pomodoro:startFocus', { minutes: 15, protect: true });
        check('B04: failed start returns an error without success state', failed, { error: 'audit: timer write rejected' });
        check('B04: failed start changes neither timer, protection, history nor totals', await snapshot(), beforeStart);
        check('B04: failed start leaves no timer alarm', await sw.evaluate(async () => !!(await chrome.alarms.get(POMODORO_ALARM))), false);
        check('B04: failed start preserves the contemplative-pause alarm', await sw.evaluate(async () => !!(await chrome.alarms.get(BLOCKER_REENABLE_ALARM))));
        check('B04: failed start installs no DNR redirect', (await rules()).length, 0);
        await restoreStorage();

        // Verify visible error and retry through Hoje's real command handler.
        const errorUI = await context.newPage();
        await errorUI.goto(extension + '/ora.html');
        await errorUI.waitForFunction(() => window.TodaySystem?.view);
        await injectFailure();
        await errorUI.evaluate(() => TodaySystem.beginFocus({ minutes: 15, title: 'Retry audit', protect: true }));
        await errorUI.waitForFunction(() => TodaySystem.view.state === 'falha' && !TodaySystem.elements.alert.hidden);
        check('B04: Hoje displays a retryable failure', await errorUI.evaluate(() => !!TodaySystem.error.retry));
        await restoreStorage();
        await errorUI.evaluate(() => TodaySystem.error.retry());
        await errorUI.waitForFunction(() => FocusSystem.state?.isRunning && TodaySystem.view.state === 'ativa');
        check('B04: retry persists the real running session', (await snapshot()).ora_pomodoro_state.session.title, 'Retry audit');
        await errorUI.close();

        // Accrued focus makes any premature history/protection side effects observable.
        await sw.evaluate(async () => {
            const state = (await chrome.storage.local.get(POMODORO_STATE_KEY))[POMODORO_STATE_KEY];
            state.session.focusedMs = 65000;
            state.session.resumedAt = Date.now();
            await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
        });
        for (const [type, data] of [
            ['pause', {}], ['interrupt', {}], ['reset', {}], ['skip', {}], ['close', {}],
            ['updateSettings', { settings: { sound: false } }],
            ['setSessionTask', { taskId: 'other-task' }],
            ['startFocus', { minutes: 50, title: 'Replacement', protect: false }], ['tick', {}]
        ]) {
            const before = await snapshot();
            await injectFailure();
            const response = await send('pomodoro:' + type, data);
            await restoreStorage();
            check('B04: ' + type + ' reports persistence failure', response, { error: 'audit: timer write rejected' });
            check('B04: ' + type + ' failure preserves all persisted session data', await snapshot(), before);
            check('B04: ' + type + ' failure preserves the running alarm', await sw.evaluate(async () => !!(await chrome.alarms.get(POMODORO_ALARM))));
        }
        await sw.evaluate(async () => {
            const state = (await chrome.storage.local.get(POMODORO_STATE_KEY))[POMODORO_STATE_KEY];
            state.expectedEndTime = Date.now() - 1;
            await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
        });
        const beforeCompletion = await snapshot();
        await injectFailure();
        check('B04: completion failure reaches caller', await send('pomodoro:tick'), { error: 'audit: timer write rejected' });
        check('B04: completion failure preserves session and protection for retry', await snapshot(), beforeCompletion);
        await restoreStorage();
        const completions = await Promise.all([send('pomodoro:tick'), send('pomodoro:tick'), send('pomodoro:tick')]);
        check('B04: concurrent retries complete successfully', completions.every(r => r.state?.completed));
        check('B04: completion retries record the session exactly once', (await snapshot()).ora_sessions.length, 1);
        check('B04: completion restores protection', (await snapshot()).blocker_config.enabled, false);
        check('B04: completion removes DNR redirects', (await rules()).length, 0);
        check('B04: completion restores the original contemplative-pause deadline',
            (await snapshot()).blocker_config.reenableAt, beforeStart.blocker_config.reenableAt);
        check('B04: completion restores the re-enable alarm',
            (await sw.evaluate(() => chrome.alarms.get(BLOCKER_REENABLE_ALARM))).scheduledTime,
            beforeStart.blocker_config.reenableAt);

        for (const scenario of ['resume', 'startBreak', 'home', 'rollover']) {
            await configure({ mode: 'focus', enabled: false });
            await sw.evaluate(async scenario => {
                const state = getDefaultState();
                if (scenario === 'resume' || scenario === 'rollover') {
                    state.session = SessionsCore.startSession({
                        id: 'audit-paused', plannedMin: 25, alreadyFocusedMs: 65000, paused: true, now: Date.now()
                    });
                    state.timeRemaining -= 65;
                } else {
                    state.phase = 'pause'; state.totalDuration = state.timeRemaining = 300;
                }
                if (scenario === 'rollover') {
                    state.todayKey = PomodoroCore.todayKey(new Date(Date.now() - 86400000));
                    state.protection = { active: true, owned: true };
                }
                const cfg = (await chrome.storage.local.get('blocker_config')).blocker_config;
                if (scenario === 'rollover') cfg.enabled = true;
                await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state, blocker_config: cfg });
            }, scenario);
            const before = await snapshot();
            await injectFailure();
            const type = { resume: 'start', startBreak: 'startBreak', home: 'home', rollover: 'getState' }[scenario];
            const response = await send('pomodoro:' + type);
            await restoreStorage();
            check('B04: ' + scenario + ' reports persistence failure', response, { error: 'audit: timer write rejected' });
            check('B04: ' + scenario + ' preserves stored state on failure', await snapshot(), before);
            check('B04: ' + scenario + ' does not install a timer alarm on failure',
                await sw.evaluate(async () => !!(await chrome.alarms.get(POMODORO_ALARM))), false);
        }
        await configure({ mode: 'focus' });
        const beforeRead = await snapshot();
        await sw.evaluate(() => {
            self.__auditGet = chrome.storage.local.get.bind(chrome.storage.local);
            chrome.storage.local.get = async keys => {
                if (Array.isArray(keys) && keys.includes(POMODORO_STATE_KEY)) throw new Error('audit: timer read rejected');
                return self.__auditGet(keys);
            };
        });
        check('B04: a read failure is reported instead of starting from defaults',
            await send('pomodoro:startFocus', { minutes: 15 }), { error: 'audit: timer read rejected' });
        await sw.evaluate(() => { chrome.storage.local.get = self.__auditGet; });
        check('B04: failed read does not overwrite existing data', await snapshot(), beforeRead);

        // Real alarm failure/retry with no Ora UI open: the failed one-shot
        // alarm must not strand a running session after its deadline.
        await configure({ mode: 'focus', enabled: false });
        await send('pomodoro:startFocus', { minutes: 1, protect: true });
        await sw.evaluate(async () => {
            const state = (await chrome.storage.local.get(POMODORO_STATE_KEY))[POMODORO_STATE_KEY];
            state.session.resumedAt = Date.now() - 61000;
            state.expectedEndTime = Date.now() - 1;
            await chrome.storage.local.set({ [POMODORO_STATE_KEY]: state });
        });
        const beforeAlarm = await snapshot();
        await injectFailure();
        await sw.evaluate(() => chrome.alarms.create(POMODORO_ALARM, { when: Date.now() + 500 }));
        await waitUntil(() => sw.evaluate(async () => {
            const alarm = await chrome.alarms.get('ora-pomodoro-tick');
            return alarm && alarm.scheduledTime > Date.now() + 20000;
        }), 'alarm rescheduled after failed commit');
        check('B04: failed alarm schedules an automatic retry', true);
        check('B04: failed alarm preserves session and protection', await snapshot(), beforeAlarm);
        await restoreStorage();
        // Expedite the retry to avoid a 30-second wait in the test.
        await sw.evaluate(() => chrome.alarms.create(POMODORO_ALARM, { when: Date.now() + 500 }));
        await waitUntil(async () => !!(await snapshot()).ora_pomodoro_state.completed, 'alarm retry completed the session');
        check('B04: alarm retry records exactly one completed session', (await snapshot()).ora_sessions.length, 1);
        check('B04: alarm retry restores protection without Ora UI', (await snapshot()).blocker_config.enabled, false);

        console.log(`\n${checks} high-priority regression checks passed. Profile: ${profile}`);
    } finally {
        await context.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
