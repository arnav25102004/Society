/**
 * Auth Store — persisted to expo-secure-store.
 * Tokens survive app restarts and OTA updates; cleared only on uninstall or explicit logout.
 * This is the "remember me until app is deleted" mechanism.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, Membership, Tokens } from '../types';

interface AuthState {
  // Data
  user: User | null;
  tokens: Tokens | null;
  memberships: Membership[];
  activeMembership: Membership | null; // Currently selected society

  // Status
  isLoading: boolean;   // True during hydration on app start
  isLoggedIn: boolean;

  // Actions
  hydrate: () => Promise<void>;
  setSession: (user: User, tokens: Tokens, memberships: Membership[]) => Promise<void>;
  setActiveMembership: (membership: Membership) => Promise<void>;
  addMembership: (membership: Membership) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => Promise<void>;
}

const KEYS = {
  accessToken: 'sh_access_token',
  refreshToken: 'sh_refresh_token',
  user: 'sh_user',
  memberships: 'sh_memberships',
  activeMembershipId: 'sh_active_membership_id',
} as const;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  memberships: [],
  activeMembership: null,
  isLoading: true,
  isLoggedIn: false,

  /**
   * Called once on app start — reads persisted tokens from SecureStore.
   * If tokens exist, the user is auto-logged in without any server call.
   * The API service will refresh the access token automatically if expired.
   */
  hydrate: async () => {
    try {
      const [accessToken, refreshToken, userJson, membershipsJson, activeMembershipId] =
        await Promise.all([
          SecureStore.getItemAsync(KEYS.accessToken),
          SecureStore.getItemAsync(KEYS.refreshToken),
          SecureStore.getItemAsync(KEYS.user),
          SecureStore.getItemAsync(KEYS.memberships),
          SecureStore.getItemAsync(KEYS.activeMembershipId),
        ]);

      if (!accessToken || !refreshToken || !userJson) {
        set({ isLoading: false, isLoggedIn: false });
        return;
      }

      const user: User = JSON.parse(userJson);
      const memberships: Membership[] = membershipsJson ? JSON.parse(membershipsJson) : [];
      const activeMembership =
        memberships.find((m) => m.id === activeMembershipId) ??
        memberships.find((m) => m.status === 'approved') ??
        null;

      set({
        user,
        tokens: { accessToken, refreshToken },
        memberships,
        activeMembership,
        isLoggedIn: true,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, isLoggedIn: false });
    }
  },

  /**
   * Persists session after successful OTP verification.
   */
  setSession: async (user, tokens, memberships) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken),
      SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken),
      SecureStore.setItemAsync(KEYS.user, JSON.stringify(user)),
      SecureStore.setItemAsync(KEYS.memberships, JSON.stringify(memberships)),
    ]);

    const activeMembership = memberships.find((m) => m.status === 'approved') ?? null;
    if (activeMembership) {
      await SecureStore.setItemAsync(KEYS.activeMembershipId, activeMembership.id);
    }

    set({ user, tokens, memberships, activeMembership, isLoggedIn: true });
  },

  /**
   * Switch the active society (for users belonging to multiple societies).
   */
  setActiveMembership: async (membership) => {
    await SecureStore.setItemAsync(KEYS.activeMembershipId, membership.id);
    set({ activeMembership: membership });
  },

  addMembership: (membership) => {
    const { memberships } = get();
    const updated = [...memberships, membership];
    set({ memberships: updated });
    SecureStore.setItemAsync(KEYS.memberships, JSON.stringify(updated));
  },

  updateUser: (updates) => {
    const { user } = get();
    if (!user) return;
    const updated = { ...user, ...updates };
    set({ user: updated });
    SecureStore.setItemAsync(KEYS.user, JSON.stringify(updated));
  },

  /**
   * Clears all persisted data — user sees login screen on next open.
   */
  logout: async () => {
    await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
    set({
      user: null,
      tokens: null,
      memberships: [],
      activeMembership: null,
      isLoggedIn: false,
    });
  },
}));
