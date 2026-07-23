
import React from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App';
import { HashRouter } from 'react-router-dom';
import AppRouter from './router/AppRouter';
import { logger } from './utils/logger';
import ErrorBoundary from './components/ErrorBoundary';
import { registerSW } from 'virtual:pwa-register';

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
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

logger.info("App mounting...");
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
