import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, RefreshControl, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const CATEGORY_ICONS: Record<string, string> = {
  electronics: 'laptop',
  furniture: 'sofa-outline',
  appliances: 'washing-machine',
  clothing: 'hanger',
  books: 'book-open-outline',
  vehicles: 'car-outline',
  sports: 'basketball',
  kids: 'baby-carriage',
  other: 'package-variant-closed',
};

const CATEGORIES = ['all', 'electronics', 'furniture', 'appliances', 'clothing', 'books', 'vehicles', 'sports', 'kids', 'other'];

export function MarketplaceScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  const loadListings = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const params: any = { societyId: activeMembership.societyId };
      if (activeCategory !== 'all') params.category = activeCategory;
      const res = await api.get('/marketplace', { params });
      setListings(res.data.listings);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMembership?.societyId, activeCategory]);

  useEffect(() => { loadListings(); }, [loadListings]);

  async function handleInterest(listing: any) {
    try {
      await api.post(`/marketplace/${listing.id}/interest`);
      Alert.alert('Interest expressed!', `${listing.seller?.name} will be notified.`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not express interest.');
    }
  }

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
        <MaterialCommunityIcons name="store-outline" size={48} color={Colors.textDisabled} />
        <Text style={styles.errorText}>Could not load marketplace</Text>
        <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); setLoadError(false); loadListings(); }}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category filter */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={c => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item: cat }) => (
          <Pressable
            style={[styles.filterChip, activeCategory === cat && styles.filterChipActive]}
            onPress={() => setActiveCategory(cat)}
          >
            {cat !== 'all' && (
              <MaterialCommunityIcons
                name={CATEGORY_ICONS[cat] as any}
                size={14}
                color={activeCategory === cat ? '#fff' : Colors.textSecondary}
              />
            )}
            <Text style={[styles.filterText, activeCategory === cat && styles.filterTextActive]}>
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Text>
          </Pressable>
        )}
      />

      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadListings(); }} />}
        contentContainerStyle={styles.listContent}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="store-outline" size={48} color={Colors.textDisabled} />
            <Text style={styles.emptyText}>No listings yet</Text>
            <Text style={styles.emptyHint}>Be the first to list something!</Text>
          </View>
        }
        renderItem={({ item: listing }) => (
          <Pressable
            style={styles.listingCard}
            onPress={() => navigation.navigate('ListingDetail', { listingId: listing.id })}
          >
            {listing.photos?.length > 0 ? (
              <Image source={{ uri: listing.photos[0] }} style={styles.listingImage} resizeMode="cover" />
            ) : (
              <View style={[styles.listingImage, styles.listingImagePlaceholder]}>
                <MaterialCommunityIcons name={CATEGORY_ICONS[listing.category] as any} size={32} color={Colors.textDisabled} />
              </View>
            )}
            <View style={styles.listingInfo}>
              <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
              {listing.isGiveaway ? (
                <View style={styles.freeTag}>
                  <Text style={styles.freeTagText}>FREE</Text>
                </View>
              ) : (
                <Text style={styles.listingPrice}>₹{Number(listing.price).toLocaleString('en-IN')}</Text>
              )}
              <View style={styles.listingMeta}>
                <Text style={styles.sellerName}>{listing.seller?.name?.split(' ')[0]}</Text>
                {listing._count?.interests > 0 && (
                  <View style={styles.interestCount}>
                    <MaterialCommunityIcons name="eye" size={10} color={Colors.textDisabled} />
                    <Text style={styles.interestText}>{listing._count.interests}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* FAB: New listing */}
      <Pressable style={styles.fab} onPress={() => navigation.navigate('NewListing')}>
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  listContent: { padding: Spacing.md, paddingBottom: 80, gap: Spacing.sm },
  columnWrapper: { gap: Spacing.sm },
  listingCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  listingImage: { width: '100%', height: 120 },
  listingImagePlaceholder: { backgroundColor: Colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
  listingInfo: { padding: Spacing.sm, gap: 4 },
  listingTitle: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textPrimary },
  listingPrice: { fontSize: FontSizes.md, fontWeight: '800', color: Colors.primary },
  freeTag: { backgroundColor: Colors.secondaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, alignSelf: 'flex-start' },
  freeTagText: { fontSize: FontSizes.xs, color: Colors.secondary, fontWeight: '800' },
  listingMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sellerName: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  interestCount: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  interestText: { fontSize: FontSizes.xs, color: Colors.textDisabled },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { color: Colors.textSecondary, fontSize: FontSizes.md, fontWeight: '600' },
  emptyHint: { color: Colors.textDisabled, fontSize: FontSizes.sm },
  errorText: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.md },
  retryBtn: { marginTop: Spacing.md, backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  retryBtnText: { color: '#fff', fontWeight: '700' },
});
