# Correções de alta prioridade — auditoria de 10/11/2026

Referência: `RELATORIO_AUDITORIA_BUGS_ORA_2026-11-10.md`. O relatório original registra a versão auditada; este documento registra as correções e os testes posteriores.

## Correções

| ID | Resultado |
| --- | --- |
| B01 | O fallback de navegação exige `evaluation.blocked === true`. Encontrar um perfil correspondente já não basta para redirecionar. |
| B02 | Preferências preservam a sessão, o progresso, a duração escolhida e a proteção de um foco pausado. Novas durações padrão afetam as próximas fases; somente uma fase ainda não iniciada acompanha a alteração de seu padrão. |
| B03 | O tempo de tela usa `usedMinutesForProfile(profile, { screentime }, now)` e sincroniza as regras DNR ao atingir o limite. Erros nessa atualização passam a ser registrados no console. |
| B04 | Falhas de leitura/gravação chegam ao canal de mensagens como erro. Cronômetro, total legado, histórico e alterações da proteção da sessão são persistidos na mesma chamada. Alarmes são alterados depois da gravação. Comandos e ticks do cronômetro compartilham uma fila para evitar gravações concorrentes. Se a gravação disparada pelo alarme falhar, uma nova tentativa é agendada para 30 segundos depois. |

O trecho do fallback também corrigiu B05: a página de interceptação recebe o hostname real e `evaluation.reason`, com o perfil e a URL original preservados.

Os fluxos de reiniciar/pular uma fase também restauram a proteção pertencente à sessão encerrada. A troca de dia usa a mesma gravação conjunta, sem ignorar falhas de persistência.

## Validação executada

Todos os testes de navegador usaram Chromium com a extensão sem compactação e perfis temporários isolados. As falhas de armazenamento foram induzidas apenas nesses perfis.

| Comando | Resultado |
| --- | --- |
| `node tests/run.js` | 516/516 testes, em 44 grupos |
| `node tests/audit-high-priority-browser.cjs` | 88 verificações aprovadas |
| `node tests/phase4-browser.cjs` | 45 verificações aprovadas, sem erros não tratados na página |
| `node tests/phase5-browser.cjs` | 53 verificações aprovadas, sem erros não tratados na página |
| `node tests/phase6-browser.cjs` | Aprovado |
| `node tests/phase7-browser.cjs` | Aprovado |
| `node tests/leave-guard-browser.cjs` | 45 verificações aprovadas |
| `node --check` nos arquivos `.js` e `.cjs` | 81 arquivos sem erros de sintaxe |
| `git diff --check` | Sem erros de espaços ou de formatação do diff |

### Cobertura nova

- Navegações reais com foco inativo, horário inativo, limite não atingido, perfil desabilitado e pausa contemplativa; nenhum redirecionamento nesses estados.
- Fallback ativo por foco, horário e limite, com DNR removido deliberadamente para exercitar o fallback; domínio, motivo, perfil e URL original conferidos.
- Mudança de som pela interface de Configurações durante foco pausado, demais preferências e durações, recarga da página, retomada da mesma sessão e restauração da proteção ao interromper.
- Preservação de pausa de descanso em andamento e atualização do padrão em uma fase ainda não iniciada.
- Limites de 1 e 30 minutos, incluindo fronteira de um segundo, soma de sites, subdomínios, aliases e proteção desligada.
- Rejeição da gravação ao iniciar foco, pausar, retomar, interromper, reiniciar, pular, fechar, alterar preferências, vincular tarefa, substituir sessão, iniciar descanso, voltar ao início, atualizar o cronômetro, concluir e trocar de dia.
- Nessas falhas, comparação do armazenamento antes/depois e verificação dos alarmes aplicáveis. Nenhuma alteração parcial de histórico/proteção e nenhuma resposta falsa de sucesso.
- Erro visível em Hoje e tentativa posterior bem-sucedida; conclusão concorrente registra uma única sessão e restaura o prazo e o alarme da pausa contemplativa anterior.
- Rejeição de leitura sem sobrescrever dados existentes com padrões.
- Falha induzida em um alarme real, reagendamento automático e conclusão pelo alarme posterior sem a interface do Ora aberta, com registro único e restauração da proteção.

## Aplicação local e limites

Recarregue a extensão em `chrome://extensions` ou `edge://extensions` e reabra a nova aba para carregar o Service Worker corrigido.

Esta validação cobre os cenários executados no Chromium. Não inclui publicação de pacote, execução em outros navegadores nem sincronização entre dispositivos físicos. B06–B11 permanecem fora do escopo desta correção de alta prioridade.
