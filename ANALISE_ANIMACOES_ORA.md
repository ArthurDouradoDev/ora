# Análise de animações — Ora (06/11/2026)

> **Estado (07/11/2026): tudo implementado.** Base, P1 (destinos + indicador), P2 (foco), P3 (brilho e marca da conclusão), P4 (diálogos, popovers e toasts com entrada e saída só em CSS), P5 (chegada da primeira aba), P6 (incluindo o painel de Tarefas por FLIP) e P7 (subtelas de Rezar, terço, barras do Frutos, conclusão de tarefa, botões). Ficou de fora, de propósito, o título da oração "voando" da biblioteca ao leitor: competiria com a entrada da subtela que já existe. Auditoria de desempenho na §9.
>
> **Correção importante à §3:** um elemento capturado por uma View Transition vira *raiz do fundo*: o vidro (`backdrop-filter`) dentro dele perde o desfoque durante a transição. Como Hoje e a topbar são de vidro sobre a foto, a troca de destinos foi feita com a **Web Animations API** (`Motion.play`, só `opacity`/`transform`), não com View Transitions. Hoje entra só com `transform` (opacidade < 1 também tiraria o desfoque). Para o morph do título no foco (P2), avaliar o mesmo efeito antes de adotar a API.
>
> Proposta original, não decisão aprovada. Objetivo: trocar cortes secos por transições que reforcem a calma do Ora, **sem custo perceptível de desempenho** numa nova aba que abre dezenas de vezes por dia.

## 1. Diagnóstico: por que as mudanças parecem secas

| Ponto | Como funciona hoje | Efeito |
|---|---|---|
| Troca de destino (Hoje → Rezar → Frutos) | `RouterSystem.render` alterna `view.hidden` (`scripts/ui/router.js`) | Corte instantâneo. Hoje é transparente sobre a foto; Rezar/Frutos/Proteção pintam `background: var(--bg)` sólido e a `.topbar` também vira sólida → a foto **some de uma vez**. |
| Estados de Hoje (repouso → preparação → ativa → concluída) | `TodaySystem.render` alterna `hidden` em ~9 blocos (`today.js:365`) | O cartão de preparação vira cronômetro sem continuidade. Só o véu (`.today::before`, 400 ms) e o `.overlay` (600 ms) fazem transição. |
| Subtelas de Rezar (biblioteca, leitor, terço, exame) | `u.mount(innerHTML)` | Conteúdo troca sem entrada. |
| Diálogos V1 | `DialogSystem` alterna `root.hidden` | Abrem e fecham sem entrada nem saída. |
| Popovers, toasts | `hidden` / inserção direta | Idem. |
| Fundo diário | `body.style.backgroundImage` + `transition: background-image` no `body` | A foto não é uma camada própria: não dá para escalar/mover sem repintar o body inteiro. |

O que já existe e está bom: tokens `--ease` / `--dur` (`variables.css:59`), `.enter` / `.fade` em `ui.css:304` (quase não usados), tela de carregamento com fade, chama do Advento, equalizador do Som, e o **movimento reduzido** global (`animations.css`, `prefers-reduced-motion` + `html[data-motion="reduce"]`, ligado a `ora_reduce_motion` em Configurações).

## 2. Regras de desempenho (valem para todas as propostas)

1. **Animar só `transform` e `opacity`.** Ficam no compositor (GPU), sem layout nem pintura. Nunca animar `width`, `height`, `top`, `filter: blur`, `box-shadow`, `background-color` de camadas grandes.
2. **Nada se move continuamente atrás de vidro.** O Ora tem ~20 elementos com `backdrop-filter` (topbar, chips, cartões). Qualquer coisa que anime **embaixo** deles obriga o navegador a recalcular o desfoque a cada quadro. Por isso: zoom/movimento da foto só em transições curtas (≤ 1,2 s), nunca em loop durante a sessão de foco.
3. **Curto e não bloqueante.** 180–450 ms para trocas; até ~1 s só em momentos raros (entrar no foco, concluir). A primeira pintura da nova aba **não espera** animação.
4. **Animar só na mudança real.** `TodaySystem.render` roda a cada 30 s; a animação só dispara quando `prev !== v.state`.
5. **`will-change` temporário**, nunca permanente em camadas grandes (gasta memória de GPU).
6. **Movimento reduzido sempre respeitado** — inclusive nos pseudo-elementos `::view-transition-*`, que o seletor `*` atual **não cobre** (ver §4).
7. Abas em segundo plano: o Chrome já pausa rAF e desacelera animações CSS; View Transitions são ignoradas com o documento oculto.

## 3. Ferramenta principal: View Transitions API (mesmo documento)

Chrome/Edge/Brave ≥ 111 têm `document.startViewTransition()`. O navegador tira uma "foto" do estado antigo, aplica o DOM novo e anima as duas camadas no compositor. Vantagens para o Ora:

- **Zero mudança na lógica**: basta envolver o `render` atual.
- Elementos com o mesmo `view-transition-name` nos dois estados **se transformam um no outro** (morph de posição e tamanho) de graça.
- Cai para o corte atual se a API não existir.
- Desde o Chrome 125 aceita **tipos** (`types: ['forward']`) para escolher a direção em CSS.

Cuidados: durante a transição a página não recebe cliques (por isso ≤ 350 ms nas trocas de destino); não iniciar outra enquanto uma roda (chamar `skipTransition()` na anterior); cada `view-transition-name` deve ser único na página no momento da captura.

Helper sugerido (`scripts/ui/motion.js`, ~25 linhas):

```js
const Motion = {
    reduced() {
        return document.documentElement.dataset.motion === 'reduce'
            || matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
    current: null,
    // Aplica `update` com transição, ou direto se não houver suporte/preferência
    transition(update, types = []) {
        if (!document.startViewTransition || this.reduced() || document.hidden) { update(); return; }
        if (this.current) this.current.skipTransition();
        const vt = document.startViewTransition({ update, types });
        this.current = vt;
        vt.finished.finally(() => { if (this.current === vt) this.current = null; });
    }
};
```

## 4. Propostas por momento (em ordem de impacto ÷ custo)

### P1 — Troca de destino: Hoje ↔ Rezar ↔ Frutos *(o exemplo que você deu)*

**Sensação:** em vez de a foto sumir, ela **recua e escurece** enquanto a superfície de leitura de Rezar **sobe** por cima, como entrar numa capela. Voltar a Hoje faz o inverso: a superfície desce e a paisagem reaparece.

**Como:**
1. Mover a foto do `body` para uma camada própria `<div class="backdrop" aria-hidden="true">` (`position: fixed; inset: 0; background-image…`). `BackgroundSystem` passa a escrever nela. Isso é pré-requisito de P1, P2 e P5.
2. `RouterSystem.navigate` e o `popstate` chamam `Motion.transition(() => this.render(...), [direção])`, com direção pela ordem `hoje(0) · rezar(1) · frutos(2) · protecao/settings(3)`. Render inicial continua sem transição.
3. Nomes fixos: `.topbar { view-transition-name: topbar }` (não "pisca" junto com o conteúdo), `.backdrop { view-transition-name: backdrop }`, `.view:not([hidden]) { view-transition-name: page }`.
4. CSS:

```css
::view-transition-group(*) { animation-duration: 320ms; animation-timing-function: var(--ease); }
/* Indo para um destino de leitura: a página nova sobe 24px e aparece */
html:active-view-transition-type(forward) ::view-transition-new(page) { animation: vt-rise 320ms var(--ease) both; }
html:active-view-transition-type(forward) ::view-transition-old(page) { animation: vt-fade-out 200ms ease both; }
/* A paisagem recua levemente (transform só durante 320 ms) */
html:active-view-transition-type(forward) ::view-transition-old(backdrop) { animation: vt-recede 320ms var(--ease) both; }
html:active-view-transition-type(back) ::view-transition-new(page) { animation: vt-drop 320ms var(--ease) both; }
@keyframes vt-rise { from { opacity: 0; transform: translateY(24px); } }
@keyframes vt-drop { from { opacity: 0; transform: translateY(-16px); } }
@keyframes vt-fade-out { to { opacity: 0; } }
@keyframes vt-recede { to { transform: scale(1.04); opacity: .7; } }
```

5. **Indicador da navegação deslizando:** o sublinhado dourado (`.nav [aria-current]::after`) ganha `view-transition-name: nav-indicator`; como só existe um por vez, a API **o desliza** de Hoje para Rezar sem nenhuma linha de JS.

**Custo:** 1 transição de 320 ms por clique, toda no compositor. Nenhum custo em repouso.

### P2 — Entrar no foco (à la Momentum)

Sequência atual: preparação (cartão) → corte → cronômetro. Proposta, ~700 ms no total:

1. **O título digitado vira o título da sessão.** `.prep-title` e `.session-title` recebem o mesmo `view-transition-name: focus-title` (cada um só existe num estado). Na troca `preparacao → ativa`, a API desliza e redimensiona o texto do campo até o título grande. É o efeito de maior valor percebido e custa uma linha de CSS.
2. **O resto sai de cena:** topbar já recua para 0.6 (adicionar a transição de opacidade também na entrada, hoje só existe com `:hover`); atalhos e rodapé saem com fade (hoje usam `visibility: hidden` / `hidden`, corte seco).
3. **A paisagem se aproxima uma vez:** `.backdrop` faz `scale(1) → scale(1.06)` em 1,2 s e **para**. Escurecimento do véu via opacidade de uma camada (ver P6), não `background`.
4. **Cronômetro aparece por último** (delay 150 ms, `opacity` + `scale(.96 → 1)`).

**Como:** em `TodaySystem.render`, quando `prev !== v.state`, envolver a aplicação do DOM em `Motion.transition(..., ['focus-in'])`. Atenção: a troca para `ativa` chega assíncrona do SW via `chrome.storage.onChanged`; a transição deve ser disparada no `render` (não no clique), o que já cobre também outras abas.

**Saída (`ativa → concluida → repouso`):** inverso — a paisagem volta a `scale(1)` em 600 ms, o véu clareia.

**Não fazer:** zoom lento contínuo durante os 25 min (Ken Burns) — fica atrás da topbar e dos chips de vidro e recalcularia o blur a cada quadro por meia hora. Também não animar `filter: blur` na foto.

### P3 — Conclusão da sessão: um gesto de recompensa sóbrio

Hoje: corte para "Sessão concluída". Proposta:
- Um **brilho dourado** radial atrás do título (pseudo-elemento com `radial-gradient` fixo; anima só `opacity 0→.6→0` e `scale(.8→1.1)`, 900 ms, uma vez).
- **Check desenhado**: SVG com `stroke-dashoffset` (pintura de um ícone de 48 px — custo desprezível).
- A barra de progresso completa e desaparece.
- Combina com o tom de fim que `FocusSystem` já toca.

### P4 — Diálogos, popovers e toasts com entrada e saída (só CSS)

Chrome ≥ 117 permite animar entrada e saída de elementos que alternam `hidden`/`display: none`, sem JS, com `@starting-style` e `transition-behavior: allow-discrete`:

```css
.scrim { transition: opacity 200ms var(--ease), display 200ms allow-discrete, overlay 200ms allow-discrete; }
.scrim[hidden] { display: none; opacity: 0; }
.scrim .dialog { transition: transform 220ms var(--ease), opacity 220ms var(--ease); }
.scrim[hidden] .dialog { transform: translateY(8px) scale(.98); opacity: 0; }
@starting-style {
    .scrim:not([hidden]) { opacity: 0; }
    .scrim:not([hidden]) .dialog { transform: translateY(8px) scale(.98); opacity: 0; }
}
```

(Atenção: `ui.css:8` tem `[hidden] { display: none !important; }`, que vence a transição. É preciso excluir esses elementos, ex.: `[hidden]:not(.scrim, .popover, .toast)`, ou trocar a regra por `:where([hidden])` e declarar o `display: none` em cada componente.) Mesmo padrão para `.popover` (origem no canto do gatilho: `transform-origin: top right`), `#protection-popover`, ritual e toasts (entrada `translateY(8px)`, saída fade). Os modais V0 (E18) ficam como estão até migrarem.

### P5 — Chegada na nova aba

A aba abre muitas vezes: a chegada precisa ser **perceptível na primeira vez e invisível nas seguintes**.
- **Primeira aba da sessão do navegador** (`ora_bg_loaded` ausente — a flag já existe): a foto entra com `scale(1.04 → 1)` + fade em 900 ms; relógio, saudação e próximo passo sobem em sequência (`.enter` com `animation-delay` de 0 / 60 / 120 ms).
- **Demais abas:** apenas um fade de 150 ms no conteúdo (ou nenhum). Nada que atrase o clique.

### P6 — Correções pequenas que tiram trabalho do navegador

| Onde | Hoje | Trocar por |
|---|---|---|
| `.progress span` (`today.css:184`) | `transition: width 1s linear` → layout a cada segundo da sessão | `transform: scaleX(p)` com `transform-origin: left` |
| `.overlay` (`today.css:32`) | transição de `background` em camada de tela cheia (repinta cada quadro) | segunda camada escura com `opacity` |
| `.tasks-panel` (`today.css:243`) | `transition: width 280ms` → reflow do grid de Hoje a cada quadro | painel com largura fixa, `transform: translateX(100%) → 0`; o centro desloca via `transform` ou aceita o reflow uma vez no fim |
| `body` (`main.css:23`) | `transition: background-image` | remover (vai para `.backdrop`) |
| `html[data-today] .topbar` | opacidade com transição só no `:hover` | transição também na entrada/saída do foco |
| `.today-foot` | `visibility: hidden` seco | `opacity` + `visibility` com transição |

### P7 — Subtelas de Rezar e microinterações

- **Biblioteca → leitor → voltar:** `Motion.transition` com tipos `forward`/`back` (deslize horizontal curto de 16 px + fade). O título da oração na lista e o `h1` do leitor podem compartilhar um `view-transition-name` dinâmico (atribuído só ao item clicado) para o título "voar" até o cabeçalho.
- **Terço:** a conta atual já usa `transform: scale(1.5)`; adicionar `transition: transform 200ms, background 200ms` às contas e um deslize do texto da oração ao avançar (`.enter` no bloco de texto). Ao trocar de mistério, fade do título.
- **Frutos:** barras dos dias crescem uma vez ao abrir (`transform: scaleY(0→1)`, origem embaixo, delay escalonado de 20 ms; só na primeira abertura da sessão).
- **Tarefas:** concluir uma tarefa → check com leve `scale` e a linha sai com `opacity` antes de ir para "Concluídas".
- **Botões:** `:active { transform: scale(.97) }` dá resposta tátil sem custo.

## 5. O que evitar

- Paralaxe com o mouse, partículas, gradientes animados em loop, zoom contínuo da foto: bonitos em demo, caros sob vidro e contrários à sobriedade aprovada.
- Animar `backdrop-filter`/`filter: blur` (o mais caro possível em tela cheia).
- Bibliotecas (GSAP, Motion One): desnecessárias — CSS + View Transitions cobrem tudo, e o projeto não tem bundler.
- Durações longas em ações frequentes (abrir Tarefas, trocar de aba de navegação).

## 6. Movimento reduzido

Acrescentar em `animations.css`:

```css
@media (prefers-reduced-motion: reduce) {
    ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
html[data-motion="reduce"]::view-transition-group(*),
html[data-motion="reduce"]::view-transition-old(*),
html[data-motion="reduce"]::view-transition-new(*) { animation: none !important; }
```

(`Motion.transition` já pula a API nesses casos; a regra é a rede de segurança.) Com movimento reduzido, fades curtos de opacidade podem continuar — não causam desconforto vestibular.

## 7. Como medir (antes e depois)

1. DevTools → **Performance**, CPU 4× mais lenta: gravar Hoje → Rezar e preparação → foco. Meta: nenhum quadro longo > 16 ms; nenhuma faixa roxa (layout) ou verde (pintura) grande durante a animação.
2. **Rendering → Paint flashing** e **Layer borders**: durante as animações só devem piscar elementos pequenos.
3. Sessão de foco de 1 min (`ora_debug_short_focus`) com o Gerenciador de tarefas do Chrome aberto: CPU da aba em repouso deve ficar igual a antes (≈ 0% fora do tique de 1 s).
4. Testar em janela 4K/zoom 200% (blur em área grande é o pior caso).

## 8. Ordem sugerida de implementação

1. **Base:** camada `.backdrop`, `scripts/ui/motion.js`, regras de movimento reduzido, correções de P6. *(sem efeito visível grande, mas tudo depende disso)*
2. **P1** troca de destino + indicador deslizante da navegação.
3. **P2** entrar/sair do foco (morph do título, paisagem se aproxima).
4. **P4** diálogos/popovers/toasts.
5. **P3** conclusão, **P5** chegada, **P7** microinterações.

Cada etapa é independente e reversível; se algo pesar, basta remover o `view-transition-name` ou a regra CSS correspondente.

## 9. Auditoria de desempenho (07/11/2026)

Feita no harness com `chrome.*` simulado, contando animações e superfícies de vidro por estado (sem gravação de quadros: o painel do navegador estava oculto).

| Achado | Custo | Correção |
|---|---|---|
| Barra de progresso do foco com `transition: 1s linear` reiniciada a cada tique | Animação sempre ativa: quadros a 60 fps durante os 25 min, para mover ~0,2 px/s (na V0 era `width`: layout a cada quadro) | Transição removida; a barra avança a cada segundo sem animar |
| Equalizador do mini controle em laço infinito, dentro de um chip de vidro | Quadros contínuos enquanto a música toca e redesenho do desfoque do chip | Removido do mini controle (07/11): ele mostra só a capa ou o ícone e tocar/pausar, e o botão já diz o estado (ANALISE_SOM_POPUP_UNICO_ORA.md §4). No popup (sólido, aberto por pouco tempo) continua em laço |
| Painel de Tarefas animando `width` | Layout de Hoje e reavaliação das container queries do canto a cada quadro por 280 ms | Largura muda uma vez; centro desliza por FLIP e painel entra/sai com transform/opacity (`TaskSystem.animatePanel`) |
| Véu do foco e topbar trocando cor | Repintura de camada de tela cheia por quadro | Véu por opacidade (`.overlay::after`); topbar só faz transição de cor (área pequena) |

Resultado medido: durante o foco, depois da entrada, **nenhuma animação fica rodando** (0 animações após 3 tiques). Em Hoje há 7–9 superfícies de vidro, todas paradas; em Rezar, 4 (só a topbar). Nenhuma animação infinita ativa em repouso, foco ou Rezar (a chama do Advento só existe no tempo do Advento, numa área pequena e sobre superfície sólida).

Ainda vale medir na extensão real, com o DevTools (Performance, CPU 4× mais lenta): troca Hoje → Rezar, entrada no foco e abertura do popup da música. Ponto a observar: o player do YouTube/Spotify oculto (`.sound-remote.is-concealed`, opacidade 0) continua carregado; se for vídeo, o navegador pode seguir decodificando quadros. Medir antes de mudar.
