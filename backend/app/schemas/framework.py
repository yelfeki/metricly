"""Pydantic v2 schemas for the competency framework and gap analysis API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Competency
# ---------------------------------------------------------------------------


class CompetencyCreate(BaseModel):
    name: str
    description: str | None = None
    order_index: int = 0


class CompetencyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    order_index: int | None = None


class CompetencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    framework_id: str
    name: str
    description: str | None
    order_index: int


# ---------------------------------------------------------------------------
# Proficiency Levels
# ---------------------------------------------------------------------------


class ProficiencyLevelCreate(BaseModel):
    level: int  # 1-based (1 = Novice, 5 = Expert)
    label: str
    description: str | None = None
    color: str | None = None  # hex e.g. "#22c55e"

    @field_validator("level")
    @classmethod
    def level_in_range(cls, v: int) -> int:
        if not (1 <= v <= 10):
            raise ValueError("level must be between 1 and 10")
        return v


class ProficiencyLevelUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None


class ProficiencyLevelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    framework_id: str
    level: int
    label: str
    description: str | None
    color: str | None


# ---------------------------------------------------------------------------
# Framework Survey Link
# ---------------------------------------------------------------------------


class FrameworkSurveyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    framework_id: str
    survey_id: str
    competency_id: str


class LinkSurveyRequest(BaseModel):
    survey_id: str
    competency_id: str


# ---------------------------------------------------------------------------
# Framework
# ---------------------------------------------------------------------------


class FrameworkCreate(BaseModel):
    title: str
    description: str | None = None
    role_title: str | None = None


class FrameworkUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    role_title: str | None = None


class FrameworkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    title: str
    description: str | None
    role_title: str | None
    created_at: datetime
    competencies: list[CompetencyOut] = []
    proficiency_levels: list[ProficiencyLevelOut] = []
    survey_links: list[FrameworkSurveyOut] = []


class FrameworkListItem(BaseModel):
    id: str
    title: str
    description: str | None
    role_title: str | None
    created_at: datetime
    competency_count: int = 0


# ---------------------------------------------------------------------------
# Employee Profiles
# ---------------------------------------------------------------------------


class EmployeeProfileCreate(BaseModel):
    name: str
    email: str | None = None
    department: str | None = None
    role_title: str | None = None


class EmployeeProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    framework_id: str
    name: str
    email: str | None
    department: str | None
    role_title: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Competency Scores
# ---------------------------------------------------------------------------


class CompetencyScoreCreate(BaseModel):
    competency_id: str
    survey_response_id: str | None = None
    normalized_score: float  # 0–100

    @field_validator("normalized_score")
    @classmethod
    def score_in_range(cls, v: float) -> float:
        if not (0.0 <= v <= 100.0):
            raise ValueError("normalized_score must be between 0 and 100")
        return v


class CompetencyScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    employee_profile_id: str
    competency_id: str
    survey_response_id: str | None
    normalized_score: float
    proficiency_level: int | None
    assessed_at: datetime


# ---------------------------------------------------------------------------
# Gap Analysis outputs
# ---------------------------------------------------------------------------


class CompetencyGap(BaseModel):
    competency_id: str
    competency_name: str
    required_level: int
    required_score: float    # normalized score threshold for required level (0-100)
    actual_score: float | None
    actual_level: int | None
    gap: float | None        # required_score - actual_score; positive = gap exists
    priority: bool           # True when gap > 20 points


class GapReport(BaseModel):
    employee_id: str
    employee_name: str
    framework_id: str
    framework_title: str
    overall_readiness: float  # 0–100 percentage
    gaps: list[CompetencyGap]
    top_priorities: list[CompetencyGap]  # up to 3, sorted by gap desc


class CompetencyTeamStats(BaseModel):
    competency_id: str
    competency_name: str
    mean_score: float | None
    level_distribution: dict[str, float]  # "1" → % of team at that level
    critical: bool                         # True when >50% of team below required level


class TeamHeatmapRow(BaseModel):
    employee_id: str
    employee_name: str
    scores: dict[str, int | None]  # competency_id → proficiency_level (or None)


class TeamGapReport(BaseModel):
    framework_id: str
    framework_title: str
    employee_count: int
    competency_stats: list[CompetencyTeamStats]
    heatmap: list[TeamHeatmapRow]
    critical_gaps: list[CompetencyTeamStats]
