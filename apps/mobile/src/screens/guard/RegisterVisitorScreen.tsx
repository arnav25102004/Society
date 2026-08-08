import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  TextInput, Image, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const PURPOSES: { value: string; label: string; icon: string }[] = [
  { value: 'delivery', label: 'Delivery', icon: 'package-variant-closed' },
  { value: 'guest', label: 'Guest', icon: 'account-outline' },
  { value: 'cab', label: 'Cab / Auto', icon: 'car-outline' },
  { value: 'service', label: 'Service', icon: 'tools' },
  { value: 'other', label: 'Other', icon: 'help-circle-outline' },
];

export function RegisterVisitorScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [flatNumber, setFlatNumber] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [purpose, setPurpose] = useState<string>('guest');
  const [companyName, setCompanyName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Allow camera access to photograph the visitor.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        name: asset.fileName ?? `visitor-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  }

  async function handleSubmit() {
    if (!activeMembership?.societyId) return;
    if (!flatNumber.trim()) { Alert.alert('Flat number required', 'Enter which flat the visitor is going to.'); return; }
    if (!visitorName.trim()) { Alert.alert('Visitor name required', 'Enter the visitor\'s name.'); return; }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('societyId', activeMembership.societyId);
      form.append('flatNumber', flatNumber.trim());
      form.append('visitorName', visitorName.trim());
      form.append('purpose', purpose);
      if (visitorPhone.trim()) form.append('visitorPhone', visitorPhone.trim());
      if (companyName.trim()) form.append('companyName', companyName.trim());
      if (photo) {
        form.append('photo', { uri: photo.uri, name: photo.name, type: photo.type } as any);
      }

      const res = await api.post('/visitors', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const isPreApproved = res.data.isPreApproved;
      Alert.alert(
        isPreApproved ? 'Auto-Approved' : 'Sent to Resident',
        isPreApproved
          ? `${visitorName} is pre-approved and can go in.`
          : `Waiting for Flat ${flatNumber} to respond.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Could not register visitor', err?.response?.data?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.photoBox} onPress={takePhoto}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialCommunityIcons name="camera-plus-outline" size={40} color={Colors.primary} />
            <Text style={styles.photoLabel}>Take Photo</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.field}>
        <Text style={styles.label}>Flat Number</Text>
        <TextInput
          style={styles.input}
          value={flatNumber}
          onChangeText={setFlatNumber}
          placeholder="e.g. A-101"
          placeholderTextColor={Colors.textDisabled}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Visitor Name</Text>
        <TextInput
          style={styles.input}
          value={visitorName}
          onChangeText={setVisitorName}
          placeholder="Full name"
          placeholderTextColor={Colors.textDisabled}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput
          style={styles.input}
          value={visitorPhone}
          onChangeText={setVisitorPhone}
          placeholder="10-digit mobile number"
          placeholderTextColor={Colors.textDisabled}
          keyboardType="phone-pad"
          maxLength={15}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Purpose</Text>
        <View style={styles.purposeGrid}>
          {PURPOSES.map(p => (
            <Pressable
              key={p.value}
              style={[styles.purposeChip, purpose === p.value && styles.purposeChipActive]}
              onPress={() => setPurpose(p.value)}
            >
              <MaterialCommunityIcons
                name={p.icon as any}
                size={22}
                color={purpose === p.value ? '#fff' : Colors.primary}
              />
              <Text style={[styles.purposeLabel, purpose === p.value && styles.purposeLabelActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {purpose === 'delivery' && (
        <View style={styles.field}>
          <Text style={styles.label}>Company (optional)</Text>
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="e.g. Amazon, Zomato"
            placeholderTextColor={Colors.textDisabled}
          />
        </View>
      )}

      <Pressable
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name="bell-ring-outline" size={22} color="#fff" />
            <Text style={styles.submitText}>Notify Resident</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 48 },
  photoBox: {
    height: 220, borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primaryLight,
  },
  photoLabel: { color: Colors.primary, fontWeight: '700', fontSize: FontSizes.md },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: FontSizes.lg, color: Colors.textPrimary,
  },
  purposeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  purposeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  purposeChipActive: { backgroundColor: Colors.primary },
  purposeLabel: { color: Colors.primary, fontWeight: '700', fontSize: FontSizes.sm },
  purposeLabelActive: { color: '#fff' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: FontSizes.lg },
});
