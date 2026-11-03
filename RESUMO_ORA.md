# Ora — Resumo Completo do Projeto

> Documento técnico-funcional consolidado a partir do estado atual do repositório em 2 de setembro de 2026.

## 1. Visão geral

**Ora — Nova Aba Católica** é uma extensão de navegador baseada no Manifest V3 que substitui a página de nova aba por um ambiente de espiritualidade, foco e organização pessoal. O produto reúne práticas católicas — orações, Santo Terço, lembretes devocionais, exame de consciência e virtudes — com ferramentas de produtividade, como Pomodoro, tarefas, bloqueio de sites, links rápidos, música e reflexão sobre tempo de tela.

O projeto funciona em navegadores compatíveis com extensões Chromium, como Google Chrome, Microsoft Edge e Brave. A extensão é construída integralmente com HTML, CSS e JavaScript puros, sem framework, bundler ou etapa de compilação.

### Identificação atual

| Item | Valor |
|---|---|
| Nome no manifesto | Ora - Nova Aba |
| Versão | 1.2.0 |
| Manifesto | Chrome Extension Manifest V3 |
| Página principal | `ora.html` |
| Página de bloqueio | `blocked.html` |
| Processo em segundo plano | `sw.js` |
| Site oficial | [oratime.com.br](https://oratime.com.br) |
| Tecnologias | HTML5, CSS3 e JavaScript ES6+ |
| Processo de build | Não existe |
| Idiomas | Português, inglês e espanhol |

## 2. Propósito do produto

O Ora procura transformar o uso cotidiano do navegador em uma experiência mais intencional. Sua proposta combina três eixos:

1. **Vida espiritual:** favorecer oração, exame diário, cultivo de virtudes e contato com a liturgia.
2. **Trabalho focado:** reduzir distrações e estruturar períodos de concentração e descanso.
3. **Consciência digital:** apresentar dados de uso e criar pausas para reflexão, sem diagnosticar ou prescrever comportamentos.

A identidade visual usa glassmorphism, transparência, desfoque, tipografia clássica e animações suaves para criar uma atmosfera serena, contemplativa e responsiva.

## 3. Arquitetura geral

A solução possui três contextos principais de execução:

```text
Nova aba (ora.html)
    └── scripts/main.js
        ├── carrega dados JSON e traduções
        ├── inicializa os módulos de interface
        ├── lê/grava chrome.storage
        └── envia comandos ao Service Worker

Service Worker (sw.js)
    ├── motor persistente do Pomodoro
    ├── alarmes e notificações
    ├── atualização do Evangelho do dia
    ├── regras e fallback do bloqueador
    └── coleta local de tempo por domínio

Página de bloqueio (blocked.html)
    └── scripts/blocked.js
        ├── explica o motivo do bloqueio
        ├── controla acessos temporários
        └── oferece desbloqueio mediante leitura/digitação do Evangelho
```

Os módulos de negócio da nova aba ficam em `scripts/modules/`. Em geral, cada funcionalidade é exposta como um objeto singleton global com estado próprio, métodos de inicialização, cache de elementos do DOM, eventos, persistência e renderização.

Os arquivos em `scripts/shared/` são funções puras, sem dependência de DOM ou de `chrome.*`. Eles são a fonte única de verdade para regras usadas em mais de um contexto e também viabilizam testes automatizados.

## 4. Fluxo de inicialização

Ao abrir uma nova aba, o fluxo principal é:

1. `ora.html` carrega os estilos e scripts com `defer`.
2. `scripts/main.js` consulta `chrome.storage.session` para decidir se deve mostrar a tela de carregamento.
3. A tradução selecionada é carregada de `data/i18n/`, com português como fallback.
4. As configurações do usuário são inicializadas antes dos demais módulos.
5. A imagem de fundo começa a ser pré-carregada em paralelo.
6. Os arquivos JSON de conteúdo são carregados com `Promise.all`.
7. Frase e saudação diárias são selecionadas e persistidas para permanecerem estáveis durante o dia.
8. Os módulos de música, orações, terço, lembretes, tempo de tela, foco, tarefas, exame e bloqueador são inicializados.
9. A sincronização entre dispositivos roda depois que os módulos já migraram seus dados locais.
10. O onboarding é exibido no primeiro uso.
11. `scripts/sw-init.js` registra o Service Worker.

Se um arquivo de dados falhar, `main.js` fornece valores mínimos de fallback para evitar que a interface inteira deixe de funcionar. A tela de carregamento também possui um timeout de segurança de oito segundos.

## 5. Funcionalidades

### 5.1 Painel e conteúdo diário

O painel principal apresenta:

- relógio atualizado a cada segundo;
- saudação localizada, opcionalmente acrescida do nome do usuário;
- frase espiritual escolhida uma vez por dia;
- imagem de fundo diária proveniente da lista do Unsplash;
- intenção pessoal persistente;
- atalhos para as principais ferramentas;
- widget retrátil com as tarefas prioritárias.

O módulo `background.js` mantém a imagem escolhida durante o dia e usa `chrome.storage.session` para evitar repetir a tela de carregamento quando a imagem já foi carregada na mesma sessão do navegador.

### 5.2 Onboarding e configurações

No primeiro uso, um assistente de cinco etapas conduz o usuário por:

1. escolha do idioma da interface;
2. nome usado na saudação;
3. apresentação das funcionalidades;
4. idioma padrão das orações e preferências de lembretes;
5. conclusão.

As configurações permitem alterar posteriormente:

- português, inglês ou espanhol;
- nome do usuário;
- idioma padrão das orações;
- lembretes de Carlo Acutis, Angelus, Misericórdia, exame do meio-dia, exame noturno, Terço e reflexão de tempo de tela;
- reinício manual do onboarding.

Mudanças são comunicadas entre módulos por eventos customizados, como `ora:settings-changed` e `ora:locale-changed`.

### 5.3 Internacionalização

O sistema de i18n está centralizado em `scripts/utils.js`:

- `t(chave, parâmetros)` resolve chaves em notação por pontos e interpola valores;
- `l(objeto)` escolhe a versão localizada de objetos `{ pt, en, es }`;
- `applyI18n()` aplica textos, placeholders, títulos, HTML controlado e links marcados com atributos `data-i18n-*`;
- traduções ausentes usam português como fallback;
- URLs da Bíblia e da liturgia variam de acordo com o idioma.

### 5.4 Pomodoro e foco

O sistema de foco usa `focus.js` para a interface e `sw.js` como motor persistente. Isso permite que o cronômetro continue correto mesmo quando nenhuma aba do Ora está aberta.

Recursos principais:

- fases de foco, pausa curta e pausa longa;
- durações configuráveis dentro de limites validados;
- contagem de ciclos concluídos;
- total de foco do dia;
- visualização compacta e modo imersivo em tela cheia;
- reinício e avanço manual de fase;
- início automático da próxima fase, opcional;
- som, alarme contínuo e Wake Lock opcionais;
- integração com a tarefa ativa;
- sincronização de estado entre abas por `chrome.storage.onChanged`;
- restauração baseada em `expectedEndTime`, evitando depender da frequência exata dos alarmes.

Na virada do dia, os totais diários são zerados. Uma sessão que realmente atravessa a meia-noite é preservada; estados antigos ou incompletos são reiniciados. O histórico agregado de foco é mantido em `ora_daily_stats` por até 35 dias.

### 5.5 Tarefas, rotina e ritual matinal

O módulo `tasks.js` gerencia tarefas diárias e recorrentes, incluindo:

- criação de tarefas com descrição e intenção;
- edição, exclusão e reordenação;
- tarefas recorrentes usadas como rotina;
- um a quatro ciclos de Pomodoro por tarefa;
- vínculo de uma tarefa ativa ao timer;
- conclusão manual e avanço de ciclos;
- listas separadas de pendentes e concluídas;
- opções para limpar concluídas, reiniciar o dia, reiniciar recorrentes ou remover tudo;
- widget lateral retrátil com até três tarefas pendentes;
- retração automática do widget quando o painel de orações ocupa a mesma região;
- streaks de recorrência, com restauração ao desfazer uma conclusão no mesmo dia;
- animação de conclusão total.

Na primeira aba aberta em cada dia, o ritual matinal mostra:

- saudação pessoal;
- resumo de tarefas, ciclos e foco do dia anterior;
- resumo dos sete dias anteriores às segundas-feiras;
- rotina recorrente do dia e seus streaks;
- três campos de prioridade, inseridos no topo da lista ao iniciar o dia;
- opção de pular o ritual.

Tarefas de uso único permanecem locais. Apenas a definição das tarefas recorrentes é enviada para `chrome.storage.sync`; o progresso diário continua específico de cada dispositivo.

### 5.6 Bloqueador de sites

O bloqueador combina regras dinâmicas da API `declarativeNetRequest` com um fallback em `webNavigation` para sites e aplicações de página única que podem escapar do redirecionamento normal.

Cada domínio pode operar em dois modos:

- **Sempre bloqueado:** o acesso é impedido diretamente.
- **Limitado:** permite configurar quantidade de acessos e uma ou mais janelas de horário.

Outros recursos:

- aliases conhecidos de domínio, como redirecionamentos entre serviços equivalentes;
- exceções específicas para fluxos OAuth;
- contadores de acesso;
- horários que podem atravessar a meia-noite;
- regras temporárias de permissão revogadas por tempo ou ao fechar a aba;
- preservação do caminho e query string originais quando o usuário recebe acesso;
- reativação automática após uma pausa temporária;
- restauração das regras quando a extensão é recarregada;
- proteção contra mudanças externas inconsistentes entre abas e dispositivos.

Desligar o bloqueador exige uma pausa contemplativa: o usuário vê um versículo, aguarda uma contagem regressiva e escolhe por quanto tempo deseja suspender o bloqueio — 15 minutos, 30 minutos, uma hora ou até o fim do dia. O Service Worker agenda a reativação mesmo que todas as abas do Ora estejam fechadas.

Durante uma sessão ativa de foco, configurações que enfraqueceriam o bloqueio são recusadas. Ainda é permitido tornar uma regra mais rígida.

A trava opcional do painel exige que o usuário digite um versículo para afrouxar as configurações. Também é possível ativar o desbloqueio por Evangelho para sites específicos ou para sites permanentemente bloqueados.

### 5.7 Página de bloqueio e desbloqueio pelo Evangelho

`blocked.html` explica se o domínio foi barrado por bloqueio permanente, limite de acessos ou janela de horário.

Quando o desbloqueio pelo Evangelho está habilitado, a página:

- obtém o Evangelho do dia da API de liturgia ou do cache local;
- limpa números de versículo e normaliza pontuação;
- impede colagem;
- acompanha a digitação caractere a caractere, com comparação tolerante a acentos e variações de pontuação;
- libera uma sessão temporária após a conclusão;
- cria regras para o domínio principal e seus aliases;
- solicita ao Service Worker a revogação posterior da permissão.

O Evangelho é atualizado proativamente pelo Service Worker a cada hora e também na instalação/ativação da extensão.

### 5.8 Biblioteca de orações

O módulo `prayers.js` oferece:

- biblioteca em grade;
- busca por título e conteúdo;
- leitor dedicado;
- alternância entre português e latim quando disponível;
- integração com lembretes e outras experiências espirituais.

O catálogo atual contém 16 orações, incluindo Pai-Nosso, Ave-Maria, Glória, Salve-Rainha, Credo, Ato de Contrição, Angelus e orações ligadas ao estudo, trabalho e santos.

### 5.9 Santo Terço e Terço da Misericórdia

O módulo `rosary.js` apresenta uma navegação visual pelas contas, com progresso persistente. Ele contempla:

- estrutura de 73 posições definida em JSON;
- avanço e retorno entre contas válidas;
- mistérios Gozosos, Dolorosos, Gloriosos e Luminosos;
- texto contextual do mistério em cada dezena;
- português e latim;
- Terço tradicional e Terço da Misericórdia;
- reinício manual;
- retomada do ponto salvo.

### 5.10 Lembretes espirituais

`reminders.js` verifica as janelas relevantes a cada minuto enquanto a nova aba está aberta:

| Lembrete | Janela atual |
|---|---|
| Carlo Acutis | Primeira abertura da sessão, após o onboarding |
| Angelus da manhã | 06h–08h |
| Angelus do meio-dia | 12h–14h |
| Angelus da noite | 18h–21h |
| Hora da Misericórdia | 15h–16h |
| Exame do meio-dia | 11h–14h |
| Exame da noite | A partir das 18h |
| Sugestão do Terço | Acionada pelo fluxo de foco |

Cada lembrete pode ser desligado nas configurações. Marcações de conclusão são persistidas por data para que o aviso não reapareça indevidamente no mesmo período.

### 5.11 Exame de consciência e virtudes

`exam.js` oferece quatro roteiros carregados de `data/exam.json`:

- manhã;
- meio-dia;
- exame rápido;
- noite.

O fluxo é guiado em etapas e pode registrar respostas. Ao concluir:

- marca o exame como realizado no dia;
- atualiza o lembrete correspondente;
- mantém até 30 registros recentes;
- atualiza o contador semanal.

O mesmo módulo contém:

- check-in emocional após o Pomodoro;
- sugestões de micro-orações;
- checklist diário de virtudes;
- marcação positiva ou negativa por virtude;
- editor para personalizar a lista de virtudes.

### 5.12 Reflexão sobre tempo de tela

O módulo `screentime.js`, em conjunto com `sw.js`, mede tempo por domínio quando:

- existe uma janela do navegador em foco;
- a aba está ativa;
- o usuário não está ocioso nem com a sessão bloqueada.

Os dados permanecem no dispositivo e são podados após 14 dias. O sistema registra também quantas novas abas foram abertas por dia.

Às 13h e às 19h, alarmes do Service Worker podem emitir notificações localizadas. Ao abri-las, o Ora mostra:

- tempo total do dia;
- quantidade de novas abas;
- até seis domínios com maior uso;
- comparação percentual com a média dos dias anteriores;
- destaque para aumentos relevantes;
- perguntas abertas de reflexão, cujas respostas são salvas localmente.

O módulo apresenta dados para reflexão pessoal; não faz diagnóstico nem envia esse histórico a um serviço externo.

### 5.13 Música

`music.js` mantém uma biblioteca com playlists padrão e itens adicionados pelo usuário. Há suporte a:

- vídeos e playlists do YouTube;
- playlists, álbuns e faixas do Spotify;
- extração de metadados por `noembed.com`;
- mini-player recolhível;
- abertura do conteúdo no serviço original;
- remoção de itens padrão ou pessoais.

Como páginas `chrome-extension://` podem provocar erros de origem no YouTube, a reprodução usa um relay hospedado em GitHub Pages (`ora-player-relay`) para fornecer uma origem web aceita pelo player.

### 5.14 Links rápidos

`links.js` exibe até seis atalhos e permite adicionar ou remover links. O módulo:

- normaliza URLs sem protocolo;
- valida os endereços;
- limita o nome a 20 caracteres;
- obtém favicons pelo serviço do Google;
- oferece três links padrão: Google, ChatGPT e Liturgia das Horas.

## 6. Responsabilidades do Service Worker

`sw.js` centraliza tudo que precisa sobreviver à ausência da página principal:

| Área | Responsabilidade |
|---|---|
| Cache externo | Estratégia stale-while-revalidate para recursos HTTP/HTTPS |
| Evangelho | Consulta, normalização, cache diário e atualização horária |
| Pomodoro | Estado persistente, alarmes, avanço de fase e estatísticas diárias |
| Bloqueador | Reativação temporizada, montagem de regras DNR e revogação de sessões |
| Navegação | Captura da URL original e fallback para SPAs |
| Tempo de tela | Rastreamento de aba ativa, foco da janela e estado de inatividade |
| Reflexão | Alarmes de 13h/19h, notificações e abertura do relatório |

As principais mensagens internas incluem comandos `pomodoro:*`, `screentime:*`, agendamento/cancelamento da reativação do bloqueador, revogação de permissões temporárias e recuperação da URL original.

## 7. Persistência e sincronização

### 7.1 `chrome.storage.local`

É o armazenamento principal e persistente. As chaves mais relevantes são:

| Grupo | Chaves principais |
|---|---|
| Preferências | `ora_locale`, `ora_user_name`, `ora_prayer_lang`, `ora_reminder_*` |
| Onboarding | `ora_onboarding_done` |
| Conteúdo diário | `catholic_dash_date`, `catholic_dash_image`, `ora_quote_*`, `ora_greeting_*` |
| Foco | `ora_pomodoro_state`, `ora_focus_settings`, `ora_daily_stats` |
| Tarefas | `ora_tasks_daily`, `ora_active_task_id`, `ora_tasks_last_reset`, `ora_ritual_last_shown` |
| Bloqueador | `blocker_config` |
| Espiritualidade | `ora_rosary_progress`, `ora_exam_logs`, `ora_exam_done_*`, `ora_virtues_*` |
| Música e links | `ora_user_playlists`, `ora_deleted_default_playlists`, `ora_quick_links` |
| Tempo de tela | `ora_screentime`, `ora_screentime_reflection_*` |
| Liturgia | `liturgy_gospel_cache` |
| Sincronização | `ora_sync_meta` |

`AsyncStorage`, em `scripts/utils.js`, encapsula leituras e gravações e também migra valores antigos de `localStorage` no primeiro acesso.

### 7.2 `chrome.storage.session`

Mantém estado efêmero da sessão, como:

- fundo já carregado (`ora_bg_loaded`);
- lembrete de Carlo Acutis já exibido;
- mapeamento de abas para permissões temporárias do bloqueador;
- domínio ativo e instante inicial do rastreamento de tempo de tela.

### 7.3 `chrome.storage.sync`

`sync.js` usa três registros versionados:

- `sync_settings`;
- `sync_blocker`;
- `sync_tasks`.

A estratégia é last-write-wins por grupo, com debounce de 2,5 segundos, metadados locais e comparação de payload para evitar loops. A mesclagem é conservadora:

- sincroniza idioma, nome, idioma de oração e toggles de lembretes;
- sincroniza lista, regras e trava do bloqueador;
- não sincroniza o estado ligado/desligado, pausas temporárias nem contadores de acesso;
- sincroniza apenas tarefas recorrentes;
- mantém localmente conclusões, ciclos e tarefas avulsas do dia;
- preserva o streak cuja data de conclusão seja mais recente.

## 8. Dados estáticos

O diretório `data/` separa conteúdo editorial do código.

| Arquivo | Conteúdo atual |
|---|---|
| `backgrounds.json` | 47 imagens de fundo |
| `playlists.json` | 3 playlists padrão |
| `prayers.json` | 16 orações |
| `quotes.json` | 52 frases |
| `greetings.json` | 5 saudações |
| `rosary.json` | Estrutura do terço, quatro grupos de mistérios e orações extras |
| `exam.json` | Quatro tipos de exame, cinco virtudes padrão e conteúdo de check-in |
| `verses.json` | 20 versículos usados pelo bloqueador |
| `i18n/pt.json` | Interface em português |
| `i18n/en.json` | Interface em inglês |
| `i18n/es.json` | Interface em espanhol |

Os únicos assets locais atuais são o ícone da extensão e a captura de tela usada na documentação. As imagens de fundo são carregadas por URL.

## 9. Estrutura do repositório

```text
Ora/
├── manifest.json                 # Manifesto MV3 e permissões
├── ora.html                      # Nova aba e todos os modais principais
├── blocked.html                  # Tela exibida para domínios bloqueados
├── sw.js                         # Service Worker
├── index.html                    # Protótipo/entrada antiga, fora do manifesto atual
├── assets/
│   ├── icon.png
│   └── screen.png
├── data/                         # Conteúdo e traduções em JSON
├── scripts/
│   ├── main.js                   # Orquestração da nova aba
│   ├── utils.js                  # i18n, storage e utilidades de UI
│   ├── blocked.js                # Lógica da página de bloqueio
│   ├── sw-init.js                # Registro do Service Worker
│   ├── youtube-adblocker.js      # Content script do player YouTube
│   ├── modules/                  # Funcionalidades da interface
│   └── shared/                   # Regras puras e compartilhadas
├── styles/
│   ├── base/                     # Reset e variáveis
│   ├── components/               # Botões, inputs, modais e painéis
│   ├── layout/                   # Estrutura geral, grid, header e footer
│   ├── modules/                  # Estilos específicos de cada funcionalidade
│   └── utils/                    # Helpers e animações
├── tests/
│   ├── tests.html                # Executor visual no navegador
│   └── tests.js                  # Testes das funções puras
├── README.md                     # Apresentação pública
├── IMPLEMENTACAO.md              # Registro de uma rodada de melhorias
├── IDEAS.md / IDEAS.pdf          # Ideias e planejamento
├── AGENTS.md                     # Orientações para agentes de código
└── RESUMO_PROJETO.md             # Este documento
```

`index.html` aparenta ser um protótipo legado: não é referenciado pelo manifesto e aponta para um `style.css` inexistente na raiz. A aplicação efetiva é `ora.html`.

## 10. Estilos e interface

O CSS é carregado em camadas:

1. reset e variáveis;
2. utilitários e animações;
3. componentes reutilizáveis;
4. layout;
5. estilos específicos dos módulos;
6. tela de carregamento.

As fontes principais são Cinzel e Montserrat, servidas pelo Google Fonts. Os ícones usam Phosphor Icons via CDN. Variáveis globais de cor, sombra, raio e transição ficam em `styles/base/variables.css`.

`ora.html` concentra a marcação dos painéis e modais, enquanto os módulos JavaScript controlam visibilidade, conteúdo dinâmico e eventos.

## 11. Integrações externas

| Serviço | Uso |
|---|---|
| Liturgia API | Evangelho do dia e cache local |
| Unsplash | Imagens de fundo |
| Google Fonts | Cinzel e Montserrat |
| Phosphor Icons / jsDelivr | Ícones da interface |
| Google Favicon Service | Ícones dos links rápidos |
| noembed.com | Metadados de vídeos e playlists |
| YouTube / youtube-nocookie | Reprodução de vídeos e playlists |
| Spotify | Reprodução incorporada |
| GitHub Pages | Relay do player do YouTube |
| Sites católicos localizados | Bíblia e liturgia conforme o idioma |

A política de segurança de conteúdo permite somente as origens necessárias para scripts próprios, fontes, imagens, frames e conexões externas declaradas no manifesto.

## 12. Permissões do manifesto

| Permissão | Motivo principal |
|---|---|
| `storage` | Preferências, progresso e sincronização |
| `declarativeNetRequest` | Bloqueio e permissão temporária de domínios |
| `alarms` | Pomodoro, Evangelho, reativação e reflexões |
| `tabs` | Estado das abas, redirecionamentos e relatórios |
| `webNavigation` | Captura de URL e fallback do bloqueador |
| `notifications` | Reflexões e avisos do sistema |
| `idle` | Pausar a contagem de tempo quando o usuário está ausente |
| `<all_urls>` | Aplicar o bloqueador e observar o domínio ativo |

Há também um content script em `youtube-nocookie.com`, carregado no início e em todos os frames, para reduzir interferências de anúncios no player incorporado.

## 13. Testes e verificação

O projeto não possui dependências de teste nem package manager. A suíte existente valida funções puras de:

- aliases e extração de domínios;
- janelas de bloqueio, inclusive as que atravessam a meia-noite;
- construção de regras DNR;
- avanço das fases do Pomodoro;
- comportamento na virada do dia;
- sanitização e mesclagem da sincronização.

No levantamento deste documento, a suíte executou com **72 de 72 asserções aprovadas**.

Pode ser executada de duas formas:

1. abrir `tests/tests.html` no navegador;
2. usar Node.js com os mocks de DOM descritos em `README.md` e `IMPLEMENTACAO.md`.

Não existem testes end-to-end para as APIs do Chrome, UI ou integrações externas. Esses fluxos ainda precisam de validação manual em uma extensão carregada no navegador.

## 14. Instalação para desenvolvimento

1. Clone ou baixe o repositório.
2. Abra `chrome://extensions` ou `edge://extensions`.
3. Ative o modo do desenvolvedor.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta raiz que contém `manifest.json`.
6. Abra uma nova aba.

Após uma alteração:

- recarregue a extensão na página de extensões;
- para mudanças no Service Worker, faça uma recarga completa da extensão;
- abra o console da nova aba com `Ctrl+Shift+J`;
- consulte logs de background em **Detalhes da extensão → Service Worker**.

Como não existe build, os arquivos editados são exatamente os arquivos executados pelo navegador.

## 15. Pontos técnicos importantes

- O bloqueador depende de permissões amplas porque precisa atuar sobre os domínios cadastrados e observar navegações.
- Dados de tempo de tela ficam locais; somente os grupos explicitamente tratados por `sync.js` vão para a sincronização do Chrome.
- O Pomodoro usa timestamps reais e o alarme apenas como mecanismo de despertar, melhorando a precisão após suspensão do navegador.
- Regras temporárias do bloqueador ocupam IDs entre 1000 e 9999; regras de bloqueio usam IDs abaixo de 1000.
- As funções compartilhadas em `scripts/shared/` devem continuar sem DOM e sem `chrome.*` para permanecerem reutilizáveis e testáveis.
- Toda string nova visível ao usuário deve usar `t()` e receber chaves equivalentes nos três arquivos de idioma.
- `ora.html` é um arquivo grande e concentra a estrutura de todos os modais; mudanças de marcação devem ser coordenadas com os seletores dos módulos e os respectivos arquivos CSS.
- O cache externo do Service Worker usa stale-while-revalidate, mas a lista de pré-cache está vazia. A extensão não é uma PWA independente.
- O player do YouTube depende de um relay externo; disponibilidade e política do YouTube podem afetar a reprodução.
- A API de liturgia e o Unsplash exigem rede, embora o Evangelho e imagens já visitadas possam aproveitar cache.

## 16. Limitações e oportunidades de manutenção

- A cobertura automatizada alcança apenas lógica pura; os fluxos de UI e APIs Chrome continuam manuais.
- A documentação interna não está totalmente alinhada: `AGENTS.md` ainda afirma que não há suíte de testes, enquanto `tests/` contém 72 asserções.
- `index.html` mantém referências antigas e não participa da extensão atual; pode ser arquivado ou removido após confirmação.
- Mudanças de idioma vindas de outro dispositivo são aplicadas integralmente na próxima abertura da aba; partes da UI já aberta podem não atualizar de imediato.
- A validação real da sincronização requer dois navegadores/perfis conectados à mesma conta.
- O modo de período “por hora” do limite de acessos merece teste manual específico, pois o modelo persistido é orientado por contador e data.
- Permissões e origens da CSP devem ser revistas sempre que uma integração externa for adicionada ou removida.
- Conteúdo editorial, traduções e seletores do DOM não possuem validação estrutural automatizada.

## 17. Resumo executivo final

O Ora é uma extensão Chromium de nova aba, modular e sem build, que integra espiritualidade católica, produtividade e consciência digital. Sua base técnica combina módulos JavaScript de interface, conteúdo em JSON, persistência no ecossistema `chrome.storage`, regras DNR e um Service Worker responsável por tarefas persistentes. As áreas mais sofisticadas são o Pomodoro resistente ao fechamento de abas, o bloqueador com fricção intencional e desbloqueio pelo Evangelho, a sincronização conservadora entre dispositivos e o rastreamento local de tempo de tela.

O projeto está funcionalmente amplo e já possui uma boa separação entre interface, conteúdo e regras puras. Os próximos ganhos de robustez devem vir de testes de integração, atualização da documentação interna, limpeza de arquivos legados e validação manual sistemática em Chrome, Edge e Brave.
