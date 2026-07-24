
import React from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App';
import { HashRouter } from 'react-router-dom';
import AppRouter from './router/AppRouter';
import ErrorBoundary from './components/ErrorBoundary';
import { registerSW } from 'virtual:pwa-register';
import { logger } from './utils/logger';

// Register PWA Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Nova versão disponível. Atualizar agora?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    logger.info('App pronto para uso offline.');
  },
});const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

logger.info("App mounting...");

// ============================================================
// BLINDAGEM DE BOOT: try/catch global contra tela preta
// Se o React falhar ao montar (ex: import corrompido, OOM), 
// renderiza fallback emergencial direto no DOM.
// ============================================================
try {
  const root = createRoot(rootElement);

  // Sinaliza que o app iniciou para remover o loader do index.html
  if (typeof window !== 'undefined') {
    (window as Window & { appStarted?: boolean }).appStarted = true;
  }

  root.render(
    <ErrorBoundary>
      <HashRouter>
      <AppRouter />
      </HashRouter>
    </ErrorBoundary>
  );
  logger.info("App render triggered.");
} catch (criticalError: unknown) {
  const errMsg = criticalError instanceof Error ? criticalError.message : String(criticalError || 'Erro desconhecido');
  logger.error(">>> [MOBILE-SHIELD] CRASH CRÍTICO NA RAIZ DO APP:", errMsg);

  // Remove o loader spinner e exibe fallback visual de emergência
  const loader = document.getElementById('gbr-initial-loader');
  if (loader) loader.remove();

  rootElement.innerHTML = `
    <div style="background:#0f172a;color:#f8fafc;padding:24px;text-align:center;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;">
      <div style="width:64px;height:64px;border:3px solid rgba(239,68,68,0.2);border-top-color:#ef4444;border-radius:50%;animation:spin 1s linear infinite;"></div>
      <h2 style="font-size:18px;font-weight:800;letter-spacing:-0.025em;margin:0;">ERRO CRÍTICO DE INICIALIZAÇÃO</h2>
      <p style="font-size:14px;color:#94a3b8;max-width:320px;margin:0;">O aplicativo encontrou um erro inesperado ao carregar.</p>
      <pre style="background:#1e293b;padding:12px;border-radius:8px;font-size:11px;color:#f87171;max-width:100%;overflow:auto;text-align:left;">${errMsg}</pre>
      <button onclick="localStorage.clear();sessionStorage.clear();location.reload();" style="background:#ef4444;color:white;border:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;">REINICIAR APP</button>
    </div>
  `;

  // Injeta a keyframe de spin no head caso nao exista
  if (!document.getElementById('gbr-emergency-spin-keyframes')) {
    const style = document.createElement('style');
    style.id = 'gbr-emergency-spin-keyframes';
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
}
