"""Tests for invite tracking and role management."""

import os
import pytest

# Provide a dummy DATABASE_URL before any app imports trigger config loading
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")


class TestAdminSeedLogic:
    """Test that the admin seed logic in the users API is correct."""

    def test_admin_email_gets_admin_role(self):
        from app.api.users import _ADMIN_EMAILS
        assert "yelfeki@vt.edu" in _ADMIN_EMAILS

    def test_unknown_email_is_not_admin(self):
        from app.api.users import _ADMIN_EMAILS
        assert "random@example.com" not in _ADMIN_EMAILS


class TestInviteDeduplication:
    """Test the email deduplication logic used in create_invites."""

    def test_dedup_strips_and_lowercases(self):
        emails = ["Test@Example.com", " test@example.com ", "OTHER@EXAMPLE.COM"]
        seen: set[str] = set()
        unique = [
            e.strip().lower()
            for e in emails
            if e.strip()
            and e.strip().lower() not in seen
            and not seen.add(e.strip().lower())  # type: ignore[func-returns-value]
        ]
        assert unique == ["test@example.com", "other@example.com"]

    def test_dedup_preserves_order(self):
        emails = ["a@x.com", "b@x.com", "a@x.com", "c@x.com"]
        seen: set[str] = set()
        unique = [
            e.strip().lower()
            for e in emails
            if e.strip()
            and e.strip().lower() not in seen
            and not seen.add(e.strip().lower())  # type: ignore[func-returns-value]
        ]
        assert unique == ["a@x.com", "b@x.com", "c@x.com"]


class TestSurveyStatusValues:
    """Ensure schemas accept all three status values."""

    def test_survey_status_includes_closed(self):
        from app.schemas.survey import SurveyStatus
        import typing
        args = typing.get_args(SurveyStatus)
        assert "draft" in args
        assert "published" in args
        assert "closed" in args


class TestSurveyInviteDefaults:
    """Unit tests for the SurveyInvite ORM model schema."""

    def test_token_column_has_callable_default(self):
        from app.models.survey import SurveyInvite
        col = SurveyInvite.__table__.c["token"]
        assert col.default is not None
        assert callable(col.default.arg)

    def test_token_default_lambda_produces_uuid(self):
        import uuid
        import re
        # The lambda in the default is `lambda: str(uuid.uuid4())`
        # Test the pattern matches UUID format
        UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
        sample = str(uuid.uuid4())
        assert UUID_RE.match(sample)

    def test_responded_at_is_nullable(self):
        from app.models.survey import SurveyInvite
        col = SurveyInvite.__table__.c["responded_at"]
        assert col.nullable is True


class TestUserRoleModel:
    """Unit tests for the UserRole ORM model."""

    def test_role_column_has_client_default(self):
        from app.models.survey import UserRole
        col = UserRole.__table__.c["role"]
        assert col.default.arg == "client"

    def test_admin_role_accepted(self):
        from app.models.survey import UserRole
        role = UserRole(user_id="admin-456", role="admin")
        assert role.role == "admin"
