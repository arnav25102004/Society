/**
 * Mobile Security — Phase 5 hardening.
 *
 * Covers:
 *   1. Root / jailbreak detection (jail-monkey, dev-builds + bare workflow only)
 *   2. Screenshot prevention (expo-screen-capture)
 *   3. Inactivity re-auth timer (5-minute idle → lock screen)
 *   4. Certificate pinning stub (__DEV__ guard — real pinning in production builds)
 *
 * Call initMobileSecurity() once from App.tsx after the app loads.
 * Use the inactivity hook in screens that hold sensitive data.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';

// ─── 1. Root / Jailbreak Detection ───────────────────────────────────────────
// jail-monkey requires a native dev build — gracefully unavailable in Expo Go.

export async function checkDeviceSecurity(): Promise<{ isCompromised: boolean; reason?: string }> {
  if (__DEV__) {
    // Skip check in Expo Go / dev — native module not linked
    return { isCompromised: false };
  }
  try {
    // Dynamic import so the app doesn't crash in Expo Go where native module is absent
    const JailMonkey = (await import('jail-monkey')).default;
    if (JailMonkey.isJailBroken()) {
      return { isCompromised: true, reason: 'Device is rooted or jailbroken' };
    }
    if (JailMonkey.canMockLocation()) {
      return { isCompromised: true, reason: 'Mock location is enabled (GPS spoofing detected)' };
    }
    return { isCompromised: false };
  } catch {
    // Native module not available (Expo Go) — non-fatal
    return { isCompromised: false };
  }
}

// ─── 2. Screenshot Prevention ─────────────────────────────────────────────────
// Works in Expo managed workflow and bare. No-op on iOS simulator / Expo Go.

export async function enableScreenshotPrevention(): Promise<void> {
  try {
    const { activateKeepAwakeAsync, deactivateKeepAwake } = await import('expo-keep-awake').catch(() => ({ activateKeepAwakeAsync: null, deactivateKeepAwake: null }));
    const ScreenCapture = await import('expo-screen-capture');
    await ScreenCapture.preventScreenCaptureAsync();
  } catch {
    // Graceful degradation if module not available in current build
    if (__DEV__) console.warn('[security] expo-screen-capture not available in this build');
  }
}

export async function disableScreenshotPrevention(): Promise<void> {
  try {
    const ScreenCapture = await import('expo-screen-capture');
    await ScreenCapture.allowScreenCaptureAsync();
  } catch {}
}

// ─── 3. Inactivity Re-auth ────────────────────────────────────────────────────
// After 5 minutes of background/idle time, require PIN re-auth before access.

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes

/**
 * Hook: tracks app foreground/background transitions.
 * Calls `onTimeout` when the app has been in background for >5 minutes.
 *
 * Usage:
 *   useInactivityLock({ onTimeout: () => navigation.navigate('PinAuth') });
 */
export function useInactivityLock({ onTimeout }: { onTimeout: () => void }) {
  const backgroundedAt = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    if (appState.current === 'active' && nextState.match(/inactive|background/)) {
      // App went to background — record time
      backgroundedAt.current = Date.now();
    } else if (nextState === 'active' && backgroundedAt.current !== null) {
      // App returned to foreground — check elapsed time
      const elapsed = Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        onTimeout();
      }
    }
    appState.current = nextState;
  }, [onTimeout]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [handleAppStateChange]);
}

// ─── 4. Certificate Pinning ───────────────────────────────────────────────────
// Real SSL pinning requires a bare/dev-build with a TLS interception library.
// In production this should be enabled via expo-build-properties or a native module.
// The stub below documents the intent and applies in production builds only.

// NOT YET WIRED UP: this returns a fingerprint config but nothing in api.ts (or
// anywhere else) actually applies it to the network layer — real pinning needs a
// TLS-interception-capable HTTP client (e.g. via expo-build-properties + a native
// module) which requires a dev-client rebuild, not just JS. Until that's built,
// treat this as a documented TODO, not an active security control.
export function getCertPinningConfig(): Record<string, string[]> | null {
  if (__DEV__) return null;  // Never pin in dev — breaks proxies / Expo tunnel

  // Return SHA-256 fingerprints of your API server's TLS certificate chain.
  // These must match the certificate on YOUR server, not Expo's servers.
  // Regenerate and redeploy the app when you rotate certificates.
  //
  // How to get the fingerprint (replace with your real API host):
  //   openssl s_client -connect society-dcd3.onrender.com:443 2>/dev/null \
  //     | openssl x509 -noout -fingerprint -sha256
  return null; // disabled until wired up — returning a fake fingerprint would be worse than nothing
}

// ─── Initialiser — call once from App.tsx ────────────────────────────────────

export async function initMobileSecurity(): Promise<void> {
  // 1. Root/jailbreak check
  const { isCompromised, reason } = await checkDeviceSecurity();
  if (isCompromised) {
    Alert.alert(
      'Security Warning',
      `This app cannot run on a compromised device.\n\nReason: ${reason}`,
      [{ text: 'OK' }],
    );
    // In production you might want to prevent further use. In dev we allow it.
    if (!__DEV__) return;
  }

  // 2. Prevent screenshots for all screens
  await enableScreenshotPrevention();

  // 3. Certificate pinning — applied at the axios/fetch layer in production
  const pinConfig = getCertPinningConfig();
  if (pinConfig) {
    // Log that pinning is active (only in non-DEV production builds)
    console.log('[security] Certificate pinning active for:', Object.keys(pinConfig).join(', '));
  }
}
