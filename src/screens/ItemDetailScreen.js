import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { Badge } from '../components/ui';
import { daysUntil, fmtDate, num } from '../lib/format';

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? '—'}</Text>
    </View>
  );
}

export default function ItemDetailScreen({ route }) {
  const { item } = route.params || {};
  const days = daysUntil(item?.expiry_date);
  const isLow = num(item?.current_stock) <= num(item?.min_stock);
  const isOut = num(item?.current_stock) === 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <View style={styles.headCard}>
        <Text style={styles.name}>{item?.name}</Text>
        <Text style={styles.code}>#{item?.part_number}</Text>
        <View style={styles.badges}>
          {isOut ? <Badge label="OUT OF STOCK" tone="red" />
            : isLow ? <Badge label="LOW STOCK" tone="orange" /> : <Badge label="In stock" tone="green" />}
          {days !== null && days < 0 && <Badge label="EXPIRED" tone="red" />}
          {days !== null && days >= 0 && days <= 30 && <Badge label={`${days}d to expiry`} tone={days <= 7 ? 'red' : 'yellow'} />}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.stockRow}>
          <View style={styles.stockBox}>
            <Text style={styles.stockNum}>{num(item?.current_stock)}</Text>
            <Text style={styles.stockLabel}>Current ({item?.unit})</Text>
          </View>
          <View style={styles.stockBox}>
            <Text style={styles.stockNum}>{num(item?.min_stock)}</Text>
            <Text style={styles.stockLabel}>Minimum</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Field label="Category" value={item?.stores?.category} />
        <Field label="Sub-category (store)" value={item?.stores?.name} />
        <Field label="Unit" value={item?.unit} />
        <Field label="Expiry date" value={fmtDate(item?.expiry_date)} />
        <Field label="Supplier" value={item?.supplier} />
        <Field label="Description / notes" value={item?.notes} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  name: { color: colors.text, fontSize: 20, fontWeight: '700' },
  code: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  stockRow: { flexDirection: 'row', gap: spacing.md },
  stockBox: {
    flex: 1, alignItems: 'center', backgroundColor: colors.cardAlt,
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  stockNum: { color: colors.primaryLight, fontSize: 26, fontWeight: '800' },
  stockLabel: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  field: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  label: { color: colors.textFaint, fontSize: 13 },
  value: { color: colors.text, fontSize: 14, flex: 1, textAlign: 'right' },
});
