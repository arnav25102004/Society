import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30;

export function OTPScreen({ route, navigation }: Props) {
  const { phone } = route.params;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { setSession } = useAuthStore();

  useEffect(() => { startTimer(); return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);
  useEffect(() => { if (otp.length === OTP_LENGTH) handleVerify(); }, [otp]);

  function startTimer() {
    setResendSeconds(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendSeconds(s => { if (s <= 1) { clearInterval(timerRef.current!); return 0; } return s - 1; });
    }, 1000);
  }

  async function handleResend() {
    if (resendSeconds > 0) return;
    try { await authApi.sendOtp(phone); setOtp(''); startTimer(); } catch { Alert.alert('Error', 'Failed to resend OTP.'); }
  }

  async function handleVerify() {
    if (otp.length !== OTP_LENGTH || loading) return;
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(phone, otp);
      await setSession(data.user, data.tokens, data.memberships);
      if (data.memberships.length === 0) {
        navigation.navigate('SocietySelect');
      } else {
        const pending = data.memberships.find((m: any) => m.status === 'pending');
        if (pending) {
          navigation.navigate('PendingApproval', { societyName: pending.societyName, flatNumber: pending.flatNumber });
        }
        // approved membership → RootNavigator auto-shows the main app
      }
    } catch (err: any) {
      Alert.alert('Incorrect OTP', err?.response?.data?.message ?? 'Please try again.');
      setOtp(''); inputRef.current?.focus();
    } finally { setLoading(false); }
  }

  const boxes = Array.from({ length: OTP_LENGTH });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="dark" />
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={styles.backText}>← Back</Text></Pressable>
      <View style={styles.content}>
        <View style={styles.iconContainer}><Text style={styles.icon}>💬</Text></View>
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>We sent a 6-digit OTP to{'\n'}<Text style={styles.phone}>+91 {phone}</Text></Text>
        <TextInput ref={inputRef} value={otp} onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, OTP_LENGTH))} keyboardType="number-pad" maxLength={OTP_LENGTH} style={styles.hiddenInput} autoFocus />
        <Pressable style={styles.otpRow} onPress={() => inputRef.current?.focus()}>
          {boxes.map((_, i) => {
            const char = otp[i]; const isFocused = otp.length === i;
            return (
              <View key={i} style={[styles.otpBox, isFocused && styles.otpBoxFocused, char && styles.otpBoxFilled]}>
                <Text style={styles.otpChar}>{char ?? (isFocused ? '|' : '')}</Text>
              </View>
            );
          })}
        </Pressable>
        {loading && <Text style={styles.verifying}>Verifying...</Text>}
        <View style={styles.resendRow}>
          <Text style={styles.resendLabel}>Did not receive it? </Text>
          <Pressable onPress={handleResend} disabled={resendSeconds > 0}>
            <Text style={[styles.resendBtn, resendSeconds > 0 && styles.resendDisabled]}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend OTP'}</Text>
          </Pressable>
        </View>
        {otp.length === OTP_LENGTH && (
          <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleVerify} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify & Continue'}</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  backBtn: { padding: Spacing.lg, paddingTop: 56 },
  backText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '600' },
  content: { flex: 1, paddingHorizontal: Spacing.lg, alignItems: 'center', paddingTop: Spacing.xl },
  iconContainer: { width: 72, height: 72, backgroundColor: Colors.primaryLight, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  icon: { fontSize: 36 },
  title: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  phone: { fontWeight: '700', color: Colors.textPrimary },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  otpRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.lg },
  otpBox: { width: 48, height: 56, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  otpBoxFocused: { borderColor: Colors.primary, borderWidth: 2 },
  otpBoxFilled: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  otpChar: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.textPrimary },
  verifying: { fontSize: FontSizes.sm, color: Colors.primary, marginBottom: Spacing.md },
  resendRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  resendLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  resendBtn: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: '700' },
  resendDisabled: { color: Colors.textDisabled },
  button: { backgroundColor: Colors.primary, paddingVertical: 16, paddingHorizontal: Spacing.xxl, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.lg, width: '100%' },
  buttonDisabled: { backgroundColor: Colors.textDisabled },
  buttonText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
});
