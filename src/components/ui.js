import React from 'react';
import { View, Text, ActivityIndicator, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'dim' }) {
  const toneColor = {
    dim: colors.textFaint, red: colors.red, orange: colors.orange,
    yellow: colors.yellow, green: colors.green, teal: colors.primaryLight, sky: colors.sky,
  }[tone] || colors.textFaint;
  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

export function Loading({ text = 'Loading…' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primaryLight} />
      <Text style={styles.dim}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'cube-outline', title, subtitle }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.dim}>{subtitle}</Text>}
    </View>
  );
}

export function ErrorView({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={44} color={colors.orange} />
      <Text style={styles.emptyTitle}>Something went wrong</Text>
      <Text style={[styles.dim, { textAlign: 'center', paddingHorizontal: 24 }]}>{message}</Text>
      {!!onRetry && (
        <TouchableOpacity style={styles.btn} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {!!value && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.btn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      {!!icon && <Ionicons name={icon} size={16} color={colors.white} />}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  badge: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 },
  dim: { color: colors.textDim, fontSize: 13 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: radius.md, marginTop: 8,
  },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
