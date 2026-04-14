"""Pydantic v2 schemas for the survey builder API."""

import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# ---------------------------------------------------------------------------
# Shared literals
# ---------------------------------------------------------------------------

QuestionType = Literal[
    "text",
    "single_choice",
    "multiple_choice",
    "likert_5",
    "likert_7",
    "forced_choice",
    "ranking",
]
SurveyStatus = Literal["draft", "published", "closed"]

# ---------------------------------------------------------------------------
# Forced-choice sub-config
# ---------------------------------------------------------------------------


class ForcedChoiceConfig(BaseModel):
    """Items to compare + the two labels assigned by the respondent."""

    items: list[str]   # ≥ 2 statements to evaluate
    labels: list[str]  # exactly 2, e.g. ["Most like me", "Least like me"]


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class QuestionCreate(BaseModel):
    text: str
    question_type: QuestionType = "likert_5"
    # For single_choice / multiple_choice / ranking:
    options: list[str] | None = None
    # For forced_choice only:
    forced_choice_config: ForcedChoiceConfig | None = None
    position: int
    # v0.4 psychometric fields
    factor: str | None = None
    reverse_scored: bool = False
    score_weight: float = 1.0
    # option text → numeric score (single/multiple choice) or item → weight (forced choice)
    option_scores: dict[str, float] | None = None
    # v0.6 demographic fields
    is_demographic: bool = False
    demographic_key: str | None = None

    @model_validator(mode="after")
    def validate_by_type(self) -> "QuestionCreate":
        qt = self.question_type
        if qt in ("single_choice", "multiple_choice", "ranking"):
            if not self.options or len(self.options) < 2:
                raise ValueError(f"{qt} requires at least 2 options.")
        elif qt == "forced_choice":
            cfg = self.forced_choice_config
            if not cfg:
                raise ValueError("forced_choice requires a forced_choice_config.")
            if len(cfg.items) < 2:
                raise ValueError("forced_choice requires at least 2 items.")
            if len(cfg.labels) != 2:
                raise ValueError("forced_choice requires exactly 2 labels.")
        return self


class SurveyCreate(BaseModel):
    name: str
    description: str | None = None
    status: SurveyStatus = "draft"
    questions: list[QuestionCreate] = []


class SurveyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: SurveyStatus | None = None


class QuestionUpdate(BaseModel):
    text: str | None = None
    question_type: QuestionType | None = None
    options: list[str] | None = None
    forced_choice_config: ForcedChoiceConfig | None = None
    position: int | None = None
    # v0.4 psychometric fields — None means "don't touch"
    factor: str | None = None
    reverse_scored: bool | None = None
    score_weight: float | None = None
    option_scores: dict[str, float] | None = None
    # v0.6 demographic fields
    is_demographic: bool | None = None
    demographic_key: str | None = None


class AnswerSubmit(BaseModel):
    question_id: str
    # Likert   → "3"
    # text     → free text
    # single   → "Option A"
    # multi    → '["A","C"]'
    # ranking  → '["B","A","C"]'  (ordered best → worst)
    # forced   → '{"Most like me":"Item A","Least like me":"Item B"}'
    value: str


class ResponseSubmit(BaseModel):
    answers: list[AnswerSubmit]
    respondent_ref: str | None = None


# ---------------------------------------------------------------------------
# Factor schemas
# ---------------------------------------------------------------------------


class SurveyFactorCreate(BaseModel):
    name: str
    description: str | None = None


class SurveyFactorUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class SurveyFactorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    survey_id: str
    name: str
    description: str | None


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


def _parse_options(v: Any) -> Any:
    """Parse the DB text field into list[str] or dict (for forced_choice)."""
    if isinstance(v, str):
        return json.loads(v)
    return v


def _parse_option_scores(v: Any) -> Any:
    """Parse the DB text field into dict[str, float] or None."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return None
    return v


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    survey_id: str
    text: str
    question_type: str
    # list[str] for choice/ranking, {"items":[...],"labels":[...]} for forced_choice
    options: Any
    position: int
    # v0.4 psychometric fields
    factor: str | None = None
    reverse_scored: bool = False
    score_weight: float = 1.0
    option_scores: Any = None  # dict[str, float] | None
    # v0.6 demographic fields
    is_demographic: bool = False
    demographic_key: str | None = None

    @field_validator("options", mode="before")
    @classmethod
    def parse_options_json(cls, v: Any) -> Any:
        return _parse_options(v)

    @field_validator("option_scores", mode="before")
    @classmethod
    def parse_option_scores_json(cls, v: Any) -> Any:
        return _parse_option_scores(v)


class SurveyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    status: str
    created_at: datetime
    questions: list[QuestionOut]
    response_count: int = 0


class SurveyListItem(BaseModel):
    id: str
    name: str
    description: str | None
    status: str
    created_at: datetime
    response_count: int


class ResponseOut(BaseModel):
    id: str
    survey_id: str
    respondent_ref: str | None
    submitted_at: datetime


# ---------------------------------------------------------------------------
# Results schemas
# ---------------------------------------------------------------------------


class QuestionStat(BaseModel):
    question_id: str
    text: str
    question_type: str
    n: int
    mean: float | None = None
    std: float | None = None
    distribution: dict[str, int]        # value/option → count (all types except ranking)
    text_values: list[str] | None = None            # text questions
    ranking_averages: dict[str, float] | None = None  # ranking: item → avg rank (1-based)


class SurveyResults(BaseModel):
    survey_id: str
    survey_name: str
    response_count: int
    questions: list[QuestionStat]


# ---------------------------------------------------------------------------
# Scoring algorithm schemas
# ---------------------------------------------------------------------------


class LabelThreshold(BaseModel):
    threshold: float  # 0–100 on the normalized scale
    label: str
    color: str        # CSS color string, e.g. "#22c55e"


class ScoringAlgorithmCreate(BaseModel):
    factor_id: str | None = None  # NULL = composite/whole-survey score
    min_possible: float
    max_possible: float
    normalized_min: float = 0.0
    normalized_max: float = 100.0
    labels: list[LabelThreshold] | None = None


class ScoringAlgorithmUpdate(BaseModel):
    min_possible: float | None = None
    max_possible: float | None = None
    normalized_min: float | None = None
    normalized_max: float | None = None
    labels: list[LabelThreshold] | None = None


class ScoringAlgorithmOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    survey_id: str
    factor_id: str | None
    min_possible: float
    max_possible: float
    normalized_min: float
    normalized_max: float
    labels: list[LabelThreshold] | None = None
    created_at: datetime

    @field_validator("labels", mode="before")
    @classmethod
    def parse_labels_json(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return v


# ---------------------------------------------------------------------------
# Factor scores schemas
# ---------------------------------------------------------------------------


class FactorScoreEntry(BaseModel):
    raw_mean: float | None
    normalized: float | None = None
    label: str | None = None
    color: str | None = None


class RespondentFactorScores(BaseModel):
    response_id: str           # actual UUID — for deep-linking to the report
    respondent_id: str         # display label (respondent_ref or id[:8])
    scores: dict[str, FactorScoreEntry]  # factor name → score entry


class FactorScoresSummary(BaseModel):
    mean: dict[str, FactorScoreEntry]
    sd: dict[str, float | None]


class FactorScoresResponse(BaseModel):
    survey_id: str
    factors: list[str]
    rows: list[RespondentFactorScores]
    summary: FactorScoresSummary


# ---------------------------------------------------------------------------
# Participant report schemas
# ---------------------------------------------------------------------------


class AnswerReport(BaseModel):
    question_id: str
    question_text: str
    factor: str | None
    value: str          # raw answer string
    raw_score: float | None
    normalized: float | None
    label: str | None
    color: str | None
    reverse_scored: bool


class FactorReport(BaseModel):
    factor_name: str
    item_count: int
    raw_mean: float | None
    normalized: float | None
    label: str | None
    color: str | None


class CompositeReport(BaseModel):
    normalized: float | None
    label: str | None
    color: str | None


class ParticipantReport(BaseModel):
    survey_id: str
    survey_title: str
    survey_description: str | None
    response_id: str
    respondent_ref: str | None
    submitted_at: datetime
    answers: list[AnswerReport]
    factors: list[FactorReport]
    composite: CompositeReport


# ---------------------------------------------------------------------------
# Dashboard / cohort analytics schemas
# ---------------------------------------------------------------------------


class HistogramBin(BaseModel):
    start: float
    end: float
    count: int


class FactorDistribution(BaseModel):
    factor_name: str
    mean: float | None
    sd: float | None
    min: float | None
    max: float | None
    n: int
    histogram: list[HistogramBin]
    label: str | None
    color: str | None


class DashboardResponse(BaseModel):
    survey_id: str
    response_count: int
    date_range_start: datetime | None
    date_range_end: datetime | None
    average_composite: float | None
    composite_label: str | None
    composite_color: str | None
    factor_distributions: list[FactorDistribution]   # sorted by mean desc
    composite_histogram: list[HistogramBin]
    demographic_keys: list[str]


# ---------------------------------------------------------------------------
# Group comparison schemas
# ---------------------------------------------------------------------------


class GroupStats(BaseModel):
    group_value: str
    n: int
    mean: float | None
    sd: float | None


class FactorGroupComparison(BaseModel):
    factor_name: str
    groups: list[GroupStats]
    test_type: str | None
    p_value: float | None
    significant: bool
    effect_size: float | None
    effect_size_type: str | None
    interpretation: str


class GroupComparisonResponse(BaseModel):
    survey_id: str
    demographic_key: str
    group_values: list[str]
    factors: list[FactorGroupComparison]


# ---------------------------------------------------------------------------
# Respondents table schemas
# ---------------------------------------------------------------------------


class RespondentRow(BaseModel):
    response_id: str
    respondent_ref: str | None
    submitted_at: datetime
    composite_score: float | None
    composite_label: str | None
    composite_color: str | None
    factor_scores: dict[str, FactorScoreEntry]
    demographics: dict[str, str]


class RespondentsResponse(BaseModel):
    survey_id: str
    total: int
    page: int
    page_size: int
    rows: list[RespondentRow]


# ---------------------------------------------------------------------------
# Survey stats (response rate tracking)
# ---------------------------------------------------------------------------


class SurveyStats(BaseModel):
    survey_id: str
    total_invited: int
    total_responded: int
    response_rate: float  # 0.0–100.0
    last_response_at: datetime | None
    avg_completion_time_seconds: float | None  # not yet tracked — always None


# ---------------------------------------------------------------------------
# Invite schemas
# ---------------------------------------------------------------------------


class InviteCreate(BaseModel):
    emails: list[str]


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    survey_id: str
    email: str
    token: str
    invited_at: datetime
    responded_at: datetime | None
    respond_url: str  # computed, not stored


# ---------------------------------------------------------------------------
# Role schemas
# ---------------------------------------------------------------------------


class RoleOut(BaseModel):
    user_id: str
    role: str  # 'admin' | 'client'
