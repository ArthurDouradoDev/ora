# Ora — Análise consolidada da interface e direção para extensão e mobile

Data: 28/10/2026.

Status: diagnóstico e proposta de design. Nenhuma tela foi implementada ou aprovada como desenho final nesta análise.

## 1. Escopo, evidências e limitações

Esta análise aprofunda composição, hierarquia, tipografia, cores, superfícies, controles, navegação, estados e adaptação entre plataformas.

Base examinada:

- `assets/screen.png`, imagem de referência de uma versão anterior.
- `ora.html` e `blocked.html`.
- Estilos de layout, botões, campos, vidro, modais, tarefas, foco, orações, terço, exame, configurações, onboarding e tempo de tela.
- Código de tarefas, foco, intenção e utilitários de apresentação.

A imagem não representa integralmente a versão atual: não inclui todos os controles presentes no código. O acesso ao navegador estava desabilitado e o verificador 21st não estava instalado. Não houve validação interativa de telas, medição final de contraste ou teste de responsividade.

Consequentemente:

- Estruturas e declarações do código são evidências verificáveis.
- Avaliações de composição e escolhas de estilo são recomendações de design.
- Sobreposição, contraste efetivo e comportamento em dispositivos são pontos a testar, não defeitos já reproduzidos.

A análise de produto e arquitetura está em [ANALISE_PLANO_ORA.md](ANALISE_PLANO_ORA.md).

## 2. Direção principal

Evoluir o Ora preservando sua atmosfera e mudando a hierarquia. Fotografia, espaço vazio e sobriedade já constituem uma identidade. Falta um sistema visual que dê tratamento diferente a chegar, organizar, concentrar-se e rezar.

A proposta é combinar uma chegada espaçosa e contemplativa com uma experiência clara quando a pessoa decide agir.

## 3. O que preservar

Na imagem de referência, arquitetura da igreja e relógio atraem primeiro o olhar; depois aparecem saudação e intenção. O conjunto transmite recolhimento.

Preservar:

- Fotografia com área generosa na extensão.
- Centro com poucos elementos.
- Tipografia clássica em pontos específicos.
- Presença discreta de conteúdo devocional.
- Possibilidade de abrir uma aba e simplesmente permanecer ali por um instante.

A ameaça é o crescimento por adição: cada função recebe botão, painel ou lembrete sem reorganização do conjunto. O centro continua simples, mas as bordas ficam dispersas. Novenas, Frutos, regra de vida e companheiro não devem ser acrescentados seguindo indefinidamente esse padrão.

O espaço vazio deve permanecer; é necessário organizar melhor aquilo que o cerca.

## 4. Hierarquia por estado

O relógio chega a `8rem` em `styles/modules/dashboard.css`. Isso funciona para uma nova aba contemplativa, mas a atividade deve ganhar prioridade quando a pessoa começa a trabalhar.

| Estado | Elemento dominante | Apoio |
|---|---|---|
| Repouso | Relógio e saudação | Próximo passo, intenção e atalhos |
| Preparação | Atividade e botão de início | Duração e proteção |
| Sessão ativa | Atividade e tempo restante | Intenção, pausa e som |
| Leitura ou oração | Texto | Contexto, progresso e navegação |
| Revisão | Pergunta e síntese | Registros e detalhes |

A navegação deve permanecer estável. O espaço central assume a atividade atual, sem rearranjos constantes de todos os controles.

## 5. Controles e previsibilidade

Liturgia, Música, Bíblia, Bloqueador, Pomodoro e Orações têm tratamentos próximos, mas produzem resultados diferentes: sair para outro site, abrir configuração ou iniciar atividade.

| Tipo de controle | Tratamento proposto |
|---|---|
| Navegação | Texto e ícone discreto, com seleção identificável |
| Ação principal | Botão preenchido, predominante no contexto |
| Opção auxiliar | Menor ênfase, mantendo texto legível |

Indicar discretamente links externos. Diferenciar leitura interna do Evangelho de acesso a uma página de liturgia externa.

Funções que precisam ser descobertas, como tarefas e Frutos, devem ter rótulos visíveis. Ícones isolados são adequados a ações familiares, como fechar e configurações, desde que tenham nomes acessíveis.

## 6. Superfícies e transparência

A mesma família de vidro é usada em botões, painéis e modais. A regra `.glass-panel:hover`, em `styles/components/glass-panels.css`, altera fundo, sombra e posição de qualquer elemento que utilize a classe.

Uma superfície de leitura não deve reagir como um botão.

| Contexto | Superfície recomendada |
|---|---|
| Navegação sobre fotografia | Vidro discreto |
| Informações breves | Vidro ou superfície leve |
| Organização de tarefas | Painel quase opaco com divisões simples |
| Leitura | Fundo estável, independente da fotografia |
| Oração imersiva | Superfície uniforme e poucos controles |
| Configurações | Listas claras, sem cartões aninhados desnecessários |

O vidro permanece como parte da identidade, com função delimitada.

Há uma declaração inválida `transform: -50%, -50%` em `styles/modules/prayers.css`, no hover do leitor. Deve ser corrigida, mas não foi confirmado um salto visual: animações também interferem na transformação.

## 7. Tipografia

A Cinzel funciona em marca, aberturas e títulos específicos. No leitor atual, aparece no corpo inteiro da oração, centralizado e com entrelinha de `2`. A avaliação de design é que isso pode cansar em textos extensos e dificultar localizar o início da linha seguinte.

| Uso | Direção |
|---|---|
| Marca e títulos cerimoniais | Cinzel com moderação |
| Controles, tarefas e configurações | Sem serifa, regular ou média |
| Evangelho, leitura e orações longas | Serifa voltada à leitura, em caixa normal |
| Relógio e cronômetro | Algarismos estáveis em largura |
| Perguntas de reflexão | Serifa; itálico apenas em trechos curtos |

Referências iniciais para protótipos, não medidas rígidas:

- Interface: aproximadamente 15–16 px.
- Leitura: 18–20 px, ajustável.
- Entrelinha de leitura: aproximadamente 1,55–1,75.
- Coluna: aproximadamente 55–70 caracteres quando houver largura disponível.
- Texto longo alinhado à esquerda; centralização para trechos curtos.

Reduzir rótulos pequenos em caixa alta e com baixa opacidade. Discrição deve resultar de posição, espaço e hierarquia, não da dificuldade de leitura.

## 8. Cores, fotografia e movimento

### 8.1 Cores

Separar três papéis:

- Marca: dourado.
- Contexto litúrgico: detalhe de cor acompanhado de texto.
- Estado funcional: informação, erro, indisponibilidade e seleção.

A cor litúrgica pode aparecer no nome do tempo, num marcador ou em ilustração. Evitar recolorir diariamente toda a interface; o usuário precisa continuar reconhecendo controles.

Não usar cor para julgar desempenho espiritual. Isso não elimina cores de erro ou cores próprias do calendário litúrgico.

### 8.2 Fotografia

- Escolher imagens com áreas tranquilas para conteúdo sobreposto.
- Definir enquadramentos para paisagem e retrato.
- Evitar campos sobre rostos, inscrições e elementos centrais.
- Manter fundo local de reserva.
- Não trocar a imagem durante leitura e foco.

### 8.3 Movimento

Animar para explicar mudanças: abertura, avanço de conta e resposta a uma ação. Reduzir pulsações contínuas, brilho e ícones flutuantes. Não foi encontrado tratamento de movimento reduzido nos arquivos pesquisados.

### 8.4 Contraste

Medir contra o fundo efetivo, incluindo transparência e fotografia. A referência WCAG é 4,5:1 para texto comum e 3:1 para texto grande. Não foi feita aprovação dos contrastes atuais.

Fonte: [W3C — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## 9. Três direções de composição

| Direção | Composição e navegação | Vantagem | Risco |
|---|---|---|---|
| Paisagem contemplativa | Fotografia dominante, controles periféricos e ferramentas sob demanda | Preserva a nova aba atual | Recursos podem continuar pouco evidentes |
| Caderno do dia | Conteúdo central sólido e organização vertical | Leitura e adaptação mobile | Pode perder atmosfera na extensão |
| Paisagem com espaço de trabalho | Chegada ampla, atividade central e superfícies próprias para organizar e ler | Equilibra identidade, clareza e crescimento | Requer evitar informação duplicada |

Recomendação: **Paisagem com espaço de trabalho**.

Na extensão, a paisagem é a experiência de chegada. No celular, a composição se aproxima do caderno do dia. Tipografia, cores, componentes e linguagem permanecem comuns. São dois layouts do mesmo produto, não dois estilos independentes.

As alternativas acima são direções conceituais, não protótipos implementados e testados.

## 10. Estrutura proposta para a extensão

Navegação principal: **Hoje · Rezar · Frutos**. Proteção com estado visível e acesso próprio; configurações separadas.

```text
ORA       Hoje   Rezar   Frutos       Proteção ativa   Configurações

                         Relógio
                         Saudação

                    PRÓXIMO PASSO
                  Preparar apresentação
                    [ Começar foco ]

                 Oferecer por… · opcional

                       Seus atalhos

                Convite contextual, quando houver
```

O esquema representa hierarquia, não desenho final.

Decisões propostas:

- Uma localização principal para a próxima atividade.
- Distinção explícita entre intenção do dia e intenção da sessão.
- Lista completa de tarefas fora de um painel permanentemente sobreposto.
- Música como controle auxiliar, associado ao foco quando apropriado.
- Um espaço previsível para convites, evitando vários avisos concorrentes.
- Frase espiritual com menor prioridade quando outro conteúdo devocional já estiver em destaque.

O painel de tarefas atual é fixo e tem 320 px de largura (`styles/modules/tasks.css`). Ele se sobrepõe à composição em vez de participar de seu layout.

### 10.1 Onde abrir cada conteúdo

| Necessidade | Apresentação |
|---|---|
| Escolher duração, intenção ou som | Painel contextual pequeno |
| Organizar tarefas | Painel lateral integrado ao layout |
| Biblioteca e Frutos | Área principal de conteúdo |
| Ler, rezar ou examinar | Espaço dedicado |
| Confirmar ação destrutiva | Modal curto |

## 11. Estrutura proposta para mobile

O relógio perde prioridade porque já está presente no sistema. O usuário precisa reconhecer rapidamente o que pode fazer.

Destinos fixos: **Hoje · Rezar · Proteção · Frutos**.

Configurações no topo. Foco como atividade iniciada em Hoje, sem quinta aba.

```text
ORA                                      Configurações
Quarta-feira

Bom dia, Arthur

AGORA
Preparar apresentação
25 minutos · proteção configurada
[ Começar foco ]

PARA HOJE
Revisar capítulo
Enviar documento
[ Adicionar ]

EVANGELHO DO DIA
Referência e breve introdução
[ Ler ]

Hoje        Rezar        Proteção        Frutos
```

Durante uma sessão, um resumo persistente acima da navegação mostra atividade, tempo e acesso para retomar. Na experiência imersiva, o restante sai de cena.

Evitar:

- Fotografia de tela inteira atrás de listas longas.
- Navegação escondida em gestos.
- Controles essenciais apenas no canto superior.
- Modais pequenos com leitura extensa.
- Carrosséis para conteúdo importante.
- Botão flutuante genérico que muda de significado entre telas.

Seleção de navegação com ícone e texto. Áreas de toque importantes aproximadamente entre 44–48 unidades lógicas, conforme a plataforma, sem exigir ícones enormes.

## 12. Evolução das telas existentes

| Tela | Limitação atual | Direção recomendada |
|---|---|---|
| Tarefas | Muitos sinais e ações na mesma linha | Título dominante, metadados secundários, início claro e edição separada |
| Foco | Controles compactos e apresentação distante da atividade | Atividade antes do cronômetro, pausa explícita e opções agrupadas |
| Biblioteca | Painel de canto com espaço limitado | Área pesquisável, continuar, favoritos e categorias |
| Leitor | Texto centralizado com fonte de exibição | Coluna estável, tamanho ajustável e posição preservada |
| Terço | Seletores, contas e texto competem | Preparação breve e modo de oração |
| Exame | Vários tratamentos de cartões e respostas | Uma pergunta por vez, navegação estável, pular e sair |
| Proteção | Organização por mecanismo | Resumo por site ou perfil, reunindo suas regras |
| Configurações | Lista crescente em modal estreito | Aparência, oração, foco, lembretes e dados |
| Música | Player e biblioteca podem disputar atenção | Controle discreto durante foco; biblioteca quando solicitada |

### 12.1 Terço

O modal pode rolar verticalmente e o texto interno também, com limite de 200 px; as contas adicionam rolagem horizontal (`styles/modules/rosary.css`).

Manter as contas, mostrando a dezena atual e uma indicação clara do mistério. Anterior e Próxima seriam os controles principais; tocar numa conta seria alternativa.

As contas atuais têm 14 px. O indicador pode continuar pequeno, mas a área de interação precisa crescer ou contar com controles equivalentes fáceis. A WCAG estabelece 24 × 24 CSS px como mínimo, com exceções de espaçamento e equivalência.

Fonte: [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### 12.2 Acessibilidade e responsividade transversais

- Substituir controles `div` de ação por elementos semânticos adequados.
- Garantir operação por teclado, foco visível e nomes acessíveis.
- Verificar foco de entrada e retorno ao abrir e fechar diálogos.
- Evitar ações disponíveis apenas por hover.
- Testar layout com texto ampliado, nomes longos e janelas pequenas.
- O uso atual de `100vh`, `overflow: hidden` e painéis fixos exige validação de recorte e sobreposição; não foi reproduzida uma falha específica.

## 13. Novas telas e elementos

### 13.1 Respiro

Experiência curta, sem cabeçalho completo de aplicativo:

- Título discreto.
- Intenção quando existir.
- Contas ou progresso textual.
- Oração legível.
- Uma ação principal.
- Saída simples.

Na extensão, painel central. No celular, tela dedicada ou folha ampla conforme o tamanho do texto. Sem cronômetro dominante nem mensagem de desempenho ao concluir.

### 13.2 Frutos

Três níveis: período, síntese curta e pergunta de reflexão. Detalhes de uso abaixo ou em expansão. Evitar começar com quatro indicadores grandes.

Dias sem registros têm tratamento neutro e legenda explícita. Diferenciar o que foi medido do que não foi.

Extensão: duas colunas podem separar síntese e reflexão. Mobile: sequência vertical, sem comprimir dashboard de desktop.

### 13.3 Regra de vida / Meu ritmo

Organizar por momentos:

```text
AO COMEÇAR
Oferecimento · sem horário fixo

DURANTE O DIA
Foco · dias úteis
Angelus · próximo de 12h

AO ENCERRAR
Exame breve · convite à noite
```

Cada item informa quando acontece e o que o Ora fará: lembrar, sugerir ou aplicar proteção. Modelos inspirados em santos são editáveis. Mostrar consequências antes da ativação, especialmente mudanças no bloqueio.

### 13.4 Rituais matinal e noturno

- Manhã: prioridade, intenção opcional e começo.
- Noite: gratidão, reflexão e encerramento.

Uma pergunta por etapa e saída disponível. Aparência noturna suave sem sacrificar contraste. O ritual não deve parecer formulário obrigatório.

### 13.5 Novenas e campanhas

Primeiro, dia e nome da novena; depois, oração do dia. Compromisso digital separado e concreto, como proteção das redes sociais entre 22h e 7h.

Progressão espiritual e configuração técnica não devem se confundir visualmente. Dias não registrados não ficam vermelhos. Permitir continuar, retomar ou ajustar.

### 13.6 Lectio Divina, leitura espiritual e Completas

Reutilizar a base do leitor. Lectio acrescenta etapas e uma orientação breve por vez, mantendo o texto bíblico acessível. Completas adapta estrutura de partes e respostas, sem outro sistema visual inteiro.

### 13.7 Companheiro e santo do dia

- Santo do dia: pequeno destaque em Rezar.
- Companheiro: presença breve no início ou fim da sessão.

Evitar personagem permanente, balões repetidos e animações solicitando atenção. Ilustração estática pode comunicar com menos interferência.

## 14. Proteção: configuração e interceptação

O usuário precisa compreender o que está protegido, quando, até quando, como funciona uma pausa e se falta alguma permissão.

Preferir resumos por site ou perfil a uma configuração fragmentada entre Sites, Limites e Horários. Exemplo: “Redes sociais — bloqueadas durante foco e após 22h”.

Na interceptação:

- Nome do site ou app.
- Motivo concreto.
- Duração ou condição de término.
- Ação principal para voltar à atividade.
- Acesso temporário, quando previsto, com consequência clara.

Não destacar automaticamente com dourado a opção de continuar no site bloqueado. A ênfase deve corresponder ao objetivo da tela sem esconder alternativas.

No iOS, respeitar os elementos oferecidos pelo sistema para a tela de bloqueio. Não prometer a composição livre da extensão ou Android. A leitura completa pertence ao app.

Fonte: [Apple — ShieldConfiguration](https://developer.apple.com/documentation/managedsettingsui/shieldconfiguration).

## 15. Sistema compartilhado de estados

O sistema visual precisa definir estados, além de cores e componentes:

| Estado | Resposta |
|---|---|
| Sem tarefas | Convite curto para escolher atividade |
| Conteúdo offline disponível | Leitura normal, indicação discreta quando necessária |
| Evangelho atual indisponível | Data do conteúdo disponível claramente identificada |
| Proteção sem permissão | Explicação objetiva e ação para resolver |
| Sessão pausada | Distinta de sessão encerrada |
| Alteração salva | Confirmação próxima ao controle |
| Falha ao salvar | Mensagem persistente e nova tentativa |
| Texto ampliado | Layout cresce sem cortar conteúdo e ações |
| Movimento reduzido | Transições simples, sem pulsações |

Uma tela bonita apenas quando preenchida e funcionando não constitui um sistema completo.

## 16. Ordem de desenho e validação

Começar com cinco conjuntos usando conteúdo realista:

1. Hoje na extensão: vazio, prioridades e sessão ativa.
2. Hoje no mobile: mesmos estados, teclado aberto e texto ampliado.
3. Leitor e terço: conteúdo curto, longo e retomada.
4. Proteção: configuração, ativa, pausada e sem permissão.
5. Frutos e ritual noturno: com registros e sem registros.

Depois desenhar novenas, regra de vida e companheiro sobre os componentes aprovados.

Validar janela pequena de notebook, zoom de 200%, celular estreito, nomes longos, uso por teclado, leitura prolongada e preferências de movimento. Comparar estados vazios, carregando, indisponíveis e com erro.

## 17. Critério de sucesso

A nova interface deve preservar a chegada contemplativa e tornar clara a ação seguinte. A extensão continua espaçosa; o mobile ganha navegação própria para uso com uma mão. Conteúdo, linguagem e componentes mantêm a identidade comum sem obrigar as duas plataformas a usar a mesma composição.
