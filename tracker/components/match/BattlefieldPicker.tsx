import { useState } from 'react';
import { View } from 'react-native';

import { CardPickerField, CardPickerSheet } from '@/components/match/CardPickerSheet';
import type { Card } from '@/lib/types';

interface BattlefieldPickerProps {
  label: string;
  cards: Card[];
  selectedCard: Card | null;
  onSelect: (card: Card | null) => void;
  /** Bo3 no-reuse: battlefields already used in earlier games (soft-enforced). */
  disabledCardIds?: string[];
  /** Tag shown on disabled rows, e.g. "used G1". */
  disabledReason?: (card: Card) => string | undefined;
  /** Shown when nothing is selected. */
  placeholder?: string;
}

export function BattlefieldPicker({
  label,
  cards,
  selectedCard,
  onSelect,
  disabledCardIds,
  disabledReason,
  placeholder = 'Select Battlefield…',
}: BattlefieldPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <CardPickerField
        label={label}
        selectedCard={selectedCard}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
      />
      <CardPickerSheet
        visible={open}
        title={label}
        cards={cards}
        selectedCardId={selectedCard?.id ?? null}
        disabledCardIds={disabledCardIds}
        disabledReason={disabledReason}
        onSelect={(card) => {
          onSelect(card);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
