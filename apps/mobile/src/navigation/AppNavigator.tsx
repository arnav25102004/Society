import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text } from 'react-native';

import { AppTabParamList } from '../types';
import { Colors } from '../theme';
import { HomeScreen } from '../screens/home/HomeScreen';
import { NewComplaintScreen } from '../screens/complaints/NewComplaintScreen';
import { ComplaintTrackerScreen } from '../screens/complaints/ComplaintTrackerScreen';
import { AIChatScreen } from '../screens/AIChatScreen';

const Placeholder = ({ label }: { label: string }) => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>{label} — Coming soon</Text>
  </View>
);

// ─── Root stack wraps tabs + modal screens ────────────────────────────────────
const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator<AppTabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
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
          return (
            <MaterialCommunityIcons
              name={(focused ? icon.active : icon.inactive) as any}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tickets" component={() => <Placeholder label="Complaints" />} />
      <Tab.Screen name="Gate" component={() => <Placeholder label="Gate & Visitors" />} />
      <Tab.Screen name="Pay" component={() => <Placeholder label="Payments" />} />
      <Tab.Screen name="More" component={() => <Placeholder label="More" />} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={TabNavigator} />
      {/* Modal screens accessible from anywhere in the app */}
      <RootStack.Screen
        name="NewComplaint"
        component={NewComplaintScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <RootStack.Screen
        name="ComplaintTracker"
        component={ComplaintTrackerScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="AIChat"
        component={AIChatScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </RootStack.Navigator>
  );
}
