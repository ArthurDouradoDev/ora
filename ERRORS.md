# ERRORS.md — Problemas conhecidos e armadilhas do Ora

Registro de defeitos, riscos e armadilhas levantados nas análises de 28–30/10/2026. Consultar antes de mexer nas áreas citadas e **atualizar** quando um item for corrigido (mover para "Resolvidos" com data e commit). Contexto geral: [MEMORY.md](MEMORY.md).

Legenda de origem: **[código]** verificado no código da extensão · **[protótipo]** reproduzido nos protótipos de `prototypes/` (inspeção externa de 29/10; podem não existir na extensão em produção) · **[ambiente]** ferramenta/processo. Prioridade: P1 corrigir antes de aprovar o ciclo principal, P2 antes de implementar o conjunto, P3 acabamento.

## 1. Extensão (código atual)

| ID | Pri. | Onde | Problema | Correção esperada |
|---|---|---|---|---|
| E15 | P3 | `index.html` | Protótipo legado, fora do manifesto, aponta para `style.css` inexistente. | Arquivar ou remover após confirmação. |
| E16 | P3 | Resumo de tempo de tela (não commitado) | Usa vermelho/verde para julgar e não abre pela pergunta (IDEAS.md §2). | Aplicar as correções antes de commitar. |
| E18 | P2 | Modais da V0 restantes (configurações, música) | Continuam com `animateModal()`: sem foco contido nem fundo inerte (M09), e o vidro translúcido fica pouco legível sobre a tela Hoje nova. Fecham com qualquer clique fora, por isso os botões novos que os abrem precisam de `stopPropagation()`. | Leitor, terço e exame foram substituídos por subtelas na fase 3; bloqueador migrado para `#protecao` na fase 4. Restam as fases 6 (música) e 7 (configurações). |
| E19 | P3 | `today.js` (provisórios da fase 2) | O convite "Encerrar o dia" ainda abre o exame da noite; o seletor de som da preparação lista só as playlists (YouTube/Spotify). Respiro e Evangelho por idioma foram implementados na fase 3. | Restam ritual da noite na fase 5 e Som na fase 6. |
| E20 | P3 | Validação da fase 2 | A fase 2 foi validada num simulador das APIs `chrome.*` (página servida por http com o `sw.js` rodando num iframe), não na extensão carregada sem pacote. Sincronização entre duas abas reais, alarmes reais do SW, regras DNR aplicadas de fato e a notificação do Angelus não foram exercitadas. | Repetir o roteiro "Fluxo completo com sessão curta" do `PLANO_V1_ORA.md` com a extensão carregada. |
| E17 | P3 | Sync | Mudança de idioma vinda de outro dispositivo só se aplica por completo na próxima abertura; limite "por hora" do bloqueador precisa de teste manual. | Teste manual com dois perfis. |

## 2. Protótipos (correções M01–M13, detalhe em `RELATORIO_MELHORIAS_ORA.md` §3)

Valem como critério de aceitação ao reimplementar na extensão/app; não presumir que existam na produção.

| ID | Pri. | Problema |
|---|---|---|
| M01 | P1 | Abrir sessão mobile pausada retoma a contagem. Somente "Retomar" pode reiniciar. |
| M02 | P1 | Ritual matinal perde atividade e duração ao ir para Hoje/foco. |
| M05 | P1 | Texto a 200% corta ação mobile, tarefas e controles do leitor; Lectio perde espaço útil. |
| M07 | P2 | Destinos mobile abrem composições desktop e perdem contexto/sessão. |
| M08 | P2 | "Escolher som" troca a opção imediatamente em vez de abrir seletor. |
| M09 | P2 | Shift+Tab escapa do diálogo para painel fechado (foco não contido, fundo não inerte). |
| M13 | P2 | Sessão ativa coexiste com "Começar foco" e proteção de repouso; estados incoerentes entre Hoje/resumo/Proteção. |

Outros achados dos protótipos: busca em Rezar atualiza região fora da vista em tela estreita, ignora categoria e não normaliza acentos; atalho global de Espaço no terço/Respiro intercepta botões focados; histórico substituído a cada transição (Voltar do navegador); rascunho do ritual noturno se perde ao sair/reabrir; mensagem de erro de "salvar" aparece ao falhar exportação; rezar o 4º dia da novena não abre outro texto.
Não registrado como confirmado: "salto duplo" de Espaço no terço (não reproduzido).

## 3. Documentação e processo

| ID | Problema | Ação |
|---|---|---|
| D02 | `RESUMO_ORA.md` traz a data "2 de setembro de 2026" no cabeçalho, inconsistente com os demais documentos (outubro/2026). | Conferir e corrigir. |
| D03 | Os documentos de análise não registram implementação; não tratar propostas como decisões aprovadas. | Confirmar com o usuário antes de implementar. |

## 4. Armadilhas de ambiente e ferramentas

- **`prototypes/` entra na extensão** com "Load unpacked". Excluir ao empacotar para a loja.
- Abrir protótipos via `file://` foi bloqueado no navegador do agente; usar `python -m http.server 5517 --directory prototypes`.
- `21st review` (CLI) não está instalado; não contar com ele para verificar UI.
- Em shell Windows, heredoc grande falhou ao gravar `IDEAS.md`; usar Write/Edit.
- Protótipos usam `confirm`/`prompt` nativos no mobile (devem virar telas desenhadas) e o Evangelho do teste é tradução escrita para o protótipo.
- Contraste sobre a fotografia não é medido automaticamente; conferir com imagens reais.
- Capturas em moldura 360×740 dentro de janela 360×640 mascaram a área lógica; repetir sem escala.
- Verificar licença e origem de cada conteúdo (traduções têm direitos autorais, mesmo que a obra seja domínio público).
- Preços, funcionalidades e métricas de concorrentes não foram revalidados integralmente.

## Resolvidos

| ID | Data | Onde | Resolução |
|---|---|---|---|
| E08 | 02/11/2026 | `styles/modules/prayers.css` | Regra inválida `#prayer-reader:hover { transform: -50%, -50% }` removida; com E09 o leitor não reage mais a hover. Fase 0 do `PLANO_V1_ORA.md`. |
| E09 | 02/11/2026 | `styles/components/glass-panels.css` | Hover só em `.glass-panel` interativos (`a`, `button`, `[role="button"]`, `.action-btn`). Os `#…:hover { transform }` compensatórios dos modais ficaram redundantes e saem quando cada tela for migrada. Fase 0. |
| E10 | 02/11/2026 | `styles/utils/animations.css` | `prefers-reduced-motion` e `html[data-motion="reduce"]` reduzem animações e transições a corte simples. Fase 0. |
| D01 | 02/11/2026 | `CLAUDE.md`, `AGENTS.md` | Documentam a suíte (`node tests/run.js` ou `tests/tests.html`). Fase 0. |
| E01 | 03/11/2026 | `scripts/modules/tasks.js`, `scripts/shared/tasks-core.js` | Tarefa não guarda mais ciclos: concluir só grava `completedAt`. Sessões são registradas pelo SW em `ora_sessions` (`sessions-core.js`) e a migração da 1.2.0 não inventa sessões a partir de ciclos. Fase 1. |
| E02 | 03/11/2026 | `tasks.js`, `focus.js`, `sw.js` | `incrementActiveTaskCycle` removido: completar as sessões previstas registra a sessão e mantém a tarefa aberta (aviso "Sessão de foco concluída"). A pergunta "concluiu ou continua?" entra na tela de sessão concluída (fase 2). Fase 1. |
| E03 | 03/11/2026 | `tasks.js`, `today.js` | Painel "Tarefas (n)" com Hoje (ordem escolhida, subir/descer) e Depois (captura rápida); o cartão "Próximo passo" usa `TasksCore.nextStep`. Fase 2. |
| E04 | 03/11/2026 | `tasks.js` | O ritual matinal automático saiu (nada abre sozinho na primeira aba do dia); volta como convite na fase 5. Fase 2. |
| E05 | 03/11/2026 | `tasks.js`, `tasks-core.js` | Edição da tarefa com "Repetir" e escolha dos dias (D S T Q Q S S, sugere dias úteis); `TasksCore.makeRecurring` cria a rotina a partir de uma tarefa. Fase 2. |
| E07 | 03/11/2026 | `tasks.js` | Conclusão por `input type=checkbox` com nome acessível ("Concluir “…”"), foco visível e teclado. Fase 2. |
| E12 | 03/11/2026 | `today.js`, `sw.js`, `focus.js` | Tela única de sessão concluída (pausa curta, ou pausa longa editável + Respiro, mais uma sessão, voltar ao início); sugestão de terço e check-in emocional do fim do pomodoro removidos. Fase 2. |
| E13 | 03/11/2026 | `today.css` | Relógio menor (Cinzel 600) e, durante a sessão, a atividade vem antes do cronômetro; `dashboard.css` removido. Fase 2. |
| M01 | 03/11/2026 | `today-core.js`, `sw.js` | Sessão pausada continua pausada ao recarregar ou abrir outra aba; só "Retomar" volta a contar (verificado no simulador). Fase 2. |
| M13 | 03/11/2026 | `today-core.js` | Um único resolvedor de estado: com sessão em andamento não há "Começar foco" nem convite, e a pílula da Proteção mostra o estado real. Fase 2. |
| E06 | 03/11/2026 | `tasks-core.js` `rolloverDay` | Concluídas de dias anteriores vão para `ora_tasks_history` em vez de sumir; "Limpar concluídas" também guarda no histórico. Fase 1. |
| E11 | 03/11/2026 | `rosary.js`, `rezar.css` | Terço em subtela com uma única área de rolagem; botões de contas de 32×44 px, barra dos cinco mistérios e Anterior/Próxima. CSS legado removido. Fase 3 — commit `feat: painel Rezar com Evangelho, Biblioteca, terço e Respiro`. |
| M03 | 03/11/2026 | `reader.js`, `reader-core.js` | Posição por oração/idioma (e Evangelho/data), restaurada após layout, fontes e arte, antes do registro de progresso; recarga na metade verificada na extensão real isolada. Mesmo commit da fase 3. |
| M04 | 03/11/2026 | `rosary.js`, `rosary-core.js` | Posição, mistérios, intenção, idioma e modo de texto realmente persistidos. Retomada na 6ª Ave-Maria do 3º mistério em uma nova aba verificada; gravação rejeitada não avança a conta. Mesmo commit da fase 3. |
| M12 | 03/11/2026 | `respiro.js`, `today.js`, `blocked.js` | Respiro sem cronômetro, com forma lembrada e origem no estado da aba. Retorno a Hoje, sessão concluída e tela de bloqueio verificado. Mesmo commit da fase 3. |
| E14 | 04/11/2026 | `manifest.json` | `<all_urls>` substituído por `["https://*/*", "http://*/*"]` em `host_permissions` e `web_accessible_resources`, removendo esquemas não web (`file:///*`, `ftp://*/*`) e entradas redundantes. Fase 4. |
| M06 | 04/11/2026 | `blocker-core.js`, `blocker.js` | `describeConsequence` e `consequenceDetails` respeitam `schedule.days`; regra de seg–sex avaliada na sexta à noite anuncia "segunda às 09:00" e nunca "amanhã". Fase 4. |
| M10 | 04/11/2026 | `blocker-core.js`, `blocker.js` | Perfis com `enabled: false` nunca entram nas regras DNR (`buildRulesFromProfiles`) nem são anunciados como bloqueados. Fase 4. |
| M11 | 04/11/2026 | `blocker.js` | `Salvo` (`#saved.show`) só aparece após `updateDynamicRules` e `chrome.storage.local.set` concluírem sem erro; falhas exibem `.banner.err` com `Tentar novamente` e preservam as regras anteriores. Fase 4. |
