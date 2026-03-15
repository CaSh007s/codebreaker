import json
import redis
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
ROOM_EXPIRY = 15 * 60  # 15 minutes in seconds

class MultiplayerService:
    def __init__(self):
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)

    def _get_room_key(self, room_id: str) -> str:
        return f"room:{room_id}"

    def get_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        data = self.redis_client.get(self._get_room_key(room_id))
        return json.loads(data) if data else None

    def save_room(self, room_id: str, room_data: Dict[str, Any]):
        key = self._get_room_key(room_id)
        self.redis_client.setex(key, ROOM_EXPIRY, json.dumps(room_data))

    def create_room(self, room_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        room_data = {
            "room_id": room_id,
            "players": {},
            "config": config,
            "status": "waiting",
            "created_at": datetime.utcnow().isoformat()
        }
        self.save_room(room_id, room_data)
        return room_data

    def join_room(self, room_id: str, sid: str, player_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room:
            return None
        
        # Limit to 2 players
        if len(room["players"]) >= 2 and sid not in room["players"]:
            return {"error": "Room is full"}

        room["players"][sid] = {
            "sid": sid,
            "username": player_info.get("username", "Anonymous"),
            "avatar": player_info.get("avatar", ""),
            "is_ready": False,
            "progress": {"bulls": 0, "cows": 0, "attempts": 0}
        }
        self.save_room(room_id, room)
        return room

    def leave_room(self, room_id: str, sid: str):
        room = self.get_room(room_id)
        if room and sid in room["players"]:
            del room["players"][sid]
            if not room["players"]:
                # If last player leaves, we could delete or let it expire
                self.redis_client.delete(self._get_room_key(room_id))
            else:
                self.save_room(room_id, room)
            return room
        return None

    def update_player_ready(self, room_id: str, sid: str, is_ready: bool) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if room and sid in room["players"]:
            room["players"][sid]["is_ready"] = is_ready
            self.save_room(room_id, room)
            return room
        return None

multiplayer_service = MultiplayerService()
