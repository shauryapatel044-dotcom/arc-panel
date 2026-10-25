/* ════════════════════════════════════════════════════════════════
   src/hooks/useAuth.ts — Zustand auth store
   Manages JWT tokens, user state, login/logout, token refresh
════════════════════════════════════════════════════════════════ */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi } from '@/lib/api';
import type { User, LoginRequest, LoginResponse, AuthTokens } from '@/types';

/* ── State shape ─────────────────────────────────────────────────── */
interface AuthState {
  user:         User | null;
  accessToken:  string | null;
  refreshToken: string | null;
  isLoading:    boolean;
  isHydrated:   boolean;

  /* Actions */
  login:              (credentials: LoginRequest) => Promise<LoginResponse>;
  logout:             () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  updateUser:         (partial: Partial<User>) => void;
  setHydrated:        () => void;
}

/* ── Store ───────────────────────────────────────────────────────── */
export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user:         null,
      accessToken:  null,
      refreshToken: null,
      isLoading:    false,
      isHydrated:   false,

      /* ── Login ─────────────────────────────────────────────────── */
      login: async (credentials: LoginRequest): Promise<LoginResponse> => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login(credentials);
          const response: LoginResponse = data;

          /* 2FA pending — don't store tokens yet */
          if (response.requires2FA) {
            set({ isLoading: false });
            return response;
          }

          /* Successful login — store tokens */
          if (response.tokens && response.user) {
            const { tokens, user } = response;
            persistTokensToStorage(tokens);
            set({
              user,
              accessToken:  tokens.accessToken,
              refreshToken: tokens.refreshToken,
              isLoading:    false,
            });
          }

          return response;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      /* ── Logout ────────────────────────────────────────────────── */
      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          /* Ignore server errors on logout — clear state regardless */
        } finally {
          clearStoredTokens();
          set({ user: null, accessToken: null, refreshToken: null });
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      },

      /* ── Refresh access token ──────────────────────────────────── */
      refreshAccessToken: async (): Promise<boolean> => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const { data } = await authApi.refresh({ refreshToken });
          const tokens: AuthTokens = data;
          persistTokensToStorage(tokens);
          set({
            accessToken:  tokens.accessToken,
            refreshToken: tokens.refreshToken,
          });
          return true;
        } catch {
          clearStoredTokens();
          set({ user: null, accessToken: null, refreshToken: null });
          return false;
        }
      },

      /* ── Update local user record ──────────────────────────────── */
      updateUser: (partial: Partial<User>) => {
        const { user } = get();
        if (!user) return;
        const updated = { ...user, ...partial };
        set({ user: updated });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('arc_user', JSON.stringify(updated));
        }
      },

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name:    'arc-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : createNoopStorage()
      ),
      /* Only persist what we need across page reloads */
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        /* Sync tokens with raw localStorage keys that the Axios interceptor reads */
        if (typeof window !== 'undefined' && state) {
          const existingAccess = window.localStorage.getItem('arc_access_token');
          const existingRefresh = window.localStorage.getItem('arc_refresh_token');
          if (existingAccess && existingAccess !== state.accessToken) {
            state.accessToken = existingAccess;
            if (existingRefresh) state.refreshToken = existingRefresh;
          } else if (state.accessToken) {
            window.localStorage.setItem('arc_access_token',  state.accessToken);
            window.localStorage.setItem('arc_refresh_token', state.refreshToken ?? '');
          }
        }
        state?.setHydrated();
      },
    },
  ),
);

/* ── Helper functions ─────────────────────────────────────────────── */

/** Persist tokens to raw localStorage keys (read by Axios interceptor) and cookies */
function persistTokensToStorage(tokens: AuthTokens) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('arc_access_token',  tokens.accessToken);
  window.localStorage.setItem('arc_refresh_token', tokens.refreshToken);
  try {
    document.cookie = `arc_access_token=${tokens.accessToken}; path=/; max-age=604800; SameSite=Lax`;
  } catch {
    // Ignore cookie errors
  }
}

/** Remove all token keys */
function clearStoredTokens() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('arc_access_token');
  window.localStorage.removeItem('arc_refresh_token');
  window.localStorage.removeItem('arc_user');
  window.localStorage.removeItem('arc-auth');
  try {
    document.cookie = 'arc_access_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  } catch {
    // Ignore cookie errors
  }
}

/** Server-safe noop storage */
function createNoopStorage() {
  return {
    getItem:    (_name: string) => null,
    setItem:    (_name: string, _value: string) => {},
    removeItem: (_name: string) => {},
  };
}

/* ── Derived selectors ───────────────────────────────────────────── */

/** Returns true when the user is authenticated */
export const selectIsAuthed  = (s: AuthState) => !!s.user && !!s.accessToken;
/** Returns true when the user has admin role */
export const selectIsAdmin   = (s: AuthState) => s.user?.role === 'admin';
/** Raw user object */
export const selectUser      = (s: AuthState) => s.user;
/** Access token string */
export const selectToken     = (s: AuthState) => s.accessToken;
