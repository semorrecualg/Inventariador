
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
