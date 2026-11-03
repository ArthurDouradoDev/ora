# Ora — revisão de UX/UI de Rezar e Biblioteca

Data: 30/10/2026  
Status: análise consolidada; alterações de interface ainda não implementadas.

## Objetivo e escopo

Confrontar os apontamentos da validação de 29/10/2026 com a estrutura e o comportamento do protótipo, identificando as mudanças necessárias em Rezar, Biblioteca, leitor, Lectio Divina, terço e Respiro.

Fontes examinadas:

- Validação do usuário: `C:/Users/arthu/Downloads/ora-validacao-2026-10-29.md`.
- Protótipo: `prototypes/03-rezar.html`.
- Estilos compartilhados: `prototypes/shared/ora.css`.
- Navegação e controles do protótipo: `prototypes/shared/proto.js`.

Os comentários do documento de validação foram tratados como evidências e preferências de produto, não como instruções para implementar mudanças.

## Limites da revisão

A análise abrangeu o código da composição, estilos e interações. O navegador bloqueou a abertura do arquivo local, portanto não houve inspeção visual renderizada nem teste manual dos fluxos. O comando `21st review` também não pôde ser executado porque a ferramenta não está instalada.

Assim, problemas demonstráveis no código são distinguidos de recomendações de design e riscos responsivos. Contraste final, equilíbrio visual, cortes e funcionamento real em diferentes tamanhos continuam pendentes de verificação visual. Esta revisão não representa uma certificação de acessibilidade.

## Diagnóstico principal

A principal mudança é separar a entrada cotidiana de Rezar da exploração da biblioteca completa. Hoje, a mesma composição reúne sugestões do dia, retomadas, favoritos, categorias e todo o acervo. Isso produz crescimento desigual das colunas e dificulta priorizar a próxima ação.

A identidade visual e a proposta do leitor podem ser preservadas. Além da organização, busca, retomada e continuidade da navegação precisam de ajustes.

## Avaliação dos apontamentos do usuário

| Apontamento | Avaliação | Consequência |
| --- | --- | --- |
| Uma coluna curta e outra potencialmente extensa | Válido; a estrutura confirma o crescimento desigual | Separar entrada cotidiana e acervo completo |
| Mostrar orações principais e/ou favoritas na entrada | Recomendação coerente com o uso recorrente | Criar seleção compacta e acesso ao restante |
| Incluir favoritas por padrão | Já existe no protótipo, mas exige clareza de significado | Distinguir sugestões do Ora de escolhas pessoais |
| Biblioteca completa em tela própria | Recomendação prioritária | Dar espaço próprio a busca, categorias e resultados |
| Literata e alinhamento à esquerda para textos longos | Aprovados pelo usuário; preservar a direção | Verificar acabamento visual sem redesenhar a base |
| Aparência Papel e ajuste de tamanho | Aprovados conceitualmente | Adaptar os controles a espaços estreitos |
| Retomada clara e confiável | Apresentação aprovada; confiabilidade ainda não validada | Corrigir persistência e restauração reais |
| Anterior/Próxima no terço | Direção aprovada | Preservar e corrigir conflitos de teclado |
| Respiro não precisa ser obrigatoriamente uma dezena | Válido; fluxo atual é fixo | Oferecer escolha simples de prática |
| Problemas com texto ampliado | Registrados em outras telas da validação | Verificar Rezar especificamente; não assumir reprodução visual |

## 1. Reorganizar Rezar e Biblioteca

**Natureza:** recomendação de arquitetura da informação, apoiada pela estrutura atual.  
**Prioridade:** alta.

A coluna esquerda contém quatro blocos relativamente estáveis. A direita reúne retomadas, favoritos, categorias e a lista completa. Colunas com alturas diferentes não são um defeito isoladamente; o problema é misturar o início rápido de uma prática com a exploração de um acervo crescente.

### Mudanças propostas

- Fazer de Rezar uma entrada compacta para continuar uma prática, abrir favoritos e acessar sugestões do dia.
- Criar uma visão própria de Biblioteca, com busca, categorias e listagem completa.
- Manter busca acessível em Rezar, levando diretamente aos resultados na Biblioteca.
- Reduzir o peso visual do Santo do dia em relação às ações de leitura e oração.
- Limitar a quantidade de itens apresentados na entrada e oferecer acesso explícito ao restante.

### Estrutura sugerida

Rezar:

1. Continuar, quando houver progresso salvo.
2. Favoritos ou seleção inicial de orações essenciais.
3. Para hoje: Evangelho, terço e acesso ao Respiro.
4. Acesso claro à Biblioteca completa.

Biblioteca:

1. Busca.
2. Categorias e filtros.
3. Resultados ou acervo.
4. Estados de ausência de resultados e ações de recuperação.

A ordem final deve ser validada visualmente. Não é necessário preencher artificialmente a coluna curta ou criar cartões maiores apenas para equilibrar alturas.

**Referência:** `prototypes/03-rezar.html:154`.

## 2. Corrigir a experiência de busca

**Natureza:** comportamento confirmado no código.  
**Prioridade:** alta.

Quando a composição vira uma coluna, os resultados ficam depois de todo o conteúdo Para hoje e dos favoritos. Digitar no campo do topo pode atualizar uma região fora da área visível.

A busca também ignora a categoria selecionada e esconde os filtros. A comparação converte o texto para minúsculas, mas não normaliza acentos.

### Mudanças necessárias

- Apresentar resultados imediatamente abaixo do campo de busca.
- Retirar os blocos de descoberta durante uma pesquisa ativa.
- Informar a quantidade de resultados e oferecer Limpar busca.
- Definir e comunicar se a busca abrange todo o acervo ou apenas a categoria selecionada.
- Aceitar pesquisas sem acentos.
- Preservar consulta e contexto ao abrir uma oração e voltar.

### Critérios de aceitação

- Pesquisar em uma tela estreita torna os resultados imediatamente encontráveis.
- A pessoa consegue entender o escopo da pesquisa e desfazê-la.
- Consultas equivalentes com e sem acentos encontram a mesma oração.
- Abrir e fechar um resultado não obriga a refazer a pesquisa.

**Referência:** `prototypes/03-rezar.html:355`.

## 3. Distinguir favoritos de sugestões iniciais

**Natureza:** comportamento existente e recomendação de produto.  
**Prioridade:** média.

O protótipo já define três favoritos iniciais: São Miguel, Angelus e Vinde Espírito Santo. Portanto, a mudança não é simplesmente adicionar favoritos padrão.

### Mudanças propostas

- Usar Favoritos para escolhas pessoais.
- Apresentar a seleção inicial como Orações essenciais ou outra identificação clara de curadoria do Ora.
- Permitir favoritar e desfavoritar de maneira compreensível.
- Limitar a seleção exibida em Rezar e oferecer Ver todos quando necessário.
- Manter uma orientação útil quando não houver favoritos.

Essa separação evita atribuir ao usuário escolhas que ele ainda não fez e impede que o bloco de favoritos cresça sem limite na entrada.

**Referência:** `prototypes/03-rezar.html:347`.

## 4. Tornar a retomada confiável

**Natureza:** limitações funcionais confirmadas no protótipo.  
**Prioridade:** alta.

A apresentação da retomada foi aprovada, mas o comportamento ainda contém simulações:

- O terço retoma em uma posição fixa: terceiro mistério, sexta Ave-Maria.
- Sair informa que a posição foi guardada sem persistir a posição real do terço.
- No leitor, a renderização volta ao início e atualiza o progresso antes da recuperação da posição anterior, podendo sobrescrever o dado que deveria restaurar.

Dados simulados são aceitáveis para apresentar um protótipo, mas não permitem considerar a confiabilidade validada.

### Mudanças necessárias

- Persistir a posição real e o contexto da prática.
- Restaurar a posição antes de atualizar o progresso salvo.
- Exibir Continuar apenas quando houver progresso válido.
- Exibir informações de retomada derivadas dos dados reais.
- Oferecer distinção clara entre continuar e começar do início.
- Não afirmar que algo foi salvo se a operação não ocorreu.

### Critérios de aceitação

- Sair e retornar recupera o mesmo ponto.
- Recarregar a página preserva o progresso que foi efetivamente salvo.
- Abertura inicial do leitor não apaga uma posição anterior.
- O terço não retorna automaticamente ao ponto fixo da demonstração.

**Referências:** `prototypes/03-rezar.html:461`, `prototypes/03-rezar.html:487`, `prototypes/03-rezar.html:562`.

## 5. Adaptar leitor e Lectio a espaços menores

**Natureza:** risco responsivo identificado no código; reprodução visual pendente.  
**Prioridade:** alta para acesso aos controles.

A barra do leitor reúne voltar, título, tamanho do texto, aparência e favorito em uma única linha, sem reorganização específica para espaços estreitos. Isso cria risco de compressão e transbordamento.

A Lectio combina texto e orientação em áreas com rolagem própria. A adaptação para uma coluna precisa ser examinada com texto ampliado para evitar que uma região se torne difícil de usar.

### Mudanças propostas

- Manter Voltar, título e favorito na barra principal.
- Agrupar tamanho e aparência em Opções de leitura nas larguras menores.
- Desabilitar A− e A+ nos respectivos limites.
- Garantir acesso à orientação e aos controles da Lectio sem perder o contexto do texto.
- Revisar truncamento de títulos e trechos da biblioteca.

### Critérios de aceitação

- Nenhum controle essencial fica cortado em telas estreitas ou com texto ampliado.
- O conteúdo pode crescer verticalmente sem exigir rolagem horizontal para leitura.
- Opções de leitura continuam acessíveis por teclado e toque.
- Texto bíblico e orientação da Lectio permanecem utilizáveis.

Ter rolagem com texto a 200% é esperado. O defeito a evitar é perda de conteúdo, corte de controles ou navegação impraticável, não a existência de rolagem vertical.

**Referências:** `prototypes/03-rezar.html:51`, `prototypes/03-rezar.html:78`, `prototypes/03-rezar.html:86`.

## 6. Flexibilizar o Respiro e corrigir sua saída

**Natureza:** preferência do usuário e inconsistências confirmadas no código.  
**Prioridade:** média; retorno ao contexto deve ser corrigido junto à navegação.

O Respiro atual está integralmente vinculado a uma dezena. A intenção Por minha família é fixa. A ação Voltar ao que estava fazendo leva sempre à tela Hoje, mesmo quando a pessoa entrou por Rezar.

### Mudanças propostas

- Oferecer uma escolha simples entre oração breve, dezena e oração livre.
- Evitar transformar essa escolha em um formulário extenso.
- Exibir intenção apenas quando definida pela pessoa ou recebida legitimamente do contexto de entrada.
- Retornar à origem real da experiência.
- Preservar o tom de oração, sem cobrança por tempo ou desempenho.

### Critérios de aceitação

- É possível usar Respiro sem escolher uma dezena.
- Nenhuma intenção pessoal é inventada pela interface.
- Sair ou concluir retorna ao destino coerente com a entrada.

**Referências:** `prototypes/03-rezar.html:302`, `prototypes/03-rezar.html:312`, `prototypes/03-rezar.html:624`.

## 7. Completar navegação e acessibilidade

**Natureza:** lacunas confirmadas no código; teste assistivo pendente.  
**Prioridade:** alta.

As mudanças de tela não possuem gerenciamento consistente de foco. O histórico é substituído a cada transição, limitando o retorno pelo navegador. No terço e no Respiro, o atalho global de espaço pode interceptar a ativação de outros botões focados.

### Mudanças necessárias

- Posicionar o foco em um elemento apropriado ao abrir uma nova tela.
- Restaurar o foco ao elemento de origem quando a pessoa voltar.
- Preservar um caminho de navegação coerente, incluindo o botão Voltar do navegador.
- Não interceptar atalhos de teclado quando eles conflitam com controles interativos.
- Verificar nomes acessíveis, ordem de foco e anúncios de mudanças dinâmicas.

### Critérios de aceitação

- Os fluxos principais podem ser percorridos apenas com teclado.
- Espaço ativa o botão focado sem executar outra ação indevida.
- Abrir uma oração e voltar devolve a pessoa ao contexto anterior.
- Mudanças de tela não deixam o foco em elementos ocultos.

**Referências:** `prototypes/shared/proto.js:98`, `prototypes/03-rezar.html:629`.

## Decisões a preservar

- Literata para leitura e Montserrat para interface.
- Alinhamento à esquerda nos textos longos.
- Centralização seletiva de textos curtos.
- Aparência Papel e ajuste de tamanho do texto.
- Identificação do mistério e da oração atual no terço.
- Anterior/Próxima como controles principais do terço.
- Proposta de Lectio com orientação breve e texto bíblico acessível.
- Respiro sem cobrança por desempenho.

Essas decisões têm aprovação do usuário e não apresentam motivo estrutural para substituição nesta revisão. Seu acabamento visual ainda precisa ser observado na interface renderizada.

## Ordem recomendada de execução

| Ordem | Trabalho | Resultado esperado |
| --- | --- | --- |
| 1 | Separar Rezar e Biblioteca e reorganizar a busca | Entrada compacta e acervo fácil de explorar |
| 2 | Corrigir retomada, histórico e retorno ao contexto | Continuidade confiável entre sessões e telas |
| 3 | Adaptar leitor e Lectio; corrigir foco e atalhos | Uso viável em telas menores e por teclado |
| 4 | Distinguir favoritos de sugestões e flexibilizar Respiro | Personalização mais clara e liberdade de prática |
| 5 | Executar validação visual e ajustar acabamento | Confirmar hierarquia, contraste, espaços e adaptação |

## Validação pendente antes de encerrar a revisão

- Inspecionar visualmente Biblioteca, resultados, favoritos vazios e retomada.
- Testar leitor curto, longo, aparência Papel e Evangelho indisponível.
- Testar Lectio, preparação do terço, oração e Respiro.
- Verificar 1024×640, telas estreitas e texto a 150% e 200%.
- Diferenciar ampliação de texto do protótipo e zoom real do navegador.
- Verificar contraste sobre as superfícies efetivamente renderizadas.
- Percorrer os fluxos por teclado e conferir foco e retorno.
- Validar persistência de progresso após sair, voltar e recarregar.

Nenhuma alteração de implementação faz parte deste documento. As referências de linha correspondem ao código examinado e podem mudar em edições futuras.
