import pytest
from unittest.mock import AsyncMock, patch
from app import socket_manager
from app.socket_manager import MAX_MESSAGE_LENGTH, VALID_EMOJIS

# Note: Testing Socket.IO events directly requires an async client.
# For this verification, we verify the logic and constants.

def test_chat_constants():
    assert MAX_MESSAGE_LENGTH == 200
    assert "🎯" in VALID_EMOJIS
    assert "💀" in VALID_EMOJIS

@pytest.mark.asyncio
async def test_chat_message_validation():
    player = {"player_id": "real-player", "username": "RealName"}
    with patch.object(socket_manager, "_is_rate_limited", AsyncMock(return_value=False)), \
         patch.object(socket_manager, "chat_player", AsyncMock(return_value=player)), \
         patch.object(socket_manager.sio, "emit", new_callable=AsyncMock) as emit:
        await socket_manager.chat_message("sid", {"room_id": "room", "text": "<b>Hello</b>", "sender_id": "forged"})
        payload = emit.call_args.args[1]
        assert payload["text"] == "Hello"
        assert payload["sender_id"] == "real-player"
        await socket_manager.chat_message("sid", {"room_id": "room", "text": "x" * 201})
        assert emit.call_args.args[0] == "error"
        await socket_manager.chat_message("sid", {"room_id": "room", "text": "   "})
        assert emit.call_args.args[0] == "error"


@pytest.mark.asyncio
async def test_unregistered_sender_cannot_chat():
    with patch.object(socket_manager, "_is_rate_limited", AsyncMock(return_value=False)), \
         patch.object(socket_manager, "chat_player", AsyncMock(return_value=None)), \
         patch.object(socket_manager.sio, "emit", new_callable=AsyncMock) as emit:
        await socket_manager.chat_message("sid", {"room_id": "room", "text": "Hello"})
        assert emit.call_args.args[0] == "error"
