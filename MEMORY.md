# MEMORY.md — Contexto e decisões do Ora

Memória do projeto para sessões futuras. Consolida o que foi discutido e decidido nas conversas de 25/10 a 30/10/2026 sobre melhorias, produto e interface. Registro de problemas conhecidos: [ERRORS.md](ERRORS.md).

> Estado: tudo abaixo é **análise e direção**, não implementação. Nada do que está em `prototypes/` foi levado para a extensão. Propostas não viram decisões aprovadas sem confirmação do usuário.

## Documentos de referência

| Arquivo | Conteúdo |
|---|---|
| `RESUMO_ORA.md` | Retrato técnico-funcional completo da extensão (v1.2.0) |
| `ANALISE_PLANO_ORA.md` | Produto e arquitetura: diagnóstico de tarefas, escopo, estratégia mobile (28/10) |
| `ANALISE_INTERFACE_ORA.md` | Direção visual: hierarquia, tipografia, superfícies, mobile (28/10) |
| `REVISAO_UX_UI_REZAR_BIBLIOTECA.md` | Revisão de Rezar, Biblioteca, leitor, terço, Respiro (30/10) |
| `RELATORIO_MELHORIAS_ORA.md` | Relatório consolidado: correções M01–M13, prioridades P1/P2/P3 (29/10) |
| `IDEAS.md` / `IDEAS.pdf` | Ideias, concorrência (seção 6) e estratégia mobile Android + iOS (seção 5) |
| `prototypes/` | Protótipos HTML de validação de design (não fazem parte da extensão) |

`IDEAS.md` e `prototypes/` estão fora do git no momento (untracked). `.claude/` está no `.gitignore`.

## Tese de produto

- Ora é um app de **contemplação e ordem**: oração + trabalho + proteção da atenção. Tese central: "santificar o trabalho" (nome remete a *Ora et labora*; ancorar em São Bento / São Josemaria amplia o público).
- Diferencial: Hallow, Capela e Mapa da Fé são **destinos** (a pessoa precisa lembrar de abrir). O Ora está **no caminho**: nova aba, site bloqueado, fim do pomodoro. No celular, o equivalente é o **bloqueador**, não mais conteúdo.
- Cuidado: oração não pode virar **pedágio** ("reze para liberar"). Moldura certa: jejum + oferta. Já existem apps assim (Ore+, Pray Screen Time).
- Ciclo central: **escolher o próximo passo → proteger a atenção → trabalhar → descansar ou rezar → decidir como continuar.**
- Prioridade: melhorar a experiência essencial antes de adicionar recursos. O autor relata que usa pouco várias funções (tarefas pouco úteis, recursos esquecidos): entender quando cada uma ajuda e como a pessoa chega até ela.
- O app mobile pode começar sem esperar o sucesso comercial da extensão, mas sem manter três produtos completos em paralelo.

## Decisões e preferências do usuário (preservar)

- Direção visual aprovada: manter a identidade (fotografia, espaço vazio, sobriedade, vidro com função delimitada). Não fazer reformulação integral.
- Tipografia: **Montserrat** na interface, **Literata** na leitura (texto longo alinhado à esquerda, centralização só em trechos curtos), **Cinzel** só em marca e títulos pontuais. Sem quarta família. O usuário questionou Literata no relógio: testar Montserrat leve/regular.
- Aparência **Papel** e ajuste de tamanho de texto no leitor: aprovados.
- Terço: mistério, oração e conta explícitos; Anterior/Próxima como controles principais.
- Respiro: sem cronômetro ou cobrança de desempenho; **não precisa ser obrigatoriamente uma dezena** (oração breve, três Ave-Marias, dezena, apenas descansar), com preferência lembrada.
- Navegação extensão: **Hoje · Rezar · Frutos**, com Proteção (estado visível) e Configurações separadas. Mobile: **Hoje · Rezar · Proteção · Frutos**, sem quinta aba de Foco.
- Composição escolhida: **"Paisagem com espaço de trabalho"** (extensão = chegada ampla; mobile = caderno do dia; mesmos tokens, linguagem e componentes).
- Tela Hoje: o cartão do próximo passo com botão dourado é o único destaque; atalhos (Google, ChatGPT…) vão para o alto, ao lado da marca; intenção do dia vira linha discreta sob a data; convite vira uma linha sem cartão. Variantes D (Eixo) e E (Assimétrica com cartão) foram criadas; A e C mantidas para comparar; **B foi removida**.
- **Telas aprovadas para a V1 (02/11/2026):** Hoje = `prototypes/01d-hoje-melhorada.html` (relógio/títulos em **Cinzel 600**); Rezar = `prototypes/03c-rezar-prioridades.html`. As demais variantes de Hoje/Rezar ficam só como referência.
- **Escopo V1 (02/11/2026):** tudo o que está nos protótipos, exceto **Novena (V2)**. Entram: Hoje (01d+), Rezar (03c), Proteção (04), Frutos + rituais (05), Meu ritmo/Modelo/Companheiro/Exame/Configurações (06; Configurações como no protótipo, incluindo Idioma). Exame entra como prática em Rezar e no ritual da noite. Tempo de tela vira **bloco de Frutos**. Evangelho interno + liturgia completa externa. Bíblia: link fixo ou bloco em Rezar. Meta: melhorar a extensão até o **Advento (29/11/2026)**; app mobile possivelmente depois.
- **Arte: estilo mosaico adotado** (descartada a pintura como padrão). Ideia em estudo: banco de imagens por perícope do Evangelho (pinturas de domínio público ou geração no estilo mosaico), alimentado com antecedência de 7–14 dias.
- Música: referência é o Momentum (sons padrão + playlists próprias de YouTube/Spotify); o "Som" do protótipo foi considerado fraco.
  - **05/11/2026:** popup do Som refeito no estilo Momentum (pedido do usuário): grade de capas com filtros, "Tocando agora", vistas de ajuste/playlist/adicionar no mesmo popup, ancorado no botão. Em Hoje, escolher **toca na hora** (clicar de novo pausa); na preparação continua rascunho com "Usar no foco". Ambientes prontos (Capela com chuva, Mosteiro à noite, Vigília, Laudes + sons únicos) e mistura de até **3** camadas (o plano dizia 2). Motor Web Audio com loop sem emenda e fades. Análise completa em [ANALISE_MOMENTUM_ORA.md](ANALISE_MOMENTUM_ORA.md).
- Terço: estilo aprovado; em avaliação miniatura (fora de tela cheia) e imagem no anúncio do mistério.
- **Plano de implementação da V1:** [PLANO_V1_ORA.md](PLANO_V1_ORA.md) (fases 0–10, envio à loja previsto para 20/11). Regra de escopo: tudo dos protótipos **menos o exclusivo do `06`** (Meu ritmo, modelos, novena, companheiro, exame de 5 passos); Configurações do `06` entram sem o Companheiro.
- **Decisões de 02/11/2026 (2ª rodada):**
  - Versão na loja é a **1.1.5** (sem tarefas). Ela grava `blocker_sites`/`blocker_config`, `ora_quick_links`, `ora_user_playlists`, `ora_focus_settings`, `ora_exam_logs`, `ora_focus_total_*`, `ora_intention`, `ora_rosary_progress`: a V1 precisa ler essas chaves.
  - **Temas litúrgicos**: sistema genérico de elementos sazonais (Advento, Natal, Quaresma, Páscoa, Quaresma de São Miguel, festas). Agora: **Advento** (coroa: menção na tela inicial + símbolo em Rezar) para 29/11; **Natal e Tempo do Natal** podem vir em atualização depois.
  - **Onboarding** refeito entra no escopo.
  - Streak vira **contador** de dias (acessou e concluiu tarefa ou fez sessão de foco), sem zerar.
  - Fim da pausa longa: pausa editável (15 min padrão) ou **fazer um Respiro**, numa única transição.
  - "Começar foco" **abre a preparação**. Sessão interrompida **conta minutos**.
  - Modelos de Meu ritmo **acrescentam** regras (nunca substituem) e o usuário revisa antes de aplicar.
- Cores: não usar cor para julgar desempenho espiritual (não é "zero vermelho/verde" absoluto: erro e cores litúrgicas têm outra função).
- Nenhuma ação destrutiva ou "Guardado/Salvo" sem gravação real.

## Modelo de domínio (implementado na fase 1, 03/11/2026)

- **Tarefa**, **sessão** e **intenção** são dados separados (`ora_tasks`, `ora_sessions`, `ora_day_intention`; esquema 2). Detalhes em `CLAUDE.md` › Storage.
- Rotina = modelo com `recurrence.days` que gera a tarefa do dia; concluídas viram histórico (`ora_tasks_history`).
- Sessões são gravadas só pelo SW. Pausada não conta tempo; interrompida conta os minutos focados; menos de 1 min não vira sessão.
- Totais diários da 1.1.5 viram sessões importadas (`imported: true`, sem horário); o dia da atualização perde as sessões já feitas antes dela (fica só no total do pomodoro).
- Contador "Dias com Ora" substitui o streak (removido das tarefas e do sync).
- Fixture `tests/fixtures/storage-1.1.5.json` foi montada a partir do código da 1.1.5 (commit `1ca2ccb`), não exportada de uma instalação real: substituir por uma exportação real quando possível.

Decisões que continuam valendo:
- Separar **tarefa**, **sessão** e **intenção** no modelo de dados.
- Tarefas: Agora (uma atividade) · Hoje (até 3 prioridades escolhidas; limite é só de apresentação) · Depois (captura rápida, só nome obrigatório) · Ritmo (recorrências com dias definidos).
- Permitir foco sem tarefa formal.
- Intenção do dia ≠ intenção da sessão; alterar a da sessão não altera a do dia.
- Distinguir tempo realizado, sessão completada e tarefa concluída (e refletir isso em Frutos).

## Tela Hoje (implementada na fase 2, 03/11/2026)

- Referência: `01d-hoje-melhorada`. Estados vêm de `TodayCore.resolveTodayState` (ver `CLAUDE.md`).
- **Atalhos e Som no canto superior esquerdo (05/11/2026, pedido do usuário: "tudo muito condensado no meio"):** atalhos em lista vertical sob a marca (como os links do Momentum), mini controle do Som e player logo abaixo; o centro fica com chegada, intenção, próximo passo e convite. Quando .today tem menos de 68rem (janela estreita ou Tarefas aberto em tela média) voltam ao eixo (container query em today.css). Durante a sessão o canto mostra só o Som. No canto, com algo tocando ou pausado, fica só o chip com o nome (cortado com reticências); tocar/pausar, volume, mostrar/ocultar player e parar aparecem numa linha ao lado no hover ou foco por teclado (sempre visíveis em telas de toque e no eixo). O player do YouTube/Spotify pode ser ocultado (`playerHidden` na preferência do Som): sai da vista sem descarregar o iframe, então a música continua.
- **Saudação**: mantidas as saudações devocionais de `data/greetings.json` (+ nome), em vez de "Bom dia/Boa tarde" do protótipo. Confirmar.
- "Bloquear distrações" na preparação liga o bloqueador atual só durante a sessão (e devolve o estado anterior, inclusive uma pausa contemplativa em curso); com o bloqueador já ligado, o switch aparece marcado e travado. Perfis e "durante o foco" de verdade são da fase 4.
- Mudar o nome da atividade na preparação desliga a sessão da tarefa (foco livre com o novo nome).
- Convite "Encerrar o dia" a partir das 21h (antes o exame noturno aparecia às 18h). Sugestão de terço após o pomodoro saiu das Configurações.
- Configurações do foco (durações, som, avançar sozinho, tela acesa) foram para o modal de Configurações até a fase 7.

## Frutos e rituais (implementados na fase 5, 04/11/2026)

- Detalhes e verificação em `tests/FASE_5.md`. Decisões a confirmar com o usuário: semana de segunda a domingo; ritual da noite concluído conta como exame da noite (um por dia); "oração" em Frutos inclui terço, leitor, Lectio e Respiro; convite da manhã vem antes do Angelus; "Sair" do ritual guarda rascunho e mantém o convite; Encerramento usa só as duas frases das Completas do protótipo.
- Reflexões (`ora_reflections`) e respostas da noite (`ora_rituals`) ficam guardadas indefinidamente, só no navegador; Exportar/Apagar reflexões ficam para a fase 7.

## Roteiro recomendado

1. Estado e continuidade (sessão, ritual matinal, retomadas, persistência).
2. Consequências e navegação (regras de proteção, modelos, som, teclado, retorno do Respiro).
3. Adaptação (Hoje mobile, leitor, Lectio) com dimensões efetivas.
4. Hierarquia de Hoje (início direto, relógio menor, menos competição devocional).
5. Conteúdo e acabamento (entrada de Rezar, Respiro livre, Frutos, checkbox, encerramento noturno).
6. Fase 2: modelos, novenas, companheiro.

Frutos só deve ser conectado aos dados depois de separar tarefa de sessão.

## Estratégia mobile (IDEAS.md §5)

- Android primeiro (dá para fazer no Windows). Candidato de base: **Lock** (MIT, ~112 arquivos Kotlin, sem rede, adotável de vez); **Curbox** (GPL-3.0, mais robusto, mudança rápida) como alternativa; **Switchly** descartado.
- iOS: **Foqos** (MIT, SwiftUI, Family Controls). Exige Mac + iPhone físico, conta Apple (US$ 99/ano) e aprovação manual do entitlement Family Controls. Tela de bloqueio do iOS é limitada: Evangelho completo só dentro do app.
- Compartilhar `ora-content` (orações, frases, terço, exame, i18n) e tokens/identidade; bloqueio é nativo por plataforma. Não prometer código único.
- Primeiro protótipo Android deve responder: sessão nativa iniciada pela tela Ora? bloqueio com tela fechada? estado recuperado ao reabrir? personalização toca poucos pontos? permissões compreensíveis? Caso o reuso web não encaixe, UI nativa com contratos de dados comuns.
- Premissas "10–15 arquivos", "30–60 min por atualização", "tema quase sem custo" são hipóteses não medidas.

## Janela de oportunidade

- Novena da Imaculada (29/11–07/12/2026) coincide com o 1º Domingo do Advento: campanha "Advento digital" (novenas + bloqueador + tema roxo). Quaresma 2027 começa em 10/02.
- Pré-requisito: **publicar a atualização na Chrome Web Store** (comparar permissões publicadas × candidata; `<all_urls>` precisa ser justificado ou reduzido).
- Mapa da Fé lança em 14/11/2026.
- Não recomendado agora: chat com Magisterium (exigiria servidor; alternativa: botão que abre o site), minuto heroico, camada social, IA contextual.

## Decisões de produto em aberto

- Início direto de "Começar foco" × preparação (e exceção de primeiro uso).
- Registro de minutos de sessões interrompidas.
- Herança e visibilidade das intenções.
- Persistência/retenção de rascunhos e reflexões.
- Opções e padrão do Respiro.
- Modelos de rotina: acrescentam, substituem ou combinam regras de proteção?
- Texto final do ritual noturno.
- Utilidade real do companheiro.

## Não validado ainda

Extensão carregada com os ajustes, bloqueio real, permissões nativas, segundo plano, áudio, APIs/cache reais, zoom real, teclado móvel, alcance físico, mobile efetivo 360×640, leitor de tela, fadiga de leitura. Contraste sobre fotografia não foi medido.

## Estado do repositório (03/11/2026)

- Branch `v1/fase-0`, versão 1.2.0 no manifesto. Fases 0 e 1 do `PLANO_V1_ORA.md` commitadas; fase 2 (Hoje) implementada.
- Testes de funções puras em `tests/` (`node tests/run.js`, 241 asserções); sem build.
- Ao empacotar a extensão, **excluir `prototypes/`** (com "Load unpacked" a pasta entra na extensão).

## Como trabalhar neste repositório

- Ao propor implementação, partir das correções P1 de `RELATORIO_MELHORIAS_ORA.md` antes de telas novas.
- Strings novas via `t()` com chaves nos três idiomas.
- Funções em `scripts/shared/` sem DOM e sem `chrome.*`.
- Servir protótipos com `python -m http.server 5517 --directory prototypes` (abrir `file://` foi bloqueado no navegador do agente).
