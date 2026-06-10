"""
Pure scoring helpers for the classroom report workbook.

Figures only — no qualitative labels or verdicts (students interpret the numbers
themselves). Normalization is against the per-item response scale
[scale_min, scale_max], which is correct for a per-item mean and works for any
instrument (1–5, 0–6, 1–7, …).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable


def normalize_per_item(raw_mean: float, scale_min: float, scale_max: float) -> float:
    """Map a per-item mean onto 0–100."""
    if scale_max == scale_min:
        return 0.0
    return round((raw_mean - scale_min) / (scale_max - scale_min) * 100, 1)


def response_factor_scores(
    numeric_by_qid: dict[str, float | None],
    questions: Iterable,
    scale_min: float,
    scale_max: float,
) -> tuple[dict[str, dict], float | None]:
    """
    Compute per-factor {raw_mean, normalized, item_count} and a composite (mean of
    factor normalized scores) for one response.

    `questions` items must expose `.id` and `.factor`.
    """
    acc: dict[str, list[float]] = defaultdict(list)
    for q in questions:
        v = numeric_by_qid.get(q.id)
        if q.factor and v is not None:
            acc[q.factor].append(v)

    factors: dict[str, dict] = {}
    norms: list[float] = []
    for fname, vals in acc.items():
        raw_mean = sum(vals) / len(vals)
        nm = normalize_per_item(raw_mean, scale_min, scale_max)
        factors[fname] = {
            "raw_mean": round(raw_mean, 2),
            "normalized": nm,
            "item_count": len(vals),
        }
        norms.append(nm)

    composite = round(sum(norms) / len(norms), 1) if norms else None
    return factors, composite
