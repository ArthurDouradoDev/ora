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

    // Teste que depende de algo indisponível neste ambiente: aparece, mas não falha
    function skip(name) {
        results.push({ group: currentGroup, name: 'ignorado: ' + name, pass: true, skipped: true, detail: '' });
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
        { id: 'r', title: 'Rezar terço', list: 'hoje', order: 0, recurrence: { days: [0, 1, 2, 3, 4, 5, 6] }, createdAt: 1 },
        { id: 'r@2026-06-10', title: 'Rezar terço', list: 'hoje', order: 0, fromRecurrence: 'r', date: '2026-06-10', completedAt: 5, createdAt: 2 },
        { id: '2', title: 'Tarefa única', list: 'hoje', order: 1, createdAt: 3 }
    ];
    const sanitized = SyncSystem.sanitizeTasks(rawTasks);
    assertEq('sanitizeTasks mantém apenas as rotinas', sanitized.map(t => t.id), ['r']);
    assert('sanitizeTasks não leva a tarefa do dia nem a conclusão',
        !sanitized.some(t => t.fromRecurrence) && !('completedAt' in sanitized[0]));

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
        { id: 'r', title: 'Rezar terço (editado)', list: 'hoje', order: 0, recurrence: { days: [1, 2, 3, 4, 5] }, createdAt: 1 },
        { id: '9', title: 'Nova rotina', list: 'hoje', order: 2, recurrence: { days: [0] }, createdAt: 9 }
    ];
    const localTasks = [
        { id: 'r', title: 'Rezar terço', list: 'hoje', order: 0, recurrence: { days: [0, 1, 2, 3, 4, 5, 6] }, createdAt: 1 },
        { id: 'r@2026-06-10', title: 'Rezar terço', list: 'hoje', order: 0, fromRecurrence: 'r', date: '2026-06-10', completedAt: 5, createdAt: 2 },
        { id: '2', title: 'Única local', list: 'hoje', order: 1, createdAt: 3 },
        { id: '3', title: 'Rotina apagada no outro device', list: 'hoje', order: 3, recurrence: { days: [1] }, createdAt: 4 },
        { id: '3@2026-06-10', title: 'Rotina apagada no outro device', list: 'hoje', order: 3, fromRecurrence: '3', date: '2026-06-10', createdAt: 5 }
    ];
    const mergedTasks = SyncSystem.mergeTasks(remoteTasks, localTasks);

    assert('mergeTasks: tarefa única local é preservada', mergedTasks.some(t => t.id === '2'));
    assert('mergeTasks: rotina removida remotamente some', !mergedTasks.some(t => t.id === '3'));
    assert('mergeTasks: tarefa de hoje da rotina removida vira tarefa comum',
        mergedTasks.some(t => t.id === '3@2026-06-10' && !t.fromRecurrence));
    assert('mergeTasks: nova rotina remota é adicionada', mergedTasks.some(t => t.id === '9'));
    const m1 = mergedTasks.find(t => t.id === 'r');
    assertEq('mergeTasks: definição remota vence', [m1.title, m1.recurrence.days], ['Rezar terço (editado)', [1, 2, 3, 4, 5]]);
    const mToday = mergedTasks.find(t => t.id === 'r@2026-06-10');
    assert('mergeTasks: conclusão local de hoje preservada', !!mToday.completedAt);

    const legacyRoutine = SyncSystem.convertLegacyRoutine([
        { id: '1', text: 'Rotina 1.2.0', recurring: true, totalCycles: 1, streak: 4 },
        { id: '2', text: 'Única', recurring: false }
    ]);
    assertEq('rotina no formato 1.2.0 é convertida', legacyRoutine.map(t => [t.id, t.title]), [['1', 'Rotina 1.2.0']]);

    // ========================================================
    group('RouteCore — rotas');
    // ========================================================

    assertEq('vazio cai em Hoje', RouteCore.parseRoute(''), { view: 'hoje', path: [] });
    assertEq('hash simples', RouteCore.parseRoute('#rezar'), { view: 'rezar', path: [] });
    assertEq('subtela', RouteCore.parseRoute('#rezar/biblioteca'), { view: 'rezar', path: ['biblioteca'] });
    assertEq('barras extras são ignoradas', RouteCore.parseRoute('#/frutos//'), { view: 'frutos', path: [] });
    assertEq('maiúsculas no destino', RouteCore.parseRoute('#Rezar'), { view: 'rezar', path: [] });
    assertEq('destino desconhecido cai em Hoje', RouteCore.parseRoute('#novena/dia-5'), { view: 'hoje', path: [] });
    assertEq('subtela com espaço e acento', RouteCore.parseRoute('#rezar/leitor/S%C3%A3o%20Jos%C3%A9'), { view: 'rezar', path: ['leitor', 'São José'] });
    assertEq('percent-encoding inválido não quebra', RouteCore.parseRoute('#rezar/%E0%A4%A'), { view: 'rezar', path: [] });
    assertEq('lista própria de destinos', RouteCore.parseRoute('#protecao', ['hoje', 'protecao']), { view: 'protecao', path: [] });
    assertEq('serializa com subtela', RouteCore.serializeRoute({ view: 'rezar', path: ['leitor', 'São José'] }), '#rezar/leitor/S%C3%A3o%20Jos%C3%A9');
    assertEq('serializa rota vazia como Hoje', RouteCore.serializeRoute(null), '#hoje');
    const roundTrip = { view: 'rezar', path: ['terco'] };
    assertEq('ida e volta', RouteCore.parseRoute(RouteCore.serializeRoute(roundTrip)), roundTrip);
    assert('mesma rota', RouteCore.sameRoute({ view: 'rezar', path: [] }, RouteCore.parseRoute('#rezar')));
    assert('rotas diferentes', !RouteCore.sameRoute({ view: 'rezar', path: [] }, { view: 'rezar', path: ['terco'] }));
    assertEq('estado antigo inválido vira Hoje', RouteCore.sanitizeRoute({ foo: 1 }), { view: 'hoje', path: [] });
    assertEq('estado de outra versão com destino válido', RouteCore.sanitizeRoute({ view: 'frutos', path: 'x' }), { view: 'frutos', path: [] });

    // ========================================================
    group('PomodoroCore — configurações e fim de sessão');
    // ========================================================

    assertEq('pausa longa padrão de 15 min', PomodoroCore.getDefaultSettings().longPause, 15);
    assertEq('pausa longa editável (20 min)', PomodoroCore.sanitizeSettings({ longPause: 20 }).longPause, 20);
    assertEq('pausa longa acima do limite é limitada (60)', PomodoroCore.sanitizeSettings({ longPause: 999 }).longPause, 60);
    assertEq('valor inválido volta ao padrão', PomodoroCore.sanitizeSettings({ longPause: 'x', focus: null }).focus, 25);
    assertEq('texto numérico da 1.1.5 é aceito', PomodoroCore.sanitizeSettings({ focus: '50' }).focus, 50);
    assert('campos booleanos ausentes recebem o padrão', PomodoroCore.sanitizeSettings({}).sound === true);

    st = { phase: 'focus', pomodoroCount: 3, settings: PomodoroCore.sanitizeSettings({ longPause: 20 }) };
    PomodoroCore.advancePhase(st);
    assertEq('pausa longa usa a duração editada', st.timeRemaining, 20 * 60);

    const longOpts = PomodoroCore.endOfSessionOptions({ phase: 'longPause', settings: PomodoroCore.sanitizeSettings({ longPause: 20 }) });
    assertEq('fim da pausa longa: pausa, Respiro, mais uma sessão, voltar',
        longOpts.map(o => o.id), ['longPause', 'respiro', 'nextSession', 'home']);
    assert('pausa longa é editável e sugerida', longOpts[0].editable === true && longOpts[0].primary === true);
    assertEq('pausa longa mostra a duração configurada', longOpts[0].minutes, 20);
    const shortOpts = PomodoroCore.endOfSessionOptions({ phase: 'pause', settings: PomodoroCore.getDefaultSettings() });
    assertEq('fim de sessão comum: pausa curta primeiro', shortOpts[0].id, 'pause');
    assert('opções de fim de sessão incluem o Respiro', shortOpts.some(o => o.id === 'respiro'));
    assertEq('estado inicial tem sessão vazia', PomodoroCore.createState({ focus: 50 }, new Date(2026, 10, 3)).session, null);
    assertEq('chave diária legada', PomodoroCore.todayKey(new Date(2026, 10, 3)), 'ora_focus_total_Tue Nov 03 2026');

    // ========================================================
    group('TasksCore — tarefas');
    // ========================================================

    const T0 = new Date(2026, 10, 2, 9, 0).getTime(); // segunda, 02/11/2026
    let tasks = [];
    tasks = TasksCore.createTask(tasks, { id: 'a', title: 'Relatório', now: T0 });
    tasks = TasksCore.createTask(tasks, { id: 'b', title: 'E-mails', now: T0 + 1 });
    tasks = TasksCore.createTask(tasks, { id: 'c', title: 'Ligar para o banco', now: T0 + 2 });
    tasks = TasksCore.createTask(tasks, { id: 'd', title: 'Ideia solta', list: 'depois', now: T0 + 3 });

    assertEq('próximo passo é a primeira de Hoje', TasksCore.nextStep(tasks).id, 'a');
    tasks = TasksCore.moveTask(tasks, 'c', -1);
    tasks = TasksCore.moveTask(tasks, 'c', -1);
    assertEq('próximo passo respeita a ordem escolhida (E03)', TasksCore.nextStep(tasks).id, 'c');
    assertEq('ordem de Hoje após mover', TasksCore.listTasks(tasks, 'hoje').map(t => t.id), ['c', 'a', 'b']);
    assert('Depois não entra no próximo passo', TasksCore.listTasks(tasks, 'hoje').every(t => t.id !== 'd'));

    tasks = TasksCore.completeTask(tasks, 'c', T0 + 100);
    assertEq('concluída sai do próximo passo', TasksCore.nextStep(tasks).id, 'a');
    assert('concluir não cria sessões nem ciclos (E01)', !('completedCycles' in tasks.find(t => t.id === 'c')));
    tasks = TasksCore.reopenTask(tasks, 'c');
    assert('reabrir limpa a conclusão', !TasksCore.isDone(tasks.find(t => t.id === 'c')));

    tasks = TasksCore.moveToToday(tasks, 'd');
    assertEq('mover para Hoje vai para o fim da lista', TasksCore.listTasks(tasks, 'hoje').map(t => t.id), ['c', 'a', 'b', 'd']);
    tasks = TasksCore.moveToLater(tasks, 'a');
    assertEq('mover para Depois', TasksCore.listTasks(tasks, 'depois').map(t => t.id), ['a']);
    const many = ['1', '2', '3', '4', '5'].reduce((acc, id) => TasksCore.createTask(acc, { id, title: 'T' + id, now: T0 }), []);
    assertEq('Hoje guarda mais de 3 (limite é só de apresentação)', TasksCore.listTasks(many, 'hoje').length, 5);
    assertEq('tarefa sem título é ignorada', TasksCore.createTask([], { id: 'x', title: '  ' }).length, 0);
    assert('normalize descarta campos legados', !('done' in TasksCore.normalizeTask({ id: 1, title: 'x', done: true, streak: 4 })));

    // ========================================================
    group('TasksCore — recorrência e virada do dia');
    // ========================================================

    const MON = new Date(2026, 10, 2, 8, 0);  // segunda
    const FRI = new Date(2026, 10, 6, 8, 0);  // sexta
    const SAT = new Date(2026, 10, 7, 8, 0);  // sábado
    let routine = TasksCore.createTask([], { id: 'r', title: 'Leitura espiritual', recurrence: { days: TasksCore.WEEKDAYS }, now: MON.getTime() });
    assertEq('modelo de rotina não aparece na lista', TasksCore.visibleTasks(routine).length, 0);

    const onMon = TasksCore.materializeRecurring(routine, MON);
    assertEq('dias úteis: aparece na segunda', TasksCore.visibleTasks(onMon).map(t => t.title), ['Leitura espiritual']);
    assertEq('dias úteis: aparece na sexta', TasksCore.visibleTasks(TasksCore.materializeRecurring(routine, FRI)).length, 1);
    assertEq('dias úteis: não aparece no sábado (E05)', TasksCore.visibleTasks(TasksCore.materializeRecurring(routine, SAT)).length, 0);
    assertEq('materializar duas vezes não duplica', TasksCore.materializeRecurring(onMon, MON).length, onMon.length);

    let day = TasksCore.completeTask(onMon, 'r@2026-11-02', MON.getTime() + 3600e3);
    day = TasksCore.createTask(day, { id: 'u', title: 'Pagar conta', now: MON.getTime() });
    day = TasksCore.completeTask(day, 'u', MON.getTime() + 7200e3);
    day = TasksCore.createTask(day, { id: 'p', title: 'Pendente', now: MON.getTime() });
    const TUE = new Date(2026, 10, 3, 7, 0);
    const rolled = TasksCore.rolloverDay(day, [], TUE);
    assert('virada: concluídas viram histórico (E06)', rolled.history.some(h => h.id === 'u') && rolled.history.some(h => h.id === 'r@2026-11-02'));
    assert('virada: concluídas saem da lista', !rolled.tasks.some(t => t.id === 'u'));
    assert('virada: pendente comum continua', rolled.tasks.some(t => t.id === 'p'));
    assert('virada: modelo de rotina continua', rolled.tasks.some(t => t.id === 'r'));
    const tue = TasksCore.materializeRecurring(rolled.tasks, TUE);
    assert('rotina gera a tarefa de terça, aberta', tue.some(t => t.id === 'r@2026-11-03' && !TasksCore.isDone(t)));
    const rolledAgain = TasksCore.rolloverDay(tue, rolled.history, TUE);
    assert('virada no mesmo dia não muda nada', !rolledAgain.changed && rolledAgain.history.length === rolled.history.length);

    const missed = TasksCore.rolloverDay(TasksCore.materializeRecurring(routine, MON), [], TUE);
    assert('rotina de ontem não feita não acumula', !missed.tasks.some(t => t.fromRecurrence));
    const todayDone = TasksCore.completeTask(TasksCore.createTask([], { id: 'z', title: 'Hoje', now: TUE.getTime() }), 'z', TUE.getTime());
    assert('concluída hoje fica na lista até amanhã', TasksCore.rolloverDay(todayDone, [], TUE).tasks.length === 1);

    let edited = TasksCore.updateTask(tue, 'r@2026-11-03', { title: 'Leitura (30 min)' });
    assertEq('editar a tarefa do dia renomeia a rotina', edited.find(t => t.id === 'r').title, 'Leitura (30 min)');
    const single = TasksCore.stopRecurrence(tue, 'r@2026-11-03');
    assert('tornar única remove o modelo e mantém a de hoje', !single.some(t => t.id === 'r') &&
        single.some(t => t.id === 'r@2026-11-03' && !t.fromRecurrence));

    const sessionsForDots = [
        { id: 's1', taskId: 'a', status: 'completed', focusedMin: 25, startedAt: MON.getTime() },
        { id: 's2', taskId: 'a', status: 'interrupted', focusedMin: 12, startedAt: MON.getTime() },
        { id: 's3', taskId: 'a', status: 'completed', focusedMin: 25, startedAt: TUE.getTime() }
    ];
    assertEq('sessões concluídas da tarefa no dia', TasksCore.sessionsDoneToday(sessionsForDots, 'a', MON), 1);

    // ========================================================
    group('SessionsCore — sessões de foco');
    // ========================================================

    const S0 = new Date(2026, 10, 3, 9, 0).getTime();
    const MIN = 60000;
    let sess = SessionsCore.startSession({ id: 's', taskId: 'a', plannedMin: 25, now: S0 });
    sess = SessionsCore.pause(sess, S0 + 5 * MIN);
    assert('sessão pausada fica pausada', SessionsCore.isPaused(sess));
    sess = SessionsCore.resume(sess, S0 + 15 * MIN); // 10 min pausada
    const paused10 = SessionsCore.finishSession(sess, S0 + 35 * MIN);
    assertEq('pausada por 10 min não soma esses 10 min', paused10.focusedMin, 25);
    assertEq('sessão completa', paused10.status, 'completed');
    assertEq('pausa no meio: tempo focado ao retomar', SessionsCore.focusedMs(sess, S0 + 20 * MIN), 10 * MIN);

    const interrupted = SessionsCore.interruptSession(SessionsCore.startSession({ id: 'i', plannedMin: 25, now: S0 }), S0 + 12 * MIN + 40000);
    assertEq('interrompida aos 12 min registra 12', interrupted.focusedMin, 12);
    assertEq('status interrompida', interrupted.status, 'interrupted');

    const free = SessionsCore.startSession({ plannedMin: 25, now: S0 });
    assertEq('foco sem tarefa é válido', free.taskId, null);
    const freeRecord = SessionsCore.finishSession(free, S0 + 25 * MIN);
    assertEq('foco sem tarefa é registrado', SessionsCore.appendSession([], freeRecord).length, 1);
    assertEq('menos de 1 min não vira sessão', SessionsCore.appendSession([], SessionsCore.interruptSession(free, S0 + 30000)).length, 0);

    const withIntention = SessionsCore.startSession({ intention: '  Pela família ', now: S0 });
    assertEq('intenção da sessão é guardada na sessão', SessionsCore.finishSession(withIntention, S0 + MIN).intention, 'Pela família');

    const rangeSessions = [
        { id: 'imported-2026-11-01', imported: true, date: '2026-11-01', focusedMin: 75, startedAt: null },
        { id: 'x1', focusedMin: 25, startedAt: new Date(2026, 10, 2, 10, 0).getTime() },
        { id: 'x2', focusedMin: 12, startedAt: new Date(2026, 10, 2, 23, 50).getTime() },
        { id: 'x3', focusedMin: 25, startedAt: new Date(2026, 10, 3, 0, 10).getTime() }
    ];
    assertEq('minutos do dia 02/11', SessionsCore.minutesInRange(rangeSessions, new Date(2026, 10, 2), new Date(2026, 10, 3)), 37);
    assertEq('sessão importada conta no próprio dia', SessionsCore.minutesInRange(rangeSessions, new Date(2026, 10, 1), new Date(2026, 10, 2)), 75);
    assertEq('semana inteira', SessionsCore.minutesInRange(rangeSessions, new Date(2026, 9, 29), new Date(2026, 10, 5)), 137);

    // ========================================================
    group('SessionsCore — intenção do dia');
    // ========================================================

    let intentions = SessionsCore.setDayIntention({}, new Date(2026, 10, 3), 'Pela saúde da mãe');
    assertEq('intenção gravada por data', SessionsCore.dayIntention(intentions, new Date(2026, 10, 3, 18)), 'Pela saúde da mãe');
    assertEq('dia seguinte começa sem intenção', SessionsCore.dayIntention(intentions, new Date(2026, 10, 4)), '');
    const sessionWithOwn = SessionsCore.startSession({ intention: 'Pelo colega doente', now: S0 });
    assertEq('intenção da sessão não altera a do dia', SessionsCore.dayIntention(intentions, new Date(2026, 10, 3)), 'Pela saúde da mãe');
    assertEq('e a do dia não altera a da sessão', sessionWithOwn.intention, 'Pelo colega doente');
    intentions = SessionsCore.setDayIntention(intentions, new Date(2026, 10, 3), '');
    assertEq('apagar a intenção remove a data', Object.keys(intentions).length, 0);

    // ========================================================
    group('CounterCore — Dias com Ora');
    // ========================================================

    const counterHistory = {
        sessions: [
            { id: 'a', focusedMin: 25, startedAt: new Date(2026, 9, 1, 10).getTime() },
            { id: 'b', focusedMin: 25, startedAt: new Date(2026, 9, 1, 15).getTime() },
            { id: 'imported-2026-09-20', imported: true, date: '2026-09-20', focusedMin: 50, startedAt: null }
        ],
        tasks: [{ id: 't', title: 'x', completedAt: new Date(2026, 8, 20, 9).getTime() }], // mesmo dia da sessão importada
        taskHistory: [{ id: 'h', title: 'só uma tarefa', completedAt: new Date(2026, 10, 2, 9).getTime() }],
        extraDays: ['2026-08-15']
    };
    assertEq('conta dias distintos', CounterCore.daysWithOra(counterHistory), 4);
    assert('um dia com só uma tarefa concluída conta', CounterCore.activeDays(counterHistory).includes('2026-11-02'));
    assertEq('dias sem registro entre eles não zeram o contador', CounterCore.activeDays(counterHistory), ['2026-08-15', '2026-09-20', '2026-10-01', '2026-11-02']);
    assertEq('sessão com 0 min não conta', CounterCore.daysWithOra({ sessions: [{ focusedMin: 0, startedAt: Date.now() }] }), 0);
    assertEq('sem histórico = 0', CounterCore.daysWithOra({}), 0);

    // ========================================================
    group('MigrateCore — 1.1.5');
    // ========================================================

    const fixture = (typeof window !== 'undefined' ? window : globalThis).__oraFixtures &&
        (typeof window !== 'undefined' ? window : globalThis).__oraFixtures['storage-1.1.5'];
    if (!fixture) {
        skip('fixture tests/fixtures/storage-1.1.5.json indisponível (rode node tests/run.js ou sirva por http)');
    } else {
        const snap115 = {};
        Object.keys(fixture).filter(k => k[0] !== '_').forEach(k => { snap115[k] = fixture[k]; });
        const NOW = new Date(2026, 10, 3, 10, 0).getTime(); // terça, 03/11/2026
        const r1 = MigrateCore.migrate(snap115, { now: NOW });
        const after1 = MigrateCore.apply(snap115, r1);

        assertEq('grava ora_schema_version = 2', after1.ora_schema_version, 2);
        assert('migração é necessária antes e não depois', MigrateCore.needsMigration(snap115) && !MigrateCore.needsMigration(after1));
        assertEq('atalhos preservados', after1.ora_quick_links.map(l => l.name), ['Google', 'ChatGPT', 'Liturgia das Horas', 'Vatican News']);
        assert('playlists viram lista', Array.isArray(after1.ora_user_playlists) && after1.ora_user_playlists.length === 2);
        assertEq('playlist preserva o id externo', after1.ora_user_playlists[0].externalId, 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
        assertEq('playlists padrão removidas pela pessoa continuam removidas', after1.ora_deleted_default_playlists, ['lofi-girl']);
        assertEq('preferências de foco ficam no estado do pomodoro', after1.ora_pomodoro_state.settings.focus, 50);
        assert('ora_focus_settings já absorvida sai', !('ora_focus_settings' in after1));

        const imported = after1.ora_sessions.filter(sx => sx.imported);
        assertEq('totais de dias anteriores viram sessões importadas', imported.map(sx => [sx.date, sx.focusedMin]), [['2026-10-30', 75], ['2026-11-02', 100]]);
        assert('sessões importadas não têm horário', imported.every(sx => sx.startedAt === null && sx.taskId === null));
        assert('total de 20 s não vira sessão, mas a chave antiga sai', !imported.some(sx => sx.date === '2026-10-31') && !('ora_focus_total_Sat Oct 31 2026' in after1));
        assertEq('total de hoje continua com o pomodoro', after1['ora_focus_total_Tue Nov 03 2026'], '1500');

        assertEq('intenção vira a intenção do dia de hoje', after1.ora_day_intention, { '2026-11-03': 'Pela saúde da minha mãe' });
        assert('ora_intention antiga sai', !('ora_intention' in after1));
        assertEq('registros de exame viram lista', after1.ora_exam_logs.map(l => l.type), ['night', 'midday']);
        assert('registros de exame ganham id estável', after1.ora_exam_logs.every(l => /^exam-\d+$/.test(l.id)));
        assertEq('progresso do terço vira objeto', after1.ora_rosary_progress, { bead: 27, mystery: 'gloriosos', chapletType: 'terco', lang: 'pt' });

        assertEq('bloqueador da 1.1.5 vira perfil "Meus sites"', after1.blocker_config.profiles.map(p => [p.id, p.name, p.sites]), [['meus-sites', 'Meus sites', ['instagram.com', 'youtube.com']]]);
        assert('bloqueador preserva enabled e trava de versículo', after1.blocker_config.enabled === true && after1.blocker_config.lock.enabled === true && after1.blocker_config.lock.verseIndex === 3);
        assert('nenhuma tarefa é inventada', !('ora_tasks' in after1));
        const unknownKeys = ['catholic_dash_date', 'catholic_dash_image', 'liturgy_gospel_cache', 'ora_exam_done_Sat Oct 31 2026',
            'ora_evening_done_Sat Oct 31 2026', 'ora_virtues_list', 'ora_virtues_log_Mon Nov 02 2026', 'ora_quote_index', 'ora_greeting_index'];
        assert('nenhuma chave desconhecida é apagada', unknownKeys.every(k => JSON.stringify(after1[k]) === JSON.stringify(snap115[k])));
        assert('só chaves legadas convertidas são removidas', r1.removals.every(k =>
            k === 'ora_focus_settings' || k === 'ora_intention' || k.startsWith('ora_focus_total_')));

        const r2 = MigrateCore.migrate(after1, { now: NOW });
        const after2 = MigrateCore.apply(after1, r2);
        assertEq('rodar duas vezes dá o mesmo resultado', after2, after1);
        assert('segunda rodada não muda nem remove nada', Object.keys(r2.changes).length === 0 && r2.removals.length === 0);
    }

    // ========================================================
    group('MigrateCore — casos de borda');
    // ========================================================

    const NOW2 = new Date(2026, 10, 3, 10, 0).getTime();
    const fresh = MigrateCore.migrate({}, { now: NOW2 });
    assertEq('instalação nova só grava a versão', fresh.changes, { ora_schema_version: 2 });

    const broken = { ora_user_playlists: '{oops', ora_exam_logs: 'não é json', ora_unknown: 1 };
    const rb = MigrateCore.migrate(broken, { now: NOW2 });
    assert('texto inválido é deixado como está', !('ora_user_playlists' in rb.changes) && !rb.removals.includes('ora_user_playlists') && !('ora_exam_logs' in rb.changes));

    const noState = MigrateCore.migrate({ ora_focus_settings: '{"focus":40,"longPause":10}' }, { now: NOW2 });
    assertEq('sem estado do pomodoro, cria um com as preferências antigas', noState.changes.ora_pomodoro_state.settings.longPause, 10);

    const oldLinks = MigrateCore.migrate({ oraLinks: '[{"name":"Bíblia","url":"https://www.bibliaonline.com.br"}]' }, { now: NOW2 });
    assert('chave antiga oraLinks vira ora_quick_links', oldLinks.changes.ora_quick_links[0].name === 'Bíblia' && oldLinks.removals.includes('oraLinks'));

    const stats = MigrateCore.migrate({
        'ora_focus_total_Fri Oct 30 2026': '1500',
        ora_daily_stats: { '2026-10-30': { focusSeconds: 3000, tasksDone: 2 }, '2026-10-29': { tasksDone: 1 }, '2026-11-03': { tasksDone: 9 } }
    }, { now: NOW2 });
    assertEq('estatísticas da 1.2.0: maior total do dia vence', stats.changes.ora_sessions.map(sx => sx.focusedMin), [50]);
    assertEq('dias com tarefas concluídas entram no contador', stats.changes.ora_imported_active_days, ['2026-10-29', '2026-10-30']);

    // ========================================================
    group('MigrateCore — tarefas da 1.2.0');
    // ========================================================

    const legacy120 = {
        ora_pomodoro_state: { settings: { focus: 30 } },
        ora_tasks_last_reset: new Date(NOW2).toDateString(),
        ora_active_task_id: 'r1',
        ora_tasks_daily: [
            { id: 't1', text: 'Escrever capítulo', intention: 'Pelos alunos', totalCycles: 3, completedCycles: 2, done: false, recurring: false, createdAt: '2026-11-01T12:00:00.000Z' },
            { id: 't2', text: 'Revisar contrato', totalCycles: 2, completedCycles: 2, done: true, recurring: false, completedAt: new Date(NOW2 - 3600e3).toISOString() },
            { id: 'r1', text: 'Terço', totalCycles: 1, completedCycles: 1, done: true, recurring: true, streak: 9, lastStreakDate: '2026-11-03', completedAt: new Date(NOW2 - 600e3).toISOString() }
        ]
    };
    const r120 = MigrateCore.migrate(legacy120, { now: NOW2 });
    const after120 = MigrateCore.apply(legacy120, r120);
    const migratedTasks = after120.ora_tasks;
    const t1 = migratedTasks.find(t => t.id === 't1');
    assertEq('tarefa vira título + lista Hoje', [t1.title, t1.list], ['Escrever capítulo', 'hoje']);
    assertEq('ciclos previstos viram estimativa', t1.estimateMin, 90);
    assert('ciclos feitos não viram sessões (E01)', !('ora_sessions' in after120));
    assert('concluída mantém a conclusão', TasksCore.isDone(migratedTasks.find(t => t.id === 't2')));
    const r1Template = migratedTasks.find(t => t.id === 'r1');
    assertEq('recorrente vira rotina diária', r1Template.recurrence.days, TasksCore.DAILY);
    assert('rotina feita hoje continua concluída hoje', TasksCore.isDone(migratedTasks.find(t => t.id === 'r1@2026-11-03')));
    assert('streak não é migrado', !('streak' in r1Template));
    assertEq('tarefa ativa recorrente aponta para a de hoje', after120.ora_active_task_id, 'r1@2026-11-03');
    assert('chaves antigas de tarefas saem', !('ora_tasks_daily' in after120) && !('ora_tasks_last_reset' in after120));
    assertEq('tarefas da 1.2.0: idempotente', MigrateCore.apply(after120, MigrateCore.migrate(after120, { now: NOW2 })), after120);

    // ========================================================
    group('TodayCore — estados de Hoje');
    // ========================================================

    const T_AFTERNOON = new Date(2026, 10, 4, 14, 22).getTime();
    const T_NIGHT = new Date(2026, 10, 4, 21, 30).getTime();
    const idle = PomodoroCore.createState(null, new Date(T_AFTERNOON));
    const todayTasks = TasksCore.normalizeTasks([
        { id: 'b', title: 'Revisar capítulo 3', list: 'hoje', order: 2, estimateMin: 50 },
        { id: 'a', title: 'Preparar apresentação', list: 'hoje', order: 1, estimateMin: 25 },
        { id: 'c', title: 'Ligar para o banco', list: 'depois', order: 0 }
    ]);

    assertEq('sem tarefas → vazio', TodayCore.resolveTodayState({ tasks: [], pomodoro: idle, now: T_AFTERNOON }).state, 'repouso-vazio');
    assertEq('só tarefas de Depois → vazio', TodayCore.resolveTodayState({ tasks: todayTasks.filter(t => t.list === 'depois'), pomodoro: idle, now: T_AFTERNOON }).state, 'repouso-vazio');
    const rest = TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: idle, now: T_AFTERNOON });
    assertEq('com tarefas → repouso', rest.state, 'repouso');
    assertEq('próximo passo segue a ordem escolhida', rest.next.id, 'a');
    assertEq('contagem conta só as abertas de Hoje', rest.openToday, 2);

    const runningSession = SessionsCore.startSession({ id: 's1', taskId: 'a', plannedMin: 25, now: T_AFTERNOON - 5 * MIN });
    const running = Object.assign({}, idle, {
        isRunning: true, expectedEndTime: T_AFTERNOON + 20 * MIN, totalDuration: 25 * 60, timeRemaining: 25 * 60, session: runningSession
    });
    const angelusInvite = { id: 'angelus', window: 'meio-dia', key: 'k' };
    const active = TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: running, now: T_AFTERNOON, reminders: angelusInvite });
    assertEq('sessão rodando → ativa', active.state, 'ativa');
    assertEq('sessão ativa → nenhum convite', active.invite, null);
    assertEq('sessão ativa → sem próximo passo (nada de "Começar foco")', active.next, null);
    assertEq('atividade usa o título da tarefa', active.session.title, 'Preparar apresentação');
    assertEq('tempo restante calculado pelo fim previsto', active.session.remainingSec, 20 * 60);

    const pausedState = Object.assign({}, idle, {
        isRunning: false, expectedEndTime: null, totalDuration: 25 * 60, timeRemaining: 13 * 60,
        session: SessionsCore.pause(runningSession, T_AFTERNOON)
    });
    const paused = TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: pausedState, now: T_AFTERNOON + 60 * MIN });
    assertEq('sessão pausada → pausada (nunca ativa)', paused.state, 'pausada');
    assertEq('pausada não conta o tempo', paused.session.remainingSec, 13 * 60);
    assertEq('pausada com a preparação pedida continua pausada', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: pausedState, now: T_AFTERNOON, preparing: true }).state, 'pausada');

    const night = TodayCore.resolveTodayState({ tasks: [], pomodoro: idle, now: T_NIGHT, reminders: { id: 'closeDay', window: 'noite', key: 'n' } });
    assertEq('21h30 sem sessão → noite', night.state, 'noite');
    assertEq('noite mostra o convite de encerrar o dia', night.invite.id, 'closeDay');
    assertEq('21h30 com sessão ativa → ativa', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: running, now: T_NIGHT - 60 * MIN + 60 * MIN }).state, 'ativa');

    const afterFocus = Object.assign({}, idle, {
        phase: 'pause', timeRemaining: 5 * 60, totalDuration: 5 * 60, session: null,
        completed: { taskId: 'a', title: 'Preparar apresentação', plannedMin: 25, focusedMin: 25, endedAt: T_AFTERNOON }
    });
    const done = TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: afterFocus, now: T_AFTERNOON + MIN });
    assertEq('foco terminou → concluída', done.state, 'concluida');
    assertEq('concluída sugere a próxima tarefa', done.completed.after.id, 'b');
    assertEq('concluída sem convite', done.invite, null);
    assertEq('mais uma sessão abre a preparação', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: afterFocus, now: T_AFTERNOON, preparing: true }).state, 'preparacao');
    assertEq('concluída de ontem não reaparece', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: afterFocus, now: T_AFTERNOON + 13 * 60 * MIN }).state, 'noite');

    const breakRunning = Object.assign({}, afterFocus, { isRunning: true, expectedEndTime: T_AFTERNOON + 4 * MIN });
    const onBreak = TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: breakRunning, now: T_AFTERNOON });
    assertEq('pausa correndo → ativa', onBreak.state, 'ativa');
    assertEq('pausa correndo é do tipo pausa', onBreak.session.kind, 'pause');

    assertEq('falha de gravação em repouso → falha', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: idle, now: T_AFTERNOON, error: { kind: 'save' } }).state, 'falha');
    assertEq('falha não esconde a sessão ativa', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: running, now: T_AFTERNOON, error: { kind: 'save' } }).state, 'ativa');
    assertEq('sem estado do pomodoro → repouso', TodayCore.resolveTodayState({ tasks: todayTasks, pomodoro: null, now: T_AFTERNOON }).state, 'repouso');

    // ========================================================
    group('RemindersCore — um convite por vez');
    // ========================================================

    const R = (h, m) => new Date(2026, 10, 4, h, m || 0);
    assertEq('12h30: Angelus tem prioridade sobre o exame do meio-dia', RemindersCore.pickInvite({ now: R(12, 30) }).id, 'angelus');
    const morningDone = ['morning']; // ritual da manhã já feito (fase 5)
    assertEq('11h30: só o exame do meio-dia', RemindersCore.pickInvite({ now: R(11, 30), skip: morningDone }).id, 'midday');
    assertEq('15h10: Terço da Misericórdia', RemindersCore.pickInvite({ now: R(15, 10) }).id, 'mercy');
    assertEq('21h10: Encerrar o dia', RemindersCore.pickInvite({ now: R(21, 10) }).id, 'closeDay');
    assertEq('10h: nenhum convite', RemindersCore.pickInvite({ now: R(10), skip: morningDone }), null);
    assertEq('sessão ativa: nenhum convite', RemindersCore.pickInvite({ now: R(12, 30), sessionActive: true }), null);

    const angelusNoon = RemindersCore.pickInvite({ now: R(12, 30) });
    let handled = RemindersCore.dismiss({}, angelusNoon, R(12, 30));
    assertEq('"Agora não" no Angelus deixa a vez para o próximo', RemindersCore.pickInvite({ now: R(12, 40), handled }).id, 'midday');
    handled = RemindersCore.dismiss(handled, RemindersCore.pickInvite({ now: R(12, 40), handled }), R(12, 40));
    assertEq('com os dois adiados, nada às 12h50', RemindersCore.pickInvite({ now: R(12, 50), handled }), null);
    assertEq('"Agora não" adia só até o próximo horário (18h)', RemindersCore.pickInvite({ now: R(18, 5), handled }).id, 'angelus');
    assertEq('desligado nas configurações não aparece', RemindersCore.pickInvite({ now: R(15, 10), enabled: { mercy: false } }), null);
    assertEq('oração de abertura espera um convite com horário', RemindersCore.pickInvite({ now: R(12, 30), carloPending: true }).id, 'angelus');
    assertEq('oração de abertura aparece fora dos horários', RemindersCore.pickInvite({ now: R(10), carloPending: true, skip: morningDone }).id, 'carlo');
    const oldHandled = RemindersCore.dismiss({ '2026-10-01:angelus:manha': true }, null, R(9));
    assertEq('registros antigos são descartados', Object.keys(oldHandled).length, 0);
    assertEq('marcar pelo id (exame feito por outro caminho)', RemindersCore.pickInvite({ now: R(21, 20), handled: RemindersCore.dismissById({}, 'closeDay', R(21, 15)) }), null);

    // ========================================================
    group('PomodoroCore — preparação, pausa e volta ao início');
    // ========================================================

    const prepState = PomodoroCore.createState({ focus: 25 }, new Date(T_AFTERNOON));
    prepState.phase = 'pause';
    prepState.completed = { title: 'x' };
    PomodoroCore.prepareFocus(prepState, 50);
    assertEq('preparação escolhe 50 min', prepState.totalDuration, 50 * 60);
    assertEq('preparação vinda da pausa volta ao foco', prepState.phase, 'focus');
    assertEq('preparação limpa a sessão concluída', prepState.completed, null);
    assertEq('duração inválida usa a padrão', PomodoroCore.prepareFocus(PomodoroCore.createState({ focus: 25 }), 'x').totalDuration, 25 * 60);

    const longBreak = PomodoroCore.createState({ longPause: 15 });
    longBreak.phase = 'longPause';
    PomodoroCore.prepareBreak(longBreak, 20);
    assertEq('pausa longa editável naquele momento', longBreak.timeRemaining, 20 * 60);
    assertEq('pausa longa não muda a configuração', longBreak.settings.longPause, 15);
    const focusPhase = PomodoroCore.createState();
    assertEq('ajustar pausa fora da pausa não faz nada', PomodoroCore.prepareBreak(focusPhase, 20).totalDuration, 25 * 60);

    const home = Object.assign(PomodoroCore.createState({ focus: 30 }), { phase: 'longPause', completed: { title: 'x' }, timeRemaining: 60 });
    PomodoroCore.resetToIdle(home);
    assertEq('voltar ao início: foco parado com a duração padrão', [home.phase, home.isRunning, home.totalDuration, home.completed], ['focus', false, 30 * 60, null]);

    const summary = PomodoroCore.completedSummary(null, { taskId: 'a', title: 'Preparar', intention: 'Pela equipe', plannedMin: 25, focusedMin: 25, endedAt: 5 });
    assertEq('resumo da sessão concluída', summary, { taskId: 'a', plannedMin: 25, focusedMin: 25, endedAt: 5, title: 'Preparar', intention: 'Pela equipe' });
    const titled = SessionsCore.finishSession(SessionsCore.startSession({ title: ' Foco livre ', plannedMin: 25, now: S0 }), S0 + 25 * MIN);
    assertEq('sessão guarda o nome da atividade', titled.title, 'Foco livre');

    // ========================================================
    group('TasksCore — rotina a partir de uma tarefa');
    // ========================================================

    const WED = new Date(2026, 10, 4, 9).getTime(); // quarta-feira
    const plain = TasksCore.createTask([], { id: 'p', title: 'Ler', estimateMin: 25, now: WED });
    const routineToday = TasksCore.makeRecurring(plain, 'p', TasksCore.WEEKDAYS, WED);
    const tpl = routineToday.find(t => TasksCore.isTemplate(t));
    assertEq('cria o modelo com os dias escolhidos', tpl.recurrence.days, [1, 2, 3, 4, 5]);
    assertEq('a tarefa vira a de hoje da rotina', routineToday.find(t => t.id === 'p').fromRecurrence, tpl.id);
    assertEq('não duplica a tarefa de hoje', TasksCore.materializeRecurring(routineToday, new Date(WED)).length, 2);
    assertEq('dias da rotina pela tarefa do dia', TasksCore.recurrenceDays(routineToday, routineToday.find(t => t.id === 'p')), [1, 2, 3, 4, 5]);
    const routineLater = TasksCore.makeRecurring(plain, 'p', [6], WED);
    assert('fora dos dias, a tarefa continua comum', !routineLater.find(t => t.id === 'p').fromRecurrence);
    assertEq('rotina de sábado aparece no sábado', TasksCore.materializeRecurring(routineLater, new Date(2026, 10, 7)).length, 3);
    assertEq('dias vazios não criam rotina', TasksCore.makeRecurring(plain, 'p', [], WED).length, 1);

    // ========================================================
    // Render
    // ========================================================

    // Exposto para o runner em Node (tests/run.js)
    (typeof window !== 'undefined' ? window : globalThis).__oraTestResults = results;


    group('SearchCore — títulos, textos e escopos');
    const prayerSamples = [
        {id:'jose',title:'São José',category:'saints',text:{pt:'Ofereço meu trabalho',la:'Sancte Ioseph'}},
        {id:'ave',title:'Ave Maria',category:'marian',text:{pt:'cheia de graça'}}
    ];
    assertEq('sao jose encontra São José', SearchCore.search(prayerSamples,{query:'sao jose'}).map(p => p.id),['jose']);
    assertEq('busca texto sem acentos', SearchCore.search(prayerSamples,{query:'graca'}).map(p => p.id),['ave']);
    assertEq('categoria restringe a busca', SearchCore.search(prayerSamples,{query:'jose',category:'marian'}),[]);
    assertEq('favoritas restringem a busca', SearchCore.search(prayerSamples,{favoritesOnly:true,favorites:['ave']}).map(p => p.id),['ave']);
    assertEq('categoria e favoritas combinam', SearchCore.search(prayerSamples,{category:'saints',favoritesOnly:true,favorites:['ave']}),[]);
    assertEq('busca também em latim', SearchCore.search(prayerSamples,{query:'ioseph'}).length,1);
    assertEq('favoritas vazias não exibem todas',SearchCore.search(prayerSamples,{favoritesOnly:true}).length,0);

    group('ReaderCore — proporção e restauração');
    assertEq('metade de uma leitura longa',ReaderCore.proportion(600,1600,400),0.5);
    assertEq('retoma metade em outra altura de tela',ReaderCore.restore(0.5,2400,600),900);
    assertEq('texto sem rolagem não gera NaN',ReaderCore.proportion(0,300,600),0);
    assertEq('texto curto restaura no topo',ReaderCore.restore(0.9,300,600),0);
    assertEq('limita overscroll',ReaderCore.proportion(2000,1600,400),1);
    assertEq('proporção inválida restaura topo',ReaderCore.restore(NaN,2000,400),0);
    assertEq('tamanho persistido é limitado',ReaderCore.preferences({size:200,appearance:'papel'}),{size:38,appearance:'papel'});
    assertEq('tema desconhecido volta a escuro',ReaderCore.preferences({appearance:'unknown'}).appearance,'escuro');

    group('RosaryCore — mistérios, navegação e retomada');
    const expectedMysteries = ['gloriosos','gozosos','dolorosos','gloriosos','luminosos','dolorosos','gozosos'];
    for (let day = 0;day < 7;day++) assertEq('mistério por dia ' + day,RosaryCore.mysteryForDay(new Date(2026,10,1 + day)),expectedMysteries[day]);
    const rosStructure = [{type:'sinal-cruz',decade:0}];
    for (let decade = 1;decade <= 5;decade++) {
        rosStructure.push({type:'pai-nosso',decade});
        for (let n = 1;n <= 10;n++) rosStructure.push({type:'ave-maria',decade});
        rosStructure.push({type:'gloria',decade},{type:'fatima',decade});
    }
    rosStructure.push({type:'salve-rainha',decade:0});
    let rosState = RosaryCore.restore({bead:11,mystery:'gloriosos',intention:'pela família',textMode:'name',lang:'es'},rosStructure);
    assertEq('identifica Ave-Maria 10',RosaryCore.position(rosState,rosStructure),{decade:1,hail:10});
    for (let n = 0;n < 3;n++) rosState = RosaryCore.move(rosState,1,rosStructure);
    assertEq('avança ao próximo mistério após Glória e Fátima',RosaryCore.position(rosState,rosStructure),{decade:2,hail:0});
    for (let n = 0;n < 3;n++) rosState = RosaryCore.move(rosState,-1,rosStructure);
    assertEq('volta à Ave-Maria 10',RosaryCore.position(rosState,rosStructure),{decade:1,hail:10});
    const thirdSixth = rosStructure.findIndex((bead,index) => bead.decade === 3 && bead.type === 'ave-maria' && rosStructure.slice(0,index + 1).filter(b => b.decade === 3 && b.type === 'ave-maria').length === 6);
    const resumeState = {...rosState,bead:thirdSixth};
    assertEq('serializa/restaura 6ª Ave-Maria do 3º mistério',RosaryCore.position(RosaryCore.restore(RosaryCore.serialize(resumeState,rosStructure),rosStructure),rosStructure),{decade:3,hail:6});
    assertEq('preserva intenção, idioma e texto',RosaryCore.restore(RosaryCore.serialize(resumeState,rosStructure),rosStructure),resumeState);
    assertEq('JSON legado inválido usa posição inicial',RosaryCore.restore('{bad',rosStructure).bead,0);
    assertEq('posição fora da estrutura usa início',RosaryCore.restore({bead:900},rosStructure).bead,0);
    assertEq('anterior não ultrapassa início',RosaryCore.move(RosaryCore.restore({},rosStructure),-1,rosStructure).bead,0);
    assert('Misericórdia não usa Glória/Fátima nas dezenas',RosaryCore.indices(rosStructure,'misericordia').every(index => !(rosStructure[index].decade > 0 && ['gloria','fatima'].includes(rosStructure[index].type))));

    group('LiturgyCore — APIs, idioma, datas e cache');
    const litDate = '2026-11-03';
    const ptEntry = LiturgyCore.normalizePT({data:'03/11/2026',liturgia:'Celebração de teste',cor:'Verde',leituras:{evangelho:[{referencia:'Lc 14,15-24',texto:'Texto de teste.\nSegundo parágrafo.',titulo:'Evangelho'}]}},litDate);
    assertEq('normaliza referência pt',ptEntry.ref,'Lc 14,15-24');
    assert('preserva parágrafos',ptEntry.text.includes('\n'));
    assertEq('rejeita data errada da API',LiturgyCore.normalizePT({data:'02/11/2026',leituras:{evangelho:[{referencia:'Lc 1',texto:'teste'}]}},litDate),null);
    assertEq('resposta pt vazia não é Evangelho',LiturgyCore.normalizePT({},litDate),null);
    const enEntry = LiturgyCore.normalizeEN({date:litDate,readings:{gospel:'Luke 14:15-24'}},{date:litDate,celebration:{name:'Saint Martin de Porres'}},litDate);
    assertEq('referência en sem texto copiado',enEntry.text,'');
    assertEq('celebração en',enEntry.liturgia,'Saint Martin de Porres');
    assertEq('rejeita leitura de outro dia',LiturgyCore.normalizeEN({date:'2026-11-02',readings:{gospel:'Luke 1'}},null,litDate),null);
    assert('pt usa API atual',LiturgyCore.source('pt',litDate).api.includes('liturgia.up.railway.app'));
    assert('en usa cpbjr',LiturgyCore.source('en',litDate).api.includes('cpbjr.github.io'));
    assert('en abre USCCB',LiturgyCore.source('en',litDate).external.endsWith('110326.cfm'));
    assert('es abre Evangelizo',LiturgyCore.source('es',litDate).external.includes('evangeliodeldia.org/ES/'));
    const mergedGospel = LiturgyCore.merge(ptEntry,{[litDate]:{en:enEntry}},new Date(2026,10,3));
    assertEq('migra cache legado sem perder pt',LiturgyCore.read(mergedGospel,litDate,'pt'),ptEntry);
    assertEq('seleciona idioma por data',LiturgyCore.read(mergedGospel,litDate,'en'),enEntry);
    assertEq('não usa Evangelho antigo como hoje',LiturgyCore.read(mergedGospel,'2026-11-04','pt'),null);
    assertEq('exatamente sete datas inclusive hoje',Object.keys(mergedGospel.days).length,7);
    assertEq('sete dias cruzam o ano',LiturgyCore.days(new Date(2026,11,29)),['2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03','2027-01-04']);
    assertEq('atualização parcial preserva cache offline',LiturgyCore.read(LiturgyCore.merge(mergedGospel,{},new Date(2026,10,3)),litDate,'pt'),ptEntry);
    assertEq('perícope funciona em pt/en',LiturgyCore.pericope('Lucas 14,15-24'),LiturgyCore.pericope('Luke 14:15-24'));
    const artRecord = {pericope:'lc-14-15-24',url:'https://example.org/art.png',status:'draft',caption:'Origem',source:'https://example.org/source'};
    assertEq('arte não aprovada nunca aparece',LiturgyCore.artwork([artRecord],'Lc 14,15-24'),null);
    assert('arte aprovada tem origem',!!LiturgyCore.artwork([{...artRecord,status:'approved'}],'Lc 14,15-24'));
    assertEq('sem acervo não reserva imagem',LiturgyCore.artwork(null,'Lc 14,15-24'),null);

    group('SaintsCore — frases verificadas');
    const sampleSaint = {name:{pt:'Santo de teste'},identity:{pt:'Identidade'},quote:{text:'Frase',verified:true,source:'https://example.org/original'}};
    assert('frase verificada com fonte https permanece',!!SaintsCore.sanitize(sampleSaint).quote);
    assertEq('frase sem verificação é descartada',SaintsCore.sanitize({...sampleSaint,quote:{...sampleSaint.quote,verified:false}}).quote,undefined);
    assertEq('frase sem fonte é descartada',SaintsCore.sanitize({...sampleSaint,quote:{...sampleSaint.quote,source:''}}).quote,undefined);
    assertEq('frase http é descartada',SaintsCore.sanitize({...sampleSaint,quote:{...sampleSaint.quote,source:'http://example.org'}}).quote,undefined);
    assertEq('santo sem frase continua visível',SaintsCore.forDate({'11-03':[{name:'Martinho'}]},new Date(2026,10,3)).length,1);
    assertEq('dia sem registro não inventa santo',SaintsCore.forDate({},new Date(2026,10,3)),[]);


    group('BibleCore — capítulos e fontes católicas');
    const bibleBook = {ptSlug:'sao-joao',enSlug:'john',esSlug:'evangelio-segun-san-juan',chapters:21};
    assertEq('capítulo inexistente não abre',BibleCore.chapterURL(bibleBook,22,'pt'),null);
    assertEq('capítulo zero não abre',BibleCore.chapterURL(bibleBook,0,'pt'),null);
    assertEq('capítulo fracionário não abre',BibleCore.chapterURL(bibleBook,1.5,'pt'),null);
    assert('fonte pt é católica',BibleCore.chapterURL(bibleBook,3,'pt').includes('biblia-ave-maria/sao-joao/3/'));
    assertEq('fonte en é USCCB',BibleCore.chapterURL(bibleBook,3,'en'),'https://bible.usccb.org/bible/john/3');
    assert('fonte es é Latinoamericana',BibleCore.chapterURL(bibleBook,3,'es').includes('es/biblia-latinoamericana/evangelio-segun-san-juan/3/'));
    assertEq('limites próprios da edição',BibleCore.chapterURL({...bibleBook,chaptersByLocale:{en:2}},3,'en'),null);

    // ========================================================
    group('BlockerCore — perfis');
    // ========================================================

    const socialProfile = BlockerCore.normalizeProfile({
        id: 'social',
        name: 'Redes sociais',
        enabled: true,
        sites: ['instagram.com', 'x.com', 'reddit.com', 'tiktok.com'],
        rules: {
            duringFocus: true,
            schedule: { enabled: true, from: '22:00', to: '07:00', days: [1, 2, 3, 4, 5] },
            dailyLimitMin: 30,
            temporaryAccess: { enabled: true, minutes: 5, perDay: 3 }
        }
    });
    const videoProfile = BlockerCore.normalizeProfile({
        id: 'video',
        name: 'Vídeos',
        enabled: true,
        sites: ['youtube.com', 'twitch.tv'],
        rules: {
            duringFocus: true,
            schedule: { enabled: false, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
            dailyLimitMin: 45,
            temporaryAccess: { enabled: false, minutes: 5, perDay: 3 }
        }
    });
    const disabledProfile = BlockerCore.normalizeProfile({
        id: 'news',
        name: 'Notícias',
        enabled: false,
        sites: ['g1.globo.com', 'folha.uol.com.br'],
        rules: { duringFocus: true }
    });

    // Construção de regras DNR a partir de múltiplos perfis; perfil desmarcado não gera regra (M10)
    const rulesAllActive = BlockerCore.buildRulesFromProfiles([socialProfile, videoProfile, disabledProfile], 'chrome-extension://id/blocked.html');
    const redirectedDomains = rulesAllActive
        .filter(r => r.action && r.action.type === 'redirect')
        .flatMap(r => r.condition.requestDomains);
    assert('buildRulesFromProfiles inclui sites dos perfis marcados',
        redirectedDomains.includes('instagram.com') && redirectedDomains.includes('youtube.com'));
    assert('perfil desmarcado não gera regra DNR (M10)',
        !redirectedDomains.includes('g1.globo.com') && !redirectedDomains.includes('folha.uol.com.br'));

    // Construção contextual (quarta 14h20 sem foco: nada bloqueado; com foco: bloqueia)
    const wedAfternoon = new Date(2026, 10, 4, 14, 20); // Quarta-feira 14:20
    const rulesIdleAfternoon = BlockerCore.buildRulesFromProfiles([socialProfile, videoProfile, disabledProfile], {
        blockedPageUrl: 'chrome-extension://id/blocked.html',
        now: wedAfternoon,
        focusActive: false
    });
    assertEq('fora do foco e fora do horário: zero regras de redirecionamento',
        rulesIdleAfternoon.filter(r => r.action && r.action.type === 'redirect').length, 0);

    const rulesFocusAfternoon = BlockerCore.buildRulesFromProfiles([socialProfile, videoProfile, disabledProfile], {
        blockedPageUrl: 'chrome-extension://id/blocked.html',
        now: wedAfternoon,
        focusActive: true
    });
    const focusRedirectDomains = rulesFocusAfternoon
        .filter(r => r.action && r.action.type === 'redirect')
        .flatMap(r => r.condition.requestDomains);
    assert('em foco: bloqueia perfis marcados com duringFocus e ignora perfil desmarcado',
        focusRedirectDomains.includes('instagram.com') &&
        focusRedirectDomains.includes('youtube.com') &&
        !focusRedirectDomains.includes('g1.globo.com'));

    // Consequência respeita os dias da semana do horário (M06: sexta à noite com regra seg–sex diz segunda, nunca amanhã)
    const friNight = new Date(2026, 10, 6, 20, 0); // Sexta-feira 20:00
    const satMorning = new Date(2026, 10, 7, 10, 30); // Sábado 10:30
    const friWeekdayProfile = BlockerCore.normalizeProfile({
        id: 'work',
        name: 'Redes sociais',
        enabled: true,
        sites: ['instagram.com'],
        rules: {
            duringFocus: false,
            schedule: { enabled: true, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] },
            dailyLimitMin: null,
            temporaryAccess: { enabled: false }
        }
    });
    assert('regra de horário só de segunda a sexta não bloqueia no sábado',
        !BlockerCore.isScheduleBlocking(friWeekdayProfile.rules.schedule, satMorning) &&
        !BlockerCore.evaluateProfile(friWeekdayProfile, {}, satMorning).blocked);
    const friConseq = BlockerCore.describeConsequence(friWeekdayProfile, friNight);
    assert('sexta à noite com regra seg–sex diz "segunda às 09:00" (M06)',
        friConseq.includes('segunda às 09:00') && !friConseq.includes('amanhã'));

    // Limite diário atingido bloqueia até 0h
    const limitReachedEval = BlockerCore.evaluateProfile(videoProfile, { usageByProfile: { video: 45 } }, wedAfternoon);
    assert('limite diário atingido bloqueia até 0h',
        limitReachedEval.blocked && limitReachedEval.reason === 'limit' && limitReachedEval.untilTime === '0:00');

    // Horário cruzando a meia-noite
    const wedLate = new Date(2026, 10, 4, 23, 15); // Quarta 23:15
    const thuEarly = new Date(2026, 10, 5, 6, 30); // Quinta 06:30
    assert('horário cruzando meia-noite bloqueia às 23:15',
        BlockerCore.isScheduleBlocking(socialProfile.rules.schedule, wedLate));
    assert('horário cruzando meia-noite bloqueia às 06:30',
        BlockerCore.isScheduleBlocking(socialProfile.rules.schedule, thuEarly));
    assert('horário cruzando meia-noite libera às 12:00',
        !BlockerCore.isScheduleBlocking(socialProfile.rules.schedule, wedAfternoon));

    // nextChange retorna a próxima transição
    const nextAtAfternoon = BlockerCore.nextChange([socialProfile, videoProfile], wedAfternoon);
    assertEq('nextChange anuncia próximo bloqueio às 22h',
        nextAtAfternoon, 'Redes sociais serão bloqueadas às 22h');
    const nextAtNight = BlockerCore.nextChange([socialProfile], wedLate);
    assertEq('nextChange dentro da janela anuncia liberação às 7h',
        nextAtNight, 'Redes sociais serão liberadas às 7h');

    // Contador de acessos temporários por dia (3º permitido, 4º negado)
    let tempProf = BlockerCore.normalizeProfile(socialProfile);
    assertEq('começa com 3 acessos restantes', BlockerCore.remainingTemporaryAccesses(tempProf, wedAfternoon), 3);
    assert('1º acesso permitido', BlockerCore.canUseTemporaryAccess(tempProf, wedAfternoon));
    let rTemp = BlockerCore.consumeTemporaryAccess(tempProf, wedAfternoon, 'responder mensagem');
    assert('1º consumo aprovado', rTemp.allowed && rTemp.remaining === 2);
    tempProf = rTemp.profile;
    rTemp = BlockerCore.consumeTemporaryAccess(tempProf, wedAfternoon);
    assert('2º consumo aprovado', rTemp.allowed && rTemp.remaining === 1);
    tempProf = rTemp.profile;
    assert('3º acesso ainda é permitido', BlockerCore.canUseTemporaryAccess(tempProf, wedAfternoon));
    rTemp = BlockerCore.consumeTemporaryAccess(tempProf, wedAfternoon);
    assert('3º consumo aprovado e zera restantes', rTemp.allowed && rTemp.remaining === 0);
    tempProf = rTemp.profile;
    assert('4º acesso no mesmo dia é negado', !BlockerCore.canUseTemporaryAccess(tempProf, wedAfternoon));
    rTemp = BlockerCore.consumeTemporaryAccess(tempProf, wedAfternoon);
    assert('4º consumo retorna allowed: false', !rTemp.allowed && rTemp.remaining === 0);
    const nextDayMorning = new Date(2026, 10, 5, 9, 0);
    assert('no dia seguinte o contador volta a permitir (3 restantes)',
        BlockerCore.canUseTemporaryAccess(tempProf, nextDayMorning) &&
        BlockerCore.remainingTemporaryAccesses(tempProf, nextDayMorning) === 3);

    // ========================================================
    group('MigrateCore — bloqueador');
    // ========================================================

    const legacyBlockerSnap = {
        blocker_sites: ['reddit.com', 'https://www.tiktok.com/'],
        blocker_config: {
            enabled: true,
            reenableAt: null,
            lock: { enabled: true, verseIndex: 2 },
            sites: [
                { id: 1, url: 'instagram.com', mode: 'always', accessLimit: { enabled: false }, scheduleLimit: { enabled: false } },
                {
                    id: 2,
                    url: 'youtube.com',
                    mode: 'limited',
                    accessLimit: { enabled: true, count: 3, period: 'day' },
                    scheduleLimit: { enabled: true, fromHour: 22, fromMinute: 0, toHour: 7, toMinute: 0 },
                    todayAccesses: 1,
                    lastAccessDate: '2026-11-03'
                }
            ]
        }
    };
    const migBlocker = MigrateCore.migrate(legacyBlockerSnap, { now: NOW2 });
    const afterBlocker = MigrateCore.apply(legacyBlockerSnap, migBlocker);
    assert('remove blocker_sites após migrar para perfis', !('blocker_sites' in afterBlocker) && migBlocker.removals.includes('blocker_sites'));
    assertEq('cria o perfil único "Meus sites"', afterBlocker.blocker_config.profiles.length, 1);
    const meusSites = afterBlocker.blocker_config.profiles[0];
    assertEq('nome e id do perfil migrado', [meusSites.id, meusSites.name], ['meus-sites', 'Meus sites']);
    assertEq('une sites de blocker_config e blocker_sites sem duplicatas',
        meusSites.sites, ['instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com']);
    assertEq('converte janela de horário para HH:MM',
        [meusSites.rules.schedule.enabled, meusSites.rules.schedule.from, meusSites.rules.schedule.to],
        [true, '22:00', '07:00']);
    assertEq('preserva acessos temporários usados no dia',
        [meusSites.tempAccess.date, meusSites.tempAccess.count], ['2026-11-03', 1]);

    { // fase 5: escopo próprio para os nomes locais
    // ========================================================
    group('FrutosCore — períodos');
    // ========================================================

    const FC = FrutosCore;
    const WED = new Date(2026, 10, 4, 10, 0); // quarta, 04/11/2026
    const week = FC.periodRange('semana', WED, 0);
    assertEq('semana vai de segunda a domingo', [week.startIso, week.lastIso, week.days.length], ['2026-11-02', '2026-11-08', 7]);
    assertEq('semana anterior', FC.periodRange('semana', WED, -1).startIso, '2026-10-26');
    const october = FC.periodRange('mes', WED, -1);
    assertEq('mês anterior é outubro inteiro', [october.startIso, october.lastIso, october.days.length], ['2026-10-01', '2026-10-31', 31]);
    const march = FC.periodRange('mes', new Date(2026, 2, 15), 0);
    assertEq('março (virada do horário de verão nos EUA/Europa) tem 31 dias distintos', [march.days.length, new Set(march.days).size], [31, 31]);
    const dstWeek = FC.periodRange('semana', new Date(2026, 9, 28), 0);
    assertEq('semana com fim do horário de verão (01/11) tem 7 dias distintos', [dstWeek.days.length, new Set(dstWeek.days).size, dstWeek.lastIso], [7, 7, '2026-11-01']);
    const febLeap = FC.periodRange('mes', new Date(2028, 1, 10), 0);
    assertEq('fevereiro de ano bissexto', febLeap.days.length, 29);

    // ========================================================
    group('FrutosCore — síntese e dias');
    // ========================================================

    const at10 = (d, h, m) => new Date(2026, 10, d, h || 10, m || 0).getTime();
    const emptyWeek = FC.summarize(week, { sessions: [], practices: [], exams: [], screentime: {}, now: WED });
    assert('semana sem registros → síntese vazia', emptyWeek.empty && FC.synthesisParts(emptyWeek).length === 0);
    assert('dias passados sem registro ficam neutros ("none")', emptyWeek.days.slice(0, 3).every(d => d.none && !d.future));
    assertEq('dias depois de hoje são futuros', emptyWeek.days.map(d => d.future), [false, false, false, true, true, true, true]);
    assert('hoje é marcado', emptyWeek.days[2].today);

    const sessionsWeek = [
        { id: 's1', startedAt: at10(2, 9), endedAt: at10(2, 9, 25), plannedMin: 25, focusedMin: 25, status: 'completed' },
        { id: 's2', startedAt: at10(3, 14), endedAt: at10(3, 14, 12), plannedMin: 25, focusedMin: 12, status: 'interrupted' },
        { id: 's3', startedAt: at10(4, 8), endedAt: at10(4, 8, 50), plannedMin: 50, focusedMin: 50, status: 'completed' },
        { id: 'old', startedAt: at10(1, 9), plannedMin: 25, focusedMin: 25, status: 'completed' } // domingo da semana anterior
    ];
    const withSessions = FC.summarize(week, { sessions: sessionsWeek, now: WED });
    assertEq('sessão interrompida soma os minutos focados', [withSessions.totals.focusMin, withSessions.totals.sessions, withSessions.totals.interrupted], [87, 3, 1]);
    assertEq('minutos por dia', withSessions.days.slice(0, 3).map(d => d.focusMin), [25, 12, 50]);
    assertEq('síntese: sessões e minutos', FC.synthesisParts(withSessions), [{ kind: 'sessions', n: 3, minutes: 87 }]);

    const imported = FC.summarize(week, { sessions: [{ id: 'imported-2026-11-02', imported: true, date: '2026-11-02', startedAt: null, focusedMin: 40, status: 'completed' }], now: WED });
    assertEq('totais importados da 1.1.5 contam minutos, não sessões', [imported.totals.focusMin, imported.totals.sessions], [40, 0]);
    assertEq('síntese sem sessões contadas usa só o tempo', FC.synthesisParts(imported), [{ kind: 'focus', minutes: 40 }]);

    const rosaryTwice = FC.summarize(week, { practices: [{ type: 'rosary', at: at10(3, 7) }, { type: 'rosary', at: at10(3, 21) }], now: WED });
    assertEq('terço em 2 momentos do mesmo dia conta 1 dia', [rosaryTwice.totals.rosaryDays, rosaryTwice.totals.prayerDays], [1, 1]);
    const prayersMix = FC.summarize(week, { practices: [{ type: 'rosary', at: at10(2) }, { type: 'prayer', id: 'angelus', at: at10(3) }, { type: 'respiro', at: at10(4) }], now: WED });
    assertEq('outras orações aparecem além do terço', FC.synthesisParts(prayersMix), [{ kind: 'rosary', n: 1 }, { kind: 'prayer', n: 3 }]);

    const examLogs = [{ id: 'exam-1', type: 'night', date: new Date(at10(2, 22)).toISOString() }, { id: 'exam-old', type: 'night', date: '2026-10-20T22:00:00.000Z' }];
    const examPractices = [{ type: 'exam', ref: 'exam-1', at: at10(2, 22) }, { type: 'night', at: at10(2, 22, 30) }, { type: 'night', at: at10(3, 22) }];
    const exams = FC.summarize(week, { practices: examPractices, exams: examLogs, now: WED });
    assertEq('exame no log e no registro conta uma vez; ritual da noite no mesmo dia não soma outro', exams.totals.exams, 2);
    assertEq('ritual da noite sozinho conta como exame da noite', [exams.days[1].exam, exams.days[1].exams], [true, 1]);

    const screenOnly = FC.summarize(week, { screentime: { '2026-11-02': { domains: { 'a.com': 600 } } }, now: WED });
    assert('tempo de tela sozinho não transforma o dia em registro', screenOnly.empty && screenOnly.days[0].none && screenOnly.days[0].screenSec === 600);

    const novMonth = FC.periodRange('mes', WED, 0);
    const monthSummary = FC.summarize(novMonth, { sessions: sessionsWeek, now: WED });
    assertEq('mês: nível do foco por dia, sem nota', [FC.monthLevel(monthSummary.days[1]), FC.monthLevel(monthSummary.days[2]), FC.monthLevel(monthSummary.days[3]), FC.monthLevel(emptyWeek.days[0]), FC.monthLevel(monthSummary.days[10])], ['f1', 'f1', 'f2', 'none', 'fut']);
    assertEq('"Dias com Ora" vem do contador que nunca zera', FC.summarize(week, { sessions: sessionsWeek, tasks: [{ id: 't', completedAt: at10(5) }], now: WED }).daysWithOra, 5);

    // ========================================================
    group('FrutosCore — registro de práticas e reflexões');
    // ========================================================

    let log = FC.appendPractice([], { type: 'prayer', id: 'angelus', at: at10(4, 12) });
    log = FC.appendPractice(log, { type: 'prayer', id: 'angelus', at: at10(4, 18) });
    log = FC.appendPractice(log, { type: 'prayer', id: 'salve-rainha', at: at10(4, 18) });
    assertEq('a mesma oração aberta duas vezes no dia vira um registro', log.length, 2);
    log = FC.appendPractice(log, { type: 'rosary', at: at10(4, 19) });
    log = FC.appendPractice(log, { type: 'rosary', at: at10(4, 20) });
    assertEq('terços do mesmo dia ficam registrados (o dia conta uma vez)', log.filter(e => e.type === 'rosary').length, 2);
    log = FC.appendPractice(log, { type: 'night', at: at10(4, 22) });
    log = FC.appendPractice(log, { type: 'night', at: at10(4, 23) });
    assertEq('ritual da noite: um por dia', log.filter(e => e.type === 'night').length, 1);
    assertEq('tipo desconhecido é ignorado', FC.appendPractice(log, { type: 'xyz', at: at10(4) }).length, log.length);
    assert('evento guarda só { type, at, id?, ref? }', Object.keys(log[0]).every(k => ['type', 'at', 'id', 'ref'].includes(k)));

    const key = FC.reflectionKey(week);
    assertEq('chave da reflexão pelo período', key, 'semana:2026-11-02');
    let reflections = FC.upsertReflection([], { key, kind: 'semana', start: week.startIso, last: week.lastIso, question: 'Q1', text: '  Primeira  ', savedAt: 1 });
    reflections = FC.upsertReflection(reflections, { key, kind: 'semana', start: week.startIso, last: week.lastIso, question: 'Q2', text: 'Revista', savedAt: 2 });
    assertEq('guardar de novo substitui a reflexão do mesmo período', [reflections.length, reflections[0].text, reflections[0].question], [1, 'Revista', 'Q2']);
    reflections = FC.upsertReflection(reflections, { key: 'semana:2026-10-26', kind: 'semana', start: '2026-10-26', last: '2026-11-01', question: 'Q', text: 'Anterior' });
    reflections = FC.upsertReflection(reflections, { key: 'semana:2026-10-19', kind: 'semana', start: '2026-10-19', last: '2026-10-25', question: 'Q', text: 'Mais antiga' });
    assertEq('semanas anteriores: mais recente primeiro, sem a atual', FC.pastReflections(reflections, key).map(r => r.text), ['Anterior', 'Mais antiga']);
    assertEq('texto vazio apaga a reflexão do período', FC.upsertReflection(reflections, { key, text: '   ' }).length, 2);
    assertEq('a pergunta é a mesma durante a semana', FC.questionIndex(week, 6), FC.questionIndex(FC.periodRange('semana', new Date(2026, 10, 8), 0), 6));
    assert('"Outra pergunta" troca a pergunta', FC.questionIndex(week, 6, 1) !== FC.questionIndex(week, 6, 0));

    // ========================================================
    group('RitualsCore — convites e rascunhos');
    // ========================================================

    const RC = RitualsCore;
    const N = (d, h, m) => new Date(2026, 10, d, h, m || 0);
    assert('manhã: convite às 7h', RC.morningInvite({ now: N(4, 7) }));
    assert('manhã: some com sessão ativa', !RC.morningInvite({ now: N(4, 7), sessionActive: true }));
    assert('manhã: some depois de um foco hoje', !RC.morningInvite({ now: N(4, 9), focusedToday: true }));
    assert('manhã: some depois das 12h', !RC.morningInvite({ now: N(4, 12) }));
    let rituals = RC.markDone({}, 'manha', N(4, 7, 30), { priority: 'Relatório', minutes: 50 });
    assert('manhã: não volta depois de feita', !RC.morningInvite({ now: N(4, 8), rituals }));
    assert('noite: não aparece às 20h', !RC.nightInvite({ now: N(4, 20) }));
    assert('noite: aparece depois das 21h', RC.nightInvite({ now: N(4, 21, 30) }));
    rituals = RC.markDone(rituals, 'noite', N(4, 22), { gratitude: 'O café', reflection: '' });
    assert('noite: não aparece se o ritual já foi feito', !RC.nightInvite({ now: N(4, 23), rituals }));
    assert('noite: de madrugada ainda vale o dia anterior (já feito)', !RC.nightInvite({ now: N(5, 1), rituals }));
    assert('noite: madrugada sem ritual feito ainda convida', RC.nightInvite({ now: N(6, 1), rituals }));
    assertEq('ritualDay: 1h pertence ao dia anterior', RC.ritualDay(N(5, 1)), '2026-11-04');
    assertEq('convites escondidos pelos rituais feitos', RC.hiddenInvites({ now: N(4, 22), rituals }), ['morning', 'closeDay']);
    assertEq('com o ritual da manhã escondido, o convite das 7h passa para o Angelus',
        RemindersCore.pickInvite({ now: N(4, 7), skip: RC.hiddenInvites({ now: N(4, 7), rituals }) }).id, 'angelus');
    assertEq('sem ritual feito, o convite das 7h é o da manhã', RemindersCore.pickInvite({ now: N(4, 7) }).id, 'morning');
    assertEq('ritual da noite feito esconde "Encerrar o dia"',
        RemindersCore.pickInvite({ now: N(4, 22), skip: RC.hiddenInvites({ now: N(4, 22), rituals }) }), null);
    assertEq('reflexões da noite ficam guardadas', RC.nightEntries(rituals).map(e => e.noite.gratitude), ['O café']);

    let drafts = RC.withDraft({}, 'noite', N(4, 21, 40), { step: 1, answers: ['Pela família', 'Na conversa'] });
    assertEq('rascunho restaurado ao reabrir no mesmo dia', RC.draftFor(drafts, 'noite', N(4, 23, 50)).answers, ['Pela família', 'Na conversa']);
    assertEq('rascunho da noite continua de madrugada', RC.draftFor(drafts, 'noite', N(5, 0, 30)).step, 1);
    assertEq('rascunho de outro dia não volta', RC.draftFor(drafts, 'noite', N(5, 21, 30)), null);
    assertEq('rascunho removido depois de concluir', RC.draftFor(RC.withoutDraft(drafts, 'noite'), 'noite', N(4, 22)), null);

    // ========================================================
    group('RitualsCore — prioridade da manhã e proteção da noite');
    // ========================================================

    const morningTasks = [
        { id: 'a', title: 'Ler e-mails', list: 'hoje', order: 0, createdAt: 1 },
        { id: 'b', title: 'Relatório', list: 'hoje', order: 1, createdAt: 2 },
        { id: 'c', title: 'Ligar', list: 'depois', order: 0, createdAt: 3 }
    ];
    const moved = RC.applyMorningPriority(morningTasks, { taskId: 'b', title: 'Relatório', minutes: 50 }, N(4, 7));
    assertEq('a prioridade escolhida vira o próximo passo com a duração escolhida (M02)',
        [TasksCore.nextStep(moved.tasks).id, TasksCore.nextStep(moved.tasks).estimateMin, moved.taskId], ['b', 50, 'b']);
    const created = RC.applyMorningPriority(morningTasks, { title: 'Preparar aula', minutes: 25, id: 'task-new' }, N(4, 7));
    assertEq('"Outra coisa" cria a tarefa no topo de Hoje', [TasksCore.nextStep(created.tasks).title, TasksCore.nextStep(created.tasks).estimateMin, created.taskId], ['Preparar aula', 25, 'task-new']);
    assertEq('prioridade vazia não cria nada', RC.applyMorningPriority(morningTasks, { title: '  ' }, N(4, 7)).tasks.length, 3);

    const nightProfiles = [
        { id: 'redes', name: 'Redes sociais', enabled: true, sites: ['instagram.com'], rules: { schedule: { enabled: true, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
        { id: 'off', name: 'Desligado', enabled: false, sites: ['x.com'], rules: { schedule: { enabled: true, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] } } },
        { id: 'manha', name: 'Notícias', enabled: true, sites: ['g1.com'], rules: { schedule: { enabled: true, from: '09:00', to: '12:00', days: [0, 1, 2, 3, 4, 5, 6] } } }
    ];
    assertEq('21h30: redes começam às 22h e vão até 7h', RC.nightProtection(nightProfiles, N(4, 21, 30)), [{ name: 'Redes sociais', active: false, from: '22:00', to: '07:00' }]);
    assertEq('23h: regra em vigor até 7h', RC.nightProtection(nightProfiles, N(4, 23)).map(p => [p.active, p.to]), [[true, '07:00']]);
    assertEq('Proteção desligada: nada a anunciar', RC.nightProtection(nightProfiles, N(4, 23), { enabled: false }), []);

    // ========================================================
    group('ScreentimeCore — por domínio e período');
    // ========================================================

    const stStore = {
        '2026-11-02': { domains: { 'youtube.com': 1800, 'docs.google.com': 600 }, newTabs: 5 },
        '2026-11-03': { domains: { 'youtube.com': 600, 'wikipedia.org': 300 }, newTabs: 2 },
        '2026-10-20': { domains: { 'old.com': 9999 }, newTabs: 1 }
    };
    const agg = ScreentimeCore.aggregate(stStore, week.days);
    assertEq('soma por domínio só dentro do período', agg.domains.map(d => [d.domain, d.sec]), [['youtube.com', 2400], ['docs.google.com', 600], ['wikipedia.org', 300]]);
    assertEq('total, dias com registro, média e novas abas', [agg.totalSec, agg.recordedDays, agg.avgSec, agg.newTabs], [3300, 2, 1650, 7]);
    const allowedKeys = ['domain', 'sec', 'share'];
    assert('sem classificar domínios em bom/ruim nem comparar com metas', agg.domains.every(d => Object.keys(d).every(k => allowedKeys.includes(k))) && !('delta' in agg) && !('status' in agg));
    const top = ScreentimeCore.topDomains(agg.domains, 2);
    assertEq('demais domínios somados em "outros"', [top.top.length, top.otherSec, top.otherCount], [2, 300, 1]);
    assertEq('período sem dados', ScreentimeCore.aggregate({}, week.days).totalSec, 0);
    assertEq('poda mantém os últimos 62 dias', Object.keys(ScreentimeCore.prune({ '2026-09-03': {}, '2026-09-04': {}, '2026-11-04': {} }, new Date(2026, 10, 4))), ['2026-09-04', '2026-11-04']);

    }

    group('SoundCore — links e preferências');
    const video = { source: 'youtube', idType: 'video', externalId: 'c79SszUBZUE' };
    const album = { source: 'spotify', idType: 'album', externalId: '0sNOF9WDwhWunNAHPD3Baj' };
    assertEq('YouTube curto', SoundCore.parseLink('https://youtu.be/c79SszUBZUE?si=example'), video);
    assertEq('YouTube Music prioriza a lista', SoundCore.parseLink('music.youtube.com/watch?v=c79SszUBZUE&list=PL_123'), {
        source: 'youtube', idType: 'playlist', externalId: 'PL_123'
    });
    assertEq('Spotify aceita URI e URL localizada', [
        SoundCore.parseLink('spotify:album:0sNOF9WDwhWunNAHPD3Baj'),
        SoundCore.parseLink('https://open.spotify.com/intl-pt/album/0sNOF9WDwhWunNAHPD3Baj?si=example')
    ], [album, album]);
    assertEq('rejeita falso provedor e protocolos inválidos', [
        SoundCore.parseLink('https://youtube.com.example/watch?v=c79SszUBZUE'),
        SoundCore.parseLink('https://youtube.com@evil.test/watch?v=c79SszUBZUE'),
        SoundCore.parseLink('ftp://open.spotify.com/track/x'),
        SoundCore.parseLink('https://youtube.com/watch?v=short')
    ], [null, null, null, null]);
    const playlists = [{ id: 'old', ...video }];
    assertEq('restaura identificador legado de playlist', SoundCore.preference('old', playlists).choice, { kind: 'playlist', id: 'old' });
    assertEq('playlist removida volta ao silêncio', SoundCore.preference('removed', playlists).choice, { kind: 'silence' });
    assertEq('restaura volume e restringe a mistura a três camadas válidas', SoundCore.preference({
        choice: { kind: 'ambient', layers: [
            { id: 'unknown', volume: 100 }, { id: 'rain', volume: -5 },
            { id: 'rain', volume: 50 }, { id: 'bells', volume: 140 }, { id: 'fire', volume: 60 },
            { id: 'church', volume: 30 }
        ] }, volume: 42, pauseWithFocus: true
    }, playlists), {
        choice: { kind: 'ambient', layers: [{ id: 'rain', volume: 0 }, { id: 'bells', volume: 100 }, { id: 'fire', volume: 60 }] },
        volume: 42, pauseWithFocus: true, playerHidden: false
    });
    assertEq('lembra o player oculto', SoundCore.preference({ playerHidden: true }, playlists).playerHidden, true);

    group('SoundCore — capas');
    const spotifyList = { source: 'spotify', idType: 'playlist', externalId: '37i9dQZF1DWZeKCadgRdKQ' };
    const ytVideo = { source: 'youtube', idType: 'video', externalId: 'c79SszUBZUE' };
    assertEq('oEmbed do Spotify', SoundCore.oembedUrl(spotifyList),
        'https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ'));
    assertEq('oEmbed do YouTube', SoundCore.oembedUrl(ytVideo),
        'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=c79SszUBZUE'));
    assertEq('chave da mídia', SoundCore.mediaKey(ytVideo), 'youtube:video:c79SszUBZUE');
    assertEq('capa do Spotify aceita', SoundCore.coverUrl('https://i.scdn.co/image/ab67'), 'https://i.scdn.co/image/ab67');
    assertEq('capa de álbum aceita', SoundCore.coverUrl('https://image-cdn-ak.spotifycdn.com/image/x'), 'https://image-cdn-ak.spotifycdn.com/image/x');
    assertEq('YouTube troca hqdefault por mqdefault', SoundCore.coverUrl('https://i.ytimg.com/vi/abc/hqdefault.jpg'), 'https://i.ytimg.com/vi/abc/mqdefault.jpg');
    assertEq('host desconhecido recusado', SoundCore.coverUrl('https://evil.example/x.jpg'), null);
    assertEq('http recusado', SoundCore.coverUrl('http://i.scdn.co/image/x'), null);
    assertEq('lixo recusado', SoundCore.coverUrl(undefined), null);
    assertEq('resultado do oEmbed', SoundCore.artwork(spotifyList, { title: ' Deep Focus ', thumbnail_url: 'https://i.scdn.co/image/a' }, 5),
        { cover: 'https://i.scdn.co/image/a', title: 'Deep Focus', at: 5 });
    assertEq('vídeo sem oEmbed usa a miniatura direta', SoundCore.artwork(ytVideo, null, 5).cover, 'https://i.ytimg.com/vi/c79SszUBZUE/mqdefault.jpg');
    assertEq('playlist sem oEmbed fica sem capa', SoundCore.artwork(spotifyList, null, 5), { cover: null, title: '', at: 5 });
    const artDay = 24 * 60 * 60 * 1000;
    assert('sem registro busca', SoundCore.artworkStale(undefined, 0));
    assert('capa vale 30 dias', !SoundCore.artworkStale({ cover: 'x', at: 0 }, 29 * artDay) && SoundCore.artworkStale({ cover: 'x', at: 0 }, 31 * artDay));
    assert('falha tenta de novo no dia seguinte', !SoundCore.artworkStale({ cover: null, at: 0 }, artDay / 2) && SoundCore.artworkStale({ cover: null, at: 0 }, 2 * artDay));
    assert('data no futuro busca de novo', SoundCore.artworkStale({ cover: 'x', at: 10 * artDay }, artDay));

    group('SoundCore — ambientes e motor');
    assert('ambientes usam só sons do catálogo e respeitam o limite',
        SoundCore.SCENES.every(scene => scene.layers.length <= SoundCore.MAX_LAYERS
            && scene.layers.every(layer => Object.hasOwn(SoundCore.AMBIENCES, layer.id))));
    assert('cada ambiente tem uma combinação única de camadas',
        SoundCore.SCENES.every((scene, i) => SoundCore.SCENES.findIndex(other => SoundCore.sameLayers(scene, other)) === i));
    assertEq('ambiente reconhecido pelas camadas, em qualquer ordem e volume', SoundCore.sceneOf({
        kind: 'ambient', layers: [{ id: 'rain', volume: 10 }, { id: 'church', volume: 90 }]
    }), 'chapel_rain');
    assertEq('som único é o próprio ambiente; mistura própria não tem ambiente', [
        SoundCore.sceneOf({ kind: 'ambient', layers: [{ id: 'rain', volume: 50 }] }),
        SoundCore.sceneOf({ kind: 'ambient', layers: [{ id: 'rain', volume: 50 }, { id: 'bells', volume: 50 }] }),
        SoundCore.sceneOf({ kind: 'silence' })
    ], ['rain', null, null]);
    const lauds = SoundCore.sceneChoice('lauds');
    lauds.layers[0].volume = 1;
    assertEq('receita do ambiente é copiada (editar não altera o catálogo)',
        SoundCore.sceneChoice('lauds').layers[0].volume, 70);
    assertEq('ambiente desconhecido vira silêncio', SoundCore.sceneChoice('nada'), { kind: 'silence' });

    const ramp = new Float32Array(1000).map((_, i) => i);
    const [looped] = SoundCore.loopCrossfade([ramp], 100, 1);
    assertEq('emenda encurta o trecho pelo tamanho do fade', looped.length, 900);
    assert('emenda: o início continua o fim e o meio fica intacto',
        Math.abs(looped[0] - 900) < 1e-3 && looped[100] === 100 && looped[899] === 899);
    const short = [new Float32Array(3)];
    assert('trecho curto demais volta sem mudança', SoundCore.loopCrossfade(short, 100, 1) === short);

    const wav = SoundCore.silentWav(0.5, 8000);
    const header = String.fromCharCode(...wav.slice(0, 4)) + String.fromCharCode(...wav.slice(8, 12));
    assertEq('WAV de silêncio tem cabeçalho e amostras neutras',
        [header, wav.length, wav[44], wav[wav.length - 1]], ['RIFFWAVE', 44 + 4000, 128, 128]);

    group('SettingsCore — preferências e dados');
    const preferences = SettingsCore;
    assertEq('preferências ausentes recebem os padrões', [
        preferences.sanitize('ora_locale'), preferences.sanitize('ora_prayer_lang'), preferences.sanitize('ora_show_saint'),
        preferences.sanitize('ora_reduce_motion'), preferences.sanitize('ora_notification_sound')
    ], ['pt', 'pt', true, false, false]);
    assertEq('idioma de oração pode ser latim, idioma da interface não', [
        preferences.sanitize('ora_locale', 'la'), preferences.sanitize('ora_prayer_lang', 'la')
    ], ['pt', 'la']);
    assertEq('durações fora das opções voltam ao padrão', [
        preferences.duration('focus', 42), preferences.duration('pause', '999'), preferences.duration('longPause', -2)
    ], [25, 5, 15]);
    assertEq('durações válidas são aceitas', [
        preferences.duration('focus', '90'), preferences.duration('pause', 10), preferences.duration('longPause', 20)
    ], [90, 10, 20]);
    const savedData = {
        ora_tasks: [{ id: 'a' }], ora_sessions: [{ id: 'b' }], ora_reflections: [{ text: 'Reflexão' }],
        blocker_config: { profiles: [{ id: 'p', sites: ['example.com'], tempAccess: { count: 2 } }] },
        liturgy_gospel_cache: { fake: true }, ora_sync_meta: { settings: 1 }, catholic_dash_image: 'cache'
    };
    const exported = preferences.exportData(savedData, new Date('2026-11-06T10:00:00Z')).data;
    assertEq('exporta tarefas, sessões, reflexões e perfis', [
        exported.ora_tasks, exported.ora_sessions, exported.ora_reflections, exported.blocker_config.profiles.map(p => p.id)
    ], [savedData.ora_tasks, savedData.ora_sessions, savedData.ora_reflections, ['p']]);
    assert('exportação exclui caches, metadados de sincronização e desbloqueios temporários',
        !('liturgy_gospel_cache' in exported) && !('ora_sync_meta' in exported) &&
        !('catholic_dash_image' in exported) && !('tempAccess' in exported.blocker_config.profiles[0]));
    const cleaned = preferences.clearReflections({
        ora_rituals: { '2026-11-06': { manha: { doneAt: 1 }, noite: { doneAt: 2, gratitude: 'x', reflection: 'y' } } },
        ora_ritual_draft: { manha: { step: 1 }, noite: { answers: ['x'] } },
        ora_exam_logs: [{ id: 'x', type: 'night', date: '2026-11-06', answers: ['x'] }]
    });
    assertEq('exclui respostas e rascunhos preservando conclusões', cleaned, {
        ora_reflections: [], ora_rituals: { '2026-11-06': { manha: { doneAt: 1 }, noite: { doneAt: 2 } } },
        ora_ritual_draft: { manha: { step: 1 } },
        ora_exam_logs: [{ id: 'x', type: 'night', date: '2026-11-06T00:00:00.000Z' }], ora_exam_draft: null
    });
    const offlineDate = new Date(2026, 10, 6);
    const offlineDay = LiturgyCore.dateKey(offlineDate);
    const offlineCache = LiturgyCore.merge(null, { [offlineDay]: { pt: { date: offlineDay, text: 'João', ref: 'Jo 1' } } }, offlineDate);
    const offline = preferences.offlineInfo(offlineCache, offlineDate);
    assertEq('cache offline conta somente os dias com texto', [offline.available, offline.total], [1, 7]);
    assert('tamanho usa bytes UTF-8', offline.bytes > JSON.stringify(offlineCache).length);

    group('OnboardingCore — instalação e atualização');
    assertEq('instalação limpa apresenta as cinco etapas', OnboardingCore.mode({ ora_schema_version: 2 }), 'full');
    const old = { ora_onboarding_done: true, ora_focus_settings: '{"focus":25}' };
    const upgraded = MigrateCore.apply(old, MigrateCore.migrate(old));
    assertEq('atualização conserva a indicação depois da migração', OnboardingCore.mode(upgraded), 'update');
    assertEq('concluído não abre novamente', OnboardingCore.mode({ ...upgraded, [OnboardingCore.DONE_KEY]: true }), null);
    assertEq('exame atual não é confundido com atualização da 1.1.5',
        OnboardingCore.mode({ ora_onboarding_done: true, ora_schema_version: 2, 'ora_exam_done_Fri Nov 06 2026': true }), null);

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
