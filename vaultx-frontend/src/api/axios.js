import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

// Access the API URL correctly for Vite
const API_URL = import.meta.env.VITE_API_URL || 'https://vaultx-secure.onrender.com/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for sending/receiving httpOnly cookies (refresh_token)
});

// Request Interceptor: Attach Access Token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    const isPublicRoute = config.url.includes('/auth/login') || config.url.includes('/auth/register') || config.url.includes('/auth/refresh') || config.url.includes('/share/') || config.url.includes('/qr/verify');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (!isPublicRoute) {
      return Promise.reject({ 
        message: 'No authorization token available',
        config 
      });
    }

    // Attach Vault Token if available
    const vaultToken = useAuthStore.getState().vaultToken;
    if (vaultToken) {
      config.headers['X-Vault-Token'] = vaultToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let refreshPromise = null;

// Response Interceptor: Handle 401 & Auto-Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle Vault Locked (403 with specific flag)
    if (error.response?.status === 403 && error.response.data?.vaultLocked) {
      // Clear expired vault token from state
      useAuthStore.getState().lockVault();
      
      // The individual page/action will handle showing the PIN modal
      // We don't toast here to avoid multiple toasts for parallel requests
      return Promise.reject(error);
    }

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
// ...
      // Prevent infinite loops if the refresh endpoint itself fails
      if (originalRequest.url.includes('/auth/refresh') || originalRequest.url.includes('/auth/login')) {
        useAuthStore.getState().logout(true);
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        // Use a lock (promise) to prevent multiple parallel refresh calls
        if (!refreshPromise) {
          refreshPromise = axios.post(
            `${API_URL}/auth/refresh`,
            {},
            { withCredentials: true }
          );
        }

        const res = await refreshPromise;
        const newAccessToken = res.data.data.access_token;
        
        // Reset promise for next time
        refreshPromise = null;

        // Update Zustand store with new token
        useAuthStore.getState().setAccessToken(newAccessToken);

        // Update the failed request with the new token and retry it
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        refreshPromise = null;
        // Refresh failed (e.g. refresh token expired or invalid)
        useAuthStore.getState().logout(true);
        return Promise.reject(refreshError);
      }
    }

    // Global Rate Limit Handler
    if (error.response?.status === 429) {
      toast.error(error.response?.data?.message || 'Too many requests. Please slow down.');
    }

    return Promise.reject(error);
  }
);
