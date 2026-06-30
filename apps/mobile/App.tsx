import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { registerForPushNotifications } from './src/services/notifications';
import { initMobileSecurity, useInactivityLock } from './src/utils/mobileSecurity';

export default function App() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();
  const [requiresPinAuth, setRequiresPinAuth] = useState(false);

  // Phase 5: initialise security measures (screenshot prevention, jailbreak check)
  useEffect(() => {
    initMobileSecurity();
  }, []);

  // Phase 5: inactivity lock — after 5 minutes in background, require PIN re-auth
  useInactivityLock({
    onTimeout: () => {
      if (isLoggedIn) {
        setRequiresPinAuth(true);
      }
    },
  });

  // Register push token whenever the user logs in (or was already logged in)
  useEffect(() => {
    if (isLoggedIn) {
      registerForPushNotifications();
      setRequiresPinAuth(false);  // Clear lock on fresh login
    }
  }, [isLoggedIn]);

  // Handle notifications received while app is in foreground
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[notify] Received:', notification);
    });

    // Handle tap on notification (app in background or killed)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      console.log('[notify] Tapped:', data?.screen, data);
      // TODO: navigate to the correct screen based on data.screen
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      {/* requiresPinAuth prop lets RootNavigator show a PIN gate before home screens */}
      <RootNavigator requiresPinAuth={requiresPinAuth} onPinSuccess={() => setRequiresPinAuth(false)} />
    </SafeAreaProvider>
  );
}
