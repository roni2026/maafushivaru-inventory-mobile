import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { SearchBar, Chip, Loading, EmptyState, ErrorView, Badge } from '../components/ui';
import { fmtDate, num } from '../lib/format';

export default function RequisitionsScreen({ navigation }) {
  const { supabase } = useApp();
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('Pending'); // Pending | All

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchAll(() =>
        supabase
          .from('requisitions')
          .select('id,req_number,req_date,date,requestor,destination_location,subject,department,purchase_type,total_lines,issued_lines,status')
          .order('date', { ascending: false })
      );
      setReqs(rows);
    } catch (e) {
      setError(e?.message || 'Failed to load requisitions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const pendingCount = (r) => Math.max(0, num(r.total_lines) - num(r.issued_lines));

  const filtered = useMemo(() => {
    let list = reqs;
    if (mode === 'Pending') list = list.filter((r) => pendingCount(r) > 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (r.req_number || '').toLowerCase().includes(q) ||
        (r.requestor || '').toLowerCase().includes(q) ||
        (r.destination_location || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [reqs, mode, search]);

  const renderItem = ({ item }) => {
    const pend = pendingCount(item);
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('RequisitionDetail', { req: item })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {item.req_number || 'Requisition'} {item.subject ? `· ${item.subject}` : ''}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {fmtDate(item.date || item.req_date)} · {item.destination_location || item.department || '—'}
          </Text>
          {!!item.requestor && <Text style={styles.sub} numberOfLines={1}>By {item.requestor}</Text>}
          <View style={styles.badges}>
            <Badge label={`${num(item.issued_lines)}/${num(item.total_lines)} issued`} tone="dim" />
            {pend > 0 ? <Badge label={`${pend} pending`} tone="orange" /> : <Badge label="Complete" tone="green" />}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </TouchableOpacity>
    );
  };

  if (loading) return <Loading text="Loading requisitions…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search req #, requestor, destination…" />
        <View style={styles.chips}>
          {['Pending', 'All'].map((m) => (
            <Chip key={m} label={m} active={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <Text style={styles.count}>{filtered.length} requisition{filtered.length !== 1 ? 's' : ''}</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title={mode === 'Pending' ? 'No pending requisitions' : 'No requisitions found'}
            subtitle="Pull down to refresh."
          />
        }
        keyboardShouldPersistTaps="handled"
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});
