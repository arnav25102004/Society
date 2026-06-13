import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

export function ExpenseDashboardScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  const loadDashboard = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const res = await api.get('/expenses/dashboard', {
        params: { societyId: activeMembership.societyId, month: selectedMonth },
      });
      setDashboard(res.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMembership?.societyId, selectedMonth]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (loadError || !dashboard) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="chart-pie-outline" size={48} color={Colors.textDisabled} />
        <Text style={styles.errorText}>Could not load expense data</Text>
        <Text style={styles.errorHint}>The backend may not be running, or no data exists yet</Text>
        <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); setLoadError(false); loadDashboard(); }}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { summary, breakdown, trend } = dashboard;
  const maxTrend = Math.max(...trend.map((t: any) => t.amount), 1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDashboard(); }} />}
    >
      {/* Month selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthStrip}>
        {getLast6Months().map(m => (
          <Pressable
            key={m}
            style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]}
            onPress={() => setSelectedMonth(m)}
          >
            <Text style={[styles.monthChipText, selectedMonth === m && styles.monthChipTextActive]}>
              {formatMonth(m)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Summary cards */}
      <View style={styles.summaryGrid}>
        <View style={[styles.summaryCard, { borderLeftColor: Colors.primary }]}>
          <Text style={styles.summaryValue}>₹{summary.totalCollected.toLocaleString('en-IN')}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: Colors.error }]}>
          <Text style={styles.summaryValue}>₹{summary.totalExpenses.toLocaleString('en-IN')}</Text>
          <Text style={styles.summaryLabel}>Spent</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: Colors.secondary }]}>
          <Text style={[styles.summaryValue, { color: summary.surplus >= 0 ? Colors.secondary : Colors.error }]}>
            ₹{Math.abs(summary.surplus).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.summaryLabel}>{summary.surplus >= 0 ? 'Surplus' : 'Deficit'}</Text>
        </View>
      </View>

      {/* Expense breakdown */}
      {breakdown.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Where your money goes</Text>
          <View style={styles.card}>
            {breakdown.map((item: any, idx: number) => (
              <View key={item.category.id}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <View style={[styles.colorDot, { backgroundColor: item.category.color }]} />
                    <View>
                      <Text style={styles.catName}>{item.category.name}</Text>
                      <Text style={styles.catBudget}>Budget: ₹{Number(item.budget).toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                  <View style={styles.breakdownRight}>
                    <Text style={[
                      styles.spentAmount,
                      item.utilization > 100 && { color: Colors.error },
                    ]}>
                      ₹{item.spent.toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.percentage}>{item.percentage}%</Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={styles.progressBg}>
                  <View style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(item.utilization, 100)}%` as any,
                      backgroundColor: item.utilization > 100 ? Colors.error : item.category.color,
                    },
                  ]} />
                </View>
                {item.utilization > 90 && (
                  <Text style={[styles.overBudget, item.utilization > 100 && { color: Colors.error }]}>
                    {item.utilization > 100 ? `${item.utilization - 100}% over budget!` : `${100 - item.utilization}% budget remaining`}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {/* 6-month trend */}
      <Text style={styles.sectionTitle}>6-Month Trend</Text>
      <View style={styles.card}>
        <View style={styles.chart}>
          {trend.map((point: any, idx: number) => {
            const height = Math.max((point.amount / maxTrend) * 100, 4);
            return (
              <View key={idx} style={styles.chartBar}>
                <Text style={styles.chartAmount}>
                  {point.amount > 0 ? `₹${(point.amount / 1000).toFixed(0)}k` : ''}
                </Text>
                <View style={[styles.bar, { height }, point.month === formatMonth(selectedMonth) && styles.barActive]} />
                <Text style={styles.chartMonth}>{point.month}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Empty state */}
      {breakdown.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="chart-pie" size={48} color={Colors.textDisabled} />
          <Text style={styles.emptyText}>No expense data for this month</Text>
          <Text style={styles.emptyHint}>Committee members can add expenses in the admin panel</Text>
        </View>
      )}
    </ScrollView>
  );
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getLast6Months(): string[] {
  const months = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    months.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 40, gap: Spacing.sm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  monthStrip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  monthChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full, marginRight: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthChipText: { fontWeight: '600', color: Colors.textSecondary, fontSize: FontSizes.sm },
  monthChipTextActive: { color: '#fff' },
  summaryGrid: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3 },
  summaryValue: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.textSecondary, marginHorizontal: Spacing.lg, marginTop: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { marginHorizontal: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  catName: { fontWeight: '600', color: Colors.textPrimary },
  catBudget: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  breakdownRight: { alignItems: 'flex-end' },
  spentAmount: { fontWeight: '700', color: Colors.textPrimary },
  percentage: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  progressBg: { height: 6, backgroundColor: Colors.surfaceVariant, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  overBudget: { fontSize: FontSizes.xs, color: Colors.warning, marginTop: 4 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140 },
  chartBar: { flex: 1, alignItems: 'center', gap: 4 },
  chartAmount: { fontSize: 9, color: Colors.textDisabled, textAlign: 'center' },
  bar: { width: '60%', backgroundColor: Colors.primaryLight, borderRadius: 4 },
  barActive: { backgroundColor: Colors.primary },
  chartMonth: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  emptyText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSizes.md },
  emptyHint: { color: Colors.textDisabled, fontSize: FontSizes.sm, textAlign: 'center' },
  errorText: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.md },
  errorHint: { fontSize: FontSizes.sm, color: Colors.textDisabled, textAlign: 'center', marginHorizontal: Spacing.xl, marginTop: 4 },
  retryBtn: { marginTop: Spacing.md, backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  retryBtnText: { color: '#fff', fontWeight: '700' },
});
