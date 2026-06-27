import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { SearchBar, Chip, Loading, EmptyState, ErrorView, Badge } from '../components/ui';
import { daysUntil, num } from '../lib/format';

const CATEGORIES = ['All', 'Food', 'General', 'Beverage'];

// Active unless explicitly deactivated — tolerates a missing/NULL `active` column.
const isActiveItem = (i) => i && i.active !== false;

function expiryTone(days) {
  if (days === null) return null;
  if (days < 0) return { tone: 'red', label: 'EXPIRED' };
  if (days <= 7) return { tone: 'red', label: `${days}d left` };
  if (days <= 15) return { tone: 'orange', label: `${days}d left` };
  if (days <= 30) return { tone: 'yellow', label: `${days}d left` };
  return null;
}

export default function InventoryScreen({ navigation }) {
  const { supabase } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchAll(() =>
        supabase
          .from('items')
          .select('id,part_number,name,unit,current_stock,min_stock,expiry_date,notes,supplier,active,stores(name,category)')
          .order('name')
      );
      setItems(rows.filter(isActiveItem));
    } catch (e) {
      setError(e?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // Search by NAME, ID (part_number) and DESCRIPTION (notes / supplier).
  const filtered = useMemo(() => {
    let list = items;
    if (cat !== 'All') list = list.filter((i) => i.stores?.category === cat);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.part_number || '').toLowerCase().includes(q) ||
        (i.notes || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, search, cat]);

  const renderItem = ({ item }) => {
    const days = daysUntil(item.expiry_date);
    const exp = expiryTone(days);
    const isLow = num(item.current_stock) <= num(item.min_stock);
    const isOut = num(item.current_stock) === 0;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('ItemDetail', { item })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            #{item.part_number} · {item.stores?.name || '—'}
          </Text>
          <View style={styles.badges}>
            {isOut ? <Badge label="OUT OF STOCK" tone="red" />
              : isLow ? <Badge label="LOW STOCK" tone="orange" /> : null}
            {exp && <Badge label={exp.label} tone={exp.tone} />}
          </View>
        </View>
        <View style={styles.qtyBox}>
          <Text style={[styles.qty, isOut && { color: colors.red }, isLow && !isOut && { color: colors.orange }]}>
            {num(item.current_stock)}
          </Text>
          <Text style={styles.unit}>{item.unit}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </TouchableOpacity>
    );
  };

  if (loading) return <Loading text="Loading inventory…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, ID or description…"
        />
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />
          ))}
        </View>
        <Text style={styles.count}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
        ListEmptyComponent={<EmptyState icon="search" title="No items found" subtitle="Try a different search or category." />}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: { color: colors.textFaint, fontSize: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  qtyBox: { alignItems: 'flex-end', minWidth: 48 },
  qty: { color: colors.text, fontSize: 18, fontWeight: '700' },
  unit: { color: colors.textFaint, fontSize: 11 },
});
