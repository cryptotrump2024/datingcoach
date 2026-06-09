import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { ApiError, getCoaching, rateConversation, sendChatMessage } from '../../lib/api';
import { Button, Input, Muted } from '../../components/ui';
import { CoachingCard } from '../../components/CoachingCard';
import { InterestMeter } from '../../components/InterestMeter';
import { colors, radius, spacing } from '../../lib/theme';
import {
  CoachingFeedback,
  Conversation,
  ConversationStatus,
  Message,
  Persona,
} from '../../lib/types';

interface ChatItem {
  message: Message;
  feedback?: CoachingFeedback;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tier, refresh } = useAuth();
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [liveCoaching, setLiveCoaching] = useState(true);
  const [interest, setInterest] = useState(50);
  const [status, setStatus] = useState<ConversationStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: c } = await supabase
      .from('conversations')
      .select('*, personas(*)')
      .eq('id', id)
      .single();
    if (!c) return;
    setConvo(c as Conversation);
    setPersona((c as { personas: Persona }).personas);
    setInterest((c as Conversation).interest_level);
    setStatus((c as Conversation).status);
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, message_feedback(feedback)')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    setItems(
      ((msgs as (Message & { message_feedback: { feedback: CoachingFeedback }[] })[]) ?? []).map(
        (m) => ({
          message: m,
          feedback: m.message_feedback?.[0]?.feedback,
        })
      )
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const scrollDown = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  const send = async () => {
    const content = draft.trim();
    if (!content || !id || sending) return;
    setDraft('');
    setError(null);
    setSending(true);

    // Optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatItem = {
      message: {
        id: tempId,
        conversation_id: id,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      },
    };
    setItems((prev) => [...prev, optimistic]);
    scrollDown();
    setTyping(true);
    setStreamText('');

    try {
      const result = await sendChatMessage(id, content, (partial) => {
        setStreamText(partial);
        scrollDown();
      });
      setTyping(false);
      setStreamText('');
      setInterest(result.interest_level);
      setStatus(result.status);

      setItems((prev) => {
        const next = prev.map((it) =>
          it.message.id === tempId
            ? { ...it, message: { ...it.message, id: result.user_message_id } }
            : it
        );
        if (result.reply && result.assistant_message_id) {
          next.push({
            message: {
              id: result.assistant_message_id,
              conversation_id: id,
              role: 'assistant',
              content: result.reply,
              created_at: new Date().toISOString(),
            },
          });
        }
        return next;
      });
      scrollDown();
      refresh(); // update remaining credits

      if (liveCoaching) {
        try {
          const feedback = await getCoaching(id, result.user_message_id);
          setItems((prev) =>
            prev.map((it) =>
              it.message.id === result.user_message_id ? { ...it, feedback } : it
            )
          );
          scrollDown();
        } catch {
          // Coaching is non-blocking; chat continues without it
        }
      }
    } catch (e) {
      setTyping(false);
      setStreamText('');
      setItems((prev) => prev.filter((it) => it.message.id !== tempId));
      if (e instanceof ApiError && e.status === 402) {
        setError('out_of_credits');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to send');
      }
    } finally {
      setSending(false);
    }
  };

  const onRate = async () => {
    if (!id) return;
    setRating(true);
    try {
      await rateConversation(id);
      router.push(`/rating/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rating failed');
    } finally {
      setRating(false);
    }
  };

  const herName = persona?.name ?? '...';
  const conversationOver = status === 'ghosted' || status === 'ended';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerRow}>
              {persona?.image_url ? (
                <Image source={{ uri: persona.image_url }} style={styles.headerAvatar} />
              ) : null}
              <View>
                <Text style={styles.headerName}>{herName}</Text>
                <Text style={styles.headerSub}>
                  Difficulty {persona?.difficulty ?? '–'}/10
                </Text>
              </View>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        {tier !== 'free' && (
          <View style={styles.meterWrap}>
            <InterestMeter level={status === 'ghosted' ? 0 : interest} />
          </View>
        )}

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.message.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View>
              <Bubble message={item.message} />
              {item.message.role === 'user' && item.feedback && (
                <CoachingCard feedback={item.feedback} />
              )}
            </View>
          )}
          ListFooterComponent={
            <View>
              {typing && (
                <View style={[styles.bubble, styles.bubbleHer]}>
                  <Text style={styles.bubbleTextHer}>
                    {streamText || '•••'}
                  </Text>
                </View>
              )}
              {status === 'ghosted' && (
                <Text style={styles.statusBanner}>
                  👻 {herName} left you on read. Hit "Rate conversation" to see
                  what went wrong.
                </Text>
              )}
              {status === 'ended' && (
                <Text style={styles.statusBanner}>
                  🚫 {herName} ended the conversation.
                </Text>
              )}
              {status === 'number_given' && (
                <Text style={[styles.statusBanner, { color: colors.success }]}>
                  📱 She gave you her number. Nicely done — rate the conversation
                  to lock in what worked.
                </Text>
              )}
            </View>
          }
        />

        {error === 'out_of_credits' ? (
          <View style={styles.paywall}>
            <Text style={styles.paywallText}>
              You're out of messages on your current plan.
            </Text>
            <Button label="Upgrade to keep practicing" onPress={() => router.push('/pricing')} />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        <View style={styles.toolbar}>
          <Pressable onPress={() => setLiveCoaching((v) => !v)}>
            <Text style={[styles.toggle, liveCoaching && { color: colors.gold }]}>
              {liveCoaching ? '🎓 Live coaching ON' : '🎓 Live coaching OFF'}
            </Text>
          </Pressable>
          <Pressable onPress={onRate} disabled={rating || items.length < 2}>
            <Text
              style={[
                styles.toggle,
                { color: items.length < 2 ? colors.textDim : colors.accent },
              ]}
            >
              {rating ? 'Scoring…' : '⭐ Rate conversation'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.inputRow}>
          <Input
            placeholder={
              conversationOver ? 'Conversation over — rate it or start fresh' : `Message ${herName}…`
            }
            value={draft}
            onChangeText={setDraft}
            editable={!conversationOver && !sending}
            onSubmitEditing={send}
            style={styles.input}
          />
          <Pressable
            onPress={send}
            disabled={sending || conversationOver || !draft.trim()}
            style={[styles.sendBtn, (sending || conversationOver) && { opacity: 0.5 }]}
          >
            <Text style={styles.sendLabel}>➤</Text>
          </Pressable>
        </View>
        {convo && items.length === 0 && (
          <Muted>
            Send your opener. First impressions count — she can see your effort
            level from message one.
          </Muted>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: Message }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleHer]}>
      <Text style={mine ? styles.bubbleTextMe : styles.bubbleTextHer}>
        {message.content}
      </Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 34, height: 34, borderRadius: radius.pill },
  headerName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  headerSub: { color: colors.textDim, fontSize: 11 },
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.md },
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
  paywall: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  paywallText: { color: colors.text, marginBottom: spacing.sm, fontWeight: '600' },
  error: { color: colors.danger, marginBottom: spacing.sm },
});
