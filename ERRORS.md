# ERRORS.md — Problemas conhecidos e armadilhas do Ora

Registro de defeitos, riscos e armadilhas levantados nas análises de 28–30/10/2026. Consultar antes de mexer nas áreas citadas e **atualizar** quando um item for corrigido (mover para "Resolvidos" com data e commit). Contexto geral: [MEMORY.md](MEMORY.md).

Legenda de origem: **[código]** verificado no código da extensão · **[protótipo]** reproduzido nos protótipos de `prototypes/` (inspeção externa de 29/10; podem não existir na extensão em produção) · **[ambiente]** ferramenta/processo. Prioridade: P1 corrigir antes de aprovar o ciclo principal, P2 antes de implementar o conjunto, P3 acabamento.

## 1. Extensão (código atual)

| ID | Pri. | Onde | Problema | Correção esperada |
|---|---|---|---|---|
| E01 | P1 | `scripts/modules/tasks.js` `toggleTaskStatus` (l. ~577) | Concluir manualmente preenche os ciclos previstos, registrando ciclos que não aconteceram. | Separar conclusão de tarefa de sessões realizadas. |
| E02 | P1 | `tasks.js` `incrementActiveTaskCycle` (l. ~767) | Atingir os ciclos previstos conclui a tarefa automaticamente (estimativa vira "terminado"). | Perguntar se concluiu ou quer continuar. Resolver antes do painel Frutos. |
| E03 | P2 | `tasks.js` `renderHomeWidget` (l. ~861) | Hoje mostra as 3 primeiras pendentes, não prioridades escolhidas; pendências antigas ocupam o espaço. | Seleção explícita do que pertence a Hoje. |
| E04 | P2 | `tasks.js` `maybeShowMorningRitual` (l. ~420) | Ritual matinal abre automaticamente na primeira aba do dia e pode interromper ação rápida. | Não interceptar início rápido; manter opcional e com saída. |
| E05 | P2 | `tasks.js` (recorrência) | Recorrência = repetir diariamente; não atende dias úteis/semanal. | Frequências com dias definidos, separadas de tarefas pontuais. |
| E06 | P2 | `tasks.js` `checkDailyReset` | Tarefas pontuais concluídas somem na virada do dia (só resta agregado). | Preservar histórico útil de concluídas. |
| E07 | P2 | `tasks.js` / `.task-checkbox` | Controles de conclusão são `div` com clique: sem semântica de checkbox nem teclado. | Elementos semânticos, foco visível, nome acessível. |
| E11 | P2 | `styles/modules/rosary.css` | Modal do terço com rolagem vertical + texto com limite de 200 px + rolagem horizontal das contas; contas de 14 px. | Área de toque ≥ 24×24 CSS px ou controles equivalentes; reduzir rolagens concorrentes. |
| E12 | P2 | `focus.js` `onPhaseComplete` | Fim do foco pode disparar sugestão de terço e, na pausa longa, também check-in, como decisões separadas. | Uma única transição de fim de sessão. |
| E13 | P3 | `dashboard.css` | Relógio de até `8rem` domina mesmo quando há atividade em andamento. | Atividade ganha prioridade ao iniciar trabalho. |
| E14 | P3 | Permissões do manifesto | `<all_urls>` não é exigência geral de regras DNR dinâmicas; precisa ser justificado ou reduzido antes da publicação. | Revisar regras efetivamente usadas. |
| E15 | P3 | `index.html` | Protótipo legado, fora do manifesto, aponta para `style.css` inexistente. | Arquivar ou remover após confirmação. |
| E16 | P3 | Resumo de tempo de tela (não commitado) | Usa vermelho/verde para julgar e não abre pela pergunta (IDEAS.md §2). | Aplicar as correções antes de commitar. |
| E17 | P3 | Sync | Mudança de idioma vinda de outro dispositivo só se aplica por completo na próxima abertura; limite "por hora" do bloqueador precisa de teste manual. | Teste manual com dois perfis. |

## 2. Protótipos (correções M01–M13, detalhe em `RELATORIO_MELHORIAS_ORA.md` §3)

Valem como critério de aceitação ao reimplementar na extensão/app; não presumir que existam na produção.

| ID | Pri. | Problema |
|---|---|---|
| M01 | P1 | Abrir sessão mobile pausada retoma a contagem. Somente "Retomar" pode reiniciar. |
| M02 | P1 | Ritual matinal perde atividade e duração ao ir para Hoje/foco. |
| M03 | P1 | Leitor perde a posição ao reabrir/recarregar (a renderização atualiza o progresso antes de restaurar; causa exata a verificar). |
| M04 | P1 | Terço retoma posição fixa (3º mistério, 6ª Ave-Maria) apesar de anunciar salvamento. |
| M05 | P1 | Texto a 200% corta ação mobile, tarefas e controles do leitor; Lectio perde espaço útil. |
| M06 | P1 | Prévia de proteção ignora os dias da regra e usa "amanhã" incorretamente. |
| M07 | P2 | Destinos mobile abrem composições desktop e perdem contexto/sessão. |
| M08 | P2 | "Escolher som" troca a opção imediatamente em vez de abrir seletor. |
| M09 | P2 | Shift+Tab escapa do diálogo para painel fechado (foco não contido, fundo não inerte). |
| M10 | P2 | Modelo parcial anuncia bloqueio de itens desmarcados. |
| M11 | P2 | "Guardar/Salvo" não comprova persistência após recarga. |
| M12 | P2 | Respiro retorna sempre à extensão (Hoje), independentemente da origem. |
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
