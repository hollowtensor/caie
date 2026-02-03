from __future__ import annotations

from flask import Flask

from routes.auth import bp as auth_bp
from routes.compare import bp as compare_bp
from routes.extract import bp as extract_bp
from routes.pages import bp as pages_bp
from routes.uploads import bp as uploads_bp
from routes.workspaces import bp as workspaces_bp


def register_routes(app: Flask):
    app.register_blueprint(auth_bp)
    app.register_blueprint(workspaces_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(extract_bp)
    app.register_blueprint(compare_bp)
