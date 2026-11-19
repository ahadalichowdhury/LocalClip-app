import React from 'react';
import ReactDOM from 'react-dom/client';
import './lib/nativeBridge';
import App from './App';
import './index.css';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
