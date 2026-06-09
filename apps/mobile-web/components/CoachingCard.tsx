import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import { CoachingFeedback } from '../lib/types';

function scoreColor(score: number) {
  if (score >= 7) return colors.success;
  if (score >= 4) return colors.warning;
  return colors.danger;
}

export function CoachingCard({ feedback }: { feedback: CoachingFeedback }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.scoreBadge, { borderColor: scoreColor(feedback.message_score) }]}>
          <Text style={[styles.scoreText, { color: scoreColor(feedback.message_score) }]}>
            {feedback.message_score}/10
          </Text>
        </View>
        <Text style={styles.headerLabel}>Coach feedback</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </View>
      <Text style={styles.tip} numberOfLines={open ? undefined : 2}>
        {feedback.tip}
      </Text>
      {open && (
        <View style={{ marginTop: spacing.sm }}>
          {feedback.what_worked ? (
            <Row label="✅ What worked" text={feedback.what_worked} />
          ) : null}
          {feedback.what_hurt ? (
            <Row label="⚠️ What hurt you" text={feedback.what_hurt} />
          ) : null}
          <Row
            label="🔍 The invisible context"
            text={feedback.invisible_context_decode}
          />
          <Row label="💭 What she really means" text={feedback.what_she_really_means} />
          {feedback.suggested_better_message ? (
            <Row
              label="✍️ Stronger version of your message"
              text={`“${feedback.suggested_better_message}”`}
            />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function Row({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#221423',
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    padding: spacing.md,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  scoreBadge: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  scoreText: { fontWeight: '800', fontSize: 12 },
  headerLabel: { color: colors.gold, fontWeight: '700', flex: 1, fontSize: 13 },
  chevron: { color: colors.textDim },
  tip: { color: colors.text, fontSize: 14 },
  row: { marginTop: spacing.sm },
  rowLabel: { color: colors.gold, fontWeight: '700', fontSize: 12, marginBottom: 2 },
  rowText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
