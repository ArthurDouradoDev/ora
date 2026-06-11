// ============================================================
// ORA — Test runner + assertions for pure shared functions
// ============================================================
// No framework: open tests.html in a browser (file:// works).

(function () {
    'use strict';

    const results = [];
    let currentGroup = 'Geral';

    function group(name) { currentGroup = name; }

    function assert(name, condition, detail) {
        results.push({ group: currentGroup, name, pass: !!condition, detail: detail || '' });
    }

    function assertEq(name, actual, expected) {
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        assert(name, pass, pass ? '' : `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
    }

    // Helper: a Date fixed at hh:mm
    function at(hours, minutes) {
        const d = new Date(2026, 5, 10); // June 10, 2026 (Wednesday)
        d.setHours(hours, minutes, 0, 0);
        return d;
    }

    // ========================================================
    group('BlockerCore — isWithinBlockedSchedule');
    // ========================================================

    const window10to12 = { schedules: [{ fromHour: 10, fromMinute: 0, toHour: 12, toMinute: 0 }] };
    assert('dentro da janela simples (11:00 em 10–12)', BlockerCore.isWithinBlockedSchedule(window10to12, at(11, 0)));
    assert('fora da janela simples (13:00 em 10–12)', !BlockerCore.isWithinBlockedSchedule(window10to12, at(13, 0)));
    assert('limite inicial é inclusivo (10:00)', BlockerCore.isWithinBlockedSchedule(window10to12, at(10, 0)));
    assert('limite final é exclusivo (12:00)', !BlockerCore.isWithinBlockedSchedule(window10to12, at(12, 0)));

    const overnight = { schedules: [{ fromHour: 22, fromMinute: 0, toHour: 8, toMinute: 0 }] };
    assert('janela cruzando meia-noite — 23:00 bloqueado', BlockerCore.isWithinBlockedSchedule(overnight, at(23, 0)));
    assert('janela cruzando meia-noite — 07:59 bloqueado', BlockerCore.isWithinBlockedSchedule(overnight, at(7, 59)));
    assert('janela cruzando meia-noite — 12:00 liberado', !BlockerCore.isWithinBlockedSchedule(overnight, at(12, 0)));

    const degenerate = { schedules: [{ fromHour: 9, fromMinute: 0, toHour: 9, toMinute: 0 }] };
    assert('janela degenerada (from == to) é ignorada', !BlockerCore.isWithinBlockedSchedule(degenerate, at(9, 0)));

    const multi = { schedules: [
        { fromHour: 9, fromMinute: 0, toHour: 10, toMinute: 0 },
        { fromHour: 14, fromMinute: 0, toHour: 15, toMinute: 0 }
    ] };
    assert('múltiplas janelas — 14:30 bloqueado pela segunda', BlockerCore.isWithinBlockedSchedule(multi, at(14, 30)));
    assert('múltiplas janelas — 11:00 liberado entre elas', !BlockerCore.isWithinBlockedSchedule(multi, at(11, 0)));

    assert('scheduleLimit nulo retorna false', !BlockerCore.isWithinBlockedSchedule(null, at(11, 0)));

    // ========================================================
    group('BlockerCore — minutesUntilBlockedWindow');
    // ========================================================

    assertEq('120 min até janela das 12:00 (agora 10:00)',
        BlockerCore.minutesUntilBlockedWindow({ schedules: [{ fromHour: 12, fromMinute: 0, toHour: 14, toMinute: 0 }] }, at(10, 0)),
        120);
    assertEq('janela de amanhã conta a volta do relógio (agora 23:00, janela 01:00)',
        BlockerCore.minutesUntilBlockedWindow({ schedules: [{ fromHour: 1, fromMinute: 0, toHour: 2, toMinute: 0 }] }, at(23, 0)),
        120);
    assertEq('sem schedules retorna 0', BlockerCore.minutesUntilBlockedWindow({ schedules: [] }, at(10, 0)), 0);

    // ========================================================
    group('BlockerCore — domínios e aliases');
    // ========================================================

    const ytSite = { url: 'youtube.com' };
    assert('hostname exato', BlockerCore.matchesSiteOrAlias('youtube.com', ytSite));
    assert('subdomínio (m.youtube.com)', BlockerCore.matchesSiteOrAlias('m.youtube.com', ytSite));
    assert('não casa domínio diferente', !BlockerCore.matchesSiteOrAlias('vimeo.com', ytSite));
    assert('não casa sufixo parcial (notyoutube.com)', !BlockerCore.matchesSiteOrAlias('notyoutube.com', ytSite));
    assert('alias: x.com casa site twitter.com', BlockerCore.matchesSiteOrAlias('x.com', { url: 'twitter.com' }));
    assert('alias: mail.google.com casa site gmail.com', BlockerCore.matchesSiteOrAlias('mail.google.com', { url: 'gmail.com' }));

    assertEq('extractDomain remove www e esquema', BlockerCore.extractDomain('https://www.facebook.com/feed'), 'facebook.com');
    assertEq('extractDomain aceita domínio puro', BlockerCore.extractDomain('reddit.com'), 'reddit.com');
    assertEq('extractDomain inválido retorna null', BlockerCore.extractDomain(''), null);

    // ========================================================
    group('BlockerCore — IDs e regras');
    // ========================================================

    const id1 = BlockerCore.allowRuleIdFor('facebook.com');
    const id2 = BlockerCore.allowRuleIdFor('facebook.com');
    assert('allowRuleIdFor é determinístico', id1 === id2);
    assert('allowRuleIdFor na faixa [1000, 9999]', id1 >= 1000 && id1 <= 9999);

    const allow = BlockerCore.buildAllowRules('twitter.com');
    assert('buildAllowRules inclui aliases no requestDomains',
        allow.rules[0].condition.requestDomains.includes('x.com'));
    assert('buildAllowRules usa o mesmo ruleId do allowRuleIdFor',
        allow.ruleId === BlockerCore.allowRuleIdFor('twitter.com'));

    const sites = [{ url: 'twitter.com' }, { url: 'instagram.com' }];
    const rules = BlockerCore.buildBlockRules(sites, 'chrome-extension://abc/blocked.html');
    const oauthCount = BlockerCore.OAUTH_EXCEPTION_FILTERS.length;
    assertEq('buildBlockRules: total = exceções OAuth + 1 por site', rules.length, oauthCount + 2);
    assert('todas as regras têm id < 1000', rules.every(r => r.id < 1000));
    const twitterRule = rules.find(r => r.action.type === 'redirect' && r.condition.requestDomains.includes('twitter.com'));
    assert('regra do twitter inclui alias x.com', twitterRule.condition.requestDomains.includes('x.com'));
    assert('redirect aponta para blocked.html com domain na query',
        twitterRule.action.redirect.url.includes('blocked.html?domain=twitter.com'));

    // Alias NÃO é agrupado quando existe como entrada separada
    const sitesWithAliasEntry = [{ url: 'twitter.com' }, { url: 'x.com' }];
    const rules2 = BlockerCore.buildBlockRules(sitesWithAliasEntry, 'x://b.html');
    const twitterRule2 = rules2.find(r => r.action.type === 'redirect' && r.condition.requestDomains.includes('twitter.com'));
    assert('alias com entrada própria não é duplicado na regra do principal',
        !twitterRule2.condition.requestDomains.includes('x.com'));

    assert('isAuthWhitelisted aceita accounts.google.com', BlockerCore.isAuthWhitelisted('https://accounts.google.com/signin'));
    assert('isAuthWhitelisted rejeita youtube.com/watch', !BlockerCore.isAuthWhitelisted('https://youtube.com/watch?v=x'));

    // ========================================================
    group('PomodoroCore — advancePhase');
    // ========================================================

    const settings = PomodoroCore.getDefaultSettings();

    let st = { phase: 'focus', pomodoroCount: 0, settings };
    PomodoroCore.advancePhase(st);
    assertEq('foco → pausa', st.phase, 'pause');
    assertEq('contador de pomodoros incrementa', st.pomodoroCount, 1);
    assertEq('duração da pausa = 5 min', st.timeRemaining, 5 * 60);

    st = { phase: 'focus', pomodoroCount: 3, settings };
    PomodoroCore.advancePhase(st);
    assertEq('4º foco → pausa longa', st.phase, 'longPause');
    assertEq('duração da pausa longa = 15 min', st.timeRemaining, 15 * 60);

    st = { phase: 'pause', pomodoroCount: 1, settings };
    PomodoroCore.advancePhase(st);
    assertEq('pausa → foco', st.phase, 'focus');
    assertEq('pausa não incrementa contador', st.pomodoroCount, 1);
    assertEq('duração do foco = 25 min', st.timeRemaining, 25 * 60);

    // ========================================================
    group('PomodoroCore — applyDayRollover');
    // ========================================================

    function staleState() {
        return {
            isRunning: false,
            phase: 'pause',
            expectedEndTime: null,
            timeRemaining: 137, // residue from yesterday
            totalDuration: 300,
            pomodoroCount: 3,
            totalFocusSeconds: 4500,
            todayKey: 'ora_focus_total_Tue Jun 09 2026',
            settings: PomodoroCore.getDefaultSettings()
        };
    }

    let s = staleState();
    assert('mesmo dia → sem mudança', !PomodoroCore.applyDayRollover(s, s.todayKey));

    s = staleState();
    const changed = PomodoroCore.applyDayRollover(s, 'ora_focus_total_Wed Jun 10 2026');
    assert('dia novo → retorna true', changed);
    assertEq('resíduo: fase volta para focus', s.phase, 'focus');
    assertEq('resíduo: tempo cheio restaurado', s.timeRemaining, 25 * 60);
    assertEq('resíduo: contador de ciclos zerado', s.pomodoroCount, 0);
    assertEq('resíduo: total de foco zerado', s.totalFocusSeconds, 0);
    assert('resíduo: timer parado', !s.isRunning);

    // Sessão genuinamente ativa cruzando a meia-noite é preservada
    s = staleState();
    s.isRunning = true;
    s.phase = 'focus';
    s.timeRemaining = 600;
    s.expectedEndTime = Date.now() + 600 * 1000;
    PomodoroCore.applyDayRollover(s, 'ora_focus_total_Wed Jun 10 2026');
    assert('sessão ativa cruzando meia-noite continua rodando', s.isRunning);
    assertEq('sessão ativa: tempo restante intacto', s.timeRemaining, 600);
    assertEq('sessão ativa: contadores diários ainda assim zeram', s.pomodoroCount, 0);

    // Sessão "rodando" mas com fim no passado é resíduo → reset
    s = staleState();
    s.isRunning = true;
    s.expectedEndTime = Date.now() - 60 * 60 * 1000;
    PomodoroCore.applyDayRollover(s, 'ora_focus_total_Wed Jun 10 2026');
    assert('sessão expirada de ontem é resetada', !s.isRunning && s.phase === 'focus');

    // ========================================================
    group('SyncSystem — sanitizers');
    // ========================================================

    const rawTasks = [
        { id: '1', text: 'Rezar terço', recurring: true, done: true, completedCycles: 2, totalCycles: 2, streak: 5, lastStreakDate: '2026-06-10', intention: 'família', createdAt: 'x' },
        { id: '2', text: 'Tarefa única', recurring: false, done: false }
    ];
    const sanitized = SyncSystem.sanitizeTasks(rawTasks);
    assertEq('sanitizeTasks mantém apenas recorrentes', sanitized.length, 1);
    assert('sanitizeTasks remove progresso do dia (done/completedCycles)',
        !('done' in sanitized[0]) && !('completedCycles' in sanitized[0]));
    assertEq('sanitizeTasks preserva streak', sanitized[0].streak, 5);

    const rawCfg = {
        enabled: true,
        reenableAt: 123,
        lock: { enabled: true, verseIndex: 2, writeUnlockEnabled: false },
        sites: [{ id: 1, url: 'x.com', mode: 'always', accessLimit: { enabled: false }, scheduleLimit: { enabled: false }, writeUnlockEnabled: false, todayAccesses: 7, lastAccessDate: '2026-06-10' }]
    };
    const sanitizedCfg = SyncSystem.sanitizeBlockerConfig(rawCfg);
    assert('sanitizeBlockerConfig remove enabled/reenableAt',
        !('enabled' in sanitizedCfg) && !('reenableAt' in sanitizedCfg));
    assert('sanitizeBlockerConfig remove contadores diários',
        !('todayAccesses' in sanitizedCfg.sites[0]) && !('lastAccessDate' in sanitizedCfg.sites[0]));

    // ========================================================
    group('SyncSystem — merges');
    // ========================================================

    const remoteTasks = [
        { id: '1', text: 'Rezar terço (editado)', intention: '', totalCycles: 1, recurring: true, createdAt: 'x', streak: 3, lastStreakDate: '2026-06-08' },
        { id: '9', text: 'Nova rotina', intention: '', totalCycles: 1, recurring: true, createdAt: 'y', streak: 0, lastStreakDate: null }
    ];
    const localTasks = [
        { id: '1', text: 'Rezar terço', recurring: true, done: true, completedCycles: 1, totalCycles: 2, streak: 5, lastStreakDate: '2026-06-10' },
        { id: '2', text: 'Única local', recurring: false, done: false },
        { id: '3', text: 'Recorrente apagada no outro device', recurring: true, done: false }
    ];
    const mergedTasks = SyncSystem.mergeTasks(remoteTasks, localTasks);

    assert('mergeTasks: tarefa única local é preservada', mergedTasks.some(t => t.id === '2'));
    assert('mergeTasks: recorrente removida remotamente some', !mergedTasks.some(t => t.id === '3'));
    assert('mergeTasks: nova recorrente remota é adicionada', mergedTasks.some(t => t.id === '9'));
    const m1 = mergedTasks.find(t => t.id === '1');
    assertEq('mergeTasks: texto remoto vence', m1.text, 'Rezar terço (editado)');
    assert('mergeTasks: progresso local de hoje preservado', m1.done === true);
    assertEq('mergeTasks: streak local mais recente vence', m1.streak, 5);
    const m9 = mergedTasks.find(t => t.id === '9');
    assert('mergeTasks: nova tarefa chega zerada para hoje', m9.done === false && m9.completedCycles === 0);

    const remoteCfg = {
        lock: { enabled: true, verseIndex: 1, writeUnlockEnabled: true },
        sites: [
            { id: 1, url: 'x.com', mode: 'always', accessLimit: { enabled: false }, scheduleLimit: { enabled: false }, writeUnlockEnabled: false },
            { id: 2, url: 'reddit.com', mode: 'limited', accessLimit: { enabled: true, count: 3, period: 'day' }, scheduleLimit: { enabled: false }, writeUnlockEnabled: true }
        ]
    };
    const localCfg = {
        enabled: false,
        reenableAt: 999,
        lock: { enabled: false, verseIndex: 0, writeUnlockEnabled: false },
        sites: [{ id: 2, url: 'reddit.com', mode: 'limited', accessLimit: { enabled: true, count: 5, period: 'day' }, scheduleLimit: { enabled: false }, writeUnlockEnabled: false, todayAccesses: 2, lastAccessDate: '2026-06-10' }]
    };
    const mergedCfg = SyncSystem.mergeBlockerConfig(remoteCfg, localCfg);

    assert('mergeBlocker: enabled continua decisão local', mergedCfg.enabled === false);
    assertEq('mergeBlocker: reenableAt local preservado', mergedCfg.reenableAt, 999);
    assert('mergeBlocker: lock remoto adotado', mergedCfg.lock.enabled === true);
    assertEq('mergeBlocker: lista de sites vem do remoto', mergedCfg.sites.length, 2);
    const reddit = mergedCfg.sites.find(sit => sit.url === 'reddit.com');
    assertEq('mergeBlocker: contador local do dia preservado', reddit.todayAccesses, 2);
    assertEq('mergeBlocker: limite remoto vence', reddit.accessLimit.count, 3);
    const xcom = mergedCfg.sites.find(sit => sit.url === 'x.com');
    assertEq('mergeBlocker: site novo começa com contador zerado', xcom.todayAccesses, 0);

    // ========================================================
    // Render
    // ========================================================

    const passCount = results.filter(r => r.pass).length;
    const failCount = results.length - passCount;

    const summaryEl = document.getElementById('summary');
    summaryEl.className = failCount === 0 ? 'ok' : 'fail';
    summaryEl.textContent = failCount === 0
        ? `✓ ${passCount}/${results.length} testes passaram`
        : `✗ ${failCount} falha(s) — ${passCount}/${results.length} passaram`;

    const resultsEl = document.getElementById('results');
    let lastGroup = null;
    let groupEl = null;
    for (const r of results) {
        if (r.group !== lastGroup) {
            groupEl = document.createElement('div');
            groupEl.className = 'group';
            const h = document.createElement('h2');
            h.textContent = r.group;
            groupEl.appendChild(h);
            resultsEl.appendChild(groupEl);
            lastGroup = r.group;
        }
        const div = document.createElement('div');
        div.className = 'test ' + (r.pass ? 'pass' : 'fail');
        div.textContent = (r.pass ? '✓ ' : '✗ ') + r.name;
        if (!r.pass && r.detail) {
            const det = document.createElement('span');
            det.className = 'detail';
            det.textContent = r.detail;
            div.appendChild(det);
        }
        groupEl.appendChild(div);
        if (!r.pass) console.error('[FAIL]', r.group, '—', r.name, r.detail);
    }

    console.log(`[Ora Tests] ${passCount}/${results.length} passed`);
})();
