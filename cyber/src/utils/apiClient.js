/**
 * Centralized fetch wrapper for authenticated requests to the backend.
 * - Injects X-CSRFToken if the csrftoken cookie is present
 * - Sends HttpOnly JWT cookies automatically via credentials: 'include'
 * - Returns parsed JSON/Response on success; throws on error with message from server
 * - Auto-logs out on 401
 */
let isLoggingOut = false;
let isRefreshing = false;
let refreshSubscribers = [];

function onTokenRefreshed(success) {
  refreshSubscribers.forEach((resolve) => resolve(success));
  refreshSubscribers = [];
}

import { handleMockRequest } from './mockBackend';

const isStaticShowcase = () => {
  if (import.meta.env.VITE_API_URL) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('github.io') || host.includes('pages.dev') || host.includes('vercel.app') || (host !== 'localhost' && host !== '127.0.0.1');
};

export default async function apiClient(endpoint, options = {}) {
  // Intercept requests in-memory on static GitHub Pages to prevent 404/405 network errors
  if (isStaticShowcase() && endpoint.includes('/api/')) {
    return handleMockRequest(endpoint, options);
  }

  const headers = { ...options.headers };

  // Inject CSRF token for mutation safety (belt-and-suspenders)
  const csrfMatch = document.cookie.match(/(^| )csrftoken=([^;]+)/);
  if (csrfMatch) {
    headers['X-CSRFToken'] = csrfMatch[2];
  }

  // Default to JSON content-type unless uploading FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `${apiBase}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch (netErr) {
    if (endpoint.includes('/api/')) {
      console.warn('[apiClient] Fetch failed, routing to mock provider:', netErr);
      return handleMockRequest(endpoint, options);
    }
    throw netErr;
  }

  // Debug logging
  console.debug(`[apiClient] ${options.method || 'GET'} ${endpoint}`);

  // Auto-refresh on 401 before considering logout
  const isAuthEndpoint = endpoint.includes('/auth/login/') || endpoint.includes('/auth/refresh/');
  if (response.status === 401 && !isAuthEndpoint && !options._retry) {
    if (isRefreshing) {
      // Queue request while a refresh is in-flight
      const success = await new Promise((resolve) => refreshSubscribers.push(resolve));
      if (success) {
        return apiClient(endpoint, { ...options, _retry: true });
      }
    } else {
      isRefreshing = true;
      try {
        const refreshRes = await fetch('/api/v1/auth/refresh/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (refreshRes.ok) {
          isRefreshing = false;
          onTokenRefreshed(true);
          // Retry the failed request with renewed cookie
          return apiClient(endpoint, { ...options, _retry: true });
        } else {
          isRefreshing = false;
          onTokenRefreshed(false);
        }
      } catch (err) {
        isRefreshing = false;
        onTokenRefreshed(false);
      }
    }

    // If refresh failed and endpoint wasn't public auth check, log out gracefully
    if (!isLoggingOut && !endpoint.includes('/auth/')) {
      isLoggingOut = true;
      fetch('/api/v1/auth/logout/', { method: 'DELETE', credentials: 'include' })
        .finally(() => {
          localStorage.removeItem('cyber_user');
          if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
            window.location.href = '/';
          }
          isLoggingOut = false;
        });
    }
  }

  return response;
}

// Proactive session keep-alive every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(async () => {
    try {
      if (localStorage.getItem('cyber_user')) {
        await fetch('/api/v1/auth/refresh/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // Quiet background check
    }
  }, 10 * 60 * 1000);
}

apiClient.get = async (endpoint, options = {}) => {
  const res = await apiClient(endpoint, { ...options, method: 'GET' });
  if (options.responseType === 'blob') {
    return { data: await res.blob(), status: res.status };
  }
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};

apiClient.post = async (endpoint, data, options = {}) => {
  const res = await apiClient(endpoint, {
    ...options,
    method: 'POST',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  const resData = await res.json().catch(() => ({}));
  return { data: resData, status: res.status };
};

apiClient.put = async (endpoint, data, options = {}) => {
  const res = await apiClient(endpoint, {
    ...options,
    method: 'PUT',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  const resData = await res.json().catch(() => ({}));
  return { data: resData, status: res.status };
};

apiClient.patch = async (endpoint, data, options = {}) => {
  const res = await apiClient(endpoint, {
    ...options,
    method: 'PATCH',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  const resData = await res.json().catch(() => ({}));
  return { data: resData, status: res.status };
};

apiClient.delete = async (endpoint, options = {}) => {
  const res = await apiClient(endpoint, { ...options, method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};
