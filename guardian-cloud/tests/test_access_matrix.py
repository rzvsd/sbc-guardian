from guardian_cloud.domain import access as access_domain


def test_admin_roles_full():
    assert access_domain.compute_access("PRINCIPAL_ADMIN", None) == "FULL"
    assert access_domain.compute_access("ADMIN", None) == "FULL"


def test_subscriber_states():
    assert access_domain.compute_access("SUBSCRIBER", "ACTIVE") == "FULL"
    assert access_domain.compute_access("SUBSCRIBER", "GRACE") == "FULL_WITH_WARNING"
    assert access_domain.compute_access("SUBSCRIBER", "TRIAL") == "FULL"
    assert access_domain.compute_access("SUBSCRIBER", "ON_HOLD") == "PAYWALL"
    assert access_domain.compute_access("SUBSCRIBER", "EXPIRED") == "PAYWALL"
    assert access_domain.compute_access("SUBSCRIBER", "CANCELED") == "PAYWALL"
    assert access_domain.compute_access("SUBSCRIBER", None) == "PAYWALL"


def test_unknown_role_paywall():
    assert access_domain.compute_access("UNKNOWN", "ACTIVE") == "PAYWALL"
    assert access_domain.is_admin("ADMIN") is True
    assert access_domain.is_admin("SUBSCRIBER") is False
