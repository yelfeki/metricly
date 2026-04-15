"""
ORM models for the competency framework domain.

Schema:
    Framework         — a named competency model for a role
    Competency        — one skill/competency within a framework
    ProficiencyLevel  — a named performance band (Novice → Expert)
    FrameworkSurvey   — links a survey factor to a competency
    EmployeeProfile   — an employee enrolled in a framework
    CompetencyScore   — one assessed score per employee per competency
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Framework(Base):
    __tablename__ = "frameworks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    role_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    competencies: Mapped[list["Competency"]] = relationship(
        "Competency",
        back_populates="framework",
        cascade="all, delete-orphan",
        order_by="Competency.order_index",
    )
    proficiency_levels: Mapped[list["ProficiencyLevel"]] = relationship(
        "ProficiencyLevel",
        back_populates="framework",
        cascade="all, delete-orphan",
        order_by="ProficiencyLevel.level",
    )
    survey_links: Mapped[list["FrameworkSurvey"]] = relationship(
        "FrameworkSurvey", back_populates="framework", cascade="all, delete-orphan"
    )
    employee_profiles: Mapped[list["EmployeeProfile"]] = relationship(
        "EmployeeProfile", back_populates="framework", cascade="all, delete-orphan"
    )
    pulse_schedules: Mapped[list["PulseSchedule"]] = relationship(
        "PulseSchedule", back_populates="framework", cascade="all, delete-orphan"
    )
    benchmarks: Mapped[list["Benchmark"]] = relationship(
        "Benchmark", back_populates="framework", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Framework id={self.id!r} title={self.title!r}>"


class Competency(Base):
    __tablename__ = "competencies"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    framework_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    framework: Mapped["Framework"] = relationship("Framework", back_populates="competencies")
    survey_links: Mapped[list["FrameworkSurvey"]] = relationship(
        "FrameworkSurvey", back_populates="competency", cascade="all, delete-orphan"
    )
    scores: Mapped[list["CompetencyScore"]] = relationship(
        "CompetencyScore", back_populates="competency", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Competency id={self.id!r} name={self.name!r}>"


class ProficiencyLevel(Base):
    __tablename__ = "proficiency_levels"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    framework_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-based (1=Novice, 5=Expert)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # hex color

    framework: Mapped["Framework"] = relationship("Framework", back_populates="proficiency_levels")

    def __repr__(self) -> str:
        return f"<ProficiencyLevel id={self.id!r} level={self.level} label={self.label!r}>"


class FrameworkSurvey(Base):
    """Links one survey factor to one competency. One link per competency (upsert on create)."""

    __tablename__ = "framework_surveys"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    framework_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    survey_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    competency_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True
    )

    framework: Mapped["Framework"] = relationship("Framework", back_populates="survey_links")
    competency: Mapped["Competency"] = relationship("Competency", back_populates="survey_links")

    def __repr__(self) -> str:
        return f"<FrameworkSurvey competency={self.competency_id!r} survey={self.survey_id!r}>"


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    framework_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    framework: Mapped["Framework"] = relationship("Framework", back_populates="employee_profiles")
    competency_scores: Mapped[list["CompetencyScore"]] = relationship(
        "CompetencyScore", back_populates="employee_profile", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<EmployeeProfile id={self.id!r} name={self.name!r}>"


class CompetencyScore(Base):
    """One row per employee × competency × assessment event."""

    __tablename__ = "competency_scores"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    employee_profile_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("employee_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    competency_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    survey_response_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )  # FK to responses.id — nullable for manually entered scores
    normalized_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0–100
    proficiency_level: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 1–N, derived from normalized_score at submission time
    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    employee_profile: Mapped["EmployeeProfile"] = relationship(
        "EmployeeProfile", back_populates="competency_scores"
    )
    competency: Mapped["Competency"] = relationship("Competency", back_populates="scores")

    def __repr__(self) -> str:
        return (
            f"<CompetencyScore employee={self.employee_profile_id!r} "
            f"competency={self.competency_id!r} score={self.normalized_score}>"
        )


class PulseSchedule(Base):
    """Recurring assessment schedule for a framework."""

    __tablename__ = "pulse_schedules"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    framework_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    survey_id: Mapped[str] = mapped_column(String(36), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)  # weekly/biweekly/monthly
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    framework: Mapped["Framework"] = relationship("Framework", back_populates="pulse_schedules")

    def __repr__(self) -> str:
        return f"<PulseSchedule id={self.id!r} framework={self.framework_id!r} freq={self.frequency!r}>"


class Benchmark(Base):
    """Target score per competency for a role — one row per competency per framework."""

    __tablename__ = "benchmarks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    framework_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    competency_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("competencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    required_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0–100
    required_level: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-based

    framework: Mapped["Framework"] = relationship("Framework", back_populates="benchmarks")
    competency: Mapped["Competency"] = relationship("Competency")

    def __repr__(self) -> str:
        return f"<Benchmark competency={self.competency_id!r} score={self.required_score}>"
