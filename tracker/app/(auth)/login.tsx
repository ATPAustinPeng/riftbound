import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'password' | 'magic'>('password');

  async function handlePasswordSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }

    router.replace('/(tabs)');
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Enter your email to receive a magic link.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setIsSubmitting(false);

    if (error) {
      Alert.alert('Magic link failed', error.message);
      return;
    }

    Alert.alert('Check your email', 'We sent you a sign-in link.');
  }

  async function handleSubmit() {
    if (mode === 'magic') {
      await handleMagicLink();
    } else {
      await handlePasswordSignIn();
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white dark:bg-neutral-950">
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-3xl font-bold text-neutral-900 dark:text-white">
          Riftbound Tracker
        </Text>
        <Text className="mb-8 text-base text-neutral-600 dark:text-neutral-400">
          Sign in to manage your collection
        </Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          className="mb-4 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />

        {mode === 'password' && (
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            className="mb-4 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
        )}

        <Pressable
          disabled={isSubmitting}
          onPress={handleSubmit}
          className="mb-4 items-center rounded-lg bg-blue-600 py-3 disabled:opacity-60">
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-semibold text-white">
              {mode === 'magic' ? 'Send magic link' : 'Sign in'}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={() => setMode(mode === 'password' ? 'magic' : 'password')} className="mb-6">
          <Text className="text-center text-sm text-blue-600">
            {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
          </Text>
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text className="text-neutral-600 dark:text-neutral-400">No account?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text className="font-semibold text-blue-600">Create one</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
