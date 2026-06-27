import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { PrimaryButton, SecondaryButton, DangerButton, Badge } from '../components/ui';

export default function SettingsScreen({ navigation }) {
  const { cfg, updateConfig, resetConfig, supabase, user, signedIn, signOut } = useApp();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  useEffect(() => {
    if (cfg) { setUrl(cfg.url || ''); setAnonKey(cfg.anonKey || ''); }
  }, [cfg]);

  const save = async () => {
    if (!url.trim() || !anonKey.trim()) {
      Alert.alert('Missing values', 'Enter both the Supabase URL and anon key.');
      return;
    }
    setSaving(true);
    try {
      await updateConfig({ url, anonKey });
      Alert.alert('Saved', 'Connection settings updated.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTestMsg('Testing…');
    try {
      if (!supabase) { setTestMsg('Save settings first.'); return; }
      const { error } = await supabase.from('items').select('id', { count: 'exact', head: true });
      setTestMsg(error ? `Failed: ${error.message}` : 'Connected ✓');
    } catch (e) {
      setTestMsg(`Failed: ${e?.message || 'error'}`);
    }
  };

  const reset = async () => {
    await resetConfig();
    setTestMsg(null);
  };

  const doSignOut = () => {
    Alert.alert('Sign out', 'Sign out of this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      {/* Account */}
      {signedIn && (
        <View style={styles.card}>
          <Text style={styles.title}>Account</Text>
          <View style={{ marginTop: 8 }}>
            <Badge label={`Signed in: ${user?.email || 'authenticated'}`} tone="green" />
          </View>
          <Text style={[styles.help, { marginTop: 10 }]}>
            You have full edit access — add, edit and delete items, adjust stock and manage stores.
          </Text>
          <View style={{ height: 8 }} />
          <DangerButton label="Sign out" icon="log-out-outline" onPress={doSignOut} />
        </View>
      )}

      {/* Manage */}
      <View style={styles.card}>
        <Text style={styles.title}>Manage</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Stores')}>
          <Ionicons name="business-outline" size={20} color={colors.primaryLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Stores</Text>
            <Text style={styles.linkSub}>Add, rename and delete stores (sub-categories)</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      </View>

      {/* Backend connection */}
      <View style={styles.card}>
        <Text style={styles.title}>Backend connection</Text>
        <Text style={styles.help}>
          Connect to the same Supabase project as the web app. Find these in your Supabase
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
          style={[styles.input, { height: 90 }]}
          value={anonKey}
          onChangeText={setAnonKey}
          placeholder="eyJhbGciOi…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        <PrimaryButton label={saving ? 'Saving…' : 'Save'} icon="save-outline" onPress={save} disabled={saving} />
        <View style={{ height: 8 }} />
        <SecondaryButton label="Test connection" icon="pulse-outline" onPress={test} />

        {!!testMsg && (
          <View style={{ marginTop: 12 }}>
            <Badge label={testMsg} tone={testMsg.startsWith('Connected') ? 'green' : testMsg.startsWith('Failed') ? 'red' : 'dim'} />
          </View>
        )}

        <Text style={[styles.help, { marginTop: 16 }]}>
          Source: {cfg?.source === 'saved' ? 'saved on this device' : 'build defaults (app.json)'}
        </Text>
        <View style={{ height: 8 }} />
        <SecondaryButton label="Reset to build defaults" icon="refresh-outline" onPress={reset} />
      </View>

      <Text style={styles.footer}>
        Companion app for the Maafushivaru Inventory system. Sign in with your inventory
        account to add, edit and manage stock from your phone.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  help: { color: colors.textDim, fontSize: 13, marginTop: 6, lineHeight: 18 },
  label: { color: colors.textDim, fontSize: 13, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, fontSize: 14, textAlignVertical: 'top',
  },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md,
  },
  linkTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  linkSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  footer: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: 20, lineHeight: 17 },
});
