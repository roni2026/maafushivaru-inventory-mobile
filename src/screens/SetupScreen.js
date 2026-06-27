import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { PrimaryButton } from '../components/ui';
import { makeClient } from '../lib/supabase';

export default function SetupScreen() {
  const { updateConfig } = useApp();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    if (!url.trim() || !anonKey.trim()) {
      Alert.alert('Missing values', 'Enter both the Supabase URL and anon key.');
      return;
    }
    setBusy(true);
    try {
      // Quick validation before saving.
      const client = makeClient({ url: url.trim(), anonKey: anonKey.trim() });
      const { error } = await client.from('items').select('id', { count: 'exact', head: true });
      if (error) {
        Alert.alert('Could not connect', error.message);
        return;
      }
      await updateConfig({ url, anonKey });
    } catch (e) {
      Alert.alert('Could not connect', e?.message || 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, justifyContent: 'center' }}>
      <View style={styles.logo}>
        <Ionicons name="cube" size={40} color={colors.primaryLight} />
      </View>
      <Text style={styles.h1}>Maafushivaru Inventory</Text>
      <Text style={styles.sub}>
        Connect this app to your Supabase project to get started. Find these in your Supabase
        dashboard → Project Settings → API.
      </Text>

      <Text style={styles.label}>Supabase URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://xxxx.supabase.co"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Anon public key</Text>
      <TextInput
        style={[styles.input, { height: 100 }]}
        value={anonKey}
        onChangeText={setAnonKey}
        placeholder="eyJhbGciOi…"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />

      <View style={{ height: 12 }} />
      <PrimaryButton label={busy ? 'Connecting…' : 'Connect'} icon="link-outline" onPress={connect} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  logo: {
    width: 72, height: 72, borderRadius: 20, alignSelf: 'center',
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19, marginBottom: 8 },
  label: { color: colors.textDim, fontSize: 13, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, fontSize: 14, textAlignVertical: 'top',
  },
});
