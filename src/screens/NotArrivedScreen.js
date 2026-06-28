import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Loading, ErrorView, EmptyState, Badge, SearchBar, SelectField } from '../components/ui';
import { fmtDate, num } from '../lib/format';

// Boat-note lines flagged "not arrived" or "wrong item", across every note, so
// the team can track what is still outstanding — filterable by store/department.
export default function NotArrivedScreen() {
  const { supabase } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const load = useCallback(async () => {
    if (!supabase) { setErr('Not connected.'); setLoading(false); return; }
    try {
      const data = await fetchAll(() =>
        supabase.from('boat_note_items')
          .select('id,part_number,product_name,unit,ordered_qty,department,status,note,boat_note_id,boat_notes(note_date,label)')
          .in('status', ['not_arrived', 'wrong_item'])
      );
      const list = (data || []).map((r) => ({
        ...r,
        note_date: r.boat_notes?.note_date || null,
        note_label: r.boat_notes?.label || '',
      }));
      list.sort((a, b) => String(b.note_date || '').localeCompare(String(a.note_date || '')));
      setRows(list);
      setErr(null);
    } catch (e) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deptOptions = useMemo(() => {
    const ds = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
    return [{ label: 'All stores / depts', value: '' }, ...ds.map((d) => ({ label: d, value: d }))];
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (deptFilter) list = list.filter((r) => r.department === deptFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.product_name} ${r.part_number} ${r.note_label} ${r.note}`.toLowerCase().includes(q));
    return list;
  }, [rows, deptFilter, search]);

  const resolve = (r) => {
    Alert.alert('Resolve', `Move "${r.product_name}" back to pending (problem resolved)?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: async () => {
        const { error } = await supabase.from('boat_note_items').update({ status: 'pending' }).eq('id', r.id);
        if (error) return Alert.alert('Error', error.message);
        setRows((prev) => prev.filter((x) => x.id !== r.id));
      } },
    ]);
  };

  if (loading) return <Loading text="Loading…" />;
  if (err && !rows.length) return <ErrorView message={err} onRetry={load} />;

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.name} numberOfLines={2}>{item.product_name || 'Item'}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            #{item.part_number || '—'} · ordered {num(item.ordered_qty)} {item.unit || ''}
          </Text>
          <View style={styles.badges}>
            {!!item.department && <Badge label={item.department} tone="sky" />}
            <Badge label={item.status === 'wrong_item' ? 'wrong item' : 'not arrived'} tone={item.status === 'wrong_item' ? 'orange' : 'red'} />
            {!!item.note_date && <Badge label={fmtDate(item.note_date)} tone="dim" />}
          </View>
          {!!item.note && <Text style={styles.note}>⚠ {item.note}</Text>}
          {!!item.note_label && <Text style={styles.noteLabel}>{item.note_label}</Text>}
        </View>
        <TouchableOpacity style={styles.resolveBtn} onPress={() => resolve(item)}>
          <Ionicons name="checkmark-done-outline" size={16} color={colors.green} />
          <Text style={styles.resolveText}>Resolve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {deptOptions.length > 1 && (
          <SelectField label="Filter by store / department" value={deptFilter} options={deptOptions} onChange={setDeptFilter} />
        )}
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search outstanding items…" />
        <Text style={styles.count}>{filtered.length} outstanding line{filtered.length !== 1 ? 's' : ''}</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryLight} />}
        ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" title="Nothing outstanding" subtitle="Items flagged not arrived / wrong will show here." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  count: { color: colors.textFaint, fontSize: 12 },
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  note: { color: colors.orange, fontSize: 12, marginTop: 6 },
  noteLabel: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.green, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
  resolveText: { color: colors.green, fontSize: 12, fontWeight: '600' },
});
