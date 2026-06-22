# Riftbound Card Scraper

Python scraper that pulls all Riftbound cards from Riot's public publishing-content JSON API, normalizes them, and writes a clean JSON file plus a SQLite database ready for a collection tracker app.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

Scrape all cards into the default `data/` directory:

```bash
python scraper.py --out-dir data
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--out-dir` | `data` | Output directory for JSON, DB, and images |
| `--db` | `<out-dir>/riftbound.db` | SQLite database path |
| `--download-images` | off | Download card images to `<out-dir>/images/` |
| `--limit` | `200` | API page size |
| `--locale` | `en_US` | API locale |

Download images (optional, slower):

```bash
python scraper.py --out-dir data --download-images
```

Re-running the scraper is safe — it upserts by card `id` without creating duplicates.

## Output files

| File | Description |
|------|-------------|
| `data/cards_raw.json` | Untouched API response (audit/refresh safety net) |
| `data/cards.json` | Flattened, normalized card array |
| `data/riftbound.db` | SQLite database (see schema below) |
| `data/images/<id>.{png,webp}` | Card images (only with `--download-images`) |

## Normalized JSON schema

Each entry in `cards.json` is a flat object:

```json
{
  "id": "ogn-066a-298",
  "collector_number": 66,
  "name": "Card Name",
  "set_id": "OGN",
  "set_name": "Origins - Main",
  "public_code": "OGN-066a/298",
  "card_types": ["Unit"],
  "super_types": ["Champion"],
  "rarity_id": "rare",
  "rarity_label": "Rare",
  "domains": [{"id": "body", "label": "Body"}],
  "tags": ["Tag1"],
  "energy": 3,
  "might": 4,
  "power": null,
  "might_bonus": null,
  "orientation": "portrait",
  "illustrator": "Artist Name",
  "ability_html": "<p>Ability text with <strong>HTML</strong></p>",
  "ability_text": "Ability text with HTML",
  "image_url": "https://...",
  "image_alt": "Alt text",
  "image_width": 744,
  "image_height": 1039,
  "local_image_path": null
}
```

List fields (`card_types`, `super_types`, `domains`, `tags`) are arrays. Nullable scalar fields are `null` when absent from the API.

## SQLite schema

### `cards`

One row per card printing. Primary key: `id`.

Key columns: `collector_number`, `name`, `set_id`, `set_name`, `public_code`, `card_type`, `super_type`, `rarity_id`, `rarity_label`, `energy`, `might`, `power`, `might_bonus`, `orientation`, `illustrator`, `ability_html`, `ability_text`, `image_url`, `image_alt`, `image_width`, `image_height`, `local_image_path`.

### `card_domains`

Join table for multi-valued domains: `(card_id, domain_id, domain_label)`.

### `card_tags`

Join table for tags: `(card_id, tag)`.

### `sets`

Set metadata from the gallery sets API: `id`, `label`, `max_collector_number`.

### `collection`

Empty table seeded for your tracker app:

| Column | Type | Default |
|--------|------|---------|
| `card_id` | TEXT PK/FK → cards | — |
| `quantity_owned` | INTEGER | 0 |
| `for_sale_count` | INTEGER | 0 |
| `notes` | TEXT | null |

### `playset_complete` (view)

Derived from `collection`:

```sql
SELECT card_id, quantity_owned, for_sale_count, notes,
       CASE WHEN quantity_owned >= 3 THEN 1 ELSE 0 END AS playset_complete
FROM collection;
```

Use `playset_complete = 1` to find cards where you own a full playset (3+ copies).

## Example queries

Cards in Origins with Rare rarity:

```sql
SELECT id, name, public_code FROM cards
WHERE set_id = 'OGN' AND rarity_id = 'rare'
ORDER BY collector_number;
```

Cards missing from your collection:

```sql
SELECT c.id, c.name, c.set_id, c.public_code
FROM cards c
LEFT JOIN collection col ON col.card_id = c.id
WHERE col.card_id IS NULL OR col.quantity_owned = 0;
```

Playset progress:

```sql
SELECT c.name, c.public_code, p.quantity_owned, p.playset_complete
FROM playset_complete p
JOIN cards c ON c.id = p.card_id
WHERE p.quantity_owned > 0
ORDER BY c.set_id, c.collector_number;
```

## Refreshing data

Re-run the scraper whenever Riot publishes new sets or card updates:

```bash
python scraper.py --out-dir data
```

The scraper upserts all cards by `id`, refreshes join tables, and leaves your `collection` rows untouched.

## Data source

Cards are fetched from Riot's public, unauthenticated publishing-content API:

```
https://content.publishing.riotgames.com/publishing-content/v2.0/public/channel/riftbound_website/list/riftbound_gallery_cards?locale=en_US&from={offset}&limit=200
```

Sets (~952 cards across UNL, OGN, SFD, OGS) are returned in a single paginated dataset — no per-set scraping needed.
