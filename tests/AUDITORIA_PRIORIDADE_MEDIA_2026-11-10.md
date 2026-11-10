# Correções da auditoria — prioridade média

Data: 10/11/2026 (America/Sao_Paulo). Base: commit `4ed4412`.

Escopo: B05–B11 de `RELATORIO_AUDITORIA_BUGS_ORA_2026-11-10.md`.
O relatório original foi preservado como registro da auditoria. Este documento
registra as correções implementadas e os resultados das validações.

## Resultado por problema

| ID | Correção e evidência |
| --- | --- |
| B05 | Já corrigido na base: o fallback usa o hostname real e `hit.evaluation.reason`. A regressão real de navegação confirmou domínio, perfil, motivo e URL original nos bloqueios por foco, horário e limite diário. |
| B06 | Frutos só descarta o rascunho se ele ainda corresponder ao texto submetido. A conclusão de uma gravação antiga não anuncia que o texto novo foi salvo nem altera a pergunta de outro período. Testados atraso de gravação, digitação durante o salvamento, troca de período, retorno ao rascunho e salvamento da versão mais recente. |
| B07 | A leitura e gravação de práticas passam pelo Web Lock `ora-practices-write`, compartilhado pelas abas da extensão, além da fila da página. Duas abas com gravações sobrepostas preservam ambos os eventos; a deduplicação continua funcionando. Uma falha de gravação devolve `false` e libera as gravações seguintes. |
| B08 | O merge de rotinas exclui a marca pulada quando seu modelo remoto deixa de existir, seguindo a regra de `TasksCore.stopRecurrence`. Ocorrências abertas e concluídas são preservadas como tarefas comuns. Testados merge seguido de normalização, idempotência, rotina ainda existente e o listener real de `chrome.storage.sync`. |
| B09 | Todos os ciclos de leitura, alteração e gravação de `ora_screentime` compartilham uma fila no SW. Três lotes de oito mensagens acrescentaram exatamente 24 abas; oito mensagens adicionais concorrentes com oito registros de sete segundos preservaram 32 abas e 56 segundos. Falha induzida retornou erro, sem contaminar o incremento seguinte. |
| B10 | Os seis pesos do Phosphor Web 2.1.1 foram empacotados em `assets/vendor/phosphor/`, com fontes WOFF2 e licença MIT. `ora.html`, `blocked.html` e o carregador legado usam os arquivos locais. Validada a primeira abertura offline em perfil novo, incluindo Configurações, interceptação e carregamento dos seis pesos. E23 foi movido para Resolvidos em `ERRORS.md`. |
| B11 | Atualizações do cache litúrgico e da arte substituem apenas a seção do Evangelho na página inicial de Rezar. O nó da busca permanece intacto, preservando valor, foco e seleção. O teste confirmou atualização do conteúdo, envio da busca à Biblioteca e funcionamento dos botões do Evangelho atualizado. |

## Validação executada

Todos os testes de navegador usaram a extensão carregada no Chromium com perfis
temporários isolados. O perfil pessoal do navegador não foi usado.

| Comando ou verificação | Resultado |
| --- | --- |
| `node tests/run.js` | 520/520 testes, 44 grupos |
| `node tests/audit-medium-priority-browser.cjs` | 31 verificações, sem exceções não tratadas nas páginas |
| `node tests/audit-high-priority-browser.cjs` | 88 verificações, incluindo os três cenários de B05 |
| `node tests/phase3-browser.cjs` | 45 verificações |
| `node tests/phase4-browser.cjs` | 45 verificações |
| `node tests/phase5-browser.cjs` | 53 verificações |
| `node tests/phase6-browser.cjs` | Passou |
| `node tests/phase7-browser.cjs` | Passou |
| `node tests/phase8-browser.cjs` | Passou |
| `node tests/leave-guard-browser.cjs` | 45 verificações |
| `node --check` nos JS/CJS fora de `prototypes/` | 75 arquivos sem erros |
| Leitura dos JSON fora de `prototypes/` | 16 arquivos válidos |
| Referências de fontes no CSS empacotado | Todos os arquivos locais existem |
| `git diff --check` | Sem erros de whitespace |

### Ajuste da medição a 400 × 300

A primeira execução da fase 3 repetiu a falha registrada na auditoria. Uma
execução diagnóstica mediu `innerWidth = 400`, mas o layout anterior ainda tinha
800 px imediatamente após o redimensionamento. Após dois quadros de renderização,
`scrollWidth = 400`, sem elementos ultrapassando a borda direita.

O teste agora aguarda esses quadros antes de medir, mantendo a asserção original.
A suíte completa foi executada novamente e passou. Nenhuma regra de estilo foi
alterada para essa verificação.

## Evidências locais

- Cenários médios e capturas offline/Rezar:
  `C:/Users/arthu/AppData/Local/Temp/ora-medium-qa-3xhru3/`
- Regressão anterior, incluindo B05:
  `C:/Users/arthu/AppData/Local/Temp/ora-audit-high-1XWeeJ/`
- Fase 3 após sincronizar a medição:
  `C:/Users/arthu/AppData/Local/Temp/ora-phase3-qa-Fds8dR/`
- Diagnóstico da largura:
  `C:/Users/arthu/AppData/Local/Temp/ora-phase3-width-diagnostic.log`

## Limites

As evidências cobrem o Chromium local com extensão sem compactação. Não houve
teste de pacotes publicados em outros navegadores nem sincronização entre
dispositivos físicos. A concorrência entre abas, as mensagens, o armazenamento
e o fluxo de sincronização foram exercitados nas APIs reais da extensão.

Não há etapa de build neste projeto. Para aplicar as alterações, recarregue a
extensão no gerenciador de extensões do navegador e reabra a nova aba.
