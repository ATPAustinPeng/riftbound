import { useState } from 'react';
import { View } from 'react-native';

import { CardPickerField, CardPickerSheet } from '@/components/match/CardPickerSheet';
import type { Card } from '@/lib/types';

interface LegendPickerProps {
  label: string;
  cards: Card[];
  selectedCard: Card | null;
  /** `null` = legend unknown (cleared via the sheet's "Clear selection" row). */
  onSelect: (card: Card | null) => void;
  disabledCardIds?: string[];
  disabledReason?: (card: Card) => string | undefined;
  /** Shown when nothing is selected. */
  placeholder?: string;
}

export function LegendPicker({
  label,
  cards,
  selectedCard,
  onSelect,
  disabledCardIds,
  disabledReason,
  placeholder = 'Select Legend…',
}: LegendPickerProps) {
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
        allowClear
        onClear={() => {
          onSelect(null);
          setOpen(false);
        }}
        onSelect={(card) => {
          onSelect(card);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
