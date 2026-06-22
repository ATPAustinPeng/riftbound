/**
 * Seed Supabase reference tables from data/cards.json.
 *
 * Required environment variables:
 *   SUPABASE_URL              — Project URL (e.g. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS; never expose client-side)
 *
 * Usage:
 *   cd supabase/seed && npm install && npm run seed
 *
 * Re-runnable: upserts by primary key. Safe to run after re-scraping cards.json.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BATCH_SIZE = 100;

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_JSON_PATH = join(__dirname, "../../data/cards.json");

interface CardDomain {
  id: string;
  label: string;
}

interface CardJson {
  id: string;
  collector_number: number | null;
  name: string;
  set_id: string;
  set_name: string;
  public_code: string;
  card_types: string[];
  super_types: string[];
  rarity_id: string;
  rarity_label: string;
  domains: CardDomain[];
  tags: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  might_bonus: number | null;
  orientation: string | null;
  illustrator: string | null;
  ability_html: string | null;
  ability_text: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_width: number | null;
  image_height: number | null;
}

interface SetRow {
  id: string;
  label: string;
  max_collector_number: number | null;
}

interface CardRow {
  id: string;
  collector_number: number | null;
  name: string;
  set_id: string;
  set_name: string;
  public_code: string;
  card_type: string | null;
  super_type: string | null;
  rarity_id: string;
  rarity_label: string;
  energy: number | null;
  might: number | null;
  power: number | null;
  might_bonus: number | null;
  orientation: string | null;
  illustrator: string | null;
  ability_html: string | null;
  ability_text: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_width: number | null;
  image_height: number | null;
}

interface CardDomainRow {
  card_id: string;
  domain_id: string;
  domain_label: string;
}

interface CardTagRow {
  card_id: string;
  tag: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function joinTypes(values: string[]): string | null {
  if (values.length === 0) return null;
  return values.join(", ");
}

function maxFromPublicCode(publicCode: string): number | null {
  const slash = publicCode.lastIndexOf("/");
  if (slash === -1) return null;
  const parsed = Number.parseInt(publicCode.slice(slash + 1), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function deriveSets(cards: CardJson[]): SetRow[] {
  const bySet = new Map<string, SetRow>();

  for (const card of cards) {
    const fromCode = maxFromPublicCode(card.public_code);
    const existing = bySet.get(card.set_id);

    if (!existing) {
      bySet.set(card.set_id, {
        id: card.set_id,
        label: card.set_name,
        max_collector_number: fromCode ?? card.collector_number,
      });
      continue;
    }

    const candidates = [
      existing.max_collector_number,
      fromCode,
      card.collector_number,
    ].filter((n): n is number => n != null);

    existing.max_collector_number =
      candidates.length > 0 ? Math.max(...candidates) : null;
  }

  return [...bySet.values()];
}

function toCardRow(card: CardJson): CardRow {
  return {
    id: card.id,
    collector_number: card.collector_number,
    name: card.name,
    set_id: card.set_id,
    set_name: card.set_name,
    public_code: card.public_code,
    card_type: joinTypes(card.card_types),
    super_type: joinTypes(card.super_types),
    rarity_id: card.rarity_id,
    rarity_label: card.rarity_label,
    energy: card.energy,
    might: card.might,
    power: card.power,
    might_bonus: card.might_bonus,
    orientation: card.orientation,
    illustrator: card.illustrator,
    ability_html: card.ability_html,
    ability_text: card.ability_text,
    image_url: card.image_url,
    image_alt: card.image_alt,
    image_width: card.image_width,
    image_height: card.image_height,
  };
}

function toDomainRows(card: CardJson): CardDomainRow[] {
  return card.domains.map((domain) => ({
    card_id: card.id,
    domain_id: domain.id,
    domain_label: domain.label,
  }));
}

function toTagRows(card: CardJson): CardTagRow[] {
  return card.tags.map((tag) => ({
    card_id: card.id,
    tag,
  }));
}

async function upsertBatches<T>(
  label: string,
  rows: T[],
  upsert: (batch: T[]) => Promise<void>
): Promise<void> {
  if (rows.length === 0) {
    console.log(`${label}: nothing to upsert`);
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await upsert(batch);
    console.log(`${label}: ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const raw = readFileSync(CARDS_JSON_PATH, "utf8");
  const cards = JSON.parse(raw) as CardJson[];

  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`No cards found in ${CARDS_JSON_PATH}`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sets = deriveSets(cards);
  const cardRows = cards.map(toCardRow);
  const domainRows = cards.flatMap(toDomainRows);
  const tagRows = cards.flatMap(toTagRows);

  console.log(
    `Loaded ${cards.length} cards, ${sets.length} sets, ${domainRows.length} domains, ${tagRows.length} tags`
  );

  await upsertBatches("sets", sets, async (batch) => {
    const { error } = await supabase.from("sets").upsert(batch, { onConflict: "id" });
    if (error) throw error;
  });

  await upsertBatches("cards", cardRows, async (batch) => {
    const { error } = await supabase.from("cards").upsert(batch, { onConflict: "id" });
    if (error) throw error;
  });

  await upsertBatches("card_domains", domainRows, async (batch) => {
    const { error } = await supabase
      .from("card_domains")
      .upsert(batch, { onConflict: "card_id,domain_id" });
    if (error) throw error;
  });

  await upsertBatches("card_tags", tagRows, async (batch) => {
    const { error } = await supabase
      .from("card_tags")
      .upsert(batch, { onConflict: "card_id,tag" });
    if (error) throw error;
  });

  console.log("Seed complete.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
