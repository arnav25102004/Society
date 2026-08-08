import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: Colors.warning, bg: Colors.warningLight, label: 'Waiting' },
  approved: { color: Colors.secondary, bg: Colors.secondaryLight, label: 'Approved' },
  rejected: { color: Colors.error, bg: Colors.errorLight, label: 'Rejected' },
  expired: { color: Colors.textDisabled, bg: Colors.surfaceVariant, label: 'Expired' },
  pre_approved: { color: Colors.primary, bg: Colors.primaryLight, label: 'Auto-approved' },
};

export function GuardHomeScreen({ navigation }: any) {
  const { activeMembership, user, logout } = useAuthStore();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exitingId, setExitingId] = useState<string | null>(null);

  const loadVisitors = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const res = await api.get('/visitors', { params: { societyId: activeMembership.societyId } });
      setVisitors(res.data.visitors);
    } catch {
      // silent — guard screen polls, don't spam alerts
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMembership?.societyId]);

  useEffect(() => {
    loadVisitors();
    const interval = setInterval(loadVisitors, 15000);
    return () => clearInterval(interval);
  }, [loadVisitors]);

  async function handleMarkExit(visitorId: string) {
    setExitingId(visitorId);
    try {
      await api.put(`/visitors/${visitorId}/exit`);
      loadVisitors();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not mark exit.');
    } finally {
      setExitingId(null);
    }
  }

  function handleLogout() {
    Alert.alert('Sign Out', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  }

  const insideNow = visitors.filter(v => v.entryTime && !v.exitTime).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Gate Duty</Text>
          <Text style={styles.headerSubtitle}>{user?.name ?? 'Guard'} · {activeMembership?.societyName}</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <MaterialCommunityIcons name="logout" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.statBanner}>
        <MaterialCommunityIcons name="account-group-outline" size={22} color="#fff" />
        <Text style={styles.statText}>{insideNow} visitor{insideNow !== 1 ? 's' : ''} currently inside</Text>
      </View>

      <Pressable style={styles.registerBtn} onPress={() => navigation.navigate('RegisterVisitor')}>
        <MaterialCommunityIcons name="camera-plus" size={26} color="#fff" />
        <Text style={styles.registerText}>Register New Visitor</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={visitors}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVisitors(); }} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<Text style={styles.listHeader}>Recent Visitors</Text>}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="door-closed" size={48} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No visitors registered yet</Text>
            </View>
          }
          renderItem={({ item: visitor }) => {
            const s = STATUS_STYLE[visitor.status] ?? STATUS_STYLE.pending;
            const canMarkExit = visitor.entryTime && !visitor.exitTime;
            return (
              <View style={styles.visitorCard}>
                <View style={styles.visitorLeft}>
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <View style={styles.visitorInfo}>
                    <Text style={styles.visitorName}>{visitor.visitorName}</Text>
                    <Text style={styles.visitorMeta}>Flat {visitor.flatNumber} · {visitor.purpose}</Text>
                  </View>
                </View>
                <View style={styles.visitorRight}>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                  </View>
                  {canMarkExit && (
                    <Pressable
                      style={styles.exitBtn}
                      onPress={() => handleMarkExit(visitor.id)}
                      disabled={exitingId === visitor.id}
                    >
                      {exitingId === visitor.id ? (
                        <ActivityIndicator size="small" color={Colors.error} />
                      ) : (
                        <Text style={styles.exitBtnText}>Mark Exit</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, paddingTop: Spacing.xl, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceVariant,
    justifyContent: 'center', alignItems: 'center',
  },
  statBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, padding: Spacing.md, marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.md,
  },
  statText: { color: '#fff', fontWeight: '700', fontSize: FontSizes.sm },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.secondary, marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.lg, paddingVertical: Spacing.lg,
  },
  registerText: { color: '#fff', fontWeight: '800', fontSize: FontSizes.lg },
  listContent: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 32 },
  listHeader: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  visitorCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  visitorLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  visitorInfo: { flex: 1 },
  visitorName: { fontWeight: '700', color: Colors.textPrimary, fontSize: FontSizes.md },
  visitorMeta: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  visitorRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: FontSizes.xs, fontWeight: '700' },
  exitBtn: {
    borderWidth: 1, borderColor: Colors.error, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  exitBtnText: { color: Colors.error, fontWeight: '700', fontSize: FontSizes.xs },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { color: Colors.textDisabled, fontSize: FontSizes.md },
});
