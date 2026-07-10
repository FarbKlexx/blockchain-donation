from flask import Flask, jsonify, abort, request
from flask_cors import CORS

from database import init_db
from models import (
    get_projects,
    get_project,
    create_project,
    create_news,
    update_project,
    get_news,
    get_news_item,
    get_news_by_project,
)

app = Flask(__name__)
# CORS ist aktiv, damit das Frontend Vue auf Port 3000 zugreifen kann
CORS(app)


# Alle Projekte für das Dashboard abrufen (liefert Burger Restaurant & Kino)
@app.route("/api/projects", methods=["GET"])
def projects():
    return jsonify(get_projects())


# Projektdetails abrufen
@app.route("/api/projects/<string:project_id>", methods=["GET"])
def project_detail(project_id: str):
    project = get_project(project_id)
    if project is None:
        abort(404, description="Project not found")
    return jsonify(project)


# Neues Projekt hinzufügen (Metadaten-Schnittstelle)
@app.route("/api/projects", methods=["POST"])
def add_project():
    data = request.get_json()
    if not data or not data.get("title"):
        abort(400, description="Missing title")

    title = data.get("title")
    address = data.get("address")
    summary = data.get("summary")
    description = data.get("description")  # expect array
    image = data.get("image")
    category = data.get("category")
    verified = bool(data.get("verified", False))
    milestones = data.get("milestones")
    news = data.get("news")
    project_id = data.get("id")

    new_id = create_project(
        title=title,
        address=address,
        summary=summary,
        description=description,
        image=image,
        category=category,
        verified=verified,
        milestones=milestones,
        news=news,
        project_id=project_id,
    )
    return jsonify({"status": "success", "project_id": new_id}), 201


# Projektdaten aktualisieren (Metadaten-Schnittstelle)
@app.route("/api/projects/<string:project_id>", methods=["PUT"])
def update_project_route(project_id: str):
    data = request.get_json()
    if not data:
        abort(400, description="Missing JSON body")

    updated = update_project(
        project_id=project_id,
        title=data.get("title"),
        summary=data.get("summary"),
        description=data.get("description"),
        image=data.get("image"),
        category=data.get("category"),
        milestones=data.get("milestones"),
        news=data.get("news"),
    )
    if updated is None:
        abort(404, description="Project not found")
    return jsonify(updated)


# Alle globalen News abrufen
@app.route("/api/news", methods=["GET"])
def news():
    return jsonify(get_news())


# Neue News für ein Projekt hinzufügen
@app.route("/api/projects/<string:project_id>/news", methods=["POST"])
def add_project_news(project_id: str):
    data = request.get_json(silent=True) or {}
    if not data:
        abort(400, description="Missing JSON body")

    title = data.get("title")
    body = data.get("body")
    if not title and not body:
        abort(400, description="Missing title or body")

    news_item = create_news(
        project_id=project_id,
        date=data.get("date"),
        title=title,
        body=body,
        images=data.get("images") or [],
    )
    if news_item is None:
        abort(404, description="Project not found")
    return jsonify({"status": "success", "news": news_item}), 201


# Spezifische News für ein Projekt abrufen
@app.route("/api/projects/<string:project_id>/news", methods=["GET"])
def project_news(project_id: str):
    return jsonify(get_news_by_project(project_id))


# Einzelnen News-Eintrag über die ID abrufen
@app.route("/api/news/<int:news_id>", methods=["GET"])
def news_detail(news_id: int):
    item = get_news_item(news_id)
    if item is None:
        abort(404, description="News item not found")
    return jsonify(item)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=True)