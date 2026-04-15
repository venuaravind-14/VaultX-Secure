import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isSessionExpired: false,
  
  // Vault State
  vaultToken: null,
  isVaultUnlocked: false,

  setAuth: (user, token) => set({
    user,
    accessToken: token,
    isAuthenticated: true,
    isSessionExpired: false,
    // When logging in, the vault is always locked initially
    vaultToken: null,
    isVaultUnlocked: false,
  }),

  setAccessToken: (token) => set({ accessToken: token }),
  
  setUser: (user) => set({ user }),

  // Vault Actions
  setVaultToken: (token) => set({ 
    vaultToken: token, 
    isVaultUnlocked: !!token 
  }),

  lockVault: () => set({ 
    vaultToken: null, 
    isVaultUnlocked: false 
  }),

  logout: (expired = false) => set({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isSessionExpired: expired,
    vaultToken: null,
    isVaultUnlocked: false,
  }),
}));
