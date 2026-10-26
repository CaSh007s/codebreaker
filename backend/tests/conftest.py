"""Tests use a dedicated local Redis; dotenv loading is explicitly disabled."""
import os
import sys
from pathlib import Path

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:16379/0")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
