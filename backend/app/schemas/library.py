"""Pydantic v2 schemas for the Assessment Library API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------


class InstrumentCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    icon_name: str | None
    order_index: int


# ---------------------------------------------------------------------------
# Subscale
# ---------------------------------------------------------------------------


class InstrumentSubscaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    instrument_id: str
    name: str
    description: str | None
    item_count: int
    scoring_notes: str | None


# ---------------------------------------------------------------------------
# Item
# ---------------------------------------------------------------------------


class InstrumentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    instrument_id: str
    subscale_id: str | None
    item_text: str
    item_text_ar: str | None
    order_index: int
    is_reverse_scored: bool
    scoring_key: str | None


# ---------------------------------------------------------------------------
# Instrument list card
# ---------------------------------------------------------------------------


class InstrumentListItem(BaseModel):
    id: str
    name: str
    short_name: str
    description: str | None
    construct_measured: str | None
    category_id: str | None
    category_name: str | None
    license_type: str
    is_proprietary: bool
    total_items: int
    estimated_minutes: int | None
    scoring_type: str
    response_format: str
    languages: str | None   # JSON array
    reliability_alpha: float | None
    subscale_count: int


# ---------------------------------------------------------------------------
# Full instrument detail
# ---------------------------------------------------------------------------


class InstrumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    category_id: str | None
    name: str
    short_name: str
    description: str | None
    construct_measured: str | None
    theoretical_framework: str | None
    source_citation: str | None
    source_url: str | None
    license_type: str
    is_proprietary: bool
    total_items: int
    estimated_minutes: int | None
    scoring_type: str
    response_format: str
    validated_populations: str | None   # JSON
    languages: str | None               # JSON
    reliability_alpha: float | None
    is_active: bool
    created_at: datetime
    subscales: list[InstrumentSubscaleOut] = []
    items: list[InstrumentItemOut] = []


# ---------------------------------------------------------------------------
# Grouped library response (categories with their instruments)
# ---------------------------------------------------------------------------


class CategoryGroup(BaseModel):
    category: InstrumentCategoryOut
    instruments: list[InstrumentListItem]


class LibraryGrouped(BaseModel):
    total_instruments: int
    categories: list[CategoryGroup]


# ---------------------------------------------------------------------------
# Deploy request/response
# ---------------------------------------------------------------------------


class DeployRequest(BaseModel):
    item_ids: list[str] | None = None          # None = deploy all items
    customization_notes: str | None = None


class DeployResponse(BaseModel):
    deployment_id: str
    survey_id: str
    instrument_id: str
    instrument_name: str
    items_deployed: int
    factors_created: int


# ---------------------------------------------------------------------------
# Admin — create instrument
# ---------------------------------------------------------------------------


class InstrumentCreate(BaseModel):
    name: str
    short_name: str
    description: str | None = None
    construct_measured: str | None = None
    theoretical_framework: str | None = None
    source_citation: str | None = None
    source_url: str | None = None
    license_type: str = "open"
    is_proprietary: bool = False
    total_items: int = 0
    estimated_minutes: int | None = None
    scoring_type: str = "mean"
    response_format: str = "likert5"
    validated_populations: str | None = None
    languages: str | None = None
    reliability_alpha: float | None = None
    category_id: str | None = None


class InstrumentItemCreate(BaseModel):
    item_text: str
    item_text_ar: str | None = None
    order_index: int = 0
    is_reverse_scored: bool = False
    scoring_key: str | None = None
    subscale_id: str | None = None
