import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { Loading, EmptyState, ErrorView, Badge } from '../components/ui';
import { fmtDate, num } from '../lib/format';

const STATUS_TONE = {
  issued: 'green', wrong_code: 'orange', not_available: 'red',
  no_longer_needed: 'dim', returned: 'yellow',
};

export default function RequisitionDetailScreen({ route }) {
  const { req } = route.params || {};
  const { supabase } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !req?.id) return;
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('requisition_items')
        .select('id,line_no,part_number,product,product_desc,ordered_qty,issued_qty,uom,status,note')
        .eq('requisition_id', req.id)
        .order('line_no', { ascending: true });
      if (e) throw e;
      setItems(data || []);
    } catch (e2) {
      setError(e2?.message || 'Failed to load requisition lines');
    } finally {
      setLoading(false);
    }
  }, [supabase, req]);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }) => {
    const shortfall = num(item.ordered_qty) - num(item.issued_qty);
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>
            {item.product || item.product_desc || 'Item'}
          </Text>
          <Text style={styles.sub}>#{item.part_number || '—'}</Text>
          <View style={styles.badges}>
            <Badge label={(item.status || 'issued').replace(/_/g, ' ')} tone={STATUS_TONE[item.status] || 'dim'} />
            {shortfall > 0 && <Badge label={`${shortfall} ${item.uom || ''} short`} tone="orange" />}
          </View>
          {!!item.note && <Text style={styles.note}>{item.note}</Text>}
        </View>
        <View style={styles.qtyBox}>
          <Text style={styles.qty}>{num(item.issued_qty)}/{num(item.ordered_qty)}</Text>
          <Text style={styles.unit}>{item.uom || ''}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headCard}>
        <Text style={styles.title}>{req?.req_number || 'Requisition'}</Text>
        {!!req?.subject && <Text style={styles.sub}>{req.subject}</Text>}
        <Text style={styles.sub}>
          {fmtDate(req?.date || req?.req_date)} · {req?.destination_location || req?.department || '—'}
        </Text>
        {!!req?.requestor && <Text style={styles.sub}>Requested by {req.requestor}</Text>}
      </View>
      {loading ? <Loading text="Loading lines…" />
        : error ? <ErrorView message={error} onRetry={load} />
        : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
            ListEmptyComponent={<EmptyState icon="list-outline" title="No line items" />}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, margin: spacing.md,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  row: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  note: { color: colors.textFaint, fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  qtyBox: { alignItems: 'flex-end', minWidth: 54 },
  qty: { color: colors.text, fontSize: 15, fontWeight: '700' },
  unit: { color: colors.textFaint, fontSize: 11 },
});
