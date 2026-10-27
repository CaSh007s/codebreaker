import asyncio

from app.services.account_service import hash_password, verify_password
from app.services.account_service import AccountService


def test_password_hash_round_trip():
    encoded = hash_password("correct horse battery staple")

    assert encoded.startswith("scrypt$")
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("incorrect password", encoded)


def test_malformed_password_hash_is_rejected():
    assert not verify_password("password", "not-a-password-hash")


def test_emergency_account_store_keeps_hashed_credentials(tmp_path):
    async def scenario():
        service = AccountService()
        service.session_secret = "test-session-secret"
        service.fallback_path = tmp_path / "accounts.json"

        user, token = await service.register("FallbackUser", "password123")
        assert user["username"] == "FallbackUser"
        assert "scrypt$" in service.fallback_path.read_text()

        logged_in, second_token = await service.login("FallbackUser", "password123")
        assert logged_in["user_id"] == user["user_id"]
        assert (await service.get_user(second_token))["username"] == "FallbackUser"
        assert token != second_token

    asyncio.run(scenario())
