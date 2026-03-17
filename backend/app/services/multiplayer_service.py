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
        
        # Room Lifecycle: The room expires in 15 mins if abandoned (no 'connected' players)
        # We only refresh/set TTL if at least one player is physically connected.
        has_connected_player = any(p.get("connected", True) for p in room_data.get("players", {}).values())
        
        serialized = json.dumps(room_data)
        if has_connected_player:
            self.redis_client.setex(key, ROOM_EXPIRY, serialized)
        else:
            # If no one is connected, we still save it but don't refresh the 15min timer
            # unless it's already expiring or doesn't exist.
            # Actually, the user requirement is: "even if there's one player left in the room, it won't be cleared"
            # This implies "left in the room" means "exists in the players dict".
            # "Clear the room in case there are no players after every 15 mins"
            # So if room["players"] is empty, it should expire.
            if len(room_data.get("players", {})) > 0:
                self.redis_client.setex(key, ROOM_EXPIRY, serialized)
            else:
                self.redis_client.set(key, serialized, ex=ROOM_EXPIRY)

    def create_room(self, room_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        digits = config.get("level", 4)
        if digits < 3: digits = 4
        
        room_data = {
            "room_id": room_id,
            "players": {},
            "config": config,
            "status": "waiting",
            "replay_requests": [], # Track player_ids that want a rematch
            "created_at": datetime.utcnow().isoformat(),
            "feedback_map": GameService.generate_feedback_map(digits)
        }
        self.save_room(room_id, room_data)
        return room_data

    def join_room(self, room_id: str, sid: str, player_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Handles session recovery and SID updates for existing players.
        Does NOT add new players to the room.
        """
        room = self.get_room(room_id)
        if not room:
            return None
        
        player_id = player_info.get("player_id")
        if not player_id:
            return {"error": "Missing player_id"}

        # If player already exists (session recovery), update their SID
        if player_id in room["players"]:
            room["players"][player_id]["sid"] = sid
            room["players"][player_id]["connected"] = True
            self.save_room(room_id, room)
            return room

        # If not an existing player, we just return the room for view synchronization
        # (The frontend will see the player is NOT in room['players'] and stay in setup)
        return room

    def register_player(self, room_id: str, sid: str, player_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Explicitly adds a new player to the room during setup.
        """
        room = self.get_room(room_id)
        if not room:
            return None

        player_id = player_info.get("player_id")
        if not player_id:
            return {"error": "Missing player_id"}

        # Recovery if they already exist
        if player_id in room["players"]:
            room["players"][player_id]["sid"] = sid
            room["players"][player_id]["connected"] = True
            room["players"][player_id]["username"] = player_info.get("username", room["players"][player_id]["username"])
            room["players"][player_id]["avatar"] = player_info.get("avatar", room["players"][player_id]["avatar"])
            self.save_room(room_id, room)
            return room

        if len(room["players"]) >= 2:
            return {"error": "Room is full"}

        room["players"][player_id] = {
            "player_id": player_id,
            "sid": sid,
            "username": player_info.get("username", "Anonymous"),
            "avatar": player_info.get("avatar", ""),
            "is_ready": False,
            "connected": True,
            "progress": {"bulls": 0, "cows": 0, "attempts": 0, "guesses": [], "hints_used": 0, "last_points_earned": 0},
            "points": 0
        }
        self.save_room(room_id, room)
        return room

    def leave_room(self, room_id: str, sid: str):
        room = self.get_room(room_id)
        if room:
            # Find the player by SID
            player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
            if player_id:
                # Mark as disconnected but keep in dict for recovery
                room["players"][player_id]["connected"] = False
                self.save_room(room_id, room)
            return room
        return None

    def update_player_ready(self, room_id: str, sid: str, is_ready: bool) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if room:
            player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
            if player_id:
                room["players"][player_id]["is_ready"] = is_ready
                
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
            room["feedback_map"] = GameService.generate_feedback_map(digits)
            room["status"] = "playing"
            room["replay_requests"] = [] # Reset for next time
            room["started_at"] = datetime.utcnow().isoformat()
            
            # Reset player progress but keep hints_used and points tracking
            for pid in room["players"]:
                # Initialize hints_used if missing
                room["players"][pid]["progress"] = {
                    "bulls": 0, 
                    "cows": 0, 
                    "attempts": 0, 
                    "guesses": [], 
                    "hints_used": 0, # Reset hints for new game
                    "last_points_earned": 0
                }
                # room["players"][sid]["is_ready"] = False # Optional: reset ready status?
                
            self.save_room(room_id, room)
            return room
        return None

    def submit_guess(self, room_id: str, sid: str, guess: str) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
        
        # Find player by SID
        player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        if not player_id:
            return None
            
        # Calculate bulls, cows and gray using the Static Scramble Protocol
        target = room["target"]
        feedback_map = room.get("feedback_map")
        
        # Fallback for rooms created before the map was mandatory
        if not feedback_map:
            feedback_map = GameService.generate_feedback_map(len(target))
            room["feedback_map"] = feedback_map

        bulls, cows, gray = GameService.evaluate_guess(target, guess)
        shuffled_feedback = GameService.evaluate_positional(target, guess, feedback_map)
                
        # Update player progress
        room["players"][player_id]["progress"]["bulls"] = bulls
        room["players"][player_id]["progress"]["cows"] = cows
        room["players"][player_id]["progress"]["attempts"] += 1
        room["players"][player_id]["progress"]["last_feedback"] = shuffled_feedback
        room["players"][player_id]["progress"]["guesses"].append({
            "guess": guess,
            "feedback": shuffled_feedback
        })
        
        # Check Win Condition
        if bulls == len(target):
            room["status"] = "finished"
            room["winner_pid"] = player_id
            room["finished_at"] = datetime.utcnow().isoformat()
            
            # Calculate points for the winner
            # Use the ROOKIE base since multiplayer level is generic for now, 
            # or map room config to level labels.
            base = 1000 # Default to 1000
            max_attempts = 20
            attempts = room["players"][player_id]["progress"]["attempts"]
            efficiency_ratio = max(0.1, 1 - (attempts - 1) / max_attempts)
            
            hints_used = room["players"][player_id]["progress"].get("hints_used", 0)
            hint_penalty = hints_used * 150
            
            # Multiplayer points calculation
            raw_points = (base * efficiency_ratio - hint_penalty)
            earned = max(50, round(raw_points))
            
            # Add to accumulated points
            room["players"][player_id]["points"] += earned
            room["players"][player_id]["progress"]["last_points_earned"] = earned
            
        self.save_room(room_id, room)
        return room

    def get_hint(self, room_id: str, sid: str, revealed_indices: list) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
            
        player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        if not player_id:
            return None
        
        target = room.get("target")
        if not target:
            return None
            
        code_len = len(target)
        max_hints = code_len // 2
        hints_used = room["players"][player_id]["progress"].get("hints_used", 0)
        
        if hints_used >= max_hints:
            return {"error": f"MAXIMUM_HINTS_REACHED: ONLY {max_hints} HINTS ALLOWED"}
            
        available_indices = list(set(range(code_len)) - set(revealed_indices))
        
        if not available_indices:
            return {"error": "No more hints available"}
            
        target_idx = random.choice(available_indices)
        
        # Increment hints used
        room["players"][player_id]["progress"]["hints_used"] = hints_used + 1
        self.save_room(room_id, room)
        
        return {
            "position": target_idx,
            "digit": target[target_idx]
        }
    def request_replay(self, room_id: str, sid: str) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "finished":
            return None

        player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        if not player_id:
            return None

        if player_id not in room["replay_requests"]:
            room["replay_requests"].append(player_id)
            self.save_room(room_id, room)

        # If all players (2) requested replay, start new game
        if len(room["replay_requests"]) >= len(room["players"]):
            return self.start_game(room_id)

        return room

    def surrender(self, room_id: str, sid: str) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
            
        room["status"] = "finished"
        room["resigned_sid"] = sid
        # Find player_id of the person who resigned
        resigned_pid = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        room["resigned_pid"] = resigned_pid
        # The other player is the winner
        winner = [p for p in room["players"].values() if p["sid"] != sid]
        if winner:
            winner_player = winner[0]
            winner_pid = winner_player["player_id"]
            room["winner_sid"] = winner_player["sid"] # Maintain winner_sid for frontend compatibility
            room["winner_pid"] = winner_pid
            # Award points for winner
            earned = 500
            room["players"][winner_pid]["points"] += earned
            room["players"][winner_pid]["progress"]["last_points_earned"] = earned
            
        room["finished_at"] = datetime.utcnow().isoformat()
        room["end_reason"] = "resignation"
        
        self.save_room(room_id, room)
        return room

multiplayer_service = MultiplayerService()
