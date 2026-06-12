import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/AuthContext';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'CharmCoach', headerShown: false }} />
        <Stack.Screen name="auth" options={{ title: 'Sign in' }} />
        <Stack.Screen name="pricing" options={{ title: 'Upgrade' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
        <Stack.Screen name="analyze" options={{ title: 'Profile Analyzer' }} />
        <Stack.Screen name="personas/new" options={{ title: 'Create her' }} />
        <Stack.Screen name="demo" options={{ title: 'Demo chat' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="rating/[id]" options={{ title: 'Conversation Report' }} />
      </Stack>
    </AuthProvider>
  );
}
