"""
Score normalization utilities for the scoring algorithm builder.

normalize()   — maps a raw mean to the configured normalized scale
get_label()   — maps a normalized score to a qualitative label + color
"""

from __future__ import annotations


def normalize(
    raw_mean: float,
    min_possible: float,
    max_possible: float,
    normalized_min: float = 0.0,
    normalized_max: float = 100.0,
) -> float:
    """
    Linearly scale raw_mean from [min_possible, max_possible] →
    [normalized_min, normalized_max].

    If min_possible == max_possible (degenerate range) returns normalized_min.
    The result is NOT clamped, so out-of-range raw values produce out-of-range
    normalized values — callers should validate inputs if clamping is desired.
    """
    if max_possible == min_possible:
        return normalized_min
    ratio = (raw_mean - min_possible) / (max_possible - min_possible)
    return ratio * (normalized_max - normalized_min) + normalized_min


def get_label(
    normalized_score: float,
    labels: list[dict],
) -> dict | None:
    """
    Find the first label whose threshold the normalized_score meets or exceeds.

    labels — list of dicts with keys: threshold (float), label (str), color (str).
             The list does NOT need to be pre-sorted.

    Returns {"label": str, "color": str} or None if the score is below every threshold.
    """
    if not labels:
        return None
    sorted_labels = sorted(labels, key=lambda x: x["threshold"], reverse=True)
    for entry in sorted_labels:
        if normalized_score >= entry["threshold"]:
            return {"label": entry["label"], "color": entry["color"]}
    return None
