import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, Pressable, TextInput, Alert } from 'react-native';
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
  const [editItem, setEditItem] = useState(null);
  const [eqty, setEqty] = useState('');
  const [eexp, setEexp] = useState('');
  const [busy, setBusy] = useState(false);

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

  const openEdit = (item) => {
    setEditItem(item);
    setEqty(item.received_qty != null ? String(item.received_qty) : String(item.ordered_qty ?? ''));
    setEexp(item.expiry_date || '');
  };
  const saveEdit = async () => {
    if (!editItem) return;
    const payload = {
      received_qty: eqty === '' ? null : Number(eqty),
      expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(eexp) ? eexp : (eexp === '' ? null : editItem.expiry_date),
    };
    setBusy(true);
    try {
      const { error } = await supabase.from('boat_note_items').update(payload).eq('id', editItem.id);
      if (error) throw error;
      setItems((prev) => prev.map((r) => (r.id === editItem.id ? { ...r, ...payload } : r)));
      setEditItem(null);
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'error');
    } finally { setBusy(false); }
  };
  const delItem = (item) => {
    Alert.alert('Remove item', `Remove "${item.product_name}" from this boat note?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('boat_note_items').delete().eq('id', item.id);
        if (error) return Alert.alert('Error', error.message);
        setItems((prev) => prev.filter((r) => r.id !== item.id));
        setEditItem(null);
      } },
    ]);
  };
  const deleteNote = () => {
    if (!selectedId) return;
    Alert.alert('Delete boat note', 'Delete this whole boat note and all its items? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('boat_notes').delete().eq('id', selectedId);
        if (error) return Alert.alert('Error', error.message);
        setSelectedId(null);
        loadNotes();
      } },
    ]);
  };

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
    <TouchableOpacity style={styles.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>
          {item.product_name || 'Item'} {item.is_sample ? '🧪' : ''}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          #{item.part_number || '—'} · {item.supplier || '—'}
        </Text>
        <View style={styles.badges}>
          {!!item.department && <Badge label={item.department} tone="sky" />}
          {!!item.expiry_date && <Badge label={`exp ${fmtDate(item.expiry_date)}`} tone="yellow" />}
        </View>
      </View>
      <View style={styles.qtyBox}>
        <Text style={styles.qty}>{num(item.received_qty)}/{num(item.ordered_qty)}</Text>
        <Text style={styles.unit}>{item.unit || ''}</Text>
      </View>
      <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
    </TouchableOpacity>
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
          <View style={styles.noteTitleRow}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {selectedNote.label || `Boat note · ${fmtDate(selectedNote.note_date)}`}
            </Text>
            <TouchableOpacity onPress={deleteNote} style={styles.delNoteBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.delNoteText}>Delete note</Text>
            </TouchableOpacity>
          </View>
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

      <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditItem(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle} numberOfLines={2}>{editItem?.product_name || 'Item'}</Text>
            <Text style={styles.modalSub}>#{editItem?.part_number || '—'} · ordered {num(editItem?.ordered_qty)} {editItem?.unit || ''}</Text>
            <Text style={styles.mLabel}>Received quantity</Text>
            <TextInput style={styles.mInput} value={eqty} onChangeText={(v) => setEqty(v.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
            <Text style={styles.mLabel}>Expiry date (YYYY-MM-DD)</Text>
            <TextInput style={styles.mInput} value={eexp} onChangeText={setEexp} placeholder="2026-12-31" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={saveEdit} disabled={busy}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.delItemBtn} onPress={() => delItem(editItem)}>
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.delItemText}>Remove item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setEditItem(null)}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', gap: 8 },
  noteTitle: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  delNoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.red, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  delNoteText: { color: colors.red, fontSize: 12, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  modalSub: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: 4 },
  mLabel: { color: colors.textDim, fontSize: 13, marginTop: 10, marginBottom: 6 },
  mInput: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, marginTop: 14 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  delItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 6 },
  delItemText: { color: colors.red, fontSize: 13, fontWeight: '600' },
  modalClose: { alignItems: 'center', paddingVertical: 8 },
  modalCloseText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
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
