"""Tests for the canonical visibility helper + status derivation.

These two helpers are the single point of truth for "who can see what" and
"is this competency complete". Test coverage here is what prevents future
endpoints from drifting back to inlined OR clauses.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.competency_visibility import (
    derive_status,
    is_editable_by,
    visible_competencies_stmt,
)


# ---------------------------------------------------------------------------
# derive_status — truth table
# ---------------------------------------------------------------------------


class TestDeriveStatus:
    def test_full_5_levels_with_indicators_each_is_active(self):
        assert derive_status(level_count=5, levels_with_indicators=5) == "active"

    def test_zero_levels_is_draft(self):
        assert derive_status(level_count=0, levels_with_indicators=0) == "draft"

    def test_missing_one_level_is_draft(self):
        assert derive_status(level_count=4, levels_with_indicators=4) == "draft"

    def test_all_levels_present_but_one_lacks_indicators_is_draft(self):
        assert derive_status(level_count=5, levels_with_indicators=4) == "draft"

    def test_more_than_5_levels_still_active_if_indicators_match(self):
        # Defensive: future scale change shouldn't break the "complete" signal.
        assert derive_status(level_count=6, levels_with_indicators=6) == "active"

    def test_archived_never_derived(self):
        # No combination of inputs produces 'archived' — that's reserved for
        # explicit archive actions elsewhere.
        for lc in range(0, 8):
            for li in range(0, 8):
                assert derive_status(level_count=lc, levels_with_indicators=li) in {"active", "draft"}


# ---------------------------------------------------------------------------
# is_editable_by
# ---------------------------------------------------------------------------


class TestIsEditableBy:
    def _comp(self, *, is_custom: bool, organization_id: str | None) -> MagicMock:
        m = MagicMock()
        m.is_custom = is_custom
        m.organization_id = organization_id
        return m

    def test_seeded_competency_not_editable_even_by_owner(self):
        # is_custom=False means seeded — read-only for everyone regardless of org match.
        c = self._comp(is_custom=False, organization_id="user-1")
        assert is_editable_by(c, "user-1") is False

    def test_custom_owned_by_same_user_is_editable(self):
        c = self._comp(is_custom=True, organization_id="user-1")
        assert is_editable_by(c, "user-1") is True

    def test_custom_owned_by_different_user_is_not_editable(self):
        c = self._comp(is_custom=True, organization_id="user-1")
        assert is_editable_by(c, "user-2") is False

    def test_custom_with_null_org_is_not_editable(self):
        # Shouldn't occur in practice (custom rows always have org_id), but
        # guard against it producing surprising behaviour.
        c = self._comp(is_custom=True, organization_id=None)
        assert is_editable_by(c, "user-1") is False


# ---------------------------------------------------------------------------
# visible_competencies_stmt — shape check (no DB hit)
# ---------------------------------------------------------------------------


class TestVisibleCompetenciesStmt:
    def test_returns_a_select(self):
        from sqlalchemy import Select
        assert isinstance(visible_competencies_stmt("user-1"), Select)
        assert isinstance(visible_competencies_stmt(None), Select)

    def test_authenticated_clause_contains_both_branches(self):
        # Both branches must appear as WHERE comparisons:
        #   "is_custom IS false"      (seeded branch)
        #   "organization_id = ..."   (user's-org branch)
        # We check normalised lowercase substrings rather than parsing SQL.
        sql = str(
            visible_competencies_stmt("user-abc").compile(compile_kwargs={"literal_binds": True})
        ).lower()
        assert "is_custom is false" in sql
        assert "organization_id = 'user-abc'" in sql

    def test_unauthenticated_clause_only_returns_seeded(self):
        sql = str(
            visible_competencies_stmt(None).compile(compile_kwargs={"literal_binds": True})
        ).lower()
        assert "is_custom is false" in sql
        # No organization_id comparison in the WHERE (column appears in SELECT only)
        assert "organization_id =" not in sql
        assert "organization_id is" not in sql
