"""
Deploy a course module's library instrument into a per-course survey.

Unlike the general library deploy (which creates a *draft* survey owned by the
deploying user), a classroom survey is created **published** and owned by the
course instructor, so enrolled students — who are not the owner — can read the
questions and submit responses. One survey is shared by the whole class for a
given module; `CourseModule.survey_id` points to it.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.classroom import Course, CourseModule
from ..models.library import Instrument
from ..models.survey import Question, ScoringAlgorithm, Survey, SurveyFactor
from .library import build_survey_spec


async def deploy_module_survey(
    db: AsyncSession, course: Course, module: CourseModule
) -> Survey:
    """
    Materialize a published, instructor-owned survey for `module` from its bound
    instrument, set `module.survey_id`, and return the Survey. Does NOT commit —
    the caller owns the transaction. Idempotent at the call site: only invoke
    when `module.instrument_id` is set and `module.survey_id` is not.
    """
    if not module.instrument_id:
        raise ValueError("Module has no instrument to deploy.")

    instrument = (
        await db.execute(
            select(Instrument)
            .options(
                selectinload(Instrument.subscales),
                selectinload(Instrument.items),
            )
            .where(Instrument.id == module.instrument_id)
        )
    ).scalar_one_or_none()
    if instrument is None:
        raise ValueError("Bound instrument not found.")

    spec = build_survey_spec(
        instrument=instrument,
        items=instrument.items,
        subscales=instrument.subscales,
        item_ids=None,
    )

    survey = Survey(
        name=f"{course.code} · {module.topic}",
        description=spec["survey_description"],
        status="published",  # students (non-owners) can read + submit
        user_id=course.instructor_user_id,
    )
    db.add(survey)
    await db.flush()

    for factor_spec in spec["factors"]:
        factor = SurveyFactor(
            survey_id=survey.id,
            name=factor_spec["name"],
            description=factor_spec["description"],
        )
        db.add(factor)
        await db.flush()

        for item_spec in factor_spec["items"]:
            db.add(
                Question(
                    survey_id=survey.id,
                    text=item_spec["text"],
                    question_type=spec["question_type"],
                    position=item_spec["position"],
                    factor=factor_spec["name"],
                    reverse_scored=item_spec["reverse_scored"],
                    score_weight=1.0,
                )
            )

        db.add(
            ScoringAlgorithm(
                survey_id=survey.id,
                factor_id=factor.id,
                min_possible=factor_spec["min_possible"],
                max_possible=factor_spec["max_possible"],
                normalized_min=0.0,
                normalized_max=100.0,
            )
        )

    module.survey_id = survey.id
    return survey


async def ensure_module_survey(
    db: AsyncSession, course: Course, module: CourseModule
) -> Survey | None:
    """
    Return the module's survey, lazily deploying it if an instrument is bound but
    no survey exists yet. Returns None if the module has no instrument. Commits
    when it deploys.
    """
    if module.survey_id:
        return (
            await db.execute(select(Survey).where(Survey.id == module.survey_id))
        ).scalar_one_or_none()
    if not module.instrument_id:
        return None
    survey = await deploy_module_survey(db, course, module)
    await db.commit()
    await db.refresh(module)
    return survey
