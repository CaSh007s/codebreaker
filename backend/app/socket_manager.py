import socketio
import os
from dotenv import load_dotenv

load_dotenv()

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

from app.services.multiplayer_service import multiplayer_service

# Create a Socket.IO AsyncServer
mgr = socketio.AsyncRedisManager(REDIS_URL)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    client_manager=mgr
)

# Combine Socket.IO server with the FastAPI app
app_sio = socketio.ASGIApp(sio)

# Track which room a SID is in for easier cleanup
sid_to_room = {}

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    room_id = sid_to_room.get(sid)
    if room_id:
        room = multiplayer_service.leave_room(room_id, sid)
        if room:
            await sio.emit('room_update', room, room=room_id)
        del sid_to_room[sid]
    print(f"Client disconnected: {sid}")

@sio.event
async def init_room(sid, data):
    room_id = data.get('room_id')
    config = data.get('config')
    if room_id and config:
        # Check if room already exists — don't overwrite!
        existing = multiplayer_service.get_room(room_id)
        if existing:
            # Room exists: just join the SID to the socket room and send current state
            if len(existing["players"]) >= 2 and sid not in existing.get("players", {}):
                await sio.emit('error', {'message': 'Room is full'}, to=sid)
                return
            await sio.enter_room(sid, room_id)
            sid_to_room[sid] = room_id
            await sio.emit('room_update', existing, to=sid)
        else:
            # Create a brand new room
            room = multiplayer_service.create_room(room_id, config)
            await sio.enter_room(sid, room_id)
            sid_to_room[sid] = room_id
            await sio.emit('room_update', room, room=room_id)

@sio.event
async def join_room(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room = multiplayer_service.get_room(room_id)
        if not room:
            await sio.emit('error', {'message': 'Room not found'}, to=sid)
            return

        if len(room["players"]) >= 2:
            await sio.emit('error', {'message': 'Room is full'}, to=sid)
            return

        await sio.enter_room(sid, room_id)
        sid_to_room[sid] = room_id
        # We don't add to players list yet, wait for setup_player
        await sio.emit('room_update', room, to=sid)

@sio.event
async def setup_player(sid, data):
    room_id = data.get('room_id')
    player_info = data.get('player_info')
    if room_id and player_info:
        room = multiplayer_service.join_room(room_id, sid, player_info)
        if room and "error" in room:
            await sio.emit('error', room, to=sid)
        elif room:
            await sio.emit('room_update', room, room=room_id)

@sio.event
async def toggle_ready(sid, data):
    room_id = data.get('room_id')
    is_ready = data.get('is_ready', False)
    if room_id:
        room = multiplayer_service.update_player_ready(room_id, sid, is_ready)
        if room:
            await sio.emit('room_update', room, room=room_id)
            if room["status"] == "playing":
                await sio.emit('game_start', room, room=room_id)

@sio.event
async def submit_guess(sid, data):
    room_id = data.get('room_id')
    guess = data.get('guess')
    if room_id and guess:
        room = multiplayer_service.submit_guess(room_id, sid, guess)
        if room:
            await sio.emit('room_update', room, room=room_id)
            if room["status"] == "finished":
                await sio.emit('game_over', room, room=room_id)

@sio.event
async def chat_message(sid, data):
    room = data.get('room')
    message = data.get('message')
    if room and message:
        await sio.emit('message', data, room=room, skip_sid=sid)
@sio.event
async def get_hint(sid, data):
    room_id = data.get('room_id')
    revealed_indices = data.get('revealed_indices', [])
    if room_id:
        hint = multiplayer_service.get_hint(room_id, sid, revealed_indices)
        if hint:
            await sio.emit('hint_received', hint, to=sid)
