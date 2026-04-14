"""
Cohort analytics engine for the company dashboard.

cohort_summary()    — descriptive stats + histogram per factor across all respondents
group_comparison()  — between-group test (t-test or ANOVA) per factor × demographic group
"""

from __future__ import annotations

import math
from typing import Any

from scipy import stats as scipy_stats


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals)


def _sample_sd(vals: list[float]) -> float:
    if len(vals) < 2:
        return 0.0
    m = _mean(vals)
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1))


def _basic_stats(vals: list[float]) -> dict[str, Any]:
    n = len(vals)
    if n == 0:
        return {"mean": None, "sd": None, "min": None, "max": None, "n": 0}
    m = _mean(vals)
    return {
        "mean": round(m, 2),
        "sd": round(_sample_sd(vals), 2),
        "min": round(min(vals), 2),
        "max": round(max(vals), 2),
        "n": n,
    }


def _histogram(
    vals: list[float],
    n_bins: int = 10,
    lo: float = 0.0,
    hi: float = 100.0,
) -> list[dict[str, Any]]:
    """Return a list of {start, end, count} dicts."""
    if lo >= hi:
        return []
    bin_width = (hi - lo) / n_bins
    bins = [
        {"start": round(lo + i * bin_width, 1), "end": round(lo + (i + 1) * bin_width, 1), "count": 0}
        for i in range(n_bins)
    ]
    for v in vals:
        idx = min(int((v - lo) / bin_width), n_bins - 1)
        if 0 <= idx < n_bins:
            bins[idx]["count"] += 1
    return bins


def _cohen_d(a: list[float], b: list[float]) -> float | None:
    """Pooled Cohen's d between two groups (absolute value)."""
    if len(a) < 2 or len(b) < 2:
        return None
    m_a, m_b = _mean(a), _mean(b)
    var_a = sum((v - m_a) ** 2 for v in a) / (len(a) - 1)
    var_b = sum((v - m_b) ** 2 for v in b) / (len(b) - 1)
    pooled = math.sqrt((var_a + var_b) / 2)
    if pooled == 0:
        return 0.0
    return abs(m_a - m_b) / pooled


def _eta_squared(groups: list[list[float]]) -> float | None:
    """Eta-squared from one-way ANOVA."""
    all_vals = [v for g in groups for v in g]
    if len(all_vals) < 2:
        return None
    grand_mean = _mean(all_vals)
    ss_total = sum((v - grand_mean) ** 2 for v in all_vals)
    if ss_total == 0:
        return 0.0
    ss_between = sum(
        len(g) * (_mean(g) - grand_mean) ** 2
        for g in groups
        if g
    )
    return ss_between / ss_total


def _effect_interpretation(significant: bool, effect_size: float | None, effect_type: str) -> str:
    if not significant:
        return "no significant difference"
    if effect_size is None:
        return "significant difference"
    if effect_type == "cohen_d":
        if effect_size >= 0.8:
            return "significant difference (large effect)"
        if effect_size >= 0.5:
            return "significant difference (medium effect)"
        return "significant difference (small effect)"
    else:  # eta_squared
        if effect_size >= 0.14:
            return "significant difference (large effect)"
        if effect_size >= 0.06:
            return "significant difference (medium effect)"
        return "significant difference (small effect)"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def cohort_summary(
    factor_scores: dict[str, list[float]],
) -> dict[str, dict[str, Any]]:
    """
    factor_scores: factor_name → list of normalized scores (one per respondent)

    Returns: factor_name → {mean, sd, min, max, n, histogram}
    """
    return {
        factor: {**_basic_stats(vals), "histogram": _histogram(vals)}
        for factor, vals in factor_scores.items()
    }


def group_comparison(
    factor_group_scores: dict[str, dict[str, list[float]]],
) -> dict[str, dict[str, Any]]:
    """
    factor_group_scores: factor_name → group_value → list of normalized scores

    Returns: factor_name → {groups, test_type, p_value, significant,
                             effect_size, effect_size_type, interpretation}
    """
    results: dict[str, dict[str, Any]] = {}

    for factor, group_map in factor_group_scores.items():
        non_empty = {k: v for k, v in group_map.items() if len(v) >= 1}
        sorted_keys = sorted(non_empty.keys())

        group_stats = [
            {**_basic_stats(group_map.get(gv, [])), "group_value": gv}
            for gv in sorted_keys
        ]

        if len(non_empty) < 2:
            results[factor] = {
                "groups": group_stats,
                "test_type": None,
                "p_value": None,
                "significant": False,
                "effect_size": None,
                "effect_size_type": None,
                "interpretation": "insufficient data for comparison",
            }
            continue

        group_lists = [non_empty[k] for k in sorted_keys]

        if len(non_empty) == 2:
            _, p = scipy_stats.ttest_ind(group_lists[0], group_lists[1], equal_var=False)
            d = _cohen_d(group_lists[0], group_lists[1])
            sig = bool(p < 0.05)
            results[factor] = {
                "groups": group_stats,
                "test_type": "t-test",
                "p_value": round(float(p), 4),
                "significant": sig,
                "effect_size": round(d, 3) if d is not None else None,
                "effect_size_type": "cohen_d",
                "interpretation": _effect_interpretation(sig, d, "cohen_d"),
            }
        else:
            _, p = scipy_stats.f_oneway(*group_lists)
            eta2 = _eta_squared(group_lists)
            sig = bool(p < 0.05)
            results[factor] = {
                "groups": group_stats,
                "test_type": "anova",
                "p_value": round(float(p), 4),
                "significant": sig,
                "effect_size": round(eta2, 3) if eta2 is not None else None,
                "effect_size_type": "eta_squared",
                "interpretation": _effect_interpretation(sig, eta2, "eta_squared"),
            }

    return results
