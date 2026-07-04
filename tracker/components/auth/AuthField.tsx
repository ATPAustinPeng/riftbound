import { View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

interface AuthFieldProps extends React.ComponentProps<typeof Input> {
  label: string;
}

export function AuthField({ label, className, ...props }: AuthFieldProps) {
  return (
    <View className="mb-4 gap-1.5">
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
      <Input placeholderTextColor="#9ca3af" className={className} {...props} />
    </View>
  );
}
