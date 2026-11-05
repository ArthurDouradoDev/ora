# Validação — Rezar · arte e recolhimento

Data: 30/10/2026. Protótipo: `../03b-rezar-arte.html`. Cenário editorial mantido em 28/10/2026 para comparação com a versão anterior.

## Implementado

- Entrada com busca e acesso explícito à Biblioteca no topo.
- Retomadas reais em linhas discretas, com ações à direita e sem faixa dourada ou cartão de destaque.
- Evangelho com arte horizontal e texto/ações ao lado no desktop; composição em coluna nas telas estreitas.
- Acesso externo à liturgia completa, com nova aba indicada.
- Terço e Respiro como ações leves; santos com retrato complementar e atribuição individual da frase.
- Frase cadastrada vinculada ao identificador do santo, com fonte e verificação; ausência remove o elemento e seu espaço.
- Uma área de orações: favoritas pessoais ou essenciais do Ora como ponto de partida.
- Estrelas diretamente na Biblioteca para escolher favoritas sem abrir o leitor.
- Alternância entre pintura, mosaico e ausência de imagens na barra de validação; frase e fundo também comparáveis.
- Quatro imagens locais novas, geradas com a ferramenta integrada, com prompts e registro de origem em `PROMPTS_REZAR_V3.json` e `assets/acervo-v1.json`.

## Verificado no navegador

- Pintura e mosaico carregam tanto no Evangelho quanto no retrato, mantendo o mesmo enquadramento de apresentação.
- Sem imagens: as duas áreas de arte são ocultadas, e o conteúdo e as ações permanecem disponíveis.
- Sem frase: elemento oculto e altura medida igual a zero.
- Estrela da Biblioteca, escolha pessoal exibida na entrada e retorno à seleção essencial após desfavoritar. Tecla Espaço também testada na estrela.
- Pesquisa sem acentos, abertura do resultado e retorno com consulta e foco preservados.
- Leitura longa após recarregar: proporção antes/depois de 0,36336779911373707.
- Terço: oração atual Pai-Nosso preservada após recarregar; saída volta à preparação.
- Respiro: oração livre, conclusão e retorno à entrada.
- Modal sobre imagens: Escape fecha e restaura o foco no acionador.
- Estados de Rezar e Biblioteca sem transbordamento horizontal nas combinações 1024×640/100%, 1024×640/150%, 800×600/200% e 390×844/100%.
- Rezar e resultados da Biblioteca também verificados em 360×740 com texto de 200%, sem transbordamento horizontal nos elementos inspecionados.

## Conferências dos arquivos

- Sintaxe dos dois novos arquivos JavaScript válida.
- IDs HTML únicos e dependências locais presentes.
- Imagens presentes: Evangelho 1672×941; retratos 1122×1402, iguais entre as duas linguagens.
- Versões anteriores preservadas e nova versão incluída no índice.

## Limites da verificação

A ampliação citada é o controle de texto do protótipo; não equivale a teste de zoom real do navegador. A inspeção não constitui certificação de acessibilidade ou aprovação definitiva do acervo. O CLI 21st não está instalado; a revisão foi feita no código e no navegador usando os componentes existentes do Ora. A matriz de oito amostras sugerida pela direção artística é uma exploração posterior: esta versão utiliza quatro criações novas, sem adaptações de obras externas.

Fontes editoriais consultadas e vinculadas na interface:

- https://www.vaticannews.va/pt/palavra-do-dia/2026/10/28.html
- https://www.vaticannews.va/pt/santo-do-dia/10/28/ss--simao-e-judas--tadeu---apostolos.html
- https://www.vatican.va/content/benedict-xvi/pt/audiences/2006/documents/hf_ben-xvi_aud_20061011.html
