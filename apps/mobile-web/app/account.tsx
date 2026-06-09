import React, { useState } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/AuthContext';
import { openBillingPortal } from '../lib/api';
import { Button, Card, Muted, Screen, Title } from '../components/ui';
import { colors, spacing } from '../lib/theme';

export default function Account() {
  const { session, tier, messagesLeft, isAnonymous, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manageBilling = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await openBillingPortal();
      if (url) await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Text style={styles.row}>
          <Text style={styles.label}>Email: </Text>
          {isAnonymous ? 'Guest (not saved)' : session?.user.email ?? '—'}
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>Plan: </Text>
          {tier.toUpperCase()}
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>Messages left: </Text>
          {messagesLeft === null ? 'Unlimited' : messagesLeft}
        </Text>
      </Card>

      {isAnonymous && (
        <Button label="Create account to save progress" onPress={() => router.push('/auth')} />
      )}
      {tier === 'free' ? (
        <Button label="Upgrade plan" onPress={() => router.push('/pricing')} />
      ) : (
        <Button label="Manage billing" onPress={manageBilling} loading={busy} />
      )}
      <Button
        label="Sign out"
        variant="danger"
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Muted>
        CharmCoach simulations are AI roleplay for adults (18+) designed to build
        genuine communication skills. Conversations are not with real people.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { color: colors.text, fontSize: 15, marginBottom: spacing.sm },
  label: { color: colors.textDim, fontWeight: '700' },
  error: { color: colors.danger, marginVertical: spacing.sm },
});
