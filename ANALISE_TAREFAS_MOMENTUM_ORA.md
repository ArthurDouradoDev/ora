# Tarefas: o que trazer do Momentum para o Ora

Análise de 09/11/2026. Fontes: duas gravações do usuário (`tarefas-momentum.mp4`, 2 min 08 s; `mover-tarefas.mp4`, 24 s) e as notas de versão do Momentum **2.26** ("The all-new Tasks experience", fev/2026) e **2.27** (subtarefas com arrastar e soltar, ago/2026). Comparado com o painel atual (`scripts/modules/tasks.js`, `scripts/shared/tasks-core.js`, `ora.html` › `#tasks-panel`).

> É proposta, não decisão. Nada foi implementado.

## 1. O que o Momentum faz (observado nos vídeos)

**Formato.** Uma janela compacta e escura ancorada no botão "Tasks" (canto inferior direito), sobre a foto. Cabeçalho: ícone + nome da lista com seletor (▾), "…" (preferências) e ⤢ (expandir). Expandida, vira duas colunas: listas à esquerda, tarefas à direita.

**Captura.** Linha "＋ New task" no fim da lista. Digita, Enter, a tarefa entra e o campo continua aberto para a próxima. Sem botão "Adicionar".

**Linha da tarefa.** Caixa + título + ícones pequenos de estado: ☀ (é de hoje), 📅 (tem data), ⑂ (tem subtarefas). O "…" só aparece no hover. Clicar no título abre a tarefa no lugar: as outras ficam esmaecidas e aparece uma linha de metadados (`📅 Thu`, ⑂).

**Menu da tarefa** ("…" ou clique direito):

| Item | Detalhe |
|---|---|
| Edit | `Ctrl+E` |
| Date | quatro ícones na própria linha: Hoje, Amanhã, Próximo domingo, calendário |
| Subtask | abre "New subtask" recuado sob a tarefa |
| Start Focus Mode | `F` (Plus) |
| Set as Daily Goal | vira a tarefa do centro da tela (Plus) |
| Duplicate | |
| Delete | `Ctrl+Del` |

**Datas.** Popover com atalhos (Today, Tomorrow, Next Sunday) e mini calendário em que hoje é um ☀. A data aparece como chip curto ("Thu").

**Listas.** Inbox, Today, Completed, Upcoming, New List (Plus) e integrações (Todoist, Asana, To Do…). *Today* é uma lista inteligente: a tarefa com data de hoje aparece nela sem sair da lista original. *Upcoming* mostra os próximos 7 dias agrupados por dia. *Completed* agrupa as concluídas por data.

**Arrastar e soltar** (segundo vídeo):
- reordenar dentro do dia;
- soltar **sobre** outra tarefa transforma em subtarefa; arrastar a subtarefa para fora devolve ao nível de cima;
- no Upcoming, ao começar a arrastar aparecem **todos os dias da semana**, inclusive os vazios, como alvos; soltar em "Tomorrow" reagenda (depois os dias vazios somem);
- levar a tarefa ao cabeçalho abre o seletor de listas, e a lista sob o cursor ganha contorno tracejado como alvo;
- fantasma semitransparente da tarefa acompanha o cursor.

**Preferências** ("…" do cabeçalho): Show top task in center (Plus) · Clear completed tasks · Add tasks: Top/Bottom · Show completed: Today (as notas citam: ir para Concluídas na hora, ficar até o fim do dia, ficar sempre) · Stay open · Always show subtasks.

**Das notas de versão, além disso:** clique direito abre o menu; ←/→ trocam de lista; ícone por lista; dia de início da semana; área de clique da caixa maior (2.26.1); Esc mais previsível (2.27); tarefas podem ser arrastadas para o Daily Goal (2.27.8).

## 2. Onde o Ora está hoje

O que já é melhor ou equivalente:
- **Próximo passo no centro** = o "Show top task in center" do Momentum, que lá é pago. O Ora já fez a escolha certa.
- **Focar** direto na linha (lá é Plus e escondido no menu).
- **Rotina por dias da semana**, com modelo e histórico (`ora_tasks_history`). O Momentum não mostrou recorrência.
- Hoje / Depois com limite de apresentação de 3, gravação com nova tentativa, teclado e nomes acessíveis.

Onde dói (pelo código e pelo relato de "tarefas pouco úteis"):

| Atrito | Onde |
|---|---|
| Duas caixas de texto com botão "Adicionar" (topo para Hoje, outra em Depois) | `ora.html` 300–331 |
| Qualquer ajuste abre um formulário grande (título, duração, repetir, subir/descer, Salvar/Cancelar/Excluir) e exige **Salvar** | `renderEditor` |
| Reordenar só pelo editor, uma posição por clique (↑/↓) | `moveTask` |
| Depois não tem "quando": não dá para dizer "amanhã" ou "quinta", então tudo vai para o mesmo saco ou entope Hoje | modelo sem data |
| Metadados em texto ("25 min · dias úteis") ocupam a linha | `metaText` |
| Concluídas de dias anteriores existem no histórico, mas não há onde vê-las | `ora_tasks_history` sem interface |
| Botão "Focar"/"Para hoje" visível em todas as linhas: ruído quando há várias | `renderItem` |

## 3. O que trazer (e como fica no Ora)

Critério: ajuda a **escolher o próximo passo e executá-lo** sem virar gerenciador completo (ANALISE_PLANO_ORA §5.3).

### P1. Leveza no dia a dia (maior ganho, pouco risco)

**1. Captura em linha.** "＋ Nova tarefa" no fim de Hoje e "＋ Anotar para depois" no fim de Depois, com aparência de linha e não de formulário. Enter adiciona e mantém o campo; Esc sai. Abrir o painel continua focando a captura de Hoje. A nova tarefa de Hoje entra **no fim** (não colocar a opção Topo/Fundo: no Ora a ordem é a prioridade, e o topo é o próximo passo).

**2. Menu "…" por tarefa** (hover, foco por teclado, clique direito; sempre visível em tela de toque). Ações rápidas que hoje exigem abrir o editor:
- Focar (`F`) — só em Hoje
- Quando: **Hoje · Amanhã · Escolher dia · Depois** (ver item 5)
- Repetir… (abre só a escolha dos dias)
- Duração (15/25/50/60/90)
- Duplicar
- Excluir (`Del`), com **Desfazer** no toast em vez da confirmação em duas etapas (exceto quando apaga uma rotina, que continua pedindo confirmação)

**3. Renomear no lugar.** Clicar no título vira campo de texto; Enter/blur grava, Esc desfaz. Acaba o "Salvar". O editor completo some: o que sobra dele vai para o menu.

**4. Arrastar para ordenar** dentro de Hoje e entre Hoje e Depois, com fantasma e marca de inserção. Arrastar para o topo = escolher o próximo passo. Alternativa de teclado obrigatória: `Alt+↑/↓` move, `Alt+→` manda para Depois, `Alt+←` traz para Hoje (anunciado por `aria-live`). Bônus que casa com o Ora: soltar uma tarefa no cartão **Próximo passo** de Hoje a coloca no topo (o Momentum acabou de fazer o mesmo com o Daily Goal). Implementação com Pointer Events (não há código de arrastar no projeto hoje) e animação FLIP pelo `Motion`, respeitando as regras de `ANALISE_ANIMACOES_ORA.md` (só `transform`, nada infinito, painel é sólido).

**5. Linha mais limpa.** Metadados viram ícones pequenos com dica: ↻ rotina, 📅 dia marcado, ⏱ duração (o número fica), contagem de passos (item 7). O botão ▶ Focar fica só como ícone e ganha destaque no hover/foco; "Para hoje" sai da linha (vai para o menu e para o arrastar). Área de clique da caixa de pelo menos 32×32.

### P2. Um "quando" leve (resolve o Depois)

**6. Dia planejado, não prazo.** A tarefa de Depois pode ter `plannedFor: 'YYYY-MM-DD'` ("Amanhã", "Quinta", calendário pequeno com hoje marcado). Na virada do dia, `rolloverDay` passa as que chegaram ao dia para o fim de Hoje (a mesma lógica que já materializa rotinas).

**6a. Painel separado por dia** (o "Upcoming" do Momentum). Com o dia planejado, o painel inteiro passa a ser lido como uma linha do tempo curta:

```
Hoje                         ← ordem = prioridade; a 1ª é o Próximo passo
  ☐ Escanear fotos      ▶
  ☐ Espanhol ↻          ▶
  ＋ Nova tarefa
Amanhã
  ☐ Ligar para a paróquia
Quinta-feira, 12
  ☐ Melhorar Ora
Mais adiante                 ← depois dos 7 dias, com a data na linha
  ☐ Renovar passaporte · 3 dez
Sem dia                      ← o Depois de hoje: captura sem decisão
  ☐ Ler a encíclica
  ＋ Anotar para depois
```

Regras:
- só aparecem os dias que têm tarefa; **ao arrastar**, os sete próximos dias surgem todos (inclusive vazios) como alvos e somem ao soltar, exatamente como no vídeo;
- soltar num dia marca `plannedFor`; soltar em Hoje tira o dia e põe na lista de hoje; soltar em "Sem dia" tira o dia;
- a janela é móvel (hoje + 6 dias), então não precisa de preferência de início da semana;
- Hoje continua especial (ordem escolhida, aviso acima de 3, ▶ Focar); os outros dias não têm ordem manual nem botão de foco, só a ordem em que foram planejados;
- rotinas **não** aparecem projetadas nos dias futuros (repetiriam a mesma linha a semana toda). Se fizer falta, um ↻ discreto no cabeçalho do dia ("+2 rotinas") resolve sem poluir;
- o nome "Depois" sai do cabeçalho: vira "Sem dia" dentro da linha do tempo.

Isso responde ao uso real que o "Depois" não cobre: deixar a semana encaminhada sem entupir Hoje.

Regras para não virar cobrança (coerente com "não usar cor para julgar"):
- não existe "atrasada" nem vermelho: se não foi feita, continua em Hoje como qualquer tarefa aberta, e o aviso de "mais de 3" já sugere mover;
- o Ora não guarda hora, só dia;
- a lista inteligente do Momentum (a mesma tarefa em duas listas) não vem: no Ora a tarefa está em um lugar só.

### P3. Avaliar depois (bom, mas maior ou menos certo)

**7. Passos dentro da tarefa** (versão Ora das subtarefas). Um nível só, lista simples de passos. O que justifica no Ora é o foco: durante a sessão, os passos da tarefa aparecem sob a atividade e podem ser marcados sem abrir o painel. Soltar uma tarefa sobre outra para virar passo (2.27) fica de fora no início: é fácil de disparar sem querer e pede um alvo de soltura muito claro.

**8. Concluídas por dia.** Ver o histórico (`ora_tasks_history`) agrupado por data, como o Completed do Momentum. Lugar natural: um link "Ver concluídas" no fim do painel, ou um bloco em Frutos. Não mostrar contagem como placar.

**9. Painel expandido.** O ⤢ do Momentum com coluna de listas só faz sentido se houver mais vistas (Hoje, Depois, Próximos dias, Rotinas, Concluídas). Uma vista "Rotinas" listando os modelos ajudaria (hoje o modelo é invisível e só se edita pela tarefa do dia). Decidir depois de 6 e 8.

## 4. O que não trazer

| Do Momentum | Por quê |
|---|---|
| Listas personalizadas, Inbox, ícones de lista | O Ora tem Hoje / Depois / Ritmo de propósito; mais listas é gerenciador |
| Integrações (Todoist, Asana, To Do…) | Fora do escopo e exige contas/servidor |
| Opção Topo/Fundo para novas tarefas | A ordem de Hoje é a prioridade; uma regra só |
| "Show completed" com três modos, "Stay open", "Always show subtasks" | Preferências demais para pouco ganho; o Ora já mantém as concluídas do dia num bloco recolhido |
| Janela flutuante pequena no lugar do painel | O painel sólido atual foi aprovado e já tem animação FLIP; o ganho do Momentum está no conteúdo, não no formato |
| ←/→ para trocar de lista | Só faz sentido com várias listas |
| Pesquisa de feedback dentro do app | — |

## 5. Ordem sugerida

1. Itens 1, 3 e 5 juntos (captura em linha, renomear no lugar, linha limpa): mexem quase só em `tasks.js`/`today.css`, sem mudar dados.
2. Item 2 (menu) com Desfazer na exclusão. O editor antigo sai aqui.
3. Item 4 (arrastar + teclado), incluindo soltar no Próximo passo.
4. Itens 6 e 6a (dia planejado + painel por dia): muda `tasks-core.js` (`plannedFor`, `rolloverDay`, `normalizeTask`, agrupamento por dia como função pura) e precisa de testes em `tests/tests.js`; migração não é necessária (campo novo opcional). O agrupamento pode vir antes do arrastar, usando o menu "Quando" para planejar.
5. Itens 7–9 só depois de usar 1–6 por alguns dias.

Até o Advento (29/11), 1–3 cabem; 4 é o mais trabalhoso (arrastar acessível); 6 é pequeno no núcleo, médio na interface.

## 6. Protótipo

`prototypes/09-tarefas.html` (09/11/2026) compara as duas estruturas na mesma tela de Hoje:

- **Linha do tempo** (recomendada): uma vista "A fazer" com Hoje · Amanhã · dias da semana · Mais adiante · Sem dia (recolhido acima de 5), e abas secundárias **Concluídas** (histórico por dia) e **Rotinas** (modelos com os dias editáveis).
- **Abas**: Hoje · Próximos · Sem dia · ✓ · ↻. Para mover entre abas arrastando, pare sobre a aba por ~0,6 s e ela abre.

Comum às duas: captura em linha, renomear clicando no título, menu "…"/clique direito (Focar, Quando em 3+2 botões, Duração, Repetir, Renomear, Duplicar, Excluir com Desfazer; nas rotinas, Pular hoje e Encerrar rotina), arrastar com os sete dias aparecendo como alvos, soltar no cartão Próximo passo, teclado (`Alt+↑↓` reordena, `Alt+→/←` adia/adianta um dia, `F` foca, `Del` exclui) e "Avançar um dia" na barra do protótipo para ver as planejadas entrando em Hoje. Regras assumidas no protótipo: rotina não sai de Hoje (só "Pular hoje"); tarefa de rotina entra no fim de Hoje, depois das prioridades escolhidas.

## 7. Perguntas para o usuário

- Depois com dia planejado: a tarefa entra em Hoje **no dia** (proposta) ou só aparece destacada em Depois?
- Excluir com Desfazer no toast, sem confirmação, está bom?
- Passos dentro da tarefa (item 7) interessam já, ou ficam para depois do Advento?
- O botão ▶ Focar deve continuar sempre visível em Hoje, ou só no hover como o "…" do Momentum?
