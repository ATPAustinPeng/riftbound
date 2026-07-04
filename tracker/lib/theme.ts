import { DarkTheme, DefaultTheme } from 'expo-router';

// Mirrors the HSL values in global.css — the single source of truth for React
// Navigation chrome (headers, tab bar) that can't be styled with Tailwind classes.
export const NAV_THEME = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'hsl(0, 0%, 100%)',
      border: 'hsl(0, 0%, 89.8%)',
      card: 'hsl(0, 0%, 100%)',
      notification: 'hsl(0, 84.2%, 60.2%)',
      primary: 'hsl(221.2, 83.2%, 53.3%)',
      text: 'hsl(0, 0%, 3.9%)',
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: 'hsl(0, 0%, 3.9%)',
      border: 'hsl(0, 0%, 14.9%)',
      card: 'hsl(0, 0%, 3.9%)',
      notification: 'hsl(0, 70.9%, 59.4%)',
      primary: 'hsl(217.2, 91.2%, 59.8%)',
      text: 'hsl(0, 0%, 98%)',
    },
  },
} as const;
