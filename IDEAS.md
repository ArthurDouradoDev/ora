# IDEAS.md — Análise e backlog de ideias do Ora

Consolidado das discussões de 05/07/2026 (seção 5 em 26/10/2026, seção 6 em 27/10/2026).
Blocos: análise geral do projeto, as duas propostas detalhadas (painel "Frutos" e
oração pós-foco "Respiro"), o backlog de ideias por categoria, a análise do Ora
mobile (Android + iOS) e a análise de ideias soltas + benchmarking (Hallow,
Capela, Mapa da Fé).

---

## 1. Análise do projeto

### Pontos fortes
- **Arquitetura disciplinada**: padrão singleton (`init`/`cacheDOM`/`bindEvents`)
  consistente nos 14 módulos; a extração de lógica pura para `scripts/shared/`
  (`blocker-core.js`, `pomodoro-core.js`) permite os 72 testes sem DOM e elimina
  a triplicação de lógica entre aba, SW e página de bloqueio.
- **Diferencial de produto claro**: a "fricção emocional" do bloqueador (pausa
  contemplativa + countdown + escolha consciente de duração) e o modo sessão de
  foco são o coração da identidade do Ora.
- **Infraestrutura pronta para crescer**: `ora_daily_stats` já coleta ciclos,
  tarefas e tempo de foco; sync via `chrome.storage.sync` funciona; conteúdo
  devocional todo data-driven em JSON (orações, terço, exame).

### Fragilidades e dívidas
- `blocked.html`/`blocked.js` com strings pt hardcoded — quebra o i18n na tela
  mais "sensível" da extensão.
- `host_permissions` com `<all_urls>` (manifest.json) — necessário para o DNR
  dinâmico, mas é o maior atrito para revisão na Chrome Web Store. Documentar a
  justificativa; avaliar se `webNavigation` + `tabs` são ambos necessários.
- Mudança de idioma vinda do sync só aplica na próxima abertura de aba (caveat
  conhecido do settings.js).
- `sw.js` com ~950 linhas e três listeners `onAlarm` separados — candidato a
  modularização no espírito do `shared/`.
- `styles/base/variables.css` tem só 5 tokens; cada módulo re-declara os
  brancos-alfa na mão. Enriquecer com tokens (inclusive a rampa dourada abaixo)
  prepara o tema litúrgico.
- Distribuição apenas por download manual (modo desenvolvedor avisa a cada
  abertura do navegador — mata retenção de usuário leigo).

---

## 2. Proposta detalhada — Painel "Frutos" (estatísticas)

**Mockup navegável**: https://claude.ai/code/artifact/f90219d6-23e7-4c90-84ac-11cab47afbb2

### Tese
Um dashboard de métricas trabalha **contra** o propósito do Ora. A tradição já
tem a forma certa de olhar para trás no dia: o exame, que termina em gratidão e
propósito, não em cobrança. O painel não é algo que se monitora — é matéria-prima
para reflexão. Daí o nome: **"Frutos"**.

### Problemas do estado atual
1. **Estatísticas fragmentadas em 4 lugares** que não conversam: contador do dia
   no focus timer, "resumo de ontem" do ritual matinal, modal de screen time e
   `ora_daily_stats` coletando em silêncio.
2. **O modal de screen time contradiz a própria filosofia**: o comentário no topo
   de `screentime.js` diz "mostra dados — não diagnóstico", mas o CSS pinta os
   deltas de vermelho/verde (`.st-up`/`.st-down`) — gramática visual de app de
   bolsa. As perguntas de reflexão (o coração da feature) ficam enterradas no fim
   do scroll, atrás de dois stat tiles com enquadramento negativo.
3. **O dado mais precioso não aparece**: as tarefas já têm o campo "Ofereço
   por..." (`ora.html`, `task-intention-input`), mas a intenção nunca é agregada
   nem devolvida ao usuário.

### Integração proposta
- **Uma superfície única de revisão, dois momentos**: o ritual matinal olha
  ontem/semana; o momento noturno (fundindo screen time popup + futuro ritual
  noturno) olha hoje. Ambos renderizam do mesmo `ora_daily_stats` com a mesma
  linguagem visual. Painel completo acessível por ícone no header.
- **Três mudanças de dados** (baratas — os módulos já sabem esses momentos):
  1. Gravar eventos espirituais no `ora_daily_stats`: `rosaryDone`, `examDone`
     (rosary.js e exam.js já têm o ponto de conclusão);
  2. Gravar `intentionSeconds: { "vovó Maria": 6600 }` quando um pomodoro com
     intenção termina — habilita "você ofereceu 1h50 pela vovó Maria";
  3. Os 35 dias de retenção existentes = exatamente as 5 semanas do calendário.

### Direção de design (demonstrada no mockup)
- **Um único acento: dourado litúrgico** (rampa sequencial `#83651f → #f1d37f`,
  luminosidade monotônica validada). Cor = tempo oferecido (foco/oração); o
  resto fica nos brancos-alfa existentes. Tempo de tela é o segmento *neutro* de
  uma barra de proporção — contexto, não réu. **Zero vermelho/verde.**
- **Frase-síntese no lugar de stat tiles**: "Esta semana você ofereceu 6h40 de
  foco e rezou o terço em 4 dias."
- **Fidelidade em vez de volume**: "4 de 7 dias" em vez de somas de horas;
  domingo com rótulo dourado (dia do Senhor, não dia improdutivo); ponto branco
  = dia com oração (presença/ausência, nunca julgamento).
- **A pergunta encerra o painel**, em serifa itálica — a métrica é o material,
  a reflexão é o destino (inversão exata da ordem do modal atual).

### Primeiros passos de implementação
1. Os três campos novos no `ora_daily_stats`;
2. Neutralizar os chips vermelho/verde do screentime atual;
3. O painel como módulo novo reusando o padrão de modal existente.

---

## 3. Proposta detalhada — Oração pós-foco "Respiro"

### Estado atual e problema
Após **toda** fase de foco, `focus.js → onPhaseComplete` dispara o slide-in
"Rezar uma dezena?" (`reminders.rosary_suggestion`); o botão ▶ abre o **modal
completo do terço**. Após o 4º pomodoro há também o check-in "Como está seu
coração?" com micro-orações. Problemas:

1. **Desproporção**: uma dezena rezada com atenção leva ~4–5 min — consome a
   pausa curta inteira. A sugestão vira ruído que o usuário aprende a dispensar.
2. **Peso cognitivo**: o modal completo traz seletor de mistérios, alternância
   terço/misericórdia, idioma — demais para um respiro de 30 segundos.
3. **Colisão de estado**: o modal abre no `ora_rosary_progress` salvo — as
   Ave Marias da pausa avançam o progresso do terço *pessoal* do usuário.
   O respiro da pausa e o terço do dia são devoções distintas e não deveriam
   compartilhar estado.

### Proposta
Um modo enxuto do modal do terço — **"Respiro"**:

- **Fileira única de contas** (a visualização de contas é o charme do modal e
  deve ficar), sem seletor de mistérios/tipo/idioma extra.
- **3 Ave Marias por padrão** — liturgicamente elegante: a devoção das *Três
  Ave Marias* é tradicional e reconhecível, então o default não é arbitrário.
- **Quantidade configurável** (1–10) nas configurações do foco. Em 10, o
  respiro naturalmente converge para a dezena — continuidade com o hábito atual
  para quem já o tem.
- **Estado efêmero**: sempre começa na conta 0; não toca `ora_rosary_progress`.
- **Mensagem do slide-in ajustada**: de "Rezar uma dezena?" para algo como
  "Um respiro de oração?" (i18n pt/en/es).
- **Integração com intenções**: se a tarefa ativa tem "Ofereço por...", exibir
  no topo do respiro ("Por: vovó Maria") — e somar em `intentionSeconds` (§2).
- **Ao concluir**: registrar como oração do dia no `ora_daily_stats` (conta
  para o ponto branco do heatmap do painel Frutos — as três propostas se fecham).

### Implementação sugerida
- `rosary.js` ganha `openBreathMode(count)`: monta estrutura dinâmica
  (`count` × ave-maria + Glória final opcional), reusa `getPrayerText`, o render
  de contas e o CSS existente com uma classe modificadora (ex.: `.rosary-mini`).
- Setting `ora_break_prayer_count` (default 3) em settings.js/focus settings.
- `reminders.js → showRosarySuggestion` passa a chamar o modo respiro; um link
  discreto "rezar o terço completo" dentro do modal preserva o caminho antigo.

---

## 4. Backlog de ideias

### Prioridade alta (maior retorno, menor esforço, alinhadas ao que já existe)
1. **Tempo litúrgico como tema visual** — a API `liturgia.up.railway.app` (já
   consumida) retorna a cor litúrgica do dia. Tingir sutilmente a UI via CSS
   custom properties (roxo Quaresma/Advento, dourado Natal/Páscoa, vermelho em
   festas de mártires). Nenhum concorrente faz isso.
2. **Painel "Frutos"** — ver §2.
3. **Respiro pós-foco** — ver §3.
4. **Intenções de oração ligadas ao foco** — ao iniciar um pomodoro, oferecer a
   sessão por uma intenção; exibir no modo imersivo; agregar no painel Frutos.
   O campo "Ofereço por..." nas tarefas já existe — falta a agregação e a
   devolução ao usuário.
5. **Motor de novenas** — data-driven como o rosary.json: 9 dias, 1 oração/dia,
   progresso persistido, lembrete diário via alarmes do SW. Começar com 2–3
   populares (Imaculada Conceição, Sagrado Coração, São José).
6. **Ritual noturno** — espelho do ritual matinal: resumo do dia (stats), exame
   de consciência (módulo pronto — só orquestrar) e campo de gratidão. Fundir
   com o popup noturno do screentime num fluxo só, em vez de dois popups.

### Espiritualidade (médio prazo)
- **Lectio Divina guiada** sobre o evangelho do dia (já cacheado pelo SW):
  4 passos no formato do terço interativo, timer opcional.
- **Santo do dia** na home com uma linha de biografia — JSON local ~365
  entradas, sem API.
- **Modo Quaresma/Advento**: além do tema visual, "propósito da temporada"
  (ex.: jejum digital — apertar automaticamente o bloqueador na Quaresma, com
  contador de dias). Reusa o blocker inteiro.
- **Completas antes de dormir**: Liturgia das Horas noturna simplificada,
  integrada ao ritual noturno.

### Produtividade (médio prazo)
- **Modo foco profundo**: bloqueio total automático durante a fase de foco,
  sem lista — reusa `buildBlockRules` do blocker-core. (Já anotado no
  IMPLEMENTACAO.md.)
- **Sons ambiente locais** via WebAudio (chuva, ruído marrom) — remove a
  dependência do relay do YouTube para esse caso e funciona offline.
- **Export/import de dados** (backup JSON de tarefas, sites bloqueados,
  configurações) — protege quem troca de máquina sem conta Google.

### Fundação / distribuição (estratégico)
- **Publicar na Chrome Web Store** — maior impacto que não é código;
  pré-requisito: justificar/reduzir `<all_urls>`.
- **i18n do blocked.html** — dívida pequena, visível para 2 dos 3 idiomas.
- **Port para Firefox** — MV3 no Firefox cobre quase tudo (DNR incluído);
  maior trabalho: `browser_specific_settings` e testar o relay do YouTube.

---

## 5. Análise estratégica — Ora mobile (Android + iOS)

Registrado em 26/10/2026. Avalia levar o Ora ao celular aproveitando
bloqueadores open source existentes. Métricas medidas nos repositórios em
26/10/2026. **Status: apenas análise — nenhuma decisão tomada.**

### Tese
Os bloqueadores resolvem a parte técnica difícil (bloqueio no sistema,
proteção contra burla, NFC/QR, estatísticas); o Ora traz o sentido (para que
serve a pausa e para onde a atenção volta). Desbloqueio por frase ≈
desbloqueio pelo Evangelho; modo foco ≈ Pomodoro com intenção; estatísticas
≈ reflexão de tempo de tela/"Frutos".

### Caminhos descartados
- **App companheiro via API do Curbox** (AIDL: `REGISTER_UNLOCK_CONDITION`,
  `START_FOCUS`, `SCREENTIME_TODAY`) — exige instalar dois apps.
- **Fork congelado** (copiar uma vez e não acompanhar) — perde correções de
  bordas difíceis do sistema.
- **PWA/app web** — não bloqueia apps.
- **Código único multiplataforma** (Flutter, React Native, KMP) — o motor de
  bloqueio é nativo e totalmente diferente em cada sistema (acessibilidade no
  Android, Managed Settings + extensões no iOS); teria de ser reescrito nas
  duas pontas, jogando fora o valor dos projetos prontos. O que se compartilha
  é conteúdo e identidade, não código.

### Comparação das bases Android
| | **Curbox** | **Switchly** | **Lock** |
|---|---|---|---|
| Repositório | [curbox-android](https://github.com/curbox-app/curbox-android) | [switchly-public](https://gitlab.com/Saltyy/switchly-public) | [lock-app](https://github.com/NathanLenias/lock-app) |
| Licença | GPL-3.0 | GPL-3.0 | **MIT** |
| Tamanho | 288 arquivos `.kt` | 275 arquivos Java/Kotlin | **112 arquivos `.kt`** |
| Interface | XML Views | — | **Jetpack Compose + Material 3** |
| Commits (últimos 3 meses) | 99 — muito ativo | 11 — desacelerando (último em 13/09) | 47 (último em 07/10) |
| Idade / popularidade | Maduro, ~1,5k estrelas | Criado em jan/2026 | Criado em jul/2026, 8 estrelas |
| O que bloqueia | Apps, sites, Reels/Shorts, palavras-chave | Apps e sites | **Só apps** |
| Liga/desliga | Frase, timer, QR, NFC, matemática… | NFC, QR, código de barras, agendamentos | NFC ou timer manual |
| Anti-burla | Forte | Média | Leve, com saídas de propósito (emergência limitada, sessão máx. 5h, desinstalar libera) |
| Dependências | Servidor de sync pago (Sync Premium) | Firebase nas versões oficiais | **Nenhuma: sem rede, sem conta** |
| Android mínimo | 8.0 | 8.1 | **13** (exclui aparelhos antigos) |

Leitura:
- **Curbox** — mais completo e robusto; custa GPL e mudança muito rápida
  (acompanhar exige automação).
- **Switchly** — sem vantagem clara sobre o Curbox (também GPL, depende de
  Firebase, repo público com 47 commits e ritmo caindo). Descartado.
- **Lock** — pequeno, moderno, MIT, sem rede. Pode ser **adotado** (dominar o
  código inteiro e seguir caminho próprio, sem acompanhar o original).
  Filosofia "firme, mas com saídas" combina com o Ora. Lacunas: bloqueio de
  sites e Android < 13. Risco de abandono importa pouco se adotado.

### Base iOS: Foqos
[foqos](https://github.com/awaseem/foqos) — MIT, SwiftUI + APIs de Tempo de
Uso da Apple (Family Controls, Managed Settings, Device Activity), 242
arquivos Swift, ~890 estrelas, 166 forks, na App Store, ativo desde out/2024
(68 commits nos últimos 3 meses; último em 26/10/2026). Perfis, NFC/QR,
timer, pausa e acesso temporário, widgets, Live Activities, Atalhos/Siri e
versão Mac. Extensões: `FoqosDeviceMonitor`, `FoqosShieldAction`,
`FoqosShieldConfig`, `FoqosWidget`.

Conceito quase idêntico ao do Lock (perfis acionados por NFC; os READMEs
apontam um para o outro) — **Lock + Foqos já formam um par natural, ambos
MIT**.

### Limites do iOS
1. **Não compila no Windows**: exige Mac com Xcode (ou CI macOS na nuvem,
   lento para iterar) e **iPhone físico** — as APIs de Tempo de Uso não
   funcionam no simulador. Conta Apple Developer: US$ 99/ano.
2. **Permissão especial da Apple**: Family Controls na App Store exige pedido
   e aprovação manual, um para o app e um para cada extensão. Viável (o Foqos
   conseguiu), mas demora — pedir cedo.
3. **Tela de bloqueio limitada**: só ícone, título, subtítulo, cores e rótulos
   de dois botões. Não cabe ler/digitar o Evangelho ali, e o botão não abre o
   app diretamente. Adaptação: título "Uma pausa", subtítulo com versículo
   curto, botão "Rezar para desbloquear" → notificação → abre o Ora → leitura
   do Evangelho → libera por X minutos. Entra como **mais uma estratégia de
   desbloqueio** na estrutura do Foqos (que já tem acesso temporário e pausa
   com timer).
4. **Sites no iPhone**: bloqueio vale no Safari e em navegadores internos de
   apps — cobre a maioria dos casos.

### Estratégia recomendada
```
ora-content/          ← orações, frases, terço, exame, i18n pt/en/es (JSON)
│                       (o data/ atual da extensão, extraído)
├── Ora extensão      (atual, navegador)
├── Ora Android       (fork adotado do Lock, MIT)
└── Ora iOS/Mac       (fork do Foqos, MIT)
```
- **Android**: base Lock (MIT, código dominável). Acrescentar: desbloqueio pelo
  Evangelho, foco com intenção, frases espirituais; bloqueio de sites opcional
  na v1.
- **iOS**: fork do Foqos com estratégia "Evangelho". Como é ativo e grande,
  usa a rotina de sincronização com IA (abaixo), com o Ora como camada que
  só acrescenta código.
- **Experiência comum**: mesmo conceito nos dois celulares (perfis, NFC/QR,
  pausa contemplativa antes de desbloquear, foco com intenção), mesmo
  conteúdo e mesma linguagem visual dourada.
- **Ordem**: Android primeiro (todo feito no Windows). iOS quando houver Mac;
  pedir a permissão Family Controls à Apple já no início.
- **Alternativa**: se a robustez contra burla for prioridade no Android, o
  Curbox continua sendo a melhor base técnica — mas Android e iOS ficam com
  filosofias diferentes e a manutenção sai mais cara (ver abaixo).

### Fork mantido com IA (vale para Foqos; e para Curbox, se escolhido)
**Regra de ouro**: o Ora **acrescenta** código; quase não altera o núcleo.
Manter um `ORA_PATCHES.md` listando cada arquivo do original alterado e o
motivo. Meta: ≤ 10–15 arquivos do núcleo tocados — esse número define o
custo de manutenção.

Estrutura:
```
ora-<plataforma>/
├── upstream/<branch>        ← espelho intocado do original
├── main                     ← upstream + camada Ora
└── camada Ora               ← código e recursos próprios
                               (flavor `ora` em app/src/ora/ no Android;
                                pastas/targets próprios no iOS)
```

GitHub Action semanal ou quinzenal:
1. Busca o upstream e tenta o merge num branch `sync/AAAA-Wnn`.
2. Compila e roda os testes (os do original + os dos ganchos do Ora).
3. Claude Code na Action (`anthropics/claude-code-action`), escopo limitado:
   - classifica cada commit (segurança/burla, correção, recurso, UI, tradução);
   - cruza arquivos alterados com o `ORA_PATCHES.md` e aponta impacto;
   - resolve conflitos **só na camada Ora**; conflito no motor de bloqueio ou
     anti-burla vai para revisão humana;
   - sugere quais recursos novos o Ora deve ativar, esconder ou adaptar.
4. Abre um PR com o relatório — aprovação sempre humana, nunca auto-merge.

Proteções: regra no `CLAUDE.md` do fork proibindo alterar lógica de bloqueio
para "fazer compilar"; testes que quebram cedo se o original renomear um
gancho; teste manual em aparelho real antes de cada release (acessibilidade
e Tempo de Uso não se testam bem em CI).

Custo estimado: ~30–60 min de revisão humana por sincronização se a camada
for enxuta. Maior risco: refatoração grande no original.

### Notas específicas do Curbox (se for a base Android)
- Ritmo: 99 commits em 3 meses (~8/semana), ~+20 mil / −3,5 mil linhas em
  259 arquivos; um mantenedor principal (Nethical, 799 de ~950 commits);
  maior volume de mudança em `ui/`, `res/layout/` e `utils/`.
- Pontos de extensão prontos: `api/ExternalUnlockProviders.kt` (provedor
  interno "Evangelho do dia" sem tocar o motor),
  `anti_stimulants/MindfulMessage.kt` (frases espirituais), flavors em
  `app/build.gradle.kts` (`fdroid`, `full`, `playstore`) — um flavor `ora`
  troca marca, cores e textos.
- GPL-3.0 obrigatória no Ora Android (não afeta a extensão); marca "Curbox"
  não pode ser usada; desligar a assinatura Sync Premium no flavor.
- Critério: protótipo com flavor `ora` + desbloqueio pelo Evangelho; até ~10
  arquivos do núcleo alterados é sustentável, acima de ~30 não.

### Pontos de atenção gerais
- **Play Store**: apps com serviço de acessibilidade exigem declaração e
  justificativa.
- **Sync PC ↔ celular** (intenções, estatísticas) exige backend próprio —
  fase 2. Nenhuma das bases oferece um aproveitável (Curbox: pago e no
  servidor deles; Switchly: Firebase; Lock e Foqos: só local).
- **Relação com os mantenedores**: avisar dos forks e devolver correções
  genéricas (cada uma aceita é um patch a menos).

---

## 6. Ideias soltas, Ora como app e benchmarking (27/10/2026)

Analisa as ideias soltas (IA/Magisterium, resumo de tela, detox com novena), faz
uma revisão crítica da resposta anterior sobre o "Ora mobile de foco católico" e
compara com Hallow, Capela e Mapa da Fé. **Status: análise — nenhuma decisão tomada.**

### 6.1 Mapa competitivo

| | **Hallow** | **Capela** (Biblioteca Católica) | **Mapa da Fé** | **Ore+ / Pray Screen Time** | **Ora** |
|---|---|---|---|---|---|
| Eixo | Áudio guiado (oração, sono, música) | Catálogo + plano de vida | Constância + trilha de formação | "Reze para desbloquear" | Trabalho e atenção |
| Onde vive | App que você abre | App que você abre | App que você abre | Intercepta o celular | **Intercepta o navegador** (nova aba, bloqueio, fim do pomodoro) |
| Conteúdo | Vozes famosas, desafios sazonais (Pray25), Hallow AI (fev/2026), perfis infantis | 300+ orações, 80+ novenas divididas por dia, Bíblia Matos Soares, jornadas sazonais, notas com senha | Leituras do dia + cor litúrgica, terço com pinturas, guia de confissão em 5 etapas, trilha de livros por quiz, Catequist[AI], santo de devoção (pixel art), horários de missa | Versículos, orações curtas | 16 orações, terço, exame, Evangelho, bloqueador com fricção |
| Modelo | Assinatura: R$ 29,99/mês ou R$ 199,99/ano, 30 dias grátis; parcerias com paróquias e universidades | Gratuito (puxa para a assinatura MBC) | Preço ainda não anunciado; lança em **14/11/2026** com grupo VIP no WhatsApp | Grátis + compras no app | Grátis, sem conta |
| Conta / rede | Conta | Conta obrigatória, **sem modo offline** | Conta; lista de pecados só no aparelho | Conta (iOS) | **Sem conta, local-first** |

Leitura: todos os concorrentes católicos são **destinos** — você precisa lembrar de
abri-los. O Ora é o único que está **no caminho**: aparece quando você abre uma aba,
quando tenta entrar num site que distrai e quando termina um bloco de trabalho. Esse
é o ativo que ninguém copia sem mudar de produto, e deve guiar tanto a extensão
quanto o mobile (onde o equivalente é o bloqueador, não um app de conteúdo).

### 6.2 O que cada benchmark ensina

**Hallow** — aprender: campanhas sazonais (Advento/Quaresma) são o motor de
aquisição; parcerias institucionais (paróquias, universidades com premium grátis).
Não competir: áudio com celebridades é caro e é o fosso deles. Atenção: o Hallow já
tem IA própria desde fev/2026 — "chat católico" deixou de ser diferencial.

**Capela** — aprender: novenas que, adicionadas ao plano, **abrem sozinhas no dia
certo**; plano de vida montado a partir de **modelos inspirados em santos**; notas
privadas protegidas para o exame. Fraqueza explorável: exige conta e internet — o
Ora funciona offline e sem cadastro.

**Mapa da Fé** — aprender: o diagnóstico de marketing ("sai da pasta de salvos",
"Ordine et constantia") é afiado; quiz de onboarding que define a trilha; **guia de
confissão + "me confessei" com data da última confissão**, guardados só no aparelho;
**santo de devoção como companheiro diário** (com estilo pixel art opcional).
Atenção: ocupa exatamente a narrativa de "constância" e o "santo companheiro" — o Ora
precisa amarrar o companheiro à **sessão de trabalho**, não ao dia.

**Ore+ / Pray Screen Time** — o nicho "bloqueador cristão com oração para liberar"
já existe nas lojas (o segundo diz ter 205 mil downloads). O desbloqueio pelo
Evangelho do Ora não é inédito no celular; o diferencial tem de vir da tese (§6.4),
não do mecanismo.

### 6.3 Revisão crítica da resposta anterior ("Ora mobile")

**O que se sustenta**
- A tese de **santificar o trabalho ordinário** continua sem concorrente direto: nenhum
  dos apps analisados une oração e trabalho; todos tratam a oração como pausa.
- O aviso de direitos autorais do Escrivá está correto no essencial (morte em 1975 →
  domínio público no Brasil em 2046).
- O núcleo mínimo de quatro features é um bom instinto de escopo.

**O que está errado ou desatualizado**
1. *"Nenhum app modela o plano de vida"* — o Capela modela (normas, horários,
   lembretes, modelos de santos). O diferencial não é modelar normas, é **encaixá-las
   no fluxo de trabalho** (o Angelus chega na transição de um pomodoro, não como mais
   uma notificação).
2. *"Nenhum concorrente faz tempo litúrgico"* — o Mapa da Fé mostra a cor litúrgica.
   Continua valendo, mas como tema de toda a interface + propósito da temporada, não
   como novidade absoluta.
3. **Faltou o ponto de partida**: a resposta ignora o bloqueador, que é o recurso mais
   diferenciador do Ora hoje e a única razão técnica para ir ao celular (§5). Sem
   bloqueador, o Ora mobile vira "mais um app que você precisa lembrar de abrir" — o
   mesmo defeito dos concorrentes.
4. **Domínio público ≠ tradução livre**: Imitação de Cristo, Filoteia, Confissões são
   livres no original, mas cada tradução tem direito próprio (a do *Caminho* pertence
   à Fundação Studium). É preciso usar tradução antiga já em domínio público ou
   traduzir do original. As 9 frases do Escrivá já em `data/quotes.json` cabem como
   citação curta com autoria; um modo inteiro baseado nos pontos de *Caminho* não.
   (Não é parecer jurídico; para licenciar: atendimento@quadrante.com.br.)
5. **Privacidade já não é "nada sai do dispositivo"**: o Ora usa `chrome.storage.sync`,
   API de liturgia e Unsplash. O princípio real é "dados pessoais não vão para
   servidor do Ora". Vale escrever isso explicitamente — e ele já resolve a dúvida
   sobre a camada fraterna (ver item 10 abaixo).
6. **"Sem vergonha de streak" contradiz o código atual**: `tasks.js` tem streaks de
   recorrência. Decidir e migrar para **fidelidade** ("4 de 7 dias"), coerente com o
   painel Frutos (§2).
7. Deixou de lado o nome do produto: **"Ora" já evoca *Ora et labora***, o lema
   beneditino. Ancorar a tese em São Bento (ritmo de oração e trabalho) **e** em São
   Josemaria (santificação do trabalho) amplia o público sem diluir a ideia — e São
   Bento é domínio público.

**Veredito por feature**

| # | Feature | Veredito | Por quê |
|---|---|---|---|
| 1 | Oferecimento das obras | **Núcleo** | 70% pronto: ritual matinal + campo "Ofereço por..." já existem. Falta o gesto de "entregar" no lugar de "concluir" e a devolução no Frutos. |
| 2 | Normas × tarefas × hábitos | **Ajustar** | Capela já faz plano de vida. Diferencial = normas que conversam com o pomodoro e o bloqueador. Trocar streak por fidelidade. |
| 3 | Minuto heroico | **Adiar** | Só faz sentido no celular e exige infraestrutura de alarme (Android: alarmes exatos + tela cheia; iOS: AlarmKit, iOS 26+). Medir segundos reintroduz a métrica de vaidade que a tese critica. Versão barata: botão "Serviam!" que abre o oferecimento. |
| 4 | Exame particular | **Núcleo — vitória mais rápida** | `exam.js` já tem checklist de virtudes com marcação +/−. Falta: escolher **um** ponto por mês, duas contagens (meio-dia e noite) e o gráfico de tracinhos semanal. |
| 5 | Foco com os santos | **Núcleo, com ajustes** | Companheiro ligado à sessão (ponto no início, outro no fim). Conteúdo de domínio público em tradução livre; Escrivá só se licenciado. Diferenciar do "santo de devoção" do Mapa da Fé. |
| 6 | Jaculatórias aleatórias | **Ajustar** | Notificação durante foco profundo contradiz o foco. Entregar nas transições (fim de fase, nova aba, tela de bloqueio), opt-in e com limite diário. |
| 7 | Tempo litúrgico | **Fazer já** | Já é o item 1 do backlog (§4); a API de liturgia já entrega a cor. |
| 8 | Modo domingo | **Opt-in** | Ótimo para divulgação, mas recusar trabalho é paternalista (plantonistas, quem planeja a semana no domingo). Versão "Dia do Senhor": interface muda, sugere descanso, não bloqueia. |
| 9 | Trabalho bem feito | **Fundir no Frutos** | Como pergunta do ritual noturno, nunca nota/escala — autoavaliação diária vira escrúpulo. |
| 10 | Camada fraterna | **v1 sem servidor** | Oferecer por alguém já é local. Compartilhar = gerar um cartão ("ofereci 2h de trabalho por você") e usar o compartilhamento nativo. Rede social só se houver demanda real. |

### 6.4 Ideias soltas

**IA / Magisterium e chat interno — não priorizar o chat**
- Já é commodity: Hallow AI (fev/2026) e Catequist[AI] do Mapa da Fé (lança em
  14/11/2026). Chegar em terceiro com o mesmo recurso não diferencia.
- Contradiz o produto: um chat dentro de um app de foco é mais uma superfície de
  distração e de rolagem infinita.
- Custo e privacidade: API paga por uso sem receita para cobrir; a chave não pode ir
  dentro da extensão (qualquer um extrai), então exigiria servidor — quebra o
  local-first. Responsabilidade doutrinária por respostas erradas fica com o Ora.
- A Magisterium AI anuncia API para desenvolvedores, mas não consegui confirmar
  preço e termos (a página bloqueou o acesso automatizado).
- **Alternativas em ordem de custo**: (a) botão "Perguntar ao Magisterium AI" que abre
  o site deles, iniciado pelo usuário — custo zero; (b) IA contextual e pontual (ex.:
  "explique este trecho do Evangelho do dia", "ajude a preparar a confissão") com
  citações, só quando houver servidor por outro motivo; (c) chat geral — não.

**Resumo dos usos de tela — já existe, falta reposicionar**
- `screentime.js` + coleta no `sw.js` estão prontos (ainda não commitados). As
  correções do §2 valem: tirar vermelho/verde, abrir pela pergunta e fundir no
  Frutos/ritual noturno.
- No celular, os dados vêm do sistema: Android libera via `UsageStatsManager`; no iOS
  o relatório do Tempo de Uso só pode ser **exibido** numa extensão isolada, sem o app
  ler os números — o Frutos do iPhone será mais limitado.

**Detox digital com troca por novena — a melhor das ideias soltas**
- Junta três peças que o Ora já tem ou planeja: bloqueador, motor de novenas (§4) e
  tempo litúrgico.
- Formato "Novena digital": 9 dias; a cada dia um jejum digital um pouco mais firme
  (um site a mais bloqueado, um limite menor) e a oração do dia da novena. O tempo
  liberado é **oferecido** pela intenção da novena.
- Cuidado teológico: não transformar a oração em **pedágio** ("reze para ganhar
  acesso" — que é o modelo do Ore+). A moldura certa é jejum + oferta: você abre mão
  do tempo e o entrega. Vale revisar o desbloqueio pelo Evangelho com a mesma lente.
- **Calendário favorável**: a Novena da Imaculada Conceição vai de 29/11 a 07/12, e o
  1º Domingo do Advento de 2026 também cai em **29/11**. Quaresma de 2027 começa na
  Quarta-feira de Cinzas, **10/02/2027** (40 dias de jejum digital).

### 6.5 Ideias novas a partir do benchmarking

1. **Regras de vida que configuram o trabalho** (evolução do plano de vida do Capela):
   modelos que montam lembretes **e** ritmo de foco **e** horários do bloqueador. Ex.:
   *Regra beneditina* (blocos de trabalho entre Laudes, Terça, Sexta, Noa e Vésperas);
   *Plano de vida* (oferecimento, Angelus, terço, exame, leitura); *Pequena via*
   (Teresinha: pequenas tarefas oferecidas); *Filoteia* (Francisco de Sales: devoção
   no estado de vida). Nenhum concorrente faz um modelo espiritual configurar a
   produtividade.
2. **Advento digital / Quaresma digital** como campanhas sazonais (o "Pray25" do Ora),
   construídas sobre a novena digital (§6.4).
3. **Dias desde a última confissão** + preparação a partir do exame (inspirado no Mapa
   da Fé), tudo local. Barato e liga o exame diário a um sacramento.
4. **Leitura espiritual com timer**: 10–15 min de um clássico em domínio público, um
   trecho por dia, em formato de pomodoro curto — a norma de leitura do plano de vida
   vira sessão de foco.
5. **Distribuição institucional**: escolas e universidades católicas com Chromebooks
   ou Google Workspace for Education podem instalar a extensão para todos os alunos
   pelo painel de administração — o equivalente, no Ora, às parcerias do Hallow.
   Pré-requisito: estar na Chrome Web Store.
6. **Estilo visual alternativo para o companheiro** (como o pixel art do Mapa da Fé):
   barato e ajuda a falar com um público mais jovem.

### 6.6 Recomendação

**A extensão é o laboratório; o mobile é a segunda casa.** Quase todas as features da
tese (oferecimento, exame particular, companheiro na sessão, tempo litúrgico, novena
digital) são interface + JSON e podem ser validadas na extensão sem build, conta ou
loja. Só o que depende do sistema (bloquear apps, minuto heroico) exige o celular.

Sequência sugerida:
1. **Até 29/11/2026**: publicar na Chrome Web Store (sem isso nenhuma campanha
   alcança ninguém — §1 e §4); fechar o screentime com as correções do §2; motor de
   novenas; tema litúrgico (roxo do Advento); lançar o **Advento digital** com a
   Novena da Imaculada.
2. **Dez/2026–jan/2027**: exame particular; oferecimento → entrega; painel Frutos;
   companheiro na sessão com conteúdo de domínio público; trocar streak por fidelidade.
3. **Até 10/02/2027**: **Quaresma digital** (40 dias, reaproveitando a novena digital);
   modelos de regra de vida.
4. **Depois, com dados de uso**: Ora Android sobre o Lock (§5) — v1 = bloqueador +
   desbloqueio por jejum/oferta + oferecimento + companheiro. iOS quando houver Mac.
   IA e camada social só se a validação pedir.

Fontes consultadas em 27/10/2026: [Capela](https://bibliotecacatolica.com.br/blog/capela/capela-app/),
[Mapa da Fé Católica](https://www.mapadafecatolica.com.br/), [Hallow](https://hallow.com/pt-br/),
[Ore+ na App Store](https://apps.apple.com/us/app/-/id6757608193),
[Pray Screen Time](https://mwm.ai/pt/apps/pray-screen-time-bible-focus/6737241669),
[Hallow AI e perfis infantis](https://faith.tools/app/30-hallow),
[direitos de *Caminho* (Quadrante)](https://pdf.quadrante.com.br/11132/DEGUSTA%C3%87%C3%83O%20-%20Caminho.pdf),
[Magisterium AI — citações](https://cruxnow.com/interviews/2023/08/new-magisterium-ai-adds-ecclesial-twist-to-artificial-intelligence).
