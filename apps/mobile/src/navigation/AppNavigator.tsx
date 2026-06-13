import React from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppTabParamList } from '../types';
import { Colors } from '../theme';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

// Screens
import { HomeScreen } from '../screens/home/HomeScreen';
import { NewComplaintScreen } from '../screens/complaints/NewComplaintScreen';
import { ComplaintTrackerScreen } from '../screens/complaints/ComplaintTrackerScreen';
import { AIChatScreen } from '../screens/AIChatScreen';
import { PaymentsScreen } from '../screens/payments/PaymentsScreen';
import { GateScreen } from '../screens/visitors/GateScreen';
import { AnnouncementsScreen } from '../screens/announcements/AnnouncementsScreen';
import { AnnouncementDetailScreen } from '../screens/announcements/AnnouncementDetailScreen';
import { MarketplaceScreen } from '../screens/marketplace/MarketplaceScreen';
import { AmenityBookingScreen } from '../screens/amenities/AmenityBookingScreen';
import { SOSScreen } from '../screens/sos/SOSScreen';
import { ExpenseDashboardScreen } from '../screens/expenses/ExpenseDashboardScreen';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator<AppTabParamList>();

// More screen with links to all extra features
function MoreScreen({ navigation }: any) {
  const { user, activeMembership, logout } = useAuthStore();

  const items = [
    { label: 'Announcements', icon: 'bullhorn-outline', screen: 'Announcements' },
    { label: 'Marketplace', icon: 'store-outline', screen: 'Marketplace' },
    { label: 'Amenity Booking', icon: 'calendar-check-outline', screen: 'AmenityBooking' },
    { label: 'Expenses', icon: 'chart-pie', screen: 'ExpenseDashboard' },
    { label: 'Emergency SOS', icon: 'alarm-light-outline', screen: 'SOS', danger: true },
    { label: 'AI Assistant', icon: 'robot-outline', screen: 'AIChat' },
  ];

  function handleLogout() {
    Alert.alert(
      'Sign Out',
      'This will clear your session. You will need to log in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
      ]
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Profile card */}
      <View style={{
        backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 16,
        borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center',
        }}>
          <MaterialCommunityIcons name="account" size={26} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, color: Colors.textPrimary }}>{user?.name ?? 'Resident'}</Text>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>
            {activeMembership?.societyName} · Flat {activeMembership?.flatNumber}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.textDisabled, marginTop: 1 }}>{user?.phone}</Text>
        </View>
      </View>

      {/* Feature links */}
      {items.map(item => (
        <Pressable
          key={item.label}
          style={{
            backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 10,
            borderRadius: 12, borderWidth: 1, borderColor: item.danger ? '#FECACA' : Colors.border,
            flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16,
          }}
          onPress={() => navigation.navigate(item.screen)}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: item.danger ? '#FEE2E2' : Colors.primaryLight,
            justifyContent: 'center', alignItems: 'center',
          }}>
            <MaterialCommunityIcons
              name={item.icon as any}
              size={22}
              color={item.danger ? Colors.error : Colors.primary}
            />
          </View>
          <Text style={{ flex: 1, fontWeight: '600', color: item.danger ? Colors.error : Colors.textPrimary, fontSize: 15 }}>
            {item.label}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textDisabled} />
        </Pressable>
      ))}

      {/* Logout */}
      <Pressable
        onPress={handleLogout}
        style={{
          marginHorizontal: 16, marginTop: 24, marginBottom: 40,
          borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
          backgroundColor: Colors.surface, flexDirection: 'row',
          alignItems: 'center', padding: 16, gap: 16,
        }}
      >
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: Colors.surfaceVariant, justifyContent: 'center', alignItems: 'center',
        }}>
          <MaterialCommunityIcons name="logout" size={22} color={Colors.textSecondary} />
        </View>
        <Text style={{ flex: 1, fontWeight: '600', color: Colors.textSecondary, fontSize: 15 }}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

// Complaints list screen (simple wrapper showing all complaints)
function TicketsScreen({ navigation }: any) {
  const { activeMembership } = useAuthStore();
  const [complaints, setComplaints] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!activeMembership?.societyId) return;
    api.get('/complaints', { params: { societyId: activeMembership.societyId } })
      .then((r: any) => setComplaints(r.data.complaints))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeMembership?.societyId]);

  if (loading) {
    const { ActivityIndicator } = require('react-native');
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={Colors.primary} /></View>;
  }

  const { FlatList, Pressable, ScrollView } = require('react-native');

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Pressable
        style={{ margin: 16, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        onPress={() => navigation.navigate('NewComplaint')}
      >
        <MaterialCommunityIcons name="plus" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Raise New Complaint</Text>
      </Pressable>
      <FlatList
        data={complaints}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <MaterialCommunityIcons name="ticket-outline" size={48} color={Colors.textDisabled} />
            <Text style={{ color: Colors.textDisabled, fontSize: 15 }}>No complaints raised yet</Text>
          </View>
        }
        renderItem={({ item }: any) => {
          const PRIORITY_COLOR: Record<string, string> = { critical: Colors.error, high: '#FF6B35', medium: Colors.warning, low: Colors.secondary };
          const STATUS_COLOR: Record<string, string> = { open: Colors.warning, assigned: Colors.primary, in_progress: '#9C27B0', resolved: Colors.secondary, closed: Colors.textDisabled, escalated: Colors.error };
          return (
            <Pressable
              style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}
              onPress={() => navigation.navigate('ComplaintTracker', { complaintId: item.id })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ backgroundColor: PRIORITY_COLOR[item.priority] + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: PRIORITY_COLOR[item.priority], fontWeight: '700', fontSize: 11 }}>{item.priority.toUpperCase()}</Text>
                </View>
                <View style={{ backgroundColor: STATUS_COLOR[item.status] + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: STATUS_COLOR[item.status], fontWeight: '600', fontSize: 11 }}>{item.status.replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={{ fontWeight: '700', color: Colors.textPrimary, fontSize: 15 }} numberOfLines={2}>{item.title}</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{item.category} · Flat {item.flatNumber}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' as const },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { active: string; inactive: string }> = {
            Home: { active: 'home', inactive: 'home-outline' },
            Tickets: { active: 'ticket-confirmation', inactive: 'ticket-confirmation-outline' },
            Gate: { active: 'door', inactive: 'door-open' },
            Pay: { active: 'credit-card', inactive: 'credit-card-outline' },
            More: { active: 'dots-grid', inactive: 'dots-grid' },
          };
          const icon = icons[route.name];
          return <MaterialCommunityIcons name={(focused ? icon?.active : icon?.inactive) as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Tickets" component={TicketsScreen} options={{ title: 'My Complaints' }} />
      <Tab.Screen name="Gate" component={GateScreen} options={{ title: 'Gate & Visitors' }} />
      <Tab.Screen name="Pay" component={PaymentsScreen} options={{ title: 'Maintenance' }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={TabNavigator} />
      <RootStack.Screen name="NewComplaint" component={NewComplaintScreen} options={{ animation: 'slide_from_bottom' }} />
      <RootStack.Screen name="ComplaintTracker" component={ComplaintTrackerScreen} options={{ headerShown: true, title: 'Complaint Tracker', animation: 'slide_from_right', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
      <RootStack.Screen name="AIChat" component={AIChatScreen} options={{ animation: 'slide_from_bottom' }} />
      <RootStack.Screen name="Announcements" component={AnnouncementsScreen} options={{ headerShown: true, title: 'Announcements', animation: 'slide_from_right', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
      <RootStack.Screen name="AnnouncementDetail" component={AnnouncementDetailScreen} options={{ headerShown: true, title: '', animation: 'slide_from_right', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
      <RootStack.Screen name="Marketplace" component={MarketplaceScreen} options={{ headerShown: true, title: 'Marketplace', animation: 'slide_from_right', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
      <RootStack.Screen name="AmenityBooking" component={AmenityBookingScreen} options={{ headerShown: true, title: 'Book Amenity', animation: 'slide_from_right', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
      <RootStack.Screen name="SOS" component={SOSScreen} options={{ headerShown: true, title: 'Emergency SOS', animation: 'slide_from_bottom', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.error }} />
      <RootStack.Screen name="ExpenseDashboard" component={ExpenseDashboardScreen} options={{ headerShown: true, title: 'Society Expenses', animation: 'slide_from_right', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary }} />
    </RootStack.Navigator>
  );
}
