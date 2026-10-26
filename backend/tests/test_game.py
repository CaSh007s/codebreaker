from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import json
import os
import uuid
import redis

import pytest
from fastapi.testclient import TestClient

from app.main import app, limiter
from app.services.game_service import GameService


@pytest.fixture
def client():
    limiter.enabled = False
    with TestClient(app) as client:
        yield client
    limiter.enabled = True


def stored_game(game_id):
    with redis.from_url(os.environ["REDIS_URL"], decode_responses=True) as connection:
        return json.loads(connection.get(f"game:{game_id}"))


def new_game(client, **config):
    with patch.object(GameService, "generate_secret_code", return_value="1123"):
        response = client.post("/game/new", json={"code_length": 4, **config})
    assert response.status_code == 200
    return response.json()["game_id"]


def test_duplicate_digit_feedback():
    assert GameService.evaluate_guess("1123", "2111") == (1, 2, 1)
    assert GameService.evaluate_positional("1123", "2111", [2, 0, 3, 1]) == ["cow", "cow", "gray", "bull"]


def test_health_probe(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("config", [{"code_length": 0}, {"code_length": 11}, {"max_attempts": 0}, {"time_limit": -1}])
def test_invalid_game_configuration(client, config):
    assert client.post("/game/new", json=config).status_code == 422


def test_solve_and_finished_game_cannot_be_overwritten(client):
    game_id = new_game(client)
    response = client.post(f"/game/{game_id}/guess", json={"guess": "1123"}).json()
    assert response["status"] == "solved"
    assert response["secret_code"] == "1123"
    assert client.post(f"/game/{game_id}/surrender").status_code == 400
    assert client.post(f"/game/{game_id}/guess", json={"guess": "1123"}).status_code == 400


def test_attempt_limit_and_invalid_guess(client):
    game_id = new_game(client, max_attempts=1)
    assert client.post(f"/game/{game_id}/guess", json={"guess": "abcd"}).status_code == 422
    assert stored_game(game_id)["attempts"] == 0
    response = client.post(f"/game/{game_id}/guess", json={"guess": "9999"}).json()
    assert response["status"] == "failed"
    assert response["attempts_remaining"] == 0


def test_timer_expiry_reveals_code_and_blocks_late_win(client):
    game_id = new_game(client, time_limit=120)
    assert client.post(f"/game/{game_id}/expire").status_code == 400
    game = stored_game(game_id)
    game["created_at"] = (datetime.now(timezone.utc) - timedelta(seconds=121)).isoformat()
    with redis.from_url(os.environ["REDIS_URL"]) as connection:
        connection.set(f"game:{game_id}", json.dumps(game), ex=60)
    response = client.post(f"/game/{game_id}/guess", json={"guess": "1123"}).json()
    assert response["status"] == "failed"
    assert not response["solved"]
    assert stored_game(game_id)["attempts"] == 0
    assert client.post(f"/game/{game_id}/expire").json()["secret_code"] == "1123"


def test_hints_are_server_tracked(client):
    game_id = new_game(client)
    url = f"/game/{game_id}/hint"
    assert client.post(url, json={"revealed_indices": [], "target_index": 0}).status_code == 200
    assert client.post(url, json={"revealed_indices": [], "target_index": 0}).status_code == 400
    assert client.post(url, json={"revealed_indices": []}).status_code == 200
    assert client.post(url, json={"revealed_indices": []}).status_code == 400


def test_session_survives_application_restart():
    limiter.enabled = False
    try:
        with TestClient(app) as first:
            game_id = new_game(first)
        with TestClient(app) as restarted:
            response = restarted.post(f"/game/{game_id}/guess", json={"guess": "1123"})
            assert response.json()["status"] == "solved"
    finally:
        limiter.enabled = True


def test_leaderboard_survives_restart_and_preserves_modifiers():
    limiter.enabled = False
    username = f"test-{uuid.uuid4()}"
    try:
        with TestClient(app) as first:
            response = first.post("/leaderboard", json={
                "username": username, "level": "MASTER", "tries": 1,
                "time_seconds": 10, "score": 15000, "timer_mode": True, "infinite_mode": True,
            })
            assert response.status_code == 200
        with TestClient(app) as restarted:
            entry = next(e for e in restarted.get("/leaderboard").json() if e["username"] == username)
            assert entry["timer_mode"] and entry["infinite_mode"]
    finally:
        limiter.enabled = True
        with redis.from_url(os.environ["REDIS_URL"], decode_responses=True) as connection:
            for entry in connection.zrange("codebreaker:leaderboard", 0, -1):
                if json.loads(entry)["username"] == username:
                    connection.zrem("codebreaker:leaderboard", entry)
