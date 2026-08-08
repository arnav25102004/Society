import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const [step, setStep] = useState<'warn' | 'otp' | 'confirm'>('warn');
  const [otp, setOtp] = useState('');
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleSendOtp() {
    setSending(true);
    setError('');
    try {
      await api.post('/auth/send-otp', { phone: user?.phone ?? '' });
      setStep('otp');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not send OTP. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return;
    setVerifying(true);
    setError('');
    try {
      const res = await api.post('/auth/otp-action-token', { otp });
      setActionToken(res.data.sensitiveActionToken);
      setStep('confirm');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Incorrect or expired OTP.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!actionToken || confirmText !== CONFIRM_WORD) return;
    setDeleting(true);
    setError('');
    try {
      await api.post('/privacy/delete-account', {}, { headers: { 'X-Action-Token': actionToken } });
      Alert.alert(
        'Account Deleted',
        'Your account has been deleted. You will now be signed out.',
        [{ text: 'OK', onPress: () => logout() }]
      );
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not delete account. Try again.');
      setDeleting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {step === 'warn' && (
        <>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="alert-octagon-outline" size={36} color={Colors.error} />
          </View>
          <Text style={styles.title}>Delete Your Account</Text>
          <Text style={styles.body}>
            This permanently removes your name, phone number, and profile from Urban Hub.
            You will lose access to all societies you&apos;re a member of.
          </Text>
          <View style={styles.retainBox}>
            <Text style={styles.retainTitle}>What&apos;s kept</Text>
            <Text style={styles.retainText}>
              Financial records (payments, bills) are retained in anonymised form as required
              by law. Nothing else about you remains linked to them.
            </Text>
          </View>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable style={styles.dangerBtn} onPress={handleSendOtp} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerBtnText}>Continue</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </>
      )}

      {step === 'otp' && (
        <>
          <Text style={styles.title}>Verify It&apos;s You</Text>
          <Text style={styles.body}>
            We sent a 6-digit code to your registered phone number. Enter it to continue.
          </Text>
          <TextInput
            style={styles.otpInput}
            value={otp}
            onChangeText={setOtp}
            placeholder="000000"
            placeholderTextColor={Colors.textDisabled}
            keyboardType="number-pad"
            maxLength={6}
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable
            style={[styles.dangerBtn, otp.length !== 6 && styles.btnDisabled]}
            onPress={handleVerifyOtp}
            disabled={otp.length !== 6 || verifying}
          >
            {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerBtnText}>Verify</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </>
      )}

      {step === 'confirm' && (
        <>
          <Text style={styles.title}>Final Confirmation</Text>
          <Text style={styles.body}>
            Type <Text style={styles.confirmWord}>{CONFIRM_WORD}</Text> below to permanently delete your account.
            This cannot be undone.
          </Text>
          <TextInput
            style={styles.confirmInput}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={Colors.textDisabled}
            autoCapitalize="characters"
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable
            style={[styles.dangerBtn, confirmText !== CONFIRM_WORD && styles.btnDisabled]}
            onPress={handleDelete}
            disabled={confirmText !== CONFIRM_WORD || deleting}
          >
            {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerBtnText}>Delete My Account</Text>}
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingTop: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.errorLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm,
  },
  title: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  body: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  retainBox: {
    backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md,
    width: '100%', gap: 4,
  },
  retainTitle: { fontWeight: '700', color: Colors.textPrimary, fontSize: FontSizes.sm },
  retainText: { color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
  errorText: { color: Colors.error, fontSize: FontSizes.sm, textAlign: 'center' },
  otpInput: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md,
    fontSize: FontSizes.xxl, textAlign: 'center', letterSpacing: 8, color: Colors.textPrimary,
  },
  confirmInput: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.error, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    fontSize: FontSizes.lg, textAlign: 'center', fontWeight: '700', color: Colors.error,
  },
  confirmWord: { fontWeight: '800', color: Colors.error },
  dangerBtn: {
    width: '100%', backgroundColor: Colors.error, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm,
  },
  btnDisabled: { opacity: 0.5 },
  dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSizes.md },
  cancelBtn: { paddingVertical: Spacing.sm },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSizes.md },
});
