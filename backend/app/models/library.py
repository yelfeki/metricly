"""ORM models for the Assessment Library."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InstrumentCategory(Base):
    __tablename__ = "instrument_categories"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    instruments: Mapped[list["Instrument"]] = relationship(
        "Instrument",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Instrument.name",
    )

    def __repr__(self) -> str:
        return f"<InstrumentCategory id={self.id!r} name={self.name!r}>"


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    category_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("instrument_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    construct_measured: Mapped[str | None] = mapped_column(Text, nullable=True)
    theoretical_framework: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    license_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="open"
    )  # open | public_domain | proprietary
    is_proprietary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scoring_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="mean"
    )  # sum | mean | subscale
    response_format: Mapped[str] = mapped_column(
        String(50), nullable=False, default="likert5"
    )  # likert5 | likert7 | forced_choice | other
    # Stored as JSON strings for cross-database compatibility
    validated_populations: Mapped[str | None] = mapped_column(Text, nullable=True)
    languages: Mapped[str | None] = mapped_column(Text, nullable=True)
    reliability_alpha: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    category: Mapped["InstrumentCategory | None"] = relationship(
        "InstrumentCategory", back_populates="instruments"
    )
    subscales: Mapped[list["InstrumentSubscale"]] = relationship(
        "InstrumentSubscale",
        back_populates="instrument",
        cascade="all, delete-orphan",
        order_by="InstrumentSubscale.name",
    )
    items: Mapped[list["InstrumentItem"]] = relationship(
        "InstrumentItem",
        back_populates="instrument",
        cascade="all, delete-orphan",
        order_by="InstrumentItem.order_index",
    )
    deployments: Mapped[list["LibraryDeployment"]] = relationship(
        "LibraryDeployment", back_populates="instrument", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Instrument id={self.id!r} short_name={self.short_name!r}>"


class InstrumentSubscale(Base):
    __tablename__ = "instrument_subscales"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    instrument_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scoring_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    instrument: Mapped["Instrument"] = relationship("Instrument", back_populates="subscales")
    items: Mapped[list["InstrumentItem"]] = relationship(
        "InstrumentItem", back_populates="subscale"
    )

    def __repr__(self) -> str:
        return f"<InstrumentSubscale id={self.id!r} name={self.name!r}>"


class InstrumentItem(Base):
    __tablename__ = "instrument_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    instrument_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscale_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("instrument_subscales.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    item_text: Mapped[str] = mapped_column(Text, nullable=False)
    item_text_ar: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_reverse_scored: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    scoring_key: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON

    instrument: Mapped["Instrument"] = relationship("Instrument", back_populates="items")
    subscale: Mapped["InstrumentSubscale | None"] = relationship(
        "InstrumentSubscale", back_populates="items"
    )

    def __repr__(self) -> str:
        return f"<InstrumentItem id={self.id!r} order={self.order_index}>"


class LibraryDeployment(Base):
    """Records when a client deploys a library instrument as a survey."""

    __tablename__ = "library_deployments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    instrument_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    survey_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    customization_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    items_included: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of item IDs
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    instrument: Mapped["Instrument"] = relationship("Instrument", back_populates="deployments")

    def __repr__(self) -> str:
        return f"<LibraryDeployment id={self.id!r} instrument={self.instrument_id!r}>"
