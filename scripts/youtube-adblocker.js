/**
 * Ora – YouTube Ad Blocker
 * Content script injetado nos iframes de youtube-nocookie.com.
 * Estratégias (em ordem de prioridade):
 *   1. Clica no botão "Pular anúncio" assim que ele aparecer
 *   2. Acelera vídeos de anúncio não puláveis para 16× e pula para o fim
 *   3. Esconde overlays visuais de anúncio via CSS
 */

(function OraYouTubeAdBlocker() {
  'use strict';

  const POLL_MS = 300;

  // Seletores CSS do botão "Pular" (YouTube muda com frequência)
  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.videoAdUiSkipButton',
    '[class*="skip-ad"]',
  ];

  // Indicadores de que um anúncio está rodando
  const AD_INDICATORS = [
    '.ad-showing',
    '.ytp-ad-player-overlay-instream-info',
    '.ytp-ad-player-overlay',
  ];

  let _userMuted = false;
  let _adWasPlaying = false;

  // ── CSS: oculta elementos visuais de anúncio ──────────────────────────────
  function injectCSS() {
    if (document.getElementById('ora-adblocker-css')) return;
    const style = document.createElement('style');
    style.id = 'ora-adblocker-css';
    style.textContent = `
      .ytp-ad-overlay-container,
      .ytp-ad-text-overlay,
      .ytp-ce-element { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Detecção ───────────────────────────────────────────────────────────────
  function isAdPlaying() {
    return AD_INDICATORS.some(sel => document.querySelector(sel) !== null);
  }

  function tryClickSkip() {
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  // ── Lógica principal ───────────────────────────────────────────────────────
  function handleAds() {
    // Prioridade 1: pular se o botão estiver disponível
    if (tryClickSkip()) {
      _adWasPlaying = true;
      return;
    }

    const video = document.querySelector('video');

    if (isAdPlaying()) {
      // Salva estado do usuário na primeira detecção do anúncio
      if (!_adWasPlaying && video) {
        _userMuted = video.muted;
        _adWasPlaying = true;
      }

      if (video) {
        // Silencia e acelera o anúncio
        video.muted = true;
        if (video.playbackRate < 16) video.playbackRate = 16;

        // Pula para o fim quando a duração for conhecida
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration - 0.1;
        }
      }
    } else if (_adWasPlaying) {
      // Anúncio terminou — restaura estado original do usuário
      _adWasPlaying = false;
      if (video) {
        video.muted = _userMuted;
        video.playbackRate = 1;
      }
    }
  }

  // ── Inicialização ──────────────────────────────────────────────────────────
  function startPolling() {
    setInterval(handleAds, POLL_MS);

    // MutationObserver para detecção imediata de mudanças de classe
    const observer = new MutationObserver(handleAds);
    observer.observe(document.body || document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // CSS é injetado imediatamente (antes do DOM ser parseado)
  injectCSS();

  // Polling e observer iniciam após o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }
})();
