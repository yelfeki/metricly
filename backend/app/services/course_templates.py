"""
Course templates — ready-made weekly module sets an instructor can apply to a
new course in one click.

The flagship template is PSY 272's "Measuring the Modern Workplace" group
project: five weekly measures, each pre-loaded with the construct definition,
why it matters, the course reading, the I-O theory lenses students interpret
with, and the recommendation-builder concept options — the learning layer.

Each module references a library instrument by `short_name`; `apply_course_template`
resolves those to instrument ids at apply time (a NULL instrument is a gap the
instructor fills in later, e.g. a Diversity & Inclusion climate scale).
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.classroom import Course, CourseModule

# ---------------------------------------------------------------------------
# Template definitions
# ---------------------------------------------------------------------------

PSY272_MODULES = [
    {
        "week_no": 11,
        "topic": "Job attitudes",
        "instrument_short_name": "UWES-9",
        "reading_ref": "Levy ch. 10",
        "concept": {
            "definition": (
                "Job attitudes are how people evaluate their work — above all job "
                "satisfaction, organizational commitment, and work engagement. This "
                "week you measure engagement: its vigor, dedication, and absorption."
            ),
            "why_it_matters": (
                "Attitudes predict effort, citizenship, and turnover. Engagement is the "
                "energized, absorbed face of a positive job attitude — and one of the "
                "most studied outcomes in I-O psychology."
            ),
            "lenses": ["Job Characteristics Model", "Satisfaction & commitment"],
            "key_terms": ["Engagement", "Vigor", "Dedication", "Absorption", "Affective commitment"],
        },
        "prompts": {
            "guiding_questions": [
                "Which engagement facet — vigor, dedication, or absorption — stands out, and is it high or low?",
                "Through the Job Characteristics Model, which core job dimension (autonomy, skill variety, task significance, feedback) might explain that facet?",
                "How does your engagement profile compare with your team's average?",
            ],
            "concept_options": [
                "Job Characteristics Model",
                "Skill variety",
                "Task significance",
                "Autonomy",
                "Feedback",
                "Affective commitment",
            ],
        },
    },
    {
        "week_no": 12,
        "topic": "Stress & well-being",
        "instrument_short_name": "PSS-10",
        "reading_ref": "Levy ch. 11",
        "concept": {
            "definition": (
                "Perceived stress is the degree to which you appraise the demands in "
                "your life as exceeding your ability to cope. It isn't the events "
                "themselves — it's your read on whether they're manageable."
            ),
            "why_it_matters": (
                "In the Job Demands–Resources model, unbuffered demands produce strain. "
                "Perceived stress is one clear window onto that strain side of work."
            ),
            "lenses": ["Job Demands–Resources", "Demand–Control (Karasek)", "Appraisal & coping"],
            "key_terms": ["Perceived stress", "Appraisal", "Coping", "Strain", "Job demands"],
        },
        "prompts": {
            "guiding_questions": [
                "What's the headline pattern — which band, and is it driven by feeling overwhelmed or feeling out of control?",
                "Through the Job Demands–Resources lens, are your demands outrunning your resources, or is it a control problem (Demand–Control)?",
                "How does your score sit against your team, and what might explain the gap?",
            ],
            "concept_options": [
                "Job Demands–Resources",
                "Demand–Control (Karasek)",
                "Appraisal & coping",
                "Recovery & detachment",
                "Social support",
                "Job design (JCM)",
            ],
        },
    },
    {
        "week_no": 13,
        "topic": "Work teams",
        "instrument_short_name": "TPS-7",
        "reading_ref": "Levy ch. 12",
        "concept": {
            "definition": (
                "Team psychological safety is the shared belief that a team is safe for "
                "interpersonal risk-taking — speaking up, admitting mistakes, asking "
                "questions without fear of being punished or embarrassed."
            ),
            "why_it_matters": (
                "Psychological safety is one of the strongest predictors of team learning, "
                "voice, and performance. This week you rate it for a team you're on."
            ),
            "lenses": ["Psychological safety (Edmondson)", "Process vs. outcome", "Cohesion"],
            "key_terms": ["Psychological safety", "Voice", "Team cohesion", "Team process", "Norms"],
        },
        "prompts": {
            "guiding_questions": [
                "How safe does your team feel for speaking up, and which item drove that read?",
                "Using Edmondson's psychological-safety idea, what team behavior does your score predict (voice, learning, error-reporting)?",
                "Where does your rating sit relative to your teammates' — do you see the team the same way?",
            ],
            "concept_options": [
                "Psychological safety",
                "Team cohesion",
                "Process losses",
                "Team norms",
                "Shared mental models",
                "Conflict (task vs. relationship)",
            ],
        },
    },
    {
        "week_no": 15,
        "topic": "Leadership",
        "instrument_short_name": "LMX-7",
        "reading_ref": "Levy ch. 13",
        "concept": {
            "definition": (
                "Leader–Member Exchange (LMX) describes the quality of the working "
                "relationship between an employee and their direct leader — from a "
                "low-quality 'out-group' tie to a high-quality 'in-group' partnership."
            ),
            "why_it_matters": (
                "LMX predicts satisfaction, performance, and turnover. This week you rate "
                "the relationship with a current or past manager."
            ),
            "lenses": ["Leader–Member Exchange (LMX)", "In-group / out-group"],
            "key_terms": ["LMX", "In-group", "Out-group", "Trust", "Reciprocity"],
        },
        "prompts": {
            "guiding_questions": [
                "Is your relationship closer to high-LMX (in-group) or low-LMX (out-group), and which item shows it?",
                "What does LMX theory predict for someone with your score — access, support, effort, advancement?",
                "How does your LMX compare with your teammates' relationships with their own leaders?",
            ],
            "concept_options": [
                "Leader–Member Exchange",
                "In-group / out-group",
                "Trust-building",
                "Delegation",
                "Feedback frequency",
                "Transformational behaviors",
            ],
        },
    },
    {
        "week_no": 16,
        "topic": "Diversity & inclusion",
        "instrument_short_name": None,  # gap — instructor adds a climate-for-inclusion scale
        "reading_ref": "Levy ch. 16",
        "concept": {
            "definition": (
                "Climate for inclusion is the degree to which people of all backgrounds "
                "feel valued, respected, and able to fully participate and be heard."
            ),
            "why_it_matters": (
                "Inclusion shapes belonging, voice, and retention. No validated scale is "
                "bound yet — your instructor will attach a climate-for-inclusion measure."
            ),
            "lenses": ["Climate for inclusion", "Belonging", "Procedural fairness"],
            "key_terms": ["Inclusion", "Belonging", "Equity", "Fairness", "Voice"],
        },
        "prompts": {
            "guiding_questions": [
                "How included does the workplace feel, and which item or facet drove that?",
                "Through a climate-for-inclusion lens, what does your read predict for belonging and voice?",
                "How does your experience compare with your teammates' across different backgrounds?",
            ],
            "concept_options": [
                "Climate for inclusion",
                "Belonging",
                "Procedural fairness",
                "Inclusive leadership",
                "Allyship",
                "Psychological safety",
            ],
        },
    },
]

TEMPLATES: dict[str, dict] = {
    "psy272-modern-workplace": {
        "name": "Measuring the Modern Workplace (PSY 272)",
        "description": (
            "The five-week group-project battery: Job attitudes, Stress & well-being, "
            "Work teams, Leadership, and Diversity & inclusion — each with concept "
            "panels and I-O interpretation prompts."
        ),
        "modules": PSY272_MODULES,
    },
}


def list_templates() -> list[dict]:
    """Lightweight catalogue for the create-course UI."""
    return [
        {
            "key": key,
            "name": t["name"],
            "description": t["description"],
            "topics": [m["topic"] for m in t["modules"]],
        }
        for key, t in TEMPLATES.items()
    ]


async def apply_course_template(db: AsyncSession, course: Course, key: str) -> list[CourseModule]:
    """
    Create the template's weekly modules on `course`, resolving instrument
    short_names to ids. Idempotent by week_no: existing weeks are skipped, so
    re-applying never duplicates. Does not commit — the caller owns the transaction.
    """
    template = TEMPLATES.get(key)
    if template is None:
        raise KeyError(key)

    existing_weeks = set(
        (
            await db.execute(
                select(CourseModule.week_no).where(CourseModule.course_id == course.id)
            )
        )
        .scalars()
        .all()
    )

    created: list[CourseModule] = []
    for idx, spec in enumerate(template["modules"]):
        if spec["week_no"] in existing_weeks:
            continue

        instrument_id = None
        short = spec.get("instrument_short_name")
        if short:
            from ..models.library import Instrument  # local import avoids cycle

            instrument_id = (
                await db.execute(
                    select(Instrument.id).where(Instrument.short_name == short)
                )
            ).scalar_one_or_none()

        module = CourseModule(
            course_id=course.id,
            week_no=spec["week_no"],
            topic=spec["topic"],
            title=spec.get("title"),
            instrument_id=instrument_id,
            reading_ref=spec.get("reading_ref"),
            concept_json=json.dumps(spec["concept"], ensure_ascii=False),
            prompts_json=json.dumps(spec["prompts"], ensure_ascii=False),
            order_index=idx,
            status="scheduled",
        )
        db.add(module)
        created.append(module)

    # Deploy a published survey for each new module that has a bound instrument,
    # so students can take the measure immediately. (No-op for the gap weeks.)
    await db.flush()
    from .classroom_deploy import deploy_module_survey  # local import avoids cycle

    for module in created:
        if module.instrument_id and not module.survey_id:
            try:
                await deploy_module_survey(db, course, module)
            except ValueError:
                pass  # instrument vanished or invalid — leave as a gap

    return created
