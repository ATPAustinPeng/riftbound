#!/usr/bin/env python3
"""Scrape Riftbound card data from Riot's public publishing-content API."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

API_BASE = (
    "https://content.publishing.riotgames.com/publishing-content/v2.0/public"
    "/channel/riftbound_website/list/riftbound_gallery_cards"
)
SETS_API = (
    "https://content.publishing.riotgames.com/publishing-content/v2.0/public"
    "/channel/riftbound_website/list/riftbound_gallery_sets"
)
USER_AGENT = "RiftboundCardScraper/1.0 (personal collection tracker)"
DEFAULT_LOCALE = "en_US"
DEFAULT_LIMIT = 200
PAGE_DELAY_SEC = 0.3
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 2.0

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape Riftbound cards from Riot's public API into JSON and SQLite."
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data"),
        help="Output directory for JSON, DB, and images (default: data)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="SQLite database path (default: <out-dir>/riftbound.db)",
    )
    parser.add_argument(
        "--download-images",
        action="store_true",
        help="Download card images to <out-dir>/images/",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Page size for API pagination (default: {DEFAULT_LIMIT})",
    )
    parser.add_argument(
        "--locale",
        default=DEFAULT_LOCALE,
        help=f"API locale (default: {DEFAULT_LOCALE})",
    )
    return parser.parse_args()


def _get_json(session: requests.Session, url: str, params: dict[str, Any]) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(url, params=params, timeout=60)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
    raise RuntimeError(f"Failed to fetch {url} after {MAX_RETRIES} attempts") from last_error


def fetch_all_cards(session: requests.Session, locale: str, limit: int) -> list[dict[str, Any]]:
    offset = 0
    all_cards: list[dict[str, Any]] = []
    total_items: int | None = None

    while True:
        payload = _get_json(
            session,
            API_BASE,
            {"locale": locale, "from": offset, "limit": limit},
        )
        page = payload.get("data") or []
        all_cards.extend(page)

        if total_items is None:
            total_items = (payload.get("metadata") or {}).get("totalItems")
            if total_items is None:
                total_items = len(all_cards)

        print(f"Fetched {len(all_cards)}/{total_items} cards (offset={offset})")

        if not page:
            break

        offset += limit
        time.sleep(PAGE_DELAY_SEC)

    if total_items and len(all_cards) < total_items:
        print(
            f"Note: API reported {total_items} total items but returned {len(all_cards)} cards.",
            file=sys.stderr,
        )

    return all_cards


def fetch_sets(session: requests.Session, locale: str) -> list[dict[str, Any]]:
    payload = _get_json(session, SETS_API, {"locale": locale})
    return payload.get("data") or []


def strip_html(html: str | None) -> str | None:
    if not html:
        return None
    text = _HTML_TAG_RE.sub("", html)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def _labels(items: list[dict[str, Any]] | None) -> list[str]:
    if not items:
        return []
    return [item["label"] for item in items if item.get("label")]


def _stat_value(field: Any) -> int | None:
    if field is None:
        return None
    if isinstance(field, (int, float)):
        return int(field)
    if isinstance(field, dict):
        value = field.get("value") or {}
        if isinstance(value, dict):
            raw = value.get("id")
            if raw is not None:
                return int(raw)
            label = value.get("label")
            if label is not None:
                digits = re.sub(r"[^\d-]", "", str(label))
                if digits not in ("", "-"):
                    return int(digits)
    return None


def _extract_tags(field: Any) -> list[str]:
    if not field:
        return []
    if isinstance(field, list):
        return [str(tag) for tag in field if tag]
    if isinstance(field, dict):
        return [str(tag) for tag in (field.get("tags") or []) if tag]
    return [str(field)]


def normalize_card(card: dict[str, Any]) -> dict[str, Any]:
    card_type = card.get("cardType") or {}
    set_info = (card.get("set") or {}).get("value") or {}
    rarity = (card.get("rarity") or {}).get("value") or {}
    domain_values = (card.get("domain") or {}).get("values") or []
    illustrator_values = (card.get("illustrator") or {}).get("values") or []
    card_image = card.get("cardImage") or {}
    dimensions = card_image.get("dimensions") or {}
    ability_html = ((card.get("text") or {}).get("richText") or {}).get("body")

    card_types = _labels(card_type.get("type"))
    super_types = _labels(card_type.get("superType"))
    domains = [
        {"id": d.get("id"), "label": d.get("label")}
        for d in domain_values
        if d.get("id") or d.get("label")
    ]
    tags = _extract_tags(card.get("tags"))

    return {
        "id": card["id"],
        "collector_number": card.get("collectorNumber"),
        "name": card.get("name"),
        "set_id": set_info.get("id"),
        "set_name": set_info.get("label"),
        "public_code": card.get("publicCode"),
        "card_types": card_types,
        "super_types": super_types,
        "rarity_id": rarity.get("id"),
        "rarity_label": rarity.get("label"),
        "domains": domains,
        "tags": tags,
        "energy": _stat_value(card.get("energy")),
        "might": _stat_value(card.get("might")),
        "power": _stat_value(card.get("power")),
        "might_bonus": _stat_value(card.get("mightBonus")),
        "orientation": card.get("orientation"),
        "illustrator": ", ".join(_labels(illustrator_values)) or None,
        "ability_html": ability_html,
        "ability_text": strip_html(ability_html),
        "image_url": card_image.get("url"),
        "image_alt": card_image.get("accessibilityText"),
        "image_width": dimensions.get("width"),
        "image_height": dimensions.get("height"),
        "local_image_path": None,
    }


def normalize_set(raw: dict[str, Any]) -> dict[str, Any]:
    set_value = (raw.get("set") or {}).get("value")
    if set_value:
        return {
            "id": set_value.get("id"),
            "label": set_value.get("label"),
            "max_collector_number": raw.get("maxCollectorNumber"),
        }
    return {
        "id": raw.get("id"),
        "label": raw.get("name"),
        "max_collector_number": raw.get("collectorNumberMax"),
    }


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"Wrote {path}")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sets (
            id TEXT PRIMARY KEY,
            label TEXT,
            max_collector_number INTEGER
        );

        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            collector_number INTEGER,
            name TEXT,
            set_id TEXT,
            set_name TEXT,
            public_code TEXT,
            card_type TEXT,
            super_type TEXT,
            rarity_id TEXT,
            rarity_label TEXT,
            energy INTEGER,
            might INTEGER,
            power INTEGER,
            might_bonus INTEGER,
            orientation TEXT,
            illustrator TEXT,
            ability_html TEXT,
            ability_text TEXT,
            image_url TEXT,
            image_alt TEXT,
            image_width INTEGER,
            image_height INTEGER,
            local_image_path TEXT,
            FOREIGN KEY (set_id) REFERENCES sets(id)
        );

        CREATE TABLE IF NOT EXISTS card_domains (
            card_id TEXT NOT NULL,
            domain_id TEXT,
            domain_label TEXT,
            PRIMARY KEY (card_id, domain_id),
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS card_tags (
            card_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (card_id, tag),
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS collection (
            card_id TEXT PRIMARY KEY,
            quantity_owned INTEGER NOT NULL DEFAULT 0,
            for_sale_count INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE VIEW IF NOT EXISTS playset_complete AS
        SELECT
            card_id,
            quantity_owned,
            for_sale_count,
            notes,
            CASE WHEN quantity_owned >= 3 THEN 1 ELSE 0 END AS playset_complete
        FROM collection;
        """
    )


def upsert_sets(conn: sqlite3.Connection, sets: list[dict[str, Any]]) -> None:
    conn.executemany(
        """
        INSERT INTO sets (id, label, max_collector_number)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            max_collector_number = excluded.max_collector_number
        """,
        [(s["id"], s["label"], s["max_collector_number"]) for s in sets if s.get("id")],
    )


def upsert_cards(conn: sqlite3.Connection, cards: list[dict[str, Any]]) -> None:
    card_rows = []
    domain_rows = []
    tag_rows = []

    for card in cards:
        card_rows.append(
            (
                card["id"],
                card["collector_number"],
                card["name"],
                card["set_id"],
                card["set_name"],
                card["public_code"],
                ", ".join(card["card_types"]) or None,
                ", ".join(card["super_types"]) or None,
                card["rarity_id"],
                card["rarity_label"],
                card["energy"],
                card["might"],
                card["power"],
                card["might_bonus"],
                card["orientation"],
                card["illustrator"],
                card["ability_html"],
                card["ability_text"],
                card["image_url"],
                card["image_alt"],
                card["image_width"],
                card["image_height"],
                card["local_image_path"],
            )
        )
        for domain in card["domains"]:
            domain_rows.append((card["id"], domain.get("id"), domain.get("label")))
        for tag in card["tags"]:
            if tag:
                tag_rows.append((card["id"], tag))

    conn.executemany(
        """
        INSERT INTO cards (
            id, collector_number, name, set_id, set_name, public_code,
            card_type, super_type, rarity_id, rarity_label,
            energy, might, power, might_bonus, orientation, illustrator,
            ability_html, ability_text, image_url, image_alt,
            image_width, image_height, local_image_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            collector_number = excluded.collector_number,
            name = excluded.name,
            set_id = excluded.set_id,
            set_name = excluded.set_name,
            public_code = excluded.public_code,
            card_type = excluded.card_type,
            super_type = excluded.super_type,
            rarity_id = excluded.rarity_id,
            rarity_label = excluded.rarity_label,
            energy = excluded.energy,
            might = excluded.might,
            power = excluded.power,
            might_bonus = excluded.might_bonus,
            orientation = excluded.orientation,
            illustrator = excluded.illustrator,
            ability_html = excluded.ability_html,
            ability_text = excluded.ability_text,
            image_url = excluded.image_url,
            image_alt = excluded.image_alt,
            image_width = excluded.image_width,
            image_height = excluded.image_height,
            local_image_path = excluded.local_image_path
        """,
        card_rows,
    )

    card_ids = [card["id"] for card in cards]
    placeholders = ",".join("?" * len(card_ids))
    conn.execute(f"DELETE FROM card_domains WHERE card_id IN ({placeholders})", card_ids)
    conn.execute(f"DELETE FROM card_tags WHERE card_id IN ({placeholders})", card_ids)

    conn.executemany(
        """
        INSERT OR IGNORE INTO card_domains (card_id, domain_id, domain_label)
        VALUES (?, ?, ?)
        """,
        domain_rows,
    )
    conn.executemany(
        """
        INSERT OR IGNORE INTO card_tags (card_id, tag)
        VALUES (?, ?)
        """,
        tag_rows,
    )


def build_database(db_path: Path, cards: list[dict[str, Any]], sets: list[dict[str, Any]]) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        init_db(conn)
        upsert_sets(conn, sets)
        upsert_cards(conn, cards)
        conn.commit()
    print(f"Wrote {db_path} ({len(cards)} cards, {len(sets)} sets)")


def _image_extension(url: str) -> str:
    path = urlparse(url).path
    suffix = Path(path).suffix.lower()
    if suffix in {".png", ".webp", ".jpg", ".jpeg"}:
        return suffix
    return ".png"


def download_images(
    session: requests.Session,
    cards: list[dict[str, Any]],
    images_dir: Path,
) -> None:
    images_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    skipped = 0

    for card in cards:
        url = card.get("image_url")
        if not url:
            continue

        ext = _image_extension(url)
        dest = images_dir / f"{card['id']}{ext}"
        rel_path = str(Path("images") / dest.name)

        if dest.exists():
            card["local_image_path"] = rel_path
            skipped += 1
            continue

        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = session.get(url, stream=True, timeout=60)
                response.raise_for_status()
                with dest.open("wb") as fh:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            fh.write(chunk)
                card["local_image_path"] = rel_path
                downloaded += 1
                break
            except requests.RequestException as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_BACKOFF_SEC * attempt)
        else:
            print(f"Warning: failed to download {url}: {last_error}", file=sys.stderr)

        time.sleep(0.1)

    print(f"Images: {downloaded} downloaded, {skipped} skipped (already present)")


def main() -> int:
    args = parse_args()
    out_dir = args.out_dir
    db_path = args.db or (out_dir / "riftbound.db")

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    print("Fetching cards from Riot API...")
    raw_cards = fetch_all_cards(session, args.locale, args.limit)

    raw_path = out_dir / "cards_raw.json"
    save_json(raw_path, raw_cards)

    print("Normalizing cards...")
    normalized = [normalize_card(card) for card in raw_cards]

    if args.download_images:
        print("Downloading images...")
        download_images(session, normalized, out_dir / "images")
        save_json(out_dir / "cards.json", normalized)
    else:
        cards_path = out_dir / "cards.json"
        save_json(cards_path, normalized)

    print("Fetching set metadata...")
    raw_sets = fetch_sets(session, args.locale)
    normalized_sets = [normalize_set(s) for s in raw_sets]

    print("Building SQLite database...")
    build_database(db_path, normalized, normalized_sets)

    print(f"Done. {len(normalized)} cards scraped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
