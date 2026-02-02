from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from . import config
from .db import init_db
from .routes import register_routes


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    init_db()
    register_routes(app)
    return app


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
