import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const QUICK_ACTIONS = [
  { key: 'complaint', icon: 'alert-circle-outline', label: 'Raise Complaint', color: Colors.error, bg: Colors.errorLight },
  { key: 'pay', icon: 'credit-card-outline', label: 'Pay Dues', color: Colors.primary, bg: Colors.primaryLight },
  { key: 'visitor', icon: 'door-open', label: 'Gate & Visitors', color: Colors.secondary, bg: Colors.secondaryLight },
  { key: 'announcements', icon: 'bullhorn-outline', label: 'Announcements', color: '#9C27B0', bg: '#F3E8FF' },
  { key: 'marketplace', icon: 'store-outline', label: 'Marketplace', color: '#FF6B35', bg: '#FFF3ED' },
  { key: 'amenities', icon: 'calendar-check-outline', label: 'Book Amenity', color: '#00897B', bg: '#E0F2F1' },
  { key: 'expenses', icon: 'chart-pie', label: 'Expenses', color: '#5C6BC0', bg: '#E8EAF6' },
  { key: 'ai_chat', icon: 'robot-outline', label: 'Ask AI', color: '#7B2FBE', bg: '#F3E8FF' },
];

export function HomeScreen({ navigation }: any) {
  const { user, activeMembership } = useAuthStore();
  const [stats, setStats] = useState({ openComplaints: 0, pendingVisitors: 0, dueAmount: 0 });

  useEffect(() => {
    loadStats();
  }, [activeMembership?.societyId]);

  async function loadStats() {
    if (!activeMembership?.societyId) return;
    try {
      const [complaintsRes, visitorsRes, billsRes] = await Promise.all([
        api.get('/complaints', { params: { societyId: activeMembership.societyId, myOnly: true } }).catch(() => null),
        api.get('/visitors', { params: { societyId: activeMembership.societyId, status: 'pending' } }).catch(() => null),
        api.get('/payments/bills', { params: { societyId: activeMembership.societyId, status: 'unpaid' } }).catch(() => null),
      ]);

      const openComplaints = complaintsRes?.data?.complaints?.filter((c: any) => !['closed', 'resolved'].includes(c.status)).length ?? 0;
      const pendingVisitors = visitorsRes?.data?.visitors?.length ?? 0;
      const dueAmount = billsRes?.data?.bills?.reduce((sum: number, b: any) => sum + Number(b.totalAmount), 0) ?? 0;

      setStats({ openComplaints, pendingVisitors, dueAmount });
    } catch {}
  }

  function handleQuickAction(key: string) {
    switch (key) {
      case 'complaint': navigation.navigate('NewComplaint'); break;
      case 'pay': navigation.navigate('Pay'); break;
      case 'visitor': navigation.navigate('Gate'); break;
      case 'announcements': navigation.navigate('Announcements'); break;
      case 'marketplace': navigation.navigate('Marketplace'); break;
      case 'amenities': navigation.navigate('AmenityBooking'); break;
      case 'expenses': navigation.navigate('ExpenseDashboard'); break;
      case 'ai_chat': navigation.navigate('AIChat'); break;
    }
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}, {firstName}</Text>
            {activeMembership && (
              <View style={styles.societyTag}>
                <MaterialCommunityIcons name="home-city" size={12} color={Colors.primary} />
                <Text style={styles.societyTagText} numberOfLines={1}>
                  {activeMembership.societyName} · Flat {activeMembership.flatNumber}
                </Text>
              </View>
            )}
          </View>
          <Pressable style={styles.avatar} onPress={() => navigation.navigate('SOS')}>
            <MaterialCommunityIcons name="alarm-light" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Pending visitor alert */}
        {stats.pendingVisitors > 0 && (
          <Pressable style={styles.pendingBanner} onPress={() => navigation.navigate('Gate')}>
            <MaterialCommunityIcons name="bell-ring" size={18} color="#fff" />
            <Text style={styles.pendingText}>
              {stats.pendingVisitors} visitor{stats.pendingVisitors > 1 ? 's' : ''} waiting at gate
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <Pressable style={styles.statCard} onPress={() => navigation.navigate('Tickets')}>
            <MaterialCommunityIcons name="ticket-outline" size={20} color={Colors.error} />
            <Text style={styles.statValue}>{stats.openComplaints}</Text>
            <Text style={styles.statLabel}>Open Complaints</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => navigation.navigate('Pay')}>
            <MaterialCommunityIcons name="currency-inr" size={20} color={Colors.primary} />
            <Text style={styles.statValue}>
              {stats.dueAmount > 0 ? `₹${(stats.dueAmount / 1000).toFixed(0)}k` : '—'}
            </Text>
            <Text style={styles.statLabel}>Due Amount</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => navigation.navigate('Gate')}>
            <MaterialCommunityIcons name="account-group-outline" size={20} color={Colors.secondary} />
            <Text style={styles.statValue}>{stats.pendingVisitors}</Text>
            <Text style={styles.statLabel}>At Gate</Text>
          </Pressable>
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map(action => (
            <Pressable key={action.key} style={styles.quickCard} onPress={() => handleQuickAction(action.key)}>
              <View style={[styles.quickIcon, { backgroundColor: action.bg }]}>
                <MaterialCommunityIcons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Emergency SOS strip */}
        <Pressable style={styles.sosBanner} onPress={() => navigation.navigate('SOS')}>
          <MaterialCommunityIcons name="alarm-light" size={22} color="#fff" />
          <View style={styles.sosInfo}>
            <Text style={styles.sosTitle}>Emergency SOS</Text>
            <Text style={styles.sosHint}>Instantly alerts guards, committee & residents</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: Spacing.lg, paddingTop: Spacing.md },
  greeting: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  societyTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  societyTagText: { fontSize: FontSizes.xs, color: Colors.primary, fontWeight: '600', maxWidth: 220 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center' },

  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.warning, padding: Spacing.md, marginHorizontal: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm },
  pendingText: { color: '#fff', fontWeight: '700', flex: 1, fontSize: FontSizes.sm },

  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm, marginTop: Spacing.sm },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center', lineHeight: 14 },

  sectionTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  quickCard: { width: '22%', aspectRatio: 0.9, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', gap: 6 },
  quickIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 10, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', lineHeight: 13 },

  sosBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.error, margin: Spacing.md, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.lg },
  sosInfo: { flex: 1 },
  sosTitle: { color: '#fff', fontWeight: '800', fontSize: FontSizes.md },
  sosHint: { color: 'rgba(255,255,255,0.75)', fontSize: FontSizes.xs },
});
