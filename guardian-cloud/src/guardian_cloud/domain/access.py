from __future__ import annotations

from datetime import UTC, datetime

ACCOUNT_ROLE_PRINCIPAL_ADMIN = "PRINCIPAL_ADMIN"
ACCOUNT_ROLE_ADMIN = "ADMIN"
ACCOUNT_ROLE_SUBSCRIBER = "SUBSCRIBER"

ACCESS_FULL = "FULL"
ACCESS_FULL_WITH_WARNING = "FULL_WITH_WARNING"
ACCESS_PAYWALL = "PAYWALL"

# Server is the only source of truth for access; client never reconstructs entitlement.
_ROLE_ACCESS = {
    ACCOUNT_ROLE_PRINCIPAL_ADMIN: ACCESS_FULL,
    ACCOUNT_ROLE_ADMIN: ACCESS_FULL,
}

_SUBSCRIBER_STATE_ACCESS = {
    "ACTIVE": ACCESS_FULL,
    "GRACE": ACCESS_FULL_WITH_WARNING,
    "TRIAL": ACCESS_FULL,
    "ON_HOLD": ACCESS_PAYWALL,
    "EXPIRED": ACCESS_PAYWALL,
    "CANCELED": ACCESS_PAYWALL,
}


def compute_access(
    role: str,
    entitlement_state: str | None,
    entitlement_until: datetime | None = None,
) -> str:
    if role in _ROLE_ACCESS:
        return _ROLE_ACCESS[role]
    if role == ACCOUNT_ROLE_SUBSCRIBER:
        if entitlement_until is not None:
            until = entitlement_until
            if until.tzinfo is None:
                until = until.replace(tzinfo=UTC)
            if until <= datetime.now(UTC):
                return ACCESS_PAYWALL
        return _SUBSCRIBER_STATE_ACCESS.get(entitlement_state or "", ACCESS_PAYWALL)
    return ACCESS_PAYWALL


def is_admin(role: str) -> bool:
    return role in (ACCOUNT_ROLE_PRINCIPAL_ADMIN, ACCOUNT_ROLE_ADMIN)
