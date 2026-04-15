"""
Gap analysis service.

Pure functions — no database access. Route handlers fetch data and pass it in.

The proficiency scale is linear: level k out of N maps to a normalized score of
    (k - 1) / (N - 1) × 100

This gives:  level 1 → 0.0,  level N → 100.0,  and equal intervals in between.

Required level defaults to the 60th-percentile level (e.g. level 3 for N=5),
computed by the caller based on the framework's proficiency_levels count.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Level ↔ score conversion helpers (exported for use in routes + tests)
# ---------------------------------------------------------------------------


def _score_for_level(level: int, max_level: int) -> float:
    """Return the minimum normalized score (0–100) for *level* on a *max_level* scale."""
    if max_level <= 1:
        return 0.0
    return round((level - 1) / (max_level - 1) * 100, 1)


def _level_for_score(score: float, max_level: int) -> int:
    """Map a normalized score (0–100) to the highest proficiency level it meets."""
    for level in range(max_level, 0, -1):
        if score >= _score_for_level(level, max_level):
            return level
    return 1


# ---------------------------------------------------------------------------
# Individual gap computation
# ---------------------------------------------------------------------------


def compute_gap(
    employee_profile_id: str,
    framework_id: str,
    *,
    competency_names: dict[str, str],
    proficiency_count: int,
    required_level: int,
    scores: dict[str, float | None],
    employee_name: str,
    framework_title: str,
) -> dict:
    """
    Compute per-competency gaps for one employee.

    Parameters
    ----------
    employee_profile_id : str
    framework_id : str
    competency_names : {competency_id: name}
    proficiency_count : int
        Number of defined proficiency levels (typically 5).
    required_level : int
        Target proficiency level all employees should reach.
    scores : {competency_id: normalized_score | None}
        Latest assessed score per competency (None = not yet assessed).
    employee_name : str
    framework_title : str

    Returns
    -------
    dict matching the GapReport schema.
    """
    required_score = _score_for_level(required_level, proficiency_count)
    gaps: list[dict] = []

    for comp_id, name in competency_names.items():
        actual = scores.get(comp_id)
        if actual is not None:
            gap_value: float | None = round(required_score - actual, 1)
            actual_level: int | None = _level_for_score(actual, proficiency_count)
        else:
            gap_value = None
            actual_level = None

        gaps.append(
            {
                "competency_id": comp_id,
                "competency_name": name,
                "required_level": required_level,
                "required_score": required_score,
                "actual_score": actual,
                "actual_level": actual_level,
                "gap": gap_value,
                "priority": (gap_value is not None and gap_value > 20),
            }
        )

    # Overall readiness: mean of (actual / required) for assessed competencies, capped at 1
    assessed_pairs = [
        (g["actual_score"], g["required_score"])
        for g in gaps
        if g["actual_score"] is not None and g["required_score"] > 0
    ]
    if assessed_pairs:
        overall_readiness = round(
            sum(min(a / r, 1.0) * 100 for a, r in assessed_pairs) / len(assessed_pairs),
            1,
        )
    else:
        overall_readiness = 0.0

    # Top priorities: up to 3 competencies with the largest positive gap
    prioritized = sorted(
        [g for g in gaps if g["gap"] is not None],
        key=lambda g: g["gap"],
        reverse=True,
    )[:3]

    return {
        "employee_id": employee_profile_id,
        "employee_name": employee_name,
        "framework_id": framework_id,
        "framework_title": framework_title,
        "overall_readiness": overall_readiness,
        "gaps": gaps,
        "top_priorities": prioritized,
    }


# ---------------------------------------------------------------------------
# Team-level aggregation
# ---------------------------------------------------------------------------


def team_gap_summary(
    framework_id: str,
    framework_title: str,
    *,
    competency_names: dict[str, str],
    proficiency_count: int,
    required_level: int,
    employee_scores: dict[str, dict[str, float | None]],
    employee_names: dict[str, str],
) -> dict:
    """
    Aggregate gap analysis across a team.

    Parameters
    ----------
    framework_id : str
    framework_title : str
    competency_names : {competency_id: name}
    proficiency_count : int
    required_level : int
    employee_scores : {employee_id: {competency_id: score | None}}
    employee_names : {employee_id: name}

    Returns
    -------
    dict matching the TeamGapReport schema.
    """
    required_score = _score_for_level(required_level, proficiency_count)
    n_employees = len(employee_scores)

    # ── Per-competency stats ─────────────────────────────────────────────────
    competency_stats: list[dict] = []

    for comp_id, name in competency_names.items():
        all_scores = [
            employee_scores[emp_id].get(comp_id) for emp_id in employee_scores
        ]
        assessed_scores = [s for s in all_scores if s is not None]

        mean_score = (
            round(sum(assessed_scores) / len(assessed_scores), 1) if assessed_scores else None
        )

        # Level distribution: count per level, then convert to %
        level_counts: dict[int, int] = {lv: 0 for lv in range(1, proficiency_count + 1)}
        for s in assessed_scores:
            lv = _level_for_score(s, proficiency_count)
            level_counts[lv] = level_counts.get(lv, 0) + 1

        level_distribution = {
            str(lv): round(count / n_employees * 100, 1) if n_employees > 0 else 0.0
            for lv, count in level_counts.items()
        }

        # Critical: >50% of the whole team (including unassessed) below required
        below_required = sum(1 for s in assessed_scores if s < required_score)
        critical = n_employees > 0 and (below_required / n_employees) > 0.5

        competency_stats.append(
            {
                "competency_id": comp_id,
                "competency_name": name,
                "mean_score": mean_score,
                "level_distribution": level_distribution,
                "critical": critical,
            }
        )

    # ── Heatmap ──────────────────────────────────────────────────────────────
    heatmap: list[dict] = []
    for emp_id, emp_name in employee_names.items():
        row_scores = employee_scores.get(emp_id, {})
        heatmap.append(
            {
                "employee_id": emp_id,
                "employee_name": emp_name,
                "scores": {
                    comp_id: (
                        _level_for_score(row_scores[comp_id], proficiency_count)
                        if row_scores.get(comp_id) is not None
                        else None
                    )
                    for comp_id in competency_names
                },
            }
        )

    critical_gaps = [c for c in competency_stats if c["critical"]]

    return {
        "framework_id": framework_id,
        "framework_title": framework_title,
        "employee_count": n_employees,
        "competency_stats": competency_stats,
        "heatmap": heatmap,
        "critical_gaps": critical_gaps,
    }
