import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';

// Quick action definition
type QuickAction = {
  icon: string;
  label: string;
  color: string;
  bg: string;
  badge?: string;
};

type QuickActionKey = 'complaint' | 'pay' | 'visitor' | 'ai_chat';

const QUICK_ACTIONS: (QuickAction & { key: QuickActionKey })[] = [
  { key: 'complaint', icon: 'alert-circle-outline', label: 'Raise Complaint', color: Colors.error, bg: Colors.errorLight },
  { key: 'pay', icon: 'credit-card-outline', label: 'Pay Dues', color: Colors.primary, bg: Colors.primaryLight, badge: '₹3,500' },
  { key: 'visitor', icon: 'door-open', label: 'Pre-approve Visitor', color: Colors.secondary, bg: Colors.secondaryLight },
  { key: 'ai_chat', icon: 'robot-outline', label: 'Ask AI', color: '#7B2FBE', bg: '#F3E8FF' },
];

export function HomeScreen({ navigation }: any) {
  const { user, activeMembership } = useAuthStore();

  function handleQuickAction(key: QuickActionKey) {
    if (key === 'complaint') navigation.navigate('NewComplaint');
    else if (key === 'ai_chat') navigation.navigate('AIChat');
    // Pay and Visitor handled in their own tabs
  }

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}, {firstName} 👋</Text>
            {activeMembership && (
              <View style={styles.societyTag}>
                <MaterialCommunityIcons name="home-city" size={12} color={Colors.primary} />
                <Text style={styles.societyTagText} numberOfLines={1}>
                  {activeMembership.societyName} · Flat {activeMembership.flatNumber}
                </Text>
              </View>
            )}
          </View>
          <Pressable style={styles.avatar}>
            <Text style={styles.avatarText}>{firstName[0]?.toUpperCase()}</Text>
          </Pressable>
        </View>

        {/* Pending approval banner (if any pending memberships) */}
        {/* In a full build this would check for pending visitors waiting */}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable key={action.label} style={styles.quickCard} onPress={() => handleQuickAction(action.key)}>
              <View style={[styles.quickIcon, { backgroundColor: action.bg }]}>
                <MaterialCommunityIcons name={action.icon as any} size={24} color={action.color} />
                {action.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{action.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Society stats */}
        {activeMembership && (
          <>
            <Text style={styles.sectionTitle}>Society at a glance</Text>
            <View style={styles.statsRow}>
              {[
                { label: 'Open Complaints', value: '—', icon: 'ticket-outline', color: Colors.error },
                { label: 'Due This Month', value: '—', icon: 'currency-inr', color: Colors.primary },
                { label: 'Visitors Today', value: '—', icon: 'account-group-outline', color: Colors.secondary },
              ].map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <MaterialCommunityIcons name={stat.icon as any} size={20} color={stat.color} />
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Recent activity */}
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <View style={styles.emptyActivity}>
          <MaterialCommunityIcons name="history" size={40} color={Colors.textDisabled} />
          <Text style={styles.emptyText}>No recent activity</Text>
          <Text style={styles.emptyHint}>Activity from complaints, payments, and visitors will appear here.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  greeting: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  societyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  societyTagText: { fontSize: FontSizes.xs, color: Colors.primary, fontWeight: '600', maxWidth: 220 },
  avatar: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: FontSizes.md, fontWeight: '800', color: '#fff' },

  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },

  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  quickCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  quickIcon: {
    width: 44, height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4, right: -8,
    backgroundColor: Colors.error,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  quickLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textPrimary },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center', lineHeight: 14 },

  emptyActivity: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  emptyText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: FontSizes.sm, color: Colors.textDisabled, textAlign: 'center', lineHeight: 20 },
});
