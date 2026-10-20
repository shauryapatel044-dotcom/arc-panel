/* ════════════════════════════════════════════════════════════════
   src/lib/api.ts — Axios instance for Arc Panel backend
════════════════════════════════════════════════════════════════ */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const BASE_URL =
  typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001');

/** Central Axios instance — import this everywhere instead of raw axios */
export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept:         'application/json',
  },
  withCredentials: true, // send httpOnly cookies when same-origin
});

/* ── Request interceptor — attach Bearer token & handle FormData ── */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Let the browser automatically generate multipart/form-data with boundary for FormData
    if (
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData &&
      config.headers
    ) {
      delete config.headers['Content-Type'];
    }

    // Prefer localStorage token (set by useAuth on login), fallback to Zustand arc-auth
    let token =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('arc_access_token')
        : null;

    if (!token && typeof window !== 'undefined') {
      try {
        const rawAuth = window.localStorage.getItem('arc-auth');
        if (rawAuth) {
          const parsed = JSON.parse(rawAuth);
          token = parsed?.state?.accessToken ?? null;
        }
      } catch {
        // Ignore parse error
      }
    }

    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/* ── Response interceptor — handle 401 / token refresh ────────── */
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject:  (reason?: unknown) => void;
}> = [];

function processQueue(error: Error | null, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else       resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    /* 401 → attempt refresh once, then redirect to login */
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        /* Queue subsequent 401s until refresh completes */
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('arc_refresh_token')
          : null;

      if (!refreshToken) {
        isRefreshing = false;
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<{
          accessToken:  string;
          refreshToken: string;
        }>(`${BASE_URL}/api/auth/refresh`, { refreshToken });

        const { accessToken, refreshToken: newRefresh } = data;
        window.localStorage.setItem('arc_access_token',  accessToken);
        window.localStorage.setItem('arc_refresh_token', newRefresh);

        // Keep Zustand persist storage (arc-auth) synchronized with refreshed tokens
        try {
          const rawAuth = window.localStorage.getItem('arc-auth');
          if (rawAuth) {
            const parsed = JSON.parse(rawAuth);
            if (parsed && parsed.state) {
              parsed.state.accessToken = accessToken;
              parsed.state.refreshToken = newRefresh;
              window.localStorage.setItem('arc-auth', JSON.stringify(parsed));
            }
          }
        } catch {
          // Ignore JSON sync errors
        }

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
        }

        processQueue(null, accessToken);
        isRefreshing = false;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        isRefreshing = false;
        clearAuthAndRedirect();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

/** Clear stored tokens and navigate to login */
function clearAuthAndRedirect() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('arc_access_token');
  window.localStorage.removeItem('arc_refresh_token');
  window.localStorage.removeItem('arc_user');
  window.localStorage.removeItem('arc-auth');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

/* ── Typed API helpers ─────────────────────────────────────────── */

/** Auth endpoints */
export const authApi = {
  login:          (body: unknown) => api.post('/auth/login',          body),
  register:       (body: unknown) => api.post('/auth/register',       body),
  refresh:        (body: unknown) => api.post('/auth/refresh',        body),
  logout:         ()              => api.post('/auth/logout'),
  changePassword: (body: unknown) => api.post('/auth/change-password', body),
  setup2FA:       ()              => api.post('/auth/2fa/setup'),
  verify2FA:      (body: unknown) => api.post('/auth/2fa/verify',     body),
  disable2FA:     (body: unknown) => api.post('/auth/2fa/disable',    body),
};

/** User / profile endpoints */
export const userApi = {
  getProfile:    ()              => api.get('/users/me'),
  updateProfile: (body: unknown) => api.patch('/users/me',           body),
  listUsers:     (params?: Record<string, unknown>) => api.get('/admin/users', { params }),
  getUser:       (id: string)   => api.get(`/admin/users/${id}`),
  updateUser:    (id: string, body: unknown) => api.patch(`/admin/users/${id}`, body),
  deleteUser:    (id: string)   => api.delete(`/admin/users/${id}`),
  suspendUser:   (id: string)   => api.post(`/admin/users/${id}/suspend`),
  unsuspendUser: (id: string)   => api.post(`/admin/users/${id}/unsuspend`),
};

/** Server endpoints */
export const serverApi = {
  listMine:        ()              => api.get('/servers'),
  listEggs:        ()              => api.get('/servers/eggs'),
  listAll:         (params?: Record<string, unknown>) => api.get('/admin/servers', { params }),
  getServer:       (id: string)   => api.get(`/servers/${id}`),
  createServer:    (body: unknown) => api.post('/admin/servers',       body),
  updateServer:    (id: string, body: unknown) => api.patch(`/servers/${id}`, body),
  deleteServer:    (id: string)   => api.delete(`/servers/${id}`),
  suspendServer:   (id: string)   => api.post(`/admin/servers/${id}/suspend`),
  power:           (id: string, action: 'start'|'stop'|'restart'|'kill') =>
                     api.post(`/servers/${id}/power`, { action }),
  reinstallServer: (id: string, body: { version?: string; eggSlug?: string; wipeFiles?: boolean }) =>
                     api.post(`/servers/${id}/reinstall`, body),
};

/** File endpoints */
export const fileApi = {
  list:     (serverId: string, path = '/')     => api.get(`/servers/${serverId}/files`,          { params: { path, _t: Date.now() } }),
  read:     (serverId: string, path: string)   => api.get(`/servers/${serverId}/files/content`,  { params: { path, _t: Date.now() } }),
  write:    (serverId: string, path: string, content: string) =>
              api.put(`/servers/${serverId}/files/content`, { path, content }),
  rename:   (serverId: string, from: string, to: string) =>
              api.patch(`/servers/${serverId}/files/rename`, { from, to }),
  delete:   (serverId: string, paths: string[]) =>
              api.delete(`/servers/${serverId}/files`, { data: { files: paths } }),
  download: (serverId: string, path: string)   =>
              `${BASE_URL}/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`,
  upload:   (serverId: string, path: string, formData: FormData) =>
              api.post(`/servers/${serverId}/files/upload?path=${encodeURIComponent(path)}`, formData),
  extract:  (serverId: string, archivePath: string, targetDir: string) =>
              api.post(`/servers/${serverId}/files/decompress`, { file: archivePath, destination: targetDir }),
};

/** Backup endpoints */
export const backupApi = {
  list:     (serverId: string) => api.get(`/servers/${serverId}/backups`),
  create:   (serverId: string, name: string) => api.post(`/servers/${serverId}/backups`, { name }),
  restore:  (serverId: string, backupId: string) =>
              api.post(`/servers/${serverId}/backups/${backupId}/restore`),
  delete:   (serverId: string, backupId: string) =>
              api.delete(`/servers/${serverId}/backups/${backupId}`),
  download: (serverId: string, backupId: string) =>
              `${BASE_URL}/api/servers/${serverId}/backups/${backupId}/download`,
};

/** Node endpoints (admin) */
export const nodeApi = {
  list:       ()                           => api.get('/admin/nodes'),
  get:        (id: string)                 => api.get(`/admin/nodes/${id}`),
  create:     (body: unknown)              => api.post('/admin/nodes', body),
  update:     (id: string, body: unknown)  => api.patch(`/admin/nodes/${id}`, body),
  delete:     (id: string)                 => api.delete(`/admin/nodes/${id}`),
  getStats:   (id: string)                 => api.get(`/admin/nodes/${id}/stats`),
};

/** Admin dashboard */
export const adminApi = {
  getStats: () => api.get('/admin/stats'),
};

/** 1-Click Plugin & Mod endpoints */
export const pluginApi = {
  getCatalog:   (serverId: string) => api.get(`/servers/${serverId}/plugins/catalog`),
  getInstalled: (serverId: string) => api.get(`/servers/${serverId}/plugins/installed`),
  search:       (serverId: string, query: string, type: 'plugin' | 'mod' = 'plugin') =>
                  api.get(`/servers/${serverId}/plugins/search`, { params: { query, type } }),
  install:      (serverId: string, body: { downloadUrl: string; filename?: string; targetDir?: 'plugins' | 'mods' }) =>
                  api.post(`/servers/${serverId}/plugins/install`, body),
  uninstall:    (serverId: string, filename: string, targetDir: 'plugins' | 'mods' = 'plugins') =>
                  api.delete(`/servers/${serverId}/plugins/uninstall`, { params: { filename, targetDir } }),
};

/** On-Demand Server Database endpoints */
export const databaseApi = {
  list:           (serverId: string) => api.get(`/servers/${serverId}/databases`),
  create:         (serverId: string, name: string) => api.post(`/servers/${serverId}/databases`, { name }),
  delete:         (serverId: string, dbId: string) => api.delete(`/servers/${serverId}/databases/${dbId}`),
  rotatePassword: (serverId: string, dbId: string) => api.post(`/servers/${serverId}/databases/${dbId}/rotate-password`),
};

/** Server Collaborators / Subusers endpoints */
export const subuserApi = {
  list:   (serverId: string) => api.get(`/servers/${serverId}/subusers`),
  add:    (serverId: string, body: { emailOrUsername: string; permissions: string[] }) =>
            api.post(`/servers/${serverId}/subusers`, body),
  update: (serverId: string, subId: string, permissions: string[]) =>
            api.patch(`/servers/${serverId}/subusers/${subId}`, { permissions }),
  remove: (serverId: string, subId: string) => api.delete(`/servers/${serverId}/subusers/${subId}`),
};

/** Discord Webhook & Audit Log endpoints */
export const webhookApi = {
  listWebhooks: (serverId: string) => api.get(`/servers/${serverId}/webhooks`),
  createWebhook:(serverId: string, body: { name: string; url: string; events: string[] }) =>
                  api.post(`/servers/${serverId}/webhooks`, body),
  deleteWebhook:(serverId: string, whId: string) => api.delete(`/servers/${serverId}/webhooks/${whId}`),
  testWebhook:  (serverId: string, whId: string) => api.post(`/servers/${serverId}/webhooks/${whId}/test`),
  getAuditLogs: (serverId: string, limit = 50) => api.get(`/servers/${serverId}/audit-logs`, { params: { limit } }),
};

/** Port & Allocation Manager endpoints */
export const networkApi = {
  list:        (serverId: string) => api.get(`/servers/${serverId}/network`),
  assign:      (serverId: string, body?: { allocationId?: string; notes?: string }) =>
                 api.post(`/servers/${serverId}/network/assign`, body || {}),
  unassign:    (serverId: string, allocId: string) => api.delete(`/servers/${serverId}/network/${allocId}`),
  setPrimary:  (serverId: string, allocId: string) => api.patch(`/servers/${serverId}/network/${allocId}/primary`),
  updateNotes: (serverId: string, allocId: string, notes: string) =>
                 api.patch(`/servers/${serverId}/network/${allocId}/notes`, { notes }),
};

/** Custom Domain & Connection Resolution endpoints */
export const domainApi = {
  get:         (serverId: string) => api.get(`/servers/${serverId}/domains`),
  add:         (serverId: string, body: { domain: string; recordType?: string }) =>
                 api.post(`/servers/${serverId}/domains`, body),
  verify:      (serverId: string, domainId: string) =>
                 api.post(`/servers/${serverId}/domains/${domainId}/verify`),
  delete:      (serverId: string, domainId: string) =>
                 api.delete(`/servers/${serverId}/domains/${domainId}`),
};

/** GitHub Repository Integration endpoints */
export const gitApi = {
  get:         (serverId: string) => api.get(`/servers/${serverId}/git`),
  test:        (serverId: string, body: { repo: string; token: string }) =>
                 api.post(`/servers/${serverId}/git/test`, body),
  branches:    (serverId: string, body: { repo: string; token?: string }) =>
                 api.post(`/servers/${serverId}/git/branches`, body),
  connect:     (serverId: string, body: { repo: string; token: string; branch?: string; targetDir?: string; autoDeploy?: boolean }) =>
                 api.post(`/servers/${serverId}/git/connect`, body),
  pull:        (serverId: string) => api.post(`/servers/${serverId}/git/pull`),
  disconnect:  (serverId: string) => api.delete(`/servers/${serverId}/git`),
};

export default api;
