import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isSessionExpired: false, // For triggering the expired session UI/modal

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
    isSessionExpired: expired, // If true, the frontend will show "Session expired, please login again"
  }),
}));
