# Plano de implementação — Ora V1

Data: 02/11/2026. Meta: publicar a V1 na Chrome Web Store antes do **1º Domingo do Advento (29/11/2026)**.
Contexto e decisões: [MEMORY.md](MEMORY.md). Defeitos conhecidos (IDs E/M/D): [ERRORS.md](ERRORS.md).

## Escopo

**Entra (referência visual = protótipo):**

| Área | Protótipo de referência |
|---|---|
| Sistema visual (cores, tipo, controles, estados) | `00-sistema.html` + relógio em **Cinzel 600** (`07-relogio-comparativo.html`) |
| Hoje | `01d-hoje-melhorada.html` (todos os estados: vazio, prioridades, tarefas, preparar, ativa, pausada, concluída, noite, erros) |
| Rezar | `03c-rezar-prioridades.html` (entrada, Biblioteca, leitor, Evangelho, Lectio, terço, Respiro) |
| Proteção | `04-protecao.html` (configuração, edição, estados, telas de bloqueio; **sem** a tela "iPhone") |
| Frutos e rituais | `05-frutos-ritual.html` (Frutos com e sem registros, ritual da manhã e da noite) |

**Também entra (decidido fora dos protótipos):**
- **Configurações reorganizadas**, como no `06` (Aparência, Oração, Foco, Lembretes, Dados), **sem** a opção do Companheiro.
- **Exame** como prática em Rezar e como passo do ritual da noite, usando o conteúdo atual (`data/exam.json`).
- **Tempo de tela** como bloco de Frutos.
- **Som** repaginado (sons do Ora + playlists próprias), mais forte que o chip do protótipo.
- **Onboarding** refeito para a nova navegação.
- **Contador "Dias com Ora"** no lugar do streak.
- **Tema do Advento** (coroa), sobre um sistema genérico de tempos litúrgicos.
- **Migração** dos dados da versão publicada (1.1.5).

**Fica fora (V2 ou depois):** tudo o que é exclusivo do `06` (Meu ritmo, modelos, novena, companheiro, exame de 5 passos), o app mobile (`02-hoje-mobile.html`), o tema de Natal (atualização pós-29/11), a rotina de geração do banco de imagens e a miniatura do terço.

> Os demais protótipos (`01`, `01a`, `01c`, `01d-hoje-eixo`, `01e`, `03`, `03a`, `03b`) servem só de consulta.

## Divisão em fases

**É necessário dividir.** Há dependências reais:

1. **Fundação** (tokens, componentes, navegação) antes de qualquer tela.
2. **Separar tarefa / sessão / intenção** antes de Hoje e de Frutos (E01/E02).
3. **Pontos de encaixe** em Hoje e em Rezar antes do tema do Advento.

Cada fase termina com a extensão funcionando e vira um commit (ou uma sequência curta de commits) próprio.

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Fundação: sistema visual, componentes, navegação e testes em Node | — |
| 1 | Núcleo de dados: tarefas, sessões, intenção, contador e migração | 0 |
| 2 | Hoje | 0, 1 |
| 3 | Rezar | 0 |
| 4 | Proteção e telas de bloqueio | 0, 1 |
| 5 | Frutos, rituais e tempo de tela | 1, 2, 3 |
| 6 | Som | 2 |
| 7 | Configurações e onboarding | 2–6 |
| 8 | Tempos litúrgicos: Advento | 2, 3 |
| 9 | Publicação | todas |
| 10 | Pós-lançamento: Natal e acervo de imagens | 8, 9 |

As fases 3 e 4 podem andar em paralelo com a 2.

### Cronograma sugerido

| Período | Fases |
|---|---|
| 03–05/11 | 0 |
| 05–08/11 | 1 |
| 08–13/11 | 2 · 3 |
| 13–16/11 | 4 · 5 |
| 16–18/11 | 6 · 7 |
| 18–19/11 | 8 |
| **20/11** | **9: envio à loja**, com folga para revisão e correções |
| 29/11 | Advento no ar |
| até 15/12 | 10: atualização de Natal |

**Se atrasar, cortar nesta ordem:**
1. Som: manter a música atual dentro da nova preparação.
2. Retratos de santos e imagem do Evangelho: a interface já funciona sem imagem.
3. "Detalhes de uso" em Frutos.
4. Anotações da Lectio.

O tema do Advento e a migração **não** entram no corte.

## Convenções que valem para todas as fases

- **Sem build e sem bibliotecas novas.** JS, HTML e CSS puros, no padrão de módulo singleton (`init`, `cacheDOM`, `bindEvents`).
- **Lógica nova testável** em `scripts/shared/*-core.js`: funções puras, sem DOM e sem `chrome.*`. O SW também as consome via `importScripts`.
- **Strings** sempre via `t()`, com chaves em `pt.json`, `en.json` e `es.json`.
- **Persistência:** "Guardado/Salvo" só aparece depois que a gravação foi confirmada (M11). Nenhuma ação destrutiva sem confirmação.
- **Acessibilidade mínima de toda tela nova:**
  - controles semânticos (`button`, `input type=checkbox`), foco visível;
  - diálogos com foco contido e fundo inerte (M09);
  - área de toque ≥ 24×24 px;
  - texto a 200% sem cortar ações;
  - `prefers-reduced-motion` respeitado.
- **Cor:** não usar cor para julgar desempenho espiritual. Vermelho só para erro.
- **CSS legado** de cada área substituída é removido na mesma fase (ex.: `tasks.css`, `dashboard.css`). Não deixar estilos mortos.
- **Atualizar `ERRORS.md`** ao fim de cada fase: mover itens corrigidos para "Resolvidos" com data e commit.

### Como validar (comum a todas as fases)

- **Testes automáticos:** `node tests/run.js` (criado na fase 0) e `tests/tests.html` no navegador. Todos devem passar.
- **Extensão real:**
  1. `chrome://extensions` → Recarregar.
  2. Abrir nova aba e conferir o console (`Ctrl+Shift+J`): sem erros.
  3. Conferir os logs do SW.
- **Comparação visual:** servir os protótipos com `python -m http.server 5517 --directory prototypes` e comparar o mesmo estado lado a lado, extensão × protótipo.
- **Condições:**
  - janela 800×600;
  - zoom de texto 200% (`chrome://settings/fonts` ou zoom da página);
  - movimento reduzido (Windows: Configurações › Acessibilidade › Efeitos visuais);
  - sem rede (DevTools › Network › Offline);
  - foto de fundo indisponível;
  - só teclado (Tab, Shift+Tab, Esc, setas).
- **Idiomas:** passar pelas telas da fase em pt, en e es. Nenhuma chave crua (`today.xxx`) visível.

---

## Fase 0 — Fundação: sistema visual, componentes e navegação

**Em resumo:** trocar a "pele" e o esqueleto da extensão. Entram as cores, fontes e componentes dos protótipos, e a página única com modais vira três destinos (Hoje · Rezar · Frutos) sob um cabeçalho fixo. O conteúdo atual continua funcionando dentro da nova estrutura até ser substituído nas fases seguintes.

### Escopo

**Código**
- `styles/base/variables.css`: substituir pelos tokens de `prototypes/shared/ora.css`. Inclui:
  - superfícies, texto em 3 níveis e linhas;
  - papel 1 (dourado), papel 2 (cores litúrgicas), papel 3 (estados);
  - Papel/leitura, raios, `--ease`/`--dur`;
  - tema `noite` e fundo de reserva sem rede.
- **Fontes locais** em `assets/fonts/` (`woff2`, só os pesos usados):
  - Cinzel 400/600;
  - Montserrat 300–600;
  - Literata 300–600 + itálico.

  Declarar em `styles/base/fonts.css` e remover a dependência do Google Fonts (funciona offline e simplifica o CSP).
- `styles/components/`: botões (primário dourado, quieto, discreto, perigo), chips, controle segmentado, switch, campo, cartão, `surface-glass` / `surface-solid`, aviso (info/ok/warn/err), toast, folha/diálogo.
- `scripts/ui/dialog.js` (novo): abrir e fechar diálogos com foco contido, `inert` no fundo, Esc e devolução do foco a quem abriu (M09).
- `scripts/ui/router.js` (novo): destinos `hoje`, `rezar`, `frutos` e subtelas (`rezar/biblioteca`, `rezar/leitor/:id`, `rezar/terco`, `protecao`, `configuracoes`…).
  - Usa `history.pushState` + `popstate`: o Voltar do navegador funciona.
  - A rota fica em `history.state`, sem alterar a URL: recarregar mantém o destino e **toda nova aba começa em Hoje** (decisão da implementação: lembrar o último destino entre abas tirava a chegada em Hoje).
- `ora.html`: novo esqueleto.
  - Cabeçalho com marca (Cinzel), navegação Hoje · Rezar · Frutos, espaço para "Tarefas (n)" e para a pílula "Proteção".
  - Três `<main>` de destino e área do rodapé.
  - Os blocos atuais são movidos temporariamente para dentro de "Hoje".
- **Correções globais:**
  - E09: hover só em superfícies interativas.
  - E10: bloco `@media (prefers-reduced-motion: reduce)` em `styles/utils/animations.css`.
  - E08: `translate(-50%, -50%)` em `prayers.css`.
- `tests/run.js` (novo): runner em Node que carrega os `scripts/shared/*.js` e `tests/tests.js` com os mocks mínimos de DOM. Substitui o comando de uma linha do `IMPLEMENTACAO.md`.
- `CLAUDE.md` e `AGENTS.md`: corrigir "No test suite exists" (D01) e documentar `node tests/run.js`.

**Interface**
- O cabeçalho aparece em todos os destinos, com o destino atual marcado (`aria-current="page"`).
- Rezar e Frutos mostram por enquanto um estado vazio simples e honesto. Nada de "em breve" com aparência de função pronta.

**Testes**
- Grupo `Router — rotas`: parse e serialização de rotas (função pura em `scripts/shared/route-core.js`).
- Os 72 testes atuais continuam passando via `node tests/run.js`.

### Como validar

- **Visual:** abrir `00-sistema.html` ao lado de uma página de teste com os componentes (`tests/components.html`, opcional) e comparar cores, pesos e estados (normal, hover, foco, desabilitado).
- Navegar Hoje → Rezar → Frutos e usar o Voltar do navegador: a rota volta sem recarregar a página.
- **Offline:** as fontes continuam corretas, sem queda para Times/Arial.
- **Teclado:** Tab percorre o cabeçalho em ordem; em um diálogo, Shift+Tab não escapa e Esc fecha e devolve o foco.
- **Movimento reduzido:** nenhuma pulsação ou brilho contínuo.
- **Testes:** `node tests/run.js` → 72 + novos, todos passando.

### Commit sugerido

`feat: novo sistema visual e navegação Hoje, Rezar e Frutos`

---

## Fase 1 — Núcleo de dados: tarefas, sessões, intenção, contador e migração

**Em resumo:** separar o que hoje está misturado. **Tarefa** (o que fazer), **sessão** (um bloco de foco realizado) e **intenção** (por quem se oferece) passam a ser dados distintos, para que concluir uma tarefa não invente sessões e completar sessões não conclua tarefas. Na mesma fase, os dados de quem já usa a 1.1.5 são trazidos para o formato novo. Quase tudo aqui é invisível. É a base de Hoje e de Frutos.

### Escopo

**Código**
- `scripts/shared/tasks-core.js` (novo, puro):
  - **Tarefa:** `{ id, title, list: 'hoje'|'depois', order, estimateMin?, recurrence?: { days: [0..6] }, createdAt, completedAt? }`.
  - Até 3 em "Hoje": o limite é só de apresentação, não impede guardar mais.
  - Funções:
    - `nextStep(tasks)`: a primeira de Hoje, na ordem escolhida (E03);
    - `completeTask` / `reopenTask`;
    - `moveToToday` / `moveToLater`;
    - `materializeRecurring(tasks, date)`: recorrência por dias da semana (E05);
    - `rolloverDay`: concluídas viram histórico em vez de sumir (E06).
- `scripts/shared/sessions-core.js` (novo, puro):
  - **Sessão:** `{ id, taskId|null, intention?, plannedMin, focusedMin, startedAt, endedAt, status: 'completed'|'interrupted' }`.
  - Foco sem tarefa é permitido.
  - **Sessão interrompida conta os minutos realmente focados** (decisão de 02/11).
  - Funções: `startSession`, `pause`/`resume` (pausada não conta tempo), `finishSession`, `interruptSession`, `minutesInRange(sessions, from, to)`.
- **Intenção:** `ora_day_intention` (por data) separada de `session.intention`. Alterar a da sessão não altera a do dia.
- `scripts/shared/counter-core.js` (novo, puro):
  - `daysWithOra(history)` conta dias com pelo menos uma sessão de foco ou uma tarefa concluída.
  - **Nunca zera.** Substitui o streak do commit `960a069`.
- `scripts/shared/pomodoro-core.js`:
  - pausa longa configurável (padrão **15 min**);
  - função `endOfSessionOptions(state)` com uma única transição de fim de sessão: pausa curta/longa, **fazer um Respiro**, mais uma sessão, voltar (E12).
- `scripts/shared/migrate-core.js` (novo, puro):
  - `migrate(storageSnapshot) → { changes, removals, schemaVersion }`, idempotente;
  - grava `ora_schema_version = 2`.
  - Migrações a partir da **1.1.5**:
    - `ora_quick_links` → atalhos;
    - `ora_user_playlists` → playlists do Som;
    - `ora_focus_settings` → preferências de foco;
    - `ora_focus_total_*` → sessões agregadas, marcadas como importadas (sem horário);
    - `ora_intention` → intenção do dia de hoje;
    - `ora_exam_logs` → registros de exame (para Frutos);
    - `ora_rosary_progress` → progresso do terço.
  - Bloqueador: a migração de `blocker_sites` / `blocker_config` para perfis fica na fase 4, onde o modelo de perfil é definido. Até lá, as chaves são preservadas intactas.
  - Também migra as tarefas da 1.2.0 local, usada só pelo autor: `tasks` → `tasks-core`, sem inventar sessões a partir de ciclos (E01).
- `scripts/modules/tasks.js` e `scripts/modules/focus.js`: passam a usar os cores.
  - Remove o preenchimento de ciclos ao concluir (E01) e a conclusão automática ao atingir os ciclos (E02).
  - A interface antiga é adaptada só o suficiente para continuar funcionando até a fase 2.
- `scripts/main.js`: roda a migração antes de iniciar os módulos.
- `sync.js`: atualizar os sanitizers e o merge para o novo formato. Sincronizar só tarefas recorrentes e configurações, como hoje.

**Interface**
- Nenhuma tela nova.
- Comportamento visível corrigido:
  - concluir uma tarefa não registra sessões;
  - completar as sessões previstas não conclui a tarefa.

**Testes**
- `TasksCore`: próximo passo respeita a ordem escolhida; recorrência em dias úteis aparece de segunda a sexta e não no sábado; virada do dia preserva concluídas no histórico.
- `SessionsCore`: sessão pausada por 10 min não soma esses 10 min; sessão interrompida aos 12 min registra 12; foco sem tarefa é válido.
- `CounterCore`: dias sem registro não zeram o contador; um dia com só uma tarefa concluída conta.
- `PomodoroCore`: pausa longa padrão de 15 min e editável; opções de fim de sessão incluem o Respiro.
- `MigrateCore`:
  - fixture com um snapshot real da 1.1.5;
  - rodar duas vezes dá o mesmo resultado;
  - chaves do bloqueador ficam intactas;
  - nenhuma chave desconhecida é apagada.

### Como validar

- **Migração com dados reais:**
  1. Instalar a 1.1.5 (tag/commit `1ca2ccb`) num perfil limpo do Chrome.
  2. Criar atalhos, playlists, sites bloqueados e um exame.
  3. Exportar o storage com `chrome.storage.local.get(null, console.log)` e salvar como fixture em `tests/fixtures/storage-1.1.5.json`.
  4. Carregar a versão nova por cima e conferir que atalhos, playlists e sites continuam lá.
- **Na extensão:** concluir uma tarefa manualmente e confirmar no storage que nenhuma sessão foi criada. Completar o número previsto de ciclos e confirmar que a tarefa continua aberta.
- **Testes:** `node tests/run.js`, com os novos grupos passando.

### Commit sugerido

`refactor: separar tarefas, sessões e intenção e migrar dados da 1.1.5`

---

## Fase 2 — Hoje

**Em resumo:** a tela inicial passa a ser a do `01d-hoje-melhorada`. Chegada calma (relógio, saudação, data e celebração do dia), um único destaque com o próximo passo e o fluxo completo de foco (preparar → em foco → pausada → concluída) no mesmo lugar. Tarefas viram um painel lateral e os convites de oração viram uma linha discreta.

### Escopo

**Código**
- `scripts/modules/today.js` (novo): orquestra os estados de Hoje a partir de `tasks-core`, `sessions-core` e do estado do pomodoro.
  - Estados: `repouso-vazio`, `repouso` (com próximo passo), `preparacao`, `ativa`, `pausada`, `concluida`, `noite`, `falha`.
  - Mantém a sincronização entre abas via `chrome.storage.onChanged`.
- `scripts/modules/tasks.js`: reescrita da interface como **painel lateral** "Tarefas (n)".
  - Seções Hoje (ordenável) e Depois (captura rápida, só o nome obrigatório).
  - Recorrência por dias da semana.
  - Checkbox semântico (E07).
  - O ritual matinal automático é removido daqui (E04) e passa a ser convite (fase 5).
- `scripts/modules/focus.js`: a preparação vira diálogo contextual.
  - Duração 15/25/50/90.
  - "Oferecer esta sessão por" (opcional, só para a sessão).
  - Som (chip que abre o seletor; na fase 6 recebe o conteúdo novo).
  - Proteção (switch "Bloquear distrações", com "ver regras").
  - "Começar foco" **sempre abre a preparação** (decisão de 02/11).
- `scripts/modules/links.js`: "Seus atalhos" no alto, ao lado da marca, com Adicionar.
  - Atalho padrão **Liturgia das Horas** (externo).
  - Usa os atalhos migrados.
- `scripts/modules/reminders.js`: um único **espaço de convite** (Angelus, Terço da Misericórdia, Encerrar o dia), com "Agora não". Nunca dois convites ao mesmo tempo.
- **Rodapé:**
  - frase de santo (tratamento atual: branco quase pleno, sombra curta);
  - **Evangelho · referência** com "Ler aqui" (abre o leitor da fase 3) e "Liturgia completa ↗" (externo).
- **Proteção no cabeçalho:** pílula com estado real e popover de resumo dos perfis, com "Gerenciar proteção" (a tela é da fase 4; até lá a pílula abre o modal atual do bloqueador).
- Relógio menor e em Cinzel 600. Durante a atividade, a tarefa ganha prioridade sobre o relógio (E13).
- Remover `dashboard.css`, `tasks.css` e o CSS do header/footer antigo que ficar sem uso.

**Interface (estados a reproduzir do `01d-hoje-melhorada`)**
- **Vazio:** "O que você quer fazer agora?" + Começar foco + "Ou apenas fique aqui um instante." + linha de intenção do dia opcional.
- **Prioridades:** cartão "Próximo passo" com título, duração e origem ("primeira da sua lista de hoje"), Começar foco e Escolher outra.
- **Tarefas:** painel lateral aberto, sem cobrir o próximo passo.
- **Preparar:** diálogo com Esc fecha.
- **Ativa:** atividade antes do cronômetro, "restantes · termina às HH:MM", Pausar e Encerrar sessão, "Distrações bloqueadas até o fim".
- **Pausada:** "O tempo restante não está correndo…", só **Retomar** reinicia (M01).
- **Concluída:** Marcar tarefa como concluída · Pausa de 5 min · Mais uma sessão · Voltar ao início · "Depois: \<próxima\>". Na pausa longa, entram as opções da fase 1: pausa editável ou **Fazer um Respiro**.
- **Noite:** convite "Encerrar o dia · cerca de 5 min".
- **Erros:** falha de gravação ou de rede com mensagem e ação, sem perder o que foi digitado.
- Coerência de estados: com sessão ativa, não aparece "Começar foco" nem a proteção de repouso como se nada estivesse acontecendo (M13).

**Testes**
- `TodayCore` (`scripts/shared/today-core.js`, puro): função `resolveTodayState({ tasks, session, pomodoro, now, reminders })` → estado + dados exibidos.
  - Casos: sem tarefas → vazio; com sessão pausada → pausada (nunca ativa); 21h30 sem sessão → noite; sessão ativa → nenhum convite.
- `RemindersCore`: só um convite por vez, prioridade definida, "Agora não" adia até o próximo horário.

### Como validar

- **Visual:** para cada estado da tabela, abrir `01d-hoje-melhorada.html` no mesmo estado (barra de protótipo) e comparar lado a lado em 1440×900 e 800×600.
- **Fluxo completo com sessão curta** (duração de teste de 1 min, só com flag de desenvolvimento):
  1. preparar e começar;
  2. abrir outra aba e conferir o mesmo estado;
  3. pausar, recarregar e conferir que continua pausada (M01);
  4. retomar e deixar terminar;
  5. marcar a tarefa como concluída.
- **Texto 200%:** o cartão e os botões não são cortados; a página inteira rola em altura curta.
- **Teclado:** do carregamento até iniciar um foco, sem mouse.
- **Migração:** atalhos da 1.1.5 aparecem em "Seus atalhos".
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: tela Hoje com próximo passo e fluxo de foco`

---

## Fase 3 — Rezar

**Implementada em 03/11/2026.** Evidências e instruções de verificação em `tests/FASE_3.md`.

**Em resumo:** o painel Rezar do `03c-rezar-prioridades`. As orações da pessoa (favoritas) vêm primeiro, depois o Evangelho do dia com ações claras (ler, Lectio), as práticas (terço, Respiro, exame, Bíblia) e os santos do dia em destaque secundário. A Biblioteca, o leitor e o terço são refeitos com o estilo aprovado e com retomada real.

### Escopo

**Código**
- `scripts/modules/rezar.js` (novo): entrada de Rezar e subtelas via router.
- **Conteúdo:**
  - `data/prayers.json` ganha `category` e `essential` (hoje não há categorias);
  - revisar as categorias da Biblioteca (Básicas, Marianas, Ao longo do dia, Agradecimento…);
  - `data/saints.json` (novo): santos principais por `MM-DD`, com nome, identidade breve e, opcionalmente, frase **verificada** com fonte (`https://`) e imagem;
  - sem frase verificada, a frase não aparece.
- `scripts/modules/prayers.js`: Biblioteca.
  - Busca em títulos e textos **sem acentos**, com escopo de categoria e de favoritas explícito ("Busca em… · categoria: X").
  - Favoritas com estrela.
  - Contagem de resultados.
  - A região de resultados fica à vista em tela estreita.
- **Leitor** (`scripts/modules/reader.js`, novo):
  - Literata, alinhado à esquerda;
  - A−/A+ (tamanho persistido);
  - Escuro/Papel;
  - **retomada real da posição** (M03): restaurar a rolagem *antes* de registrar progresso.
- **Evangelho:**
  - **pt:** texto completo pela API atual (`liturgia.up.railway.app/v2`).
  - O SW passa a pré-carregar **7 dias** (`?periodo=7` ou por data) em `liturgy_gospel_cache`.
  - **en/es:** referência + título da celebração + "Ler o Evangelho ↗" (USCCB em inglês; Evangelizo/USCCB espanhol em espanhol). Em inglês, as referências vêm da `cpbjr/catholic-readings-api` (adicionar ao `connect-src`).
  - **Imagem do dia:** área delimitada acima do texto, nunca atrás. Legenda de origem ("Mosaico inspirado em…" / "Obra de X, domínio público").
    - Lida de um índice `acervo.json` por **perícope**, hospedado fora do pacote (ver fase 10).
    - Sem imagem: a tela funciona igual.
    - No modo Papel e com texto a 200%: vira miniatura.
  - "Liturgia completa ↗" externo.
  - Estado **Evangelho indisponível** (sem rede e sem cache): mensagem honesta e acesso ao link externo.
- **Lectio:** 4 etapas (Lectio, Meditatio, Oratio, Contemplatio), Anterior / Próxima etapa, anotação opcional nas etapas 2 e 3, gravada localmente.
- **Terço** (`scripts/modules/rosary.js`, reescrita da interface):
  - **Preparação:** mistérios sugeridos pelo dia da semana; intenção opcional; texto "Completo / Só o nome"; "Começar do início" ou continuar.
  - **Oração:** "3º mistério glorioso · A Descida do Espírito Santo", "Ave-Maria · 6 de 10", barra dos cinco mistérios, Anterior/Próxima.
  - **Teclado:** ← → e espaço, **sem** interceptar Espaço quando um botão estiver focado.
  - **Retomada** da posição real gravada (M04).
  - Controles ≥ 24 px e uma única área de rolagem (E11).
  - **Espaço para imagem no anúncio do mistério** (20 imagens fixas), com fallback sem imagem. As imagens entram quando estiverem prontas.
- **Respiro:** formas "Oração breve", "Três Ave-Marias", "Uma dezena", "Apenas descansar".
  - Primeira vez: **Oração breve**. Depois, a última usada.
  - Sem cronômetro.
  - **Volta para a origem** (Hoje, fim de sessão, tela de bloqueio) (M12).
- **Exame** (`scripts/modules/exam.js`): fluxo atual (tipos, checklist de virtudes) refeito com os componentes novos, como subtela de Rezar. Continua gravando `ora_exam_logs`.
- **Bíblia:** bloco em Rezar ("Bíblia · continuar em \<livro cap.\>") que lembra o último capítulo aberto e abre o site externo.
- Remover `rosary.css`, `prayers.css` e `exam.css` antigos depois da substituição.

**Interface**
- Entrada de Rezar na ordem do `03c`:
  1. Suas orações (favoritas, ou Essenciais do Ora quando não há favoritas);
  2. Evangelho do dia (Ler o Evangelho · Lectio Divina);
  3. Práticas de oração (Rezar o terço — "mistérios gloriosos" no dia certo —, Respiro, Exame, Bíblia);
  4. Santos do dia;
  5. Explorar a Biblioteca.

**Testes**
- `SearchCore` (puro): "sao jose" encontra "São José"; categoria restringe; escopo de favoritas restringe.
- `RosaryCore` (puro): mistério do dia por dia da semana; avançar e voltar de Ave-Maria 10 → próximo mistério e de volta; serializar e restaurar a posição.
- `ReaderCore` (puro): cálculo e restauração de proporção de rolagem.
- `LiturgyCore` (puro): normalização da resposta da API (pt) e das referências (en); escolha da fonte por idioma; leitura do cache por data.
- `SaintsCore`: frase sem fonte `https://` ou sem `verified: true` é descartada.

### Como validar

- **Visual:** comparar com `03c-rezar-prioridades.html` em todos os estados (rezar, biblioteca, leitor-evangelho, lectio, terco-preparacao, respiro), em 1440×900 e 800×600.
- **Retomada:** abrir uma oração longa, rolar até a metade, recarregar → mesma posição. Parar o terço na 6ª Ave-Maria do 3º mistério, fechar a aba, reabrir → mesma posição.
- **Teclado no terço:** com o botão "Sair" focado, Espaço aciona Sair e não avança a conta.
- **Offline:** com cache, o Evangelho aparece; sem cache, aparece o estado indisponível.
- **Idiomas:** em en, a referência e o link para a USCCB; em es, o link externo; nenhum texto em português sobrando.
- **Respiro:** iniciar pelo fim de uma sessão e conferir que volta para a tela de sessão concluída, não para o início.
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: painel Rezar com Evangelho, Biblioteca, terço e Respiro`

---

## Fase 4 — Proteção e telas de bloqueio

**Em resumo:** o bloqueador vira **Proteção**, como no `04-protecao`. Os sites são organizados em perfis (Redes sociais, Vídeos, Notícias…), cada perfil tem regras claras (durante o foco, em um horário com dias, limite diário, acesso temporário) e a pessoa vê a consequência antes de salvar. A tela que aparece no site bloqueado também é refeita.

### Escopo

**Código**
- `scripts/shared/blocker-core.js`:
  - modelo de **perfil** `{ id, name, sites[], rules: { duringFocus, schedule?: { from, to, days[] }, dailyLimitMin?, temporaryAccess: { enabled, minutes: 5, perDay: 3 } } }`;
  - `buildRulesFromProfiles`;
  - `describeConsequence(profiles, now)`: texto da prévia, **respeitando os dias da regra** e sem usar "amanhã" errado (M06);
  - `nextChange(profiles, now)` ("Redes sociais serão bloqueadas às 22h");
  - contadores de acesso temporário.
- `migrate-core.js`: migração `blocker_sites` + `blocker_config` → um perfil "Meus sites" com as regras equivalentes, preservando a trava e a pausa contemplativa.
- `scripts/modules/blocker.js`: interface nova como subtela `protecao`.
  - **Resumo:** Ativa / Nada bloqueado agora / próxima mudança; "Pausar por 15 min" passa pela pausa contemplativa atual.
  - **Perfis:** lista, adicionar site ou perfil, editar.
  - **Edição:** sites; Durante sessões de foco; Em um horário (início, fim, D S T Q Q S S); Limite diário; Acesso temporário (Não permitir / 5 min até 3× por dia).
  - **Prévia da consequência** antes de salvar e "Ver como aparece" (durante o foco, fora do horário, limite atingido).
  - **Salvar:** "Salvo" só depois de as regras DNR serem aplicadas. Se o navegador recusar, mostrar "As regras não foram salvas… As regras anteriores continuam valendo · Tentar de novo".
  - **Sem permissão:** detectar e mostrar a explicação com "Abrir configurações da extensão".
- `blocked.html` / `scripts/blocked.js`: tela de bloqueio.
  - **Em foco:** "Você está em foco · \<tarefa\> · faltam N min · Liberado às HH:MM", Voltar para a tarefa, Acessar por 5 minutos, Fazer um respiro.
  - **Acesso temporário:** confirmação com "Restam N acessos hoje", "A sessão de foco continua contando", "Para quê?" opcional e só local.
  - **Fora do horário** e **limite atingido**, com o motivo e até quando.
- `sw.js`: reconstruir as regras a partir dos perfis e reagendar os alarmes de horário e de fim do acesso temporário.
- **Permissões (E14):** revisar se `<all_urls>` é realmente necessário; reduzir `host_permissions` ao que as regras e o `web_accessible_resources` exigem. Registrar a justificativa para a loja.
- Remover o `blocker.css` antigo depois da substituição.

**Interface**
- Pílula "Proteção ativa" no cabeçalho (fase 2) com dados reais e popover por perfil ("Liberadas agora · bloqueadas durante foco e das 22h às 7h", "12 de 30 min usados hoje").

**Testes**
- `BlockerCore — perfis`:
  - regra de horário só de segunda a sexta não bloqueia no sábado;
  - janela 22h–7h cruzando a meia-noite;
  - prévia na sexta à noite não diz "amanhã" para uma regra que volta só na segunda;
  - limite diário atingido bloqueia até 0h;
  - terceiro acesso temporário permitido e quarto negado;
  - perfil desmarcado não entra nas regras (M10).
- `MigrateCore — bloqueador`: fixture da 1.1.5 → um perfil com os mesmos sites e as mesmas janelas.

### Como validar

- **Bloqueio real:**
  1. Criar um perfil com `instagram.com` bloqueado durante o foco.
  2. Iniciar um foco de teste e abrir o site → tela "Você está em foco".
  3. Usar o acesso temporário 3× e conferir que a 4ª é negada.
  4. Encerrar o foco → site liberado.
- **Horário:** regra para daqui a 2 minutos → bloqueia na hora certa com a aba do Ora fechada (SW).
- **Sem permissão:** desligar "Bloquear conteúdo em sites" nas configurações da extensão (quando disponível) ou simular o erro do DNR → estado de aviso.
- **Falha ao salvar:** forçar erro em `updateDynamicRules` (flag de desenvolvimento) → mensagem de falha, regras anteriores mantidas.
- **Migração:** a fixture da 1.1.5 carregada → sites antigos continuam bloqueados.
- **Visual:** comparar com `04-protecao.html` (configuracao, editar, ativa-foco, pausada, sem-permissao, bloqueio-foco, acesso-temporario).
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: Proteção por perfis e novas telas de bloqueio`

---

## Fase 5 — Frutos, rituais e tempo de tela

**Implementada em 04/11/2026.** Evidências, decisões e instruções de verificação em `tests/FASE_5.md`.

**Em resumo:** o destino **Frutos** passa a mostrar a semana ou o mês com base no que de fato aconteceu no Ora: minutos de foco, dias com terço ou oração, exames, contador de dias e o bloco de tempo de tela, sempre com uma pergunta para refletir e sem julgar. Entram também os rituais da manhã e da noite, como convites e nunca como interrupção.

### Escopo

**Código**
- `scripts/shared/frutos-core.js` (novo, puro): `summarize(period, sessions, prayers, exams, screentime)`.
  - Síntese ("Nesta semana: 9 sessões de foco (3h45), terço em 4 dias e 3 exames da noite").
  - Linhas por dia, com "Sem registro" neutro.
  - Contador "Dias com Ora".
- **Registro de práticas:** terço concluído, oração aberta no leitor e exame concluído passam a gravar um evento `{ type, at }` (para Frutos).
- `scripts/modules/frutos.js` (novo):
  - Semana/Mês com período navegável;
  - Síntese;
  - texto explicativo ("O Ora registra só o que acontece aqui…");
  - Para refletir (pergunta da semana, Guardar com gravação confirmada, Outra pergunta);
  - Semanas anteriores;
  - Detalhes de uso.
- `scripts/modules/screentime.js`: vira **bloco de Frutos**.
  - Abre pela pergunta, sem vermelho/verde (E16).
  - Remover o botão do rodapé antigo.
- `scripts/modules/rituals.js` (novo):
  - **Manhã:** convite por linha em Hoje ("Começar o dia · prioridade e intenção · 1 min", Começar / Agora não). Some ao iniciar um foco ou depois do meio-dia. 3 passos: prioridade, intenção opcional, começo. A atividade e a duração escolhidas chegam a Hoje e à preparação (M02).
  - **Noite:** convite "Encerrar o dia" depois das 21h. 3 passos: Gratidão, Reflexão ("Onde você percebeu Deus hoje — e onde tropeçou?", com "Fazer o exame completo" → Exame de Rezar) e Encerramento ("Redes sociais ficam bloqueadas até 7h. Bom descanso." quando houver regra).
  - Tema `noite` aplicado.
  - **Rascunhos persistidos** ao sair e reabrir.
- **Retenção:** reflexões e respostas ficam guardadas indefinidamente, só neste navegador. Exportar e Apagar reflexões ficam nas Configurações (fase 7).
- Remover o check-in e a sugestão de terço separados do fim do foco (substituídos pela transição única da fase 2).

**Interface**
- Estados do `05-frutos-ritual`: `frutos` (com registros), `frutos-vazio`, `ritual-manha`, `ritual-noite`.

**Testes**
- `FrutosCore`:
  - semana sem registros → síntese vazia com o texto neutro;
  - sessão interrompida soma minutos;
  - terço em 2 sessões no mesmo dia conta 1 dia;
  - mês com virada de horário de verão não duplica dias.
- `RitualsCore`: convite da manhã some com sessão ativa e depois das 12h; convite da noite só depois das 21h e não se o ritual já foi feito; rascunho restaurado.
- `ScreentimeCore`: agregação por domínio e período sem classificar em bom/ruim.

### Como validar

- **Com dados:** gerar uma semana de dados de teste (flag de desenvolvimento ou fixture) e comparar com `05-frutos-ritual.html#frutos`.
- **Sem dados:** perfil limpo → comparar com `#frutos-vazio`. Nada de cor de julgamento.
- **Guardar reflexão:** recarregar a página → a reflexão continua lá.
- **Rituais:**
  - abrir a primeira aba do dia → só a linha de convite, nada abre sozinho;
  - fazer o ritual da manhã e conferir que a prioridade aparece em Hoje e na preparação;
  - às 21h (data simulada), conferir o convite da noite;
  - sair no passo 2 e voltar → o rascunho continua.
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: Frutos, rituais da manhã e da noite e tempo de tela`

---

## Fase 6 — Som

**Em resumo:** música deixa de ser um destino na tela e vira o **Som do foco**, no estilo do Momentum. Sons próprios do Ora que funcionam offline (chuva, igreja, sinos, mosteiro…), as playlists da pessoa no YouTube ou Spotify, e um controle pequeno visível durante a sessão.

### Escopo

**Código**
- `scripts/modules/sound.js` (substitui `music.js`). Seletor com três abas:
  1. **Silêncio**.
  2. **Sons do Ora**:
     - arquivos em `assets/sounds/`, tocados com `<audio loop>`;
     - mistura de até 2 camadas com volume;
     - lista inicial: chuva, igreja vazia, sinos ao longe, mosteiro, vela/lareira;
     - **canto gregoriano** só com gravação de licença livre comprovada (CC0/CC-BY, com atribuição registrada em `assets/sounds/CREDITS.md`).
  3. **Minhas playlists**: YouTube/Spotify, reaproveitando o relay atual (`ora-player-relay`) e as playlists migradas. Spotify via embed: faixa completa se a pessoa estiver logada no navegador, senão prévia.
- Lembrar a última escolha e o volume.
- "Escolher som" **abre** o seletor; não troca a opção direto (M08).
- **Mini controle** durante o foco em Hoje: nome do som, pausar, volume.
- Pausar o som junto com a sessão pausada (opcional, configurável).
- Remover `music.css`, o modal "Biblioteca" de música e o botão do cabeçalho antigo.

**Interface**
- Chip "Som · \<escolha\>" na preparação (fase 2), seletor em diálogo e mini controle no estado `ativa`.

**Testes**
- `SoundCore` (puro): parse de links do YouTube/Spotify (vídeo, playlist, álbum, `spotify:`); preferência restaurada; mistura limitada a 2 camadas.

### Como validar

- Escolher "Chuva" + "Sinos", começar um foco, trocar de aba e voltar → o som continua e o mini controle mostra a escolha.
- Offline: os sons do Ora funcionam; as playlists mostram mensagem de indisponível.
- Colar um link de playlist do YouTube e um do Spotify → tocam (Spotify completo com login no navegador).
- Recarregar → a última escolha e o volume são restaurados.
- **Teclado:** abrir o seletor, escolher e fechar com Esc.
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: som do foco com sons do Ora e playlists próprias`

---

## Fase 7 — Configurações e onboarding

**Em resumo:** as configurações saem do modal atual e ficam organizadas em cinco grupos, como no protótipo `06` (sem o Companheiro). O onboarding é refeito para apresentar a nova estrutura (Hoje, Rezar, Frutos e Proteção) e preparar o essencial em poucos passos.

### Escopo

**Código**
- `scripts/modules/settings.js`: subtela `configuracoes` com grupos.
  - **Aparência:**
    - Leitura (Escuro / Papel);
    - Tamanho do texto de leitura (A / A+ / A++);
    - Reduzir movimento;
    - **Idioma da interface**.
  - **Oração:**
    - **Idioma das orações**;
    - Santo do dia em Rezar;
    - Mistérios do terço seguem o dia da semana;
    - Texto das orações no terço (Completo / Só o nome).
  - **Foco:**
    - Duração padrão;
    - Pausa curta;
    - **Pausa longa (padrão 15 min)**;
    - Proteção durante o foco;
    - Manter a tela acesa.
  - **Lembretes:**
    - Angelus;
    - Terço da Misericórdia;
    - Convite para encerrar o dia;
    - Som das notificações.
  - **Dados:**
    - Exportar meus dados (JSON);
    - Conteúdo offline (Evangelho dos próximos 7 dias · tamanho · Atualizar);
    - Apagar reflexões (com confirmação).
  - Link "Proteção ↗" para a subtela.
- Mudança de idioma aplica sem recarregar e também quando vem de outro dispositivo (E17).
- `scripts/modules/onboarding.js`: reescrita com os componentes novos.
  1. Idioma e nome.
  2. Apresentação curta de Hoje · Rezar · Frutos e da Proteção.
  3. Primeiros sites a proteger (opcional, com perfis sugeridos).
  4. Lembretes (opcional).
  5. Explicação das permissões em linguagem simples.

  Pular sempre disponível. Quem vem da 1.1.5 vê uma versão curta ("O que mudou"), não o onboarding inteiro.
- Remover `onboarding.css` e `settings.css` antigos.

**Testes**
- `SettingsCore` (puro): valores padrão; sanitização (duração fora da lista volta ao padrão); exportação contém tarefas, sessões, reflexões e perfis, e não contém caches.
- `OnboardingCore`: instalação nova → onboarding completo; atualização da 1.1.5 → "O que mudou"; concluído → não aparece de novo.

### Como validar

- **Visual:** comparar com `06-ritmo-novenas.html#configuracoes` (ignorando Companheiro).
- Trocar o idioma da interface → toda a tela muda na hora, sem recarregar. Trocar o idioma das orações → só os textos de oração mudam.
- **Exportar:** abrir o arquivo e conferir os dados. **Apagar reflexões:** pede confirmação e, depois, Frutos não mostra reflexões.
- **Onboarding:**
  - perfil limpo → fluxo completo;
  - perfil com a fixture da 1.1.5 → só "O que mudou";
  - pular no passo 1 → Hoje funciona normalmente.
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: configurações reorganizadas e novo onboarding`

---

## Fase 8 — Tempos litúrgicos: Advento

**Em resumo:** um sistema que sabe em que tempo litúrgico estamos e aplica elementos temáticos nos lugares certos. Começa pelo **Advento**: uma linha sobre a coroa na tela inicial e a coroa com as velas da semana em Rezar. Fica pronto para receber Natal, Quaresma, Páscoa, Quaresma de São Miguel e as grandes festas sem mexer nas telas.

### Escopo

**Código**
- `scripts/shared/liturgical-calendar.js` (novo, puro, offline):
  - `easter(year)` (cômputo gregoriano);
  - `adventStart(year)` (4º domingo antes do Natal);
  - `seasonFor(date, region)` → `advento | natal | comum | quaresma | triduo | pascoa`;
  - `adventWeek(date)` (1–4) e `isGaudete(date)`;
  - `christmasSeasonEnd(year, region)` (Batismo do Senhor; Brasil com Epifania no domingo);
  - `michaelLent(date)` (15/08–29/09);
  - `principalFeast(date)` (Natal, Páscoa, Pentecostes).
- `data/seasons.json` (novo): registro dos temas.

  ```json
  { "id": "advento", "season": "advento", "accent": "--lit-roxo",
    "today": { "type": "line", "key": "season.advent.week{n}" },
    "rezar": { "type": "symbol", "component": "advent-wreath" },
    "enabled": true }
  ```

  Natal e Tempo do Natal ficam registrados com `"enabled": false` até a fase 10.
- `scripts/modules/seasons.js` (novo): no `init`, resolve o tema do dia e preenche os **pontos de encaixe** que Hoje (linha sob a data) e Rezar (símbolo) expõem.
  - Sem tema ativo: os pontos ficam vazios, sem espaço reservado.
- **Coroa do Advento** (`assets/seasons/advent-wreath.svg` + CSS):
  - 4 velas (3 roxas, 1 rosa na 3ª semana), acesas conforme a semana;
  - com movimento reduzido, a chama fica estática.
- **Hoje:** "1ª semana do Advento · acenda a primeira vela" (a 3ª semana menciona o Gaudete).
- **Rezar:** a coroa com uma oração breve de acendimento da vela da semana (novo item em `prayers.json`, categoria "Tempo litúrgico").
- Cor de destaque roxa (papel 2, sempre acompanhada de texto) no tempo do Advento.
- **Data simulada para testes:** `ora_debug_date` em `chrome.storage.local`, lida só quando a extensão está carregada sem pacote (`chrome.runtime.getManifest().update_url` ausente).

**Testes**
- `LiturgicalCalendar`:
  - Páscoa 2026–2030 (05/04/2026, 28/03/2027, 16/04/2028, 01/04/2029, 21/04/2030);
  - início do Advento 2026–2030 (29/11/2026, 28/11/2027, 03/12/2028, 02/12/2029, 01/12/2030);
  - Gaudete em 13/12/2026;
  - 24/12 ainda é Advento e 25/12 é Natal;
  - Batismo do Senhor em 10/01/2027;
  - Quaresma de São Miguel em 15/08–29/09.
- `SeasonsCore`: tema desabilitado nunca ativa; sem tema → pontos de encaixe vazios.

### Como validar

- Com `ora_debug_date`, percorrer: 28/11 (sem tema) · 29/11 (1ª vela) · 13/12 (3 velas, rosa acesa, menção ao Gaudete) · 20/12 (4 velas) · 25/12 (sem tema do Advento; Natal ainda desabilitado).
- Conferir a coroa no Escuro e no Papel, com movimento reduzido e com texto a 200%.
- Conferir em pt, en e es.
- Instalar o pacote (fase 9) e confirmar que a data simulada é ignorada.
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: tempos litúrgicos com tema do Advento`

---

## Fase 9 — Publicação

**Em resumo:** preparar e enviar a V1 para a Chrome Web Store com folga para a revisão. Pacote limpo, permissões justificadas, textos e imagens da loja, e uma rodada completa de testes manuais na versão empacotada.

### Escopo

**Código**
- `manifest.json`: versão **2.0.0** (mudança de interface e de dados); permissões finais da fase 4; CSP sem domínios que deixaram de ser usados (Google Fonts, `noembed` se não for mais usado).
- `tools/package.ps1` (novo): gera `dist/ora-2.0.0.zip` a partir de uma lista de inclusão (`manifest.json`, `ora.html`, `blocked.html`, `sw.js`, `scripts/`, `styles/`, `data/`, `assets/`). **Exclui** `prototypes/`, `tests/`, `*.md`, `IDEAS.pdf` e `index.html` (E15).
- `README.md`, `CLAUDE.md` e `AGENTS.md` atualizados com a nova arquitetura (destinos, cores, router, testes).
- `ERRORS.md`: itens corrigidos movidos para "Resolvidos".

**Loja**
- **Descrição** em pt, en e es.
- **Capturas** de Hoje, Rezar, Proteção, Frutos e Advento.
- **Política de privacidade:** tudo fica no navegador; sync opcional via conta do Chrome; nenhum dado enviado a servidor do Ora.
- **Justificativa** de cada permissão.

**Pendências externas** (não bloqueiam o envio)
- E-mail à Evangelizo pedindo permissão para exibir o texto em espanhol.
- Confirmar os direitos do texto em português da API.

### Como validar

- Instalar o `.zip` gerado num **perfil novo** (arrastar para `chrome://extensions`) e conferir que não há `prototypes/` dentro.
- **Roteiro de regressão na versão empacotada:**
  1. Onboarding.
  2. Foco completo com proteção.
  3. Site bloqueado e acesso temporário.
  4. Rezar: Evangelho, terço com retomada, Respiro.
  5. Ritual da noite.
  6. Frutos.
  7. Configurações: idioma, exportar.
  8. Advento: ignorar a data simulada e confirmar só que o código do tema carrega sem erro.
- **Atualização:** instalar a 1.1.5 da loja num perfil, criar dados e carregar a 2.0.0 por cima → dados preservados e "O que mudou".
- `node tests/run.js` passando no commit do pacote.

### Commit sugerido

`chore: preparar pacote e publicação da versão 2.0.0`

---

## Fase 10 — Pós-lançamento: Natal e acervo de imagens

**Em resumo:** a primeira atualização depois do Advento. Ativa o tema de Natal e do Tempo do Natal (já previsto no registro da fase 8) e começa a alimentar o acervo de imagens em mosaico do Evangelho e dos mistérios do terço, hospedado fora do pacote.

### Escopo

**Código e conteúdo**
- `data/seasons.json`: Natal (25/12) e Tempo do Natal (até o Batismo do Senhor) com `enabled: true`.
  - Elemento em Hoje ("Tempo do Natal · …") e símbolo em Rezar (presépio ou vela branca no centro da coroa).
  - Cor branca/dourada.
- **Acervo:** `acervo.json` hospedado num endereço estático (ex.: GitHub Pages, como o relay), com chave pela **perícope** e metadados `{ pericope, celebrations[], cycle: A|B|C|ferial, origin, intervention, license, source, version, status }`, no formato de `prototypes/arte-sacra/assets/acervo-v1.json`.
- O SW baixa as imagens dos próximos 7 dias junto com o Evangelho.
- **Mistérios do terço:** primeiro lote de 20 imagens em mosaico, com revisão iconográfica.
- **Rotina de curadoria** (fora da extensão; ex.: tarefa agendada):
  1. buscar a liturgia dos próximos 14 dias;
  2. listar as perícopes sem imagem;
  3. procurar obras em domínio público, guardando a licença;
  4. senão, gerar um prompt no estilo mosaico;
  5. **aprovação humana** antes de publicar.

**Testes**
- `AcervoCore`: escolha da imagem por perícope; imagem não aprovada (`status != approved`) nunca aparece; falha de rede → sem imagem.
- `LiturgicalCalendar`: casos do Tempo do Natal para 2026–2030.

### Como validar

- Data simulada em 25/12, 01/01, 03/01 (Epifania) e 10/01 → tema de Natal; 11/01 → sem tema.
- Evangelho de um dia com imagem aprovada → imagem com legenda de origem. Dia sem imagem → tela sem espaço vazio.
- Offline com cache → imagem aparece; sem cache → tela sem imagem.
- **Testes:** `node tests/run.js`.

### Commit sugerido

`feat: tema de Natal e acervo de imagens do Evangelho`
