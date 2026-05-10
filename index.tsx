
// TESTE DE VIDA (Bypass) - Solicitado para validar carregamento no Android
if (typeof document !== 'undefined' && document.body) {
  const statusDiv = document.createElement('div');
  statusDiv.id = 'boot-status-pixel';
  statusDiv.style.position = 'fixed';
  statusDiv.style.top = '0';
  statusDiv.style.left = '0';
  statusDiv.style.width = '10px';
  statusDiv.style.height = '10px';
  statusDiv.style.background = 'red';
  statusDiv.style.zIndex = '10000';
  document.body.appendChild(statusDiv);
  console.log(">>> [BOOT] Teste de vida injetado.");
  // window.alert("JS EXECUTANDO: Index.tsx carregado!");
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
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
    console.log('App pronto para uso offline.');
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log("App mounting...");
const root = createRoot(rootElement);

// Sinaliza que o app iniciou para remover o loader do index.html
if (typeof window !== 'undefined') {
  (window as Window & { appStarted?: boolean }).appStarted = true;
}

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
console.log("App render triggered.");
