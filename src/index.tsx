import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

console.log('[GBR-Index] Ponto de entrada carregado - v24.50.2');

const container = document.getElementById('root');
if (container) {
  try {
    const root = createRoot(container);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    console.log('[GBR-Index] React Render disparado');
  } catch (err) {
    console.error('[GBR-Index] Erro crítico no render:', err);
    container.innerHTML = `<div style="padding: 20px; background: #0f172a; color: #10b981; font-family: sans-serif;">
      <h1 style="color: #ef4444">FALHA DE KERNEL</h1>
      <p>Erro ao montar interface: ${err}</p>
    </div>`;
  }
}
