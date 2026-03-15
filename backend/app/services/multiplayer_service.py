import json
import redis
import os
import random
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
from app.services.game_service import GameService
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
        digits = config.get("level", 4)
        if digits < 3: digits = 4
        
        room_data = {
            "room_id": room_id,
            "players": {},
            "config": config,
            "status": "waiting",
            "created_at": datetime.utcnow().isoformat(),
            "feedback_map": GameService.generate_feedback_map(digits)
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
            "progress": {"bulls": 0, "cows": 0, "attempts": 0, "guesses": []}
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
            
            # Check if all players (2) are ready
            if len(room["players"]) == 2 and all(p["is_ready"] for p in room["players"].values()):
                return self.start_game(room_id)
                
            self.save_room(room_id, room)
            return room
        return None

    def start_game(self, room_id: str) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if room:
            # Generate a target number (unique digits)
            digits = room["config"].get("level", 4)
            if digits < 3: digits = 4 # Default to 4 if not set or too small
            
            target = "".join(random.sample("0123456789", digits))
            room["target"] = target
            room["status"] = "playing"
            room["started_at"] = datetime.utcnow().isoformat()
            
            # Reset player progress
            for sid in room["players"]:
                room["players"][sid]["progress"] = {"bulls": 0, "cows": 0, "attempts": 0, "guesses": []}
                
            self.save_room(room_id, room)
            return room
        return None

    def submit_guess(self, room_id: str, sid: str, guess: str) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
        
        target = room.get("target")
        feedback_map = room.get("feedback_map")
        if not target or not feedback_map or sid not in room["players"]:
            return None
            
        # Calculate bulls, cows and gray using the Static Scramble Protocol
        bulls, cows, gray = GameService.evaluate_guess(target, guess)
        shuffled_feedback = GameService.evaluate_positional(target, guess, feedback_map)
                
        # Update player progress
        room["players"][sid]["progress"]["bulls"] = bulls
        room["players"][sid]["progress"]["cows"] = cows
        room["players"][sid]["progress"]["attempts"] += 1
        room["players"][sid]["progress"]["last_feedback"] = shuffled_feedback
        room["players"][sid]["progress"]["guesses"].append({
            "guess": guess,
            "feedback": shuffled_feedback
        })
        
        # Check Win Condition
        if bulls == len(target):
            room["status"] = "finished"
            room["winner_sid"] = sid
            room["finished_at"] = datetime.utcnow().isoformat()
            
        self.save_room(room_id, room)
        return room

    def get_hint(self, room_id: str, sid: str, revealed_indices: list) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "playing" or sid not in room["players"]:
            return None
        
        target = room.get("target")
        if not target:
            return None
            
        code_len = len(target)
        available_indices = list(set(range(code_len)) - set(revealed_indices))
        
        if not available_indices:
            return {"error": "No more hints available"}
            
        target_idx = random.choice(available_indices)
        return {
            "position": target_idx,
            "digit": target[target_idx]
        }

multiplayer_service = MultiplayerService()
