"""
Classroom API — instructor/student course layer.

Roles are course-scoped via Enrollment.role. Management endpoints require an
'instructor' or 'ta' enrollment in the course; read endpoints require any
active membership. Students join a course with its short join code.
"""

from __future__ import annotations

import json
import secrets
from collections import defaultdict
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
    ModuleReflection,
    Team,
)
from ..models.survey import Answer, Question, Response, ScoringAlgorithm, Survey
from ..services.classroom_deploy import deploy_module_survey, ensure_module_survey
from ..services.classroom_reports import response_factor_scores
from ..services.scoring import score_answer
from ..schemas.classroom import (
    ApplyTemplateRequest,
    AssignTeamRequest,
    CourseCreate,
    CourseOut,
    EnrollmentOut,
    JoinRequest,
    ModuleCreate,
    ModuleOut,
    MyEnrollmentOut,
    TeamCreate,
    MeasureAnswer,
    MeasureQuestion,
    MeasureSubmit,
    MeasureSubmitOut,
    ModuleMeasureOut,
    ModuleReportOut,
    Recommendation,
    ReflectionOut,
    ReflectionUpdate,
    ReportFactor,
    ReportItem,
    TeamMemberOut,
    TeamMemberStatus,
    TeamModuleStatus,
    TeamOut,
    TemplateOut,
)
from ..services.course_templates import apply_course_template, list_templates

# question_type → (scale_min, scale_max) fallback when no algorithm is present
_QTYPE_SCALE = {"likert_5": (1, 5), "likert_7": (1, 7)}

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
    module_count = 0
    if payload.template:
        try:
            created = await apply_course_template(db, course, payload.template)
            module_count = len(created)
        except KeyError:
            raise HTTPException(
                status_code=400, detail=f"Unknown course template: {payload.template!r}"
            )
    await db.commit()
    await db.refresh(course)
    return _course_out(
        course, my_role="instructor", member_count=1, team_count=0, module_count=module_count
    )


@classroom_router.get("/templates", response_model=list[TemplateOut])
async def get_templates(
    user: AuthUser = Depends(require_user),
) -> list[TemplateOut]:
    """Catalogue of ready-made weekly module sets for the create-course UI."""
    return [TemplateOut(**t) for t in list_templates()]


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


# ---------------------------------------------------------------------------
# Measure taking
# ---------------------------------------------------------------------------


async def _load_module(db: AsyncSession, course_id: str, module_id: str) -> CourseModule:
    module = (
        await db.execute(
            select(CourseModule).where(
                CourseModule.id == module_id, CourseModule.course_id == course_id
            )
        )
    ).scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found in this course.")
    return module


def _derive_scale(questions: list[Question], algos: list[ScoringAlgorithm]) -> tuple[int, int]:
    """
    Recover the per-item response scale (e.g. 1–5, 0–6) from the scoring bounds.
    Each factor algorithm's bounds are n_items × scale, so summing factor bounds
    over the total question count yields the uniform per-item scale.
    """
    factor_algos = [a for a in algos if a.factor_id is not None]
    n = len(questions)
    if factor_algos and n:
        lo = round(sum(a.min_possible for a in factor_algos) / n)
        hi = round(sum(a.max_possible for a in factor_algos) / n)
        if hi > lo:
            return int(lo), int(hi)
    qt = questions[0].question_type if questions else "likert_5"
    return _QTYPE_SCALE.get(qt, (1, 5))


@classroom_router.post("/courses/{course_id}/modules/{module_id}/deploy", response_model=ModuleOut)
async def deploy_module(
    course_id: str,
    module_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ModuleOut:
    """Deploy the module's instrument as a published class survey. Manager only."""
    await _require_manager(db, course_id, user)
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    module = await _load_module(db, course_id, module_id)
    if module.survey_id:
        return ModuleOut.model_validate(module)
    if not module.instrument_id:
        raise HTTPException(status_code=400, detail="This module has no instrument to deploy.")
    try:
        await deploy_module_survey(db, course, module)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    await db.refresh(module)
    return ModuleOut.model_validate(module)


@classroom_router.get(
    "/courses/{course_id}/modules/{module_id}/measure", response_model=ModuleMeasureOut
)
async def get_module_measure(
    course_id: str,
    module_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ModuleMeasureOut:
    """Return the module's survey questions for taking, lazily deploying if needed."""
    member = await _require_member(db, course_id, user)
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    module = await _load_module(db, course_id, module_id)

    survey = await ensure_module_survey(db, course, module)
    if survey is None:
        raise HTTPException(
            status_code=400, detail="No instrument is attached to this module yet."
        )

    questions = (
        await db.execute(
            select(Question)
            .where(Question.survey_id == survey.id)
            .order_by(Question.position)
        )
    ).scalars().all()
    algos = (
        await db.execute(
            select(ScoringAlgorithm).where(ScoringAlgorithm.survey_id == survey.id)
        )
    ).scalars().all()
    scale_min, scale_max = _derive_scale(list(questions), list(algos))

    completion = (
        await db.execute(
            select(ModuleCompletion).where(
                ModuleCompletion.module_id == module_id,
                ModuleCompletion.enrollment_id == member.id,
                ModuleCompletion.completed_at.is_not(None),
            )
        )
    ).scalar_one_or_none()

    def _opts(raw: str | None):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    return ModuleMeasureOut(
        module_id=module.id,
        survey_id=survey.id,
        topic=module.topic,
        week_no=module.week_no,
        reading_ref=module.reading_ref,
        scale_min=scale_min,
        scale_max=scale_max,
        already_completed=completion is not None,
        questions=[
            MeasureQuestion(
                id=q.id,
                text=q.text,
                question_type=q.question_type,
                options=_opts(q.options),
                position=q.position,
                factor=q.factor,
                reverse_scored=q.reverse_scored,
            )
            for q in questions
        ],
    )


@classroom_router.post(
    "/courses/{course_id}/modules/{module_id}/submit", response_model=MeasureSubmitOut
)
async def submit_module_measure(
    course_id: str,
    module_id: str,
    payload: MeasureSubmit,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> MeasureSubmitOut:
    """Record the student's response to the module's measure and log completion."""
    member = await _require_member(db, course_id, user)
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    module = await _load_module(db, course_id, module_id)

    survey = await ensure_module_survey(db, course, module)
    if survey is None:
        raise HTTPException(status_code=400, detail="No instrument is attached to this module yet.")

    questions = {
        q.id: q
        for q in (
            await db.execute(select(Question).where(Question.survey_id == survey.id))
        ).scalars().all()
    }
    if not payload.answers:
        raise HTTPException(status_code=422, detail="No answers submitted.")
    for ans in payload.answers:
        if ans.question_id not in questions:
            raise HTTPException(
                status_code=400, detail=f"Question {ans.question_id} is not part of this measure."
            )

    response = Response(survey_id=survey.id, respondent_ref=member.id)
    db.add(response)
    await db.flush()

    for ans in payload.answers:
        q = questions[ans.question_id]
        legacy = None
        if q.question_type in ("likert_5", "likert_7"):
            try:
                legacy = float(ans.value)
            except ValueError:
                legacy = None
        db.add(
            Answer(
                response_id=response.id,
                question_id=ans.question_id,
                value=ans.value,
                score=legacy,
                numeric_score=score_answer(q, ans.value),
            )
        )

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
            survey_response_id=response.id,
            completed_at=_now(),
        )
        db.add(completion)
    else:
        completion.survey_response_id = response.id
        completion.completed_at = _now()

    await db.commit()
    return MeasureSubmitOut(response_id=response.id, module_id=module_id, completed=True)


# ---------------------------------------------------------------------------
# Report workbook (figures + student-authored synthesis/recommendations)
# ---------------------------------------------------------------------------


@classroom_router.get(
    "/courses/{course_id}/modules/{module_id}/report", response_model=ModuleReportOut
)
async def get_module_report(
    course_id: str,
    module_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ModuleReportOut:
    """The student's own figures for a completed module, plus team averages."""
    member = await _require_member(db, course_id, user)
    module = await _load_module(db, course_id, module_id)
    if not module.survey_id:
        raise HTTPException(status_code=400, detail="This module has no measure yet.")

    completion = (
        await db.execute(
            select(ModuleCompletion).where(
                ModuleCompletion.module_id == module_id,
                ModuleCompletion.enrollment_id == member.id,
                ModuleCompletion.completed_at.is_not(None),
            )
        )
    ).scalar_one_or_none()
    if completion is None or not completion.survey_response_id:
        raise HTTPException(status_code=404, detail="Take the measure first to see your report.")
    response_id = completion.survey_response_id

    questions = list(
        (
            await db.execute(
                select(Question)
                .where(Question.survey_id == module.survey_id)
                .order_by(Question.position)
            )
        ).scalars().all()
    )
    algos = list(
        (
            await db.execute(
                select(ScoringAlgorithm).where(ScoringAlgorithm.survey_id == module.survey_id)
            )
        ).scalars().all()
    )
    scale_min, scale_max = _derive_scale(questions, algos)

    # Teammates' responses for this module (for team averages).
    team_response_ids: list[str] = []
    if member.team_id:
        teammate_ids = (
            await db.execute(
                select(Enrollment.id).where(
                    Enrollment.team_id == member.team_id, Enrollment.status == "active"
                )
            )
        ).scalars().all()
        comps = (
            await db.execute(
                select(ModuleCompletion).where(
                    ModuleCompletion.module_id == module_id,
                    ModuleCompletion.enrollment_id.in_(teammate_ids),
                    ModuleCompletion.completed_at.is_not(None),
                )
            )
        ).scalars().all()
        team_response_ids = [
            c.survey_response_id for c in comps if c.survey_response_id and c.survey_response_id != response_id
        ]

    all_ids = list({response_id, *team_response_ids})
    answers = (
        await db.execute(select(Answer).where(Answer.response_id.in_(all_ids)))
    ).scalars().all()
    by_resp: dict[str, dict[str, float | None]] = defaultdict(dict)
    value_by_qid: dict[str, str] = {}
    for a in answers:
        by_resp[a.response_id][a.question_id] = a.numeric_score
        if a.response_id == response_id:
            value_by_qid[a.question_id] = a.value

    student_factors, composite = response_factor_scores(
        by_resp.get(response_id, {}), questions, scale_min, scale_max
    )

    team_factor_lists: dict[str, list[float]] = defaultdict(list)
    team_composites: list[float] = []
    for rid in team_response_ids:
        f, c = response_factor_scores(by_resp.get(rid, {}), questions, scale_min, scale_max)
        for fn, fd in f.items():
            if fd["normalized"] is not None:
                team_factor_lists[fn].append(fd["normalized"])
        if c is not None:
            team_composites.append(c)
    team_factor_mean = {
        fn: round(sum(v) / len(v), 1) for fn, v in team_factor_lists.items() if v
    }
    team_composite = (
        round(sum(team_composites) / len(team_composites), 1) if team_composites else None
    )

    # factor order = first appearance in the questionnaire
    factor_order: list[str] = []
    seen: set[str] = set()
    for q in questions:
        if q.factor and q.factor not in seen:
            seen.add(q.factor)
            factor_order.append(q.factor)
    factors_out = [
        ReportFactor(
            name=fn,
            raw_mean=student_factors[fn]["raw_mean"],
            normalized=student_factors[fn]["normalized"],
            item_count=student_factors[fn]["item_count"],
            team_mean=team_factor_mean.get(fn),
        )
        for fn in factor_order
        if fn in student_factors
    ]

    items_out = []
    for q in questions:
        raw = value_by_qid.get(q.id)
        num: float | None = None
        if raw is not None:
            try:
                num = float(raw)
            except ValueError:
                num = None
        items_out.append(
            ReportItem(
                question_id=q.id,
                text=q.text,
                value=num,
                factor=q.factor,
                reverse_scored=q.reverse_scored,
            )
        )

    prompts = json.loads(module.prompts_json) if module.prompts_json else {}
    concept = json.loads(module.concept_json) if module.concept_json else {}
    response_row = (
        await db.execute(select(Response).where(Response.id == response_id))
    ).scalar_one_or_none()

    return ModuleReportOut(
        module_id=module.id,
        topic=module.topic,
        week_no=module.week_no,
        reading_ref=module.reading_ref,
        response_id=response_id,
        submitted_at=response_row.submitted_at if response_row else None,
        scale_min=scale_min,
        scale_max=scale_max,
        composite=composite,
        team_composite=team_composite,
        team_n=len(team_response_ids),
        factors=factors_out,
        items=items_out,
        guiding_questions=prompts.get("guiding_questions", []),
        concept_options=prompts.get("concept_options", []),
        lenses=concept.get("lenses", []),
        key_terms=concept.get("key_terms", []),
    )


def _reflection_out(refl: ModuleReflection | None) -> ReflectionOut:
    if refl is None:
        return ReflectionOut(synthesis=None, recommendations=[], updated_at=None)
    recs = []
    if refl.recommendations_json:
        try:
            recs = [Recommendation(**r) for r in json.loads(refl.recommendations_json)]
        except (json.JSONDecodeError, TypeError):
            recs = []
    return ReflectionOut(synthesis=refl.synthesis, recommendations=recs, updated_at=refl.updated_at)


@classroom_router.get(
    "/courses/{course_id}/modules/{module_id}/reflection", response_model=ReflectionOut
)
async def get_reflection(
    course_id: str,
    module_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ReflectionOut:
    member = await _require_member(db, course_id, user)
    refl = (
        await db.execute(
            select(ModuleReflection).where(
                ModuleReflection.module_id == module_id,
                ModuleReflection.enrollment_id == member.id,
            )
        )
    ).scalar_one_or_none()
    return _reflection_out(refl)


@classroom_router.put(
    "/courses/{course_id}/modules/{module_id}/reflection", response_model=ReflectionOut
)
async def put_reflection(
    course_id: str,
    module_id: str,
    payload: ReflectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> ReflectionOut:
    """Save the student's own synthesis and/or recommendations for a module."""
    member = await _require_member(db, course_id, user)
    await _load_module(db, course_id, module_id)
    refl = (
        await db.execute(
            select(ModuleReflection).where(
                ModuleReflection.module_id == module_id,
                ModuleReflection.enrollment_id == member.id,
            )
        )
    ).scalar_one_or_none()
    if refl is None:
        refl = ModuleReflection(module_id=module_id, enrollment_id=member.id)
        db.add(refl)
    if payload.synthesis is not None:
        refl.synthesis = payload.synthesis
    if payload.recommendations is not None:
        refl.recommendations_json = json.dumps(
            [r.model_dump() for r in payload.recommendations], ensure_ascii=False
        )
    refl.updated_at = _now()
    await db.commit()
    await db.refresh(refl)
    return _reflection_out(refl)


@classroom_router.post("/courses/{course_id}/apply-template", response_model=list[ModuleOut])
async def apply_template(
    course_id: str,
    payload: ApplyTemplateRequest,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> list[ModuleOut]:
    """Apply a module template to an existing course (idempotent by week). Manager only."""
    await _require_manager(db, course_id, user)
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one()
    try:
        created = await apply_course_template(db, course, payload.template)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown course template: {payload.template!r}")
    await db.commit()
    for m in created:
        await db.refresh(m)
    return [ModuleOut.model_validate(m) for m in created]


@classroom_router.get(
    "/courses/{course_id}/modules/{module_id}/team-status", response_model=TeamModuleStatus
)
async def team_module_status(
    course_id: str,
    module_id: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_user),
) -> TeamModuleStatus:
    """The requesting student's team's completion of a module (powers the team panel)."""
    member = await _require_member(db, course_id, user)

    if not member.team_id:
        # Solo / unassigned: report just the student's own status.
        own = (
            await db.execute(
                select(ModuleCompletion).where(
                    ModuleCompletion.module_id == module_id,
                    ModuleCompletion.enrollment_id == member.id,
                )
            )
        ).scalar_one_or_none()
        done = own is not None and own.completed_at is not None
        return TeamModuleStatus(
            module_id=module_id,
            team_id=None,
            team_name=None,
            total=1,
            submitted=1 if done else 0,
            members=[
                TeamMemberStatus(
                    enrollment_id=member.id,
                    name=member.name,
                    is_me=True,
                    completed=done,
                    completed_at=own.completed_at if own else None,
                )
            ],
        )

    team = (
        await db.execute(select(Team).where(Team.id == member.team_id))
    ).scalar_one_or_none()
    members = (
        await db.execute(
            select(Enrollment)
            .where(Enrollment.team_id == member.team_id, Enrollment.status == "active")
            .order_by(Enrollment.name)
        )
    ).scalars().all()

    completions = {
        c.enrollment_id: c
        for c in (
            await db.execute(
                select(ModuleCompletion).where(
                    ModuleCompletion.module_id == module_id,
                    ModuleCompletion.enrollment_id.in_([m.id for m in members]),
                )
            )
        ).scalars().all()
    }

    member_statuses = []
    submitted = 0
    for m in members:
        c = completions.get(m.id)
        done = c is not None and c.completed_at is not None
        if done:
            submitted += 1
        member_statuses.append(
            TeamMemberStatus(
                enrollment_id=m.id,
                name=m.name,
                is_me=(m.id == member.id),
                completed=done,
                completed_at=c.completed_at if c else None,
            )
        )

    return TeamModuleStatus(
        module_id=module_id,
        team_id=team.id if team else member.team_id,
        team_name=team.name if team else None,
        total=len(members),
        submitted=submitted,
        members=member_statuses,
    )


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
