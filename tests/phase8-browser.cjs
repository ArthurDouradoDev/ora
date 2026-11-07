// Fase 8 — tempos litúrgicos na extensão real (Chromium + Playwright).
// Uso: node tests/phase8-browser.cjs   (ORA_PHASE8_SCREENSHOTS=<pasta> para capturas)
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

let chromium;
try { ({ chromium } = require(process.env.ORA_PLAYWRIGHT || 'playwright')); } catch {
    ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')));
}

const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ora-phase8-qa-'));
const shots = process.env.ORA_PHASE8_SCREENSHOTS;

(async () => {
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.ORA_CHROMIUM,
        channel: process.env.ORA_CHROMIUM ? undefined : 'chromium',
        headless: true,
        args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
        viewport: { width: 1280, height: 850 }
    });
    const errors = [];
    try {
        const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const url = 'chrome-extension://' + new URL(sw.url()).host + '/ora.html';
        await sw.evaluate(async () => {
            await chrome.storage.local.set({ ora_onboarding_done: true, ora_user_name: 'Ana' });
            await chrome.storage.session.set({ ora_bg_loaded: true });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|liturgia|unsplash/i.test(m.text())) errors.push(m.text()); });
        await page.goto(url);
        await page.waitForFunction(() => window.SeasonsSystem?.dayKey && window.TodaySystem?.view);

        const setDate = async (iso) => {
            await sw.evaluate(async (d) => chrome.storage.local.set({ ora_debug_date: d }), iso);
            await page.waitForFunction((d) => SeasonsSystem.dayKey === d, iso);
        };
        const line = () => page.evaluate(() => { const el = document.getElementById('today-season'); return el.hidden ? null : el.textContent.trim(); });
        const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };

        await setDate('2026-11-21');
        assert.equal(await line(), null);
        console.log('PASS 21/11: sem tema, linha oculta');

        await setDate('2026-11-22');
        assert.equal(await line(), 'Faltam 7 dias para o Advento');
        await shot('hoje-22-11');
        await setDate('2026-11-28');
        assert.equal(await line(), 'Amanhã começa o Advento');
        console.log('PASS contador antes do Advento (22/11, 28/11)');

        await setDate('2026-11-29');
        assert.equal(await line(), '1ª semana do Advento · acenda a primeira vela');
        assert.equal(await page.evaluate(() => document.documentElement.dataset.season), 'advento');
        await shot('hoje-29-11');
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        await page.locator('#rezar-season').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#rezar-season .candle.lit').count(), 1);
        assert.equal(await page.locator('#rezar-season h2').textContent(), '1ª semana do Advento');
        await shot('rezar-29-11');
        console.log('PASS 29/11: 1ª vela em Hoje e em Rezar');

        await setDate('2026-12-08');
        assert.equal(await page.locator('#rezar-season .candle.lit').count(), 2);
        await page.evaluate(() => RouterSystem.navigate('hoje'));
        assert.equal(await line(), 'Imaculada Conceição de Nossa Senhora · solenidade');
        console.log('PASS 08/12: Imaculada em Hoje, coroa com 2 velas em Rezar');

        await setDate('2026-12-13');
        assert.equal(await line(), '3ª semana do Advento · Gaudete: acenda a vela rosa');
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        await page.locator('#rezar-season').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#rezar-season .candle.lit').count(), 3);
        assert.equal(await page.locator('#rezar-season .candle.rose.lit').count(), 1);
        await shot('rezar-13-12');
        await page.locator('#rezar-season [data-season-prayer]').click();
        await page.waitForFunction(() => RouterSystem.current().path[0] === 'leitor');
        assert.match(await page.locator('#view-rezar h1').first().textContent(), /vela do Advento/);
        console.log('PASS 13/12: Gaudete, vela rosa e oração da vela no leitor');

        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await setDate('2026-12-21');
        assert.equal(await line(), '4ª semana do Advento · faltam 4 dias para o Natal');
        await setDate('2026-12-24');
        assert.equal(await line(), '4ª semana do Advento · amanhã é Natal');
        console.log('PASS 21/12 e 24/12: contador do Natal na linha do Advento');

        await setDate('2026-12-25');
        assert.equal(await line(), null);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.season), undefined);
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        assert.equal(await page.locator('#rezar-season').isVisible(), false);
        console.log('PASS 25/12: Natal desabilitado, pontos de encaixe vazios');

        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await setDate('2026-12-21');
        await page.evaluate(() => SettingsSystem.applyLocale('en'));
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        assert.equal(await line(), '4th week of Advent · 4 days until Christmas');
        await page.evaluate(() => SettingsSystem.applyLocale('es'));
        await page.waitForFunction(() => document.documentElement.lang === 'es');
        assert.equal(await line(), '4.ª semana de Adviento · faltan 4 días para la Navidad');
        await page.evaluate(() => SettingsSystem.applyLocale('pt'));
        console.log('PASS idiomas en e es');

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await setDate('2026-12-20');
        await page.evaluate(() => RouterSystem.navigate('rezar'));
        await page.locator('#rezar-season').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#rezar-season .flame-wrap').first().evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.setViewportSize({ width: 800, height: 600 });
        await shot('rezar-20-12-800');
        console.log('PASS movimento reduzido: chama parada; 800×600');

        await sw.evaluate(async () => chrome.storage.local.remove('ora_debug_date'));
        await page.waitForFunction(() => SeasonsSystem.dayKey === LiturgicalCalendar.isoDate(new Date()));
        console.log('PASS sem data simulada volta para hoje');

        assert.deepEqual(errors, []);
        console.log('PASS sem erros no console');
    } finally {
        await context.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exit(1); });
