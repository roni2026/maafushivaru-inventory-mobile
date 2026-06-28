import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { SearchBar, Chip, Loading, EmptyState, ErrorView, Badge } from '../components/ui';
import { daysUntil, fmtDate } from '../lib/format';

const isActive = (i) => i && i.active !== false;
const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Quick expiry presets for fast bulk-setting.
function plusDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function ExpiryManagerScreen() {
  const { supabase } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | dated | undated | expiring
  const [selected, setSelected] = useState({});
  const [dateInput, setDateInput] = useState(plusDays(30));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchAll(() =>
        supabase.from('items').select('id,name,part_number,unit,current_stock,expiry_date,active,stores(name,category)').order('name'));
      setItems(rows.filter(isActive));
    } catch (e) {
      setError(e?.message || 'Failed to load items');
    } finally { setLoading(false); setRefreshing(false); }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => (i.name || '').toLowerCase().includes(q) || (i.part_number || '').toLowerCase().includes(q));
    if (filter === 'dated')   list = list.filter((i) => !!i.expiry_date);
    if (filter === 'undated') list = list.filter((i) => !i.expiry_date);
    if (filter === 'expiring') list = list.filter((i) => { const d = daysUntil(i.expiry_date); return d !== null && d <= 30; });
    return list;
  }, [items, search, filter]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const selCount = selectedIds.length;

  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectAllVisible = () => {
    const next = { ...selected };
    const allOn = filtered.every((i) => selected[i.id]);
    filtered.forEach((i) => { next[i.id] = !allOn; });
    setSelected(next);
  };

  const applyDate = async () => {
    if (!isoOk(dateInput)) return Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
    if (!selCount) return Alert.alert('Select items', 'Tick at least one item first.');
    await bulkUpdate(dateInput);
  };
  const clearDate = async () => {
    if (!selCount) return Alert.alert('Select items', 'Tick at least one item first.');
    Alert.alert('Clear expiry', `Remove the expiry date from ${selCount} item(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => bulkUpdate(null) },
    ]);
  };

  const bulkUpdate = async (value) => {
    setBusy(true);
    try {
      // Update in chunks to stay well within request limits.
      const ids = selectedIds;
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error } = await supabase.from('items').update({ expiry_date: value }).in('id', chunk);
        if (error) throw error;
      }
      setItems((prev) => prev.map((it) => (selected[it.id] ? { ...it, expiry_date: value } : it)));
      setSelected({});
      Alert.alert('Done', value ? `Set expiry on ${ids.length} item(s).` : `Cleared expiry on ${ids.length} item(s).`);
    } catch (e) {
      Alert.alert('Could not update', e?.message || 'error');
    } finally { setBusy(false); }
  };

  const renderItem = ({ item }) => {
    const d = daysUntil(item.expiry_date);
    const on = !!selected[item.id];
    let tone = 'dim', label = item.expiry_date ? fmtDate(item.expiry_date) : 'No date';
    if (d !== null) {
      if (d < 0) { tone = 'red'; label = `Expired · ${fmtDate(item.expiry_date)}`; }
      else if (d <= 7) tone = 'red';
      else if (d <= 30) tone = 'yellow';
      else tone = 'green';
    }
    return (
      <TouchableOpacity style={[styles.row, on && styles.rowOn]} onPress={() => toggle(item.id)} activeOpacity={0.7}>
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primaryLight : colors.textFaint} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>#{item.part_number} · {item.stores?.name || '—'}</Text>
        </View>
        <Badge label={label} tone={tone} />
      </TouchableOpacity>
    );
  };

  if (loading) return <Loading text="Loading items…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search items to set expiry…" />
        <View style={styles.chips}>
          {[['all','All'],['undated','No date'],['dated','Has date'],['expiring','≤30d']].map(([k, l]) => (
            <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />
          ))}
        </View>
        <View style={styles.selRow}>
          <TouchableOpacity onPress={selectAllVisible}><Text style={styles.link}>{filtered.every((i) => selected[i.id]) && filtered.length ? 'Unselect all' : 'Select all'}</Text></TouchableOpacity>
          <Text style={styles.count}>{selCount} selected · {filtered.length} shown</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0, paddingBottom: 180 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryLight} />}
        ListEmptyComponent={<EmptyState icon="calendar-outline" title="No items" subtitle="Adjust the search or filter." />}
      />

      {/* Bulk action bar */}
      <View style={styles.bar}>
        <Text style={styles.barLabel}>Set expiry for {selCount} selected</Text>
        <View style={styles.presetRow}>
          {[['+30d', 30], ['+60d', 60], ['+90d', 90], ['+180d', 180]].map(([l, n]) => (
            <TouchableOpacity key={l} onPress={() => setDateInput(plusDays(n))} style={styles.preset}><Text style={styles.presetText}>{l}</Text></TouchableOpacity>
          ))}
        </View>
        <View style={styles.barRow}>
          <TextInput style={styles.dateInput} value={dateInput} onChangeText={setDateInput} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
          <TouchableOpacity style={[styles.applyBtn, (!selCount || busy) && { opacity: 0.5 }]} onPress={applyDate} disabled={!selCount || busy}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.clearBtn, (!selCount || busy) && { opacity: 0.5 }]} onPress={clearDate} disabled={!selCount || busy}>
            <Ionicons name="trash-outline" size={18} color={colors.red} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  count: { color: colors.textFaint, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowOn: { borderColor: colors.primaryLight },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
  barLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  presetRow: { flexDirection: 'row', gap: 8 },
  preset: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  presetText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { flex: 1, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
  applyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.md },
  applyText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  clearBtn: { borderWidth: 1, borderColor: colors.red, borderRadius: radius.md, padding: 11 },
});
