"""
Benchmarking service.

Pure functions — no database access. Route handlers fetch data and pass it in.

A benchmark defines an explicit required_score (0–100) per competency for a role.
Unlike gap analysis (which uses a percentile of the proficiency scale), benchmarks are
set directly by an admin and represent the minimum score an employee must achieve.

Status thresholds:
    below      — actual < benchmark
    meeting    — benchmark ≤ actual < benchmark + 10
    exceeding  — actual ≥ benchmark + 10
"""

from __future__ import annotations

_EXCEEDING_MARGIN = 10.0  # points above benchmark to qualify as "exceeding"


# ---------------------------------------------------------------------------
# Individual benchmark comparison
# ---------------------------------------------------------------------------


def compare_to_benchmark(
    employee_profile_id: str,
    framework_id: str,
    *,
    competency_names: dict[str, str],
    benchmarks: dict[str, float],  # competency_id → required_score (0–100)
    scores: dict[str, float | None],  # latest score per competency
    employee_name: str,
    framework_title: str,
) -> dict:
    """
    Compare one employee's scores against per-competency benchmarks.

    Parameters
    ----------
    employee_profile_id : str
    framework_id : str
    competency_names : {competency_id: name}
    benchmarks : {competency_id: required_score}
        Only competencies with an entry are benchmarked; others get status "no_benchmark".
    scores : {competency_id: score | None}
    employee_name : str
    framework_title : str

    Returns
    -------
    dict matching the BenchmarkComparison schema.
    """
    comparisons: list[dict] = []

    for comp_id, name in competency_names.items():
        bench = benchmarks.get(comp_id)
        actual = scores.get(comp_id)

        if bench is None:
            comparisons.append(
                {
                    "competency_id": comp_id,
                    "competency_name": name,
                    "benchmark_score": None,
                    "actual_score": actual,
                    "gap": None,
                    "pct_of_benchmark": None,
                    "status": "unassessed" if actual is None else "no_benchmark",
                }
            )
            continue

        if actual is None:
            comparisons.append(
                {
                    "competency_id": comp_id,
                    "competency_name": name,
                    "benchmark_score": bench,
                    "actual_score": None,
                    "gap": None,
                    "pct_of_benchmark": None,
                    "status": "unassessed",
                }
            )
            continue

        gap = round(bench - actual, 1)
        pct = round(actual / bench * 100, 1) if bench > 0 else 100.0

        if actual >= bench + _EXCEEDING_MARGIN:
            status = "exceeding"
        elif actual >= bench:
            status = "meeting"
        else:
            status = "below"

        comparisons.append(
            {
                "competency_id": comp_id,
                "competency_name": name,
                "benchmark_score": bench,
                "actual_score": actual,
                "gap": gap,
                "pct_of_benchmark": pct,
                "status": status,
            }
        )

    # Overall: mean pct_of_benchmark for assessed competencies, capped at 100
    assessed = [c for c in comparisons if c["pct_of_benchmark"] is not None]
    overall = (
        round(sum(min(c["pct_of_benchmark"], 100.0) for c in assessed) / len(assessed), 1)
        if assessed
        else 0.0
    )

    return {
        "employee_id": employee_profile_id,
        "employee_name": employee_name,
        "framework_id": framework_id,
        "framework_title": framework_title,
        "overall_pct_of_benchmark": overall,
        "comparisons": comparisons,
    }


# ---------------------------------------------------------------------------
# Team-level aggregation
# ---------------------------------------------------------------------------


def team_benchmark_summary(
    framework_id: str,
    framework_title: str,
    *,
    competency_names: dict[str, str],
    benchmarks: dict[str, float],
    employee_scores: dict[str, dict[str, float | None]],
    employee_names: dict[str, str],
) -> dict:
    """
    Aggregate benchmark compliance across a team.

    Returns
    -------
    dict matching the TeamBenchmarkSummary schema.
    """
    n = len(employee_scores)

    competency_readiness: list[dict] = []

    for comp_id, name in competency_names.items():
        bench = benchmarks.get(comp_id)

        if bench is None:
            competency_readiness.append(
                {
                    "competency_id": comp_id,
                    "competency_name": name,
                    "benchmark_score": None,
                    "pct_meeting": None,
                    "mean_score": None,
                }
            )
            continue

        scores_list = [employee_scores[eid].get(comp_id) for eid in employee_scores]
        assessed = [s for s in scores_list if s is not None]
        meeting = [s for s in assessed if s >= bench]

        pct_meeting = round(len(meeting) / n * 100, 1) if n > 0 else 0.0
        mean_score = round(sum(assessed) / len(assessed), 1) if assessed else None

        competency_readiness.append(
            {
                "competency_id": comp_id,
                "competency_name": name,
                "benchmark_score": bench,
                "pct_meeting": pct_meeting,
                "mean_score": mean_score,
            }
        )

    # Overall: mean pct_meeting across benchmarked competencies
    with_bench = [c for c in competency_readiness if c["benchmark_score"] is not None]
    overall = (
        round(sum(c["pct_meeting"] for c in with_bench) / len(with_bench), 1)
        if with_bench and n > 0
        else 0.0
    )

    return {
        "framework_id": framework_id,
        "framework_title": framework_title,
        "employee_count": n,
        "overall_team_readiness": overall,
        "competency_readiness": competency_readiness,
    }
