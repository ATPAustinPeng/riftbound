import { Pressable, Text, View } from 'react-native';

interface WishlistToggleProps {
  isWishlisted: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function WishlistToggle({ isWishlisted, onToggle, disabled = false }: WishlistToggleProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onToggle}
      className={`flex-row items-center justify-center gap-2 rounded-lg border px-4 py-3 ${
        isWishlisted
          ? 'border-pink-600 bg-pink-50 dark:border-pink-500 dark:bg-pink-950'
          : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900'
      } ${disabled ? 'opacity-60' : ''}`}>
      <Text className="text-lg">{isWishlisted ? '♥' : '♡'}</Text>
      <Text
        className={`text-base font-semibold ${
          isWishlisted ? 'text-pink-700 dark:text-pink-300' : 'text-neutral-700 dark:text-neutral-300'
        }`}>
        {isWishlisted ? 'On wishlist' : 'Add to wishlist'}
      </Text>
    </Pressable>
  );
}
