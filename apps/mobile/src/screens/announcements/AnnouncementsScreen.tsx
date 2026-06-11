import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const CATEGORY_STYLE: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  general: { color: Colors.primary, bg: Colors.primaryLight, icon: 'information-outline', label: 'General' },
  maintenance: { color: '#9C27B0', bg: '#F3E8FF', icon: 'tools', label: 'Maintenance' },
  event: { color: Colors.secondary, bg: Colors.secondaryLight, icon: 'calendar-star', label: 'Event' },
  emergency: { color: Colors.error, bg: Colors.errorLight, icon: 'alert-circle', label: 'Emergency' },
  rule: { color: '#795548', bg: '#EFEBE9', icon: 'book-open-outline', label: 'Rules' },
};

const PRIORITY_DOT: Record<string, string> = {
  normal: Colors.textDisabled,
  important: Colors.warning,
  urgent: Colors.error,
};

export function AnnouncementsScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const res = await api.get('/announcements', { params: { societyId: activeMembership.societyId } });
      setAnnouncements(res.data.announcements);
    } catch {
      Alert.alert('Error', 'Could not load announcements.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMembership?.societyId]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={announcements}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnnouncements(); }} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="bullhorn-outline" size={48} color={Colors.textDisabled} />
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        }
        renderItem={({ item: announcement }) => {
          const cat = CATEGORY_STYLE[announcement.category] ?? CATEGORY_STYLE.general;
          const date = new Date(announcement.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
          });
          return (
            <Pressable
              style={[styles.card, !announcement.isRead && styles.cardUnread]}
              onPress={() => navigation.navigate('AnnouncementDetail', { announcementId: announcement.id })}
            >
              {announcement.isPinned && (
                <View style={styles.pinRow}>
                  <MaterialCommunityIcons name="pin" size={12} color={Colors.primary} />
                  <Text style={styles.pinText}>Pinned</Text>
                </View>
              )}
              <View style={styles.cardHeader}>
                <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={14} color={cat.color} />
                  <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
                </View>
                <View style={styles.rightMeta}>
                  <View style={[styles.priorityDot, { backgroundColor: PRIORITY_DOT[announcement.priority] }]} />
                  {!announcement.isRead && <View style={styles.unreadDot} />}
                </View>
              </View>
              <Text style={styles.title} numberOfLines={2}>{announcement.title}</Text>
              <Text style={styles.body} numberOfLines={2}>{announcement.body}</Text>
              <View style={styles.footer}>
                <Text style={styles.author}>{announcement.postedBy?.name}</Text>
                <Text style={styles.date}>{date}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.xs,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  pinText: { fontSize: 10, color: Colors.primary, fontWeight: '700' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  catText: { fontSize: FontSizes.xs, fontWeight: '700' },
  rightMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  title: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  body: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  author: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: '500' },
  date: { fontSize: FontSizes.xs, color: Colors.textDisabled },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { color: Colors.textDisabled, fontSize: FontSizes.md },
});
