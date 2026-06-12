import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/AuthContext';
import { isBackendConfigured } from '../lib/supabase';
import { Button, Card, Input, Muted, Screen, Subtitle, Title } from '../components/ui';
import { colors, spacing } from '../lib/theme';

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithOAuth, isAnonymous } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(isAnonymous ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isBackendConfigured) {
      setError('🧪 Demo mode — accounts activate once the backend is connected.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const err =
        mode === 'signin'
          ? await signInWithEmail(email.trim(), password)
          : await signUpWithEmail(email.trim(), password);
      if (err) setError(err);
      else router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Title>
      <Subtitle>
        {isAnonymous
          ? 'Your guest conversations and coaching history will be saved to your new account.'
          : 'Track your progress and unlock the full coaching experience.'}
      </Subtitle>
      <Card>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          label={mode === 'signin' ? 'Sign in' : 'Sign up'}
          onPress={submit}
          loading={busy}
        />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => signInWithOAuth('google')}
        />
        <Button
          label="Continue with Apple"
          variant="secondary"
          onPress={() => signInWithOAuth('apple')}
        />
      </Card>
      <Button
        label={
          mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'
        }
        variant="ghost"
        onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      />
      <Muted>
        By continuing you confirm you are 18+ and agree that conversations are AI
        simulations for skill practice.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, marginBottom: spacing.sm },
});
