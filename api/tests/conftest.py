"""Test configuration: a throwaway data dir, a test token, the synthetic seed.

Environment variables must be set before `app` is imported, because
app.config reads them at import time.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

_DATA_DIR = tempfile.mkdtemp(prefix="tenure-api-test-")
os.environ["DATA_DIR"] = _DATA_DIR
os.environ["TENURE_API_TOKEN"] = "test-token"
os.environ["SEED_SAMPLE"] = "true"
os.environ.pop("SEED_FILE", None)
os.environ.pop("VISION_API_KEY", None)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
