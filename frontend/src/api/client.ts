/**
 * API client — wraps the localStorage-backed implementation.
 * The app runs fully client-side with no backend required.
 *
 * To switch back to the Express backend, replace the import below
 * with the HTTP-based client (see git history or backend/ folder).
 */
import { api as localApi } from './localStorageApi';

export const api = localApi;
