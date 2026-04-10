import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AuthStackParamList, Society } from '../../types';
import { Colors, Spacing, Radius, FontSizes } from '../../theme';
import { societiesApi } from '../../services/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'SocietySelect'>;

export function SocietySelectScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Society[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Manual code entry
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState('');

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const { data } = await societiesApi.search(q);
      setResults(data.societies);
      setSearched(true);
    } catch {
      Alert.alert('Error', 'Search failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(text: string) {
    setQuery(text);
    // Debounce via setTimeout — cancel previous
    const timer = setTimeout(() => search(text), 500);
    return () => clearTimeout(timer);
  }

  function selectSociety(society: Society) {
    Haptics.selectionAsync();
    navigation.navigate('ProfileSetup', { societyCode: society.societyCode });
  }

  function handleCodeJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 8) {
      Alert.alert('Invalid code', 'Society code must be 8 characters.');
      return;
    }
    navigation.navigate('ProfileSetup', { societyCode: trimmed });
  }

  function handleCreateSociety() {
    navigation.navigate('ProfileSetup', { societyCode: undefined });
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Find your society</Text>
        <Text style={styles.subtitle}>Search by name or enter the society code your committee shared</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search society name, area…"
          placeholderTextColor={Colors.textDisabled}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.md }}
        ListEmptyComponent={
          searched && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏘️</Text>
              <Text style={styles.emptyText}>No societies found</Text>
              <Text style={styles.emptyHint}>Try a different name or use the society code</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.societyCard} onPress={() => selectSociety(item)}>
            <View style={styles.societyAvatar}>
              <Text style={styles.societyAvatarText}>{item.name[0]}</Text>
            </View>
            <View style={styles.societyInfo}>
              <Text style={styles.societyName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.societyAddress} numberOfLines={1}>{item.address}</Text>
              <Text style={styles.societyMeta}>
                {item._count?.members ?? 0} members · {item.city}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textDisabled} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Join with code */}
      {showCodeInput ? (
        <View style={styles.codeSection}>
          <TextInput
            style={styles.codeInput}
            placeholder="Enter 8-digit code (e.g. AB12CD34)"
            placeholderTextColor={Colors.textDisabled}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            maxLength={8}
            autoCapitalize="characters"
          />
          <Pressable style={styles.codeBtn} onPress={handleCodeJoin}>
            <Text style={styles.codeBtnText}>Join →</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.outlineBtn} onPress={() => setShowCodeInput(true)}>
          <MaterialCommunityIcons name="key-outline" size={18} color={Colors.primary} />
          <Text style={styles.outlineBtnText}>Join with society code</Text>
        </Pressable>
      )}

      {/* Create new society */}
      <Pressable style={styles.createBtn} onPress={handleCreateSociety}>
        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={Colors.textSecondary} />
        <Text style={styles.createBtnText}>Register a new society</Text>
      </Pressable>

      <View style={{ height: Spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { padding: Spacing.lg, paddingTop: 56 },
  title: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: FontSizes.md, color: Colors.textPrimary },

  empty: { alignItems: 'center', paddingTop: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.textPrimary },
  emptyHint: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 4 },

  societyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  societyAvatar: {
    width: 44, height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  societyAvatarText: { fontSize: FontSizes.lg, fontWeight: '800', color: Colors.primary },
  societyInfo: { flex: 1 },
  societyName: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  societyAddress: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  societyMeta: { fontSize: FontSizes.xs, color: Colors.textDisabled, marginTop: 2 },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    gap: Spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: FontSizes.xs, color: Colors.textDisabled, fontWeight: '600' },

  codeSection: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  codeInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    letterSpacing: 2,
    fontWeight: '700',
  },
  codeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    justifyContent: 'center',
  },
  codeBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSizes.md },

  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  outlineBtnText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '600' },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  createBtnText: { fontSize: FontSizes.sm, color: Colors.textSecondary, fontWeight: '600' },
});
