# Ora - Nova Aba Católica

**Ora** é uma extensão para Google Chrome que transforma sua "Nova Aba" em um ambiente de foco, oração e produtividade, com uma estética *glassmorphism* moderna e serena. O objetivo é ajudar o usuário a manter a presença de Deus ao longo do dia de trabalho ou estudo, integrando ferramentas de produtividade (como Pomodoro e Bloqueador de Sites) com práticas espirituais (Angelus, Terço, Exame de Consciência).

![Ora Screenshot](icon.png)

## ✨ Funcionalidades Principais

### 🕊️ Espiritualidade e Oração
*   **Fundo e Frases Diárias:** Imagens inspiradoras e citações de santos que mudam diariamente.
*   **Lembretes de Oração (Sinos):**
    *   **Angelus:** Notificações automáticas às 06h, 12h e 18h.
    *   **Terço da Misericórdia:** Lembrete às 15h.
*   **Santo Terço Interativo:**
    *   Visualização das contas do terço passo-a-passo.
    *   Seleção automática dos mistérios do dia (Gozosos, Dolorosos, Gloriosos, Luminosos).
    *   Modo **Terço da Misericórdia** incluído.
    *   Suporte a **Latim** e Português.
*   **Orações e Liturgia:**
    *   Biblioteca de orações pesquisável.
    *   Leitor de orações com alternância rápida entre PT/LA.
    *   Link direto para a Liturgia Diária.
*   **Exame de Consciência:**
    *   Lembretes para Exame de Meio-Dia e Exame da Noite.
    *   Interface guiada para revisão do dia.
*   **Virtudes:** Checklist diário para prática de virtudes.

### 🍅 Produtividade e Foco
*   **Focus Timer (Pomodoro):**
    *   Cronômetro de foco com intervalos curtos e longos personalizáveis.
    *   **Modo Imersivo (Tela Cheia):** Para foco total.
    *   **Mini Player:** Timer compacto flutuante.
    *   Estatísticas de tempo focado no dia.
*   **Bloqueador de Sites:**
    *   Bloqueie sites distrativos (ex: redes sociais) durante o trabalho.
    *   Gerenciamento fácil da lista de bloqueios.
*   **Links Rápidos:**
    *   Acesso rápido aos seus sites favoritos (até 6 links) com ícones automáticos.

### 🎵 Música e Ambiente
*   **Player de Música Integrado:**
    *   Suporte a playlists do **Spotify** e vídeos/playlists do **YouTube**.
    *   Adicione suas próprias músicas colando o link.
    *   Mini-player que continua tocando enquanto você navega na dashboard.

### ⚠️ Dificuldades e Soluções Técnicas
*   **Erro 153 do YouTube (Restrição de Origem):**
    *   Vídeos do YouTube frequentemente retornavam o *Erro 153* ou *152* dentro da extensão. Isso ocorre porque o YouTube bloqueia a reprodução de certos conteúdos quando a origem é uma extensão local (`chrome-extension://`).
    *   **Solução (Relay):** Foi implementado um "Relay" hospedado no GitHub Pages. O player da extensão carrega um `iframe` que aponta para essa página externa (`arthurdouradodev.github.io/ora-player-relay`), passando os parâmetros do vídeo via URL. Assim, o servidor do YouTube reconhece uma origem web válida e permite a reprodução.

## 🛠️ Instalação (Modo Desenvolvedor)

Como esta é uma extensão local (não publicada na loja), siga os passos para instalar:

1.  Baixe ou clone este repositório em seu computador.
2.  Abra o Google Chrome e digite `chrome://extensions` na barra de endereços.
3.  Ative o **Modo do desenvolvedor** no canto superior direito.
4.  Clique em **Carregar sem compactação** (Load unpacked).
5.  Selecione a pasta onde estão os arquivos do projeto (`.../Ora`).
6.  Abra uma nova aba no Chrome e a extensão estará ativa!

## ⚙️ Configuração

*   **Permissões:** A extensão solicitará permissão para substituir a "Nova Aba" e para gerenciar "Armazenamento" (para salvar suas preferências) e "Bloqueio de Conteúdo" (para o bloqueador de sites).
*   **Personalização:**
    *   Clique no ícone de engrenagem no Timer de Foco para ajustar os tempos de Pomodoro.
    *   No player de música, cole links do YouTube ou Spotify para criar sua biblioteca pessoal.
    *   Adicione sites ao bloqueador através do menu "Bloqueador".

## 💻 Tecnologias Utilizadas

*   **HTML5, CSS3, JavaScript (Vanilla):** Leve e rápido, sem frameworks pesados.
*   **Chrome Extension Manifest V3:** Padrão mais recente e seguro para extensões.
*   **Web Storage API:** Para salvar dados localmente (playlists, histórico de foco, preferências).
*   **Phosphor Icons:** Biblioteca de ícones moderna e limpa.

## 📁 Estrutura do Projeto

*   `manifest.json`: Configurações da extensão.
*   `ora.html`: Interface principal.
*   `script.js`: Lógica core (relógio, background, inicialização).
*   `reminders.js`: Lógica dos alarmes e lembretes espirituais.
*   `rosary.js`: Motor do Terço interativo e navegação das contas.
*   `blocker.js`: Lógica de bloqueio de sites (Declarative Net Request).
*   `links.js`: Gerenciamento dos links rápidos.
*   `prayers.js`: Sistema de orações e busca.
*   `data.json`: Base de dados de imagens, orações, citações e playlists padrão.

---
*Desenvolvido com o propósito de santificar o tempo de trabalho.* 🙏