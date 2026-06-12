# Implementação — Bloqueador, Tarefas e Visão Geral

Resultado da rodada de melhorias aprovada. Organizado pelos 3 tópicos para facilitar
os commits. **Sugestão de ordem de commit: Visão Geral → Bloqueador → Tarefas**,
porque o Bloqueador depende dos módulos compartilhados criados na Visão Geral.

> ⚠️ **Arquivos com mudanças de mais de um tópico** (se quiser commits 100% separados,
> use `git add -p`): `sw.js` (Visão Geral + Bloqueador), `ora.html` (Bloqueador + Tarefas),
> `data/i18n/*.json` (Bloqueador + Tarefas).

---

## 1. Visão Geral (fundação)

### 1.1 Módulos compartilhados — fim da lógica triplicada
- **`scripts/shared/blocker-core.js`** (novo): `DOMAIN_ALIASES`, exceções OAuth,
  `isWithinBlockedSchedule`, `minutesUntilBlockedWindow`, `matchesSiteOrAlias`,
  `extractDomain`, `hashCode`/`allowRuleIdFor`, `buildAllowRules`, `buildBlockRules`.
  Funções puras, sem `chrome.*` nem DOM — fonte única usada por `blocker.js`,
  `blocked.js` e `sw.js` (via `importScripts`).
- **`scripts/shared/pomodoro-core.js`** (novo): `getPhaseDuration`, `advancePhase`,
  `getDefaultSettings` e `applyDayRollover` (a lógica de virada de dia, agora testável).
- `sw.js`, `scripts/modules/blocker.js` e `scripts/blocked.js` refatorados para usar
  os módulos compartilhados (as cópias locais foram removidas).
- `ora.html` e `blocked.html` carregam `scripts/shared/blocker-core.js`.

### 1.2 Correção do Pomodoro (resíduos entre dias) — já estava no working tree
- Na virada de dia, o estado é **totalmente** resetado (fase → `focus`, tempo cheio,
  timer parado, alarme cancelado), exceto quando há sessão genuinamente ativa
  cruzando a meia-noite (`expectedEndTime` no futuro), que é preservada.
- Isso também elimina o bug do alarme "fantasma" que completava a fase de ontem na
  inicialização do navegador (incrementando ciclo e somando tempo no dia novo).
- Chaves antigas `ora_focus_total_<data>` são removidas do storage na virada (antes
  acumulavam para sempre).

### 1.3 Sincronização entre dispositivos — `scripts/modules/sync.js` (novo)
- Via `chrome.storage.sync`, last-write-wins com merge conservador. Sincroniza:
  - **Configurações**: idioma, nome, idioma das orações, toggles de lembretes;
  - **Bloqueador**: lista de sites + config da trava (**não** sincroniza o toggle
    ligado/desligado, contadores diários nem pausa temporizada — decisões locais);
  - **Tarefas**: apenas as recorrentes (rotina), preservando o progresso local do dia.
    Streak: vence o lado com a conclusão mais recente.
- Proteções anti-loop: marker `ora_sync_meta` (timestamp aplicado por grupo),
  comparação de payload com o último push e flag `_applying` durante o pull.
- Inicializado por último no `main.js`. Funções de merge são puras e cobertas por testes.
- **Caveat conhecido**: mudança de idioma vinda do sync só aplica na próxima abertura
  da aba (settings.js lê o storage apenas no init).

### 1.4 Suite de testes — `tests/tests.html` + `tests/tests.js` (novos)
- 72 asserções sobre as funções puras: janelas de horário (inclusive cruzando
  meia-noite), aliases de domínio, construção de regras DNR, `advancePhase`,
  `applyDayRollover` (resíduo vs. sessão ativa) e sanitizers/merges do sync.
- Como rodar: abrir `tests/tests.html` no navegador (file:// funciona), ou:
  ```
  node -e "global.self=global;global.window=global;const mkEl=()=>({children:[],appendChild(c){this.children.push(c)}});global.document={getElementById:()=>mkEl(),createElement:()=>mkEl()};const fs=require('fs');eval(fs.readFileSync('scripts/shared/blocker-core.js','utf8'));eval(fs.readFileSync('scripts/shared/pomodoro-core.js','utf8'));eval(fs.readFileSync('scripts/modules/sync.js','utf8'));eval(fs.readFileSync('tests/tests.js','utf8'));"
  ```
- Status atual: **72/72 passando**.

**Arquivos**: `scripts/shared/blocker-core.js`, `scripts/shared/pomodoro-core.js`,
`scripts/modules/sync.js`, `tests/tests.html`, `tests/tests.js`, `sw.js`,
`scripts/blocked.js`, `blocked.html`, `scripts/main.js` (init do sync),
`ora.html` (tags de script).

---

## 2. Bloqueador

### 2.1 Fricção emocional + desativação temporizada
- Desligar o toggle mestre **nunca é direto**. Abre um overlay de pausa contemplativa:
  - Versículo aleatório + pergunta "Por que você quer desativar o bloqueio agora?";
  - Countdown de 10s ("Respire... 10s") antes do botão de desativar habilitar;
  - O usuário **precisa escolher a duração**: 15 min, 30 min, 1 hora ou resto do dia;
  - Botão primário (destacado) é **"Manter bloqueio"** — desativar é o caminho cinza.
- Ao confirmar: `blocker_config.reenableAt` é salvo, regras DNR são removidas, e o
  Service Worker agenda o alarme `blocker_reenable`. **A reativação acontece mesmo
  sem nenhuma aba do Ora aberta** (o SW reconstrói as regras sozinho via BlockerCore).
- Cintos de segurança: se o alarme se perder (navegador fechado), o `blocker.js`
  reativa no próximo load se `reenableAt` já passou.
- Status no modal mostra "Inativo — reativa às HH:MM". Reativar manualmente cancela
  o alarme pendente.

### 2.2 Modo sessão de foco
- Enquanto o pomodoro estiver **rodando em fase de foco**, o bloqueador fica imutável:
  desligar o toggle, remover site, afrouxar modo (sempre→limitado), desativar a trava
  e qualquer edição de limites/horários são recusados com o toast
  "O bloqueador fica travado durante a sessão de foco."
- Apertar (adicionar site, limitado→sempre) continua permitido.

### 2.3 Extras
- `blocker.js` agora reage a mudanças externas do `blocker_config`
  (reativação pelo SW, sync, outra aba): atualiza UI e regras DNR.
- Strings hardcoded do bloqueador migradas para `t()` (pt/en/es).

**Arquivos**: `scripts/modules/blocker.js`, `sw.js` (alarme + mensagens de reativação),
`ora.html` (overlay de fricção), `styles/modules/blocker.css`, `data/i18n/*.json`.

**Como testar**:
1. Ative o bloqueador, tente desligar → overlay aparece, botão habilita após 10s e
   só com duração escolhida.
2. Desative por 15 min → status mostra horário; feche todas as abas do Ora; após o
   período, visite um site bloqueado → deve estar bloqueado de novo.
3. Inicie um pomodoro (fase foco) → tente desligar o bloqueador / remover um site →
   toast de recusa.

---

## 3. Tarefas

### 3.1 Widget na home (substitui a barra de tarefa ativa)
- A home agora mostra as **3 primeiras tarefas pendentes** com checkbox, bolinhas de
  ciclo e botão ▶ para iniciar foco — sem abrir modal. A tarefa ativa é destacada.
- **Ancorado à borda direita** (centro vertical), **retrátil**: o handle lateral
  desliza o widget para fora da tela, deixando só a alça visível. A preferência é
  persistida (`ora_home_widget_collapsed`).
- **Auto-retração**: quando o popup de orações (canto inferior direito) abre, o
  widget se recolhe sozinho e volta ao estado anterior quando o popup fecha.
- Sem tarefas → CTA "Quais são as suas prioridades hoje?" (abre o modal).
- Tudo concluído → "Tudo concluído por hoje 🙌" + link "ver todas (N)".
- O elemento `#active-task-bar` e seu CSS foram removidos (superados pelo widget).

### 3.2 Ritual matinal
- Na **primeira aba do dia**, abre o modal "Planeje seu dia":
  - Saudação com nome (das configurações);
  - Resumo de ontem (tarefas concluídas + tempo de foco, de `ora_daily_stats`);
  - Às segundas: resumo dos últimos 7 dias;
  - Rotina do dia (recorrentes, com streaks 🔥);
  - 3 campos de prioridade → viram tarefas no topo da lista (Enter navega entre eles);
  - "Pular" sempre disponível. Mostra no máximo 1×/dia (`ora_ritual_last_shown`).

### 3.3 Streaks (recorrentes)
- Cada conclusão registra `streak`/`lastStreakDate`; dias consecutivos incrementam,
  pular um dia zera (no reset diário). Desfazer a conclusão no mesmo dia restaura o
  valor anterior. Badge 🔥N aparece (a partir de 2 dias) na lista, no widget e no ritual.

### 3.4 Criação sem fricção
- O seletor de ciclos saiu do formulário de criação — toda tarefa nasce com **1 ciclo**.
- Os ciclos viram ajuste posterior: o formulário de **edição** ganhou o seletor (1–4 🍅).

### 3.5 Estatísticas diárias (`ora_daily_stats`)
- `tasks.js` grava, no reset diário, as tarefas/ciclos concluídos de ontem;
  `sw.js` grava os segundos de foco na virada de dia (poda automática: 35 dias).
- Alimentam o ritual matinal — e ficam prontas para um futuro painel de estatísticas.

### 3.6 i18n
- Todas as strings hardcoded de `tasks.js` (toasts, confirms) migradas para `t()`,
  com keys novas em pt/en/es.

**Arquivos**: `scripts/modules/tasks.js` (reescrito), `ora.html` (widget + ritual,
remoção do seletor de ciclos), `styles/modules/tasks.css`, `sw.js` (stats de foco),
`data/i18n/*.json`.

**Como testar**:
1. Recarregue a extensão e abra uma nova aba → ritual matinal aparece (1ª vez no dia);
   digite 2 prioridades → aparecem no topo da lista e no widget da home.
2. Marque/desmarque tarefas pelo widget; clique ▶ → pomodoro inicia com a tarefa ativa.
3. Crie uma recorrente, conclua-a hoje e amanhã → badge 🔥2.
4. Edite uma tarefa → seletor de ciclos disponível na edição.

---

## Notas para revisão

- **Sync é a parte mais sensível** — revise `scripts/modules/sync.js` com atenção
  antes de subir. Os merges são testados, mas o comportamento real multi-device só
  se valida com dois navegadores logados na mesma conta.
- `blocked.html`/`blocked.js` continuam com strings em pt hardcoded (a página não tem
  infraestrutura de i18n; fora do escopo desta rodada).
- O "modo foco profundo" (bloqueio total automático durante o pomodoro) e o painel de
  estatísticas ficaram anotados como funcionalidades futuras — os dados necessários
  (`ora_daily_stats`) já estão sendo coletados.
