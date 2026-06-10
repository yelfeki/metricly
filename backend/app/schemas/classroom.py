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
