from pydantic import BaseModel, Field
import re


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{2,24}$")


class AccountCredentials(BaseModel):
    username: str = Field(min_length=2, max_length=24, pattern=USERNAME_PATTERN.pattern)
    password: str = Field(min_length=8, max_length=128)


class AccountResponse(BaseModel):
    user_id: str
    username: str
    created_at: str


class AuthResponse(BaseModel):
    user: AccountResponse


class FriendTarget(BaseModel):
    username: str = Field(min_length=2, max_length=24, pattern=USERNAME_PATTERN.pattern)


class FriendAction(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


class FriendRecord(BaseModel):
    user_id: str
    username: str
    status: str
    direction: str | None = None
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
