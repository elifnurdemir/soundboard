import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Forward renderer crashes to the same Discord-webhook reporting main process uses.
window.addEventListener('error', (e) => {
  window.electronAPI?.reportRendererError(e.message, e.error?.stack || '');
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
  window.electronAPI?.reportRendererError(reason.message, reason.stack || '');
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
