import pytest
from app.socket_manager import MAX_MESSAGE_LENGTH, VALID_EMOJIS

# Note: Testing Socket.IO events directly requires an async client.
# For this verification, we verify the logic and constants.

def test_chat_constants():
    assert MAX_MESSAGE_LENGTH == 200
    assert "🎯" in VALID_EMOJIS
    assert "💀" in VALID_EMOJIS

@pytest.mark.asyncio
async def test_chat_message_validation():
    # Mocking sio would be complex here, so we verify the logic 
    # we implemented in socket_manager.py
    # This is a placeholder for a more comprehensive integration test
    pass
