# Verificação da fase 8 — Tempos litúrgicos: Advento

Data: 06/11/2026. Referência: `PLANO_V1_ORA.md`, fase 8 (com o contador de preparação e a prioridade entre temas, decididos em 06/11).

## Entrega

1. **`scripts/shared/liturgical-calendar.js`** (puro, offline): `easter`, `adventStart`, `adventWeek`, `isGaudete`, `ashWednesday`, `palmSunday`, `holyThursday`, `pentecost`, `epiphany`/`baptismOfTheLord`/`christmasSeasonEnd` por região (`br`/`us` com Epifania no domingo, `universal` em 06/01), `immaculateConception` (num domingo passa para a segunda), `seasonFor`, `michaelLent`, `principalFeast`, `events`, `eventOn`, `nextEvent` e `daysUntil` (dias de calendário locais, imune ao horário de verão). A região segue o idioma da interface (`regionFor`: pt → br, en → us, es → universal).
2. **`scripts/shared/seasons-core.js`** (puro): `resolveSeason(date, registry, region)`.
   - Só temas `enabled: true` contam, inclusive os contadores.
   - Hoje tem uma linha: festa no próprio dia > tempo > contador; empate pela `priority`.
   - Com tema ativo, o contador mais próximo substitui a dica ("4ª semana do Advento · faltam 4 dias para o Natal").
   - Rezar mostra o símbolo do tema ativo de maior prioridade que tiver um (na Imaculada, a coroa continua).
3. **`data/seasons.json`**: Advento (ativo; contadores do Advento e do Natal, 7 dias), Imaculada (ativa; contador de 2 dias), Natal, Quaresma, Páscoa e Quaresma de São Miguel registrados e desabilitados.
4. **`scripts/modules/seasons.js`**: preenche `#today-season` e `#rezar-season`, aplica `html[data-season]` e `--season-accent`, reavalia na virada do dia, na troca de idioma e quando `ora_debug_date` muda.
5. **Coroa do Advento**: SVG gerado em `SeasonsSystem.wreathSVG(week)` (3 velas roxas e a rosa; acesas até a semana atual; chama parada com movimento reduzido do sistema ou das Configurações). Ficou inline, e não em `assets/seasons/advent-wreath.svg` como dizia o plano, para acender as velas por classe sem duplicar o desenho.
6. **Rezar**: o ponto de encaixe saiu do rodapé e foi para o alto, logo abaixo do título, com rótulo "Tempo do Advento", semana, frase da semana e "Oração ao acender a vela" (abre o leitor).
7. **Conteúdo**: oração `advento-vela` em `prayers.json` (pt/en/es), categoria nova "Tempo litúrgico" (`season`) no filtro da Biblioteca; chaves `season.*` em pt, en e es.

## Como verificar

- `node tests/run.js` → 483/483 (grupos `LiturgicalCalendar — datas` e `SeasonsCore — tema do dia`).
- `node tests/phase8-browser.cjs` (Chromium + extensão sem pacote; `ORA_PHASE8_SCREENSHOTS=<pasta>` para capturas) percorre, com data simulada: 21/11 (nada) · 22/11 ("Faltam 7 dias para o Advento") · 28/11 ("Amanhã começa o Advento") · 29/11 (1ª vela em Hoje e Rezar) · 08/12 (Imaculada em Hoje, 2 velas em Rezar) · 13/12 (Gaudete, vela rosa, oração no leitor) · 21/12 e 24/12 (contador do Natal) · 25/12 (pontos vazios) · en/es · movimento reduzido · 800×600 · sem erros no console.
- Regressão: `phase3-browser.cjs` (Rezar, 45 checagens) e `phase7-browser.cjs` passando.
- Manual: com a extensão sem pacote, no console da nova aba ou do SW, `chrome.storage.local.set({ ora_debug_date: '2026-11-29' })`; a mudança aparece sem recarregar. `chrome.storage.local.remove('ora_debug_date')` volta para hoje.

## Observações

- A data simulada muda **só o tema litúrgico**: o relógio, a data por extenso e o Evangelho continuam no dia real. É proposital (o plano limita a simulação aos testes do tema).
- No domingo, a linha da data já mostra a celebração vinda da API ("1º Domingo do Advento") e a linha do tema repete a semana. Se ficar redundante na prática, dá para esconder a celebração quando ela for o próprio domingo do Advento.
- Pendente da fase 9: instalar o pacote e confirmar que `ora_debug_date` é ignorado (`update_url` presente).
