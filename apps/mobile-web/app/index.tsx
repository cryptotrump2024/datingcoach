import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/AuthContext';
import { isBackendConfigured, supabase } from '../lib/supabase';
import { Button, Card, Muted, Screen, Subtitle, Title } from '../components/ui';
import { colors, radius, spacing } from '../lib/theme';
import { Conversation, Persona } from '../lib/types';

type ConvoRow = Conversation & { personas: Persona | null };

export default function Home() {
  const { session, loading, tier, messagesLeft, isAnonymous, startAnonymous } =
    useAuth();
  const [convos, setConvos] = useState<ConvoRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('conversations')
      .select('*, personas(*)')
      .order('created_at', { ascending: false })
      .limit(25);
    setConvos((data as ConvoRow[]) ?? []);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tryFree = async () => {
    if (!isBackendConfigured) {
      // Demo mode: skip auth entirely, conversation is simulated locally
      router.push('/personas/new');
      return;
    }
    setBusy(true);
    try {
      await startAnonymous();
      router.push('/personas/new');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <View />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <View style={styles.hero}>
          <Text style={styles.logo}>CharmCoach</Text>
          {!isBackendConfigured && (
            <View style={styles.demoBanner}>
              <Text style={styles.demoBannerText}>
                🧪 DEMO MODE — the backend isn't connected yet, so conversations
                are simulated locally. Everything is clickable.
              </Text>
            </View>
          )}
          <Title>The flight simulator for dating.</Title>
          <Subtitle>
            Practice real conversations with AI women who react like real life —
            they tease, lose interest, and ghost. Get coached on every message,
            decode what she's really saying, and learn what actually gets the
            number.
          </Subtitle>
          <Button
            label={isBackendConfigured ? 'Try it free — no signup' : 'Try the demo'}
            onPress={tryFree}
            loading={busy}
          />
          <Button
            label="See pricing"
            variant="secondary"
            onPress={() => router.push('/pricing')}
          />
          {isBackendConfigured && (
            <Button
              label="I already have an account"
              variant="ghost"
              onPress={() => router.push('/auth')}
            />
          )}
          <Muted>
            Free trial includes 15 messages. AI simulations for adults — practice
            skills, not scripts.
          </Muted>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text style={styles.logo}>CharmCoach</Text>
        <Pressable onPress={() => router.push('/account')}>
          <Text style={styles.accountLink}>
            {tier.toUpperCase()}
            {messagesLeft !== null ? ` · ${messagesLeft} msgs left` : ' · unlimited'}
          </Text>
        </Pressable>
      </View>

      <Button label="＋ New conversation" onPress={() => router.push('/personas/new')} />
      {tier !== 'free' ? null : (
        <Button
          label="Unlock Pro — every persona, full coaching"
          variant="secondary"
          onPress={() => router.push('/pricing')}
        />
      )}
      {tier === 'advanced' && (
        <Button
          label="📷 Analyze a dating profile"
          variant="secondary"
          onPress={() => router.push('/analyze')}
        />
      )}
      {isAnonymous && (
        <Card>
          <Text style={styles.noticeText}>
            You're on a guest trial. Create an account to keep your conversations
            and coaching history.
          </Text>
          <Button label="Save my progress" variant="secondary" onPress={() => router.push('/auth')} />
        </Card>
      )}

      <Text style={styles.sectionTitle}>Your conversations</Text>
      {convos.length === 0 && (
        <Muted>No conversations yet. Create a persona and start practicing.</Muted>
      )}
      <FlatList
        data={convos}
        scrollEnabled={false}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/chat/${item.id}`)}>
            <Card style={styles.convoCard}>
              {item.personas?.image_url ? (
                <Image source={{ uri: item.personas.image_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={{ fontSize: 22 }}>💁‍♀️</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.convoName}>
                  {item.personas?.name ?? 'Unknown'}
                </Text>
                <Muted>
                  Difficulty {item.personas?.difficulty ?? '?'}/10 ·{' '}
                  {statusLabel(item.status)}
                </Muted>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case 'ghosted':
      return '👻 She ghosted';
    case 'ended':
      return '🚫 She ended it';
    case 'number_given':
      return '📱 Got the number!';
    default:
      return '💬 Active';
  }
}

const styles = StyleSheet.create({
  hero: { paddingTop: 80 },
  demoBanner: {
    backgroundColor: '#3A2230',
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: spacing.md,
  },
  demoBannerText: { color: colors.gold, fontSize: 12 },
  logo: { color: colors.accent, fontWeight: '900', fontSize: 22, marginBottom: spacing.lg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingTop: spacing.lg,
  },
  accountLink: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  sectionTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 18,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  noticeText: { color: colors.text, marginBottom: spacing.sm },
  convoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: radius.pill },
  avatarFallback: {
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convoName: { color: colors.text, fontWeight: '700', fontSize: 16 },
});
