from pydantic import BaseModel, Field
import re


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{2,24}$")
IDENTITY_PATTERN = re.compile(r"^[A-Za-z0-9_]{2,24}(#[0-9]{4})?$")


class AccountCredentials(BaseModel):
    # Registration accepts a display name; login may also use CALLSIGN#1234.
    username: str = Field(min_length=2, max_length=29, pattern=IDENTITY_PATTERN.pattern)
    password: str = Field(min_length=8, max_length=128)


class AccountResponse(BaseModel):
    user_id: str
    username: str
    discriminator: str
    avatar_url: str | None = None
    created_at: str


class AuthResponse(BaseModel):
    user: AccountResponse


class FriendTarget(BaseModel):
    # Friend lookups must use the complete unique handle.
    identity: str = Field(min_length=7, max_length=29, pattern=r"^[A-Za-z0-9_]{2,24}#[0-9]{4}$")


class AccountCallsignUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=24, pattern=USERNAME_PATTERN.pattern)
    avatar_url: str | None = Field(default=None, max_length=2048)


class ProfileRecords(BaseModel):
    games_played: int = 0
    wins: int = 0
    losses: int = 0
    best_score: int = 0


class ProfileResponse(AccountResponse):
    friend_count: int = 0
    friendship_status: str | None = None
    is_self: bool = False
    records: ProfileRecords = Field(default_factory=ProfileRecords)


class ChallengeResponse(BaseModel):
    room_id: str
    mode: str = "standard"
    level: int = 4
    repeats: bool = False


class ChallengeRequest(BaseModel):
    room_id: str = Field(min_length=1, max_length=128)


class DirectMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class DirectMessageRecord(BaseModel):
    message_id: str
    sender_id: str
    sender_username: str
    body: str
    created_at: str
    read: bool = False


class ReportRequest(BaseModel):
    target_user_id: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=3, max_length=500)


class FriendAction(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


class FriendRecord(BaseModel):
    user_id: str
    username: str
    discriminator: str
    status: str
    direction: str | None = None
    blocked_by: str | None = None
    created_at: str


class NotificationRecord(BaseModel):
    notification_id: str
    kind: str
    title: str
    body: str
    payload: dict = Field(default_factory=dict)
    read: bool
    created_at: str


class PushSubscription(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=512)
