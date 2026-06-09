import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button, Card, Muted, Screen, Subtitle, Title } from '../../components/ui';
import { colors, radius, spacing } from '../../lib/theme';
import { ConversationRating } from '../../lib/types';

export default function RatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rating, setRating] = useState<ConversationRating | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('conversation_ratings')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setRating({
        conversation_id: data.conversation_id,
        overall_score: data.overall_score,
        categories: data.categories,
        top_improvements: data.top_improvements,
        psychology_insight: data.psychology_insight,
        summary: data.summary,
      });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!rating) {
    return (
      <Screen>
        <Muted>Loading your report…</Muted>
      </Screen>
    );
  }

  const grade =
    rating.overall_score >= 85
      ? 'A'
      : rating.overall_score >= 70
      ? 'B'
      : rating.overall_score >= 55
      ? 'C'
      : rating.overall_score >= 40
      ? 'D'
      : 'F';

  return (
    <Screen>
      <Title>Conversation Report</Title>
      <View style={styles.scoreHero}>
        <Text style={styles.grade}>{grade}</Text>
        <Text style={styles.scoreNum}>{rating.overall_score}/100</Text>
      </View>
      <Subtitle>{rating.summary}</Subtitle>

      <Text style={styles.sectionTitle}>Category breakdown</Text>
      {rating.categories.map((c) => (
        <Card key={c.category}>
          <View style={styles.catHeader}>
            <Text style={styles.catName}>{c.category}</Text>
            <Text
              style={[
                styles.catScore,
                {
                  color:
                    c.score >= 7
                      ? colors.success
                      : c.score >= 4
                      ? colors.warning
                      : colors.danger,
                },
              ]}
            >
              {c.score}/10
            </Text>
          </View>
          <BarTrack score={c.score} />
          <Text style={styles.advice}>{c.advice}</Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Fix these first</Text>
      <Card>
        {rating.top_improvements.map((t, i) => (
          <Text key={i} style={styles.improvement}>
            {i + 1}. {t}
          </Text>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>The science</Text>
      <Card style={{ borderLeftWidth: 3, borderLeftColor: colors.gold }}>
        <Text style={styles.advice}>{rating.psychology_insight}</Text>
      </Card>

      <Button label="Practice again" onPress={() => router.push('/personas/new')} />
      <Button label="Back to conversations" variant="ghost" onPress={() => router.push('/')} />
    </Screen>
  );
}

function BarTrack({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color =
    score >= 7 ? colors.success : score >= 4 ? colors.warning : colors.danger;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scoreHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  grade: { color: colors.accent, fontSize: 64, fontWeight: '900' },
  scoreNum: { color: colors.textDim, fontSize: 22, fontWeight: '700' },
  sectionTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 18,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  catScore: { fontWeight: '800', fontSize: 15 },
  track: {
    height: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  fill: { height: 6, borderRadius: radius.pill },
  advice: { color: colors.text, lineHeight: 21, fontSize: 14 },
  improvement: { color: colors.text, lineHeight: 24, fontSize: 15 },
});
