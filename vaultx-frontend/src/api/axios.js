import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'https://vaultx-secure.onrender.com/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, 
});

// Request Interceptor: Attach Access Token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    const isPublicRoute = 
      config.url.includes('/auth/login') || 
      config.url.includes('/auth/register') || 
      config.url.includes('/auth/refresh') || 
      config.url.includes('/share/') || 
      config.url.includes('/qr/verify');
    
    // Attach token if exists
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (!isPublicRoute) {
      // Don't reject yet, let the backend handle 401
      // Rejection here can cause race conditions during app initialization
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let refreshPromise = null;

// Response Interceptor: Handle 401 (Auto-Refresh) & Errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      
      // Prevent infinite loops on refresh endpoints
      if (originalRequest.url.includes('/auth/refresh') || originalRequest.url.includes('/auth/login')) {
        useAuthStore.getState().logout(true);
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios.post(
            `${API_URL}/auth/refresh`,
            {},
            { withCredentials: true }
          );
        }

        const res = await refreshPromise;
        const newAccessToken = res.data.data.access_token;
        
        refreshPromise = null;
        useAuthStore.getState().setAccessToken(newAccessToken);

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        refreshPromise = null;
        useAuthStore.getState().logout(true);
        return Promise.reject(refreshError);
      }
    }

    // Global Rate Limit
    if (error.response?.status === 429) {
      toast.error(error.response?.data?.message || 'Too many requests');
    }

    return Promise.reject(error);
  }
);
