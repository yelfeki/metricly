"""Unit tests for the gap analysis service."""

import pytest

from app.services.gap_analysis import (
    _level_for_score,
    _score_for_level,
    compute_gap,
    team_gap_summary,
)


# ---------------------------------------------------------------------------
# _score_for_level
# ---------------------------------------------------------------------------


def test_score_for_level_min():
    """Level 1 always maps to score 0."""
    assert _score_for_level(1, 5) == 0.0
    assert _score_for_level(1, 3) == 0.0


def test_score_for_level_max():
    """Highest level always maps to score 100."""
    assert _score_for_level(5, 5) == 100.0
    assert _score_for_level(3, 3) == 100.0


def test_score_for_level_midpoint():
    """Level 3 in a 5-level scale maps to 50.0."""
    assert _score_for_level(3, 5) == 50.0


def test_score_for_level_single_level():
    """Single-level scale always returns 0."""
    assert _score_for_level(1, 1) == 0.0


def test_score_for_level_equidistant():
    """Steps are equal between consecutive levels."""
    step = _score_for_level(2, 5) - _score_for_level(1, 5)
    for level in range(2, 5):
        diff = round(_score_for_level(level + 1, 5) - _score_for_level(level, 5), 6)
        assert diff == round(step, 6)


# ---------------------------------------------------------------------------
# _level_for_score
# ---------------------------------------------------------------------------


def test_level_for_score_zero():
    """Score 0 → level 1."""
    assert _level_for_score(0.0, 5) == 1


def test_level_for_score_max():
    """Score 100 → highest level."""
    assert _level_for_score(100.0, 5) == 5
    assert _level_for_score(100.0, 3) == 3


def test_level_for_score_at_threshold():
    """Score exactly at a level's threshold → that level."""
    threshold = _score_for_level(3, 5)  # 50.0
    assert _level_for_score(threshold, 5) == 3


def test_level_for_score_just_below_threshold():
    """Score just below level 3 threshold → level 2."""
    threshold = _score_for_level(3, 5)  # 50.0
    assert _level_for_score(threshold - 0.1, 5) == 2


def test_level_for_score_roundtrip():
    """score_for_level and level_for_score are consistent inverses."""
    for level in range(1, 6):
        score = _score_for_level(level, 5)
        assert _level_for_score(score, 5) == level


# ---------------------------------------------------------------------------
# compute_gap — basic correctness
# ---------------------------------------------------------------------------


def _make_gap_result(scores: dict[str, float | None], required_level: int = 3) -> dict:
    return compute_gap(
        employee_profile_id="emp1",
        framework_id="fw1",
        competency_names={"c1": "Communication", "c2": "Leadership"},
        proficiency_count=5,
        required_level=required_level,
        scores=scores,
        employee_name="Alice",
        framework_title="Management Framework",
    )


def test_compute_gap_no_scores():
    """Unassessed employee has 0 overall readiness and all gaps None."""
    result = _make_gap_result({"c1": None, "c2": None})
    assert result["overall_readiness"] == 0.0
    assert all(g["gap"] is None for g in result["gaps"])
    assert result["top_priorities"] == []


def test_compute_gap_above_required():
    """Score above required level → gap ≤ 0, readiness capped at 100."""
    result = _make_gap_result({"c1": 80.0, "c2": 75.0})
    assert all(g["gap"] is not None and g["gap"] <= 0 for g in result["gaps"])
    assert result["overall_readiness"] == 100.0


def test_compute_gap_below_required():
    """Score below required level → positive gap."""
    result = _make_gap_result({"c1": 20.0, "c2": 30.0})
    assert all(g["gap"] is not None and g["gap"] > 0 for g in result["gaps"])


def test_compute_gap_priority_flag_high():
    """Gap > 20 → priority True."""
    required_score = _score_for_level(3, 5)  # 50.0
    result = _make_gap_result({"c1": required_score - 25.0, "c2": None})
    c1_gap = next(g for g in result["gaps"] if g["competency_id"] == "c1")
    assert c1_gap["priority"] is True


def test_compute_gap_priority_flag_low():
    """Gap ≤ 20 → priority False."""
    required_score = _score_for_level(3, 5)  # 50.0
    result = _make_gap_result({"c1": required_score - 10.0, "c2": None})
    c1_gap = next(g for g in result["gaps"] if g["competency_id"] == "c1")
    assert c1_gap["priority"] is False


def test_compute_gap_top_priorities_at_most_3():
    """Top priorities contains at most 3 items."""
    names = {f"c{i}": f"Comp {i}" for i in range(1, 7)}
    scores_in = {f"c{i}": float(i * 5) for i in range(1, 7)}
    result = compute_gap(
        employee_profile_id="emp1",
        framework_id="fw1",
        competency_names=names,
        proficiency_count=5,
        required_level=3,
        scores=scores_in,
        employee_name="Alice",
        framework_title="Mgmt",
    )
    assert len(result["top_priorities"]) <= 3


def test_compute_gap_top_priorities_sorted_desc():
    """Top priorities are ordered by gap descending."""
    result = _make_gap_result({"c1": 10.0, "c2": 30.0})
    gaps = [p["gap"] for p in result["top_priorities"] if p["gap"] is not None]
    assert gaps == sorted(gaps, reverse=True)


def test_compute_gap_overall_readiness_calculation():
    """overall_readiness = mean(min(actual/required, 1)) × 100."""
    # required_score for level 3, max 5 = 50.0
    # c1: 50/50 = 1.0 → 100%
    # c2: 25/50 = 0.5 → 50%
    # mean = 75%
    result = _make_gap_result({"c1": 50.0, "c2": 25.0})
    assert result["overall_readiness"] == 75.0


def test_compute_gap_readiness_capped_at_100():
    """Exceeding required level does not push readiness above 100%."""
    result = _make_gap_result({"c1": 95.0, "c2": 95.0})
    assert result["overall_readiness"] == 100.0


def test_compute_gap_actual_level_correct():
    """actual_level reflects the correct proficiency band."""
    result = _make_gap_result({"c1": 50.0, "c2": 0.0})
    c1 = next(g for g in result["gaps"] if g["competency_id"] == "c1")
    c2 = next(g for g in result["gaps"] if g["competency_id"] == "c2")
    assert c1["actual_level"] == 3  # 50 = threshold for level 3
    assert c2["actual_level"] == 1  # 0 = level 1


def test_compute_gap_metadata():
    """Result includes correct employee and framework metadata."""
    result = _make_gap_result({"c1": 50.0, "c2": 50.0})
    assert result["employee_id"] == "emp1"
    assert result["employee_name"] == "Alice"
    assert result["framework_id"] == "fw1"
    assert result["framework_title"] == "Management Framework"


# ---------------------------------------------------------------------------
# team_gap_summary
# ---------------------------------------------------------------------------


def _make_team(
    employee_scores: dict[str, dict[str, float | None]],
    required_level: int = 3,
) -> dict:
    names = {f"c{i}": f"Competency {i}" for i in range(1, 3)}
    emp_names = {k: f"Employee {k[-1]}" for k in employee_scores}
    return team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names=names,
        proficiency_count=5,
        required_level=required_level,
        employee_scores=employee_scores,
        employee_names=emp_names,
    )


def test_team_summary_empty():
    """No employees → empty results."""
    result = team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        proficiency_count=5,
        required_level=3,
        employee_scores={},
        employee_names={},
    )
    assert result["employee_count"] == 0
    assert result["heatmap"] == []
    assert result["critical_gaps"] == []


def test_team_summary_employee_count():
    """employee_count reflects the number of employees passed in."""
    result = _make_team(
        {"emp1": {"c1": 50.0, "c2": 60.0}, "emp2": {"c1": 30.0, "c2": 40.0}}
    )
    assert result["employee_count"] == 2


def test_team_summary_mean_score():
    """mean_score is computed correctly."""
    result = _make_team(
        {"emp1": {"c1": 40.0, "c2": None}, "emp2": {"c1": 60.0, "c2": None}}
    )
    c1_stats = next(s for s in result["competency_stats"] if s["competency_id"] == "c1")
    assert c1_stats["mean_score"] == 50.0


def test_team_summary_mean_score_none_when_no_data():
    """mean_score is None when no employee has been assessed."""
    result = _make_team({"emp1": {"c1": None, "c2": None}})
    c1_stats = next(s for s in result["competency_stats"] if s["competency_id"] == "c1")
    assert c1_stats["mean_score"] is None


def test_team_summary_critical_flag_majority_below():
    """>50% of team below required → critical True."""
    required = _score_for_level(3, 5)  # 50.0
    # 3 of 4 employees below required
    result = team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        proficiency_count=5,
        required_level=3,
        employee_scores={
            "emp1": {"c1": 20.0},
            "emp2": {"c1": 30.0},
            "emp3": {"c1": 25.0},
            "emp4": {"c1": 75.0},
        },
        employee_names={f"emp{i}": f"Emp {i}" for i in range(1, 5)},
    )
    assert result["competency_stats"][0]["critical"] is True
    assert len(result["critical_gaps"]) == 1


def test_team_summary_not_critical_minority_below():
    """≤50% of team below required → critical False."""
    result = team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        proficiency_count=5,
        required_level=3,
        employee_scores={
            "emp1": {"c1": 60.0},
            "emp2": {"c1": 70.0},
            "emp3": {"c1": 30.0},
        },
        employee_names={f"emp{i}": f"Emp {i}" for i in range(1, 4)},
    )
    assert result["competency_stats"][0]["critical"] is False
    assert result["critical_gaps"] == []


def test_team_summary_heatmap_structure():
    """Heatmap has one row per employee with proficiency levels."""
    result = team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        proficiency_count=5,
        required_level=3,
        employee_scores={"emp1": {"c1": 0.0}, "emp2": {"c1": 100.0}},
        employee_names={"emp1": "Alice", "emp2": "Bob"},
    )
    assert len(result["heatmap"]) == 2
    by_emp = {row["employee_id"]: row for row in result["heatmap"]}
    assert by_emp["emp1"]["scores"]["c1"] == 1   # 0 → level 1
    assert by_emp["emp2"]["scores"]["c1"] == 5   # 100 → level 5


def test_team_summary_heatmap_none_for_unassessed():
    """Unassessed competencies have None in heatmap."""
    result = team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        proficiency_count=5,
        required_level=3,
        employee_scores={"emp1": {"c1": None}},
        employee_names={"emp1": "Alice"},
    )
    assert result["heatmap"][0]["scores"]["c1"] is None


def test_team_summary_level_distribution_sums_to_employee_count_percentage():
    """Level distribution values sum to at most 100% (unassessed employees counted at 0)."""
    result = team_gap_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        proficiency_count=5,
        required_level=3,
        employee_scores={
            "emp1": {"c1": 25.0},   # level 2
            "emp2": {"c1": 75.0},   # level 4
            "emp3": {"c1": 100.0},  # level 5
            "emp4": {"c1": 0.0},    # level 1
        },
        employee_names={f"emp{i}": f"Emp {i}" for i in range(1, 5)},
    )
    dist = result["competency_stats"][0]["level_distribution"]
    total = sum(dist.values())
    assert abs(total - 100.0) < 0.01
