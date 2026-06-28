import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { thisWeekRange, num, daysUntil } from '../lib/format';

function Tile({ icon, label, value, tone, onPress }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={22} color={tone || colors.primaryLight} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function NavCard({ icon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.navIcon}>
        <Ionicons name={icon} size={20} color={colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }) {
  const { supabase } = useApp();
  const [stats, setStats] = useState({ items: 0, low: 0, expiring: 0, pendingReqs: 0, weekNotes: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const allItems = await fetchAll(() =>
        supabase.from('items').select('current_stock,min_stock,expiry_date,active')
      );
      // Active unless explicitly deactivated (tolerates missing/NULL `active`).
      const items = allItems.filter((i) => i && i.active !== false);
      const low = items.filter((i) => num(i.current_stock) <= num(i.min_stock)).length;
      const expiring = items.filter((i) => {
        const d = daysUntil(i.expiry_date);
        return d !== null && d <= 30;
      }).length;

      let pendingReqs = 0;
      try {
        const { data: reqs } = await supabase
          .from('requisitions')
          .select('total_lines,issued_lines')
          .limit(1000);
        pendingReqs = (reqs || []).filter((r) => num(r.total_lines) - num(r.issued_lines) > 0).length;
      } catch { /* table may be empty / missing */ }

      let weekNotes = 0;
      try {
        const { from, to } = thisWeekRange();
        const { count } = await supabase
          .from('boat_notes')
          .select('*', { count: 'exact', head: true })
          .gte('note_date', from).lte('note_date', to);
        weekNotes = count || 0;
      } catch { /* ignore */ }

      setStats({ items: items.length, low, expiring, pendingReqs, weekNotes });
    } catch {
      /* keep previous stats */
    } finally {
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryLight} />}
    >
      <Text style={styles.h1}>Maafushivaru Inventory</Text>
      <Text style={styles.sub}>Quick view of stock, requisitions and boat notes.</Text>

      <View style={styles.tiles}>
        <Tile icon="cube" label="Active items" value={stats.items} onPress={() => navigation.navigate('Inventory')} />
        <Tile icon="alert-circle" label="Low / out" value={stats.low} tone={colors.orange} onPress={() => navigation.navigate('Alerts')} />
        <Tile icon="time" label="Expiring ≤30d" value={stats.expiring} tone={colors.yellow} onPress={() => navigation.navigate('Alerts')} />
        <Tile icon="document-text" label="Pending reqs" value={stats.pendingReqs} tone={colors.sky} onPress={() => navigation.navigate('Requisitions')} />
      </View>

      <Text style={styles.section}>Manage</Text>
      <NavCard icon="camera-outline" title="Scan (camera)" subtitle="Fuel, expiry, boat notes — pick a type & shoot" onPress={() => navigation.navigate('Scan')} />
      <NavCard icon="water-outline" title="Dive Centre Fuel" subtitle="Daily petrol & diesel chits" onPress={() => navigation.navigate('Fuel')} />
      <NavCard icon="calendar-outline" title="Manage Expiry" subtitle="Set / edit / clear expiry for many items" onPress={() => navigation.navigate('ExpiryManager')} />
      <NavCard icon="checkbox-outline" title="Store Tasks" subtitle="Create reminders · mark pending / working / done" onPress={() => navigation.navigate('StoreTasks')} />
      <NavCard icon="add-circle-outline" title="Add item" subtitle="Create a new inventory item" onPress={() => navigation.navigate('ItemForm')} />
      <NavCard icon="business-outline" title="Stores" subtitle="Add, rename & delete stores" onPress={() => navigation.navigate('Stores')} />

      <Text style={styles.section}>Browse</Text>
      <NavCard icon="search" title="Inventory" subtitle="Search, edit items & adjust stock" onPress={() => navigation.navigate('Inventory')} />
      <NavCard icon="document-text-outline" title="Requisitions" subtitle="Pending & completed requisitions" onPress={() => navigation.navigate('Requisitions')} />
      <NavCard icon="boat-outline" title="Boat Notes" subtitle={`This week (${stats.weekNotes}) · sortable`} onPress={() => navigation.navigate('BoatNote')} />
      <NavCard icon="alert-circle-outline" title="Not Arrived" subtitle="Track items not arrived / wrong, by store" onPress={() => navigation.navigate('NotArrived')} />
      <NavCard icon="notifications-outline" title="Alerts" subtitle="Low stock & expiring items" onPress={() => navigation.navigate('Alerts')} />
      <NavCard icon="settings-outline" title="Settings" subtitle="Account & backend connection" onPress={() => navigation.navigate('Settings')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1, flexBasis: '47%', backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 4,
  },
  tileValue: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 6 },
  tileLabel: { color: colors.textFaint, fontSize: 12 },
  section: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  navCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  navIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  navSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
});
