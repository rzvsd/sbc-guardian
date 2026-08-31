from guardian_cloud.domain.guardian_policy import policy_for_preset


def test_policy_presets_are_deterministic_and_versioned():
    relaxed = policy_for_preset("relaxed")
    safe = policy_for_preset("VERY_SAFE")
    assert relaxed.to_dict()["version"] == 2
    assert relaxed.to_dict()["protect_special"] is False
    assert safe.to_dict()["protect_special"] is True
    assert safe.to_dict()["prefer_untradeable"] is True


def test_unknown_preset_fails_closed():
    try:
        policy_for_preset("made-up")
    except ValueError as exc:
        assert "unknown" in str(exc)
    else:
        raise AssertionError("unknown preset was accepted")
