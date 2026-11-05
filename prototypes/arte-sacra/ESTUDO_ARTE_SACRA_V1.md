# Ora — estudo de direção de arte sacra

Data: 30/10/2026. Status: exploração visual; nenhuma direção aprovada e nenhuma alteração de interface neste estudo.

## Recomendação

Experimentar primeiro uma pintura sacra de inspiração em afrescos e têmpera, com acabamento fosco, desenho legível, pigmentos minerais, expressões serenas e dourado contido. Esta é uma direção contemporânea de ilustração, não uma classificação histórica das imagens geradas. Mosaico de inspiração bizantina é a alternativa mais forte para uma identidade imediatamente reconhecível. Vitral é uma opção expressiva, que demanda cuidado com saturação e fragmentação em miniaturas.

A marca deve estabelecer um conjunto repetível de decisões: paleta, desenho das figuras, materialidade, luz, enquadramento e tratamento dos fundos. Escolher apenas “pintura religiosa” não basta para sustentar uma série coerente.

## Comparação

- **Mosaico bizantino:** identidade forte, solenidade e boa relação com o dourado do Ora; detalhes dos rostos e tesselas precisam continuar legíveis em imagens pequenas.
- **Vitral gótico:** luminosidade e reconhecimento imediato; cores saturadas e chumbo podem disputar atenção com a oração. Exige simplificação das cenas e enquadramento próprio.
- **Pintura sacra autoral:** maior suavidade e flexibilidade para narrativas e retratos; exige regras visuais estreitas para não se tornar uma coleção genérica de imagens religiosas geradas.
- **Pinturas históricas curadas:** valor artístico e vínculo com a tradição; a unidade depende de seleção, enquadramento e apresentação constantes. Preservar a identificação da obra e usar reproduções com condições de uso adequadas.

As avaliações acima são recomendações de direção de arte a partir desta prancha; ainda não são resultado de teste dentro da interface ou com usuários.

## Aplicação em Rezar

1. Evangelho: imagem horizontal principal, ligada ao texto ou ao tema da leitura. Título e ações permanecem em HTML, ao lado ou abaixo da imagem.
2. Santo do dia: retrato menor, nome e identificação. Deve complementar o Evangelho e preservar sua prioridade visual.
3. Frase do santo: renderizar somente quando houver texto cadastrado, associação inequívoca ao santo mostrado e atribuição conferida. Guardar a fonte da citação. Sem frase, omitir integralmente a área e seu espaçamento; não substituir por frase aleatória de outro santo.
4. Dias com vários santos: atribuir cada frase à pessoa correta; uma frase de um deles não deve parecer autoria coletiva.
5. Imagens opcionais: a experiência funciona com nome, referência e ações quando não houver imagem. A ausência de arte não bloqueia a oração.
6. Produção: gerar ou selecionar previamente, revisar personagens, atributos, símbolos e relação com a leitura; guardar os arquivos aprovados no acervo. Evitar geração a cada abertura da tela.

## Frases existentes

`data/quotes.json` guarda texto em três idiomas e o nome do autor. Não há identificador estável do santo, fonte da citação ou campo de verificação. A associação ao santo do dia precisa ser adicionada antes de reutilizar automaticamente esse acervo. O fato de uma frase estar salva não comprova sua atribuição.

## Prancha

Arquivo: `estudo-estilos-v1.png`. Gerada com a ferramenta integrada de imagens, como uma única prancha comparativa. Imagens são estudos gerados por IA, sem atribuição a artistas ou obras históricas. Cristo em oração e São Francisco de Assis foram mantidos como temas comuns para comparar as três linguagens.

A prancha não fixa cores dos trajes, gestos ou paleta como norma universal para todo personagem. Atributos e cores iconográficos de cada representação continuam sujeitos à revisão.

## Fontes consultadas

- Every, filosofia de design: https://every.to/podcast/an-inside-look-at-every-s-design-philosophy
- Every, diretrizes editoriais e uso de IA: https://every.to/guides/editorial-guidelines
- Padre Paulo Ricardo, Homilia Diária: https://padrepauloricardo.org/programas/homilia-diaria
- The Met, ícones e meios artísticos: https://www.metmuseum.org/es/essays/icons-and-iconoclasm-in-byzantium
- The Met, exemplo de ícone em mosaico: https://www.metmuseum.org/art/collection/search/474336
- Getty, vitrais: https://www.getty.edu/art/exhibitions/stained_glass/
- National Gallery of Art, imagens abertas: https://www.nga.gov/artworks/free-images-and-open-access

O aprendizado da referência Every é a consistência de direção de arte e a supervisão humana, não a reprodução de seu vocabulário pop neoclássico. Na alternativa de pintura histórica, a seleção curatorial pode fornecer identidade sem transformar artificialmente todas as obras em um único estilo.

Prompt integral enviado à ferramenta integrada: `PROMPT_PRANCHA_V1.txt`.
