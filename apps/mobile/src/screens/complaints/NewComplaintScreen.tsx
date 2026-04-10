import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
  Image, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const CATEGORIES = [
  { key: 'plumbing', label: 'Plumbing', icon: 'water-pump' },
  { key: 'electrical', label: 'Electrical', icon: 'lightning-bolt' },
  { key: 'elevator', label: 'Elevator', icon: 'elevator' },
  { key: 'security', label: 'Security', icon: 'shield-alert' },
  { key: 'sanitation', label: 'Cleaning', icon: 'broom' },
  { key: 'noise', label: 'Noise', icon: 'volume-high' },
  { key: 'parking', label: 'Parking', icon: 'car' },
  { key: 'other', label: 'Other', icon: 'dots-horizontal' },
];

const PRIORITY_COLORS = {
  critical: Colors.error,
  high: '#FF6B35',
  medium: Colors.warning,
  low: Colors.secondary,
};

const PRIORITY_BG = {
  critical: Colors.errorLight,
  high: '#FFF0EB',
  medium: Colors.warningLight,
  low: Colors.secondaryLight,
};

export function NewComplaintScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [step, setStep] = useState<'category' | 'details' | 'result'>('category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to attach images.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!picked.canceled) {
      setPhotos(prev => [...prev, ...picked.assets.map(a => a.uri)].slice(0, 5));
    }
  }

  async function submit() {
    if (!activeMembership) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('societyId', activeMembership.societyId);
      formData.append('title', title);
      formData.append('description', description);
      formData.append('category', selectedCategory);
      photos.forEach((uri, i) => {
        formData.append('photos', { uri, name: `photo_${i}.jpg`, type: 'image/jpeg' } as any);
      });

      const { data } = await api.post('/complaints', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(data);
      setStep('result');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to submit complaint.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'result' && result) {
    const { ai, complaint } = result;
    const priority = ai.triage.priority as keyof typeof PRIORITY_COLORS;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.resultContent}>
        <StatusBar style="dark" />
        <View style={[styles.priorityBadgeLarge, { backgroundColor: PRIORITY_BG[priority] }]}>
          <MaterialCommunityIcons
            name={priority === 'critical' ? 'alert-octagon' : priority === 'high' ? 'alert-circle' : 'information'}
            size={36}
            color={PRIORITY_COLORS[priority]}
          />
          <Text style={[styles.priorityLabelLarge, { color: PRIORITY_COLORS[priority] }]}>
            {priority.toUpperCase()} PRIORITY
          </Text>
        </View>

        <Text style={styles.resultTitle}>Complaint filed!</Text>
        <Text style={styles.resultSubtitle}>AI analysed your complaint in seconds</Text>

        <View style={styles.aiCard}>
          <Text style={styles.aiCardTitle}>🤖 AI Analysis</Text>
          <Text style={styles.aiReasoning}>{ai.triage.reasoning}</Text>
          <View style={styles.aiMeta}>
            <View style={styles.aiMetaItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.aiMetaText}>Expected in {ai.triage.estimatedResolutionHours}h</Text>
            </View>
            <View style={styles.aiMetaItem}>
              <MaterialCommunityIcons name="tag-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.aiMetaText}>{complaint.category}</Text>
            </View>
          </View>
        </View>

        <View style={styles.ackCard}>
          <Text style={styles.ackTitle}>Committee Acknowledgement</Text>
          <Text style={styles.ackBody}>{ai.acknowledgement}</Text>
        </View>

        <Pressable style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Track my complaint →</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => step === 'details' ? setStep('category') : navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Complaint</Text>
        <Text style={styles.stepIndicator}>{step === 'category' ? '1/2' : '2/2'}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: step === 'category' ? '50%' : '100%' }]} />
      </View>

      {step === 'category' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepTitle}>What's the issue?</Text>
          <Text style={styles.stepSubtitle}>Select a category — AI will auto-prioritize</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => (
              <Pressable
                key={cat.key}
                style={[styles.categoryCard, selectedCategory === cat.key && styles.categoryCardSelected]}
                onPress={() => { setSelectedCategory(cat.key); Haptics.selectionAsync(); }}
              >
                <MaterialCommunityIcons
                  name={cat.icon as any}
                  size={28}
                  color={selectedCategory === cat.key ? Colors.primary : Colors.textSecondary}
                />
                <Text style={[styles.categoryLabel, selectedCategory === cat.key && styles.categoryLabelSelected]}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.button, !selectedCategory && styles.buttonDisabled]}
            onPress={() => selectedCategory && setStep('details')}
            disabled={!selectedCategory}
          >
            <Text style={styles.buttonText}>Continue →</Text>
          </Pressable>
        </ScrollView>
      )}

      {step === 'details' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepTitle}>Describe the issue</Text>
          <Text style={styles.stepSubtitle}>More detail = faster resolution</Text>

          <TextInput
            style={styles.titleInput}
            placeholder="Brief title (e.g. Water leaking from ceiling)"
            placeholderTextColor={Colors.textDisabled}
            value={title}
            onChangeText={setTitle}
            maxLength={150}
          />
          <TextInput
            style={styles.descInput}
            placeholder="Describe in detail — when did it start, how bad is it, exact location…"
            placeholderTextColor={Colors.textDisabled}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={1000}
          />

          {/* Photos */}
          <Text style={styles.photoLabel}>Attach photos (optional, up to 5)</Text>
          <View style={styles.photoRow}>
            {photos.map((uri, i) => (
              <Pressable key={i} style={styles.photoThumb} onLongPress={() => setPhotos(p => p.filter((_, idx) => idx !== i))}>
                <Image source={{ uri }} style={styles.photoImage} />
                <View style={styles.photoRemove}><Text style={{ color: '#fff', fontSize: 10 }}>✕</Text></View>
              </Pressable>
            ))}
            {photos.length < 5 && (
              <Pressable style={styles.addPhoto} onPress={pickPhoto}>
                <MaterialCommunityIcons name="camera-plus-outline" size={24} color={Colors.primary} />
              </Pressable>
            )}
          </View>

          <View style={styles.aiBanner}>
            <Text style={styles.aiBannerText}>
              🤖 AI will analyse your complaint and auto-assign priority. You'll get an instant acknowledgement.
            </Text>
          </View>

          <Pressable
            style={[styles.button, (!title.trim() || loading) && styles.buttonDisabled]}
            onPress={submit}
            disabled={!title.trim() || loading}
          >
            {loading ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.buttonText}>AI analysing…</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Submit Complaint</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, paddingTop: 56 },
  backText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.textPrimary },
  stepIndicator: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  progressBar: { height: 4, backgroundColor: Colors.border, marginHorizontal: Spacing.lg, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  scroll: { padding: Spacing.lg, paddingBottom: 40 },
  stepTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4, marginTop: Spacing.md },
  stepSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  categoryCard: {
    width: '47%', backgroundColor: Colors.surface,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    padding: Spacing.md, alignItems: 'center', gap: 6,
  },
  categoryCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  categoryLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textSecondary },
  categoryLabelSelected: { color: Colors.primary },
  titleInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSizes.md,
    color: Colors.textPrimary, marginBottom: Spacing.md,
  },
  descInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSizes.md,
    color: Colors.textPrimary, minHeight: 120, marginBottom: Spacing.md,
  },
  photoLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  photoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: Spacing.lg },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, overflow: 'hidden', position: 'relative' },
  photoImage: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 2, right: 2, width: 18, height: 18,
    borderRadius: 9, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center',
  },
  addPhoto: {
    width: 72, height: 72, borderRadius: Radius.sm, borderWidth: 1.5,
    borderColor: Colors.primary, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primaryLight,
  },
  aiBanner: { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  aiBannerText: { fontSize: FontSizes.sm, color: Colors.primary, lineHeight: 20 },
  button: {
    backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.md,
    alignItems: 'center', shadowColor: Colors.primary, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  buttonDisabled: { backgroundColor: Colors.textDisabled, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  // Result screen
  resultContent: { padding: Spacing.lg, paddingTop: 60, alignItems: 'center', gap: Spacing.md },
  priorityBadgeLarge: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  priorityLabelLarge: { fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 1 },
  resultTitle: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary },
  resultSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  aiCard: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  aiCardTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  aiReasoning: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20 },
  aiMeta: { flexDirection: 'row', gap: Spacing.lg },
  aiMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiMetaText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  ackCard: {
    width: '100%', backgroundColor: Colors.secondaryLight, borderRadius: Radius.lg,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  ackTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.secondary },
  ackBody: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 22 },
});
