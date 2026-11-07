# Som num único popup — Momentum × Ora (07/11/2026)

Fonte: gravação de tela do Momentum (1 min 54 s, 07/11/2026), analisada quadro a quadro, e o código atual do Som do Ora (`scripts/modules/sound.js`, `styles/modules/sound.css`, `ora.html`, `scripts/ui/dialog.js`). Os tempos entre parênteses indicam o momento do vídeo.

Este documento é uma **proposta**. Nada aqui foi aprovado nem implementado.

---

## 1. Como o Momentum organiza a música

### 1.1 Mini player (canto superior esquerdo)
Uma pílula de vidro pequena, **sem texto**. O conteúdo muda conforme a fonte:

| Situação | Conteúdo da pílula |
|---|---|
| Soundscape tocando (0,5 s) | ícone da cena · **⏸** · alto-falante + volume · ícone de mixer |
| YouTube tocando (50,6 s) | capa do vídeo · **⏸** · alto-falante + volume |
| Spotify tocando (96 s) | capa da playlist · **⏸** · **⏭** (sem volume: o Spotify não aceita) |
| Pausado (111,5 s) | capa · **▶** (o resto some) |

- **Não há equalizador.** Quem diz se está tocando é o próprio botão (⏸ = tocando, ▶ = pausado).
- Não há nome do som: a capa ou o ícone identificam. O nome fica no popup.
- Não há "parar" nem "mostrar/ocultar player".
- A pílula encolhe e cresce com o que é possível fazer naquele momento.

### 1.2 Um único popup, "Sounds"
Um popover ancorado embaixo da pílula (com uma setinha apontando para ela), de **fundo sólido escuro**, sem escurecer a tela. O cronômetro continua visível ao lado. Ele fecha ao clicar fora, e a música continua.

**Vista 1 — Biblioteca (0,9 s)**
- Cabeçalho com ♫ "Sounds" e **+** (adicionar link).
- Filtros: Recent · Soundscapes · Spotify · YouTube · Custom, e à direita **"Now Playing →"**, tingido com a cor da capa que está tocando.
- Grade de **5 colunas** com capas quadradas pequenas e o nome embaixo. São 15 itens visíveis sem rolar.
- A capa que toca mostra **barrinhas de equalizador** no canto. No hover aparece um **▶** sobre a capa.

**Vista 2 — Detalhe do que foi escolhido.** Clicar numa capa **toca e desliza para o detalhe**. A transição é um carrossel horizontal, e no meio dela as duas vistas aparecem lado a lado (2,8 s, 5,8 s, 11,2 s). O cabeçalho do detalhe tem ← · mini-capa · título · "…".
- **Soundscape** (3,7 s, 38 s): uma linha de **ícones de camada**, cada um com uma barrinha embaixo que serve de volume. Campfire tem 2 camadas e Rainfall também. Binaural mostra δ θ α β γ como abas exclusivas (12,1 s) e Noise mostra 5 cores de ruído (26,6 s), com dicas no hover ("Turn on Alpha (α) Relax"). O detalhe é **baixo**, com 90–140 px de altura.
- **YouTube** (46–50,6 s): o **player oficial do YouTube é o próprio detalhe**. Primeiro aparece "Loading…" e depois o vídeo, com os controles do YouTube, na largura do popup.
- **Spotify** (86–95 s): dois avisos dispensáveis ("Log into Spotify for full-length songs · Log in" e "Spotify may be loud: use device volume") e, abaixo, o **embed do Spotify** com capa, play e lista de faixas.

**Navegação**
- Ao voltar (←) para a grade, a música continua. Com um player aberto, o cabeçalho da grade ganha uma **→** para voltar a ele (55,1 s), além do "Now Playing →".
- Só toca **uma fonte por vez**: escolher o Spotify pausou o YouTube (84,7 s).
- A altura do popup acompanha a vista: a grade tem ~300 px, o detalhe de um som ~100 px, o YouTube ~280 px e o Spotify ~340 px.

### 1.3 Por que funciona
1. **Uma coisa por vez na tela:** pílula fechada (~150 px) ou popup aberto, nunca os dois blocos grandes juntos.
2. **O player do serviço só aparece quando se quer ver.** Ele fica visível no momento da escolha, que é quando o navegador exige um gesto para tocar, e some com o popup sem parar a música.
3. **Controle mínimo no dia a dia:** pausar é o único gesto frequente, e ele está sempre visível.

---

## 2. Onde o Ora está hoje

**O Ora já tem 70% disso.** O popup do Som (`#sound-dialog`) já troca de vista sem fechar: biblioteca → ajustar ambiente (`mixer`) → detalhes da playlist → adicionar. Ele já fica ancorado no botão, já tem "Tocando agora" e o deslize de 12 px entre vistas.

O que ainda **não** está no popup:

| Peça | Hoje | Problema |
|---|---|---|
| Player do YouTube/Spotify | `aside#sound-remote` no canto de Hoje, abaixo do mini controle (11rem no canto, 17rem no eixo), com "Abrir no serviço" e "Ocultar player" | Um segundo bloco grande, permanente, no canto, inclusive durante o foco. Para escondê-lo foi preciso criar a preferência `playerHidden`, o estado `is-concealed`, o `revealTimeout` e o caso E25 |
| Mini controle | chip [capa ou equalizador ou ♫ + **nome**] e, no hover, ⏸ · ⏭ · volume · mostrar/ocultar player · parar | Muitos controles para o uso real (pausar). O equalizador exige a animação por evento ainda não commitada (`animateEq`, `loopEq`, `is-settling`, ~65 linhas) por causa da regra de desempenho do vidro (ANALISE_ANIMACOES §9) |
| Detalhe da playlist | card (capa, "Playlist do YouTube"), botões Tocar / Abrir no serviço / Remover | O player não está ali: é preciso fechar o popup e olhar o canto |
| Grade | 3 colunas | Cabem ~6 capas sem rolar (o Momentum mostra 15) |

---

## 3. Viabilidade de tudo num único popup

### 3.1 Veredito: **viável, esforço médio** (~1–2 dias, com testes manuais)
A estrutura de vistas já existe. O trabalho real é **levar o iframe para dentro do popup** sem que a música pare ao fechá-lo.

### 3.2 A restrição técnica central
- **Mover um iframe no DOM recarrega a página dele** (a música para). Então o iframe não pode passear entre o canto e o popup: ele precisa **morar** num lugar fixo.
- **Proposta:** o iframe passa a morar **dentro do popup**, na vista de detalhe da playlist (`#sound-view-playlist`).
- Ao fechar, o `DialogSystem.close` põe `hidden` no `#sound-dialog`, ou seja, `display: none`. O Chrome **não descarrega** iframes com `display: none`, e o áudio continua. Mesmo assim, como o relay depende de geometria (`frameVisible` via IntersectionObserver) e o YouTube às vezes reage a iframe sem tamanho, o mais seguro é:
  - **Opção A (recomendada):** uma opção `keepAlive` no `DialogSystem`. Nesse diálogo, fechar aplica a mesma ocultação que o `.sound-remote.is-concealed` já usa (fora da vista, `opacity: 0`, `clip-path`, `inert`) em vez de `hidden`. É determinístico e já provado no Ora.
  - **Opção B:** confiar no `display: none` e testar. É menos código, mas tem risco nos dois relays (v2 e v1).
- O fundo inerte do `DialogSystem` não atrapalha: com o popup aberto, os controles estão no próprio player. Com ele fechado, o mini controle está ativo.

### 3.3 Como ficaria o fluxo
```
Hoje (popup fechado)                 Popup aberto
┌──────────────────┐   clique na     ┌───────────────────────────────┐
│ [capa] ⏸         │ ─── capa ────▶  │ ♫ Som                       + │
└──────────────────┘                 │ Todos Ambientes YouTube Spot. │
  hover: + volume, ⏭                 │                [Tocando ▸]    │
                                     │ ▢ ▢ ▢ ▢   (4 colunas)         │
                                     │ ▢ ▢ ▢ ▢                       │
                                     └───────────────────────────────┘
                                         │ clique numa playlist
                                         ▼ (toca + desliza)
                                     ┌───────────────────────────────┐
                                     │ ←  [capa] Lofi Girl         … │
                                     │ ┌───────────────────────────┐ │
                                     │ │   player do YouTube 16:9   │ │
                                     │ └───────────────────────────┘ │
                                     └───────────────────────────────┘
                                         "…": Abrir no serviço · Remover
```

- **Playlist (Hoje):** clicar na capa **toca e vai ao detalhe**, que é o player. É exatamente o momento em que o navegador exige o player visível para tocar, e isso **elimina o caso E25**: o player nunca precisa "aparecer sozinho".
- **Ambiente (Hoje):** clicar **toca e continua na grade**, para trocar rápido, sem internet. O botão de ajuste abre o mixer, como hoje.
- **Preparação do foco:** nada muda. A escolha é rascunho, o detalhe da playlist mostra o card com "Selecionar" (sem player) e "Usar no foco" fecha.
- **"Tocando agora"** (já existe) leva ao detalhe do que toca. Vale tingi-lo levemente com o tom da capa, como o Momentum faz.
- **Tamanho do player:** YouTube com `aspect-ratio: 16/9` na largura útil (~22rem, ou seja, ~12,4rem de altura); Spotify com ~20rem. O `position()` já limita a altura ao espaço disponível.

### 3.4 O que sai do código (simplificação)
- `aside#sound-remote`, `#sound-player-toggle`, `#sound-player-hide`, `.sound-remote.is-concealed` e as regras do canto em `today.css` (`.today-corner .sound-remote`).
- A preferência `playerHidden` (o campo antigo é ignorado na leitura), `player.revealed`, `revealTimeout` e `setPlayerHidden`.
- O `frame.scrollIntoView` em `play()`/`togglePlayback()`.
- **Libera ~11rem de altura no canto** de Hoje, principalmente durante o foco.

### 3.5 Riscos e como testar
| # | Risco | Mitigação |
|---|---|---|
| R1 | Música parar ao fechar o popup | Opção A (`keepAlive`). Testar YouTube e Spotify, relay v2 e v1, fechar com Esc, clique fora e troca de destino |
| R2 | **Foco iniciado com playlist escolhida na preparação**: o player começa oculto (popup fechado) | "Começar" é gesto na página, e o iframe tem `allow="autoplay"`, então deve tocar. Se não tocar em 4 s, **não abrir o popup sobre a sessão**: o mini fica com ▶ e um aviso curto ("Toque para tocar"), e o ▶ do mini é gesto suficiente |
| R3 | Altura variável do popup "pulando" entre vistas | O `position()` já recalcula. Opcional: animar a altura por FLIP (o popup é sólido, então pode) |
| R4 | Telas estreitas (< 600 px): o popup vira diálogo centralizado | Já funciona assim. O player cabe em 16:9 na largura |

---

## 4. Mini controle: tirar o equalizador e pôr o pause

**Recomendo adotar.** Essa é a parte de maior ganho e menor custo.

### Proposta
```
Tocando:  [capa/ícone] ⏸          hover/foco: [capa] ⏸ 🔊━━━  ⏭(se houver)
Pausado:  [capa/ícone] ▶
```
- **Capa ou ícone do ambiente:** abre o popup. O nome vai para `aria-label`/`title` ("Som: Capela com chuva — abrir").
- **⏸/▶ sempre visível:** é o único gesto frequente. O estado fica legível sem animação.
- **No hover ou foco por teclado**, como hoje: volume (oculto no Spotify, como já é) e ⏭ quando `canNext`.
- **Saem do mini:** equalizador, nome, mostrar/ocultar player (deixa de existir) e **parar**. O parar vai para o "…" do detalhe, ou para o item "Silêncio" da grade. O Momentum também não tem parar no mini.
- **Sem nada tocando:** fica o chip ♫ "Som", como hoje.

### Por quê
- Resolve de vez a tensão "animação dentro do vidro durante todo o foco" (ANALISE_ANIMACOES §9). Sem equalizador não há o que animar.
- **A alteração ainda não commitada em `sound.js`/`sound.css` é justamente a animação do equalizador do mini.** Se esta proposta for aprovada, ela deve ser **descartada** em vez de commitada. O equalizador **continua nas capas da grade** (dentro do popup sólido), onde o Momentum também o mostra.
- A pílula fica com ~5rem em repouso, contra o chip com nome de até 9,5rem de hoje.

---

## 5. Outros detalhes do Momentum que valem a pena

| Prioridade | Ideia | Observação |
|---|---|---|
| P2 | **Grade com 4 colunas** (hoje 3) | Mais capas sem rolar; 5 ficaria apertado com os títulos em português |
| P2 | **Mixer compacto:** uma linha de ícones de camada, com um volume curto embaixo de cada um | Hoje é uma lista alta de interruptores e sliders; "Personalizar" pode manter a lista completa |
| P3 | Aviso do Spotify **dispensável** (ⓘ + ×, lembrado) | Hoje o `spotify_hint` aparece sempre |
| P3 | Filtro **"Recentes"** misturando fontes | Só faz sentido quando a biblioteca crescer |
| P3 | Deslize do carrossel mais amplo entre vistas | Hoje são 12 px + opacidade; pode ir a ~24 px. Só vale com o resto pronto |

---

## 6. Ordem sugerida
1. **Mini controle novo** (capa + ⏸/▶, sem equalizador, nome e parar). É independente e pequeno.
2. **Player dentro do popup** (`keepAlive` no `DialogSystem`, iframe na vista da playlist, tocar → detalhe, remoção do `sound-remote` e do `playerHidden`). **Feito em 07/11**, com uma diferença: o adormecimento ficou no próprio `SoundSystem` (`park`), sem opção nova no `DialogSystem`, porque o popup precisa adormecer também quando a música começa sem ele ter sido aberto (início do foco).
3. Grade com 4 colunas e mixer compacto.
4. Atualizar CLAUDE.md (Sound), MEMORY.md e ERRORS.md (o E25 fica obsoleto).

## 7. Decisões em aberto
- Tirar o **nome** do mini de vez, ou mostrá-lo no hover?
- **Parar:** no "…" do detalhe ou só pelo item "Silêncio"?
- Ambiente: ao clicar, **ficar na grade** (proposto) ou ir ao mixer, como o Momentum faz?
