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
        <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666' }}>{error?.toString()}</p>
          <button onClick={resetError} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
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
