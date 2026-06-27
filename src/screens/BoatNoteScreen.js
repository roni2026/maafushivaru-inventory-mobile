import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { Chip, Loading, EmptyState, ErrorView, Badge, SearchBar } from '../components/ui';
import { thisWeekRange, fmtDate, num } from '../lib/format';

const SORTS = [
  { key: 'product_name', label: 'Name' },
  { key: 'ordered_qty', label: 'Ordered' },
  { key: 'received_qty', label: 'Received' },
  { key: 'department', label: 'Dept' },
  { key: 'supplier', label: 'Supplier' },
];

export default function BoatNoteScreen() {
  const { supabase } = useApp();
  const [scope, setScope] = useState('week'); // week | latest
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('product_name');
  const [asc, setAsc] = useState(true);

  const loadNotes = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    setLoadingNotes(true);
    try {
      let q = supabase
        .from('boat_notes')
        .select('id,note_date,label,delivery_day,status,total_items')
        .order('note_date', { ascending: false });
      if (scope === 'week') {
        const { from, to } = thisWeekRange();
        q = q.gte('note_date', from).lte('note_date', to);
      } else {
        q = q.limit(15);
      }
      const { data, error: e } = await q;
      if (e) throw e;
      const list = data || [];
      setNotes(list);
      setSelectedId((prev) => (list.find((n) => n.id === prev) ? prev : (list[0]?.id || null)));
    } catch (e2) {
      setError(e2?.message || 'Failed to load boat notes');
    } finally {
      setLoadingNotes(false);
      setRefreshing(false);
    }
  }, [supabase, scope]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const loadItems = useCallback(async () => {
    if (!supabase || !selectedId) { setItems([]); return; }
    setLoadingItems(true);
    try {
      const { data, error: e } = await supabase
        .from('boat_note_items')
        .select('id,line_no,supplier,part_number,product_name,unit,ordered_qty,received_qty,department,status,is_sample')
        .eq('boat_note_id', selectedId);
      if (e) throw e;
      setItems(data || []);
    } catch (e2) {
      setError(e2?.message || 'Failed to load boat note items');
    } finally {
      setLoadingItems(false);
    }
  }, [supabase, selectedId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const onRefresh = () => { setRefreshing(true); loadNotes(); };

  const sorted = useMemo(() => {
    let list = [...items];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        (i.product_name || '').toLowerCase().includes(q) ||
        (i.part_number || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q)
      );
    }
    const numeric = sortKey === 'ordered_qty' || sortKey === 'received_qty';
    list.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (numeric) { va = num(va); vb = num(vb); return asc ? va - vb : vb - va; }
      va = (va || '').toString().toLowerCase();
      vb = (vb || '').toString().toLowerCase();
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [items, search, sortKey, asc]);

  const selectedNote = notes.find((n) => n.id === selectedId);

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>
          {item.product_name || 'Item'} {item.is_sample ? '🧪' : ''}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          #{item.part_number || '—'} · {item.supplier || '—'}
        </Text>
        <View style={styles.badges}>
          {!!item.department && <Badge label={item.department} tone="sky" />}
          {!!item.status && <Badge label={item.status} tone={item.status === 'received' ? 'green' : 'dim'} />}
        </View>
      </View>
      <View style={styles.qtyBox}>
        <Text style={styles.qty}>{num(item.received_qty)}/{num(item.ordered_qty)}</Text>
        <Text style={styles.unit}>{item.unit || ''}</Text>
      </View>
    </View>
  );

  if (loadingNotes) return <Loading text="Loading boat notes…" />;
  if (error && !notes.length) return <ErrorView message={error} onRetry={loadNotes} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.chips}>
          <Chip label="This week" active={scope === 'week'} onPress={() => setScope('week')} />
          <Chip label="Latest" active={scope === 'latest'} onPress={() => setScope('latest')} />
        </View>

        {notes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {notes.map((n) => (
              <Chip
                key={n.id}
                label={`${fmtDate(n.note_date)}${n.delivery_day ? ` · ${n.delivery_day}` : ''}`}
                active={selectedId === n.id}
                onPress={() => setSelectedId(n.id)}
              />
            ))}
          </ScrollView>
        )}

        {selectedNote ? (
          <Text style={styles.noteTitle}>
            {selectedNote.label || `Boat note · ${fmtDate(selectedNote.note_date)}`}
          </Text>
        ) : null}

        {!!selectedId && (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search items in this boat note…" />
            <View style={styles.sortRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexGrow: 1 }}>
                {SORTS.map((s) => (
                  <Chip key={s.key} label={s.label} active={sortKey === s.key} onPress={() => setSortKey(s.key)} />
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.dirBtn} onPress={() => setAsc((v) => !v)}>
                <Ionicons name={asc ? 'arrow-up' : 'arrow-down'} size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.count}>{sorted.length} item{sorted.length !== 1 ? 's' : ''}</Text>
          </>
        )}
      </View>

      {!selectedId ? (
        <EmptyState
          icon="boat-outline"
          title={scope === 'week' ? 'No boat note this week' : 'No boat notes found'}
          subtitle={scope === 'week' ? 'Switch to "Latest" to see earlier notes.' : 'Pull down to refresh.'}
        />
      ) : loadingItems ? (
        <Loading text="Loading items…" />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="No items match" />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', gap: 8 },
  noteTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    width: 38, height: 34, alignItems: 'center', justifyContent: 'center',
  },
  count: { color: colors.textFaint, fontSize: 12 },
  row: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  qtyBox: { alignItems: 'flex-end', minWidth: 54 },
  qty: { color: colors.text, fontSize: 15, fontWeight: '700' },
  unit: { color: colors.textFaint, fontSize: 11 },
});
