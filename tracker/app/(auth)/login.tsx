import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [formError, setFormError] = useState<string | null>(null);

  async function handlePasswordSignIn() {
    if (!email.trim() || !password) {
      setFormError('Enter your email and password.');
      return;
    }
    setFormError(null);

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
      setFormError('Enter your email to receive a magic link.');
      return;
    }
    setFormError(null);

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
      className="flex-1 bg-background">
      <View className="flex-1 justify-center px-6">
        <Text variant="h1" className="mb-2 text-left text-3xl">
          Riftbound Tracker
        </Text>
        <Text variant="muted" className="mb-8 text-base">
          Sign in to manage your collection
        </Text>

        <AuthField
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setFormError(null);
          }}
        />

        {mode === 'password' && (
          <AuthField
            label="Password"
            autoCapitalize="none"
            autoComplete="password"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setFormError(null);
            }}
          />
        )}

        {formError ? <Text className="mb-4 text-sm text-destructive">{formError}</Text> : null}

        <Button disabled={isSubmitting} onPress={handleSubmit} className="mb-4">
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text>{mode === 'magic' ? 'Send magic link' : 'Sign in'}</Text>
          )}
        </Button>

        <Pressable
          onPress={() => {
            setMode(mode === 'password' ? 'magic' : 'password');
            setFormError(null);
          }}
          className="mb-6 active:opacity-60">
          <Text className="text-center text-sm text-primary">
            {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
          </Text>
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text variant="muted">No account?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable className="active:opacity-60">
              <Text className="font-semibold text-primary">Create one</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
