from app.services.account_service import hash_password, verify_password


def test_password_hash_round_trip():
    encoded = hash_password("correct horse battery staple")

    assert encoded.startswith("scrypt$")
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("incorrect password", encoded)


def test_malformed_password_hash_is_rejected():
    assert not verify_password("password", "not-a-password-hash")
