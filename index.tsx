
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log("App mounting...");
const root = createRoot(rootElement);

root.render(
  <App />
);
console.log("App render triggered.");
