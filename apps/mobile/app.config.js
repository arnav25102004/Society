/**
 * app.config.js — dynamic Expo config
 * Reads API_URL from environment so you don't have to hardcode your laptop IP.
 *
 * Dev:         API_URL is your local laptop IP  (set in .env.local)
 * Production:  API_URL is your Railway/Render URL (set via EAS secrets)
 */

// Load .env.local for local dev overrides (not committed to git)
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '.env.local') });
} catch {}

const IS_PROD = process.env.NODE_ENV === 'production' || process.env.EAS_BUILD === '1';

const API_URL = process.env.API_URL
  ?? (IS_PROD
    ? 'https://YOUR-APP.up.railway.app/api/v1'
    : 'http://localhost:3002/api/v1');

const WS_URL = API_URL.replace('/api/v1', '').replace('https://', 'wss://').replace('http://', 'ws://');

module.exports = {
  expo: {
    name: 'SocietyHub',
    slug: 'societyhub',
    version: '1.0.0',
    sdkVersion: '54.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.societyhub.app',
      infoPlist: {
        NSCameraUsageDescription: 'Used to capture visitor photos at the gate.',
        NSPhotoLibraryUsageDescription: 'Used to attach photos to complaints.',
      },
    },
    android: {
      package: 'com.societyhub.app',
      adaptiveIcon: {
        backgroundColor: '#1A73E8',
      },
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
      ],
    },
    plugins: ['expo-secure-store', 'expo-font'],
    extra: {
      apiUrl: API_URL,
      wsUrl: WS_URL,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '',
      },
    },
  },
};
