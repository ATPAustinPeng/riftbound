import { useCallback, useMemo } from 'react';

import { CardBrowser } from '@/components/CardBrowser';
import {
  useCardsIndex,
  useUpsertUserCardMutation,
  useUserCardsMap,
  useWishlistMap,
} from '@/lib/queries';

export default function BrowseScreen() {
  const cardsQuery = useCardsIndex();
  const userCardsQuery = useUserCardsMap();
  const wishlistQuery = useWishlistMap();
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

  const wishlistedIds = useMemo(
    () => new Set(Object.keys(wishlistQuery.data ?? {})),
    [wishlistQuery.data],
  );

  if (!cardsQuery.data) {
    return (
      <CardBrowser
        cards={[]}
        index={{
          cards: [],
          domainsByCardId: {},
          tagsByCardId: {},
          sets: [],
          rarities: [],
          domains: [],
          cardTypes: [],
        }}
        ownedByCardId={ownedByCardId}
        foilOwnedByCardId={foilOwnedByCardId}
        forSaleByCardId={forSaleByCardId}
        wishlistedIds={wishlistedIds}
        quickAdd
        listQuantityMode="owned"
        onOwnedChange={handleOwnedChange}
        onFoilOwnedChange={handleFoilOwnedChange}
        isLoading={cardsQuery.isLoading}
        isError={cardsQuery.isError}
        onRetry={() => cardsQuery.refetch()}
        emptyMessage="No cards loaded yet. Seed your Supabase project to get started."
      />
    );
  }

  return (
    <CardBrowser
      cards={cardsQuery.data.cards}
      index={cardsQuery.data}
      ownedByCardId={ownedByCardId}
      foilOwnedByCardId={foilOwnedByCardId}
      forSaleByCardId={forSaleByCardId}
      wishlistedIds={wishlistedIds}
      quickAdd
      listQuantityMode="owned"
      onOwnedChange={handleOwnedChange}
      onFoilOwnedChange={handleFoilOwnedChange}
      isLoading={cardsQuery.isLoading}
      isError={cardsQuery.isError}
      onRetry={() => cardsQuery.refetch()}
      emptyMessage="No cards match your filters."
    />
  );
}
