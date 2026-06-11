import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Alert, Vibration, Animated, Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

export function SOSScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [triggered, setTriggered] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(0);
  const pulseAnim = new Animated.Value(1);

  const loadAlerts = useCallback(async () => {
    if (!activeMembership?.societyId) return;
    try {
      const res = await api.get('/sos', { params: { societyId: activeMembership.societyId } });
      setActiveAlerts(res.data.alerts);
    } catch {}
  }, [activeMembership?.societyId]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // Pulse animation for SOS button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  async function handleSOS() {
    Alert.alert(
      'EMERGENCY SOS',
      'This will immediately alert the security guard, committee members, and nearby residents. Confirm only in a real emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND SOS NOW',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            Vibration.vibrate([0, 200, 100, 200, 100, 200]);
            try {
              await api.post('/sos', {
                societyId: activeMembership?.societyId,
                message: 'EMERGENCY! Immediate assistance required.',
              });
              setTriggered(true);
              setCountdown(60);
              loadAlerts();

              // Countdown
              const timer = setInterval(() => {
                setCountdown(prev => {
                  if (prev <= 1) { clearInterval(timer); return 0; }
                  return prev - 1;
                });
              }, 1000);
            } catch {
              Alert.alert('Error', 'Could not send SOS. Please call emergency services directly.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Emergency SOS</Text>
        <Text style={styles.headerSubtitle}>Press only in a real emergency</Text>
      </View>

      {/* SOS Button */}
      <View style={styles.sosContainer}>
        <Animated.View style={[styles.sosRing, styles.sosRing3, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[styles.sosRing, styles.sosRing2]} />
        <Pressable
          style={[styles.sosButton, triggered && styles.sosButtonActive, sending && styles.sosButtonSending]}
          onPress={handleSOS}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="alarm-light" size={48} color="#fff" />
              <Text style={styles.sosText}>{triggered ? 'SOS SENT' : 'SOS'}</Text>
            </>
          )}
        </Pressable>
      </View>

      {triggered && countdown > 0 && (
        <View style={styles.sentBanner}>
          <MaterialCommunityIcons name="check-circle" size={20} color={Colors.secondary} />
          <Text style={styles.sentText}>Alert sent! Help is on the way.</Text>
          <Text style={styles.countdown}>{countdown}s</Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.infoGrid}>
        {[
          { icon: 'shield-account', label: 'Guard alerted', color: Colors.primary },
          { icon: 'account-group', label: 'Committee notified', color: Colors.secondary },
          { icon: 'map-marker-radius', label: 'Nearby residents', color: Colors.warning },
        ].map(info => (
          <View key={info.label} style={styles.infoItem}>
            <MaterialCommunityIcons name={info.icon as any} size={28} color={info.color} />
            <Text style={styles.infoLabel}>{info.label}</Text>
          </View>
        ))}
      </View>

      {/* Emergency contacts */}
      <View style={styles.emergencyNumbers}>
        <Text style={styles.emergencyTitle}>Emergency Numbers</Text>
        {[
          { label: 'Police', number: '100' },
          { label: 'Ambulance', number: '108' },
          { label: 'Fire', number: '101' },
          { label: 'Women Helpline', number: '1091' },
        ].map(contact => (
          <View key={contact.label} style={styles.contactRow}>
            <Text style={styles.contactLabel}>{contact.label}</Text>
            <Text style={styles.contactNumber}>{contact.number}</Text>
          </View>
        ))}
      </View>

      {/* Active alerts (for guards/committee) */}
      {activeAlerts.length > 0 && (
        <View style={styles.activeAlerts}>
          <Text style={styles.activeAlertsTitle}>Active Alerts ({activeAlerts.length})</Text>
          {activeAlerts.slice(0, 3).map(alert => (
            <View key={alert.id} style={styles.alertItem}>
              <View style={styles.alertDot} />
              <View style={styles.alertInfo}>
                <Text style={styles.alertFlat}>Flat {alert.flatNumber} — {alert.raisedBy?.name}</Text>
                <Text style={styles.alertTime}>{getTimeAgo(alert.createdAt)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm, alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 4 },
  sosContainer: { alignItems: 'center', justifyContent: 'center', height: 240, marginVertical: Spacing.lg },
  sosRing: { position: 'absolute', borderRadius: 999 },
  sosRing3: { width: 220, height: 220, backgroundColor: 'rgba(234,67,53,0.1)' },
  sosRing2: { width: 180, height: 180, backgroundColor: 'rgba(234,67,53,0.15)' },
  sosButton: {
    width: 148, height: 148, borderRadius: 74,
    backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: Colors.error, shadowOpacity: 0.5, shadowRadius: 16,
  },
  sosButtonActive: { backgroundColor: '#C62828' },
  sosButtonSending: { backgroundColor: Colors.warning },
  sosText: { color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: 2 },
  sentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center',
    backgroundColor: Colors.secondaryLight, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, marginHorizontal: Spacing.lg, borderRadius: Radius.md,
  },
  sentText: { color: Colors.secondary, fontWeight: '700', flex: 1 },
  countdown: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSizes.sm },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  infoItem: { alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center', maxWidth: 80 },
  emergencyNumbers: {
    marginHorizontal: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  emergencyTitle: { fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  contactRow: { flexDirection: 'row', justifyContent: 'space-between' },
  contactLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  contactNumber: { color: Colors.error, fontWeight: '800', fontSize: FontSizes.md },
  activeAlerts: { marginHorizontal: Spacing.md, marginTop: Spacing.md, backgroundColor: Colors.errorLight, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error },
  activeAlertsTitle: { fontWeight: '700', color: Colors.error, marginBottom: Spacing.sm },
  alertItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  alertInfo: { flex: 1 },
  alertFlat: { fontWeight: '600', color: Colors.textPrimary, fontSize: FontSizes.sm },
  alertTime: { fontSize: FontSizes.xs, color: Colors.textSecondary },
});
