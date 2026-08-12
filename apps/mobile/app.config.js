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

if (IS_PROD && !process.env.API_URL) {
  throw new Error(
    'API_URL is not set. Set it as an EAS secret (eas secret:create --name API_URL --value ...) before building for production.'
  );
}

const API_URL = process.env.API_URL ?? 'http://localhost:3002/api/v1';

const WS_URL = API_URL.replace('/api/v1', '').replace('https://', 'wss://').replace('http://', 'ws://');

module.exports = {
  expo: {
    name: 'Urban Hub',
    slug: 'societyhub',
    version: '3.0.0',
    sdkVersion: '54.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    icon: './assets/images/icon.png',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0D1836',
    },
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
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0D1836',
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
    web: {
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      '@react-native-firebase/app',
      'expo-secure-store',
      'expo-font',
      [
        'expo-build-properties',
        {
          android: {
            // Google Play requires targetSdkVersion 36 (Android 16) for new/updated
            // app submissions from August 31, 2026 onward. A plain top-level
            // android.targetSdkVersion in this config is NOT read by modern Expo —
            // it must go through this plugin, which patches the generated
            // android/build.gradle at prebuild time.
            compileSdkVersion: 36,
            targetSdkVersion: 36,
          },
        },
      ],
    ],
    extra: {
      apiUrl: API_URL,
      wsUrl: WS_URL,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? 'a1382355-551b-49cd-98a6-eb5972024132',
      },
    },
  },
};
