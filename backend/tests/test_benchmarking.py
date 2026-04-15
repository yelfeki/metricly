"""Unit tests for the benchmarking service."""

import pytest

from app.services.benchmarking import compare_to_benchmark, team_benchmark_summary


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

_NAMES = {"c1": "Communication", "c2": "Leadership", "c3": "Technical"}
_BENCH = {"c1": 60.0, "c2": 70.0}  # c3 has no benchmark


def _make_comparison(scores: dict[str, float | None], bench: dict[str, float] | None = None) -> dict:
    return compare_to_benchmark(
        employee_profile_id="emp1",
        framework_id="fw1",
        competency_names=_NAMES,
        benchmarks=bench if bench is not None else _BENCH,
        scores=scores,
        employee_name="Alice",
        framework_title="Management Framework",
    )


def _make_team(
    employee_scores: dict[str, dict[str, float | None]],
    bench: dict[str, float] | None = None,
) -> dict:
    names = {f"c{i}": f"Competency {i}" for i in range(1, 3)}
    emp_names = {k: f"Employee {k[-1]}" for k in employee_scores}
    return team_benchmark_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names=names,
        benchmarks=bench if bench is not None else {"c1": 60.0, "c2": 70.0},
        employee_scores=employee_scores,
        employee_names=emp_names,
    )


# ---------------------------------------------------------------------------
# compare_to_benchmark — status logic
# ---------------------------------------------------------------------------


def test_status_below():
    result = _make_comparison({"c1": 40.0, "c2": 50.0, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["status"] == "below"


def test_status_meeting_at_threshold():
    """Score exactly at benchmark → meeting."""
    result = _make_comparison({"c1": 60.0, "c2": 70.0, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["status"] == "meeting"


def test_status_meeting_slightly_above():
    """Score 5 pts above benchmark → meeting (below exceeding margin of 10)."""
    result = _make_comparison({"c1": 65.0, "c2": 70.0, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["status"] == "meeting"


def test_status_exceeding():
    """Score >= benchmark + 10 → exceeding."""
    result = _make_comparison({"c1": 70.0, "c2": 70.0, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["status"] == "exceeding"


def test_status_unassessed():
    result = _make_comparison({"c1": None, "c2": None, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["status"] == "unassessed"
    assert c1["actual_score"] is None
    assert c1["pct_of_benchmark"] is None


def test_status_no_benchmark():
    """Competency with no benchmark entry gets 'no_benchmark' status."""
    result = _make_comparison({"c1": 50.0, "c2": 50.0, "c3": 50.0})
    c3 = next(c for c in result["comparisons"] if c["competency_id"] == "c3")
    assert c3["status"] == "no_benchmark"
    assert c3["benchmark_score"] is None


# ---------------------------------------------------------------------------
# compare_to_benchmark — numeric outputs
# ---------------------------------------------------------------------------


def test_gap_positive_when_below():
    result = _make_comparison({"c1": 40.0, "c2": None, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["gap"] == pytest.approx(20.0, abs=0.1)


def test_gap_negative_when_exceeding():
    result = _make_comparison({"c1": 80.0, "c2": None, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["gap"] == pytest.approx(-20.0, abs=0.1)


def test_pct_of_benchmark():
    """actual / benchmark * 100."""
    result = _make_comparison({"c1": 30.0, "c2": None, "c3": None})
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["pct_of_benchmark"] == pytest.approx(50.0, abs=0.1)


def test_pct_capped_at_100_in_overall():
    """overall_pct_of_benchmark is capped at 100 per competency before averaging."""
    # Both competencies well above benchmark — overall should be 100
    result = _make_comparison({"c1": 90.0, "c2": 90.0, "c3": None})
    assert result["overall_pct_of_benchmark"] == pytest.approx(100.0, abs=1.0)


def test_overall_pct_no_assessed():
    result = _make_comparison({"c1": None, "c2": None, "c3": None})
    assert result["overall_pct_of_benchmark"] == 0.0


def test_overall_pct_partial_assessed():
    """Only assessed competencies contribute to the overall."""
    result = _make_comparison({"c1": 60.0, "c2": None, "c3": None})
    assert result["overall_pct_of_benchmark"] == pytest.approx(100.0, abs=0.1)


def test_overall_pct_calculation():
    """c1: 30/60=50%, c2: 35/70=50% → overall 50%."""
    result = _make_comparison({"c1": 30.0, "c2": 35.0, "c3": None})
    assert result["overall_pct_of_benchmark"] == pytest.approx(50.0, abs=0.5)


# ---------------------------------------------------------------------------
# compare_to_benchmark — metadata
# ---------------------------------------------------------------------------


def test_metadata():
    result = _make_comparison({"c1": 50.0, "c2": 50.0, "c3": None})
    assert result["employee_id"] == "emp1"
    assert result["employee_name"] == "Alice"
    assert result["framework_id"] == "fw1"
    assert result["framework_title"] == "Management Framework"


def test_returns_one_comparison_per_competency():
    result = _make_comparison({"c1": 50.0, "c2": 50.0, "c3": 50.0})
    assert len(result["comparisons"]) == len(_NAMES)


# ---------------------------------------------------------------------------
# compare_to_benchmark — zero-benchmark edge case
# ---------------------------------------------------------------------------


def test_zero_benchmark_pct_is_100():
    """If benchmark is 0 and actual >= 0, pct_of_benchmark should not divide by zero."""
    result = _make_comparison(
        {"c1": 0.0, "c2": None, "c3": None},
        bench={"c1": 0.0},
    )
    c1 = next(c for c in result["comparisons"] if c["competency_id"] == "c1")
    assert c1["pct_of_benchmark"] == pytest.approx(100.0, abs=0.1)


# ---------------------------------------------------------------------------
# team_benchmark_summary — basic correctness
# ---------------------------------------------------------------------------


def test_team_empty():
    result = team_benchmark_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Communication"},
        benchmarks={"c1": 60.0},
        employee_scores={},
        employee_names={},
    )
    assert result["employee_count"] == 0
    assert result["overall_team_readiness"] == 0.0


def test_team_employee_count():
    result = _make_team({"emp1": {"c1": 70.0, "c2": 80.0}, "emp2": {"c1": 50.0, "c2": 60.0}})
    assert result["employee_count"] == 2


def test_pct_meeting_all_above():
    result = _make_team({"emp1": {"c1": 70.0, "c2": 80.0}, "emp2": {"c1": 65.0, "c2": 75.0}})
    c1_stat = next(c for c in result["competency_readiness"] if c["competency_id"] == "c1")
    assert c1_stat["pct_meeting"] == pytest.approx(100.0, abs=0.1)


def test_pct_meeting_none_above():
    result = _make_team({"emp1": {"c1": 40.0, "c2": 50.0}, "emp2": {"c1": 30.0, "c2": 40.0}})
    c1_stat = next(c for c in result["competency_readiness"] if c["competency_id"] == "c1")
    assert c1_stat["pct_meeting"] == pytest.approx(0.0, abs=0.1)


def test_pct_meeting_half():
    """1 of 2 employees meets the benchmark → 50%."""
    result = _make_team({"emp1": {"c1": 70.0, "c2": 80.0}, "emp2": {"c1": 40.0, "c2": 50.0}})
    c1_stat = next(c for c in result["competency_readiness"] if c["competency_id"] == "c1")
    assert c1_stat["pct_meeting"] == pytest.approx(50.0, abs=0.1)


def test_mean_score():
    result = _make_team({"emp1": {"c1": 40.0, "c2": None}, "emp2": {"c1": 60.0, "c2": None}})
    c1_stat = next(c for c in result["competency_readiness"] if c["competency_id"] == "c1")
    assert c1_stat["mean_score"] == pytest.approx(50.0, abs=0.1)


def test_mean_score_none_when_no_data():
    result = _make_team({"emp1": {"c1": None, "c2": None}})
    c1_stat = next(c for c in result["competency_readiness"] if c["competency_id"] == "c1")
    assert c1_stat["mean_score"] is None


def test_no_benchmark_competency_has_none_pct():
    """Competency with no benchmark entry → pct_meeting is None."""
    result = team_benchmark_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Comm", "c2": "Lead"},
        benchmarks={"c1": 60.0},  # c2 has no benchmark
        employee_scores={"emp1": {"c1": 70.0, "c2": 80.0}},
        employee_names={"emp1": "Alice"},
    )
    c2_stat = next(c for c in result["competency_readiness"] if c["competency_id"] == "c2")
    assert c2_stat["pct_meeting"] is None
    assert c2_stat["benchmark_score"] is None


def test_overall_team_readiness_mean_of_competencies():
    """Overall = mean pct_meeting across benchmarked competencies."""
    # c1: 100% meeting (1/1), c2: 0% meeting (0/1) → overall = 50%
    result = _make_team({"emp1": {"c1": 70.0, "c2": 50.0}})
    assert result["overall_team_readiness"] == pytest.approx(50.0, abs=1.0)


def test_team_missing_benchmark_excluded_from_overall():
    """A competency without a benchmark should not affect overall_team_readiness."""
    result = team_benchmark_summary(
        framework_id="fw1",
        framework_title="Mgmt",
        competency_names={"c1": "Comm", "c2": "Lead"},
        benchmarks={"c1": 60.0},  # c2 has no benchmark
        employee_scores={"emp1": {"c1": 70.0, "c2": 20.0}},
        employee_names={"emp1": "Alice"},
    )
    # Only c1 counts → 100%
    assert result["overall_team_readiness"] == pytest.approx(100.0, abs=0.1)
