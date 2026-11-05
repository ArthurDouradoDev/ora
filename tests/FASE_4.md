# Verificação da fase 4 — Proteção e telas de bloqueio

Data: 04/11/2026. Referência: `PLANO_V1_ORA.md`, fase 4; composição `prototypes/04-protecao.html`.

## Entrega

Subtela `#protecao` (`#view-protecao`) substituindo o modal legado `#blocker-modal` e `styles/modules/blocker.css`:

1. **Modelo de perfis (`scripts/shared/blocker-core.js`)**:
   - Perfis `{ id, name, icon, enabled, sites[], rules: { duringFocus, schedule: { enabled, from, to, days[] }, dailyLimitMin, temporaryAccess: { enabled, minutes: 5, perDay: 3 } } }`.
   - `buildRulesFromProfiles`: gera regras DNR de redirecionamento apenas para perfis com `enabled !== false` que estejam bloqueando no momento (foco ativo, janela de horário ativa no dia da semana correspondente ou limite diário atingido). Perfis desmarcados nunca entram nas regras DNR nem são anunciados como bloqueados (M10).
   - `describeConsequence` e `consequenceDetails`: frase viva de consequência respeitando os dias da semana (`days[]`); uma regra de segunda a sexta avaliada na sexta à noite anuncia `"segunda às 09:00"` e nunca `"amanhã"` (M06).
   - `nextChange` / `nextChangeInfo`: calcula a próxima transição real de bloqueio ou liberação para a UI e para o alarme do Service Worker.
   - Acesso temporário por perfil/dia (`canUseTemporaryAccess`, `consumeTemporaryAccess`): permite até 3 acessos de 5 minutos por dia (1º, 2º e 3º permitidos; 4º negado).

2. **Migração (`scripts/shared/migrate-core.js`)**:
   - Converte `blocker_sites` + `blocker_config` legados em um perfil `"Meus sites"` (`id: 'meus-sites'`) com regras equivalentes (foco, janela de horário ou bloqueio contínuo e limite diário), preservando trava por versículo (`lock`), pausa contemplativa (`reenableAt`) e contagem de acessos do dia.

3. **Subtela Proteção (`scripts/modules/blocker.js`, `styles/modules/protecao.css`, `ora.html`)**:
   - Cabeçalho e cartão de estado (`Ativa`, `Em foco`, `Pausada`, `Sem permissão`, `Desligada`).
   - Lista de perfis com `input[type="checkbox"]` acessível (M10), ícone, nome, resumo da regra em uma linha, domínios, barra de uso diário (`role="meter"`), pílula de estado e botão `Editar`.
   - Editor integrado (`aside#protecao-editor`) com chips de domínios, `Durante sessões de foco`, `Em um horário` (`Das`/`Até` + `D S T Q Q S S` com `aria-pressed`), `Limite diário`, `Acesso temporário` (`Não permitir` / `5 min, até 3× por dia`) e caixa `O que vai acontecer` (`#consequence`, `aria-live="polite"`).
   - Persistência e confirmação das regras DNR (M11): `Salvo` (`#saved.show`) só aparece após `chrome.declarativeNetRequest.updateDynamicRules` e `chrome.storage.local.set` concluírem sem erro. Em falha, exibe `.banner.err` (`role="alert"`) com `Tentar novamente` e preserva as regras anteriores.
   - Estado sem permissão (`sem-permissao`): detecta ausência de permissão ou `ora_debug_blocker_no_permission` e exibe `.banner.err` com `Abrir configurações da extensão` e explicação.
   - Pausa contemplativa (`#protection-pause-dialog`), trava por versículo (`#protection-lock-dialog`), criação de perfil (`#protection-add-dialog`), exclusão (`#protection-delete-dialog`) e prévia `Ver como aparece` (`#protection-preview-scrim`) nos 3 estados web (`Durante o foco`, `Fora do horário`, `Limite atingido`, sem botão de iOS).

4. **Pílula do cabeçalho (`scripts/modules/protection.js`)**:
   - Exibe o estado real (`Proteção ativa`, `Proteção · em foco`, `Proteção pausada até HH:MM`, `Proteção sem permissão`, `Proteção desligada`, `Proteção · sem sites`) e resumo por perfil no popover, navegando para `#protecao`.

5. **Página de interceptação (`blocked.html`, `scripts/blocked.js`)**:
   - Cartão de interceptação para `Durante o foco` (mostrando tarefa ativa e minutos restantes), `Fora do horário` (janela do perfil e horário de liberação) e `Limite atingido` (minutos usados hoje e liberação à meia-noite).
   - Fluxo de confirmação de acesso temporário (`5 min, restam N hoje`), criando regra `allow` dinâmica (`id >= 1000`) e alarme de revogação no SW; no 4º acesso do dia, oculta o botão e informa que os 3 acessos diários já foram usados.
   - Link `Fazer um respiro` (`#blocked-respiro`) abre `#rezar/respiro` com `from=blocked` e retorna à página de bloqueio ao concluir ou sair (M12).

6. **Service Worker (`sw.js`) e Manifesto (`manifest.json`)**:
   - `syncBlockerRules`: reconstrói as regras DNR a partir dos perfis e do contexto atual (foco, pausa, horário, tempo de tela) e agenda `blocker_schedule_transition` para a próxima mudança de horário ou meia-noite, funcionando mesmo com `ora.html` fechada.
   - Atualização imediata das regras DNR ao iniciar, retomar, interromper ou concluir sessão de foco.
   - `manifest.json` (E14): substituído `<all_urls>` por `["https://*/*", "http://*/*"]` em `host_permissions` e `web_accessible_resources`, removendo esquemas não web (`file:///*`, `ftp://*/*`, `ws://*/*`) e entradas redundantes. Justificativa da permissão: o usuário pode cadastrar qualquer domínio HTTP/HTTPS em seus perfis de proteção, e a ação `redirect` do `declarativeNetRequest` exige permissão de host para o domínio redirecionado.

## Testes reproduzíveis

1. `node tests/run.js`: 334 testes em 30 grupos (incluindo `BlockerCore — perfis` e `MigrateCore — bloqueador`).
2. `tests/tests.html`, servido por HTTP: os mesmos 334 testes no navegador com fixtures.
3. `node tests/phase4-browser.cjs`: suíte de aceitação com a extensão carregada sem pacote em perfil isolado do Chromium (Playwright).
