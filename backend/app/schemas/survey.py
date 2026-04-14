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
SurveyStatus = Literal["draft", "published"]

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
    respondent_id: str
    scores: dict[str, FactorScoreEntry]  # factor name → score entry


class FactorScoresSummary(BaseModel):
    mean: dict[str, FactorScoreEntry]
    sd: dict[str, float | None]


class FactorScoresResponse(BaseModel):
    survey_id: str
    factors: list[str]
    rows: list[RespondentFactorScores]
    summary: FactorScoresSummary
