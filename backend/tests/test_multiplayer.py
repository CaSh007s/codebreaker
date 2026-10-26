import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.services.multiplayer_service import MultiplayerService, ROOM_EXPIRY
from app import socket_manager


@pytest_asyncio.fixture
async def match():
    service = MultiplayerService()
    room_id = f"test-{uuid.uuid4()}"
    await service.create_room(room_id, {"mode": "standard", "level": 4})
    yield service, room_id
    await service.redis_client.delete(service._get_room_key(room_id), f"room_lock:{room_id}")
    await service.redis_client.aclose()


async def register_pair(service, room_id):
    await asyncio.gather(*[
        service.register_player(room_id, f"sid-{i}", {"player_id": f"player-{i}", "username": f"Player{i}", "token": f"test-session-token-{i}"})
        for i in range(2)
    ])


async def start_pair(service, room_id):
    await register_pair(service, room_id)
    await asyncio.gather(*[service.update_player_ready(room_id, f"sid-{i}", True) for i in range(2)])
    return await service.get_room(room_id)


@pytest.mark.asyncio
async def test_simultaneous_registration_and_readiness(match):
    service, room_id = match
    room = await start_pair(service, room_id)
    assert set(room["players"]) == {"player-0", "player-1"}
    assert all(p["is_ready"] for p in room["players"].values())
    assert room["status"] == "playing"
    result = await service.register_player(room_id, "third", {"player_id": "third", "username": "Third", "token": "test-session-token-3"})
    assert result["error"] == "Room is full"
    original_target = room["target"]
    assert await service.update_player_ready(room_id, "sid-0", True) is None
    assert (await service.get_room(room_id))["target"] == original_target


@pytest.mark.asyncio
async def test_concurrent_capacity_and_duplicate_room_creation(match):
    service, room_id = match
    results = await asyncio.gather(*[
        service.register_player(room_id, f"sid-{i}", {
            "player_id": f"player-{i}", "username": f"Player{i}", "token": f"test-session-token-{i}",
        }) for i in range(3)
    ])
    assert sum("error" in result for result in results) == 1
    room = await service.create_room(room_id, {"mode": "overdrive", "level": 6})
    assert len(room["players"]) == 2
    assert room["config"]["level"] == 4


@pytest.mark.asyncio
async def test_malformed_socket_envelope_returns_error():
    with patch.object(socket_manager.sio, "emit", new_callable=AsyncMock) as emit:
        await socket_manager.init_room("sid", None)
        assert emit.call_args.args[0] == "error"
        await socket_manager.join_room("sid", {"room_id": "room", "player_info": {"player_id": []}})
        assert emit.call_args.args[0] == "error"


@pytest.mark.asyncio
async def test_simultaneous_guesses_preserve_both_players(match):
    service, room_id = match
    room = await start_pair(service, room_id)
    guess = "9999" if room["target"] != "9999" else "0000"
    await asyncio.gather(*[service.submit_guess(room_id, f"sid-{i}", guess) for i in range(2)])
    room = await service.get_room(room_id)
    assert [p["progress"]["attempts"] for p in room["players"].values()] == [1, 1]


@pytest.mark.asyncio
async def test_disconnect_refresh_and_heartbeat(match):
    service, room_id = match
    await start_pair(service, room_id)
    hint = await service.get_hint(room_id, "sid-0", [])
    await service.leave_room(room_id, "sid-0")
    assert "error" in await service.join_room(room_id, "intruder", {"player_id": "player-0", "token": "wrong-token"})
    room = await service.join_room(room_id, "new-sid", {"player_id": "player-0", "token": "test-session-token-0"})
    assert room["players"]["player-0"]["connected"]
    assert room["players"]["player-0"]["progress"]["hints"] == [hint]
    await service.leave_room(room_id, "sid-0")
    assert (await service.get_room(room_id))["players"]["player-0"]["connected"]
    await service.redis_client.expire(service._get_room_key(room_id), 5)
    await service.keep_alive(room_id, "new-sid")
    assert await service.redis_client.ttl(service._get_room_key(room_id)) > ROOM_EXPIRY - 5


@pytest.mark.asyncio
async def test_rematch_clears_resignation_and_preserves_score(match):
    service, room_id = match
    await start_pair(service, room_id)
    assert await service.surrender(room_id, "outsider") is None
    room = await service.surrender(room_id, "sid-0")
    assert room["winner_pid"] == "player-1"
    await asyncio.gather(*[service.request_replay(room_id, f"sid-{i}") for i in range(2)])
    room = await service.get_room(room_id)
    assert room["status"] == "playing"
    assert "resigned_pid" not in room and "end_reason" not in room and "winner_pid" not in room
    assert room["players"]["player-1"]["points"] == 500
    room = await service.submit_guess(room_id, "sid-0", room["target"])
    assert room["winner_pid"] == "player-0"
    assert room["end_reason"] == "solved"


@pytest.mark.asyncio
async def test_invalid_guesses_and_hints_do_not_corrupt_room(match):
    service, room_id = match
    await start_pair(service, room_id)
    for guess in ("1", "abcd", 1234):
        assert "error" in await service.submit_guess(room_id, "sid-0", guess)
    hints = await asyncio.gather(*[service.get_hint(room_id, "sid-0", []) for _ in range(3)])
    valid = [h for h in hints if "error" not in h]
    assert len(valid) == 2
    assert len({h["position"] for h in valid}) == 2
    room = await service.get_room(room_id)
    assert room["players"]["player-0"]["progress"]["attempts"] == 0
    with patch.object(socket_manager.sio, "emit", new_callable=AsyncMock) as emit:
        await socket_manager.publish_room("room_update", room)
        public = emit.call_args.args[1]
        assert "target" not in public and "feedback_map" not in public
        assert "hints" not in public["players"]["player-0"]["progress"]
        assert "sid" not in public["players"]["player-0"]
        assert "token" not in public["players"]["player-0"]
    assert "target" in room
