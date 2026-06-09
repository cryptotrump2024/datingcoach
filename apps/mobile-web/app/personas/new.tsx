import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { generatePersonaImage } from '../../lib/api';
import {
  Button,
  Card,
  Input,
  Label,
  Muted,
  Pill,
  Screen,
  Subtitle,
  Title,
} from '../../components/ui';
import { colors, spacing } from '../../lib/theme';
import { ARCHETYPES, ETHNICITIES, PersonaCharacteristics } from '../../lib/types';

const TEXTING_STYLES = ['playful', 'flirty', 'dry', 'intellectual', 'chaotic'] as const;
const ATTACHMENT = ['secure', 'anxious', 'avoidant'] as const;

export default function NewPersona() {
  const { session, tier } = useAuth();
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState(5);
  const [ethnicity, setEthnicity] = useState<string>(ETHNICITIES[0]);
  const [archetype, setArchetype] = useState<string>(ARCHETYPES[0].key);
  const [age, setAge] = useState('25');
  const [occupation, setOccupation] = useState('');
  const [interests, setInterests] = useState('');
  const [textingStyle, setTextingStyle] =
    useState<PersonaCharacteristics['texting_style']>('playful');
  const [attachment, setAttachment] =
    useState<PersonaCharacteristics['attachment_style']>('secure');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!session) {
      router.push('/auth');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const characteristics: PersonaCharacteristics = {
        age: Math.max(18, parseInt(age, 10) || 25),
        occupation: occupation.trim() || 'marketing',
        interests: interests
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        attachment_style: attachment,
        texting_style: textingStyle,
        extra: extra.trim() || undefined,
      };
      const { data, error: dbError } = await supabase
        .from('personas')
        .insert({
          user_id: session.user.id,
          name: name.trim() || 'Mia',
          difficulty,
          ethnicity,
          personality_archetype: archetype,
          characteristics,
        })
        .select()
        .single();
      if (dbError) throw new Error(dbError.message);

      // Persona portraits are a Pro+ perk; free tier chats without an image
      if (tier !== 'free') {
        try {
          await generatePersonaImage(data.id);
        } catch {
          // Image generation is best-effort; chat works without it
        }
      }

      const { data: convo, error: convoError } = await supabase
        .from('conversations')
        .insert({ user_id: session.user.id, persona_id: data.id })
        .select()
        .single();
      if (convoError) throw new Error(convoError.message);
      router.replace(`/chat/${convo.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Build her</Title>
      <Subtitle>
        Design who you want to practice with. She'll text like a real person —
        personality, moods, standards and all.
      </Subtitle>

      <Card>
        <Label>Name</Label>
        <Input placeholder="Mia" value={name} onChangeText={setName} />

        <Label>
          Difficulty: {difficulty}/10{' '}
          <Text style={styles.diffHint}>
            {difficulty <= 3
              ? '— friendly and forgiving'
              : difficulty <= 6
              ? '— realistic, has standards'
              : difficulty <= 8
              ? '— hard to impress, will ghost'
              : '— brutal. one bad text and she’s gone'}
          </Text>
        </Label>
        <Slider
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={difficulty}
          onValueChange={setDifficulty}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
          style={{ width: '100%', height: 40 }}
        />

        <Label>Ethnicity</Label>
        <View style={styles.pillRow}>
          {ETHNICITIES.map((e) => (
            <Pill key={e} label={e} selected={ethnicity === e} onPress={() => setEthnicity(e)} />
          ))}
        </View>

        <Label>Personality</Label>
        <View style={styles.pillRow}>
          {ARCHETYPES.map((a) => (
            <Pill
              key={a.key}
              label={a.label}
              selected={archetype === a.key}
              onPress={() => setArchetype(a.key)}
            />
          ))}
        </View>
        <Muted>{ARCHETYPES.find((a) => a.key === archetype)?.blurb}</Muted>

        <Label>Age</Label>
        <Input value={age} onChangeText={setAge} keyboardType="number-pad" />

        <Label>Occupation</Label>
        <Input
          placeholder="e.g. nurse, designer, law student"
          value={occupation}
          onChangeText={setOccupation}
        />

        <Label>Interests (comma separated)</Label>
        <Input
          placeholder="travel, pilates, true crime podcasts"
          value={interests}
          onChangeText={setInterests}
        />

        <Label>Texting style</Label>
        <View style={styles.pillRow}>
          {TEXTING_STYLES.map((t) => (
            <Pill
              key={t}
              label={t}
              selected={textingStyle === t}
              onPress={() => setTextingStyle(t)}
            />
          ))}
        </View>

        <Label>Attachment style</Label>
        <View style={styles.pillRow}>
          {ATTACHMENT.map((a) => (
            <Pill key={a} label={a} selected={attachment === a} onPress={() => setAttachment(a)} />
          ))}
        </View>

        <Label>Anything else about her?</Label>
        <Input
          placeholder="e.g. just got out of a long relationship, hates pickup lines"
          value={extra}
          onChangeText={setExtra}
          multiline
        />
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Start the conversation" onPress={create} loading={busy} />
      {tier === 'free' && (
        <Muted>
          Pro members get an AI-generated photo of her and the full coaching
          decoder.
        </Muted>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap' },
  diffHint: { color: colors.textDim, fontWeight: '400', fontSize: 13 },
  error: { color: colors.danger, marginBottom: spacing.sm },
});
