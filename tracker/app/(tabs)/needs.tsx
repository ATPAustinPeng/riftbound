import { useCallback, useMemo } from 'react';

import { CardBrowser } from '@/components/CardBrowser';
import {
  canBeFoil,
  useCardsIndex,
  useUpsertUserCardMutation,
  useUserCardsMap,
} from '@/lib/queries';

export default function NeedsScreen() {
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

  const needsCards = useMemo(() => {
    if (!cardsQuery.data) return [];
    const userCardsMap = userCardsQuery.data ?? {};
    return cardsQuery.data.cards.filter((card) => {
      const entry = userCardsMap[card.id];
      const needsNormal = (entry?.quantity_owned ?? 0) < 3;
      const needsFoil = canBeFoil(card) && (entry?.quantity_owned_foil ?? 0) < 3;
      return needsNormal || needsFoil;
    });
  }, [cardsQuery.data, userCardsQuery.data]);

  const ownedByCardId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [cardId, entry] of Object.entries(userCardsQuery.data ?? {})) {
      map[cardId] = entry.quantity_owned;
    }
    return map;
  }, [userCardsQuery.data]);

  const foilOwnedByCardId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [cardId, entry] of Object.entries(userCardsQuery.data ?? {})) {
      map[cardId] = entry.quantity_owned_foil ?? 0;
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
        forSaleByCardId={{}}
        quickAdd
        listQuantityMode="needed"
        onOwnedChange={handleOwnedChange}
        onFoilOwnedChange={handleFoilOwnedChange}
        isLoading={isLoading}
        isError={isError}
        onRetry={onRetry}
        emptyMessage="All playsets complete!"
      />
    );
  }

  return (
    <CardBrowser
      cards={needsCards}
      index={cardsQuery.data}
      ownedByCardId={ownedByCardId}
      foilOwnedByCardId={foilOwnedByCardId}
      forSaleByCardId={{}}
      quickAdd
      listQuantityMode="needed"
      onOwnedChange={handleOwnedChange}
      onFoilOwnedChange={handleFoilOwnedChange}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyMessage="All playsets complete!"
    />
  );
}
