"""
ORM models for the Classroom domain — the instructor/student layer that turns
Metricly into a course tool (e.g. PSY 272's "Measuring the Modern Workplace"
group project).

Schema:
    Course           — an instructor-owned class section, with a join code
    Team             — a group of ~5 students within a course
    Enrollment       — a person in a course (student | ta | instructor)
    CourseModule     — one weekly activity (a measure + concept content + due date)
    ModuleCompletion — a student's completion of a module (drives grading + roll-ups)

Design notes:
  - Course membership and role are course-scoped (Enrollment.role), so a user can
    be an instructor in one course and a student in another. The global
    admin/client UserRole is left untouched.
  - survey_id / instrument_id / survey_response_id are stored as plain FK columns
    (no ORM relationship) to keep this module decoupled from the survey domain.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Course(Base):
    """An instructor-owned class section."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    instructor_user_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )  # Supabase auth.users UUID of the creating instructor
    code: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "PSY 272"
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    term: Mapped[str | None] = mapped_column(String(100), nullable=True)  # "Fall 2026"
    section: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "002"
    project_title: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # "Measuring the Modern Workplace"
    join_code: Mapped[str] = mapped_column(
        String(12), nullable=False, unique=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )  # 'active' | 'archived'
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    teams: Mapped[list["Team"]] = relationship(
        "Team", back_populates="course", cascade="all, delete-orphan"
    )
    enrollments: Mapped[list["Enrollment"]] = relationship(
        "Enrollment", back_populates="course", cascade="all, delete-orphan"
    )
    modules: Mapped[list["CourseModule"]] = relationship(
        "CourseModule",
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseModule.order_index",
    )

    def __repr__(self) -> str:
        return f"<Course id={self.id!r} code={self.code!r} join={self.join_code!r}>"


class Team(Base):
    """A student team within a course."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    course: Mapped["Course"] = relationship("Course", back_populates="teams")
    members: Mapped[list["Enrollment"]] = relationship(
        "Enrollment", back_populates="team"
    )

    def __repr__(self) -> str:
        return f"<Team id={self.id!r} name={self.name!r}>"


class Enrollment(Base):
    """A person enrolled in a course (student, TA, or instructor)."""

    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_enrollment_course_user"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )  # Supabase UUID; NULL for roster rows added by email before first login
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="student"
    )  # 'student' | 'ta' | 'instructor'
    team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )  # 'active' | 'invited' | 'removed'
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    course: Mapped["Course"] = relationship("Course", back_populates="enrollments")
    team: Mapped["Team | None"] = relationship("Team", back_populates="members")
    completions: Mapped[list["ModuleCompletion"]] = relationship(
        "ModuleCompletion", back_populates="enrollment", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Enrollment id={self.id!r} user={self.user_id!r} role={self.role!r}>"


class CourseModule(Base):
    """
    One weekly activity in a course's project — binds a measure to course content.

    `concept_json` carries the learning layer (construct definition, why it matters,
    key terms, theory lenses) and `prompts_json` carries the synthesis guiding
    questions + the curated concept-dropdown options for the report workbook.
    """

    __tablename__ = "course_modules"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_no: Mapped[int | None] = mapped_column(Integer, nullable=True)  # course week, e.g. 12
    topic: Mapped[str] = mapped_column(String(255), nullable=False)  # "Stress & well-being"
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instrument_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("instruments.id", ondelete="SET NULL"), nullable=True
    )  # library instrument to deploy
    survey_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("surveys.id", ondelete="SET NULL"), nullable=True
    )  # the deployed survey instance for this course module
    reading_ref: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # e.g. "Levy ch. 11"
    concept_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    prompts_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="scheduled"
    )  # 'scheduled' | 'open' | 'closed'
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    course: Mapped["Course"] = relationship("Course", back_populates="modules")
    completions: Mapped[list["ModuleCompletion"]] = relationship(
        "ModuleCompletion", back_populates="module", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<CourseModule id={self.id!r} wk={self.week_no} topic={self.topic!r}>"


class ModuleCompletion(Base):
    """A student's completion of a module — the graded + roll-up signal."""

    __tablename__ = "module_completions"
    __table_args__ = (
        UniqueConstraint(
            "module_id", "enrollment_id", name="uq_completion_module_enrollment"
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    module_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("course_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enrollment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("enrollments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    survey_response_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("responses.id", ondelete="SET NULL"), nullable=True
    )  # the survey response that satisfied this module
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    module: Mapped["CourseModule"] = relationship(
        "CourseModule", back_populates="completions"
    )
    enrollment: Mapped["Enrollment"] = relationship(
        "Enrollment", back_populates="completions"
    )

    def __repr__(self) -> str:
        return (
            f"<ModuleCompletion module={self.module_id!r} "
            f"enrollment={self.enrollment_id!r} done={self.completed_at is not None}>"
        )


class ModuleReflection(Base):
    """
    A student's own write-up for a module's report workbook — the synthesis they
    author from the figures, plus their evidence-based recommendations. Metricly
    never fills these in; the student does.

    recommendations_json is a JSON array of
    {observation, concept, action, feasibility}.
    """

    __tablename__ = "module_reflections"
    __table_args__ = (
        UniqueConstraint(
            "module_id", "enrollment_id", name="uq_reflection_module_enrollment"
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    module_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("course_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enrollment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("enrollments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    synthesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendations_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<ModuleReflection module={self.module_id!r} enrollment={self.enrollment_id!r}>"
        )
