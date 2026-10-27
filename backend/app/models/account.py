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


class AccountErrorResponse(BaseModel):
    detail: str
