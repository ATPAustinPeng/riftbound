import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';

import { CollectionGoalSelector } from '@/components/CollectionGoalSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayName =
    profile?.display_name ??
    (user?.user_metadata?.display_name as string | undefined) ??
    'Collector';

  const userId = user?.id ?? '';
  const truncatedId = userId ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : '—';

  async function handleCopyId() {
    if (!userId) return;
    await Clipboard.setStringAsync(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  }

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
    <View className="flex-1 bg-background px-6 pt-8">
      <Text variant="small" className="mb-1 uppercase tracking-wide text-muted-foreground">
        Signed in as
      </Text>
      <Text variant="h2" className="mb-1 border-0 p-0 text-left text-2xl">
        {displayName}
      </Text>
      <Text variant="muted" className="mb-8 text-base">
        {user?.email ?? '—'}
      </Text>

      <Card className="mb-4 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Collection goal
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-3">
          <CollectionGoalSelector />
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex-row items-center justify-between px-4 pt-3">
          <Text className="text-base text-foreground">{truncatedId}</Text>
          <Pressable onPress={() => void handleCopyId()} className="active:opacity-60">
            <Text className="text-sm font-medium text-primary">{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </CardContent>
      </Card>

      <Button
        disabled={isSigningOut}
        onPress={confirmSignOut}
        variant="destructive"
        className="mt-8">
        {isSigningOut ? <ActivityIndicator color="#fff" /> : <Text>Sign out</Text>}
      </Button>
    </View>
  );
}
