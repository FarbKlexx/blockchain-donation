import sqlite3
import json
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent / "data.db"

# Projects: id is a text slug (matches frontend `id`), store summary and description (JSON)
CREATE_PROJECTS_TABLE = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    address TEXT UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    description TEXT,
    image TEXT,
    category TEXT,
    verified INTEGER NOT NULL DEFAULT 0
)
"""

CREATE_MILESTONES_TABLE = """
CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    idx TEXT,
    title TEXT,
    description TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
)
"""

CREATE_NEWS_TABLE = """
CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    date TEXT,
    title TEXT,
    body TEXT,
    images TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
)
"""

# Optional: seed DB from frontend projectMetadata.json if available
FRONTEND_METADATA = Path(__file__).parent.parent / "frontend" / "src" / "data" / "projectMetadata.json"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _insert_project(cursor: sqlite3.Cursor, p: Any) -> None:
    cursor.execute(
        "INSERT OR REPLACE INTO projects (id, address, title, summary, description, image, category, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            p.get("id"),
            p.get("address"),
            p.get("title"),
            p.get("summary"),
            json.dumps(p.get("description", [])),
            p.get("image"),
            p.get("category"),
            1 if p.get("verified") else 0,
        ),
    )
    # milestones
    for m in p.get("milestones", []):
        cursor.execute(
            "INSERT INTO milestones (project_id, idx, title, description) VALUES (?, ?, ?, ?)",
            (p.get("id"), m.get("index"), m.get("title"), m.get("description")),
        )
    # news
    for n in p.get("news", []):
        cursor.execute(
            "INSERT INTO news (project_id, date, title, body, images) VALUES (?, ?, ?, ?, ?)",
            (p.get("id"), n.get("date"), n.get("title"), n.get("body"), json.dumps(n.get("images", []))),
        )


def _ensure_schema(cursor: sqlite3.Cursor) -> None:
    cursor.execute("PRAGMA table_info(projects)")
    columns = {row[1] for row in cursor.fetchall()}
    if "summary" not in columns:
        cursor.execute("ALTER TABLE projects ADD COLUMN summary TEXT")
    if "category" not in columns:
        cursor.execute("ALTER TABLE projects ADD COLUMN category TEXT")
    if "address" not in columns:
        cursor.execute("ALTER TABLE projects ADD COLUMN address TEXT")
    if "verified" not in columns:
        cursor.execute("ALTER TABLE projects ADD COLUMN verified INTEGER NOT NULL DEFAULT 0")

    cursor.execute("PRAGMA table_info(news)")
    news_columns = {row[1] for row in cursor.fetchall()}
    if "images" not in news_columns:
        cursor.execute("ALTER TABLE news ADD COLUMN images TEXT")


def _schema_needs_rebuild(cursor: sqlite3.Cursor) -> bool:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    if cursor.fetchone() is None:
        return False
    cursor.execute("PRAGMA table_info(projects)")
    columns = {row[1]: row[2] for row in cursor.fetchall()}
    return (
        columns.get("id", "").upper() != "TEXT"
        or "summary" not in columns
        or "category" not in columns
        or "address" not in columns
        or "verified" not in columns
    )


def _rebuild_schema(cursor: sqlite3.Cursor) -> None:
    cursor.execute("DROP TABLE IF EXISTS news")
    cursor.execute("DROP TABLE IF EXISTS milestones")
    cursor.execute("DROP TABLE IF EXISTS projects")
    cursor.execute(CREATE_PROJECTS_TABLE)
    cursor.execute(CREATE_MILESTONES_TABLE)
    cursor.execute(CREATE_NEWS_TABLE)


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        cursor = connection.cursor()
        # Aktiviert die Fremdschlüssel-Unterstützung in SQLite
        cursor.execute("PRAGMA foreign_keys = ON;")

        if _schema_needs_rebuild(cursor):
            _rebuild_schema(cursor)
        else:
            cursor.execute(CREATE_PROJECTS_TABLE)
            cursor.execute(CREATE_MILESTONES_TABLE)
            cursor.execute(CREATE_NEWS_TABLE)
            _ensure_schema(cursor)
        connection.commit()

        # Seed from frontend metadata only when the database is still empty.
        cursor.execute("SELECT 1 FROM projects LIMIT 1")
        if cursor.fetchone() is None and FRONTEND_METADATA.exists():
            try:
                with FRONTEND_METADATA.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    projects = data.get("projects", [])
                    for p in projects:
                        _insert_project(cursor, p)
                    connection.commit()
            except Exception:
                # Don't fail init on bad frontend file
                pass

        # If still empty, insert a small fallback example
        cursor.execute("SELECT 1 FROM projects LIMIT 1")
        if cursor.fetchone() is None:
            example = {
                "id": "burger-restaurant",
                "address": "0x7f4b2c9d1e3a5f7c8b0d2e4a6c8f1b3d5e7089a2",
                "verified": True,
                "title": "Burger Restaurant",
                "summary": "Ein neues Burger-Restaurant mit regionalen Zutaten und nachhaltiger Küche.",
                "description": [
                    "Das Burger Restaurant soll ein Ort für gutes Essen und gute Gespräche werden.",
                ],
                "image": "https://picsum.photos/seed/burger-restaurant/800/480",
                "category": "Fairer Handel & Bio",
                "milestones": [
                    { "index": "01", "title": "Standort-Suche & Mietvertrag", "description": "Findung des perfekten Standorts." }
                ],
                "news": [
                    {
                        "date": "2026-05-28",
                        "title": "Warum wir dieses Projekt starten",
                        "body": "Unser Ziel ist es...",
                        "images": [],
                    }
                ]
            }
            _insert_project(cursor, example)
            connection.commit()