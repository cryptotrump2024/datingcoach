import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/AuthContext';
import { isBackendConfigured } from '../lib/supabase';
import { createCheckout, CryptoPeriod } from '../lib/api';
import { Button, Card, Muted, Pill, Screen, Subtitle, Title } from '../components/ui';
import { colors, spacing } from '../lib/theme';

const PRO_FEATURES = [
  '500 messages / month',
  'Every persona type, full difficulty range',
  'AI-generated photo of each persona',
  'Full "invisible context" decoder on every message',
  'Conversation ratings with category scores',
  'Interest meter — see her engagement live',
];

const ADVANCED_FEATURES = [
  'Everything in Pro',
  'Unlimited messages',
  'Profile screenshot analysis (decode any dating profile)',
  'Relationship maintenance coaching (coming soon)',
  'Science deep-dives on every report',
  'Progress tracking over time (coming soon)',
];

const COINS = [
  { key: 'usdttrc20', label: 'USDT' },
  { key: 'usdc', label: 'USDC' },
  { key: 'btc', label: 'BTC' },
];

export default function Pricing() {
  const { session, isAnonymous } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cryptoTier, setCryptoTier] = useState<'pro' | 'advanced'>('pro');
  const [months, setMonths] = useState<CryptoPeriod>(1);
  const [coin, setCoin] = useState('usdttrc20');

  const requireAccount = () => {
    if (!isBackendConfigured) {
      setError(
        '🧪 Demo mode — payments activate once the backend is connected. This will open Stripe checkout (cards) or a NOWPayments invoice (crypto).'
      );
      return true;
    }
    if (!session || isAnonymous) {
      router.push('/auth');
      return true;
    }
    return false;
  };

  const buyStripe = async (tier: 'pro' | 'advanced') => {
    if (requireAccount()) return;
    setBusy(`stripe-${tier}`);
    setError(null);
    try {
      const { url } = await createCheckout({ provider: 'stripe', tier });
      if (url) await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setBusy(null);
    }
  };

  const buyCrypto = async () => {
    if (requireAccount()) return;
    setBusy('crypto');
    setError(null);
    try {
      const { url } = await createCheckout({
        provider: 'crypto',
        tier: cryptoTier,
        months,
        pay_currency: coin,
      });
      if (url) await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Title>Level up your game</Title>
      <Subtitle>
        The difference between getting ghosted and getting the date is a learnable
        skill. Train it.
      </Subtitle>

      <Card>
        <Text style={styles.tierName}>Free</Text>
        <Text style={styles.price}>$0</Text>
        <Feature text="15 messages to try it out — no signup needed" />
        <Feature text="1 persona, basic feedback" />
      </Card>

      <Card style={styles.highlight}>
        <Text style={[styles.tierName, { color: colors.accent }]}>Pro</Text>
        <Text style={styles.price}>
          $9.95<Text style={styles.per}>/month</Text>
        </Text>
        {PRO_FEATURES.map((f) => (
          <Feature key={f} text={f} />
        ))}
        <Button
          label="Get Pro with card"
          onPress={() => buyStripe('pro')}
          loading={busy === 'stripe-pro'}
        />
      </Card>

      <Card style={[styles.highlight, { borderColor: colors.gold }]}>
        <Text style={[styles.tierName, { color: colors.gold }]}>Advanced</Text>
        <Text style={styles.price}>
          $19.95<Text style={styles.per}>/month</Text>
        </Text>
        {ADVANCED_FEATURES.map((f) => (
          <Feature key={f} text={f} />
        ))}
        <Button
          label="Get Advanced with card"
          onPress={() => buyStripe('advanced')}
          loading={busy === 'stripe-advanced'}
        />
      </Card>

      <Card>
        <Text style={styles.tierName}>Pay with crypto</Text>
        <Muted>
          Prepaid passes — USDT, USDC or BTC. 3 months: 10% off · 12 months: 20%
          off.
        </Muted>
        <View style={styles.pillRow}>
          <Pill label="Pro" selected={cryptoTier === 'pro'} onPress={() => setCryptoTier('pro')} />
          <Pill
            label="Advanced"
            selected={cryptoTier === 'advanced'}
            onPress={() => setCryptoTier('advanced')}
          />
        </View>
        <View style={styles.pillRow}>
          {[1, 3, 12].map((m) => (
            <Pill
              key={m}
              label={`${m} month${m > 1 ? 's' : ''}`}
              selected={months === m}
              onPress={() => setMonths(m as CryptoPeriod)}
            />
          ))}
        </View>
        <View style={styles.pillRow}>
          {COINS.map((c) => (
            <Pill
              key={c.key}
              label={c.label}
              selected={coin === c.key}
              onPress={() => setCoin(c.key)}
            />
          ))}
        </View>
        <Button
          label="Pay with crypto"
          variant="secondary"
          onPress={buyCrypto}
          loading={busy === 'crypto'}
        />
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
      <Muted>
        Subscriptions renew monthly and can be cancelled anytime from your
        account. Crypto passes are one-time payments, no auto-renewal.
      </Muted>
    </Screen>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tierName: { color: colors.text, fontWeight: '900', fontSize: 18, marginBottom: 4 },
  price: { color: colors.text, fontWeight: '900', fontSize: 32, marginBottom: spacing.sm },
  per: { color: colors.textDim, fontSize: 15, fontWeight: '500' },
  highlight: { borderColor: colors.accent, borderWidth: 1.5 },
  featureRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  check: { color: colors.success, fontWeight: '900' },
  featureText: { color: colors.text, flex: 1, fontSize: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  error: { color: colors.danger, marginVertical: spacing.sm },
});
