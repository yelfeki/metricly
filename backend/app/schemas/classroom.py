"""Pydantic request/response schemas for the Classroom domain."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Course
# ---------------------------------------------------------------------------


class CourseCreate(BaseModel):
    code: str = Field(..., max_length=50, examples=["PSY 272"])
    title: str = Field(..., max_length=255)
    term: Optional[str] = Field(None, max_length=100, examples=["Fall 2026"])
    section: Optional[str] = Field(None, max_length=50, examples=["002"])
    project_title: Optional[str] = Field(None, max_length=255)
    # Optional starter pack of weekly modules (e.g. "psy272-modern-workplace").
    template: Optional[str] = Field(None, max_length=64)


class TemplateOut(BaseModel):
    key: str
    name: str
    description: str
    topics: list[str]


class ApplyTemplateRequest(BaseModel):
    template: str = Field(..., max_length=64)


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    title: str
    term: Optional[str] = None
    section: Optional[str] = None
    project_title: Optional[str] = None
    join_code: str
    status: str
    created_at: datetime
    # role of the requesting user in this course (instructor | ta | student)
    my_role: Optional[str] = None
    # convenience counts (populated on detail/list where cheap)
    member_count: Optional[int] = None
    team_count: Optional[int] = None
    module_count: Optional[int] = None


class JoinRequest(BaseModel):
    join_code: str = Field(..., max_length=12)
    name: Optional[str] = Field(None, max_length=255)


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------


class TeamCreate(BaseModel):
    name: str = Field(..., max_length=255)


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str  # enrollment id
    user_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: str


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    name: str
    created_at: datetime
    members: list[TeamMemberOut] = []


# ---------------------------------------------------------------------------
# Enrollment / roster
# ---------------------------------------------------------------------------


class EnrollmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    user_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: str
    team_id: Optional[str] = None
    status: str
    created_at: datetime


class AssignTeamRequest(BaseModel):
    team_id: Optional[str] = None  # None unassigns


# ---------------------------------------------------------------------------
# Course module (weekly activity)
# ---------------------------------------------------------------------------


class ModuleCreate(BaseModel):
    week_no: Optional[int] = None
    topic: str = Field(..., max_length=255)
    title: Optional[str] = Field(None, max_length=255)
    instrument_id: Optional[str] = None
    survey_id: Optional[str] = None
    reading_ref: Optional[str] = Field(None, max_length=255)
    concept_json: Optional[str] = None
    prompts_json: Optional[str] = None
    due_date: Optional[date] = None
    order_index: int = 0
    status: str = "scheduled"


class ModuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    week_no: Optional[int] = None
    topic: str
    title: Optional[str] = None
    instrument_id: Optional[str] = None
    survey_id: Optional[str] = None
    reading_ref: Optional[str] = None
    concept_json: Optional[str] = None
    prompts_json: Optional[str] = None
    due_date: Optional[date] = None
    order_index: int
    status: str
    # populated for the requesting student where relevant
    completed: Optional[bool] = None


# ---------------------------------------------------------------------------
# "My" views — what a student sees
# ---------------------------------------------------------------------------


class MyEnrollmentOut(BaseModel):
    """The current user's enrollment + team within a course."""

    enrollment: EnrollmentOut
    team: Optional[TeamOut] = None
    course: CourseOut


class TeamMemberStatus(BaseModel):
    enrollment_id: str
    name: Optional[str] = None
    is_me: bool = False
    completed: bool = False
    completed_at: Optional[datetime] = None


class TeamModuleStatus(BaseModel):
    """A student's team's completion of one module — powers the dashboard team panel."""

    module_id: str
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    total: int
    submitted: int
    members: list[TeamMemberStatus] = []


# ---------------------------------------------------------------------------
# Measure taking
# ---------------------------------------------------------------------------


class MeasureQuestion(BaseModel):
    id: str
    text: str
    question_type: str
    options: Optional[object] = None  # parsed list/dict for choice types; None for Likert
    position: int
    factor: Optional[str] = None
    reverse_scored: bool = False


class ModuleMeasureOut(BaseModel):
    module_id: str
    survey_id: str
    topic: str
    week_no: Optional[int] = None
    reading_ref: Optional[str] = None
    scale_min: int
    scale_max: int
    already_completed: bool = False
    questions: list[MeasureQuestion] = []


class MeasureAnswer(BaseModel):
    question_id: str
    value: str


class MeasureSubmit(BaseModel):
    answers: list[MeasureAnswer]


class MeasureSubmitOut(BaseModel):
    response_id: str
    module_id: str
    completed: bool = True


# ---------------------------------------------------------------------------
# Report workbook
# ---------------------------------------------------------------------------


class ReportFactor(BaseModel):
    name: str
    raw_mean: Optional[float] = None
    normalized: Optional[float] = None  # 0–100
    item_count: int
    team_mean: Optional[float] = None  # team's mean normalized for this factor


class ReportItem(BaseModel):
    question_id: str
    text: str
    value: Optional[float] = None  # the student's response as a number
    factor: Optional[str] = None
    reverse_scored: bool = False


class ModuleReportOut(BaseModel):
    module_id: str
    topic: str
    week_no: Optional[int] = None
    reading_ref: Optional[str] = None
    response_id: str
    submitted_at: Optional[datetime] = None
    scale_min: int
    scale_max: int
    composite: Optional[float] = None
    team_composite: Optional[float] = None
    team_n: int = 0
    factors: list[ReportFactor] = []
    items: list[ReportItem] = []
    # echoed from the module so the workbook can scaffold the writing
    guiding_questions: list[str] = []
    concept_options: list[str] = []
    lenses: list[str] = []
    key_terms: list[str] = []


class Recommendation(BaseModel):
    observation: Optional[str] = None
    concept: Optional[str] = None
    action: Optional[str] = None
    feasibility: Optional[str] = None


class ReflectionOut(BaseModel):
    synthesis: Optional[str] = None
    recommendations: list[Recommendation] = []
    updated_at: Optional[datetime] = None


class ReflectionUpdate(BaseModel):
    synthesis: Optional[str] = None
    recommendations: Optional[list[Recommendation]] = None


# ---------------------------------------------------------------------------
# Co-edited team report
# ---------------------------------------------------------------------------


class TeamSectionOut(BaseModel):
    synthesis: Optional[str] = None
    recommendations: list[Recommendation] = []
    updated_at: Optional[datetime] = None


class TeamSectionUpdate(BaseModel):
    synthesis: Optional[str] = None
    recommendations: Optional[list[Recommendation]] = None


class TeamReportMember(BaseModel):
    enrollment_id: str
    name: Optional[str] = None
    is_me: bool = False
    completed: bool = False
    composite: Optional[float] = None


class TeamFactorMean(BaseModel):
    name: str
    mean: Optional[float] = None


class MyFactor(BaseModel):
    name: str
    normalized: Optional[float] = None


class TeamReportModule(BaseModel):
    module_id: str
    topic: str
    week_no: Optional[int] = None
    reading_ref: Optional[str] = None
    has_measure: bool = False
    scale_min: int = 1
    scale_max: int = 5
    team_n: int = 0
    team_total: int = 0
    team_composite: Optional[float] = None
    team_factor_means: list[TeamFactorMean] = []
    members: list[TeamReportMember] = []
    my_composite: Optional[float] = None
    my_factors: list[MyFactor] = []
    section: TeamSectionOut = TeamSectionOut()
    concept_options: list[str] = []
    lenses: list[str] = []


class TeamReportOut(BaseModel):
    course_code: str
    course_title: str
    term: Optional[str] = None
    project_title: Optional[str] = None
    team_id: str
    team_name: str
    my_name: Optional[str] = None
    modules: list[TeamReportModule] = []
