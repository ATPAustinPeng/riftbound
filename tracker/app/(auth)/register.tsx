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

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: displayName.trim() || null,
        },
      },
    });
    setIsSubmitting(false);

    if (error) {
      Alert.alert('Registration failed', error.message);
      return;
    }

    if (data.session) {
      router.replace('/(tabs)');
      return;
    }

    Alert.alert(
      'Confirm your email',
      'Check your inbox to verify your account, then sign in.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
    );
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Enter your email to receive a magic link.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        data: {
          display_name: displayName.trim() || null,
        },
      },
    });
    setIsSubmitting(false);

    if (error) {
      Alert.alert('Magic link failed', error.message);
      return;
    }

    Alert.alert('Check your email', 'We sent you a sign-in link.');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white dark:bg-neutral-950">
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-3xl font-bold text-neutral-900 dark:text-white">
          Create account
        </Text>
        <Text className="mb-8 text-base text-neutral-600 dark:text-neutral-400">
          Track your Riftbound collection
        </Text>

        <TextInput
          autoCapitalize="words"
          placeholder="Display name (optional)"
          placeholderTextColor="#9ca3af"
          value={displayName}
          onChangeText={setDisplayName}
          className="mb-4 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />

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

        <TextInput
          autoCapitalize="none"
          autoComplete="new-password"
          placeholder="Password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          className="mb-4 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />

        <Pressable
          disabled={isSubmitting}
          onPress={handleRegister}
          className="mb-3 items-center rounded-lg bg-blue-600 py-3 disabled:opacity-60">
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-semibold text-white">Create account</Text>
          )}
        </Pressable>

        <Pressable
          disabled={isSubmitting}
          onPress={handleMagicLink}
          className="mb-6 items-center rounded-lg border border-blue-600 py-3 disabled:opacity-60">
          <Text className="text-base font-semibold text-blue-600">Send magic link instead</Text>
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text className="text-neutral-600 dark:text-neutral-400">Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text className="font-semibold text-blue-600">Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
