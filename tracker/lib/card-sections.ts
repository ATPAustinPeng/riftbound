import {
  compareCards,
  compareSetIds,
  DOMAIN_COLORS,
  isTokenCard,
  type CardsIndex,
  type FilteredCard,
} from '@/lib/queries';

export { isTokenCard };

export type RarityBucket = 'common' | 'uncommon' | 'rare' | 'epicPlus';

export const RARITY_BUCKETS: Array<{ bucket: RarityBucket; label: string }> = [
  { bucket: 'common', label: 'Common' },
  { bucket: 'uncommon', label: 'Uncommon' },
  { bucket: 'rare', label: 'Rare' },
  { bucket: 'epicPlus', label: 'Epic+' },
];

export interface DomainBand {
  key: string; // domain id | 'multi' | 'tokens'
  label: string;
  dot?: string;
  /** false only for 'multi' — single-domain bands hide per-row domain chips */
  singleDomain: boolean;
  cards: FilteredCard[];
  byRarity: Record<RarityBucket, FilteredCard[]>;
}

export interface SetSection {
  setId: string;
  setLabel: string;
  count: number;
  bands: DomainBand[];
}

// Sets are numbered in contiguous domain runs in this order; keeping it static
// (rather than deriving from min collector number) keeps band order stable
// when filters remove the early runs.
const BAND_ORDER = [
  'fury',
  'calm',
  'mind',
  'body',
  'chaos',
  'order',
  'multi',
  'colorless',
  'tokens',
];

export function rarityBucketOf(rarityId: string | null): RarityBucket {
  if (rarityId === 'common' || rarityId === 'uncommon' || rarityId === 'rare') return rarityId;
  return 'epicPlus';
}

function bandKeyOf(card: FilteredCard, index: CardsIndex): string {
  if (isTokenCard(card)) return 'tokens';
  const ids = Array.from(
    new Set((index.domainsByCardId[card.id] ?? []).map((d) => d.domain_id)),
  );
  if (ids.length === 0) return 'colorless';
  if (ids.length > 1) return 'multi';
  return ids[0];
}

function bandMeta(key: string): { label: string; dot?: string; singleDomain: boolean } {
  if (key === 'multi') return { label: 'Multi-Domain', singleDomain: false };
  if (key === 'tokens') return { label: 'Tokens', singleDomain: true };
  if (key === 'colorless') return { label: 'Colorless', singleDomain: true };
  const color = DOMAIN_COLORS[key];
  return { label: color?.label ?? key, dot: color?.dot, singleDomain: true };
}

function compareBandKeys(a: string, b: string): number {
  const ia = BAND_ORDER.indexOf(a);
  const ib = BAND_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

export function buildSetSections(cards: FilteredCard[], index: CardsIndex): SetSection[] {
  const bySet = new Map<string, FilteredCard[]>();
  for (const card of cards) {
    const list = bySet.get(card.set_id);
    if (list) list.push(card);
    else bySet.set(card.set_id, [card]);
  }

  const setIds = Array.from(bySet.keys()).sort(compareSetIds);
  const sections: SetSection[] = [];

  for (const setId of setIds) {
    const setCards = bySet.get(setId)!;
    const byBand = new Map<string, FilteredCard[]>();
    for (const card of setCards) {
      const key = bandKeyOf(card, index);
      const list = byBand.get(key);
      if (list) list.push(card);
      else byBand.set(key, [card]);
    }

    const bands: DomainBand[] = Array.from(byBand.keys())
      .sort(compareBandKeys)
      .map((key) => {
        const bandCards = [...byBand.get(key)!].sort(compareCards);
        const byRarity: Record<RarityBucket, FilteredCard[]> = {
          common: [],
          uncommon: [],
          rare: [],
          epicPlus: [],
        };
        for (const card of bandCards) byRarity[rarityBucketOf(card.rarity_id)].push(card);
        return { key, ...bandMeta(key), cards: bandCards, byRarity };
      });

    sections.push({
      setId,
      setLabel: setCards[0].set_name ?? setId,
      count: setCards.length,
      bands,
    });
  }

  return sections;
}
