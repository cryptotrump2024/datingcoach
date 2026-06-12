// Demo chat — fully local simulation used until the Supabase backend is
// connected. Mirrors the real chat screen's UX: bubbles, typing delay,
// interest meter, coaching cards, ghosting, and an inline report card.
import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { demoRating, demoSend, demoState } from '../lib/demo';
import { Button, Card, Input, Muted } from '../components/ui';
import { CoachingCard } from '../components/CoachingCard';
import { InterestMeter } from '../components/InterestMeter';
import { colors, radius, spacing } from '../lib/theme';
import { CoachingFeedback, ConversationRating, ConversationStatus } from '../lib/types';

interface DemoItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback?: CoachingFeedback;
}

export default function DemoChat() {
  const [items, setItems] = useState<DemoItem[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [interest, setInterest] = useState(demoState.interest);
  const [status, setStatus] = useState<ConversationStatus>(demoState.status);
  const [rating, setRating] = useState<ConversationRating | null>(null);
  const listRef = useRef<FlatList>(null);
  const counter = useRef(0);

  const persona = demoState.persona;
  const herName = persona?.name ?? 'Mia';
  const conversationOver = status === 'ghosted' || status === 'ended';

  const scrollDown = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  const send = () => {
    const content = draft.trim();
    if (!content || typing || conversationOver) return;
    setDraft('');
    const result = demoSend(content);
    const userId = `u-${counter.current++}`;
    setItems((prev) => [...prev, { id: userId, role: 'user', content }]);
    scrollDown();
    setTyping(true);

    // Simulated "she's typing…" delay, longer when she's less interested
    const delay = 900 + Math.random() * 900 + (100 - result.interest_level) * 8;
    setTimeout(() => {
      setTyping(false);
      setInterest(result.interest_level);
      setStatus(result.status);
      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === userId ? { ...it, feedback: result.feedback } : it
        );
        if (result.reply) {
          next.push({
            id: `a-${counter.current++}`,
            role: 'assistant',
            content: result.reply,
          });
        }
        return next;
      });
      scrollDown();
    }, Math.min(delay, 3200));
  };

  const onRate = () => {
    const scores = items
      .filter((it) => it.feedback)
      .map((it) => it.feedback!.message_score);
    setRating(demoRating(scores));
    scrollDown();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: `${herName} (demo)` }} />
      <View style={styles.container}>
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>
            🧪 DEMO MODE — simulated replies. Connect the backend for real AI
            conversations.
          </Text>
        </View>
        <View style={styles.meterWrap}>
          <InterestMeter level={status === 'ghosted' ? 0 : interest} />
        </View>

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View>
              <View
                style={[
                  styles.bubble,
                  item.role === 'user' ? styles.bubbleMe : styles.bubbleHer,
                ]}
              >
                <Text
                  style={item.role === 'user' ? styles.bubbleTextMe : styles.bubbleTextHer}
                >
                  {item.content}
                </Text>
              </View>
              {item.role === 'user' && item.feedback && (
                <CoachingCard feedback={item.feedback} />
              )}
            </View>
          )}
          ListEmptyComponent={
            <Muted>
              Send your opener to {herName} (difficulty{' '}
              {persona?.difficulty ?? 5}/10). Try a lazy "hey" vs. something
              specific and watch the coaching change.
            </Muted>
          }
          ListFooterComponent={
            <View>
              {typing && (
                <View style={[styles.bubble, styles.bubbleHer]}>
                  <Text style={styles.bubbleTextHer}>•••</Text>
                </View>
              )}
              {status === 'ghosted' && (
                <Text style={styles.statusBanner}>
                  👻 {herName} left you on read.
                </Text>
              )}
              {status === 'ended' && (
                <Text style={styles.statusBanner}>
                  🚫 {herName} ended the conversation.
                </Text>
              )}
              {status === 'number_given' && (
                <Text style={[styles.statusBanner, { color: colors.success }]}>
                  📱 She gave you her number!
                </Text>
              )}
              {rating && <ReportCard rating={rating} />}
            </View>
          }
        />

        <View style={styles.toolbar}>
          <Pressable onPress={() => router.replace('/personas/new')}>
            <Text style={styles.toggle}>↺ New persona</Text>
          </Pressable>
          <Pressable onPress={onRate} disabled={items.length < 2}>
            <Text
              style={[
                styles.toggle,
                { color: items.length < 2 ? colors.textDim : colors.accent },
              ]}
            >
              ⭐ Rate conversation
            </Text>
          </Pressable>
        </View>

        <View style={styles.inputRow}>
          <Input
            placeholder={
              conversationOver
                ? 'Conversation over — rate it or start fresh'
                : `Message ${herName}…`
            }
            value={draft}
            onChangeText={setDraft}
            editable={!conversationOver}
            onSubmitEditing={send}
            style={styles.input}
          />
          <Pressable
            onPress={send}
            disabled={conversationOver || !draft.trim()}
            style={[styles.sendBtn, conversationOver && { opacity: 0.5 }]}
          >
            <Text style={styles.sendLabel}>➤</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ReportCard({ rating }: { rating: ConversationRating }) {
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
    <View style={{ marginTop: spacing.md }}>
      <Card>
        <View style={styles.scoreHero}>
          <Text style={styles.grade}>{grade}</Text>
          <Text style={styles.scoreNum}>{rating.overall_score}/100</Text>
        </View>
        <Text style={styles.summary}>{rating.summary}</Text>
        {rating.categories.map((c) => (
          <View key={c.category} style={{ marginTop: spacing.sm }}>
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
            <Muted>{c.advice}</Muted>
          </View>
        ))}
        <Text style={styles.sectionLabel}>Fix these first</Text>
        {rating.top_improvements.map((t, i) => (
          <Text key={i} style={styles.improvement}>
            {i + 1}. {t}
          </Text>
        ))}
        <Text style={styles.sectionLabel}>The science</Text>
        <Muted>{rating.psychology_insight}</Muted>
      </Card>
      <Button label="Practice again" onPress={() => router.replace('/personas/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
  demoBanner: {
    backgroundColor: '#3A2230',
    borderRadius: radius.sm,
    padding: 8,
    marginTop: spacing.sm,
  },
  demoBannerText: { color: colors.gold, fontSize: 12, textAlign: 'center' },
  meterWrap: { paddingVertical: spacing.sm },
  listContent: { paddingBottom: spacing.lg },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 4,
  },
  bubbleMe: { backgroundColor: colors.bubbleMe, alignSelf: 'flex-end' },
  bubbleHer: { backgroundColor: colors.bubbleHer, alignSelf: 'flex-start' },
  bubbleTextMe: { color: '#fff', fontSize: 15, lineHeight: 21 },
  bubbleTextHer: { color: colors.text, fontSize: 15, lineHeight: 21 },
  statusBanner: {
    color: colors.textDim,
    textAlign: 'center',
    marginVertical: spacing.md,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggle: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  input: { flex: 1, marginBottom: 0 },
  sendBtn: {
    backgroundColor: colors.accent,
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { color: '#fff', fontSize: 18, fontWeight: '800' },
  scoreHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  grade: { color: colors.accent, fontSize: 48, fontWeight: '900' },
  scoreNum: { color: colors.textDim, fontSize: 18, fontWeight: '700' },
  summary: { color: colors.text, marginBottom: spacing.sm },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  catScore: { fontWeight: '800', fontSize: 14 },
  sectionLabel: {
    color: colors.gold,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: 4,
    fontSize: 14,
  },
  improvement: { color: colors.text, lineHeight: 22, fontSize: 14 },
});
