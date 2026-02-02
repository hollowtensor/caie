from __future__ import annotations

from flask import Flask

from .pages import bp as pages_bp
from .uploads import bp as uploads_bp


def register_routes(app: Flask):
    app.register_blueprint(uploads_bp)
    app.register_blueprint(pages_bp)
