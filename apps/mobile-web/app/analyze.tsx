import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useAuth } from '../lib/AuthContext';
import { analyzeProfileImage } from '../lib/api';
import { Button, Card, Muted, Screen, Subtitle, Title } from '../components/ui';
import { colors, radius, spacing } from '../lib/theme';
import { ProfileAnalysis } from '../lib/types';

export default function Analyze() {
  const { tier } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (tier !== 'advanced') {
    return (
      <Screen>
        <Title>Profile Analyzer</Title>
        <Subtitle>
          Upload a screenshot of any dating profile and get a full read: what it
          really communicates, the hooks to use, and openers tailored to her.
        </Subtitle>
        <Button label="Unlock with Advanced" onPress={() => router.push('/pricing')} />
      </Screen>
    );
  }

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setAnalysis(null);
    if (!asset.base64) {
      setError('Could not read image data');
      return;
    }
    setBusy(true);
    try {
      const mediaType = asset.mimeType ?? 'image/jpeg';
      const res = await analyzeProfileImage(asset.base64, mediaType);
      setAnalysis(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Profile Analyzer</Title>
      <Subtitle>
        Screenshot a profile, get the decode: who she is, what she responds to,
        and exactly how to open.
      </Subtitle>
      <Button label={imageUri ? 'Pick another screenshot' : 'Pick a screenshot'} onPress={pick} loading={busy} />
      {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
      {error && <Text style={styles.error}>{error}</Text>}
      {busy && <Muted>Reading the profile…</Muted>}

      {analysis && (
        <View>
          <Section title="📡 What this profile communicates" text={analysis.what_it_communicates} />
          <Section title="🧠 Personality read" text={analysis.personality_read} />
          <Card>
            <Text style={styles.cardTitle}>🪝 Conversation hooks</Text>
            {analysis.conversation_hooks.map((h, i) => (
              <Text key={i} style={styles.listItem}>
                • {h}
              </Text>
            ))}
          </Card>
          <Card>
            <Text style={styles.cardTitle}>✍️ Openers to send</Text>
            {analysis.suggested_openers.map((o, i) => (
              <Text key={i} style={styles.listItem}>
                {i + 1}. “{o}”
              </Text>
            ))}
          </Card>
          {analysis.red_flags_or_cautions ? (
            <Section title="⚠️ Worth knowing" text={analysis.red_flags_or_cautions} />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.body}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 380,
    borderRadius: radius.md,
    marginVertical: spacing.md,
    resizeMode: 'contain',
    backgroundColor: colors.card,
  },
  cardTitle: { color: colors.gold, fontWeight: '800', marginBottom: spacing.sm, fontSize: 15 },
  body: { color: colors.text, lineHeight: 21 },
  listItem: { color: colors.text, lineHeight: 24 },
  error: { color: colors.danger, marginVertical: spacing.sm },
});
