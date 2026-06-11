import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, ScrollView, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

const AMENITY_ICONS: Record<string, string> = {
  clubhouse: 'home-city',
  gym: 'dumbbell',
  pool: 'pool',
  'party hall': 'party-popper',
  'tennis court': 'tennis',
  badminton: 'badminton',
  library: 'library',
  default: 'star-circle-outline',
};

export function AmenityBookingScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [amenities, setAmenities] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAmenity, setSelectedAmenity] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [slots, setSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingAmenity, setBookingAmenity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'browse' | 'mine'>('browse');

  const load = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const [amenRes, bookRes] = await Promise.all([
        api.get('/amenities', { params: { societyId: activeMembership.societyId } }),
        api.get('/amenities/bookings/mine', { params: { societyId: activeMembership.societyId } }),
      ]);
      setAmenities(amenRes.data.amenities);
      setBookings(bookRes.data.bookings);
    } catch {
      Alert.alert('Error', 'Could not load amenities.');
    } finally {
      setLoading(false);
    }
  }, [activeMembership?.societyId]);

  useEffect(() => { load(); }, [load]);

  async function loadSlots(amenityId: string, date: string) {
    setSlotsLoading(true);
    try {
      const res = await api.get(`/amenities/${amenityId}/availability`, { params: { date } });
      setSlots(res.data.slots);
    } catch {
      Alert.alert('Error', 'Could not load availability.');
    } finally {
      setSlotsLoading(false);
    }
  }

  async function handleBook(amenityId: string, slot: any) {
    setBookingAmenity(slot.startTime);
    try {
      await api.post(`/amenities/${amenityId}/book`, {
        bookDate: selectedDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        guests: 1,
      });
      Alert.alert('Booked!', `${selectedAmenity?.name} booked for ${selectedDate} at ${slot.startTime}`);
      setSelectedAmenity(null);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Booking failed.');
    } finally {
      setBookingAmenity(null);
    }
  }

  async function handleCancel(bookingId: string) {
    Alert.alert('Cancel Booking', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Booking', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/amenities/bookings/${bookingId}`);
            load();
          } catch {
            Alert.alert('Error', 'Could not cancel booking.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['browse', 'mine'] as const).map(tab => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'browse' ? 'Book Amenity' : `My Bookings${bookings.length ? ` (${bookings.length})` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'browse' ? (
        <FlatList
          data={amenities}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No amenities listed yet</Text>
            </View>
          }
          renderItem={({ item: amenity }) => {
            const iconName = AMENITY_ICONS[amenity.name.toLowerCase()] ?? AMENITY_ICONS.default;
            return (
              <Pressable
                style={styles.amenityCard}
                onPress={() => {
                  setSelectedAmenity(amenity);
                  loadSlots(amenity.id, selectedDate);
                }}
              >
                <View style={styles.amenityIcon}>
                  <MaterialCommunityIcons name={iconName as any} size={28} color={Colors.primary} />
                </View>
                <View style={styles.amenityInfo}>
                  <Text style={styles.amenityName}>{amenity.name}</Text>
                  {amenity.description && <Text style={styles.amenityDesc} numberOfLines={1}>{amenity.description}</Text>}
                  <View style={styles.amenityMeta}>
                    <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textSecondary} />
                    <Text style={styles.amenityMetaText}>{amenity.openTime}–{amenity.closeTime}</Text>
                    <MaterialCommunityIcons name="account-group-outline" size={12} color={Colors.textSecondary} />
                    <Text style={styles.amenityMetaText}>Max {amenity.maxCapacity}</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textDisabled} />
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-check-outline" size={48} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No upcoming bookings</Text>
            </View>
          }
          renderItem={({ item: booking }) => (
            <View style={[styles.bookingCard, booking.status === 'cancelled' && styles.bookingCardCancelled]}>
              <View style={styles.bookingInfo}>
                <Text style={styles.bookingAmenity}>{booking.amenity?.name}</Text>
                <Text style={styles.bookingTime}>
                  {new Date(booking.bookDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' '}{booking.startTime}–{booking.endTime}
                </Text>
              </View>
              {booking.status === 'confirmed' && (
                <Pressable style={styles.cancelBtn} onPress={() => handleCancel(booking.id)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              )}
              {booking.status === 'cancelled' && (
                <Text style={styles.cancelledTag}>Cancelled</Text>
              )}
            </View>
          )}
        />
      )}

      {/* Slot booking modal */}
      <Modal visible={!!selectedAmenity} animationType="slide" transparent onRequestClose={() => setSelectedAmenity(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{selectedAmenity?.name}</Text>
            <Text style={styles.modalSubtitle}>Select a date and time slot</Text>

            {/* Date strip - next 7 days */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateStrip}>
              {getNext7Days().map(d => (
                <Pressable
                  key={d}
                  style={[styles.dateChip, selectedDate === d && styles.dateChipActive]}
                  onPress={() => { setSelectedDate(d); loadSlots(selectedAmenity.id, d); }}
                >
                  <Text style={[styles.dateChipDay, selectedDate === d && styles.dateChipTextActive]}>
                    {new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}
                  </Text>
                  <Text style={[styles.dateChipNum, selectedDate === d && styles.dateChipTextActive]}>
                    {new Date(d).getDate()}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {slotsLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 20 }} />
            ) : (
              <ScrollView style={styles.slotsContainer}>
                <View style={styles.slotsGrid}>
                  {slots.map(slot => (
                    <Pressable
                      key={slot.startTime}
                      style={[styles.slotChip, !slot.available && styles.slotChipUnavailable]}
                      onPress={() => slot.available && handleBook(selectedAmenity.id, slot)}
                      disabled={!slot.available}
                    >
                      {bookingAmenity === slot.startTime ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={[styles.slotTime, !slot.available && styles.slotTimeUnavailable]}>
                          {slot.startTime}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
                {slots.length === 0 && (
                  <Text style={styles.noSlots}>No slots available for this date</Text>
                )}
              </ScrollView>
            )}

            <Pressable style={styles.closeBtn} onPress={() => setSelectedAmenity(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getNext7Days(): string[] {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 32 },
  amenityCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  amenityIcon: { width: 52, height: 52, borderRadius: Radius.md, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  amenityInfo: { flex: 1 },
  amenityName: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  amenityDesc: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  amenityMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  amenityMetaText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  bookingCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  bookingCardCancelled: { opacity: 0.6 },
  bookingInfo: { flex: 1 },
  bookingAmenity: { fontWeight: '700', color: Colors.textPrimary },
  bookingTime: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  cancelBtn: { backgroundColor: Colors.errorLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  cancelBtnText: { color: Colors.error, fontWeight: '700', fontSize: FontSizes.xs },
  cancelledTag: { color: Colors.textDisabled, fontWeight: '600', fontSize: FontSizes.xs },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { color: Colors.textDisabled, fontSize: FontSizes.md },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  modalSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  dateStrip: { marginBottom: Spacing.md },
  dateChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, marginRight: 8, backgroundColor: Colors.surfaceVariant },
  dateChipActive: { backgroundColor: Colors.primary },
  dateChipDay: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: '600' },
  dateChipNum: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.textPrimary },
  dateChipTextActive: { color: '#fff' },
  slotsContainer: { maxHeight: 200 },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  slotChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.primary, minWidth: 80, alignItems: 'center' },
  slotChipUnavailable: { backgroundColor: Colors.surfaceVariant },
  slotTime: { color: '#fff', fontWeight: '600', fontSize: FontSizes.sm },
  slotTimeUnavailable: { color: Colors.textDisabled },
  noSlots: { color: Colors.textDisabled, textAlign: 'center', paddingVertical: Spacing.lg },
  closeBtn: { paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.md },
  closeBtnText: { color: Colors.textSecondary, fontWeight: '600' },
});
