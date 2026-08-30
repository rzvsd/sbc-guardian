from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Any, Protocol


class Auth0Client(Protocol):
    def authorize_url(self, state: str, code_challenge: str) -> str:
        ...

    def exchange(self, code: str, code_verifier: str) -> dict[str, Any]:
        """Return a provider-validated identity and tokens.

        Required identity fields are issuer, subject, email and email_verified.
        """
        ...


def generate_pkce() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    return verifier, challenge


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_state(state: str) -> str:
    return hashlib.sha256(state.encode()).hexdigest()


def pkce_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def verify_pkce(verifier: str, expected_challenge: str) -> bool:
    return secrets.compare_digest(pkce_challenge(verifier), expected_challenge)
