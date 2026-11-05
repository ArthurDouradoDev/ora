const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const http = require('node:http');
let playwrightMod = process.env.ORA_PLAYWRIGHT || 'playwright';
let chromium;
try { ({chromium} = require(playwrightMod)); } catch {
    ({chromium} = require(path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright')));
}
const root = path.resolve(__dirname,'..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(),'ora-phase3-qa-'));
let checks = 0;
const errors = [];
function check(name,condition) { assert.ok(condition,name); checks++; console.log('PASS ' + name); }
(async () => {
    const context = await chromium.launchPersistentContext(path.join(artifacts,'profile'),{
        executablePath:process.env.ORA_CHROMIUM,
        channel:process.env.ORA_CHROMIUM ? undefined : 'chromium', headless:true,
        args:['--disable-gpu','--disable-extensions-except=' + root,'--load-extension=' + root],
        viewport:{width:1440,height:900}
    });
    const server = http.createServer((req,res) => {
        const url = new URL(req.url,'http://127.0.0.1');
        const file = path.resolve(root,'.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
        const type = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css'}[path.extname(file)] || 'application/octet-stream';
        fs.readFile(file,(error,data) => { res.writeHead(error ? 404 : 200,{'Content-Type':type + '; charset=utf-8'}); res.end(error ? '' : data); });
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    try {
        const suite = await context.newPage();
        await suite.goto(`http://127.0.0.1:${server.address().port}/tests/tests.html`);
        await suite.waitForFunction(() => Array.isArray(window.__oraTestResults) && window.__oraTestResults.length >= 306 && document.getElementById('summary').classList.contains('ok'));
        check('browser pure-function suite passes with fixtures',await suite.evaluate(() => __oraTestResults.every(r => r.pass && !r.skipped)));
        await suite.close();
        let sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const id = new URL(sw.url()).host;
        await sw.evaluate(async () => {
            await chrome.storage.local.set({ora_onboarding_done:true});
            await chrome.storage.session.set({ora_bg_loaded:true});
        });
        const page = await context.newPage();
        page.on('pageerror',error => errors.push(error.message));
        page.on('console',msg => { if(msg.type() === 'error') console.log('BROWSER ERROR ' + msg.text()); });
        await page.goto(`chrome-extension://${id}/ora.html`);
        await page.waitForFunction(() => window.RezarSystem?.root && window.TodaySystem?.elements?.gospelRead);
        await page.waitForFunction(() => document.body.classList.contains('app-ready') || !document.body.classList.contains('app-loading'));
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        await page.locator('.pray-home').waitFor();
        check('real unpacked extension initialized',await page.evaluate(() => chrome.runtime.id && !!RouterSystem));
        check('home section order',await page.evaluate(() => { const classes = [...document.querySelector('.pray-home').children].map(e => e.className); return classes.indexOf('pray-personal') < classes.indexOf('pray-gospel') && classes.indexOf('pray-gospel') < classes.indexOf('pray-practices') && classes.indexOf('pray-practices') < classes.indexOf('pray-saints'); }));

        await page.screenshot({path:path.join(artifacts,'rezar-1440.png'), animations:'disabled'});
        await page.evaluate(() => RouterSystem.navigate('rezar/biblioteca'));
        await page.locator('#prayer-search-input').fill('sao jose');
        check('library finds accented text',await page.locator('[data-prayer="trabalho-sao-jose"]').count() === 1);
        await page.locator('#prayer-category').selectOption('marian');
        check('category narrows search',await page.locator('.prayer-row').count() === 0);
        await page.locator('#prayer-category').selectOption('all');
        await page.locator('#prayer-search-input').fill('');
        await page.locator('[data-favorite="pai-nosso"]').click();
        await page.waitForFunction(() => PrayerSystem.favorites.includes('pai-nosso'));
        await page.locator('label.toggle').filter({has:page.locator('#prayer-only-favorites')}).click();
        check('favorites filter',await page.locator('.prayer-row').count() === 1);
        await page.locator('[data-prayer="pai-nosso"]').click();
        await page.locator('#reading-scroll').waitFor();
        await page.locator('#reader-papel').click();
        await page.waitForFunction(() => ReaderSystem.state.appearance === 'papel');
        check('reader paper theme persisted',await page.evaluate(async () => (await chrome.storage.local.get('ora_reader_preferences')).ora_reader_preferences.appearance === 'papel'));
        await page.locator('#reader-back').click();
        check('reader returns to library',await page.locator('#prayer-search-input').count() === 1);
        await page.evaluate(() => { PrayerSystem.state.favoritesOnly = false; PrayerSystem.render(); });
        await page.locator('[data-prayer="suplica-anjos"]').click();
        await page.waitForFunction(() => ReaderSystem.active?.ready);
        await page.evaluate(() => { const el = document.getElementById('reading-scroll'); el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
        await page.waitForFunction(() => ReaderSystem.ratio() > .45);
        await page.evaluate(() => ReaderSystem.savePosition());
        const before = await page.evaluate(() => ReaderSystem.ratio());
        await page.reload();
        await page.waitForFunction(() => ReaderSystem.active?.ready);
        const after = await page.evaluate(() => ReaderSystem.ratio());
        check('reader restores actual scroll after reload',before > .45 && Math.abs(before - after) < .03);
        await page.evaluate(() => RouterSystem.navigate('rezar/terco'));
        await page.locator('[data-mystery="gloriosos"]').click();
        await page.locator('#rosary-intention').fill('Intenção de teste');
        await page.locator('#rosary-start').click();
        await page.locator('#rosary-next').waitFor();
        await page.evaluate(async () => { const b = RosarySystem.structure.findIndex((bead,i) => bead.decade === 3 && bead.type === 'ave-maria' && RosarySystem.structure.slice(0,i + 1).filter(x => x.decade === 3 && x.type === 'ave-maria').length === 6); await RosarySystem.goTo(b); });
        const rosaryBead = await page.evaluate(() => RosarySystem.state.bead);
        await page.close();
        const reopened = await context.newPage();
        reopened.on('pageerror',error => errors.push(error.message));
        await reopened.goto(`chrome-extension://${id}/ora.html#rezar/terco`);
        await reopened.locator('#rosary-resume').waitFor();
        await reopened.locator('#rosary-resume').click();
        check('rosary resumes third mystery sixth Hail Mary in new tab',await reopened.evaluate(expected => RosarySystem.state.bead === expected && RosaryCore.position(RosarySystem.state,RosarySystem.structure).hail === 6,rosaryBead));
        await reopened.locator('#rosary-next').focus();
        await reopened.keyboard.press('ArrowRight');
        await reopened.waitForFunction(before => RosarySystem.state.bead === before + 1,rosaryBead);
        await reopened.keyboard.press('ArrowLeft');
        await reopened.waitForFunction(before => RosarySystem.state.bead === before,rosaryBead);
        check('arrow keys navigate with a control focused',true);
        await reopened.locator('#rosary-exit').focus();
        await reopened.keyboard.press('Space');
        await reopened.locator('.pray-home').waitFor();
        check('Space on Exit leaves without advancing bead',await reopened.evaluate(expected => RosarySystem.state.bead === expected,rosaryBead));
        await reopened.evaluate(() => RespiroSystem.open({view:'hoje',path:[]}));
        await reopened.locator('#respiro-begin').click();
        await reopened.locator('#respiro-next').click();
        check('Respiro returns to Hoje',await reopened.evaluate(() => RouterSystem.current().view === 'hoje'));
        await reopened.evaluate(() => RouterSystem.navigate('rezar/exame'));
        await reopened.locator('[data-exam-type="quick"]').click();
        await reopened.locator('[data-exam-choice="0"]').click();
        await reopened.locator('#exam-next').click();
        await reopened.locator('.pray-home').waitFor();
        check('examination log saved',await reopened.evaluate(async () => (await chrome.storage.local.get('ora_exam_logs')).ora_exam_logs.some(x => x.type === 'quick')));

        const sevenDays = await reopened.evaluate(async () => {
            await chrome.runtime.sendMessage({type:'liturgy:refresh'});
            const cache = (await chrome.storage.local.get('liturgy_gospel_cache')).liturgy_gospel_cache;
            return {dates:Object.keys(cache.days || {}).length,pt:Object.values(cache.days || {}).filter(d => d.pt?.text).length,en:Object.values(cache.days || {}).filter(d => d.en?.ref).length};
        });
        check('service worker preloads seven real Portuguese Gospels',sevenDays.pt === 7 && sevenDays.dates === 7);
        check('service worker preloads seven English references',sevenDays.en === 7);
        await reopened.evaluate(() => RouterSystem.navigate('rezar/lectio'));
        await reopened.locator('#lectio-next').click();
        await reopened.locator('#lectio-note').fill('Minha reflexão de teste.');
        await reopened.waitForFunction(async () => (await chrome.storage.local.get('ora_lectio_' + LiturgyCore.dateKey()))['ora_lectio_' + LiturgyCore.dateKey()]?.notes[1] === 'Minha reflexão de teste.');
        await reopened.reload();
        await reopened.locator('#lectio-note').waitFor();
        check('Lectio restores its step and local note',await reopened.locator('#lectio-note').inputValue() === 'Minha reflexão de teste.');
        await reopened.evaluate(() => RouterSystem.navigate('rezar/exame/virtudes'));
        await reopened.locator('[data-virtue="0"][data-status="success"]').click();
        await reopened.reload();
        await reopened.locator('[data-virtue="0"][data-status="success"]').waitFor();
        check('virtue checklist persists',await reopened.locator('[data-virtue="0"][data-status="success"]').getAttribute('aria-pressed') === 'true');
        await reopened.evaluate(() => RouterSystem.navigate('rezar/terco'));
        await reopened.locator('#rosary-start').click();
        await reopened.locator('#pray-confirm').waitFor({state:'visible'});
        await reopened.keyboard.press('Shift+Tab');
        check('confirmation traps Shift+Tab',await reopened.evaluate(() => document.getElementById('pray-confirm').contains(document.activeElement)));
        await reopened.keyboard.press('Escape');
        check('Esc closes confirmation and returns focus',await reopened.locator('#pray-confirm').isHidden() && await reopened.evaluate(() => document.activeElement.id === 'rosary-start'));
        const savedBead = await reopened.evaluate(() => RosarySystem.state.bead);
        await reopened.evaluate(() => { window.realSave = AsyncStorage.set; AsyncStorage.set = async () => false; RouterSystem.navigate('rezar/terco/oracao'); });
        await reopened.locator('#rosary-next').click();
        check('failed write does not advance rosary',await reopened.evaluate(before => RosarySystem.state.bead === before,savedBead));
        check('failed write reports error',await reopened.locator('#rosary-status').innerText() === 'Não foi possível guardar. Tente novamente.');
        await reopened.evaluate(() => AsyncStorage.set = window.realSave);
        await reopened.evaluate(async () => { await chrome.runtime.sendMessage({type:'pomodoro:startFocus',title:'Foco teste',minutes:25,protect:false}); });
        // An existing active/paused focus is preserved while visiting and leaving Respiro.
        const beforeFocus = await reopened.evaluate(async () => (await chrome.storage.local.get('ora_pomodoro_state')).ora_pomodoro_state);
        await reopened.evaluate(() => RespiroSystem.open({view:'hoje',path:[]}));
        await reopened.locator('#respiro-exit').click();
        check('Respiro preserves focus state',await reopened.evaluate(async before => JSON.stringify((await chrome.storage.local.get('ora_pomodoro_state')).ora_pomodoro_state) === JSON.stringify(before),beforeFocus));

        await reopened.evaluate(() => RouterSystem.navigate('rezar/biblia'));
        await reopened.locator('#bible-book').selectOption('jo');
        await reopened.locator('#bible-chapter').fill('3');
        const bibleTabPromise = context.waitForEvent('page');
        await reopened.locator('#bible-form button[type="submit"]').click();
        const bibleTab = await bibleTabPromise;
        check('Bible opens selected Catholic chapter',bibleTab.url().includes('sao-joao/3/'));
        await bibleTab.close();
        await reopened.reload();
        await reopened.locator('#bible-book').waitFor();
        check('Bible remembers the last opened chapter',await reopened.locator('#bible-book').inputValue() === 'jo' && await reopened.locator('#bible-chapter').inputValue() === '3');
        // Complete the fourth focus in the isolated profile and exercise the exact completion entry.
        await reopened.evaluate(async () => {
            const state = (await chrome.storage.local.get('ora_pomodoro_state')).ora_pomodoro_state;
            state.pomodoroCount = 3; state.expectedEndTime = Date.now() - 1000;
            await chrome.storage.local.set({ora_pomodoro_state:state});
            await chrome.runtime.sendMessage({type:'pomodoro:tick'});
            RouterSystem.navigate('hoje');
        });
        await reopened.locator('#today-respiro').waitFor({state:'visible'});
        await reopened.locator('#today-respiro').click();
        await reopened.locator('#respiro-exit').click();
        check('Respiro returns to session completion',await reopened.evaluate(() => RouterSystem.current().view === 'hoje' && TodaySystem.view?.state === 'concluida'));

        const blocked = await context.newPage();
        await blocked.goto(`chrome-extension://${id}/blocked.html?domain=example.com`);
        await blocked.locator('#blocked-respiro').waitFor();
        await blocked.locator('#blocked-respiro').click();
        await blocked.locator('#respiro-exit').waitFor();
        await blocked.locator('#respiro-exit').click();
        await blocked.waitForURL('**/blocked.html?domain=example.com');
        check('Respiro returns to blocked origin',blocked.url().includes('blocked.html?domain=example.com'));
        await blocked.close();

        // Offline behavior uses a seeded copy of today's already-fetched cache.
        await reopened.evaluate(async () => {
            const date = LiturgyCore.dateKey();
            const pt = {date,ref:'Lc 14,15-24',text:'Texto de teste offline.',liturgia:'Celebração de teste',cor:'Verde'};
            const en = {date,ref:'Luke 14:15-24',text:'',liturgia:'Saint Martin de Porres'};
            await chrome.storage.local.set({liturgy_gospel_cache:LiturgyCore.merge(null,{[date]:{pt,en}})});
        });
        await context.setOffline(true);
        await reopened.evaluate(() => RouterSystem.navigate('rezar/evangelho'));
        await reopened.locator('.reading-inner').waitFor();
        check('Gospel is available offline from date cache',(await reopened.locator('.reading-inner').innerText()).includes('Texto de teste offline.'));
        await reopened.evaluate(async () => { await chrome.storage.local.remove('liturgy_gospel_cache'); RezarSystem.cache = null; RouterSystem.navigate('rezar'); RouterSystem.navigate('rezar/evangelho'); });
        await reopened.locator('.reading-inner').waitFor();
        check('offline without cache shows honest unavailable state',(await reopened.locator('.reading-inner').innerText()).includes('indisponível'));
        await context.setOffline(false);
        for (const locale of ['en','es']) {
            await reopened.evaluate(async locale => {
                window._i18nLocale = locale; window._i18nStrings = await loadJSON(`data/i18n/${locale}.json`); applyI18n();
                const date = LiturgyCore.dateKey(); RezarSystem.cache = LiturgyCore.merge(null,{[date]:{en:{date,ref:'Luke 14:15-24',text:'',liturgia:'Saint Martin de Porres'}}});
                RouterSystem.navigate('rezar'); RouterSystem.navigate('rezar/evangelho');
            },locale);
            await reopened.locator('.reading-inner').waitFor();
            check(locale + ' Gospel uses required external source',await reopened.locator(`.reading-inner a[href*="${locale === 'en' ? 'bible.usccb.org' : 'evangeliodeldia.org'}"]`).count() > 0);
            check(locale + ' contains no raw translation keys',!(await reopened.locator('#view-rezar').innerText()).includes('pray.'));
        }
        await reopened.setViewportSize({width:800,height:600});
        await reopened.evaluate(() => RouterSystem.navigate('rezar'));
        await reopened.screenshot({path:path.join(artifacts,'rezar-800.png')});
        check('800px home has no horizontal overflow',await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await reopened.evaluate(() => RouterSystem.navigate('rezar/biblioteca'));
        await reopened.setViewportSize({width:800,height:600});
        await reopened.evaluate(() => document.documentElement.style.fontSize = '200%');
        await reopened.screenshot({path:path.join(artifacts,'library-200.png')});
        check('library search results remain visible at small size',await reopened.locator('#prayer-result-count').isVisible());

        check('text at 200% has no horizontal overflow',await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        await reopened.locator('#prayer-search-input').fill('maria');
        await reopened.waitForFunction(() => { const e = document.querySelector('.prayer-row'); return e && e.getBoundingClientRect().top < innerHeight && e.getBoundingClientRect().bottom > 0; });
        check('search keeps actual results in view with enlarged text',await reopened.locator('.prayer-row').count() > 0);
        await reopened.screenshot({path:path.join(artifacts,'library-search-200.png')});
        await reopened.emulateMedia({reducedMotion:'reduce'});
        await reopened.evaluate(() => { document.documentElement.style.fontSize = ''; RouterSystem.navigate('rezar'); });
        for (const route of ['rezar/evangelho','rezar/lectio','rezar/terco','rezar/terco/oracao','rezar/respiro','rezar/exame']) {
            await reopened.evaluate(route => RouterSystem.navigate(route),route);
            await reopened.waitForFunction(() => document.querySelector('#view-rezar [data-route-focus]'));
            await reopened.screenshot({path:path.join(artifacts,route.replaceAll('/','-') + '-800.png')});
            check(route + ' fits 800x600',await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await reopened.setViewportSize({width:400,height:300});
        await reopened.evaluate(() => RouterSystem.navigate('rezar/biblioteca'));
        check('page zoom equivalent 200% preserves width',await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        check('no uncaught browser errors',errors.length === 0);
        console.log(JSON.stringify({checks,errors,artifacts},null,2));
    } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); console.log(JSON.stringify({checks,errors,artifacts})); process.exitCode = 1; });
