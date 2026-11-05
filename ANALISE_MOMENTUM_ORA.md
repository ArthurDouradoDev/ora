# Momentum × Ora V1 — o que aprender (05/11/2026)

Fonte: a nova aba do Momentum 2.27.9 aberta no Chrome (Profile 1) e o código da extensão instalada (`index.html`, ~420 bundles Vue, service worker). Não foi possível clicar dentro do Momentum: o Chrome não deixa a automação abrir páginas `chrome-extension://`. Por isso, o que está nos painéis foi lido no código (templates, textos e dados), e a tela foi vista por captura.

Este documento é uma **proposta**. Nada aqui foi aprovado nem implementado.

---

## 1. O que o Momentum é hoje

### Tela inicial (o que aparece na sua aba agora)
- **Canto superior esquerdo:** "Links" e "Focus", com os links fixados logo abaixo (Central Tríade, Wim Hof, Liturgia), cada um com favicon e nome.
- **Canto superior direito:** "0m Focused Today" (minutos de foco do dia, com um anel) e o clima (25° São Paulo).
- **Centro:** relógio enorme, "Good afternoon, Arthur." e a pergunta "What is your main goal for today?", com uma linha de digitação sem borda.
- **Rodapé:** configurações e a localização da foto (esquerda), citação do dia (centro) e Tasks (direita).
- Tudo flutua sobre a foto, sem cartões. Só se veem ícones e texto com sombra, e os rótulos podem aparecer "sempre" ou "só no hover" (*Text Labels*).

### Mapa completo de módulos (pela lista de componentes)
| Área | Módulos |
|---|---|
| Centro | Clock / Percent Clock / Countup, Greeting, **Mantra** (frases diárias com opção de pular), **Focus** ("main goal for today" → vira tarefa nº 1), Quote (pular, compartilhar, gerenciar) |
| Foco | **Focus Mode** (tela de foco dedicada, *PiP* flutuante, "Quit Focus Mode?" com "Continue focusing"), **Pomodoro** (Focus/Break, "+10 min", completar/reiniciar, auto-iniciar pausa, ocultar segundos, notificações, sons de início e fim), **Focus Stats** (Hoje/Semana, tarefas, timers, **"Resisted"** = tentativas bloqueadas, histórico, gráfico de barras, meta de minutos) |
| Proteção | **Site Blocker** com **grupos**, duração, "Block during breaks" e **Unstoppable Mode** ("Prevents disabling and bypassing") |
| Equilíbrio | **Balance Mode**: desliga os widgets de produtividade fora do horário, com relógio de % do dia |
| Metas | **Goals** com assistente ("What do you want more of in your life?", motivação, imagem) e **revisão semanal** ("Looking back on this week…", "Next week I'll…", "Is there an easier version of your next task?") |
| Ferramentas | Tasks (listas, integrações, "Today"), Notes (editor rico, IA), Countdowns, Metrics, World Clocks, Calendar, Ask AI, **Tab Stash** (guardar as abas para focar) |
| Links | Links, Bookmarks Bar, Top Sites, Launchpad, Launcher/Topics (equipe) |
| Aparência | Tema (Dark/Light/System/**Photo Match**), fonte (Classic/Neutral…), cor dos ícones fixados, **Photo Info** com a localização da foto |

---

## 2. Música — "Sounds" (análise profunda)

### Como funciona
- **Três fontes:** Soundscapes (sons próprios), Spotify e YouTube, colados por link ("Paste Spotify or Youtube link").
- **13 cenas prontas**, cada uma uma *mistura* de camadas com volume pré-ajustado:
  - Campfire = fogo 0,9 + grilos 0,2
  - Beach = oceano 0,5 + vento 0,15 + gaivotas 0,05
  - Ocean = barco, ondas, pássaros, respingos e bolhas (5 camadas)
  - também Train, Rainfall, Forest, Garden, Café, Thunderstorm, Creek, Office, Noise, Binaural e **Custom**
- **~35 camadas** individuais (chuva na superfície, trovão, riacho, café, teclado mecânico, ar-condicionado, ruído branco/rosa/marrom/verde, "Speech Blocker"…) e **5 batidas binaurais geradas por osciladores**, sem arquivo (Delta, Theta, Alpha, Beta e Gamma, cada uma com frequência e diferença).
- **Motor de áudio:** um `AudioContext` global, com um `GainNode` por camada e outro geral. O loop usa `AudioBufferSource.loop`, que não deixa emenda audível, e as trocas de volume são feitas com **rampas (fade-in linear e fade-out exponencial)**, nunca com corte seco.
- **Truque do Media Session:** ele toca um `silence.mp3` em loop para que o som apareça nos controles de mídia do sistema e do Chrome, com pausa pelo teclado ou pela barra do Windows.
- **Na tela:** o painel tem "Now Playing", a biblioteca (Library) e "Add music". Na dashboard fica um **mini-player** com controles e indicador de volume.
- **Mensagens de erro específicas:** "link privado ou oculto", "Spotify precisa ser playlist, faixa ou álbum", "só Spotify ou YouTube" e "esse link já existe". Há também um banner de volume do Spotify e a sugestão "Log into Spotify for full-length songs".
- **Pomodoro:** sons próprios de início, fim e parada (`pomo-start/done/stop.mp3`).

### Onde o Ora está hoje (`sound.js` + `sound-core.js`)
- **O que já está bom:** Silêncio / Sons do Ora / Minhas playlists; parse robusto de links (inclusive `spotify:` e `intl-`); última escolha e volume restaurados; "pausar com o foco"; o foco preserva o som que já tocava.
- 5 sons sintetizados de **22 s, mono, 22 kHz** e 1 Glória gregoriano (CC BY), tocados com `new Audio()` e `loop = true`.
- Mistura limitada a **2 camadas**, sem cenas prontas.

### Recomendações de Som (por prioridade)
1. **P1 — Loop sem emenda e com fade.** O loop de `<audio>` tem um "clique" ou pausa perceptível na volta, e em uma faixa de 22 s isso acontece a cada 22 s. Trocar por Web Audio: buffer decodificado, `loop = true`, um `GainNode` por camada e rampas de 1–2 s ao tocar, pausar e trocar. É exatamente o que o Momentum faz, e cabe num único módulo.
2. **P1 — Som que sobrevive à aba.** No Ora o áudio vive na página da nova aba. Se a pessoa inicia o foco e digita um endereço nessa mesma aba, que é o uso mais comum, o som morre. O Momentum tem o mesmo problema. O Ora pode superá-lo tocando os **sons locais num `offscreen` document** (`chrome.offscreen`, motivo `AUDIO_PLAYBACK`), comandado pelo SW, que já é o dono do timer. YouTube e Spotify continuam na aba, porque embed em offscreen não é garantido; isso precisa ser verificado antes.
3. **P2 — Faixas mais longas e variadas.** Ter 22 s em loop deixa a repetição perceptível. Vale 60–120 s por camada, em estéreo, com **Opus/OGG** (o tamanho cai de ~1 MB para ~200 KB por minuto).
4. **P2 — "Ambientes" prontos em vez de camadas soltas.** Exemplos em linguagem do Ora: *Capela com chuva* (igreja + chuva baixa), *Mosteiro à noite* (mosteiro + vela/lareira), *Vigília* (vela + sinos ao longe muito baixos), *Laudes* (sinos + Glória). Cada ambiente é uma receita `{ layers: [{id, volume}] }` em `SoundCore`, e **"Personalizar"** abre o mixer. Com receitas, o limite de 2 camadas pode subir para 3, ou continuar em 2 se a ideia for mostrar menos.
5. **P2 — Media Session.** Registrar `navigator.mediaSession` (título "Ora · Capela com chuva", ações play/pause) para controlar pela tecla de mídia e pelo Chrome. Com o offscreen isso vem quase de graça.
6. **P3 — Ruídos de concentração** (marrom/rosa) gerados por código, sem arquivo e funcionando offline. O binaural pode ficar de fora: destoa da proposta.
7. **P3 — Erros de link específicos**, como os do Momentum (privado, tipo inválido, duplicado), em vez de uma mensagem genérica.
8. **P3 — Som de fim de sessão próprio** (um sino curto) no lugar do tom sintetizado de `focus.js`, alinhado com o acervo.

---

## 3. Links (análise profunda)

### Como funciona no Momentum
- Um botão **"Links"** no canto abre um popup com a lista. Cada link pode ser **"Pin to Dashboard"**, e os fixados aparecem direto na tela, como os seus Central Tríade, Wim Hof e Liturgia.
- **Modo Lista ou Blocos** (List/Tile) e "Color pinned icons".
- **Um link pode abrir várias abas** ("Add another tab", grupo de trabalho), com opção "Open Link in New Tab".
- **Itens nativos:** "Chrome Tab" (abre a nova aba padrão do navegador), **Bookmarks Bar** (favoritos do navegador, com pastas) e **Top Sites** (mais visitados). A **Launchpad** mostra os top sites sob o relógio. Bookmarks e topSites são **permissões opcionais**, pedidas só quando a pessoa liga o recurso.
- Ações por link: editar, excluir (com confirmação) e arrastar para reordenar.
- **Tab Stash**: "guarde as abas abertas para focar" e depois restaure a sessão.

### Onde o Ora está hoje (`links.js`)
- Até **6** atalhos com nome e URL, favicon via `_favicon` e padrões Google, ChatGPT e Liturgia das Horas.
- Só tem **adicionar e remover**: **não dá para editar nem reordenar**.

### Recomendações de Links
1. **P1 — Editar e reordenar** no diálogo de gerenciar (setas ↑/↓ acessíveis, além de arrastar). Hoje, para corrigir um nome, é preciso apagar e criar de novo.
2. **P2 — Fixados × lista.** Manter até 6 fixados em Hoje e permitir uma lista maior atrás de um botão "Atalhos" (popover). Isso mantém Hoje limpa, que é a decisão de design já tomada, sem limitar a pessoa.
3. **P2 — "Abrir conjunto"**: um atalho que abre várias abas, como "Estudo" com Notion, Anki e Drive. Combina com o foco: abrir o conjunto ao começar uma sessão.
4. **P2 — Atalhos católicos sugeridos** no "Adicionar", como Liturgia das Horas, Bíblia, Santo do dia e a rádio ou o canal da paróquia: um toque e o atalho está criado. O Momentum não tem esse diferencial.
5. **P3 — Favoritos e mais visitados** do navegador como fonte opcional, com permissão `optional_permissions: ["bookmarks","topSites"]`, pedida só quando a pessoa ligar o recurso.
6. **P3 — Integração com Proteção:** ao adicionar um atalho que está numa lista bloqueada, avisar ("esse site está bloqueado durante o foco").

---

## 4. Outras ideias do Momentum que servem à V1

| Ideia do Momentum | Versão Ora | Prioridade |
|---|---|---|
| "0m Focused Today" sempre visível no topo | Minutos de foco de hoje discretos no topbar ou perto do chip Tarefas | P2 |
| "Resisted" (tentativas bloqueadas) em Focus Stats | Em Frutos: "Você resistiu a 7 distrações esta semana", em linguagem de virtude e sem placar | P2 |
| Unstoppable Mode no bloqueador | "Modo firme" na Proteção: durante o foco não dá para desligar, só depois | P2 (já combina com perfis) |
| "Block during breaks" | Opção por perfil de Proteção | P3 |
| Focus Mode com PiP e "Quit Focus Mode? / Continue focusing" | O Ora já tem a confirmação de saída (leave-guard). Um PiP do timer (Document Picture-in-Picture) seria um ganho real | P3 |
| Mantra diário com "pular" | Jaculatória do dia sob a saudação, com "outra" e "não mostrar mais" | P2 |
| Balance Mode (esconde produtividade fora do horário) | O estado `noite` de Hoje já cumpre esse papel. Pode virar configurável ("depois das 21h, só oração") | P3 |
| Revisão semanal de metas | "Para refletir" de Frutos já é o equivalente. Vale a pergunta *"existe uma versão mais fácil do próximo passo?"* | P3 |
| Tab Stash | "Guardar abas e rezar": guarda as abas antes do terço ou do Respiro e restaura depois | V2 |
| Text Labels (sempre / só no hover) | Rótulos do topbar opcionais, para quem prefere uma tela mais limpa | P3 |
| Photo Info (local da foto) | Já existe para a arte sacra? Se não, título e autor da obra no rodapé | P3 |

**O que não copiar:** a quantidade de upsells "Plus", os "fun facts" de estudos ("97% less distracted"), IA em tudo e muitos widgets competindo. A força do Ora é uma ação principal por vez.

---

## 5. Sugestão de ordem (dentro da fase 6 e logo depois)

1. Motor Web Audio (loop sem emenda e fades) + Media Session → **resolve a qualidade percebida do Som**.
2. Ambientes prontos + "Personalizar".
3. Áudio local em offscreen (verificar a viabilidade antes).
4. Editar e reordenar atalhos.
5. Fixados × lista + atalhos católicos sugeridos.
6. "Resistiu a N distrações" em Frutos e "Modo firme" na Proteção.
