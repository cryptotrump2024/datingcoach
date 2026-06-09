import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';

export function InterestMeter({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, level));
  const barColor =
    pct >= 65 ? colors.success : pct >= 35 ? colors.warning : colors.danger;
  const label =
    pct >= 80
      ? 'Hooked'
      : pct >= 65
      ? 'Interested'
      : pct >= 45
      ? 'Curious'
      : pct >= 25
      ? 'Lukewarm'
      : pct > 0
      ? 'Losing her'
      : 'Gone';
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.label, { color: barColor }]}>
        {label} · {pct}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.pill },
  label: { fontSize: 12, fontWeight: '700', width: 110, textAlign: 'right' },
});
