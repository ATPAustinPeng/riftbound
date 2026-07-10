import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TextInput, View } from 'react-native';

import { PlaysetProgress } from '@/components/PlaysetProgress';
import { QtyStepper } from '@/components/QtyStepper';
import { WishlistToggle } from '@/components/WishlistToggle';
import {
  canBeFoil,
  collectorNumberDisplay,
  getForSaleCount,
  getOwnedFoilQuantity,
  getOwnedQuantity,
  isWishlisted,
  useCard,
  useCollectionGoal,
  useToggleWishlistMutation,
  useUpsertUserCardMutation,
  useUserCardsMap,
  useWishlistMap,
} from '@/lib/queries';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View className="flex-row justify-between border-b border-border py-2 last:border-b-0">
      <Text variant="muted" className="text-sm">{label}</Text>
      <Text className="text-sm font-medium text-foreground">{value}</Text>
    </View>
  );
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cardQuery = useCard(id);
  const userCardsQuery = useUserCardsMap();
  const wishlistQuery = useWishlistMap();
  const upsertUserCard = useUpsertUserCardMutation();
  const toggleWishlist = useToggleWishlistMutation();
  const { goal } = useCollectionGoal();

  const card = cardQuery.data;
  const owned = getOwnedQuantity(userCardsQuery.data, id ?? '');
  const foilOwned = getOwnedFoilQuantity(userCardsQuery.data, id ?? '');
  const forSale = getForSaleCount(userCardsQuery.data, id ?? '');
  const wishlisted = isWishlisted(wishlistQuery.data, id ?? '');
  const notes = userCardsQuery.data?.[id ?? '']?.notes ?? '';
  const cardCanFoil = card ? canBeFoil(card) : false;
  const combinedOwned = owned + foilOwned;

  const [notesDraft, setNotesDraft] = useState(notes);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setNotesDraft(notes);
  }, [notes]);

  useEffect(() => {
    if (card?.name) {
      navigation.setOptions({ title: card.name });
    }
  }, [card?.name, navigation]);

  if (cardQuery.isLoading || userCardsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (cardQuery.isError || !card) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text variant="muted" className="mb-4 text-center text-base">
          Card not found.
        </Text>
        <Link href="/(tabs)" asChild>
          <Button>
            <Text>Back to Browse</Text>
          </Button>
        </Link>
      </View>
    );
  }

  function saveNotes() {
    if (!id || notesDraft === notes) return;
    upsertUserCard.mutate(
      { cardId: id, notes: notesDraft.trim() || null },
      {
        onSuccess: () => {
          setJustSaved(true);
          setTimeout(() => setJustSaved(false), 2000);
        },
      },
    );
  }

  const domains = card.domains?.map((d) => d.domain_label ?? d.domain_id).join(', ');
  const tags = card.tags?.map((t) => t.tag).join(', ');

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pb-10">
      <View className="items-center bg-muted px-4 py-6">
        {card.image_url ? (
          <Image
            source={{ uri: card.image_url }}
            accessibilityLabel={card.image_alt ?? card.name}
            className="aspect-[5/7] w-full max-w-sm"
            resizeMode="contain"
          />
        ) : (
          <View className="aspect-[5/7] w-full max-w-sm items-center justify-center rounded-lg bg-muted-foreground/20">
            <Text variant="muted">No image</Text>
          </View>
        )}
      </View>

      <View className="gap-6 px-4 pt-4">
        <View>
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl font-bold text-foreground">{card.name}</Text>
            {card.rarity_label ? (
              <Badge variant="secondary">
                <Text className="text-xs">{card.rarity_label}</Text>
              </Badge>
            ) : null}
          </View>
          <Text variant="muted" className="mt-1 text-sm">
            {card.set_name ?? card.set_id}
            {collectorNumberDisplay(card) != null ? ` · #${collectorNumberDisplay(card)}` : ''}
            {card.public_code ? ` · ${card.public_code}` : ''}
          </Text>
        </View>

        <Card className="p-4 py-4">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Stats</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <StatRow label="Type" value={card.card_type} />
            <StatRow label="Super type" value={card.super_type} />
            <StatRow label="Rarity" value={card.rarity_label} />
            <StatRow label="Energy" value={card.energy} />
            <StatRow label="Might" value={card.might} />
            <StatRow label="Power" value={card.power} />
            <StatRow label="Might bonus" value={card.might_bonus} />
            <StatRow label="Orientation" value={card.orientation} />
            <StatRow label="Domains" value={domains} />
            <StatRow label="Tags" value={tags} />
            <StatRow label="Illustrator" value={card.illustrator} />
          </CardContent>
        </Card>

        {card.ability_text ? (
          <Card className="p-4 py-4">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-sm">Ability</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Text className="text-sm leading-6 text-foreground">{card.ability_text}</Text>
            </CardContent>
          </Card>
        ) : null}

        <Card className="gap-4 p-4 py-4">
          <CardHeader className="p-0">
            <CardTitle className="text-sm">Your collection</CardTitle>
          </CardHeader>
          <CardContent className="gap-4 p-0">
            <PlaysetProgress goal={goal} owned={owned} foil={foilOwned} card={card} />
            {cardCanFoil && combinedOwned > 0 ? (
              <Text variant="muted" className="text-xs">
                {owned} normal{owned === 1 ? '' : 's'}
                {foilOwned > 0 ? ` + ${foilOwned} foil` : ''}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-6">
              <QtyStepper
                label="Owned"
                value={owned}
                onChange={(next) => id && upsertUserCard.mutate({ cardId: id, quantity_owned: next })}
              />
              {cardCanFoil ? (
                <QtyStepper
                  label="Owned (foil)"
                  value={foilOwned}
                  onChange={(next) =>
                    id && upsertUserCard.mutate({ cardId: id, quantity_owned_foil: next })
                  }
                />
              ) : null}
              <QtyStepper
                label="For sale"
                value={forSale}
                onChange={(next) => id && upsertUserCard.mutate({ cardId: id, for_sale_count: next })}
              />
            </View>
            <WishlistToggle
              isWishlisted={wishlisted}
              disabled={toggleWishlist.isPending}
              onToggle={() => id && toggleWishlist.mutate({ cardId: id, add: !wishlisted })}
            />
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-foreground">Notes</Text>
                {justSaved ? (
                  <Text variant="small" className="text-emerald-600 dark:text-emerald-500">
                    Saved
                  </Text>
                ) : null}
              </View>
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                onBlur={saveNotes}
                placeholder="Add notes about this copy…"
                placeholderTextColor="#9ca3af"
                multiline
                className="min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground"
              />
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
