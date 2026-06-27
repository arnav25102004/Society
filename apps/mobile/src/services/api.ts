import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3002/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach access token ─────────────────────────────────
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('sh_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor: auto-refresh on 401 ───────────────────────────────
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue requests while refresh is in flight
        return new Promise((resolve) => {
          refreshQueue.push((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('sh_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, { refreshToken });
        const newAccessToken = data.accessToken;

        await SecureStore.setItemAsync('sh_access_token', newAccessToken);
        refreshQueue.forEach((cb) => cb(newAccessToken));
        refreshQueue = [];

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        // Refresh failed — clear tokens (force re-login)
        await SecureStore.deleteItemAsync('sh_access_token');
        await SecureStore.deleteItemAsync('sh_refresh_token');
        // AuthStore will detect missing tokens on next app start
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Typed API helpers ────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone: string, otp: string, deviceId?: string) =>
    api.post('/auth/verify-otp', { phone, otp, deviceId }),
  refreshToken: (refreshToken: string) => api.post('/auth/refresh-token', { refreshToken }),
  logout: (refreshToken: string) => api.delete('/auth/logout', { data: { refreshToken } }),
  me: () => api.get('/auth/me'),
};

export const societiesApi = {
  search: (q: string, city?: string) =>
    api.get('/societies/search', { params: { q, city } }),
  create: (data: object) => api.post('/societies', data),
  join: (data: object) => api.post('/societies/join', data),
  get: (id: string) => api.get(`/societies/${id}`),
  getMembers: (id: string) => api.get(`/societies/${id}/members`),
  approveMember: (societyId: string, memberId: string) =>
    api.put(`/societies/${societyId}/members/${memberId}/approve`),
};
