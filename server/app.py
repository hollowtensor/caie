from __future__ import annotations

import argparse
import os
import warnings
from datetime import timedelta

# Suppress multiprocessing resource tracker warnings on shutdown
warnings.filterwarnings("ignore", message="resource_tracker:.*semaphore")

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import config
from extensions import db, migrate, jwt


def create_app() -> Flask:
    app = Flask(__name__)

    # Database
    app.config["SQLALCHEMY_DATABASE_URI"] = config.DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # JWT
    app.config["JWT_SECRET_KEY"] = config.JWT_SECRET_KEY
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        seconds=config.JWT_ACCESS_TOKEN_EXPIRES
    )
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(
        seconds=config.JWT_REFRESH_TOKEN_EXPIRES
    )

    # Init extensions
    db.init_app(app)
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
    migrate.init_app(app, db, directory=migrations_dir)
    jwt.init_app(app)

    # Configure JWT token blacklisting with Redis
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        from routes.auth import get_redis
        jti = jwt_payload["jti"]
        token_in_redis = get_redis().get(f"blocklist:{jti}")
        return token_in_redis is not None

    CORS(app)

    # Import models so Alembic sees them
    import models  # noqa: F401

    from routes import register_routes
    register_routes(app)

    with app.app_context():
        _auto_extract_pending()

    return app


def _auto_extract_pending():
    """Auto-extract uploads that are parsed but have no extraction yet."""
    from sqlalchemy.exc import ProgrammingError, OperationalError
    from models import Upload
    from routes.extract import run_auto_extract

    try:
        rows = Upload.query.filter(
            Upload.state == "done",
            Upload.extract_state.is_(None),
        ).all()
    except (ProgrammingError, OperationalError):
        # Tables don't exist yet (need to run migrations)
        print("Warning: Database tables not found. Run 'flask db upgrade' to create them.")
        return

    if not rows:
        return

    print(f"Auto-extracting {len(rows)} previously parsed upload(s)...")
    for u in rows:
        run_auto_extract(u.id)


def main():
    p = argparse.ArgumentParser(description="CAIE API Server")
    p.add_argument("--server-url",
                    default=os.environ.get("LIGHTONOCR_SERVER_URL", "http://localhost:8000/v1"))
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=5001)
    p.add_argument("--debug", action="store_true")
    args = p.parse_args()

    config.SERVER_URL = args.server_url.rstrip("/")
    print(f"Parse Server: {config.SERVER_URL}  |  Data: {config.DATA_DIR}")

    app = create_app()
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
