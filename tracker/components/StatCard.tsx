import { Text, View } from 'react-native';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <View className="min-w-[140px] flex-1 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <Text className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</Text>
      <Text className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">{value}</Text>
      {subtitle ? (
        <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</Text>
      ) : null}
    </View>
  );
}
