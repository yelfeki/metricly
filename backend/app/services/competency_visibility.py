"""Canonical visibility rules + status derivation for competency_definitions.

Use these helpers; do NOT inline the visibility OR clause across endpoints.
See CompetencyDefinition.__doc__ for the rationale.
"""

from __future__ import annotations

from sqlalchemy import Select, or_, select

from ..models.competency import CompetencyDefinition


def visible_competencies_stmt(user_id: str | None) -> Select:
    """Return a base Select with the canonical visibility filter applied.

    Caller adds ``.where()`` / ``.options()`` on top as needed.

    Rule::

        WHERE is_custom = FALSE                       -- seeded; visible to all
           OR organization_id = <user_id>             -- custom in the user's org

    ``user_id=None`` returns only seeded competencies (unauthenticated reads).
    """
    base = select(CompetencyDefinition)
    if user_id is None:
        return base.where(CompetencyDefinition.is_custom.is_(False))
    return base.where(
        or_(
            CompetencyDefinition.is_custom.is_(False),
            CompetencyDefinition.organization_id == user_id,
        )
    )


def is_editable_by(comp: CompetencyDefinition, user_id: str) -> bool:
    """Custom competencies are editable only by users in the same org.

    Seeded competencies (``is_custom = False``) are read-only for everyone.
    """
    return bool(comp.is_custom and comp.organization_id == user_id)


# Canonical scale used everywhere (matches seeded library + framework wizard).
_REQUIRED_LEVEL_COUNT = 5


def derive_status(
    *,
    level_count: int,
    levels_with_indicators: int,
) -> str:
    """Pure mapping: completeness signals → 'active' | 'draft'.

    A competency is active iff it has the full 5-level scale AND every level
    carries at least one behavioural indicator. Anything else is draft.

    'archived' is set only by explicit archive actions, never via derivation.
    """
    if level_count >= _REQUIRED_LEVEL_COUNT and levels_with_indicators >= _REQUIRED_LEVEL_COUNT:
        return "active"
    return "draft"
