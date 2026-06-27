import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Loading, EmptyState, ErrorView, Badge, FAB } from '../components/ui';

const ORDER = ['Food', 'General', 'Beverage'];

export default function StoresScreen({ navigation }) {
  const { supabase } = useApp();
  const [stores, setStores] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchAll(() => supabase.from('stores').select('id,name,category').order('name'));
      setStores(rows);
      // Item counts per store (best-effort).
      try {
        const items = await fetchAll(() => supabase.from('items').select('store_id'));
        const c = {};
        items.forEach((i) => { c[i.store_id] = (c[i.store_id] || 0) + 1; });
        setCounts(c);
      } catch { setCounts({}); }
    } catch (e) {
      setError(e?.message || 'Failed to load stores');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  // useFocusEffect runs on mount and every time the screen regains focus.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Manage stores' });
  }, [navigation]);

  const sections = ORDER.map((cat) => ({
    title: cat,
    data: stores.filter((s) => s.category === cat),
  }))
    .concat(
      // Any unexpected categories present in data.
      [...new Set(stores.map((s) => s.category))]
        .filter((c) => !ORDER.includes(c))
        .map((cat) => ({ title: cat, data: stores.filter((s) => s.category === cat) }))
    )
    .filter((s) => s.data.length > 0);

  const remove = (store) => {
    const n = counts[store.id] || 0;
    if (n > 0) {
      Alert.alert('Cannot delete', `“${store.name}” still has ${n} item${n !== 1 ? 's' : ''}. Move or delete those items first.`);
      return;
    }
    Alert.alert('Delete store', `Delete “${store.name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('stores').delete().eq('id', store.id);
            if (error) throw error;
            load();
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'error');
          }
        },
      },
    ]);
  };

  if (loading) return <Loading text="Loading stores…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryLight} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('StoreForm', { store: item })}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{counts[item.id] || 0} item{(counts[item.id] || 0) !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('StoreForm', { store: item })}>
              <Ionicons name="create-outline" size={20} color={colors.primaryLight} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => remove(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<EmptyState icon="business-outline" title="No stores yet" subtitle="Tap + to add your first store." />}
      />
      <FAB icon="add" onPress={() => navigation.navigate('StoreForm')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  sectionHeader: {
    color: colors.textDim, fontSize: 13, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 8 },
});
