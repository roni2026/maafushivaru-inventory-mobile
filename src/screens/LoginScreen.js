import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { PrimaryButton } from '../components/ui';

export default function LoginScreen({ navigation }) {
  const { signIn, cfg } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      // On success the auth listener flips the app to the main tabs.
    } catch (e) {
      Alert.alert('Sign in failed', e?.message || 'Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Ionicons name="cube" size={34} color={colors.white} />
        </View>
        <Text style={styles.title}>Maafushivaru Inventory</Text>
        <Text style={styles.sub}>Sign in with your inventory account to manage stock.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@resort.com"
            placeholderTextColor={colors.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.pwRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textFaint}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eye} onPress={() => setShowPw((s) => !s)}>
              <Ionicons name={showPw ? 'eye-off' : 'eye'} size={20} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          <PrimaryButton
            label={loading ? 'Signing in…' : 'Sign In'}
            icon="log-in-outline"
            onPress={submit}
            disabled={loading}
          />

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={14} color={colors.textDim} />
            <Text style={styles.linkText}>Backend connection settings</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          {cfg?.url ? `Connected to ${cfg.url.replace(/^https?:\/\//, '')}` : 'Not connected — open Settings first.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingTop: spacing.xl * 2, flexGrow: 1, justifyContent: 'center' },
  logoWrap: {
    alignSelf: 'center', width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg,
  },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11,
    color: colors.text, fontSize: 15, marginBottom: 6,
  },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eye: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  linkText: { color: colors.textDim, fontSize: 13 },
  footer: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
});
