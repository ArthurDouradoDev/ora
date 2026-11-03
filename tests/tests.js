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

        assertEq('chaves do bloqueador ficam intactas', after1.blocker_config, snap115.blocker_config);
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
    assertEq('11h30: só o exame do meio-dia', RemindersCore.pickInvite({ now: R(11, 30) }).id, 'midday');
    assertEq('15h10: Terço da Misericórdia', RemindersCore.pickInvite({ now: R(15, 10) }).id, 'mercy');
    assertEq('21h10: Encerrar o dia', RemindersCore.pickInvite({ now: R(21, 10) }).id, 'closeDay');
    assertEq('10h: nenhum convite', RemindersCore.pickInvite({ now: R(10) }), null);
    assertEq('sessão ativa: nenhum convite', RemindersCore.pickInvite({ now: R(12, 30), sessionActive: true }), null);

    const angelusNoon = RemindersCore.pickInvite({ now: R(12, 30) });
    let handled = RemindersCore.dismiss({}, angelusNoon, R(12, 30));
    assertEq('"Agora não" no Angelus deixa a vez para o próximo', RemindersCore.pickInvite({ now: R(12, 40), handled }).id, 'midday');
    handled = RemindersCore.dismiss(handled, RemindersCore.pickInvite({ now: R(12, 40), handled }), R(12, 40));
    assertEq('com os dois adiados, nada às 12h50', RemindersCore.pickInvite({ now: R(12, 50), handled }), null);
    assertEq('"Agora não" adia só até o próximo horário (18h)', RemindersCore.pickInvite({ now: R(18, 5), handled }).id, 'angelus');
    assertEq('desligado nas configurações não aparece', RemindersCore.pickInvite({ now: R(15, 10), enabled: { mercy: false } }), null);
    assertEq('oração de abertura espera um convite com horário', RemindersCore.pickInvite({ now: R(12, 30), carloPending: true }).id, 'angelus');
    assertEq('oração de abertura aparece fora dos horários', RemindersCore.pickInvite({ now: R(10), carloPending: true }).id, 'carlo');
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
