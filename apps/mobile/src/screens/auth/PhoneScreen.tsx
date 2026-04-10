import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { AuthStackParamList } from '../../types';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { authApi } from '../../services/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'Phone'>;

export function PhoneScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isValid = /^[6-9]\d{9}$/.test(phone);

  async function handleSendOtp() {
    if (!isValid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Invalid number', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setLoading(true);
    try {
      await authApi.sendOtp(phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('OTP', { phone });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err?.response?.data?.message ?? 'Failed to send OTP. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>SocietyHub</Text>
          <Text style={styles.tagline}>Your society, smarter.</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>Enter your mobile number to get started</Text>

          {/* Phone input */}
          <View style={styles.phoneRow}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>🇮🇳 +91</Text>
            </View>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="9876543210"
              placeholderTextColor={Colors.textDisabled}
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
              autoFocus
            />
          </View>

          {phone.length > 0 && phone.length < 10 && (
            <Text style={styles.hint}>Enter remaining {10 - phone.length} digits</Text>
          )}

          {/* CTA Button */}
          <Pressable
            style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={!isValid || loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Sending OTP…' : 'Get OTP  →'}</Text>
          </Pressable>

          <Text style={styles.terms}>
            By continuing, you agree to our{' '}
            <Text style={styles.link}>Terms of Service</Text> and{' '}
            <Text style={styles.link}>Privacy Policy</Text>
          </Text>
        </View>

        {/* Footer features */}
        <View style={styles.features}>
          {['Pay maintenance', 'Track complaints', 'Approve visitors'].map((f) => (
            <View key={f} style={styles.featureChip}>
              <Text style={styles.featureText}>✓ {f}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: 60, paddingBottom: 32 },

  hero: { alignItems: 'center', marginBottom: Spacing.xl },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logoText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  appName: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary },
  tagline: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: 4 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },

  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  prefix: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.surfaceVariant,
    borderRightWidth: 1.5,
    borderRightColor: Colors.border,
  },
  prefixText: { fontSize: FontSizes.md, color: Colors.textPrimary, fontWeight: '600' },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    letterSpacing: 1.5,
  },

  hint: { fontSize: FontSizes.xs, color: Colors.textDisabled, marginBottom: Spacing.sm },

  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: { backgroundColor: Colors.textDisabled, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700', letterSpacing: 0.3 },

  terms: {
    fontSize: FontSizes.xs,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  link: { color: Colors.primary, textDecorationLine: 'underline' },

  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.lg,
  },
  featureChip: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  featureText: { fontSize: FontSizes.xs, color: Colors.primary, fontWeight: '600' },
});
