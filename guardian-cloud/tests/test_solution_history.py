def test_solution_history_route_declares_bounded_limit():
    from guardian_cloud.api.solutions import list_solutions
    assert list_solutions.__annotations__["limit"] == "int"
