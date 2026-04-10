import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { api } from '../../services/api';

const PRIORITY_COLOR: Record<string, string> = {
  critical: Colors.error,
  high: '#FF6B35',
  medium: Colors.warning,
  low: Colors.secondary,
};

const STATUS_ICONS: Record<string, string> = {
  received: 'inbox-arrow-down',
  triaged: 'robot',
  assigned: 'account-hard-hat',
  in_progress: 'wrench',
  resolved: 'check-circle',
};

export function ComplaintTrackerScreen({ route, navigation }: any) {
  const { complaintId } = route.params;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // Poll for updates every 30 seconds (real-time in Phase 2 via WebSocket)
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    try {
      const resp = await api.get(`/complaints/${complaintId}`);
      setData(resp.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={{ color: Colors.textSecondary }}>Complaint not found.</Text>
      </View>
    );
  }

  const { complaint, tracker } = data;
  const priority = complaint.priority as string;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={[styles.priorityChip, { backgroundColor: PRIORITY_COLOR[priority] + '20' }]}>
          <Text style={[styles.priorityChipText, { color: PRIORITY_COLOR[priority] }]}>
            {priority.toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{complaint.title}</Text>
      <Text style={styles.meta}>
        Flat {complaint.flatNumber} · {complaint.category} · #{complaint.id.slice(0, 8).toUpperCase()}
      </Text>

      {/* Swiggy-style tracker */}
      <View style={styles.trackerCard}>
        <Text style={styles.trackerTitle}>Live Status</Text>
        {tracker.steps.map((step: any, i: number) => (
          <View key={step.id} style={styles.trackerRow}>
            {/* Left: icon + line */}
            <View style={styles.trackerLeft}>
              <View style={[
                styles.trackerDot,
                step.completed ? styles.trackerDotDone : styles.trackerDotPending,
                tracker.currentStep === step.id && styles.trackerDotCurrent,
              ]}>
                {step.completed ? (
                  <MaterialCommunityIcons
                    name={STATUS_ICONS[step.id] as any ?? 'check'}
                    size={12}
                    color="#fff"
                  />
                ) : (
                  <View style={styles.trackerDotInner} />
                )}
              </View>
              {i < tracker.steps.length - 1 && (
                <View style={[styles.trackerLine, step.completed && styles.trackerLineDone]} />
              )}
            </View>
            {/* Right: content */}
            <View style={styles.trackerContent}>
              <Text style={[styles.trackerStepLabel, !step.completed && styles.trackerStepLabelMuted]}>
                {step.label}
              </Text>
              <Text style={styles.trackerStepDesc}>{step.description}</Text>
              {step.timestamp && (
                <Text style={styles.trackerTimestamp}>
                  {new Date(step.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* SLA Banner */}
      <View style={[styles.slaBanner, { borderLeftColor: PRIORITY_COLOR[priority] }]}>
        <MaterialCommunityIcons name="clock-fast" size={16} color={PRIORITY_COLOR[priority]} />
        <Text style={styles.slaText}>
          {complaint.status === 'resolved' || complaint.status === 'closed'
            ? '✓ Resolved on time'
            : `Expected resolution: within ${priority === 'critical' ? '4' : priority === 'high' ? '24' : priority === 'medium' ? '72' : '168'} hours of filing`}
        </Text>
      </View>

      {/* Rate if resolved */}
      {complaint.status === 'resolved' && !complaint.rating && (
        <View style={styles.rateCard}>
          <Text style={styles.rateTitle}>How was the resolution?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map(star => (
              <Pressable key={star} onPress={() => rateComplaint(complaint.id, star, load)}>
                <MaterialCommunityIcons name="star-outline" size={32} color={Colors.warning} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {complaint.rating && (
        <View style={styles.ratedCard}>
          <MaterialCommunityIcons name="star" size={20} color={Colors.warning} />
          <Text style={styles.ratedText}>You rated this {complaint.rating}/5</Text>
        </View>
      )}
    </ScrollView>
  );
}

async function rateComplaint(id: string, rating: number, reload: () => void) {
  try {
    await api.post(`/complaints/${id}/rate`, { rating });
    reload();
  } catch {}
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingTop: 56, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  backText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '600' },
  priorityChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full },
  priorityChipText: { fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  meta: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },

  trackerCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  trackerTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },

  trackerRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: 0 },
  trackerLeft: { alignItems: 'center', width: 28 },
  trackerDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.border,
  },
  trackerDotDone: { backgroundColor: Colors.primary },
  trackerDotCurrent: { backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  trackerDotPending: { backgroundColor: Colors.border },
  trackerDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textDisabled },
  trackerLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2, minHeight: 24 },
  trackerLineDone: { backgroundColor: Colors.primary },

  trackerContent: { flex: 1, paddingBottom: Spacing.lg },
  trackerStepLabel: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  trackerStepLabelMuted: { color: Colors.textDisabled },
  trackerStepDesc: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: 2 },
  trackerTimestamp: { fontSize: FontSizes.xs, color: Colors.textDisabled, marginTop: 4 },

  slaBanner: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderLeftWidth: 4, marginBottom: Spacing.md,
  },
  slaText: { fontSize: FontSizes.sm, color: Colors.textSecondary, flex: 1 },

  rateCard: {
    backgroundColor: Colors.warningLight, borderRadius: Radius.lg,
    padding: Spacing.lg, alignItems: 'center', gap: Spacing.md,
  },
  rateTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  stars: { flexDirection: 'row', gap: 8 },

  ratedCard: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: Spacing.md,
  },
  ratedText: { fontSize: FontSizes.sm, color: Colors.textPrimary, fontWeight: '600' },
});
