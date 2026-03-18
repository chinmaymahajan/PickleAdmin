/**
 * Sentry initialization — imported once at the top of main.tsx.
 *
 * Replace the DSN below with your actual Sentry project DSN.
 * You can find it at: https://sentry.io → Project Settings → Client Keys (DSN)
 *
 * For local dev, leave the placeholder — Sentry silently no-ops when the DSN
 * is missing or invalid, so nothing breaks.
 */
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',

  // Adjust sample rates for your traffic volume:
  // 1.0 = capture 100% of transactions (good for low-traffic apps)
  // Lower this in high-traffic production (e.g. 0.2 = 20%)
  tracesSampleRate: 1.0,

  // Session replay — captures what the user did before an error
  replaysSessionSampleRate: 0.1,  // 10% of normal sessions
  replaysOnErrorSampleRate: 1.0,  // 100% of sessions with errors

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
    Sentry.breadcrumbsIntegration({
      console: true,   // Captures our console.log/warn/error as breadcrumbs
      dom: true,        // Captures click events
      fetch: true,      // Captures fetch/XHR calls
    }),
  ],

  // Environment tag — helps filter in Sentry dashboard
  environment: import.meta.env.MODE || 'development',

  // Only send events in production (flip to true to test locally)
  enabled: import.meta.env.PROD,

  // Enable the Sentry.logger API (structured logs)
  _experiments: {
    enableLogs: true,
  },
});

export default Sentry;
