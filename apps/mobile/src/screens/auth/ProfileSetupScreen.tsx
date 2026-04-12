import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList, MemberRole } from '../../types';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { societiesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'ProfileSetup'>;

export function ProfileSetupScreen({ route, navigation }: Props) {
  const { societyCode } = route.params;
  const { user, updateUser, addMembership } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [flatNumber, setFlatNumber] = useState('');
  const [selectedRole, setSelectedRole] = useState<MemberRole>('owner');
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length >= 2 && flatNumber.trim().length >= 1 && societyCode;

  async function handleJoin() {
    if (!societyCode) return;
    setLoading(true);
    try {
      const { data } = await societiesApi.join({ societyCode, flatNumber: flatNumber.trim().toUpperCase(), role: selectedRole, name: name.trim() });
      updateUser({ name: name.trim() });
      addMembership(data.member);
      navigation.navigate('PendingApproval', { societyName: data.member.societyName ?? societyCode, flatNumber: data.member.flatNumber });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to join. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="dark" />
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={styles.backText}>← Back</Text></Pressable>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>Tell your society committee who you are.</Text>
        {societyCode && (
          <View style={styles.codeTag}><Text style={styles.codeTagText}>🔑 Joining with code: {societyCode}</Text></View>
        )}
        <Text style={styles.label}>Your full name</Text>
        <TextInput style={styles.input} placeholder="e.g. Rahul Sharma" placeholderTextColor={Colors.textDisabled} value={name} onChangeText={setName} autoCapitalize="words" />
        <Text style={styles.label}>Flat / Unit number</Text>
        <TextInput style={styles.input} placeholder="e.g. A-204, 304, 12B" placeholderTextColor={Colors.textDisabled} value={flatNumber} onChangeText={setFlatNumber} autoCapitalize="characters" />
        <Text style={styles.label}>You are a...</Text>
        <View style={styles.roleRow}>
          {([['owner', '🏠', 'I own this flat'], ['tenant', '🔑', 'I rent this flat']] as const).map(([role, icon, desc]) => (
            <Pressable key={role} style={[styles.roleCard, selectedRole === role && styles.roleCardSelected]} onPress={() => setSelectedRole(role)}>
              <Text style={styles.roleIcon}>{icon}</Text>
              <Text style={[styles.roleLabel, selectedRole === role && styles.roleLabelSelected]}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
              <Text style={styles.roleDesc}>{desc}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>ℹ️ Your request will be sent to the committee for approval. You will get a notification once approved.</Text>
        </View>
        <Pressable style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]} onPress={handleJoin} disabled={!canSubmit || loading}>
          <Text style={styles.buttonText}>{loading ? 'Submitting...' : 'Submit Request'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  backBtn: { padding: Spacing.lg, paddingTop: 56 },
  backText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '600' },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  title: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.lg },
  codeTag: { backgroundColor: Colors.secondaryLight, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, marginBottom: Spacing.lg },
  codeTagText: { fontSize: FontSizes.sm, color: Colors.secondary, fontWeight: '600' },
  label: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8, marginTop: Spacing.md },
  input: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSizes.md, color: Colors.textPrimary },
  roleRow: { flexDirection: 'row', gap: Spacing.md },
  roleCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: 4 },
  roleCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  roleIcon: { fontSize: 24 },
  roleLabel: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textSecondary },
  roleLabelSelected: { color: Colors.primary },
  roleDesc: { fontSize: FontSizes.xs, color: Colors.textDisabled, textAlign: 'center' },
  infoBox: { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.lg },
  infoText: { fontSize: FontSizes.sm, color: Colors.primary, lineHeight: 20 },
  button: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.lg, elevation: 4 },
  buttonDisabled: { backgroundColor: Colors.textDisabled, elevation: 0 },
  buttonText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
});
