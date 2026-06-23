import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth-context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <RootNavigator />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return children;
}

function RootNavigator() {
  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/*
        transparentModal keeps the screen below (the tab list) mounted at its
        real size instead of collapsing it to 0x0. That avoids the FlashList
        re-render/scroll-reset bug on web when pushing the card detail.
        The detail screen paints its own opaque background to cover the list.
      */}
      <Stack.Screen
        name="card/[id]"
        options={{ title: 'Card Detail', presentation: 'transparentModal', headerShown: true }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
