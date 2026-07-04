import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleRegister() {
    if (!email.trim() || !password) {
      setFormError('Enter your email and password.');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setFormError(null);

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
      setFormError('Enter your email to receive a magic link.');
      return;
    }
    setFormError(null);

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
      className="flex-1 bg-background">
      <View className="flex-1 justify-center px-6">
        <Text variant="h1" className="mb-2 text-left text-3xl">
          Create account
        </Text>
        <Text variant="muted" className="mb-8 text-base">
          Track your Riftbound collection
        </Text>

        <AuthField
          label="Display name (optional)"
          autoCapitalize="words"
          placeholder="Your name"
          value={displayName}
          onChangeText={setDisplayName}
        />

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

        <AuthField
          label="Password"
          autoCapitalize="none"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          secureTextEntry
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setFormError(null);
          }}
        />

        {formError ? <Text className="mb-4 text-sm text-destructive">{formError}</Text> : null}

        <Button disabled={isSubmitting} onPress={handleRegister} className="mb-3">
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text>Create account</Text>}
        </Button>

        <Button
          disabled={isSubmitting}
          onPress={handleMagicLink}
          variant="outline"
          className="mb-6">
          <Text>Send magic link instead</Text>
        </Button>

        <View className="flex-row justify-center gap-1">
          <Text variant="muted">Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable className="active:opacity-60">
              <Text className="font-semibold text-primary">Sign in</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
