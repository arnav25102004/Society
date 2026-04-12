/**
 * Push notification setup for Expo.
 * Call registerForPushNotifications() once after user logs in.
 * Expo handles FCM (Android) and APNs (iOS) delivery automatically.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

// Show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Creates Android notification channels (required for Android 8+).
 * Must be called before any notifications are sent.
 */
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('complaints', {
    name: 'Complaints',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('visitors', {
    name: 'Visitor Approvals',
    importance: Notifications.AndroidImportance.MAX, // Heads-up notification
    vibrationPattern: [0, 500, 250, 500],
    sound: 'default',
    bypassDnd: true, // Ring even in DND for visitor approvals
  });

  await Notifications.setNotificationChannelAsync('announcements', {
    name: 'Announcements',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * Request permission and register with Expo push service.
 * Sends the Expo push token to our backend so the server can target this device.
 * Call this after the user successfully logs in.
 */
export async function registerForPushNotifications(): Promise<void> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[notify] Skipping push registration — simulator/emulator');
    return;
  }

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[notify] Push notification permission denied');
    return;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const expoPushToken = tokenData.data;
    console.log('[notify] Expo push token:', expoPushToken);

    // Register the token with our backend
    await api.put('/auth/push-token', { expoPushToken });
  } catch (err) {
    // Don't crash the app if push registration fails
    console.error('[notify] Failed to register push token:', err);
  }
}
