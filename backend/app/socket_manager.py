import socketio
import os
from dotenv import load_dotenv

load_dotenv()

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Create a Socket.IO AsyncServer
# Using Redis as the message queue for scalability (and following user request)
mgr = socketio.AsyncRedisManager(REDIS_URL)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*', # Adjust for production
    client_manager=mgr
)

# Combine Socket.IO server with the FastAPI app (later in main.py)
app_sio = socketio.ASGIApp(sio)

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    room = data.get('room')
    if room:
        await sio.enter_room(sid, room)
        print(f"Client {sid} joined room: {room}")
        await sio.emit('status', {'message': f"Joined room {room}"}, room=room)

@sio.event
async def leave_room(sid, data):
    room = data.get('room')
    if room:
        await sio.leave_room(sid, room)
        print(f"Client {sid} left room: {room}")

@sio.event
async def chat_message(sid, data):
    room = data.get('room')
    message = data.get('message')
    if room and message:
        # Broadcast to everyone in the room except sender (handled by sio.emit naturally or with exclude_sid)
        await sio.emit('message', data, room=room, skip_sid=sid)
