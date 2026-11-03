# Verificação da fase 3 — Rezar

Data: 03/11/2026. Referência: `PLANO_V1_ORA.md`, fase 3; composição `prototypes/03c-rezar-prioridades.html`.

## Entrega

Entrada de Rezar na ordem aprovada: favoritas/essenciais, Evangelho, práticas, santos e Biblioteca. Biblioteca com categoria e favoritas explícitas, busca sem acentos, contagem e resultados que permanecem à vista em telas estreitas. Leitor Literata com Escuro/Papel, tamanho e posição persistidos. Lectio em quatro etapas com anotações locais. Preparação e oração do terço com mistérios por dia, intenção, modo de texto, retomada real e teclado; o Terço da Misericórdia permanece disponível. Respiro sem cronômetro, forma lembrada e retorno à origem. Exame e checklist de virtudes migrados, preservando registros. Bíblia com 73 livros, fontes católicas e último capítulo aberto.

O SW guarda hoje + seis dias em `liturgy_gospel_cache.days`. Usa o feed português `?periodo=7`, completando lacunas por data; referências inglesas vêm do cpbjr e levam à USCCB. Espanhol apresenta referência localizada e link ao Evangelizo, sem copiar texto bíblico estrangeiro. Falhas parciais preservam o cache existente. A tela de bloqueio também preserva esse formato.

Os retratos e as imagens do Evangelho são opcionais. `ora_acervo_url` aceita um índice HTTPS hospedado em `cdn.jsdelivr.net` (origem já permitida), como JSON `{ "entries": [{ "pericope": "lc-14-15-24", "url": "https://…/imagem.png", "status": "approved", "caption": {"pt":"Origem da obra","en":"Artwork origin","es":"Origen de la obra"}, "source": "https://…/origem" }] }`. Apenas entradas aprovadas e com legenda/fonte aparecem. Os 20 espaços de imagens do terço estão em `data/rosary.json` (`mysteries.<grupo>.images`); permanecem nulos conforme o cronograma do acervo, fase 10. Não foram incluídas as ilustrações ainda não aprovadas dos protótipos.

## Testes reproduzíveis

1. `node tests/run.js`: 306 testes em 28 grupos, incluindo busca, limites de rolagem, retomada/serialização do terço, dias da semana, normalização de APIs, migração/preservação do cache, perícope/arte, frases verificadas e destinos bíblicos.
2. `tests/tests.html`, servido por HTTP: a mesma suíte do Node.
3. `node tests/phase3-browser.cjs`: testes com a extensão realmente carregada sem pacote num perfil temporário isolado. Usa o Playwright/Chromium já disponíveis no ambiente; não instala bibliotecas nem altera o perfil pessoal.

O runner aceita `ORA_PLAYWRIGHT` (caminho do módulo Playwright existente) e `ORA_CHROMIUM` (executável Chromium). Se o Playwright já estiver no caminho de módulos e seu Chromium instalado, não precisa dessas variáveis. O runner imprime os resultados e o diretório temporário das capturas. Os testes das APIs requerem internet.

A interface e o idioma das orações são independentes: uma pessoa pode manter textos em português/latim com a interface em inglês ou espanhol. O seletor do leitor mostra os idiomas realmente disponíveis; uma tradução ausente recebe uma mensagem no idioma da interface, sem substituição silenciosa.

## Evidências

Rodada final: 45 verificações de aceitação, além dos 306 testes executados tanto no Node como no navegador, sem casos ignorados.

- Leitor: oração longa reaberta após recarga na mesma proporção; preferências confirmadas no armazenamento.
- Terço: mistérios gloriosos, 3º mistério, 6ª Ave-Maria, retomados em nova aba; setas com controle focado; Espaço em Sair não avança a conta.
- Falha simulada de gravação: posição do terço preservada, erro visível, sem anunciar sucesso.
- SW real: sete textos portugueses e sete referências inglesas efetivamente carregados das fontes.
- Lectio: etapa e anotação recuperadas após recarga; virtudes e capítulo bíblico persistidos.
- Respiro: retorno a Hoje, à sessão concluída e à página bloqueada; foco em andamento preservado.
- Confirmação: Shift+Tab permanece no diálogo; Esc devolve o foco.
- Offline com cache e sem cache; links corretos em en/es e nenhuma chave de tradução crua nas telas verificadas.
- Capturas em 1440×900, 800×600, texto a 200%, equivalente de zoom de página a 200% e movimento reduzido. Sem transbordamento horizontal nas telas da fase; busca mantém resultados visíveis.
- Nenhuma exceção JavaScript não tratada durante a rodada.

A regressão completa de DNR, alarmes/notificações e sincronização entre perfis continua pertencendo às fases correspondentes e à publicação (E20). O presente teste usa o SW e o armazenamento reais, mas não simula a passagem natural de 25 minutos: a transição usada para validar o retorno da sessão concluída é antecipada apenas dentro do perfil temporário.
