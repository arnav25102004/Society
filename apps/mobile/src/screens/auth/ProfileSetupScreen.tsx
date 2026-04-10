import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AuthStackParamList, MemberRole } from '../../types';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { societiesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'ProfileSetup'>;

type RoleOption = { role: MemberRole; label: string; icon: string; desc: string };

const ROLES: RoleOption[] = [
  { role: 'owner', label: 'Owner', icon: 'home', desc: 'I own this flat' },
  { role: 'tenant', label: 'Tenant', icon: 'key', desc: 'I rent this flat' },
];

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
      const { data } = await societiesApi.join({
        societyCode,
        flatNumber: flatNumber.trim().toUpperCase(),
        role: selectedRole,
        name: name.trim(),
      });

      updateUser({ name: name.trim() });
      addMembership(data.member);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      navigation.navigate('PendingApproval', {
        societyName: data.member.societyName ?? societyCode,
        flatNumber: data.member.flatNumber,
      });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.response?.data?.message ?? 'Failed to join. Please try again.';
      Alert.alert('Error', msg);
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

      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>
          Tell your society committee who you are so they can approve your request.
        </Text>

        {societyCode && (
          <View style={styles.codeTag}>
            <MaterialCommunityIcons name="key" size={14} color={Colors.secondary} />
            <Text style={styles.codeTagText}>Joining with code: {societyCode}</Text>
          </View>
        )}

        {/* Name */}
        <Text style={styles.label}>Your full name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Rahul Sharma"
          placeholderTextColor={Colors.textDisabled}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
        />

        {/* Flat number */}
        <Text style={styles.label}>Flat / Unit number</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. A-204, 304, 12B"
          placeholderTextColor={Colors.textDisabled}
          value={flatNumber}
          onChangeText={setFlatNumber}
          autoCapitalize="characters"
          returnKeyType="done"
        />

        {/* Role selection */}
        <Text style={styles.label}>You are a…</Text>
        <View style={styles.roleRow}>
          {ROLES.map((option) => (
            <Pressable
              key={option.role}
              style={[styles.roleCard, selectedRole === option.role && styles.roleCardSelected]}
              onPress={() => { setSelectedRole(option.role); Haptics.selectionAsync(); }}
            >
              <MaterialCommunityIcons
                name={option.icon as any}
                size={28}
                color={selectedRole === option.role ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.roleLabel, selectedRole === option.role && styles.roleLabelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.roleDesc}>{option.desc}</Text>
            </Pressable>
          ))}
        </View>

        {/* Info note */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            Your request will be sent to the committee for approval. You'll get a notification once approved.
          </Text>
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={!canSubmit || loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Submitting…' : 'Submit Request'}</Text>
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

  codeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.secondaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginBottom: Spacing.lg,
  },
  codeTagText: { fontSize: FontSizes.sm, color: Colors.secondary, fontWeight: '600' },

  label: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8, marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },

  roleRow: { flexDirection: 'row', gap: Spacing.md },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  roleCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  roleLabel: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textSecondary },
  roleLabelSelected: { color: Colors.primary },
  roleDesc: { fontSize: FontSizes.xs, color: Colors.textDisabled, textAlign: 'center' },

  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: FontSizes.sm, color: Colors.primary, lineHeight: 20 },

  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: { backgroundColor: Colors.textDisabled, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
});
