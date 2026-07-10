import {
  compareCards,
  compareSetIds,
  evaluateGoal,
  type CardsIndex,
  type CollectionGoal,
} from '@/lib/queries';
import type { Card } from '@/lib/types';

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

export interface MissingCardRow {
  name: string;
  setAbbr: string;
  number: string;
  target: number;
  needed: number;
  foilNeeded: number | '';
}

function compareRarity(a: Card, b: Card): number {
  const orderA = a.rarity_id != null ? (RARITY_ORDER[a.rarity_id] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  const orderB = b.rarity_id != null ? (RARITY_ORDER[b.rarity_id] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  return orderA - orderB;
}

function sortMissingCards(a: Card, b: Card): number {
  const setCmp = compareSetIds(a.set_id, b.set_id);
  if (setCmp !== 0) return setCmp;
  const rarityCmp = compareRarity(a, b);
  if (rarityCmp !== 0) return rarityCmp;
  return compareCards(a, b);
}

function rowForCard(
  card: Card,
  ownedByCardId: Record<string, number>,
  foilOwnedByCardId: Record<string, number>,
  goal: CollectionGoal,
): MissingCardRow | null {
  const owned = ownedByCardId[card.id] ?? 0;
  const foilOwned = foilOwnedByCardId[card.id] ?? 0;
  const evaluation = evaluateGoal(goal, owned, foilOwned, card);

  if (evaluation.complete) return null;

  const needed = Math.max(evaluation.target - owned, 0);
  const foilNeeded: number | '' =
    evaluation.foilTarget > 0 ? Math.max(evaluation.foilTarget - foilOwned, 0) : '';

  const hasFoilNeed = typeof foilNeeded === 'number' && foilNeeded > 0;
  if (needed <= 0 && !hasFoilNeed) return null;

  return {
    name: card.name,
    setAbbr: card.set_id,
    number: card.collector_number ?? card.public_code ?? '',
    target: evaluation.target,
    needed,
    foilNeeded,
  };
}

export function buildMissingRows(
  cards: Card[],
  _index: CardsIndex,
  ownedByCardId: Record<string, number>,
  foilOwnedByCardId: Record<string, number>,
  goal: CollectionGoal,
): MissingCardRow[] {
  return [...cards]
    .sort(sortMissingCards)
    .map((card) => rowForCard(card, ownedByCardId, foilOwnedByCardId, goal))
    .filter((row): row is MissingCardRow => row !== null);
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (!/[,"\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatCardLabel(row: MissingCardRow): string {
  return `${row.name} (${row.setAbbr} ${row.number})`;
}

export function rowsToCsv(rows: MissingCardRow[]): string {
  const header = 'Card,Needed,Foil Needed';
  const data = rows
    .map((row) => {
      const noFoil = row.foilNeeded === '';
      return [
        escapeCsv(formatCardLabel(row)),
        row.needed,
        noFoil ? '' : row.foilNeeded,
      ].join(',');
    })
    .join('\n');
  return data ? `${header}\n${data}` : header;
}

export function missingCsvFilename(goal: CollectionGoal): string {
  return `missing-${goal}.csv`;
}
