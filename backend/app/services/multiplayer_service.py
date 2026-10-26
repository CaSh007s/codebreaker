import json
import redis.asyncio as redis
import os
import random
import secrets
from datetime import datetime, timezone
from functools import wraps
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
from app.services.game_service import GameService
ROOM_EXPIRY = 15 * 60  # 15 minutes in seconds

def room_transaction(method):
    """Serialize read/modify/write operations across all backend workers."""
    @wraps(method)
    async def wrapped(self, room_id, *args, **kwargs):
        async with self.redis_client.lock(f"room_lock:{room_id}", timeout=15, blocking_timeout=10):
            return await method(self, room_id, *args, **kwargs)
    return wrapped

class MultiplayerService:
    def __init__(self):
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)

    def _get_room_key(self, room_id: str) -> str:
        return f"room:{room_id}"

    async def get_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        data = await self.redis_client.get(self._get_room_key(room_id))
        return json.loads(data) if data else None

    async def save_room(self, room_id: str, room_data: Dict[str, Any]):
        key = self._get_room_key(room_id)
        room_data["revision"] = room_data.get("revision", 0) + 1
        # Connected clients renew this lease via room_heartbeat, including idle lobbies.
        await self.redis_client.set(key, json.dumps(room_data), ex=ROOM_EXPIRY)

    @room_transaction
    async def create_room(self, room_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.get_room(room_id)
        if existing:
            return existing
        digits = config.get("level", 4)
        if type(digits) is not int or not 3 <= digits <= 6:
            return {"error": "Code length must be between 3 and 6"}
        if config.get("mode") not in ("standard", "overdrive"):
            return {"error": "Invalid game mode"}
        config = {"mode": config["mode"], "level": digits,
                  "allow_repeats": config.get("allow_repeats") is True or config["mode"] == "overdrive"}
        
        room_data = {
            "room_id": room_id,
            "players": {},
            "config": config,
            "status": "waiting",
            "replay_requests": [], # Track player_ids that want a rematch
            "created_at": datetime.now(timezone.utc).isoformat(),
            "feedback_map": GameService.generate_feedback_map(digits)
        }
        await self.save_room(room_id, room_data)
        return room_data

    @room_transaction
    async def join_room(self, room_id: str, sid: str, player_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Handles session recovery and SID updates for existing players.
        Does NOT add new players to the room.
        """
        room = await self.get_room(room_id)
        if not room:
            return None
        
        player_id = player_info.get("player_id")
        if not player_id:
            return {"error": "Missing player_id"}

        # If player already exists (session recovery), update their SID
        if player_id in room["players"]:
            if not secrets.compare_digest(room["players"][player_id].get("token", ""), player_info.get("token", "")):
                return {"error": "Invalid player session"}
            room["players"][player_id]["sid"] = sid
            was_connected = room["players"][player_id].get("connected", False)
            room["players"][player_id]["connected"] = True
            room["players"][player_id]["connection_status"] = "reconnected" if not was_connected else "connected"
            await self.save_room(room_id, room)
            return room

        # If not an existing player, we just return the room for view synchronization
        # (The frontend will see the player is NOT in room['players'] and stay in setup)
        return room

    @room_transaction
    async def keep_alive(self, room_id: str, sid: str):
        room = await self.get_room(room_id)
        if room and any(p["sid"] == sid and p.get("connected") for p in room["players"].values()):
            await self.redis_client.expire(self._get_room_key(room_id), ROOM_EXPIRY)

    @room_transaction
    async def register_player(self, room_id: str, sid: str, player_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Explicitly adds a new player to the room during setup.
        """
        room = await self.get_room(room_id)
        if not room:
            return None

        player_id = player_info.get("player_id")
        if not player_id:
            return {"error": "Missing player_id"}

        token = player_info.get("token")
        if not isinstance(token, str) or not 16 <= len(token) <= 128:
            return {"error": "Invalid player session"}
        username = player_info.get("username", "")
        if not isinstance(username, str) or not 1 <= len(username.strip()) <= 15:
            return {"error": "Codename must contain 1 to 15 characters"}
        player_info = {**player_info, "username": username.strip()}

        # Recovery if they already exist
        if player_id in room["players"]:
            if not secrets.compare_digest(room["players"][player_id].get("token", ""), token):
                return {"error": "Invalid player session"}
            room["players"][player_id]["sid"] = sid
            was_connected = room["players"][player_id].get("connected", False)
            room["players"][player_id]["connected"] = True
            room["players"][player_id]["connection_status"] = "reconnected" if not was_connected else "connected"
            room["players"][player_id]["username"] = player_info.get("username", room["players"][player_id]["username"])
            room["players"][player_id]["avatar"] = player_info.get("avatar", room["players"][player_id]["avatar"])
            await self.save_room(room_id, room)
            return room

        if len(room["players"]) >= 2:
            return {"error": "Room is full"}

        room["players"][player_id] = {
            "player_id": player_id,
            "token": token,
            "sid": sid,
            "username": player_info.get("username", "Anonymous"),
            "avatar": player_info.get("avatar", ""),
            "is_ready": False,
            "connected": True,
            "connection_status": "connected",
            "progress": {"bulls": 0, "cows": 0, "attempts": 0, "guesses": [], "hints_used": 0, "last_points_earned": 0},
            "points": 0
        }
        await self.save_room(room_id, room)
        return room

    @room_transaction
    async def leave_room(self, room_id: str, sid: str):
        room = await self.get_room(room_id)
        if room:
            # Find the player by SID
            player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
            if not player_id:
                return None
            # A stale socket must never mark a newer connection as disconnected.
            room["players"][player_id]["connected"] = False
            room["players"][player_id]["connection_status"] = "disconnected"
            if room["status"] == "waiting":
                room["players"][player_id]["is_ready"] = False
            await self.save_room(room_id, room)
            return room
        return None

    @room_transaction
    async def update_player_ready(self, room_id: str, sid: str, is_ready: bool) -> Optional[Dict[str, Any]]:
        room = await self.get_room(room_id)
        if room and room["status"] == "waiting" and type(is_ready) is bool:
            player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
            if player_id:
                room["players"][player_id]["is_ready"] = is_ready
                
                # Check if all players (2) are ready
                if len(room["players"]) == 2 and all(p["is_ready"] and p.get("connected", False) for p in room["players"].values()):
                    return await self._start_game(room_id, room)
                    
                await self.save_room(room_id, room)
                return room
        return None

    async def _start_game(self, room_id: str, room: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if room:
            # Generate a target number
            config = room.get("config", {})
            digits = config.get("level", 4)
            if digits < 3: digits = 4 # Default to 4 if not set or too small
            
            # Use allow_repeats from config if standard, or always True for overdrive
            allow_repeats = config.get("allow_repeats", False)
            if config.get("mode") == "overdrive":
                allow_repeats = True
                
            target = GameService.generate_secret_code(length=digits, allow_repeats=allow_repeats)
            room["target"] = target
            room["feedback_map"] = GameService.generate_feedback_map(digits)
            room["status"] = "playing"
            room["replay_requests"] = [] # Reset for next time
            room["started_at"] = datetime.now(timezone.utc).isoformat()
            for key in ("winner_pid", "winner_sid", "resigned_pid", "resigned_sid", "end_reason", "finished_at"):
                room.pop(key, None)
            
            # Reset player progress but keep hints_used and points tracking
            for pid in room["players"]:
                room["players"][pid]["connection_status"] = "connected" if room["players"][pid].get("connected", False) else "disconnected"
                # Initialize hints_used if missing
                room["players"][pid]["progress"] = {
                    "bulls": 0, 
                    "cows": 0, 
                    "attempts": 0, 
                    "guesses": [], 
                    "hints_used": 0, # Reset hints for new game
                    "hints": [],
                    "last_points_earned": 0
                }
                # room["players"][sid]["is_ready"] = False # Optional: reset ready status?
                
            await self.save_room(room_id, room)
            return room
        return None

    @room_transaction
    async def submit_guess(self, room_id: str, sid: str, guess: str) -> Optional[Dict[str, Any]]:
        room = await self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
        
        # Find player by SID
        player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        if not player_id:
            return None
            
        # Calculate bulls, cows and gray using the Static Scramble Protocol
        target = room["target"]
        if not isinstance(guess, str) or len(guess) != len(target) or any(c not in "0123456789" for c in guess):
            return {"error": f"Guess must be {len(target)} digits long"}
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
            room["end_reason"] = "solved"
            room["finished_at"] = datetime.now(timezone.utc).isoformat()
            
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
            
        await self.save_room(room_id, room)
        return room

    @room_transaction
    async def get_hint(self, room_id: str, sid: str, revealed_indices: list) -> Optional[Dict[str, Any]]:
        room = await self.get_room(room_id)
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
            
        hints = room["players"][player_id]["progress"].setdefault("hints", [])
        available_indices = list(set(range(code_len)) - {h["position"] for h in hints})
        
        if not available_indices:
            return {"error": "No more hints available"}
            
        target_idx = random.choice(available_indices)
        
        # Increment hints used
        room["players"][player_id]["progress"]["hints_used"] = hints_used + 1
        hints.append({"position": target_idx, "digit": target[target_idx]})
        await self.save_room(room_id, room)
        
        return {
            "position": target_idx,
            "digit": target[target_idx]
        }
    @room_transaction
    async def request_replay(self, room_id: str, sid: str) -> Optional[Dict[str, Any]]:
        room = await self.get_room(room_id)
        if not room or room["status"] != "finished":
            return None

        player_id = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        if not player_id:
            return None

        if player_id not in room["replay_requests"]:
            room["replay_requests"].append(player_id)
            await self.save_room(room_id, room)

        # If all players (2) requested replay, start new game
        if len(room["players"]) == 2 and len(room["replay_requests"]) == 2 and all(p.get("connected", False) for p in room["players"].values()):
            return await self._start_game(room_id, room)

        return room

    @room_transaction
    async def surrender(self, room_id: str, sid: str) -> Optional[Dict[str, Any]]:
        room = await self.get_room(room_id)
        if not room or room["status"] != "playing":
            return None
            
        # Find player_id of the person who resigned
        resigned_pid = next((pid for pid, p in room["players"].items() if p["sid"] == sid), None)
        if not resigned_pid:
            return None
        room["status"] = "finished"
        room["resigned_sid"] = sid
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
            
        room["finished_at"] = datetime.now(timezone.utc).isoformat()
        room["end_reason"] = "resignation"
        
        await self.save_room(room_id, room)
        return room

multiplayer_service = MultiplayerService()
