# Ora — Relatório consolidado de melhorias

Data: 29/10/2026.

Status: diagnóstico e recomendações para a próxima versão. Este documento não registra implementação nem transforma sugestões em decisões aprovadas.

## 1. Objetivo, fontes e limites

Consolidar melhorias de produto, UX, UI e funcionamento identificadas na análise anterior, na validação do usuário e na inspeção posterior, com atenção especial à tela principal.

Fontes:

- [Análise de produto e arquitetura](ANALISE_PLANO_ORA.md).
- [Análise de interface](ANALISE_INTERFACE_ORA.md).
- Validação: `C:/Users/arthu/Downloads/ora-validacao-2026-10-29.md`.
- [Inspeção visual e funcional](C:/Users/arthu/Downloads/ora-inspecao-visual-2026-10-29/RELATORIO.md).
- [Galeria de 65 capturas](C:/Users/arthu/Downloads/ora-inspecao-visual-2026-10-29/GALERIA.html).
- Código dos sete protótipos e arquivos compartilhados em `prototypes/`.

A primeira avaliação nesta conversa foi baseada no código: a abertura local no navegador foi bloqueada. Outro agente realizou a inspeção documentada por HTTP. Depois, foram examinadas diretamente nesta conversa capturas selecionadas da chegada, preparação, Hoje em janela menor, encerramento noturno e mobile ampliado. Os resultados de interação abaixo são atribuídos à inspeção externa; não representam uma segunda reprodução independente de todos os testes.

Os defeitos reproduzidos pertencem ao protótipo, não necessariamente à extensão em produção. Sugestões de composição são avaliações de design, não falhas objetivas. Funções simuladas podem ser aceitáveis para desenhar, mas não comprovam integração ou persistência.

## 2. Parecer e prioridades

A direção visual deve continuar. Navegação curta, uso delimitado do vidro, leitores estáveis, perfis de proteção e registros sem julgamento são boas bases. O principal problema é que as telas isoladas são mais consistentes que suas transições.

A próxima versão deve demonstrar um percurso confiável: escolher, começar, pausar, consultar outra tela, voltar, terminar e retomar depois. Não recomendo uma reformulação integral da identidade.

- **P1:** corrigir antes de aprovar o ciclo principal.
- **P2:** resolver antes de aprovar o conjunto para implementação.
- **P3:** refinamento de composição, linguagem ou acabamento.
- **Confirmado:** reproduzido na inspeção ou constatado no código, conforme indicado.
- **Recomendação:** proposta para comparar na próxima versão.
- **Pendente:** exige teste ou integração ainda não realizados.

## 3. Correções comprovadas

Os identificadores F e as capturas referem-se ao relatório externo.

| ID | Prioridade | Problema | Mudança e critério de aceitação |
|---|---|---|---|
| M01 | P1 | Abrir sessão mobile pausada retoma a contagem. F01, B06/B07. | Separar apresentação e execução. Abrir, minimizar e navegar preservam pausa; somente Retomar reinicia. |
| M02 | P1 | Ritual matinal perde atividade e duração escolhidas. F02, E03/E04. | Transportar seleção. Começar foco e Ir para Hoje mantêm atividade, duração e significado da intenção. |
| M03 | P1 | Leitor perde posição ao reabrir e recarregar. F03, C03–C05. | Guardar progresso real e restaurar antes de novas gravações. Sair/reabrir/recarga devem recuperar o trecho. |
| M04 | P1 | Terço retoma posição fixa apesar de anunciar salvamento. F04, C06. | Persistir conjunto, mistério, etapa e conta. Testar duas posições diferentes e conferir resumo. |
| M05 | P1 | Texto 200% corta ação mobile, tarefas e controles do leitor; Lectio perde espaço útil. F05, B03–B05/C09/C10. | Reorganizar componentes e permitir quebra. Nenhuma ação essencial fora da área acessível ou texto cortado. |
| M06 | P1 | Prévia de proteção ignora dias e usa amanhã incorretamente. F06, D02/D03. | Calcular próxima ocorrência válida a partir da regra completa. |
| M07 | P2 | Destinos mobile abrem composições desktop e perdem contexto. F07, B08/B09/B11. | Preservar origem e sessão. Leitor pode ser imersivo, mas Voltar restaura estado anterior. |
| M08 | P2 | Escolher som troca opção imediatamente. F08. | Abrir seletor explícito. Abrir opções não deve mudar som. |
| M09 | P2 | Shift+Tab escapa do diálogo para painel fechado. F09, A13. | Conter foco, tornar fundo inerte e retirar painel fechado da ordem de teclado. Manter Escape e retorno de foco. |
| M10 | P2 | Modelo parcial anuncia bloqueio desmarcado. F10, captura F02. | Resumo calculado dos itens selecionados; resultado aplicado precisa corresponder ao resumo. |
| M11 | P2 | Guardar/Salvo não comprova persistência após recarga. F11. | Persistência local verificável ou indicação de simulação. Só confirmar gravação após sucesso. |
| M12 | P2 | Conclusão do Respiro retorna à extensão, independentemente da origem. F12, C07/C08. | Guardar origem. Concluir e sair devem ter destino coerente com o percurso e o rótulo. |
| M13 | P2 | Sessão ativa coexiste com Começar foco e proteção de repouso. Avaliação mobile da inspeção. | Unificar estado mostrado em Hoje, resumo e Proteção. |

A perda de posição do leitor foi confirmada; a causa exata deve ser verificada durante a correção. A hipótese de sobrescrita antes da restauração não deve ser apresentada como diagnóstico funcional definitivamente estabelecido.

## 4. Hoje na extensão: hierarquia e composição

### 4.1 Reduzir competição no centro — P2, recomendação

Relógio, saudação, data/santo, atividade, intenção, atalhos, convite, Evangelho e citação produzem uma coluna central longa e dois cantos inferiores ocupados. A atmosfera permanece contemplativa, mas a densidade cresce em janelas menores.

Composição recomendada:

1. Cabeçalho estável: marca, Hoje/Rezar/Frutos, tarefas, estado da proteção e configurações.
2. Relógio e saudação com menos altura.
3. Data e contexto litúrgico em linha secundária com quebra natural.
4. Uma atividade e uma ação principal de início.
5. Intenção opcional discreta.
6. Atalhos e um convite contextual.
7. Evangelho previsível; citação cede espaço quando outro conteúdo devocional já está destacado.

Não compensar excesso de conteúdo com baixa opacidade ou fonte pequena. Reduzir redundância e espaços excessivos antes de sacrificar legibilidade. Preservar espaço vazio como parte da identidade.

### 4.2 Relógio e tipografia — P3

O usuário aprovou Montserrat na interface e questionou Literata no relógio. Testar Montserrat leve ou regular, menor, com algarismos de largura estável. Comparar mesma hora, peso e área ocupada. A troca de fonte sozinha não resolve protagonismo.

Manter Literata na leitura e Cinzel na marca e títulos pontuais. Evitar quarta família tipográfica sem necessidade.

### 4.3 Fotografia — P2

A foto usada coloca altar e elementos arquitetônicos atrás do eixo central. Escurecer ajuda contraste, mas não resolve competição de composição.

- Escolher enquadramentos com áreas tranquilas atrás do conteúdo.
- Testar imagens claras, escuras e detalhadas, além da imagem atual.
- Manter fundo de reserva e estabilidade durante foco/leitura.
- Medir contraste sobre a fotografia efetiva, incluindo transparência.
- Não considerar a tabela de cores sólidas como aprovação integral.

### 4.4 Janelas pequenas — P2

A inspeção alcançou ações desktop em 1024×640 com texto ampliado por rolagem. Portanto, o diagnóstico é densidade e percurso maior, não corte generalizado. Rolagem vertical pode ser adequada.

Reduzir primeiro relógio, intervalos e informações auxiliares. Evitar regiões roláveis concorrentes. Atividade, estado e ações devem permanecer compreensíveis e acessíveis sem reduzir artificialmente o texto.

## 5. Início e preparação do foco

### 5.1 Fazer Começar corresponder à ação — P2

Na extensão, Começar foco abre preparação; no mobile inicia diretamente. Definir regra coerente.

Recomendação: com preferências conhecidas, Começar 25 min inicia. Ajustar abre preparação; Escolher outra muda atividade. Primeiro uso pode ter preparação curta. Se a preparação continuar obrigatória, o botão inicial deve dizer Preparar foco.

Permitir foco sem cadastrar tarefa formal. Não obrigar intenção, som ou estimativa detalhada para começar.

### 5.2 Preparação progressiva — P2

A composição atual reúne atividade, quatro durações, intenção, som e proteção. A parte inferior é especialmente densa.

- Núcleo: atividade, duração e consequência da proteção.
- Intenção opcional com menor ênfase.
- Som compacto, por exemplo Som: silêncio · Alterar.
- Preferências adequadas lembradas para reduzir trabalho repetido.
- Informação concreta do que será bloqueado, além de Bloquear distrações.
- Áreas de interação preservadas; não diminuir controles para encaixar tudo.

## 6. Intenção do dia e da sessão — P2

A distinção precisa existir no modelo, além do texto explicativo. Comparar na sessão as opções Usar intenção do dia, Outra intenção e Sem intenção. A herança deve ser explícita e não deve implicar automaticamente exibição de conteúdo pessoal.

- Alterar intenção da sessão não altera a do dia.
- Mostrar somente a intenção efetiva durante o foco, com escopo reconhecível.
- Adicionar Mostrar/Ocultar intenção, com nome acessível e preferência preservada.
- Ocultar não apaga o dado nem representa proteção criptográfica.
- Aceitar redação livre; evitar Hoje, por Pela família.
- Quando vazia em Hoje, testar Adicionar intenção do dia em vez de campo permanente.
- Na sessão ativa, permitir discrição sem exigir voltar à preparação.

## 7. Sessão, pausa e conclusão

### 7.1 Estado e controles — P1/P2

Manter atividade antes do tempo. O tempo pode continuar maior, mas títulos longos devem quebrar sem expulsar controles. Pausa deve informar se a proteção continua.

Abrir/minimizar/navegar não altera execução. Hoje não deve oferecer iniciar outra sessão enquanto mostra uma ativa sem explicar o resultado. Resumo e Proteção precisam refletir os mesmos dados.

Som deve abrir escolhas explícitas. Reprodução sonora real e falhas ainda precisam de teste separado.

### 7.2 Encerramento — P2/P3

Distinguir término natural, encerramento antecipado e tarefa concluída. O contador terminou sem marcar tarefa automaticamente no teste: preservar.

A checkbox branca funciona, mas destoa dos círculos de tarefas. Uniformizar desenho, foco e linha clicável, com estado desmarcado inequívoco e nome da tarefa. Não marcar por padrão; permitir desfazer.

Definir política para minutos de sessão interrompida. Nada será registrado expressa uma decisão de produto que precisa ser deliberada. Separar tempo realizado, sessão completada e tarefa concluída, refletindo os mesmos significados em Frutos.

Oferecer continuar, descansar/rezar e voltar, sem impor ritual obrigatório no final.

## 8. Tarefas — P2

O painel integrado funciona em largura ampla. Sobreposição estreita não é defeito por si só: pode permanecer com foco, fechamento, fundo e retorno corretos. Tela dedicada é alternativa a comparar.

Preservar título, início e edição distinguíveis. Testar vazio, título longo, conclusão, desfazer e troca da atividade. A seleção pelo painel transportou Revisar capítulo 3 e 50 minutos corretamente; a perda confirmada ocorreu no ritual matinal.

Pendências da análise anterior de produção, ainda sem nova reprodução nesta inspeção:

- Corrigir conclusão manual que preenchia ciclos e ciclos previstos que concluíam tarefa automaticamente, se ainda presentes.
- Separar Agora, prioridades de Hoje, captura em Depois e recorrências de Ritmo.
- Três prioridades deve ser sugestão de apresentação, não necessariamente limite de armazenamento.
- Não tratar primeiras pendências antigas automaticamente como prioridades escolhidas.
- Preservar histórico útil de concluídas.
- Definir frequências além de repetição diária.
- Captura inicial pede nome; demais dados são opcionais.

Esses pontos devem ser verificados antes de conectar Frutos aos dados existentes.

## 9. Hoje mobile

### 9.1 Área de ação inferior — P2, proposta

Testar área acima da navegação com atividade/duração e Começar. Durante sessão, a mesma área vira resumo com tempo, estado e Pausar/Retomar.

- Não empilhar início e resumo.
- Não mover simplesmente o botão para o fim do documento.
- Reservar espaço no conteúdo para não encobrir itens.
- Mostrar contexto quando a atividade estiver fora da vista.
- Permitir crescimento/reorganização com texto maior.
- Validar alcance em dispositivo: capturas com moldura reduzida não medem polegar.

### 9.2 Cabeçalho — P2

Foto mais compacta, com altura independente do crescimento da saudação. Texto ampliado não deve tornar a fotografia a maior seção. Preservar identidade sem fotografia atrás de listas extensas.

### 9.3 Navegação — P1/P2

Manter Hoje/Rezar/Proteção/Frutos, sem quinta aba de Foco. Destinos comuns preservam navegação e sessão. Leitura/oração podem ser imersivas, desde que Voltar restaure origem e estado.

### 9.4 Ampliação e teclado — P1/P2

Corrigir Começar foco recortado, durações escapando e navegação cujo texto quase não cresce. Fonte limitada não é solução para acessibilidade.

Testar teclado real, campo visível, envio, barras do sistema, áreas seguras e orientação. O teclado desenhado não comprova adaptação nativa.

A moldura 360×740 exibida em janela 360×640 não equivale a app efetivo 360×640. Repetir sem escala visual que mascare a área lógica.

## 10. Rezar e biblioteca — P2

A coluna curta Para hoje e o catálogo extenso desequilibram a composição. Separar entrada cotidiana e biblioteca completa.

Entrada recomendada: Continuar real, conteúdo do dia, favoritos escolhidos e Ver biblioteca. Busca pode permanecer e consultar todo o catálogo. Biblioteca reúne busca, categorias e resultados; ao voltar do leitor, preservar contexto quando pertinente.

Não chamar sugestões iniciais de favoritos. Usar Orações essenciais ou Sugestões para começar, com favoritar explícito.

Preservar busca pelo corpo, favorito e estado sem resultados, que funcionaram no teste. Validar catálogo maior e títulos longos.

Evangelho interno e liturgia externa devem ser distinguíveis. Conteúdo antigo offline precisa de data explícita. A apresentação existente é boa, mas cache e atualização reais continuam pendentes.

## 11. Leitor, Lectio e terço

### 11.1 Leitor — P1/P2

Manter Literata, superfície estável, alinhamento à esquerda para textos longos e Papel. Centralização pode servir a orações breves, mas contagem de caracteres não deve ser único critério editorial.

Reorganizar barra estreita: preservar Voltar; opções secundárias podem ir para menu/segunda linha. Aumentar texto não pode sair da janela. Controles não devem consumir desproporcionalmente a altura de leitura.

Restaurar trecho real. Considerar referência estrutural com deslocamento, evitando depender somente de porcentagem que muda com fonte/largura. Testar tema, tamanho, recarga e saída. Retomada demonstrativa fixa não comprova continuidade.

Conforto prolongado ainda precisa de leitura humana; a direção visual não prova menor fadiga.

### 11.2 Lectio — P1/P2

Reutilizar leitor é boa direção. Em tela pequena, orientação recolhível ou painel próprio deve preservar acesso simples ao texto bíblico. Não insistir em simultaneidade que deixa ambos sem espaço útil.

Preservar posição ao avançar etapas; definir salvamento das anotações e retomada. Validar voltar e sair sem perda inadvertida. Não tratar conclusão como medida da oração.

### 11.3 Terço — P1/P2

Manter mistério, oração e conta explícitos, Anterior/Próxima principais e contas alternativas. Corrigir persistência e resumo.

Testar teclado, tecnologia assistiva, início/fim e transições. Não registrar salto duplo de Espaço como confirmado: a inspeção não o reproduziu no teste realizado.

## 12. Respiro — P2

Preservar atmosfera sem cronômetro ou desempenho. A dezena fixa não atende à liberdade desejada.

Comparar oração breve, três Ave-Marias, uma dezena e apenas descansar, com preferência lembrada para evitar decisão repetida. Terço completo continua separado. Não prometer duração rígida; intenção é opcional.

Concluir deve voltar à origem real. O X voltou à biblioteca no teste; o defeito reproduzido é o retorno final para a extensão. Rótulos podem explicitar Voltar à biblioteca ou Voltar à sessão.

## 13. Proteção — P1/P2

### Estados

Distinguir configurada, ativa e bloqueando agora. Informar o que está protegido e a próxima condição relevante. Usar Proteção pausada até horário, Retomar e Proteção sem permissão com Resolver.

Parte da distinção já existe. Repetir o substantivo no bloco principal pausado é refinamento menor que corrigir cálculos.

### Prévias

Derivar começo/fim/dias/data da mesma interpretação de regras que sustentará execução. Testar mesmo dia, madrugada, horário encerrado/em curso, hoje excluído, nenhum dia, combinações e nenhuma regra. Tratar entradas inválidas. Não anunciar bloqueio real só porque há configuração salva.

### Interceptação

Manter motivo, atividade, término e retorno em destaque. Acesso temporário secundário, mas encontrável. Confirmação informa site, duração, exceções restantes e retorno do bloqueio.

Retirar justificativa do fluxo padrão ou recolher como anotação opcional. Evitar atrito punitivo. Testar expiração e contagem reais posteriormente; o protótipo não comprovou desbloqueio.

A tela iPhone é ilustração web e não valida composição nativa, permissões ou execução em segundo plano.

## 14. Frutos — P2/P3

A abertura ainda transforma números em frase. Testar reflexão/pergunta em primeiro plano e registros em apoio, sem inferir qualidade espiritual por frequência ou duração.

- Preservar dias sem registro neutros e legenda.
- Distinguir oração aberta de oração registrada como realizada.
- Não tratar ausência de registro como ausência de oração.
- Não somar foco e tempo de tela como partes exclusivas quando se sobrepõem.
- Não apresentar tempo recuperado sem base defensável.
- Ajustar pergunta e vazio a Semana/Mês; houve texto semanal com mês selecionado.
- Navegação de períodos deve mostrar resultado ou indisponibilidade explícita.
- Permitir reflexão sem registros e saída simples para Hoje/Rezar.
- Guardar e recuperar reflexão antes de confirmar sucesso.
- Práticas planejadas devem considerar dias previstos, não sempre sete dias.

## 15. Rituais

### Manhã — P1/P2

Preservar brevidade e saída. Não tornar ritual obrigatório nem interceptar início rápido. Prioridade, duração e intenção devem chegar ao destino correto. Evitar solicitar repetidamente escolhas já conhecidas.

### Noite — P2/P3

Manter Pular/Sair e definir persistência de rascunho. Voltar preservou resposta na mesma abertura, mas sair/reabrir não. Oferecer retomada quando apropriado e não prometer salvamento inexistente.

A frase final é preferência editorial, não erro objetivo. A captura mostra outro problema: o banner de bloqueio ocupa destaque entre oração e botão. Testar oração mais breve e proteção em linha secundária. Só informar bloqueio até 7h se isso corresponder à regra real. Botão final deve ter significado inequívoco.

## 16. Meu ritmo, novenas, exame e companheiro

### Meu ritmo/modelos — P2

Manter momentos do dia e Lembrar/Sugerir/Aplicar proteção. Corrigir seleção parcial e mostrar resultado aplicado. Explicar se modelo acrescenta, substitui ou combina regras; evitar duplicatas silenciosas. Modelos devem ser editáveis e não exigir rotina completa para oferecer valor.

### Novenas — P2

Preservar oração/dia antes do compromisso digital. Dia não registrado não significa dia não rezado. Fazer abrir dia anterior, retomar e ajustar datas demonstrarem resultado. Rezar o 4º dia não abriu outro texto no teste: corrigir ou identificar simulação.

Validar duração do compromisso até a última noite, sem pressupor que 7h da data final atende à intenção. Não intensificar restrição automaticamente sem escolha prévia.

### Exame — P2

Manter uma pergunta por vez, Anterior/Pular/Sair e conclusão possível sem respostas. Validar persistência depois de fechar, além de voltar na mesma abertura. Explicar destino e gestão das reflexões.

### Companheiro — P3

Manter opcional, breve e fora do foco ativo; permitir desligar. Evitar repetição excessiva, personagem permanente e balões solicitando atenção. Prancha de exemplos não demonstra utilidade longitudinal. Priorizar depois do ciclo principal.

## 17. Configurações e persistência — P2

Manter Aparência/Oração/Foco/Lembretes/Dados e acesso contextual a Proteção.

- Confirmar junto ao controle somente depois de gravar.
- Erro persistente com nova tentativa e explicação do que continua valendo.
- Preservar entrada após falha.
- Verificar reabertura e recarga, não apenas toast.
- Adaptar erro à operação: falha ao exportar não é falha ao salvar configuração. A inspeção observou mensagem inadequada em Dados.
- Exportar, apagar e redefinir devem executar ou ser identificados como demonstração.
- Na implementação, ações destrutivas precisam de consequência clara e confirmação adequada.
- Levar strings novas ao sistema de tradução; testar textos maiores.

No próximo protótipo, escolher persistência local de teste ou indicação explícita de simulação. Integração nativa não é necessária para validar desenho, mas a delimitação do teste é necessária.

## 18. Sistema visual e acessibilidade — P2/P3

Preservar papéis de cor, superfícies adequadas, foco visível já existente e rótulos nos destinos descobríveis.

Melhorar/verificar:

- Contraste sobre fotografias, transparências, estados atenuados e tema noturno.
- Estado não comunicado somente por cor.
- Consistência de conclusão, seleção, desabilitado e carregamento.
- Quebra natural de botões, metadados e títulos.
- Ampliação sem contenção artificial da fonte.
- Nomes acessíveis para ícones e anúncio de estados relevantes.
- Foco de entrada, contenção e retorno; conteúdo fechado fora do teclado.
- Operação sem depender de hover.
- Movimento reduzido do sistema, além do botão demonstrativo.
- Áreas de toque confortáveis, sem exigir ícones enormes.
- Fontes/ícones indisponíveis e rede ausente; recursos remotos não comprovam offline.

Este documento não certifica conformidade de acessibilidade.

## 19. O que manter aprovado e o que reabrir

| Área | Parecer consolidado |
|---|---|
| Identidade, cores e vidro | Manter direção; contraste fotográfico pendente. |
| Navegação desktop/mobile | Manter destinos; corrigir continuidade. |
| Próxima ação e recolhimento | Boa direção; reduzir densidade e preparação repetitiva. |
| Tipografia | Manter interface/leitura; comparar relógio. |
| Intenções | Reabrir modelo, visibilidade e redação. |
| Atividade antes do tempo | Manter; tratar títulos longos. |
| Pausa/encerramento | Desktop distingue; corrigir mobile e foco do diálogo. |
| Checkbox final | Funciona; refinar aparência. |
| Tarefas integradas | Manter amplo; melhorar teclado e modo estreito. |
| Convite único | Manter; definir prioridade, dispensa e frequência. |
| Ampliação desktop | Revisar densidade; não chamar todo scroll de corte. |
| Ampliação mobile/leitor/Lectio | Reabrir: cortes comprovados. |
| Biblioteca | Separar entrada e catálogo. |
| Leitor/Papel | Manter visual; corrigir controles e retomada. |
| Terço | Manter orientação e controles; corrigir persistência. |
| Respiro | Manter atmosfera; ampliar escolhas e corrigir retorno. |
| Frutos | Manter neutralidade; rever abertura, períodos e dados. |
| Rituais | Manter opcionalidade; corrigir continuidade/rascunhos. |
| Proteção | Manter perfis e ênfase; corrigir prévias. |
| Modelos | Manter estrutura; reabrir consequências e aplicação. |
| Novena/exame | Manter composição; validar ações e persistência. |
| Companheiro | Aprovação visual provisória; utilidade pendente. |
| Configurações | Manter categorias; corrigir gravação e mensagens. |
| Teclado/polegar/iPhone | Não validados como experiência nativa. |

## 20. Sequência recomendada

1. **Estado e continuidade:** sessão, prioridade matinal, retomadas, persistência e coerência entre superfícies.
2. **Consequências e navegação:** regras de proteção, modelos, som, teclado, destinos mobile e retorno do Respiro.
3. **Adaptação:** Hoje mobile, leitor e Lectio; depois demais páginas, com dimensões efetivas.
4. **Hierarquia de Hoje:** início direto, Ajustar, relógio menor, intenção discreta e menos competição devocional.
5. **Conteúdo e acabamento:** entrada de Rezar, Respiro livre, Frutos, checkbox e encerramento noturno.
6. **Fase 2:** aprofundar modelos, novenas e companheiro depois do ciclo consistente.

## 21. Critérios de validação da próxima versão

| Teste | Resultado esperado |
|---|---|
| Iniciar, pausar, minimizar, navegar e abrir | Estado/tempo preservados; nenhuma retomada implícita. |
| Ritual matinal → Hoje/foco | Mesma seleção, com intenção de escopo correto. |
| Leitor e terço → sair/reabrir/recarga | Posição real restaurada. |
| Regras de mesmo dia/madrugada/dias excluídos | Próxima ocorrência correta. |
| Modelo parcial | Resumo e aplicação coerentes. |
| Guardar reflexão/configuração → recarga | Recuperação ou erro explícito, nunca sucesso fictício. |
| Tab/Shift+Tab/Escape no diálogo | Foco contido, fundo indisponível, retorno correto. |
| Mobile → destinos → voltar | Origem e sessão recuperadas. |
| Respiro vindo de biblioteca/sessão | Retorno correto em ambos. |
| Desktop 1440×900, 1280×720, 1024×640 | Ações acessíveis e rolagem previsível. |
| Mobile efetivo 390×844 e 360×640 | Sem moldura mascarando dimensões ou cortes essenciais. |
| Texto 200% e zoom real 200%, separados | Sem perda de conteúdo/ações; condições registradas. |
| Teclado real e áreas do sistema | Campo e ação visíveis, sem camadas sobrepostas. |
| Nomes/títulos/traduções longas | Quebra legível e controles disponíveis. |
| Fotos variadas e indisponibilidade | Leitura e reconhecimento preservados. |
| Movimento reduzido e leitor de tela | Operação compreensível e estados adequados. |

## 22. Limitações e decisões abertas

Ainda não foram validados: extensão carregada, bloqueio real, permissões nativas, segundo plano, áudio, APIs/cache reais, zoom real verificável, teclado móvel, alcance físico, mobile integral 360×640, auditoria completa com leitor de tela e fadiga em leitura humana prolongada.

Decisões de produto a resolver na revisão:

- Início direto e exceções de primeiro uso.
- Registro de sessões interrompidas.
- Herança e visibilidade de intenções.
- Persistência e retenção de rascunhos/reflexões.
- Opções e padrão do Respiro.
- Combinação/substituição de regras por modelos.
- Texto final noturno conforme preferência do usuário.
- Utilidade do companheiro após uso repetido.

O critério de conclusão é uma experiência que preserve recolhimento, torne o próximo gesto evidente e cumpra o que os controles e mensagens prometem. Este relatório orienta a revisão; não autoriza automaticamente a implementação de suas propostas.
