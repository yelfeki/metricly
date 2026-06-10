"""ORM models for the Competency Framework Database.

Separate from the existing 'frameworks' / 'competencies' tables (which are the
user-built competency frameworks in Sprint 2). These models store the curated
psychological/behavioural competency libraries (Korn Ferry, O*NET, Core Behavioral)
that power the straw man assessment blueprint generator.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CompetencyFramework(Base):
    """Top-level framework: Korn Ferry Leadership Architect, O*NET, etc."""

    __tablename__ = "competency_frameworks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    competencies: Mapped[list["CompetencyDefinition"]] = relationship(
        "CompetencyDefinition",
        back_populates="framework",
        cascade="all, delete-orphan",
        order_by="CompetencyDefinition.factor, CompetencyDefinition.cluster, CompetencyDefinition.name",
    )

    def __repr__(self) -> str:
        return f"<CompetencyFramework id={self.id!r} name={self.name!r}>"


class CompetencyDefinition(Base):
    """A single competency within a framework (e.g. 'Drives Results').

    Grouping fields:
      * `factor`     — top-level grouping for KF (Thought / Results / People / Self). NULL elsewhere.
      * `category`   — top-level grouping for O*NET (Content Skills, Process Skills, …). NULL elsewhere.
      * `role_family`— top-level grouping for the Role-Family Competency Library
                       (Sales, Technical/Engineering, …). NULL for KF / O*NET / Core Behavioral.
      * `cluster`    — *sub-group within the parent dimension*.
                       For KF: sub-group within `factor` (e.g. "Business Insight" within "Thought").
                       For Role-Family: sub-group within `role_family` (e.g. "Customer Engagement"
                       within "Sales"). Capped at 3–4 distinct clusters per parent.
                       Not used by O*NET or Core Behavioral.

    `framework_source` is a per-competency citation pointing at the specific source
    competency in the originating framework (e.g. "O*NET Skill 2.B.5.a — Troubleshooting").
    NULL when no specific named source can be honestly cited.

    Custom-competency fields:
      * `organization_id`      — access scope. Populated with user_id until the
                                 Organization model ships. Treat this as the
                                 org scope key; do NOT use it as an audit-trail
                                 field. `created_by_user_id` exists separately
                                 for that.
      * `created_by_user_id`   — audit trail. Who created this row. NULL for
                                 seeded library competencies. Same value as
                                 `organization_id` today; will diverge when orgs ship.
      * `is_custom`            — true when org-created; false when seeded.
      * `status`               — 'active' | 'draft' | 'archived'.
                                 Draft = missing proficiency levels or behavioural
                                 indicators (derived at write time in
                                 services.competency_visibility.derive_status).

    Visibility rule (canonical):
        WHERE is_custom = FALSE                       -- seeded; visible to all
           OR organization_id = <current_user_id>     -- custom in user's org
      Encapsulated in services.competency_visibility.visible_competencies_stmt.
      NEVER inline this OR clause elsewhere — call the helper.

    We considered a `scope` enum (global / organization / user) for v1 and
    decided against. `organization_id IS NULL` already encodes 'global', and
    a user-scoped tier wasn't needed. Documented here so we don't re-litigate.
    """

    __tablename__ = "competency_definitions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    framework_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("competency_frameworks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    cluster: Mapped[str | None] = mapped_column(String(255), nullable=True)
    factor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_family: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    framework_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_leadership: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_technical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Custom-competency fields — see class docstring for full rationale.
    organization_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    created_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    framework: Mapped["CompetencyFramework"] = relationship(
        "CompetencyFramework", back_populates="competencies"
    )
    proficiency_levels: Mapped[list["CompetencyProficiencyLevel"]] = relationship(
        "CompetencyProficiencyLevel",
        back_populates="competency",
        cascade="all, delete-orphan",
        order_by="CompetencyProficiencyLevel.level",
    )
    instrument_mappings: Mapped[list["CompetencyInstrumentMapping"]] = relationship(
        "CompetencyInstrumentMapping",
        back_populates="competency",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CompetencyDefinition id={self.id!r} name={self.name!r}>"


class CompetencyProficiencyLevel(Base):
    """5-level behavioural rubric anchored to a competency."""

    __tablename__ = "competency_proficiency_levels"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    competency_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("competency_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–5
    label: Mapped[str] = mapped_column(String(100), nullable=False)  # Novice … Expert
    # Optional free-text descriptor for this level (populated for custom competencies;
    # NULL for seeded library rows, which carry their content via indicators/examples).
    descriptor: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stored as JSON arrays (TEXT for cross-DB compat)
    behavioral_indicators: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_behaviors: Mapped[str | None] = mapped_column(Text, nullable=True)

    competency: Mapped["CompetencyDefinition"] = relationship(
        "CompetencyDefinition", back_populates="proficiency_levels"
    )

    def __repr__(self) -> str:
        return f"<CompetencyProficiencyLevel competency={self.competency_id!r} level={self.level}>"


class CompetencyInstrumentMapping(Base):
    """Link between a competency and a Metricly library instrument."""

    __tablename__ = "competency_instrument_mappings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    competency_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("competency_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    instrument_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("instruments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mapping_strength: Mapped[str] = mapped_column(
        String(50), nullable=False, default="supporting"
    )  # primary | supporting
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    subscale_focus: Mapped[str | None] = mapped_column(String(255), nullable=True)

    competency: Mapped["CompetencyDefinition"] = relationship(
        "CompetencyDefinition", back_populates="instrument_mappings"
    )

    def __repr__(self) -> str:
        return (
            f"<CompetencyInstrumentMapping "
            f"competency={self.competency_id!r} instrument={self.instrument_id!r} "
            f"strength={self.mapping_strength!r}>"
        )
