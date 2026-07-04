import { Stack } from 'expo-router';

import { useColorScheme } from '@/components/useColorScheme';
import { NAV_THEME } from '@/lib/theme';

export default function AuthLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: NAV_THEME[colorScheme].colors.background },
      }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
