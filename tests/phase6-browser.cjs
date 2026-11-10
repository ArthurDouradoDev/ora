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
const profile = fs.mkdtempSync(path.join(temp, 'ora-phase6-qa-'));

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
            await chrome.storage.session.set({ ora_bg_loaded: true });
            await chrome.storage.local.set({
                ora_onboarding_done: true,
                ora_focus_sound: 'user-legacy',
                ora_user_playlists: JSON.stringify([{
                    id: 'user-legacy', title: 'Playlist legada', source: 'youtube', idType: 'playlist', externalId: 'PL_123'
                }])
            });
        });

        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const ready = () => page.waitForFunction(() => window.TodaySystem?.view && window.SoundSystem?.mini);
        const click = selector => page.locator(selector).click();
        // No canto (janela larga), os controles do Som só aparecem ao passar o mouse no chip.
        const control = async selector => { await page.locator('#sound-open').hover(); await click(selector); };
        await page.goto(extension + '/ora.html');
        await ready();

        const tile = key => page.locator(`.sound-tile-main[data-sound-focus="${key}"]`);
        const layer = id => page.locator(`.sound-layer-toggle[data-sound-focus="layer-${id}"]`);

        await click('#sound-open');
        assert.equal(await tile('pl-user-legacy').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#sound-view-library').isVisible(), true);
        const box = await page.locator('.sound-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 850);
        assert.equal(await page.evaluate(() => document.getElementById('sound-dialog').classList.contains('is-anchored')), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'sound-open');
        console.log('PASS legacy selection, anchored popup and Escape focus return');

        await click('#today-quick-focus');
        await page.waitForFunction(() => getComputedStyle(TodaySystem.elements.prep).opacity === '1');
        assert.equal(await page.evaluate(() => {
            const prep = TodaySystem.elements.prep;
            const before = prep.getBoundingClientRect();
            DialogSystem.close(prep);
            const after = prep.getBoundingClientRect();
            return prep.inert && prep.hidden && getComputedStyle(prep).display !== 'none' &&
                Math.abs(before.top - after.top) <= 1 && Math.abs(before.left - after.left) <= 1;
        }), true);
        await page.locator('#today-prep').waitFor({ state: 'hidden' });
        console.log('PASS focus preparation fades out in place before disappearing');

        const relay = 'https://arthurdouradodev.github.io/ora-player-relay/v2/**';
        await page.route(relay, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>
            const id = new URLSearchParams(location.search).get('id');
            const send = (event, values = {}) => parent.postMessage({ oraRelay: 2, event, id, ...values }, '*');
            addEventListener('message', ({ data }) => { if (data?.cmd === 'play') send('state', { paused: false }); });
            send('hello');
            send('ready');
        </script>` }));
        await click('#sound-open');
        await tile('pl-user-legacy').click();
        await page.waitForFunction(() => SoundSystem.active?.ready && !SoundSystem.active.paused);
        await page.waitForFunction(() => !SoundSystem.panel._oraMotion?.size);
        assert.equal(await page.evaluate(() => {
            const { stage, panel, frame } = SoundSystem;
            window.testSoundFrame = frame.contentWindow;
            const height = panel.offsetHeight;
            SoundSystem.setView('library');
            return SoundSystem.views.playlist.classList.contains('is-leaving') &&
                !stage.classList.contains('is-parked') && Math.abs(panel.offsetHeight - height) <= 1 &&
                !!panel._oraMotion?.size;
        }), true);
        await page.waitForFunction(() => SoundSystem.stage.classList.contains('is-parked'));
        await click('#sound-now');
        await page.waitForFunction(() => !SoundSystem.panel._oraMotion?.size);
        assert.equal(await page.evaluate(() => {
            const { root, stage, frame } = SoundSystem;
            DialogSystem.close(root);
            return root.inert && root.classList.contains('is-dormant') && !stage.classList.contains('is-parked') &&
                frame.contentWindow === window.testSoundFrame && !SoundSystem.active.paused;
        }), true);
        await page.waitForFunction(() => getComputedStyle(SoundSystem.root).opacity === '0');
        await page.evaluate(() => SoundSystem.stop());
        await page.unroute(relay);
        console.log('PASS playlist fades out with the popup and keeps the same playing frame');

        await click('#sound-open');
        await click('.sound-filter[data-sound-focus="filter-ambient"]');
        assert.equal(await tile('pl-user-legacy').count(), 0);
        await tile('scene-rain').click();
        await page.waitForFunction(() => SoundEngine.running && SoundEngine.layers.get('rain')?.source);
        assert.equal(await tile('scene-rain').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#sound-now').isVisible(), true);
        await page.getByRole('button', { name: 'Ajustar Chuva' }).click();
        assert.equal(await page.locator('#sound-view-mixer').isVisible(), true);
        assert.equal(await page.locator('#sound-title').textContent(), 'Chuva');
        await layer('bells').click();
        await layer('church').click();
        await layer('monastery').click();
        assert.equal(await layer('monastery').getAttribute('aria-pressed'), 'false');
        assert.match(await page.locator('#sound-status').textContent(), /até 3/);
        await layer('church').click();
        await page.waitForFunction(() => SoundEngine.ids().join() === 'rain,bells');
        assert.equal(await page.locator('#sound-title').textContent(), 'Chuva + Sinos ao longe');
        await click('#sound-back');
        assert.equal(await tile('custom').getAttribute('aria-pressed'), 'true');
        await page.locator('.sound-setting').click();
        await context.setOffline(true);
        const files = await page.evaluate(() => Promise.all(Object.values(SoundCore.AMBIENCES).map(file => new Promise((resolve, reject) => {
            const audio = new Audio('assets/sounds/' + file);
            audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
            audio.addEventListener('error', reject, { once: true });
        }))));
        assert.ok(files.every(seconds => seconds > 20));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => SoundEngine.layers.get('bells')?.source);
        assert.equal(await page.evaluate(() => {
            const { source } = SoundEngine.layers.get('rain');
            return source.loop && source.buffer.duration > 20 && source.buffer.duration < 21;
        }), true);
        assert.equal(await page.locator('#sound-name').textContent(), 'Chuva + Sinos ao longe');
        await page.locator('#sound-open').hover();
        await page.locator('#sound-volume').fill('38');
        await page.locator('#sound-volume').dispatchEvent('change');
        await page.waitForFunction(async () => (await chrome.storage.local.get('ora_focus_sound')).ora_focus_sound.volume === 38);
        assert.equal(await page.evaluate(() => SoundEngine.gain('rain')), 0.285);
        const clock = () => page.evaluate(() => SoundEngine.ctx.currentTime);
        const before = await clock();
        const other = await context.newPage();
        await other.goto('about:blank');
        await other.bringToFront();
        await page.waitForFunction(previous => SoundEngine.ctx.currentTime > previous + 0.2 && SoundEngine.running, before);
        await other.close();
        await page.bringToFront();
        console.log('PASS Web Audio layers, live mixer, layer limit, seamless loop, volume and tab change');

        await click('#today-quick-focus');
        assert.equal(await page.locator('#today-prep').isVisible(), true);
        assert.equal(await page.locator('#today-prep [aria-controls="sound-dialog"]').count(), 0);
        await page.evaluate(() => { window.firstLayer = SoundEngine.layers.get('rain'); });
        await click('#today-prep-start');
        await page.locator('#today-session').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => SoundEngine.layers.get('rain') === firstLayer), true);
        await click('#today-pause');
        await page.waitForFunction(() => SoundEngine.paused && SoundSystem.active.paused);
        await click('#today-resume');
        await page.waitForFunction(() => SoundEngine.running);
        await control('#sound-toggle');
        await page.evaluate(async () => { await FocusSystem.pause(); await FocusSystem.resume(); });
        assert.equal(await page.evaluate(() => SoundSystem.active.paused && SoundEngine.paused), true);
        await control('#sound-toggle');
        await page.evaluate(async () => { await FocusSystem.interrupt(); await FocusSystem.goHome(); });
        await page.waitForFunction(() => SoundEngine.running);
        assert.equal(await page.evaluate(() => SoundEngine.layers.get('rain') === firstLayer), true);
        console.log('PASS no sound selector in preparation, uninterrupted audio, timer sync and manual pause');

        await click('#sound-open');
        await click('#sound-add-open');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'playlist-input');
        await page.locator('#playlist-input').fill('https://www.youtube.com/playlist?list=PL_ORA_TEST');
        await page.locator('#playlist-input').press('Enter');
        await page.waitForFunction(() => SoundSystem.playlists.some(item => item.externalId === 'PL_ORA_TEST'));
        assert.match(await page.locator('#sound-status').textContent(), /internet/);
        assert.equal(await page.evaluate(() => SoundSystem.active.choice.kind), 'ambient');
        assert.equal(await page.locator('#sound-view-library').isVisible(), true);
        await click('#sound-add-open');
        await page.locator('#playlist-input').fill('spotify:album:0sNOF9WDwhWunNAHPD3Baj');
        await page.locator('#playlist-input').press('Enter');
        await page.waitForFunction(() => SoundSystem.playlists.some(item => item.source === 'spotify'));
        await page.getByRole('button', { name: 'Detalhes de Álbum do Spotify' }).click();
        assert.equal(await page.locator('#sound-view-playlist').isVisible(), true);
        await page.getByRole('button', { name: 'Remover Álbum do Spotify' }).click();
        await page.waitForFunction(() => !SoundSystem.playlists.some(item => item.externalId === '0sNOF9WDwhWunNAHPD3Baj'));
        assert.equal(await page.locator('#sound-view-library').isVisible(), true);
        await page.keyboard.press('Escape');
        await context.setOffline(false);
        console.log('PASS playlist import, details view and offline feedback');

        await page.reload();
        await ready();
        assert.equal(await page.evaluate(() => SoundSystem.active), null);
        assert.equal(await page.locator('#sound-volume').inputValue(), '38');
        await click('#sound-open');
        assert.equal(await tile('custom').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#sound-pause-with-focus').isChecked(), true);
        await page.setViewportSize({ width: 360, height: 640 });
        assert.equal(await page.evaluate(() => {
            const dialog = document.querySelector('.sound-dialog');
            return dialog.scrollWidth <= dialog.clientWidth
                && !document.getElementById('sound-dialog').classList.contains('is-anchored');
        }), true);
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1280, height: 850 });
        await click('#today-quick-focus');
        await click('#today-prep-start');
        await page.locator('#today-session').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => SoundSystem.active), null);
        await click('#sound-open');
        await tile('custom').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => SoundEngine.running && SoundEngine.ids().join() === 'rain,bells');
        await page.evaluate(async () => { await FocusSystem.interrupt(); await FocusSystem.goHome(); });
        assert.equal(await page.evaluate(() => SoundSystem.active), null);
        await page.waitForFunction(() => SoundEngine.layers.size === 0 && SoundEngine.paused);
        console.log('PASS session-only audio stops at session end');
        assert.deepEqual(errors, []);
        console.log('PASS restored preference, narrow layout and no uncaught errors');
    } finally {
        await context.close();
        const resolved = fs.realpathSync(profile);
        if (path.dirname(resolved) === temp && path.basename(resolved).startsWith('ora-phase6-qa-')) {
            fs.rmSync(resolved, { recursive: true, force: true });
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
