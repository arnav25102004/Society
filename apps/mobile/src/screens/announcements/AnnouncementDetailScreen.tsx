import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { api } from '../../services/api';

const CATEGORY_STYLE: Record<string, { color: string; bg: string; icon: string }> = {
  general: { color: Colors.primary, bg: Colors.primaryLight, icon: 'information-outline' },
  maintenance: { color: '#9C27B0', bg: '#F3E8FF', icon: 'tools' },
  event: { color: Colors.secondary, bg: Colors.secondaryLight, icon: 'calendar-star' },
  emergency: { color: Colors.error, bg: Colors.errorLight, icon: 'alert-circle' },
  rule: { color: '#795548', bg: '#EFEBE9', icon: 'book-open-outline' },
};

export function AnnouncementDetailScreen({ route, navigation }: any) {
  const { announcementId } = route.params;
  const [announcement, setAnnouncement] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/announcements/${announcementId}`)
      .then(res => setAnnouncement(res.data.announcement))
      .catch(() => Alert.alert('Error', 'Could not load announcement.'))
      .finally(() => setLoading(false));
  }, [announcementId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!announcement) return null;

  const cat = CATEGORY_STYLE[announcement.category] ?? CATEGORY_STYLE.general;
  const date = new Date(announcement.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {announcement.isPinned && (
        <View style={styles.pinBadge}>
          <MaterialCommunityIcons name="pin" size={14} color={Colors.primary} />
          <Text style={styles.pinText}>Pinned announcement</Text>
        </View>
      )}

      <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
        <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
        <Text style={[styles.catText, { color: cat.color }]}>{announcement.category.toUpperCase()}</Text>
      </View>

      <Text style={styles.title}>{announcement.title}</Text>

      <View style={styles.authorRow}>
        <View style={styles.authorAvatar}>
          <Text style={styles.authorAvatarText}>{announcement.postedBy?.name?.[0] ?? '?'}</Text>
        </View>
        <View>
          <Text style={styles.authorName}>{announcement.postedBy?.name}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.body}>{announcement.body}</Text>

      {announcement.attachments?.length > 0 && (
        <View style={styles.attachments}>
          <Text style={styles.attachLabel}>Attachments ({announcement.attachments.length})</Text>
          {announcement.attachments.map((url: string, i: number) => (
            <View key={i} style={styles.attachItem}>
              <MaterialCommunityIcons name="paperclip" size={16} color={Colors.primary} />
              <Text style={styles.attachUrl} numberOfLines={1}>Attachment {i + 1}</Text>
            </View>
          ))}
        </View>
      )}

      {announcement.readCount !== undefined && (
        <View style={styles.readReceipts}>
          <MaterialCommunityIcons name="eye-outline" size={16} color={Colors.textDisabled} />
          <Text style={styles.readText}>{announcement.readCount} people have read this</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pinBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start' },
  pinText: { fontSize: FontSizes.xs, color: Colors.primary, fontWeight: '600' },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, alignSelf: 'flex-start' },
  catText: { fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary, lineHeight: 32 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  authorAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  authorAvatarText: { color: '#fff', fontWeight: '800' },
  authorName: { fontWeight: '600', color: Colors.textPrimary },
  date: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  divider: { height: 1, backgroundColor: Colors.divider },
  body: { fontSize: FontSizes.md, color: Colors.textPrimary, lineHeight: 26 },
  attachments: { gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  attachLabel: { fontWeight: '600', color: Colors.textSecondary, fontSize: FontSizes.sm },
  attachItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachUrl: { color: Colors.primary, fontSize: FontSizes.sm, flex: 1 },
  readReceipts: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: Spacing.sm },
  readText: { fontSize: FontSizes.xs, color: Colors.textDisabled },
});
