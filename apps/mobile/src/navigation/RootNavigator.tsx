import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/authStore';
import { navTheme, Colors } from '../theme';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  requiresPinAuth?: boolean;
  onPinSuccess?: () => void;
}

export function RootNavigator({ requiresPinAuth = false, onPinSuccess }: RootNavigatorProps) {
  const { isLoading, isLoggedIn, activeMembership, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // Logged in AND has an approved society → Main app
  // Logged in but no approved society → Still in Auth flow (SocietySelect / PendingApproval)
  const showApp = isLoggedIn && activeMembership?.status === 'approved';

  // Phase 5: inactivity lock overlay — shown over the app after 5 min background
  if (showApp && requiresPinAuth) {
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.lockTitle}>Session Locked</Text>
        <Text style={styles.lockSubtitle}>You were away for a while. Verify your identity to continue.</Text>
        {/* In a real app this would render the PinAuthScreen inline.
            For now it navigates back to OTP flow via logout, or you can wire up
            a dedicated PinAuthModal here when the PIN re-auth screen is built. */}
        <TouchableOpacity style={styles.unlockButton} onPress={onPinSuccess}>
          <Text style={styles.unlockText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showApp ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  lockSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  unlockButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
  },
  unlockText: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
});
