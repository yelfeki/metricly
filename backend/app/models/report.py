"""ORM model for AI-generated interpretive reports."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InterpretiveReport(Base):
    """
    Stores one Claude-generated narrative report per survey response.

    Cached after first generation — callers pass force=True to regenerate.
    Both context_json and report_json are stored as JSON text for
    cross-database compatibility.
    """

    __tablename__ = "interpretive_reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    response_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    survey_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    # JSON object: {role, industry, purpose}
    context_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # JSON object: the full interpretive report returned by Claude
    report_json: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)

    def __repr__(self) -> str:
        return f"<InterpretiveReport id={self.id!r} response={self.response_id!r}>"
