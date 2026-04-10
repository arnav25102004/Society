import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthStackParamList } from '../../types';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../services/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'PendingApproval'>;

export function PendingApprovalScreen({ route }: Props) {
  const { societyName, flatNumber } = route.params;
  const { logout } = useAuthStore();

  // Pulsing animation for the waiting icon
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  async function handleLogout() {
    try {
      const token = await import('expo-secure-store').then((m) => m.getItemAsync('sh_refresh_token'));
      if (token) await authApi.logout(token);
    } catch {}
    logout();
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        {/* Animated waiting icon */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulse }] }]}>
          <MaterialCommunityIcons name="clock-time-eight-outline" size={56} color={Colors.primary} />
        </Animated.View>

        <Text style={styles.title}>Request submitted!</Text>
        <Text style={styles.subtitle}>
          Your request to join{'\n'}
          <Text style={styles.bold}>{societyName}</Text>
          {'\n'}as flat <Text style={styles.bold}>{flatNumber}</Text> is pending.
        </Text>

        {/* What happens next */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What happens next</Text>
          {[
            { icon: 'bell-ring-outline', text: "Your committee will review and approve you" },
            { icon: 'cellphone', text: "You'll get a push notification once approved" },
            { icon: 'home-city', text: "You can then access all society features" },
          ].map((item, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name={item.icon as any} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.stepText}>{item.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipText}>
            💡 Ask your society secretary to approve you in the SocietyHub committee panel.
          </Text>
        </View>
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <MaterialCommunityIcons name="logout" size={16} color={Colors.textSecondary} />
        <Text style={styles.logoutText}>Use a different number</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },

  iconWrap: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },

  title: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  bold: { fontWeight: '800', color: Colors.textPrimary },

  card: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  cardTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },

  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepIcon: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: { flex: 1, fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20 },

  tipBox: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: '100%',
  },
  tipText: { fontSize: FontSizes.sm, color: '#7B5800', lineHeight: 20 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  logoutText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
});
