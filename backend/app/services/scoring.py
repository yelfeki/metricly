"""
Psychometric scoring service.

Computes numeric_score for each answer based on question type and researcher-configured
weights/scores. Called automatically on response submission.
"""

import json

from ..models.survey import Question

_LIKERT_MAX = {"likert_5": 5, "likert_7": 7}


def score_answer(question: Question, value: str) -> float | None:
    """
    Compute the numeric psychometric score for a single answer.

    Returns None for unscored types (text, ranking) or when scoring is not
    configured (option_scores is NULL for choice / forced-choice types).
    """
    qt = question.question_type

    # ── Likert ───────────────────────────────────────────────────────────────
    if qt in ("likert_5", "likert_7"):
        try:
            raw = float(value)
        except (ValueError, TypeError):
            return None
        max_val = _LIKERT_MAX[qt]
        if question.reverse_scored:
            raw = (max_val + 1) - raw
        weight = question.score_weight if question.score_weight is not None else 1.0
        return round(raw * weight, 4)

    # ── Choice types (single / multiple / forced) ────────────────────────────
    if qt in ("single_choice", "multiple_choice", "forced_choice"):
        if not question.option_scores:
            return None
        try:
            scores: dict[str, float] = json.loads(question.option_scores)
        except (json.JSONDecodeError, TypeError, ValueError):
            return None

        if qt == "single_choice":
            return round(float(scores.get(value, 0.0)), 4)

        if qt == "multiple_choice":
            try:
                choices: list[str] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return None
            total = sum(float(scores.get(c, 0.0)) for c in choices)
            return round(total, 4)

        if qt == "forced_choice":
            # value = '{"Label A": "Item X", "Label B": "Item Y"}'
            # Score = weight of the item assigned to Label A (the first label).
            try:
                assigned: dict[str, str] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return None
            try:
                opts = json.loads(question.options or "null")
                labels: list[str] = opts.get("labels", []) if isinstance(opts, dict) else []
            except (json.JSONDecodeError, TypeError):
                labels = []
            label_a = labels[0] if labels else None
            if label_a is None:
                return None
            item_for_label_a = assigned.get(label_a)
            if item_for_label_a is not None:
                return round(float(scores.get(item_for_label_a, 0.0)), 4)
            return None

    # ── Text / Ranking — not scored ──────────────────────────────────────────
    return None
