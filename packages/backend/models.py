from typing import Any, Dict, List, Optional
import json
import re
from database import get_connection


def _load_description(text: Optional[str]) -> List[str]:
    if not text:
        return []
    try:
        return json.loads(text)
    except Exception:
        return [text]


def _load_images(text: Optional[str]) -> List[str]:
    if not text:
        return []
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _row_to_news(row: Any) -> Dict[str, Any]:
    return {
        "date": row["date"],
        "title": row["title"],
        "body": row["body"],
        "images": _load_images(row["images"] if "images" in row.keys() else None),
    }


def _row_to_project(row: Any, milestones: List[Dict[str, str]], news: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "address": row["address"],
        "id": row["id"],
        "title": row["title"],
        "summary": row["summary"],
        "description": _load_description(row["description"]),
        "image": row["image"],
        "category": row["category"],
        "verified": bool(row["verified"]),
        "milestones": milestones,
        "news": news,
    }


def get_projects() -> List[Dict[str, Any]]:
    projects: List[Dict[str, Any]] = []
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT id, address, title, summary, description, image, category, verified FROM projects ORDER BY title"
        )
        for row in cursor.fetchall():
            pid = row["id"]
            cursor.execute("SELECT idx, title, description FROM milestones WHERE project_id = ? ORDER BY id", (pid,))
            milestones = [
                {"index": m["idx"], "title": m["title"], "description": m["description"]}
                for m in cursor.fetchall()
            ]
            cursor.execute("SELECT date, title, body, images FROM news WHERE project_id = ? ORDER BY date", (pid,))
            news = [_row_to_news(n) for n in cursor.fetchall()]
            projects.append(_row_to_project(row, milestones, news))
    return projects


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT id, address, title, summary, description, image, category, verified FROM projects WHERE id = ?",
            (project_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        cursor.execute("SELECT idx, title, description FROM milestones WHERE project_id = ? ORDER BY id", (project_id,))
        milestones = [
            {"index": m["idx"], "title": m["title"], "description": m["description"]}
            for m in cursor.fetchall()
        ]
        cursor.execute("SELECT date, title, body, images FROM news WHERE project_id = ? ORDER BY date", (project_id,))
        news = [_row_to_news(n) for n in cursor.fetchall()]
        return _row_to_project(row, milestones, news)


def _slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text.strip())
    return text


def create_project(
    title: str,
    address: Optional[str] = None,
    summary: Optional[str] = None,
    description: Optional[List[str]] = None,
    image: Optional[str] = None,
    category: Optional[str] = None,
    verified: bool = False,
    milestones: Optional[List[Dict[str, str]]] = None,
    news: Optional[List[Dict[str, Any]]] = None,
    project_id: Optional[str] = None,
) -> str:
    pid = project_id or _slugify(title)
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO projects (id, address, title, summary, description, image, category, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, address, title, summary, json.dumps(description or []), image, category, 1 if verified else 0),
        )
        cursor.execute("DELETE FROM milestones WHERE project_id = ?", (pid,))
        cursor.execute("DELETE FROM news WHERE project_id = ?", (pid,))
        if milestones:
            for i, m in enumerate(milestones, start=1):
                cursor.execute(
                    "INSERT INTO milestones (project_id, idx, title, description) VALUES (?, ?, ?, ?)",
                    (pid, m.get("index") or str(i).zfill(2), m.get("title"), m.get("description")),
                )
        if news:
            for n in news:
                cursor.execute(
                    "INSERT INTO news (project_id, date, title, body, images) VALUES (?, ?, ?, ?, ?)",
                    (pid, n.get("date"), n.get("title"), n.get("body"), json.dumps(n.get("images", []))),
                )
        connection.commit()
    return pid


def update_project(
    project_id: str,
    title: Optional[str] = None,
    summary: Optional[str] = None,
    description: Optional[List[str]] = None,
    image: Optional[str] = None,
    category: Optional[str] = None,
    milestones: Optional[List[Dict[str, str]]] = None,
    news: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
        if cursor.fetchone() is None:
            return None

        cursor.execute(
            "UPDATE projects SET title = ?, summary = ?, description = ?, image = ?, category = ? WHERE id = ?",
            (title, summary, json.dumps(description or []), image, category, project_id),
        )
        cursor.execute("DELETE FROM milestones WHERE project_id = ?", (project_id,))
        cursor.execute("DELETE FROM news WHERE project_id = ?", (project_id,))
        if milestones:
            for i, m in enumerate(milestones, start=1):
                cursor.execute(
                    "INSERT INTO milestones (project_id, idx, title, description) VALUES (?, ?, ?, ?)",
                    (project_id, m.get("index") or str(i).zfill(2), m.get("title"), m.get("description")),
                )
        if news:
            for n in news:
                cursor.execute(
                    "INSERT INTO news (project_id, date, title, body, images) VALUES (?, ?, ?, ?, ?)",
                    (project_id, n.get("date"), n.get("title"), n.get("body"), json.dumps(n.get("images", []))),
                )
        connection.commit()
    return get_project(project_id)


def get_news() -> List[Dict[str, Any]]:
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT id, project_id, date, title, body, images FROM news ORDER BY date DESC")
        return [
            {
                "id": r["id"],
                "project_id": r["project_id"],
                "date": r["date"],
                "title": r["title"],
                "body": r["body"],
                "images": _load_images(r["images"]),
            }
            for r in cursor.fetchall()
        ]


def get_news_by_project(project_id: str) -> List[Dict[str, Any]]:
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT date, title, body, images FROM news WHERE project_id = ? ORDER BY date", (project_id,))
        return [_row_to_news(r) for r in cursor.fetchall()]


def get_news_item(news_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT id, project_id, date, title, body, images FROM news WHERE id = ?", (news_id,))
        row = cursor.fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "date": row["date"],
            "title": row["title"],
            "body": row["body"],
            "images": _load_images(row["images"]),
        }
