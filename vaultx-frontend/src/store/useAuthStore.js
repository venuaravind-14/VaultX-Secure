import { create } from 'zustand';

/**
 * useAuthStore — Unified authentication state management.
 * Simplified version: No Vault PIN/Token state.
 */
export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isSessionExpired: false,
  
  setAuth: (user, token) => set({
    user,
    accessToken: token,
    isAuthenticated: true,
    isSessionExpired: false,
  }),

  setAccessToken: (token) => set({ accessToken: token }),
  
  setUser: (user) => set({ user }),

  logout: (expired = false) => set({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isSessionExpired: expired,
  }),
}));
