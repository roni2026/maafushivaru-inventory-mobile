import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Chip, Loading, EmptyState, ErrorView, Badge } from '../components/ui';
import { daysUntil, num } from '../lib/format';

export default function AlertsScreen() {
  const { supabase } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('Stock'); // Stock | Expiry

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchAll(() =>
        supabase
          .from('items')
          .select('id,part_number,name,unit,current_stock,min_stock,expiry_date,stores(name)')
          .eq('active', true)
      );
      setItems(rows);
    } catch (e) {
      setError(e?.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const alerts = useMemo(() => {
    if (mode === 'Stock') {
      return items
        .filter((i) => num(i.current_stock) <= num(i.min_stock))
        .map((i) => ({
          ...i,
          _out: num(i.current_stock) === 0,
        }))
        .sort((a, b) => (a._out === b._out ? 0 : a._out ? -1 : 1));
    }
    // Expiry
    return items
      .map((i) => ({ ...i, _days: daysUntil(i.expiry_date) }))
      .filter((i) => i._days !== null && i._days <= 30)
      .sort((a, b) => a._days - b._days);
  }, [items, mode]);

  const renderStock = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>#{item.part_number} · {item.stores?.name || '—'}</Text>
        <Badge label={item._out ? 'OUT OF STOCK' : 'LOW STOCK'} tone={item._out ? 'red' : 'orange'} />
      </View>
      <View style={styles.qtyBox}>
        <Text style={[styles.qty, { color: item._out ? colors.red : colors.orange }]}>{num(item.current_stock)}</Text>
        <Text style={styles.unit}>min {num(item.min_stock)} {item.unit}</Text>
      </View>
    </View>
  );

  const renderExpiry = ({ item }) => {
    const d = item._days;
    const tone = d < 0 ? 'red' : d <= 7 ? 'red' : d <= 15 ? 'orange' : 'yellow';
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>#{item.part_number} · {item.stores?.name || '—'}</Text>
          <Badge label={d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`} tone={tone} />
        </View>
        <Text style={styles.expDate}>{item.expiry_date}</Text>
      </View>
    );
  };

  if (loading) return <Loading text="Checking alerts…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.chips}>
          {['Stock', 'Expiry'].map((m) => (
            <Chip key={m} label={m === 'Stock' ? 'Low / Out of stock' : 'Expiring soon'} active={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <Text style={styles.count}>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</Text>
      </View>
      <FlatList
        data={alerts}
        keyExtractor={(i) => i.id}
        renderItem={mode === 'Stock' ? renderStock : renderExpiry}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
        ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" title="All clear!" subtitle="No alerts right now." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', gap: 8 },
  count: { color: colors.textFaint, fontSize: 12 },
  row: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2, marginBottom: 6 },
  qtyBox: { alignItems: 'flex-end', minWidth: 60 },
  qty: { fontSize: 18, fontWeight: '700' },
  unit: { color: colors.textFaint, fontSize: 11 },
  expDate: { color: colors.textDim, fontSize: 12 },
});
