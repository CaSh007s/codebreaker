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
            "progress": {"bulls": 0, "cows": 0, "attempts": 0, "guesses": [], "hints_used": 0, "last_points_earned": 0},
            "points": 0
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
            
            target = "".join(random.choices("0123456789", k=digits))
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
            
            # Calculate points for the winner
            # Use the ROOKIE base since multiplayer level is generic for now, 
            # or map room config to level labels.
            base = 1000 # Default to 1000
            max_attempts = 20
            attempts = room["players"][sid]["progress"]["attempts"]
            efficiency_ratio = max(0.1, 1 - (attempts - 1) / max_attempts)
            
            hints_used = room["players"][sid]["progress"].get("hints_used", 0)
            hint_penalty = hints_used * 150
            
            # Multiplayer points calculation
            raw_points = (base * efficiency_ratio - hint_penalty)
            earned = max(50, round(raw_points))
            
            # Add to accumulated points
            room["players"][sid]["points"] += earned
            room["players"][sid]["progress"]["last_points_earned"] = earned
            
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
        max_hints = code_len // 2
        hints_used = room["players"][sid]["progress"].get("hints_used", 0)
        
        if hints_used >= max_hints:
            return {"error": f"MAXIMUM_HINTS_REACHED: ONLY {max_hints} HINTS ALLOWED"}
            
        available_indices = list(set(range(code_len)) - set(revealed_indices))
        
        if not available_indices:
            return {"error": "No more hints available"}
            
        target_idx = random.choice(available_indices)
        
        # Increment hints used
        room["players"][sid]["progress"]["hints_used"] = hints_used + 1
        self.save_room(room_id, room)
        
        return {
            "position": target_idx,
            "digit": target[target_idx]
        }

    def surrender(self, room_id: str, sid: str) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
            
        room["status"] = "finished"
        room["resigned_sid"] = sid
        # The other player is the winner
        winner = [s for s in room["players"] if s != sid]
        if winner:
            winner_sid = winner[0]
            room["winner_sid"] = winner_sid
            # Award points for winner
            earned = 500
            room["players"][winner_sid]["points"] += earned
            room["players"][winner_sid]["progress"]["last_points_earned"] = earned
            
        room["finished_at"] = datetime.utcnow().isoformat()
        room["end_reason"] = "resignation"
        
        self.save_room(room_id, room)
        return room

multiplayer_service = MultiplayerService()
