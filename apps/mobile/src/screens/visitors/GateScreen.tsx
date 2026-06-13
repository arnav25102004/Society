import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, RefreshControl, Modal, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const PURPOSE_ICON: Record<string, string> = {
  delivery: 'package-variant-closed',
  guest: 'account-outline',
  cab: 'car-outline',
  service: 'tools',
  other: 'help-circle-outline',
};

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: Colors.warning, bg: Colors.warningLight, label: 'Waiting' },
  approved: { color: Colors.secondary, bg: Colors.secondaryLight, label: 'Approved' },
  rejected: { color: Colors.error, bg: Colors.errorLight, label: 'Rejected' },
  expired: { color: Colors.textDisabled, bg: Colors.surfaceVariant, label: 'Expired' },
  pre_approved: { color: Colors.primary, bg: Colors.primaryLight, label: 'Auto-approved' },
};

export function GateScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const loadVisitors = useCallback(async (showAlertOnFail = false) => {
    if (!activeMembership?.societyId) return;
    try {
      const res = await api.get('/visitors', {
        params: { societyId: activeMembership.societyId },
      });
      setVisitors(res.data.visitors);
      setLoadError(false);
    } catch {
      if (showAlertOnFail) setLoadError(true);
      // Polling failures are silent — no Alert spam every 10s
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMembership?.societyId]);

  useEffect(() => {
    loadVisitors(true); // Show error state on first load
    const interval = setInterval(() => {
      loadVisitors(false); // Silent on polls
    }, 10000);
    return () => clearInterval(interval);
  }, [loadVisitors]);

  async function handleApprove(visitorId: string) {
    setActionLoading(true);
    try {
      await api.put(`/visitors/${visitorId}/approve`);
      setSelectedVisitor(null);
      loadVisitors();
      Alert.alert('Approved', 'Visitor has been allowed entry.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not approve visitor.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(visitorId: string) {
    setActionLoading(true);
    try {
      await api.put(`/visitors/${visitorId}/reject`);
      setSelectedVisitor(null);
      loadVisitors();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not reject visitor.');
    } finally {
      setActionLoading(false);
    }
  }

  const pendingCount = visitors.filter(v => v.status === 'pending').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="wifi-off" size={48} color={Colors.textDisabled} />
        <Text style={styles.errorText}>Could not load visitors</Text>
        <Text style={styles.errorHint}>Check your connection and backend is running</Text>
        <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); setLoadError(false); loadVisitors(true); }}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {pendingCount > 0 && (
        <View style={styles.pendingBanner}>
          <MaterialCommunityIcons name="bell-ring" size={20} color="#fff" />
          <Text style={styles.pendingText}>
            {pendingCount} visitor{pendingCount > 1 ? 's' : ''} waiting for approval
          </Text>
        </View>
      )}

      <FlatList
        data={visitors}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVisitors(); }} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="door-closed" size={48} color={Colors.textDisabled} />
            <Text style={styles.emptyText}>No visitors today</Text>
          </View>
        }
        renderItem={({ item: visitor }) => {
          const s = STATUS_STYLE[visitor.status] ?? STATUS_STYLE.pending;
          const timeAgo = getTimeAgo(visitor.createdAt);
          return (
            <Pressable style={styles.visitorCard} onPress={() => setSelectedVisitor(visitor)}>
              <View style={styles.visitorLeft}>
                <View style={[styles.purposeIcon, { backgroundColor: s.bg }]}>
                  <MaterialCommunityIcons name={PURPOSE_ICON[visitor.purpose] as any} size={22} color={s.color} />
                </View>
                <View style={styles.visitorInfo}>
                  <Text style={styles.visitorName}>{visitor.visitorName}</Text>
                  {visitor.companyName && <Text style={styles.visitorCompany}>{visitor.companyName}</Text>}
                  <Text style={styles.visitorMeta}>Flat {visitor.flatNumber} · {timeAgo}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Pre-approval shortcut */}
      <Pressable style={styles.fab} onPress={() => navigation.navigate('PreApproval')}>
        <MaterialCommunityIcons name="shield-check-outline" size={24} color="#fff" />
      </Pressable>

      {/* Visitor detail modal */}
      <Modal visible={!!selectedVisitor} animationType="slide" transparent onRequestClose={() => setSelectedVisitor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {selectedVisitor && (
              <>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>{selectedVisitor.visitorName}</Text>
                {selectedVisitor.companyName && (
                  <Text style={styles.modalCompany}>{selectedVisitor.companyName}</Text>
                )}
                <View style={styles.modalDetail}>
                  <MaterialCommunityIcons name="home-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.modalDetailText}>Flat {selectedVisitor.flatNumber}</Text>
                </View>
                <View style={styles.modalDetail}>
                  <MaterialCommunityIcons name={PURPOSE_ICON[selectedVisitor.purpose] as any} size={16} color={Colors.textSecondary} />
                  <Text style={styles.modalDetailText}>{selectedVisitor.purpose}</Text>
                </View>
                {selectedVisitor.visitorPhone && (
                  <View style={styles.modalDetail}>
                    <MaterialCommunityIcons name="phone-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.modalDetailText}>{selectedVisitor.visitorPhone}</Text>
                  </View>
                )}

                {selectedVisitor.visitorPhoto && (
                  <Image source={{ uri: selectedVisitor.visitorPhoto }} style={styles.visitorPhoto} resizeMode="cover" />
                )}

                {selectedVisitor.status === 'pending' && (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleReject(selectedVisitor.id)}
                      disabled={actionLoading}
                    >
                      <MaterialCommunityIcons name="close" size={20} color={Colors.error} />
                      <Text style={styles.rejectText}>Reject</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprove(selectedVisitor.id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="check" size={20} color="#fff" />
                          <Text style={styles.approveText}>Approve</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}

                <Pressable style={styles.closeBtn} onPress={() => setSelectedVisitor(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pendingBanner: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
    backgroundColor: Colors.warning, padding: Spacing.md,
  },
  pendingText: { color: '#fff', fontWeight: '700', fontSize: FontSizes.sm },
  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  visitorCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  visitorLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  purposeIcon: { width: 44, height: 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  visitorInfo: { flex: 1 },
  visitorName: { fontWeight: '700', color: Colors.textPrimary, fontSize: FontSizes.md },
  visitorCompany: { fontSize: FontSizes.xs, color: Colors.primary, fontWeight: '600' },
  visitorMeta: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: FontSizes.xs, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { color: Colors.textDisabled, fontSize: FontSizes.md },
  errorText: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.md },
  errorHint: { fontSize: FontSizes.sm, color: Colors.textDisabled, textAlign: 'center', marginHorizontal: Spacing.xl },
  retryBtn: { marginTop: Spacing.md, backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, gap: Spacing.sm,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  modalCompany: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: '600' },
  modalDetail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalDetailText: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  visitorPhoto: { width: '100%', height: 180, borderRadius: Radius.md, marginVertical: Spacing.sm },
  actionRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: Radius.md,
  },
  rejectBtn: { backgroundColor: Colors.errorLight, borderWidth: 1.5, borderColor: Colors.error },
  approveBtn: { backgroundColor: Colors.secondary },
  rejectText: { color: Colors.error, fontWeight: '700', fontSize: FontSizes.md },
  approveText: { color: '#fff', fontWeight: '700', fontSize: FontSizes.md },
  closeBtn: { paddingVertical: Spacing.sm, alignItems: 'center', marginTop: 4 },
  closeBtnText: { color: Colors.textSecondary, fontWeight: '600' },
});
