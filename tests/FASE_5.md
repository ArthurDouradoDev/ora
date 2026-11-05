# Verificação da fase 5 — Frutos, rituais e tempo de tela

Data: 04/11/2026. Referência: `PLANO_V1_ORA.md`, fase 5; composição `prototypes/05-frutos-ritual.html` (`#frutos`, `#frutos-vazio`, `#ritual-manha`, `#ritual-noite`).

## Entrega

1. **Núcleos puros (novos):**
   - `scripts/shared/frutos-core.js`: `periodRange` (semana de segunda a domingo, mês do calendário, dias montados pelo calendário local para não duplicar dias na virada do horário de verão), `summarize` (dias, totais, "Dias com Ora" via `CounterCore`), `synthesisParts`, `monthLevel`, `appendPractice`/`normalizeEvents` (registro de práticas + `ora_exam_logs`, inclusive os migrados da 1.1.5) e reflexões (`upsertReflection`, `pastReflections`, `questionIndex`).
   - `scripts/shared/rituals-core.js`: convites da manhã (4h–12h, some com foco iniciado ou feito hoje) e da noite (21h–4h, a madrugada é do dia anterior), rascunhos por dia, `applyMorningPriority` (M02) e `nightProtection` (regras de horário em vigor ou que começam nas próximas 4 h).
   - `scripts/shared/screentime-core.js`: `aggregate` por domínio e período, `topDomains`, `prune` (62 dias). Nenhuma classificação em bom/ruim.
   - `RemindersCore`: convite `morning` (o primeiro da manhã), janela de madrugada para "Encerrar o dia" e opção `skip` (convites escondidos pelos rituais já feitos).
2. **Registro de práticas** (`scripts/modules/practices.js`, `ora_practice_log`): terço e terço da misericórdia concluídos, oração aberta no leitor (uma vez por oração e dia), Lectio concluída, Respiro concluído, exame concluído (`ref` = id do log) e rituais.
3. **Frutos** (`scripts/modules/frutos.js`, `styles/modules/frutos.css`): Semana/Mês com período navegável (sem períodos futuros), síntese em frase ("Nesta semana: **3 sessões de foco** (1h27), **terço em 1 dia**, **oração em 2 dias** e **1 exame**."), faixa da semana ou calendário do mês com "Sem registro" tracejado, legenda, texto do que é medido, contador "Dias com Ora", "Detalhes de uso" e "Para refletir" (pergunta do período, Guardar só depois da gravação confirmada, falha com o texto preservado e "Tentar de novo", Outra pergunta, reflexões anteriores).
4. **Tempo de tela** como bloco de Frutos (`scripts/modules/screentime.js`): abre pela pergunta, números atrás de "Ver o tempo de tela", barras neutras, sem deltas coloridos (E16). A notificação das 13h/19h abre `ora.html#frutos/tela`. O SW guarda 62 dias e ganhou `screentime:flush`; `screentime:getReport`, o modal antigo, `#btn-screentime` e `screentime.css` saíram.
5. **Rituais** (`scripts/modules/rituals.js`, diálogo `#ritual`): só abrem pelo convite de Hoje; três passos com saída sempre visível e Esc; rascunho gravado a cada passo e restaurado ao reabrir no mesmo dia (o convite passa a dizer "Continuar").
   - Manhã: prioridade (tarefas de Hoje ou "Outra coisa…"), intenção do dia opcional, começo com duração; "Começar foco" abre a preparação com atividade e duração, "Ir para Hoje" deixa a prioridade como próximo passo (M02).
   - Noite: tema `noite`, Gratidão, Reflexão com "Fazer o exame completo" (abre o exame da noite em Rezar e volta ao Encerramento ao concluir), Encerramento com oração breve e a regra de proteção da noite quando existe ("Bloqueio das 22h às 7h: Redes sociais. Bom descanso."), boa-noite com a gratidão do dia. As respostas ficam em `ora_rituals`.
6. **Limpeza:** check-in do pomodoro (`pomodoroCheckin` em `data/exam.json`) removido; placeholder de Frutos, `data-legacy-open`, CSS `.view-placeholder` e os namespaces i18n `views` e `screentime` removidos. Configurações ganham "Convite para começar o dia" (`ora_reminder_morning`, sincronizado).

## Decisões tomadas na implementação (confirmar)

- Semana de **segunda a domingo** (como o calendário do protótipo), não os "últimos 7 dias".
- O **ritual da noite concluído conta como exame da noite** em Frutos (um por dia; não soma se já houve exame no dia).
- Em Frutos, "oração" inclui terço, terço da misericórdia, oração aberta no leitor, Lectio e Respiro; tempo de tela sozinho não transforma o dia em registro.
- O convite da manhã vem antes do Angelus das 6h–8h; "Sair" do ritual guarda o rascunho e mantém o convite ("Agora não" no convite adia até o próximo horário).
- Na noite, "Pular" só aparece com a resposta vazia (não descarta texto digitado).
- Frase da proteção em forma neutra ("Bloqueio até 7h: Redes sociais.") para não errar a concordância com nomes de perfil.
- O texto do Encerramento usa só as duas frases das Completas do protótipo (sem o responsório), nos três idiomas.

## Testes reproduzíveis

1. `node tests/run.js`: **399 testes em 36 grupos** (novos: `FrutosCore — períodos`, `FrutosCore — síntese e dias`, `FrutosCore — registro de práticas e reflexões`, `RitualsCore — convites e rascunhos`, `RitualsCore — prioridade da manhã e proteção da noite`, `ScreentimeCore — por domínio e período`).
2. `tests/tests.html` servido por HTTP: os mesmos 399.
3. `node tests/phase5-browser.cjs`: **53 verificações** com a extensão carregada sem pacote num Chromium isolado e o relógio da página fixado: Frutos vazio e com uma semana de dados, nenhuma cor vermelha/verde visível, mês e navegação, reflexão guardada/recarregada e falha de gravação, bloco de tempo de tela e rota `frutos/tela`, ritual da manhã (nada abre sozinho, rascunho, M02), registro de oração no leitor, ritual da noite (tema, sair no passo 2 e voltar após recarregar, regra de proteção, boa-noite), exame completo voltando ao Encerramento, 800×600 com texto a 200% e movimento reduzido, foco contido no ritual, pt/en/es sem chaves cruas e nenhum erro na página.
4. Regressão: `tests/phase3-browser.cjs` (45), `tests/phase4-browser.cjs` (43) e `tests/leave-guard-browser.cjs` (40) continuam passando.

## Não verificado

- Notificação real das 13h/19h abrindo Frutos (o clique foi exercitado só pela rota `frutos/tela`).
- Comparação lado a lado com o protótipo servido em `python -m http.server 5517 --directory prototypes` (feita pelas capturas, não em paralelo).
- Leitor de tela real.
