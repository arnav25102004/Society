import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  unpaid: { color: Colors.warning, bg: Colors.warningLight, label: 'Due' },
  overdue: { color: Colors.error, bg: Colors.errorLight, label: 'Overdue' },
  paid: { color: Colors.secondary, bg: Colors.secondaryLight, label: 'Paid' },
  partial: { color: Colors.primary, bg: Colors.primaryLight, label: 'Partial' },
};

export function PaymentsScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const res = await api.get('/payments/bills', { params: { societyId: activeMembership.societyId } });
      setBills(res.data.bills);
    } catch {
      Alert.alert('Error', 'Could not load bills.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMembership?.societyId]);

  useEffect(() => { loadBills(); }, [loadBills]);

  async function handlePay(bill: any) {
    Alert.alert(
      'Pay Maintenance',
      `Pay ₹${Number(bill.totalAmount).toLocaleString('en-IN')} via UPI?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPayingId(bill.id);
            try {
              await api.post(`/payments/bills/${bill.id}/pay`, { paymentMethod: 'upi' });
              Alert.alert('Payment Successful!', 'Receipt has been generated.');
              loadBills();
            } catch (err: any) {
              Alert.alert('Payment Failed', err?.response?.data?.message ?? 'Please try again.');
            } finally {
              setPayingId(null);
            }
          },
        },
      ]
    );
  }

  const totalDue = bills
    .filter(b => b.status !== 'paid')
    .reduce((sum, b) => sum + Number(b.totalAmount), 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary banner */}
      {totalDue > 0 && (
        <View style={styles.dueBanner}>
          <View>
            <Text style={styles.dueLabel}>Total Due</Text>
            <Text style={styles.dueAmount}>₹{totalDue.toLocaleString('en-IN')}</Text>
          </View>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#fff" />
        </View>
      )}

      <FlatList
        data={bills}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBills(); }} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt-outline" size={48} color={Colors.textDisabled} />
            <Text style={styles.emptyText}>No bills yet</Text>
          </View>
        }
        renderItem={({ item: bill }) => {
          const s = STATUS_STYLE[bill.status] ?? STATUS_STYLE.unpaid;
          const month = new Date(bill.billMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
          const due = new Date(bill.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          return (
            <View style={styles.billCard}>
              <View style={styles.billRow}>
                <View style={styles.billLeft}>
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <View>
                    <Text style={styles.billMonth}>{month}</Text>
                    <Text style={styles.billDue}>Due: {due}</Text>
                  </View>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>₹{Number(bill.totalAmount).toLocaleString('en-IN')}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                  </View>
                </View>
              </View>

              {bill.lateFee > 0 && (
                <Text style={styles.lateFee}>Late fee: ₹{Number(bill.lateFee).toLocaleString('en-IN')}</Text>
              )}

              {bill.notes && <Text style={styles.notes}>{bill.notes}</Text>}

              {bill.status !== 'paid' && (
                <Pressable
                  style={[styles.payBtn, payingId === bill.id && styles.payBtnDisabled]}
                  onPress={() => handlePay(bill)}
                  disabled={payingId === bill.id}
                >
                  {payingId === bill.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="cash-fast" size={18} color="#fff" />
                      <Text style={styles.payBtnText}>Pay via UPI</Text>
                    </>
                  )}
                </Pressable>
              )}

              {bill.status === 'paid' && bill.payments?.length > 0 && (
                <View style={styles.paidRow}>
                  <MaterialCommunityIcons name="check-circle" size={14} color={Colors.secondary} />
                  <Text style={styles.paidText}>
                    Paid on {new Date(bill.payments[0].paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {' '}via {bill.payments[0].paymentMethod.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dueBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.error, padding: Spacing.lg,
  },
  dueLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSizes.sm },
  dueAmount: { color: '#fff', fontSize: FontSizes.xxl, fontWeight: '800' },
  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 32 },
  billCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  billLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  billRight: { alignItems: 'flex-end', gap: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  billMonth: { fontWeight: '700', color: Colors.textPrimary },
  billDue: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  billAmount: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  statusText: { fontSize: FontSizes.xs, fontWeight: '700' },
  lateFee: { fontSize: FontSizes.xs, color: Colors.error },
  notes: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2, marginTop: 4,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSizes.md },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paidText: { fontSize: FontSizes.xs, color: Colors.secondary, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { color: Colors.textDisabled, fontSize: FontSizes.md },
});
