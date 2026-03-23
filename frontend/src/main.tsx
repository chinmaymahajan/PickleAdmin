// Sentry must be initialized before anything else
import './sentry';

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#475569', margin: '8px 0 16px' }}>An unexpected error occurred. You can try again or reload the page.</p>
          <pre style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', overflow: 'auto', color: '#64748b' }}>{error?.toString()}</pre>
          <button onClick={resetError} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      )}
      showDialog
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
