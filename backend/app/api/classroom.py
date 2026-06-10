"""
Classroom API — instructor/student course layer.

Roles are course-scoped via Enrollment.role. Management endpoints require an
'instructor' or 'ta' enrollment in the course; read endpoints require any
active membership. Students join a course with its short join code.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.classroom import (
    Course,
    CourseModule,
    Enrollment,
    ModuleCompletion,
    Team,
)
from ..schemas.classroom import (
    AssignTeamRequest,
    CourseCreate,
    CourseOut,
    EnrollmentOut,
    JoinRequest,
    ModuleCreate,
    ModuleOut,
    MyEnrollmentOut,
    TeamCreate,
    TeamMemberOut,
    TeamOut,
)

classroom_router = APIRouter(prefix="/classroom", tags=["classroom"])

# Join codes avoid ambiguous characters (no 0/O, 1/I/L) for easy verbal sharing.
_JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_MANAGER_ROLES = {"instructor", "ta"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _gen_join_code(db: AsyncSession, length: int = 6) -> str:
    """Generate a join code that isn't already in use."""
    for _ in range(20):
        code = "".join(secrets.choice(_JOIN_ALPHABET) for _ in range(length))
        exists = (
            await db.execute(select(Course.id).where(Course.join_code == code))
        ).scalar_one_or_none()
        if not exists:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate a unique join code; please retry.",
    )


async def _membership(
    db: AsyncSession, course_id: str, user_id: str
) -> Enrollment | None:
    return (
        await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course_id,
                Enrollment.user_id == user_id,
                Enrollment.status == "active",
            )
        )
    ).scalar_one_or_none()


async def _require_member(
    db: AsyncSession, course_id: str, user: AuthUser
) -> Enrollment:
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found.")
    member = await _membership(db, course_id, user.user_id)
    if member is None:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course.")
    return member


async def _require_manager(
    db: AsyncSession, course_id: str, user: AuthUser
) -> Enrollment:
    member = await _require_member(db, course_id, user)
    if member.role not in _MANAGER_ROLES:
        raise HTTPException(
            status_code=403, detail="Instructor or TA access required for this action."
        )
    return member


def _course_out(course: Course, my_role: str | None = None, **counts) -> CourseOut:
    return CourseOut(
        id=course.id,
        code=course.code,
        title=course.title,
        term=course.term,
        section=course.section,
        project_title=course.project_title,
        join_code=course.join_code,
        status=course.status,
        created_at=course.created_at,
        my_role=my_role,
        **counts,
    )


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------


@classroom_router.post("/courses", response_model=CourseOut, status_code=201)
async def create_course(
    payload: CourseCreate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> CourseOut:
    """Create a course; the caller becomes its instructor."""
    course = Course(
        instructor_user_id=user.user_id,
        code=payload.code,
        title=payload.title,
        term=payload.term,
        section=payload.section,
        project_title=payload.project_title,
        join_code=await _gen_join_code(db),
    )
    db.add(course)
    await db.flush()
    db.add(
        Enrollment(
            course_id=course.id,
            user_id=user.user_id,
            email=user.email,
            role="instructor",
            status="active",
        )
    )
    await db.commit()
    await db.refresh(course)
    return _course_out(course, my_role="instructor", member_count=1, team_count=0, module_count=0)


@classroom_router.get("/courses", response_model=list[CourseOut])
async def list_my_courses(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> list[CourseOut]:
    """List every course the current user is enrolled in (any role)."""
    rows = (
        await db.execute(
            select(Course, Enrollment.role)
            .join(Enrollment, Enrollment.course_id == Course.id)
            .where(
                Enrollment.user_id == user.user_id,
                Enrollment.status == "active",
            )
            .order_by(Course.created_at.desc())
        )
    ).all()
    return [_course_out(course, my_role=role) for course, role in rows]


@classroom_router.post("/courses/join", response_model=CourseOut)
async def join_course(
    payload: JoinRequest,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> CourseOut:
    """Enroll the current user as a student using a course join code."""
    code = payload.join_code.strip().upper()
    course = (
        await db.execute(select(Course).where(Course.join_code == code))
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="No course found for that join code.")
    if course.status != "active":
        raise HTTPException(status_code=400, detail="This course is no longer accepting enrollments.")

    # Already enrolled by user_id?
    existing = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course.id,
                Enrollment.user_id == user.user_id,
            )
        )
    ).scalar_one_or_none()

    if existing is None and user.email:
        # Claim a roster row pre-added by email (user_id still NULL).
        existing = (
            await db.execute(
                select(Enrollment).where(
                    Enrollment.course_id == course.id,
                    Enrollment.email == user.email,
                    Enrollment.user_id.is_(None),
                )
            )
        ).scalar_one_or_none()

    if existing is None:
        existing = Enrollment(
            course_id=course.id,
            user_id=user.user_id,
            email=user.email,
            name=payload.name,
            role="student",
            status="active",
        )
        db.add(existing)
    else:
        existing.user_id = user.user_id
        existing.status = "active"
        if user.email and not existing.email:
            existing.email = user.email
        if payload.name and not existing.name:
            existing.name = payload.name

    await db.commit()
    await db.refresh(existing)
    return _course_out(course, my_role=existing.role)


@classroom_router.get("/courses/{course_id}", response_model=CourseOut)
async def get_course(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> CourseOut:
    member = await _require_member(db, course_id, user)
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one()
    member_count = (
        await db.execute(
            select(func.count(Enrollment.id)).where(
                Enrollment.course_id == course_id, Enrollment.status == "active"
            )
        )
    ).scalar_one()
    team_count = (
        await db.execute(
            select(func.count(Team.id)).where(Team.course_id == course_id)
        )
    ).scalar_one()
    module_count = (
        await db.execute(
            select(func.count(CourseModule.id)).where(CourseModule.course_id == course_id)
        )
    ).scalar_one()
    return _course_out(
        course,
        my_role=member.role,
        member_count=member_count,
        team_count=team_count,
        module_count=module_count,
    )


@classroom_router.get("/courses/{course_id}/me", response_model=MyEnrollmentOut)
async def get_my_enrollment(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> MyEnrollmentOut:
    """The current user's enrollment, team, and course — the student's entry point."""
    member = await _require_member(db, course_id, user)
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one()

    team_out = None
    if member.team_id:
        team = (
            await db.execute(
                select(Team)
                .where(Team.id == member.team_id)
                .options(selectinload(Team.members))
            )
        ).scalar_one_or_none()
        if team is not None:
            team_out = TeamOut(
                id=team.id,
                course_id=team.course_id,
                name=team.name,
                created_at=team.created_at,
                members=[
                    TeamMemberOut(
                        id=m.id, user_id=m.user_id, name=m.name, email=m.email, role=m.role
                    )
                    for m in team.members
                    if m.status == "active"
                ],
            )

    return MyEnrollmentOut(
        enrollment=EnrollmentOut.model_validate(member),
        team=team_out,
        course=_course_out(course, my_role=member.role),
    )


# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------


@classroom_router.get("/courses/{course_id}/roster", response_model=list[EnrollmentOut])
async def get_roster(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> list[EnrollmentOut]:
    await _require_manager(db, course_id, user)
    rows = (
        await db.execute(
            select(Enrollment)
            .where(Enrollment.course_id == course_id, Enrollment.status != "removed")
            .order_by(Enrollment.role, Enrollment.name)
        )
    ).scalars().all()
    return [EnrollmentOut.model_validate(r) for r in rows]


@classroom_router.post(
    "/courses/{course_id}/enrollments/{enrollment_id}/team", response_model=EnrollmentOut
)
async def assign_team(
    course_id: str,
    enrollment_id: str,
    payload: AssignTeamRequest,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> EnrollmentOut:
    """Assign (or clear) a student's team. Instructor/TA only."""
    await _require_manager(db, course_id, user)
    enrollment = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.id == enrollment_id, Enrollment.course_id == course_id
            )
        )
    ).scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found in this course.")
    if payload.team_id is not None:
        team = (
            await db.execute(
                select(Team).where(Team.id == payload.team_id, Team.course_id == course_id)
            )
        ).scalar_one_or_none()
        if team is None:
            raise HTTPException(status_code=404, detail="Team not found in this course.")
    enrollment.team_id = payload.team_id
    await db.commit()
    await db.refresh(enrollment)
    return EnrollmentOut.model_validate(enrollment)


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------


@classroom_router.post("/courses/{course_id}/teams", response_model=TeamOut, status_code=201)
async def create_team(
    course_id: str,
    payload: TeamCreate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> TeamOut:
    await _require_manager(db, course_id, user)
    team = Team(course_id=course_id, name=payload.name)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamOut(
        id=team.id, course_id=team.course_id, name=team.name, created_at=team.created_at, members=[]
    )


@classroom_router.get("/courses/{course_id}/teams", response_model=list[TeamOut])
async def list_teams(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> list[TeamOut]:
    await _require_member(db, course_id, user)
    teams = (
        await db.execute(
            select(Team)
            .where(Team.course_id == course_id)
            .options(selectinload(Team.members))
            .order_by(Team.name)
        )
    ).scalars().all()
    return [
        TeamOut(
            id=t.id,
            course_id=t.course_id,
            name=t.name,
            created_at=t.created_at,
            members=[
                TeamMemberOut(
                    id=m.id, user_id=m.user_id, name=m.name, email=m.email, role=m.role
                )
                for m in t.members
                if m.status == "active"
            ],
        )
        for t in teams
    ]


# ---------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------


@classroom_router.post("/courses/{course_id}/modules", response_model=ModuleOut, status_code=201)
async def create_module(
    course_id: str,
    payload: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ModuleOut:
    await _require_manager(db, course_id, user)
    module = CourseModule(
        course_id=course_id,
        week_no=payload.week_no,
        topic=payload.topic,
        title=payload.title,
        instrument_id=payload.instrument_id,
        survey_id=payload.survey_id,
        reading_ref=payload.reading_ref,
        concept_json=payload.concept_json,
        prompts_json=payload.prompts_json,
        due_date=payload.due_date,
        order_index=payload.order_index,
        status=payload.status,
    )
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return ModuleOut.model_validate(module)


@classroom_router.get("/courses/{course_id}/modules", response_model=list[ModuleOut])
async def list_modules(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> list[ModuleOut]:
    """List a course's modules; for students, annotates each with `completed`."""
    member = await _require_member(db, course_id, user)
    modules = (
        await db.execute(
            select(CourseModule)
            .where(CourseModule.course_id == course_id)
            .order_by(CourseModule.order_index)
        )
    ).scalars().all()

    done_ids: set[str] = set()
    if member.role == "student":
        done_ids = set(
            (
                await db.execute(
                    select(ModuleCompletion.module_id).where(
                        ModuleCompletion.enrollment_id == member.id,
                        ModuleCompletion.completed_at.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )

    out = []
    for m in modules:
        mo = ModuleOut.model_validate(m)
        if member.role == "student":
            mo.completed = m.id in done_ids
        out.append(mo)
    return out


@classroom_router.post("/courses/{course_id}/modules/{module_id}/complete", response_model=ModuleOut)
async def complete_module(
    course_id: str,
    module_id: str,
    survey_response_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ModuleOut:
    """Mark the current student's completion of a module (idempotent)."""
    member = await _require_member(db, course_id, user)
    module = (
        await db.execute(
            select(CourseModule).where(
                CourseModule.id == module_id, CourseModule.course_id == course_id
            )
        )
    ).scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found in this course.")

    completion = (
        await db.execute(
            select(ModuleCompletion).where(
                ModuleCompletion.module_id == module_id,
                ModuleCompletion.enrollment_id == member.id,
            )
        )
    ).scalar_one_or_none()
    if completion is None:
        completion = ModuleCompletion(
            module_id=module_id,
            enrollment_id=member.id,
            survey_response_id=survey_response_id,
            completed_at=_now(),
        )
        db.add(completion)
    else:
        completion.completed_at = _now()
        if survey_response_id:
            completion.survey_response_id = survey_response_id
    await db.commit()

    mo = ModuleOut.model_validate(module)
    mo.completed = True
    return mo


@classroom_router.get(
    "/courses/{course_id}/modules/{module_id}/completions", response_model=list[EnrollmentOut]
)
async def module_completions(
    course_id: str,
    module_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> list[EnrollmentOut]:
    """Who has completed a given module — the grading/roll-up signal. Manager only."""
    await _require_manager(db, course_id, user)
    rows = (
        await db.execute(
            select(Enrollment)
            .join(ModuleCompletion, ModuleCompletion.enrollment_id == Enrollment.id)
            .where(
                ModuleCompletion.module_id == module_id,
                ModuleCompletion.completed_at.is_not(None),
            )
            .order_by(Enrollment.name)
        )
    ).scalars().all()
    return [EnrollmentOut.model_validate(r) for r in rows]
