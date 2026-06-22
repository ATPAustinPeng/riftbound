import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { CardBrowser } from '@/components/CardBrowser';
import { CollectionStatsPanel } from '@/components/CollectionStatsPanel';
import {
  useCardsIndex,
  useUpsertUserCardMutation,
  useUserCardsMap,
} from '@/lib/queries';

export default function CollectionScreen() {
  const cardsQuery = useCardsIndex();
  const userCardsQuery = useUserCardsMap();
  const upsertUserCard = useUpsertUserCardMutation();

  const handleOwnedChange = useCallback(
    (cardId: string, next: number) => upsertUserCard.mutate({ cardId, quantity_owned: next }),
    [upsertUserCard],
  );
  const handleFoilOwnedChange = useCallback(
    (cardId: string, next: number) =>
      upsertUserCard.mutate({ cardId, quantity_owned_foil: next }),
    [upsertUserCard],
  );
  const handleForSaleChange = useCallback(
    (cardId: string, next: number) => upsertUserCard.mutate({ cardId, for_sale_count: next }),
    [upsertUserCard],
  );

  const ownedCards = useMemo(() => {
    if (!cardsQuery.data || !userCardsQuery.data) return [];
    const cardById = new Map(cardsQuery.data.cards.map((c) => [c.id, c]));
    const result = [];
    for (const entry of Object.values(userCardsQuery.data)) {
      const foil = entry.quantity_owned_foil ?? 0;
      if (entry.quantity_owned + foil <= 0) continue;
      const card = cardById.get(entry.card_id);
      if (card) result.push(card);
    }
    return result;
  }, [cardsQuery.data, userCardsQuery.data]);

  const ownedByCardId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [cardId, entry] of Object.entries(userCardsQuery.data ?? {})) {
      if (entry.quantity_owned > 0) map[cardId] = entry.quantity_owned;
    }
    return map;
  }, [userCardsQuery.data]);

  const foilOwnedByCardId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [cardId, entry] of Object.entries(userCardsQuery.data ?? {})) {
      const foil = entry.quantity_owned_foil ?? 0;
      if (foil > 0) map[cardId] = foil;
    }
    return map;
  }, [userCardsQuery.data]);

  const forSaleByCardId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [cardId, entry] of Object.entries(userCardsQuery.data ?? {})) {
      if (entry.for_sale_count > 0) map[cardId] = entry.for_sale_count;
    }
    return map;
  }, [userCardsQuery.data]);

  const emptyIndex = {
    cards: [],
    domainsByCardId: {},
    tagsByCardId: {},
    sets: [],
    rarities: [],
    domains: [],
    cardTypes: [],
  };

  const isLoading = cardsQuery.isLoading || userCardsQuery.isLoading;
  const isError = cardsQuery.isError || userCardsQuery.isError;

  const onRetry = () => {
    if (cardsQuery.isError) cardsQuery.refetch();
    if (userCardsQuery.isError) userCardsQuery.refetch();
  };

  if (!cardsQuery.data) {
    return (
      <CardBrowser
        cards={[]}
        index={emptyIndex}
        ownedByCardId={ownedByCardId}
        foilOwnedByCardId={foilOwnedByCardId}
        forSaleByCardId={forSaleByCardId}
        quickAdd
        listQuantityMode="owned"
        onOwnedChange={handleOwnedChange}
        onFoilOwnedChange={handleFoilOwnedChange}
        onForSaleChange={handleForSaleChange}
        isLoading={isLoading}
        isError={isError}
        onRetry={onRetry}
        emptyMessage="No cards in your collection yet. Browse cards and add owned copies from the card detail screen."
      />
    );
  }

  return (
    <CardBrowser
      cards={ownedCards}
      index={cardsQuery.data}
      ownedByCardId={ownedByCardId}
      foilOwnedByCardId={foilOwnedByCardId}
      forSaleByCardId={forSaleByCardId}
      quickAdd
      listQuantityMode="owned"
      onOwnedChange={handleOwnedChange}
      onFoilOwnedChange={handleFoilOwnedChange}
      onForSaleChange={handleForSaleChange}
      headerExtra={
        <View className="px-4 pb-2 pt-2">
          <CollectionStatsPanel />
        </View>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyMessage="No cards in your collection yet. Browse cards and add owned copies from the card detail screen."
    />
  );
}
