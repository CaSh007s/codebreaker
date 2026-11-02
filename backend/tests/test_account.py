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


def test_accounts_can_share_display_name_but_have_unique_handles(tmp_path):
    async def scenario():
        service = AccountService()
        service.session_secret = "test-session-secret"
        service.fallback_path = tmp_path / "accounts.json"

        first, first_token = await service.register("SameName", "password123")
        second, second_token = await service.register("SameName", "password456")

        assert first["username"] == second["username"] == "SameName"
        assert first["discriminator"] != second["discriminator"]
        assert len(first["discriminator"]) == len(second["discriminator"]) == 4

        first_login, _ = await service.login(f"SameName#{first['discriminator']}", "password123")
        second_login, _ = await service.login(f"SameName#{second['discriminator']}", "password456")
        assert first_login["user_id"] == first["user_id"]
        assert second_login["user_id"] == second["user_id"]
        assert (await service.get_user(first_token))["discriminator"] == first["discriminator"]
        assert (await service.get_user(second_token))["discriminator"] == second["discriminator"]

    asyncio.run(scenario())


def test_fallback_callsign_update_preserves_discriminator(tmp_path):
    async def scenario():
        service = AccountService()
        service.session_secret = "test-session-secret"
        service.fallback_path = tmp_path / "accounts.json"

        user, token = await service.register("BeforeName", "password123")
        updated = await service.update_username(user["user_id"], "AfterName")

        assert updated["username"] == "AfterName"
        assert updated["discriminator"] == user["discriminator"]
        current = await service.get_user(token)
        assert current["username"] == "AfterName"
        assert current["discriminator"] == user["discriminator"]

    asyncio.run(scenario())


def test_callsign_update_changes_discriminator_only_on_collision(tmp_path):
    async def scenario():
        service = AccountService()
        service.session_secret = "test-session-secret"
        service.fallback_path = tmp_path / "accounts.json"

        first, _ = await service.register("OldName", "password123")
        second, _ = await service.register("TargetName", "password456")
        second_account = next(account for account in service.fallback_accounts.values() if account["id"] == second["user_id"])
        second_account["discriminator"] = first["discriminator"]
        service.fallback_accounts = {
            f"{account['username'].casefold()}#{account['discriminator']}": account
            for account in service.fallback_accounts.values()
        }

        updated = await service.update_username(first["user_id"], "TargetName")
        assert updated["username"] == "TargetName"
        assert updated["discriminator"] != second["discriminator"]

    asyncio.run(scenario())
