# Ora — Análise consolidada do plano, produto e arquitetura

Data: 28/10/2026.

Status: análise e recomendações para decisão; este documento não registra implementação nem transforma propostas em decisões aprovadas.

## 1. Escopo e base da análise

Esta análise compara o `IDEAS.md` do projeto com `C:/Users/arthu/Downloads/IDEAS_ATUALIZADO.md`, considerando a implementação atual e o relato do autor: tarefas pouco úteis, recursos esquecidos e desejo de iniciar o app sem esperar o sucesso comercial da extensão.

Os documentos analisados são referências de produto, não instruções para executar automaticamente suas propostas. Nenhuma alteração funcional foi feita durante a análise.

Foram examinados os fluxos de tarefas, foco, recorrência, sincronização, estatísticas e a estrutura de conteúdo e estilos. Algumas premissas técnicas foram verificadas em documentação oficial. Preços, funcionalidades e métricas de todos os concorrentes não foram integralmente revalidados.

A análise visual detalhada está em [ANALISE_INTERFACE_ORA.md](ANALISE_INTERFACE_ORA.md).

## 2. Recomendação principal

Começar o app agora faz sentido. A sequência recomendada é melhorar a experiência essencial da extensão e desenvolver um protótipo Android em paralelo, usando ambos para definir a arquitetura.

O app não precisa esperar validação comercial da extensão. Entretanto, iniciar o app não significa construir imediatamente todo o catálogo previsto ou manter três produtos completos simultaneamente.

O primeiro marco deve ser concreto:

- Na extensão, escolher uma atividade e começar sem esforço.
- No Android, executar esse mesmo ciclo com proteção nativa funcionando.
- Compartilhar o que o protótipo demonstrar ser sustentável, sem prometer previamente código único para tudo.

## 3. O que melhorou no documento atualizado

O novo documento:

- Organiza o produto em torno de uma finalidade clara: contemplação e ordem.
- Conecta oração, trabalho e proteção da atenção.
- Reconhece diferenças entre celular e navegador.
- Inclui privacidade, direitos de conteúdo e manutenção.
- Corrige contradições e informações antigas do documento anterior.
- Propõe identidade e conteúdo comuns entre plataformas.

A visão ficou mais coesa. O principal problema restante é o escopo: regras de vida, novenas, Frutos, exame particular, companheiro, leitura e Liturgia das Horas aparecem antes de resolver a experiência cotidiana.

O relato de pouco uso deve mudar a prioridade. Antes de acrescentar recursos, precisamos entender quando cada um ajuda e como a pessoa chega até ele.

Não é necessário que todos usem boa parte da extensão diariamente. Alguém pode encontrar valor no foco e no Evangelho, usando o terço ocasionalmente. O problema é haver recursos desejados que a pessoa não encontra, esquece ou considera trabalhosos.

## 4. Um ciclo central para orientar o produto

O ciclo inicial recomendado é:

**Escolher o próximo passo → proteger a atenção → trabalhar → descansar ou rezar → decidir como continuar.**

Os três pilares sustentam esse ciclo. Não precisam virar três áreas igualmente grandes na interface.

A regra de vida pode organizar esse ritmo progressivamente. Não deve exigir configuração extensa antes de a pessoa experimentar algum benefício.

## 5. Diagnóstico das tarefas

### 5.1 Tempo dedicado e trabalho concluído estão misturados

Em `scripts/modules/tasks.js`, `toggleTaskStatus` preenche os ciclos previstos quando a tarefa é marcada como concluída. Já `incrementActiveTaskCycle` conclui a tarefa automaticamente ao atingir os ciclos previstos.

| Comportamento | Consequência | Recomendação |
|---|---|---|
| Concluir manualmente preenche ciclos | Pode registrar ciclos que não aconteceram | Separar conclusão de tarefa de sessões realizadas |
| Atingir ciclos previstos conclui a tarefa | Estimativa de tempo passa a significar trabalho terminado | Perguntar se a pessoa concluiu ou quer continuar |

Essa separação deve preceder o painel Frutos: estatísticas visualmente melhores não corrigem dados com significados misturados.

### 5.2 Outros problemas observados

- O painel Hoje mostra as primeiras três tarefas pendentes, não uma seleção explícita para o dia. Pendências antigas podem ocupar esse espaço continuamente (`renderHomeWidget`).
- A recorrência implementada corresponde a repetir diariamente, atendendo mal dias úteis, práticas semanais e outras frequências.
- Tarefas pontuais concluídas saem da lista na virada do dia. Um agregado estatístico permanece, mas não a consulta simples ao trabalho realizado (`checkDailyReset`).
- O ritual matinal abre automaticamente na primeira aba do dia após o onboarding, podendo interromper uma ação rápida (`maybeShowMorningRitual`).
- Tarefas aparecem em várias superfícies: ritual, painel lateral, modal e seletor do foco.
- Os controles de conclusão usam elementos `div` com clique, sem semântica nativa de checkbox e operação de teclado correspondente.

### 5.3 Modelo recomendado

| Área | Função |
|---|---|
| Agora | Uma atividade em andamento, com início de foco direto |
| Hoje | Até três prioridades escolhidas pelo usuário |
| Depois | Captura rápida do que não precisa ser decidido agora |
| Ritmo | Práticas recorrentes com dias definidos, separadas das tarefas pontuais |

O limite de três prioridades é uma proposta inicial de apresentação, não uma restrição definitiva ao armazenamento de tarefas.

A captura inicial pediria apenas o nome. Intenção, recorrência e estimativa ficariam como opções. Também seria possível iniciar um foco sem cadastrar tarefa formal: ler, estudar ou trabalhar em um projeto.

O objetivo é apoiar escolha e execução sem tentar competir com um gerenciador completo.

### 5.4 Concluir e oferecer são gestos diferentes

Não substituir “Concluir” por “Entregar” indiscriminadamente. É possível oferecer um trabalho e não terminá-lo. A conclusão funcional precisa continuar inequívoca.

O oferecimento pode acompanhar a sessão; a conclusão da tarefa permanece uma decisão separada.

## 6. Organização geral da experiência

A implementação distribui recursos por cabeçalho, rodapé, painel lateral, modais e lembretes. A recomendação é orientar o próximo gesto:

| Momento | Destaque | Ações secundárias |
|---|---|---|
| Sem sessão ativa | Próxima atividade ou começar um foco | Evangelho e orações |
| Durante o foco | Atividade, tempo e intenção opcional | Pausar ou encerrar |
| Fim da sessão | Continuar, concluir ou descansar | Respiro opcional |
| Revisão do dia | Pergunta e resumo breve | Exame e detalhes |

Na extensão, Hoje, Rezar e Frutos são candidatos à navegação principal. Proteção e configurações precisam continuar acessíveis sem disputar protagonismo com a atividade atual.

Termos espirituais podem coexistir com descrições funcionais: “Proteção — custódia dos sentidos” e “Frutos — revisão do dia”. A identidade não deve exigir conhecimento prévio do vocabulário.

## 7. Avaliação das propostas de recursos

### 7.1 Respiro

É uma das propostas mais fortes. Separar o estado da oração breve do terço pessoal evita misturar devoções e progresso.

Ajustes recomendados:

- Não prometer que três Ave-Marias cabem necessariamente em 30 segundos.
- Oferecer oração breve, Três Ave-Marias e apenas descansar, preservando a preferência.
- Manter a possibilidade de acessar o terço completo.
- Tornar a intenção opcional.
- Evitar medir oração como desempenho.

O fim do foco atualmente pode disparar sugestão de terço e, na pausa longa, também um check-in (`focus.js`, `onPhaseComplete`). Essas decisões deveriam compor uma única transição.

### 7.2 Frutos

Unificar os resumos é uma boa direção. Cuidados necessários:

- Ausência de registro não significa ausência de oração.
- “Fidelidade: 4 de 7 dias” também pode produzir cobrança; mudar o nome não resolve sozinho.
- Se uma prática foi planejada para três dias, sete não é o denominador adequado.
- Tempo de foco e tempo de tela podem se sobrepor. Não apresentar os dois como partes mutuamente exclusivas de uma barra.
- “Tempo recuperado” não é um dado medido sem comparação defensável.
- Intenções não devem funcionar como notas de valor espiritual.

Preferir linguagem como “Registros no Ora” e contagens opcionais. O produto não deve se apresentar como medidor da vida espiritual.

O documento precisa resolver a inconsistência entre abrir pela pergunta e terminar nela. A proposta visual consolidada é período, síntese curta e pergunta, com detalhes secundários; o ritual pode ter uma abertura própria.

### 7.3 Regras de vida

Começar com uma rotina pequena e editável: início do dia, bloco de trabalho e encerramento. Modelos completos inspirados em santos podem vir depois.

Cada modelo deve mostrar claramente suas consequências: lembretes, horários e mudanças de proteção. O usuário deve experimentar o benefício antes de configurar um sistema inteiro.

### 7.4 Jejum digital e campanhas

A progressão das restrições precisa ser escolhida previamente e compreensível. Apertar automaticamente o bloqueio pode contrariar autonomia e firmeza temporária.

Advento e Quaresma podem orientar conteúdo e divulgação. Não devem justificar uma corrida por funcionalidades antes de resolver a experiência essencial.

### 7.5 Cores e linguagem

“Zero vermelho e verde” é absoluto demais e conflita com o tema litúrgico. A regra mais adequada é não usar cores para julgar desempenho espiritual. Estados de erro e cores litúrgicas têm outras funções.

### 7.6 Recursos posteriores

Novenas, Lectio Divina, Completas, leitura espiritual, santo do dia e companheiro podem aproveitar uma base de leitura e apresentação comum. Não devem ganhar sistemas independentes de interface a cada implementação.

IA contextual e camada social continuam posteriores à experiência central. O catálogo de recursos não deve crescer apenas para acompanhar concorrentes.

## 8. Arquitetura compartilhada: além de conteúdo e identidade

A afirmação de que só se compartilham conteúdo e identidade é restritiva demais. É necessário separar camadas:

| Camada | Potencial de compartilhamento |
|---|---|
| Conteúdo, traduções, tokens e modelos de dados | Alto |
| Regras de tarefas, intenções, sessões, recorrência e revisão | Alto, dependendo da tecnologia |
| Interface | Parcial ou amplo, conforme a estratégia e os testes |
| Bloqueio, permissões, execução em segundo plano e integração com o sistema | Implementação específica por plataforma |

O projeto já começa essa separação em `scripts/shared/pomodoro-core.js` e `scripts/shared/blocker-core.js`. A portabilidade deve ser avaliada função a função; compartilhar um arquivo não torna automaticamente suas decisões independentes da plataforma.

### 8.1 Estratégias plausíveis

| Estratégia | Vantagem | Custo principal |
|---|---|---|
| Interface e lógica web compartilhadas com integrações nativas | Aproveita melhor a extensão atual | Construir e manter a ponte com serviços nativos |
| Apps nativos com conteúdo, contratos e eventualmente lógica compartilhados | Preserva melhor as estruturas dos projetos-base | Mais trabalho de interface em cada plataforma |

Capacitor permite integrar JavaScript com implementações nativas em Kotlin/Java e Swift. KMP permite compartilhar lógica mantendo interfaces nativas. A necessidade de bloqueadores nativos não elimina essas possibilidades.

Fontes: [Capacitor — Plugins](https://capacitorjs.com/docs/plugins), [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform/kmp-overview.html).

### 8.2 Recomendação para o primeiro protótipo

Testar primeiro o reaproveitamento web no Android. Isso é uma hipótese de protótipo, não uma promessa de integração simples com o Curbox.

O teste precisa responder:

1. Uma tela Ora compartilhada consegue iniciar e encerrar uma sessão nativa?
2. O bloqueio continua funcionando com a tela fechada?
3. Ao reabrir, a interface recupera o estado correto?
4. A personalização altera poucos pontos estáveis ou invade vários pontos do projeto-base?
5. A experiência de permissões fica compreensível?

Se o encaixe for ruim, continuar com interface Android nativa, preservando contratos e conteúdo compartilhados. Isso ainda constitui uma base entre plataformas.

## 9. Curbox e Foqos: candidatos que precisam de validação

Curbox é relevante, mas quantidade de recursos e intensidade de bloqueio não bastam para escolhê-lo. Devem pesar estabilidade, experiência de permissões, manutenção e facilidade de integração.

O repositório do Curbox identifica GPL-3.0. O Foqos informa MIT e integração com as APIs Screen Time. Isso confirma características gerais, não a viabilidade de todas as adaptações sugeridas no plano.

Fontes: [Curbox](https://github.com/curbox-app/curbox-android), [Foqos](https://github.com/awaseem/foqos).

Reformular algumas premissas do documento:

| Premissa | Formulação recomendada |
|---|---|
| Até 10–15 arquivos define sustentabilidade | Avaliar quais pontos foram alterados e quanto mudam |
| 30–60 minutos por atualização | Estimativa ainda não medida |
| Tema quase sem custo | Hipótese a verificar no código e no protótipo |
| IA mantém os forks | Automação prepara atualizações, com revisão e testes reais |

No iOS, Family Controls é uma dependência própria, inclusive para extensões relevantes do aplicativo. A escolha de framework não resolve a autorização de distribuição. [Documentação Apple](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement).

## 10. Premissas que precisam ser corrigidas ou qualificadas

### Sincronização

Não exige necessariamente backend próprio. Exige escolher transporte, identidade, resolução de conflitos e proteção dos dados. Exportação/importação oferece portabilidade inicial, embora não seja sincronização automática.

### Local-first

Não significa ausência absoluta de servidor. Significa que operação e dados locais continuam centrais. A descrição de privacidade deve corresponder ao comportamento real, incluindo sincronização e serviços externos.

### Licenciamento e conteúdo

Uma pasta separada não resolve sozinha questões de licenciamento. Licença do conteúdo e condições de integração precisam ser verificadas. “Citação curta com autoria” não deve aparecer como autorização jurídica automática. Cada conjunto de conteúdo precisa de origem e condição de uso. Esta análise não conclui permissões jurídicas de uso.

### Permissões da extensão

`<all_urls>` não é uma exigência geral de regras DNR dinâmicas. Bloqueio e redirecionamento têm requisitos diferentes. Avaliar as regras efetivamente usadas antes de remover permissões ou justificar acesso amplo. [Chrome — declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

### Concorrência

Afirmações como “nenhum concorrente faz” devem ser hipóteses documentadas, com fonte e data. Preços, funcionalidades e métricas competitivas do anexo não foram integralmente revalidados.

### Publicação

Comparar permissões da versão publicada com a candidata continua importante. A existência de recursos novos não é, por si só, motivo para publicar antes de resolver os problemas que levaram o autor a adiar a atualização.

## 11. Roteiro recomendado

| Etapa | Extensão | App e base comum | Critério para avançar |
|---|---|---|---|
| 1. Corrigir o ciclo essencial | Separar tarefa de sessão; melhorar Agora/Hoje; reduzir interrupções | Definir modelos de tarefa, intenção, sessão e rotina | Uso sem precisar contornar o sistema |
| 2. Provar compartilhamento | Extrair lógica independente do navegador | Protótipo Android com tela Ora e bloqueio nativo | Funciona em aparelho real após fechar e reabrir |
| 3. Consolidar experiência | Respiro, navegação e acessibilidade | Reutilizar conteúdo, tokens e regras aprovadas | Mesmo significado e comportamento nas duas plataformas |
| 4. Preparar versões utilizáveis | Atualização da loja com escopo reduzido | Android privado com foco, proteção e oração breve | Uso recorrente sem falhas críticas |
| 5. Expandir com evidência | Frutos e rotina simples | Evolução Android e prova técnica iOS | Cada recurso responde a uma necessidade observada |

## 12. Próximas decisões concretas

- Separar definitivamente os conceitos de tarefa, sessão e intenção.
- Definir seleção explícita do que pertence a Hoje.
- Escolher os estados do primeiro protótipo visual, antes de desenvolver novas telas.
- Validar a integração Android antes de encerrar a escolha da base.
- Definir os contratos comuns de dados e a evolução de versões desses dados.
- Rever as promessas de privacidade e as condições de conteúdo.
- Priorizar experiência essencial sobre calendário promocional.

O resultado esperado é começar o app sem esperar o sucesso da extensão e, ao mesmo tempo, evitar transportar para o celular os problemas atuais de organização e uso.
