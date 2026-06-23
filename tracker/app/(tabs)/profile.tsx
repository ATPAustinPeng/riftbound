import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';

import { CollectionGoalSelector } from '@/components/CollectionGoalSelector';

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName =
    profile?.display_name ??
    (user?.user_metadata?.display_name as string | undefined) ??
    'Collector';

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign out.';
      Alert.alert('Sign out failed', message);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <View className="flex-1 bg-white px-6 pt-8 dark:bg-neutral-950">
      <Text className="mb-1 text-sm uppercase tracking-wide text-neutral-500">Signed in as</Text>
      <Text className="mb-1 text-2xl font-bold text-neutral-900 dark:text-white">{displayName}</Text>
      <Text className="mb-8 text-base text-neutral-600 dark:text-neutral-400">{user?.email ?? '—'}</Text>

      <View className="mb-8 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <Text className="mb-3 text-sm font-medium text-neutral-500">Collection goal</Text>
        <CollectionGoalSelector />
      </View>

      <View className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <Text className="mb-1 text-sm font-medium text-neutral-500">Account</Text>
        <Text className="text-base text-neutral-800 dark:text-neutral-200">
          User ID: {user?.id ?? '—'}
        </Text>
      </View>

      <Pressable
        disabled={isSigningOut}
        onPress={handleSignOut}
        className="mt-8 items-center rounded-lg bg-red-600 py-3 disabled:opacity-60">
        {isSigningOut ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white">Sign out</Text>
        )}
      </Pressable>
    </View>
  );
}
