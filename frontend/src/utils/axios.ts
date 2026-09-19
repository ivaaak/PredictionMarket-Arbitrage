import axios from 'axios';

// Relative base URL so requests go through the Vite dev proxy (see
// vite.config.ts) and through whatever reverse proxy serves the build. An
// absolute localhost URL would bypass the proxy and be blocked by CORS.
const apiClient = axios.create({
  baseURL: '/api',
});

export default apiClient;
