import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const CATEGORIES = [
  { key: 'plumbing', label: 'Plumbing', icon: '🚿' },
  { key: 'electrical', label: 'Electrical', icon: '⚡' },
  { key: 'elevator', label: 'Elevator', icon: '🛗' },
  { key: 'security', label: 'Security', icon: '🛡️' },
  { key: 'sanitation', label: 'Cleaning', icon: '🧹' },
  { key: 'noise', label: 'Noise', icon: '🔊' },
  { key: 'parking', label: 'Parking', icon: '🚗' },
  { key: 'other', label: 'Other', icon: '📋' },
];

const PRIORITY_COLORS: Record<string, string> = { critical: Colors.error, high: '#FF6B35', medium: Colors.warning, low: Colors.secondary };

export function NewComplaintScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'category' | 'details' | 'result'>('category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function submit() {
    if (!activeMembership) return;
    setLoading(true);
    try {
      const { data } = await api.post('/complaints', { societyId: activeMembership.societyId, title, description, category: selectedCategory });
      setResult(data); setStep('result');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to submit complaint.');
    } finally { setLoading(false); }
  }

  if (step === 'result' && result) {
    const { ai, complaint } = result;
    const priority = ai.triage.priority as string;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.resultContent}>
        <StatusBar style="dark" />
        <View style={[styles.priorityBadgeLarge, { backgroundColor: PRIORITY_COLORS[priority] + '20' }]}>
          <Text style={{ fontSize: 40 }}>{priority === 'critical' ? '🚨' : priority === 'high' ? '⚠️' : 'ℹ️'}</Text>
          <Text style={[styles.priorityLabelLarge, { color: PRIORITY_COLORS[priority] }]}>{priority.toUpperCase()} PRIORITY</Text>
        </View>
        <Text style={styles.resultTitle}>Complaint filed!</Text>
        <View style={styles.aiCard}>
          <Text style={styles.aiCardTitle}>🤖 AI Analysis</Text>
          <Text style={styles.aiReasoning}>{ai.triage.reasoning}</Text>
          <Text style={styles.aiMeta}>Expected resolution: within {ai.triage.estimatedResolutionHours} hours</Text>
        </View>
        <View style={styles.ackCard}>
          <Text style={styles.ackTitle}>Committee Acknowledgement</Text>
          <Text style={styles.ackBody}>{ai.acknowledgement}</Text>
        </View>
        <Pressable style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => step === 'details' ? setStep('category') : navigation.goBack()}><Text style={styles.backText}>← Back</Text></Pressable>
        <Text style={styles.headerTitle}>New Complaint</Text>
        <Text style={styles.stepIndicator}>{step === 'category' ? '1/2' : '2/2'}</Text>
      </View>
      <View style={styles.progressBar}><View style={[styles.progressFill, { width: step === 'category' ? '50%' : '100%' }]} /></View>

      {step === 'category' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepTitle}>What is the issue?</Text>
          <Text style={styles.stepSubtitle}>AI will auto-prioritize based on your selection</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => (
              <Pressable key={cat.key} style={[styles.categoryCard, selectedCategory === cat.key && styles.categoryCardSelected]} onPress={() => setSelectedCategory(cat.key)}>
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryLabel, selectedCategory === cat.key && styles.categoryLabelSelected]}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.button, !selectedCategory && styles.buttonDisabled]} onPress={() => selectedCategory && setStep('details')} disabled={!selectedCategory}>
            <Text style={styles.buttonText}>Continue →</Text>
          </Pressable>
        </ScrollView>
      )}

      {step === 'details' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepTitle}>Describe the issue</Text>
          <Text style={styles.stepSubtitle}>More detail = faster resolution</Text>
          <TextInput style={styles.titleInput} placeholder="Brief title (e.g. Water leaking from ceiling)" placeholderTextColor={Colors.textDisabled} value={title} onChangeText={setTitle} maxLength={150} />
          <TextInput style={styles.descInput} placeholder="Describe in detail — when did it start, how bad is it, exact location..." placeholderTextColor={Colors.textDisabled} value={description} onChangeText={setDescription} multiline numberOfLines={5} textAlignVertical="top" maxLength={1000} />
          <View style={styles.aiBanner}><Text style={styles.aiBannerText}>🤖 AI will instantly analyse and prioritise your complaint</Text></View>
          <Pressable style={[styles.button, (!title.trim() || loading) && styles.buttonDisabled]} onPress={submit} disabled={!title.trim() || loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Complaint</Text>}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  backText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.textPrimary },
  stepIndicator: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  progressBar: { height: 4, backgroundColor: Colors.border, marginHorizontal: Spacing.lg, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  scroll: { padding: Spacing.lg, paddingBottom: 40 },
  stepTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4, marginTop: Spacing.md },
  stepSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  categoryCard: { width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: 6 },
  categoryCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  categoryIcon: { fontSize: 28 },
  categoryLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textSecondary },
  categoryLabelSelected: { color: Colors.primary },
  titleInput: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSizes.md, color: Colors.textPrimary, marginBottom: Spacing.md },
  descInput: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSizes.md, color: Colors.textPrimary, minHeight: 120, marginBottom: Spacing.md },
  aiBanner: { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  aiBannerText: { fontSize: FontSizes.sm, color: Colors.primary, lineHeight: 20 },
  button: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center', elevation: 4 },
  buttonDisabled: { backgroundColor: Colors.textDisabled, elevation: 0 },
  buttonText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  resultContent: { padding: Spacing.lg, paddingTop: 60, alignItems: 'center', gap: Spacing.md },
  priorityBadgeLarge: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', gap: 4 },
  priorityLabelLarge: { fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 1 },
  resultTitle: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary },
  aiCard: { width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  aiCardTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  aiReasoning: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20 },
  aiMeta: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  ackCard: { width: '100%', backgroundColor: Colors.secondaryLight, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  ackTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.secondary },
  ackBody: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 22 },
});
