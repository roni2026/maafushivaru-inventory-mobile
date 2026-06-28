import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  Modal, Pressable, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Chip, Loading, EmptyState, ErrorView, Badge, PrimaryButton } from '../components/ui';
import { SelectField } from '../components/ui';
import { num, fmtDate } from '../lib/format';

const today = () => new Date().toISOString().split('T')[0];
const curMonth = () => today().slice(0, 7);
const monthKeyOf = (iso) => (iso ? String(iso).slice(0, 7) : curMonth());
const monthLabel = (k) => {
  if (!k) return '';
  const [y, m] = k.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[(+m || 1) - 1]} ${y}`;
};

export default function FuelScreen({ navigation }) {
  const { supabase } = useApp();
  const [months, setMonths] = useState([curMonth()]);
  const [month, setMonth] = useState(curMonth());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ fuel_type: 'PETROL', fuel_date: today(), boat_name: '', qty: '', unit: 'Ltrs' });
  const [busy, setBusy] = useState(false);

  const loadMonths = useCallback(async () => {
    if (!supabase) return;
    try {
      const rows = await fetchAll(() => supabase.from('dive_centre_fuel').select('month_key'));
      const set = new Set(rows.map((r) => r.month_key).filter(Boolean));
      set.add(curMonth());
      setMonths([...set].sort().reverse());
    } catch { /* ignore */ }
  }, [supabase]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchAll(() =>
        supabase.from('dive_centre_fuel').select('*').eq('month_key', month).order('fuel_date'));
      setRecords(rows);
    } catch (e) {
      setError(e?.message || 'Failed to load fuel');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [supabase, month]);

  useEffect(() => { loadMonths(); }, [loadMonths]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const filtered = useMemo(() => {
    if (typeFilter === 'ALL') return records;
    return records.filter((r) => (r.fuel_type || '').toUpperCase() === typeFilter);
  }, [records, typeFilter]);

  const petrolTotal = records.filter((r) => r.fuel_type !== 'DIESEL').reduce((s, r) => s + num(r.qty), 0);
  const dieselTotal = records.filter((r) => r.fuel_type === 'DIESEL').reduce((s, r) => s + num(r.qty), 0);

  const openAdd = () => {
    setEditId(null);
    setForm({ fuel_type: 'PETROL', fuel_date: month === curMonth() ? today() : `${month}-01`, boat_name: '', qty: '', unit: 'Ltrs' });
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditId(r.id);
    setForm({ fuel_type: r.fuel_type, fuel_date: r.fuel_date, boat_name: r.boat_name, qty: String(r.qty), unit: r.unit || 'Ltrs' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.boat_name.trim()) return Alert.alert('Boat name required');
    const qn = Number(form.qty);
    if (!isFinite(qn) || qn <= 0) return Alert.alert('Enter a valid quantity');
    setBusy(true);
    const payload = {
      fuel_type: form.fuel_type, fuel_date: form.fuel_date, boat_name: form.boat_name.trim(),
      qty: qn, unit: form.unit || 'Ltrs', month_key: monthKeyOf(form.fuel_date),
    };
    try {
      if (editId) {
        const { error } = await supabase.from('dive_centre_fuel').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dive_centre_fuel').insert(payload);
        if (error) throw error;
      }
      setOpen(false);
      await loadMonths();
      if (payload.month_key !== month) setMonth(payload.month_key); else load();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'error');
    } finally { setBusy(false); }
  };

  const del = (r) => {
    Alert.alert('Delete entry', `Delete ${r.fuel_type} · ${r.boat_name} ${r.qty} ${r.unit}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('dive_centre_fuel').delete().eq('id', r.id);
        if (error) return Alert.alert('Error', error.message);
        setRecords((prev) => prev.filter((x) => x.id !== r.id));
      } },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.boat_name}</Text>
        <Text style={styles.sub}>{fmtDate(item.fuel_date)}</Text>
        <Badge label={item.fuel_type} tone={item.fuel_type === 'DIESEL' ? 'sky' : 'yellow'} />
      </View>
      <View style={styles.qtyBox}>
        <Text style={styles.qty}>{num(item.qty)}</Text>
        <Text style={styles.unit}>{item.unit}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}><Ionicons name="create-outline" size={18} color={colors.primaryLight} /></TouchableOpacity>
        <TouchableOpacity onPress={() => del(item)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color={colors.red} /></TouchableOpacity>
      </View>
    </View>
  );

  if (loading) return <Loading text="Loading fuel…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SelectField label="Month" value={month} onChange={setMonth} options={months.map((m) => ({ label: monthLabel(m), value: m }))} />
        <View style={styles.totals}>
          <Text style={[styles.tot, { color: colors.yellow }]}>Petrol {petrolTotal} Ltrs</Text>
          <Text style={[styles.tot, { color: colors.sky }]}>Diesel {dieselTotal} Ltrs</Text>
        </View>
        <View style={styles.chips}>
          {['ALL', 'PETROL', 'DIESEL'].map((t) => (
            <Chip key={t} label={t === 'ALL' ? 'All' : t[0] + t.slice(1).toLowerCase()} active={typeFilter === t} onPress={() => setTypeFilter(t)} />
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryLight} />}
        ListEmptyComponent={<EmptyState icon="water-outline" title="No fuel entries" subtitle="Tap + to add, or use the camera Scan tab." />}
      />
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{editId ? 'Edit fuel entry' : 'Add fuel entry'}</Text>
            <View style={styles.toggle}>
              {['PETROL', 'DIESEL'].map((t) => (
                <TouchableOpacity key={t} onPress={() => setForm((f) => ({ ...f, fuel_type: t }))} style={[styles.toggleBtn, form.fuel_type === t && styles.toggleOn]}>
                  <Text style={[styles.toggleText, form.fuel_type === t && { color: '#fff' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.mLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.mInput} value={form.fuel_date} onChangeText={(v) => setForm((f) => ({ ...f, fuel_date: v }))} placeholder="2026-06-28" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
            <Text style={styles.mLabel}>Boat name</Text>
            <TextInput style={styles.mInput} value={form.boat_name} onChangeText={(v) => setForm((f) => ({ ...f, boat_name: v }))} placeholder="Sea Explorer" placeholderTextColor={colors.textFaint} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mLabel}>Quantity</Text>
                <TextInput style={styles.mInput} value={form.qty} onChangeText={(v) => setForm((f) => ({ ...f, qty: v.replace(/[^0-9.]/g, '') }))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mLabel}>Unit</Text>
                <TextInput style={styles.mInput} value={form.unit} onChangeText={(v) => setForm((f) => ({ ...f, unit: v }))} placeholder="Ltrs" placeholderTextColor={colors.textFaint} />
              </View>
            </View>
            <View style={{ marginTop: 6 }}>
              <PrimaryButton label={busy ? 'Saving…' : 'Save'} icon="checkmark" onPress={save} disabled={busy} />
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setOpen(false)}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  totals: { flexDirection: 'row', gap: spacing.lg },
  tot: { fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2, marginBottom: 4 },
  qtyBox: { alignItems: 'flex-end', minWidth: 48 },
  qty: { color: colors.text, fontSize: 18, fontWeight: '700' },
  unit: { color: colors.textFaint, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  fab: { position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.sm },
  toggle: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 4 },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.primary },
  toggleText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  mLabel: { color: colors.textDim, fontSize: 13, marginTop: 10, marginBottom: 6 },
  mInput: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 15 },
  modalClose: { marginTop: spacing.sm, alignItems: 'center', paddingVertical: 8 },
  modalCloseText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
});
