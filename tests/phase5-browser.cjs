// Fase 5 — Frutos, rituais e tempo de tela, com a extensão carregada sem pacote
// num perfil isolado do Chromium (Playwright). Uso: node tests/phase5-browser.cjs
// O relógio da página é fixado (page.clock.setFixedTime) para simular manhã e noite.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const http = require('node:http');

let chromium;
try { ({ chromium } = require(process.env.ORA_PLAYWRIGHT || 'playwright')); } catch {
    ({ chromium } = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')));
}

const root = path.resolve(__dirname, '..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ora-phase5-qa-'));
let checks = 0;
const errors = [];

function check(name, condition) {
    assert.ok(condition, name);
    checks++;
    console.log('PASS ' + name);
}

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m, 0, 0); // novembro de 2026
const ms = (d, h, m = 0) => at(d, h, m).getTime();

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
        const type = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream';
        fs.readFile(file, (error, data) => {
            res.writeHead(error ? 404 : 200, { 'Content-Type': type + '; charset=utf-8' });
            res.end(error ? '' : data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
        // 1. Suíte de funções puras no navegador (com fixtures)
        const suite = await context.newPage();
        await suite.goto(`http://127.0.0.1:${server.address().port}/tests/tests.html`);
        await suite.waitForFunction(() => Array.isArray(window.__oraTestResults) && window.__oraTestResults.length >= 399 &&
            document.getElementById('summary').classList.contains('ok'));
        check('browser pure-function suite passes (399+ tests, fixtures loaded)', await suite.evaluate(() => __oraTestResults.every(r => r.pass && !r.skipped)));
        await suite.close();

        const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const id = new URL(sw.url()).host;
        const seed = (values) => sw.evaluate(async (v) => { await chrome.storage.local.set(v); }, values);
        const read = (keys) => sw.evaluate(async (k) => chrome.storage.local.get(k), keys);
        await seed({
            ora_onboarding_done: true,
            ora_user_name: 'Arthur',
            ora_reminder_carlo: false,
            ora_tasks: [
                { id: 'task-a', title: 'Responder e-mails', list: 'hoje', order: 0, createdAt: ms(1, 8) },
                { id: 'task-b', title: 'Escrever o relatório', list: 'hoje', order: 1, createdAt: ms(1, 9) }
            ]
        });
        await sw.evaluate(async () => { await chrome.storage.session.set({ ora_bg_loaded: true }); });

        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER ERROR ' + msg.text()); });
        const ready = () => page.waitForFunction(() => window.FrutosSystem?.period !== undefined && window.RitualsSystem?.elements?.root && window.TodaySystem?.view);
        await page.clock.setFixedTime(at(4, 10));
        await page.goto(`chrome-extension://${id}/ora.html`);
        await ready();

        check('legacy #screentime-modal removed from DOM', await page.evaluate(() => !document.getElementById('screentime-modal') && !document.getElementById('btn-screentime')));
        check('nothing opens by itself on the first tab (ritual closed)', await page.locator('#ritual').isHidden());

        // 2. Frutos sem registros
        await page.locator('.topbar a[data-route="frutos"]').click();
        await page.waitForFunction(() => RouterSystem.current().view === 'frutos');
        check('Frutos: empty week says so neutrally', (await page.locator('#frutos-synth').innerText()).includes('Ainda não há registros nesta semana'));
        check('Frutos: empty hint and the question stay available', await page.locator('#frutos-empty-hint').isVisible() && (await page.locator('#frutos-question').innerText()).length > 10);
        check('Frutos: week strip has 7 days, past days "none", 4 future days',
            await page.locator('.frutos-day').count() === 7 && await page.locator('.frutos-day.none').count() === 3 && await page.locator('.frutos-day.future').count() === 4);
        const judging = await page.evaluate(() => {
            const bad = ['rgb(242, 163, 152)', 'rgb(159, 211, 168)'];
            return Array.from(document.querySelectorAll('#view-frutos *')).filter(el => {
                if (el.closest('[hidden]') || el.closest('.saved') || el.offsetParent === null) return false;
                const cs = getComputedStyle(el);
                return bad.includes(cs.color) || bad.includes(cs.backgroundColor) || bad.includes(cs.borderTopColor);
            }).map(el => el.className || el.tagName);
        });
        check('Frutos: no red/green anywhere in the visible screen', judging.length === 0);
        await page.screenshot({ path: path.join(artifacts, 'frutos-vazio-1440.png'), animations: 'disabled' });

        // 3. Uma semana com registros
        await seed({
            ora_sessions: [
                { id: 's1', taskId: 'task-a', plannedMin: 25, focusedMin: 25, startedAt: ms(2, 9), endedAt: ms(2, 9, 25), status: 'completed' },
                { id: 's2', taskId: null, title: 'Leitura', plannedMin: 25, focusedMin: 12, startedAt: ms(3, 14), endedAt: ms(3, 14, 12), status: 'interrupted' },
                { id: 's3', taskId: 'task-b', plannedMin: 50, focusedMin: 50, startedAt: ms(4, 8), endedAt: ms(4, 8, 50), status: 'completed' }
            ],
            ora_practice_log: [{ type: 'rosary', at: ms(2, 7) }, { type: 'rosary', at: ms(2, 21) }, { type: 'prayer', id: 'angelus', at: ms(3, 12) }],
            ora_exam_logs: [{ id: 'exam-1', type: 'night', date: at(2, 22).toISOString(), answers: [] }],
            ora_screentime: {
                '2026-11-02': { domains: { 'youtube.com': 2400, 'docs.google.com': 900 }, newTabs: 6 },
                '2026-11-03': { domains: { 'youtube.com': 600, 'wikipedia.org': 300 }, newTabs: 3 }
            },
            ora_reflections: [{ key: 'semana:2026-10-26', kind: 'semana', start: '2026-10-26', last: '2026-11-01', question: 'Por quem você rezou nestes dias?', text: 'Pela minha avó.', savedAt: ms(1, 20) }]
        });
        await page.waitForFunction(() => document.getElementById('frutos-synth').textContent.includes('sessões'));
        const synth = await page.locator('#frutos-synth').innerText();
        check('Frutos: synthesis in one sentence (sessions, time, rosary days, prayer days, exams)',
            synth.includes('3 sessões de foco') && synth.includes('1h27') && synth.includes('terço em 1 dia') && synth.includes('oração em 2 dias') && synth.includes('1 exame'));
        check('Frutos: interrupted session counts its minutes (12 min on Tuesday)', (await page.locator('.frutos-day').nth(1).getAttribute('title')).includes('12 min'));
        check('Frutos: "Dias com Ora" counter', (await page.locator('#frutos-counter-n').innerText()) === '3');
        await page.locator('#frutos-usage summary').click();
        check('Frutos: usage details list past days only, with screen time', await page.locator('#frutos-usage-table tbody tr').count() === 3 &&
            (await page.locator('#frutos-usage-table tbody tr').first().innerText()).includes('55 min'));
        check('Frutos: past reflections listed', (await page.locator('#frutos-past-list').innerText()).includes('Pela minha avó.'));
        await page.screenshot({ path: path.join(artifacts, 'frutos-1440.png'), animations: 'disabled', fullPage: true });

        // Mês e navegação
        await page.locator('#frutos-period [data-period="mes"]').click();
        check('Frutos: month calendar with 30 days', await page.locator('.frutos-month li.c').count() === 30 && (await page.locator('#frutos-range-label').innerText()) === 'Novembro de 2026');
        check('Frutos: no future period', await page.locator('#frutos-next').isDisabled());
        await page.locator('#frutos-prev').click();
        check('Frutos: previous month', (await page.locator('#frutos-range-label').innerText()) === 'Outubro de 2026' && !(await page.locator('#frutos-next').isDisabled()));
        await page.locator('#frutos-period [data-period="semana"]').click();

        // Para refletir: Guardar só depois da gravação
        await page.locator('#frutos-reflection').fill('Percebi que rezei melhor nos dias em que comecei cedo.');
        await page.locator('#frutos-save').click();
        await page.locator('#frutos-saved.show').waitFor();
        const stored = await read(['ora_reflections']);
        check('Frutos: reflection saved for this week', stored.ora_reflections.some(r => r.key === 'semana:2026-11-02' && r.text.startsWith('Percebi')));

        // Falha de gravação: texto preservado e aviso com nova tentativa
        await page.evaluate(() => { window.__origSet = AsyncStorage.set; AsyncStorage.set = async () => false; });
        await page.locator('#frutos-reflection').fill('Texto que o navegador recusou');
        await page.locator('#frutos-save').click();
        await page.locator('#frutos-save-error').waitFor({ state: 'visible' });
        check('Frutos: refused write shows the error and keeps the text', (await page.locator('#frutos-reflection').inputValue()) === 'Texto que o navegador recusou' && !(await page.locator('#frutos-saved.show').count()));
        await page.evaluate(() => { AsyncStorage.set = window.__origSet; });
        await page.locator('#frutos-reflection').fill('Percebi que rezei melhor nos dias em que comecei cedo.');
        await page.locator('#frutos-save-retry').click();
        await page.locator('#frutos-save-error').waitFor({ state: 'hidden' });

        await page.reload();
        await ready();
        await page.waitForFunction(() => RouterSystem.current().view === 'frutos');
        check('Frutos: reflection is still there after reload', (await page.locator('#frutos-reflection').inputValue()).startsWith('Percebi'));

        // Tempo de tela: abre pela pergunta, números atrás do botão, cor neutra
        check('Screen time opens with the question, data hidden', (await page.locator('#frutos-screen-question').innerText()).includes('atenção') && await page.locator('#frutos-screen-body').isHidden());
        await page.locator('#frutos-screen-toggle').click();
        check('Screen time: domains by time, no deltas', await page.locator('#frutos-domains li').count() === 3 &&
            (await page.locator('#frutos-domains li').first().innerText()).includes('youtube.com') && !(await page.locator('#frutos-screen-body').innerText()).includes('%'));
        check('Screen time: neutral bar color', await page.evaluate(() => getComputedStyle(document.querySelector('.frutos-domain-track span')).backgroundColor) === 'rgb(173, 163, 146)');
        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await page.evaluate(() => RouterSystem.navigate('frutos/tela'));
        check('frutos/tela (notification) reveals the screen time block', await page.locator('#frutos-screen-body').isVisible());

        // 4. Ritual da manhã (07:30): só a linha de convite, nada abre sozinho
        await page.clock.setFixedTime(at(5, 7, 30)); // dia 4 já tem foco: o convite da manhã some (correto)
        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await page.reload();
        await ready();
        await page.waitForFunction(() => !document.getElementById('today-invite').hidden);
        check('Morning: invite line "Começar o dia" and nothing opened', (await page.locator('#today-invite-title').innerText()) === 'Começar o dia' && await page.locator('#ritual').isHidden());
        await page.locator('#today-invite-go').click();
        await page.locator('#ritual').waitFor({ state: 'visible' });
        check('Morning: 3 steps, priority from Hoje tasks', (await page.locator('#ritual-count').innerText()) === '1 de 3' && await page.locator('input[name="ritual-prio"]').count() === 3);
        await page.locator('.choice', { hasText: 'Escrever o relatório' }).click();
        await page.locator('#ritual-next').click();
        await page.locator('#ritual-intent').fill('pela minha avó');
        await page.keyboard.press('Escape');
        await page.locator('#ritual').waitFor({ state: 'hidden' });
        const morningDraft = await read(['ora_ritual_draft']);
        check('Morning: leaving keeps the draft', morningDraft.ora_ritual_draft.manha.step === 1 && morningDraft.ora_ritual_draft.manha.intention === 'pela minha avó');
        check('Morning: invite now says "Continuar"', (await page.locator('#today-invite-go').innerText()) === 'Continuar');
        await page.locator('#today-invite-go').click();
        await page.locator('#ritual-intent').waitFor();
        check('Morning: draft restored on reopen', (await page.locator('#ritual-intent').inputValue()) === 'pela minha avó');
        await page.locator('#ritual-next').click();
        check('Morning: start step shows the priority and the offering', (await page.locator('#ritual-q').innerText()) === 'Escrever o relatório' && (await page.locator('.ritual-offer').innerText()).includes('pela minha avó'));
        await page.locator('#ritual-dur [data-min="50"]').click();
        await page.locator('#ritual-start').click();
        await page.locator('#today-prep').waitFor({ state: 'visible' });
        check('M02: activity and duration reach the preparation', (await page.locator('#today-prep-title').inputValue()) === 'Escrever o relatório' &&
            (await page.locator('#today-dur [aria-pressed="true"]').innerText()).includes('50'));
        await page.keyboard.press('Escape');
        await page.locator('#today-prep').waitFor({ state: 'hidden' });
        check('M02: the priority is the next step in Hoje, with 50 min', (await page.locator('#today-next-title').innerText()) === 'Escrever o relatório' && (await page.locator('#today-next-meta').innerText()).includes('50'));
        const afterMorning = await read(['ora_rituals', 'ora_day_intention', 'ora_ritual_draft']);
        check('Morning: ritual saved, intention of the day saved, draft cleared',
            !!afterMorning.ora_rituals['2026-11-05'].manha.doneAt && afterMorning.ora_day_intention['2026-11-05'] === 'pela minha avó' && !afterMorning.ora_ritual_draft.manha);
        check('Morning: invite does not come back', (await page.locator('#today-invite-title').innerText()) !== 'Começar o dia');

        // 5. Oração aberta no leitor vira registro
        await page.evaluate(() => RouterSystem.navigate('rezar/leitor/angelus'));
        await page.waitForFunction(async () => (await chrome.storage.local.get('ora_practice_log')).ora_practice_log.some(e => e.type === 'prayer' && e.id === 'angelus' && new Date(e.at).getDate() === 5));
        check('Practice: prayer opened in the reader is recorded once per day', true);

        // 6. Ritual da noite (21:30) com regra de horário das 22h às 7h
        await seed({
            blocker_config: {
                enabled: true,
                profiles: [{ id: 'redes', name: 'Redes sociais', enabled: true, sites: ['instagram.com'],
                    rules: { duringFocus: true, schedule: { enabled: true, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] }, dailyLimitMin: 0, temporaryAccess: { enabled: true, minutes: 5, perDay: 3 } } }]
            }
        });
        await page.clock.setFixedTime(at(5, 21, 30));
        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await page.reload();
        await ready();
        await page.waitForFunction(() => document.getElementById('today-invite-title').textContent === 'Encerrar o dia');
        check('Night: invite "Encerrar o dia" after 21h', await page.locator('#ritual').isHidden());
        await page.locator('#today-invite-go').click();
        await page.locator('#ritual').waitFor({ state: 'visible' });
        check('Night: night theme applied', await page.evaluate(() => document.documentElement.dataset.theme === 'noite'));
        await page.locator('#ritual-text').fill('Pelo café com a minha mãe.');
        await page.locator('#ritual-next').click();
        check('Night: reflection step with "Fazer o exame completo"', (await page.locator('#ritual-q').innerText()).includes('Onde você percebeu Deus hoje') && await page.locator('#ritual-exam').isVisible());
        await page.locator('#ritual-text').fill('Na paciência com o trânsito.');
        await page.locator('#ritual-exit').click();
        await page.locator('#ritual').waitFor({ state: 'hidden' });
        check('Night: leaving removes the night theme', await page.evaluate(() => !document.documentElement.dataset.theme));
        await page.reload();
        await ready();
        await page.waitForFunction(() => document.getElementById('today-invite-go').textContent === 'Continuar');
        await page.locator('#today-invite-go').click();
        await page.locator('#ritual-text').waitFor();
        check('Night: leaving at step 2 and coming back keeps the draft', (await page.locator('#ritual-text').inputValue()) === 'Na paciência com o trânsito.' && (await page.locator('#ritual-count').innerText()) === '2 de 3');
        await page.locator('#ritual-back').click();
        check('Night: gratitude kept too', (await page.locator('#ritual-text').inputValue()) === 'Pelo café com a minha mãe.');
        await page.locator('#ritual-next').click();
        await page.locator('#ritual-next').click();
        const closing = await page.locator('#ritual-card').innerText();
        check('Night: closing with short prayer and the protection rule', closing.includes('Em vossas mãos') && closing.includes('Bloqueio das 22h às 7h: Redes sociais.') && closing.includes('Bom descanso.'));
        await page.screenshot({ path: path.join(artifacts, 'ritual-noite-1440.png'), animations: 'disabled' });
        await page.locator('#ritual-finish').click();
        await page.locator('.ritual-final').waitFor();
        check('Night: good night with the name and the gratitude', (await page.locator('.ritual-final').innerText()).includes('Boa noite, Arthur.') && (await page.locator('.ritual-final').innerText()).includes('Pelo café com a minha mãe.'));
        await page.locator('#ritual-close').click();
        await page.locator('#ritual').waitFor({ state: 'hidden' });
        const afterNight = await read(['ora_rituals', 'ora_ritual_draft', 'ora_practice_log']);
        check('Night: answers kept, draft cleared, practice recorded',
            afterNight.ora_rituals['2026-11-05'].noite.reflection === 'Na paciência com o trânsito.' && !afterNight.ora_ritual_draft.noite && afterNight.ora_practice_log.some(e => e.type === 'night'));
        check('Night: invite gone after the ritual', await page.evaluate(() => document.getElementById('today-invite').hidden || document.getElementById('today-invite-title').textContent !== 'Encerrar o dia'));
        await page.evaluate(() => RouterSystem.navigate('frutos'));
        await page.waitForFunction(() => document.querySelectorAll('.frutos-day')[3]?.querySelector('.m-exam'));
        check('Frutos: the night ritual counts as the examen of the day', (await page.locator('#frutos-synth').innerText()).includes('2 exames'));

        // 7. "Fazer o exame completo" volta para o Encerramento
        await page.clock.setFixedTime(at(6, 21, 40));
        await page.evaluate(() => RouterSystem.navigate('hoje'));
        await page.reload();
        await ready();
        await page.waitForFunction(() => document.getElementById('today-invite-title').textContent === 'Encerrar o dia');
        await page.locator('#today-invite-go').click();
        await page.locator('#ritual-next').click();
        await page.locator('#ritual-exam').click();
        await page.waitForFunction(() => RouterSystem.current().path.join('/') === 'exame/night');
        for (let i = 0; i < 5; i++) {
            await page.locator('#exam-answer').fill('Resposta ' + (i + 1));
            await page.locator('#exam-next').click();
        }
        await page.locator('#ritual').waitFor({ state: 'visible' });
        check('Full examen returns to the ritual closing', (await page.locator('#ritual-count').innerText()) === '3 de 3' && await page.locator('#ritual-finish').isVisible());
        await page.locator('#ritual-finish').click();
        await page.locator('#ritual-close').click();
        const examLogs = (await read(['ora_exam_logs'])).ora_exam_logs;
        check('Full examen saved in ora_exam_logs', examLogs.some(l => l.type === 'night' && new Date(l.date).getDate() === 6));

        // 8. 800×600, texto a 200%, movimento reduzido
        await page.setViewportSize({ width: 800, height: 600 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => RouterSystem.navigate('frutos'));
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        const overflow = await page.evaluate(() => {
            const s = document.getElementById('frutos-scroll');
            return { x: s.scrollWidth - s.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        check('Frutos at 800×600 and 200% text: no horizontal overflow', overflow.x <= 1 && overflow.doc <= 1);
        await page.screenshot({ path: path.join(artifacts, 'frutos-800-200.png'), animations: 'disabled' });
        await page.clock.setFixedTime(at(7, 7, 30));
        await page.evaluate(() => { RouterSystem.navigate('hoje'); RitualsSystem.open('manha'); });
        await page.locator('#ritual').waitFor({ state: 'visible' });
        const ritualBox = await page.evaluate(() => {
            const b = document.getElementById('ritual-next').getBoundingClientRect();
            const body = document.getElementById('ritual-body');
            body.scrollTop = body.scrollHeight;
            const after = document.getElementById('ritual-next').getBoundingClientRect();
            return { visible: after.bottom <= innerHeight + 1 && after.right <= innerWidth + 1, overflow: body.scrollWidth - body.clientWidth, h: b.height };
        });
        check('Ritual at 800×600 and 200% text: actions reachable, no horizontal overflow', ritualBox.visible && ritualBox.overflow <= 1 && ritualBox.h >= 24);
        // Teclado: Tab não escapa do ritual
        for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
        check('Ritual keeps focus inside (Tab)', await page.evaluate(() => document.getElementById('ritual').contains(document.activeElement)));
        await page.keyboard.press('Escape');
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        await page.setViewportSize({ width: 1440, height: 900 });

        // 9. Idiomas
        for (const locale of ['pt', 'en', 'es']) {
            await page.evaluate(async (loc) => {
                window._i18nLocale = loc;
                window._i18nStrings = await loadJSON(`data/i18n/${loc}.json`);
                applyI18n();
                RouterSystem.navigate('frutos');
                FrutosSystem.render();
                ScreenTimeSystem.setExpanded(true);
            }, locale);
            const text = await page.locator('#view-frutos').innerText();
            await page.evaluate(() => { RitualsSystem.open('noite', { step: 2 }); });
            const ritual = await page.locator('#ritual').innerText();
            await page.evaluate(() => RitualsSystem.close());
            check(`${locale}: Frutos and the ritual show no raw i18n keys`, !/\b(frutos|rituals|invites)\.[a-z_]+/.test(text + ritual));
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
