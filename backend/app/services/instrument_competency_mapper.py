"""Idempotent mapper that links Metricly library instruments to competency definitions.

Called after seed_competency_frameworks() at startup.
Mapping table: instrument short_name → list of (competency_name, mapping_strength, rationale, subscale_focus).
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.competency import CompetencyDefinition, CompetencyInstrumentMapping
from ..models.library import Instrument

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mapping specification
# Each entry: (instrument_short_name, competency_name, strength, rationale, subscale_focus)
# ---------------------------------------------------------------------------

_MAPPINGS: list[tuple[str, str, str, str, str | None]] = [
    # UWES-9 — Work and Well-being Survey
    ("UWES-9", "Results Orientation", "primary",
     "Vigor and dedication subscales directly predict goal persistence and high-effort output.", "Vigor"),
    ("UWES-9", "Self-Development and Learning Agility", "supporting",
     "Absorption subscale captures intrinsic engagement, a precursor to voluntary learning.", "Absorption"),
    ("UWES-9", "Drives Results", "supporting",
     "Overall engagement score predicts discretionary effort and performance outcomes.", None),

    # Psychological Safety Scale (Edmondson)
    ("PSS", "Builds Effective Teams", "primary",
     "Psychological safety is the single strongest predictor of team learning and performance (Edmondson, 1999).", None),
    ("PSS", "Collaborates", "supporting",
     "Safe teams share information freely, enabling effective cross-functional collaboration.", None),
    ("PSS", "Values Differences", "supporting",
     "Psychological safety enables diverse voices to be heard without fear of ridicule.", None),
    ("PSS", "Teamwork and Collaboration", "supporting",
     "Team-level safety enables the open exchange needed for genuine collaboration.", None),

    # LMX-7 — Leader-Member Exchange
    ("LMX-7", "Instills Trust", "primary",
     "High LMX is defined by mutual trust, respect, and obligation between leader and member.", None),
    ("LMX-7", "Develops Talent", "supporting",
     "High-LMX relationships include coaching, stretch assignments, and developmental feedback.", None),
    ("LMX-7", "Interpersonal Savvy", "supporting",
     "LMX quality reflects the interpersonal quality of the leader-member relationship.", None),
    ("LMX-7", "Leadership and Influence", "supporting",
     "LMX captures the quality of influence relationships between leaders and followers.", None),

    # Grit-S — Grit Scale
    ("Grit-S", "Nimble Learning", "primary",
     "Consistency of interest subscale predicts sustained focus on learning goals over time.", "Consistency of Interest"),
    ("Grit-S", "Being Resilient", "primary",
     "Perseverance of effort subscale is a direct behavioural measure of resilience under adversity.", "Perseverance of Effort"),
    ("Grit-S", "Action Oriented", "supporting",
     "High grit predicts sustained effort initiation even in the face of obstacles.", None),
    ("Grit-S", "Self-Development and Learning Agility", "supporting",
     "Grit predicts long-term commitment to personal growth goals.", None),

    # GSE — General Self-Efficacy Scale
    ("GSE", "Being Resilient", "primary",
     "Self-efficacy is the foundational cognitive mechanism underlying resilience and recovery from setbacks.", None),
    ("GSE", "Self-Development", "supporting",
     "High self-efficacy drives goal-setting and engagement in development activities.", None),
    ("GSE", "Action Oriented", "supporting",
     "Self-efficacy predicts initiative-taking and willingness to tackle difficult challenges.", None),
    ("GSE", "Self-Development and Learning Agility", "supporting",
     "Belief in one's capacity to learn predicts greater engagement with development activities.", None),

    # PANAS — Positive and Negative Affect Schedule
    ("PANAS", "Emotional Intelligence", "primary",
     "Emotional awareness (positive and negative affect recognition) is the foundation of emotional intelligence.", None),
    ("PANAS", "Being Resilient", "supporting",
     "Negative affect subscale is an indicator of vulnerability to stress; positive affect predicts recovery.", "Negative Affect"),
    ("PANAS", "Communicates Effectively", "supporting",
     "Affect regulation underlies the ability to read and respond to emotional climate in communication.", None),

    # OCQ — Organizational Commitment Questionnaire
    ("OCQ", "Ensures Accountability", "primary",
     "Affective commitment predicts discretionary effort and follow-through on organisational obligations.", None),
    ("OCQ", "Instills Trust", "supporting",
     "Committed employees are perceived as reliable partners, which builds reciprocal trust.", None),
    ("OCQ", "Results Orientation", "supporting",
     "Organisational commitment predicts sustained performance effort over time.", None),

    # Ethical Leadership Scale
    ("ELS", "Courage", "primary",
     "Ethical leadership requires willingness to enforce ethical standards and take stands on difficult issues.", None),
    ("ELS", "Instills Trust", "supporting",
     "Ethical leaders are consistently trusted because they are predictable and principled.", None),
    ("ELS", "Values Differences", "supporting",
     "Ethical leadership includes fair and inclusive treatment of all employees.", None),
    ("ELS", "Ethics and Integrity", "primary",
     "The ELS is a direct measure of ethical conduct and integrity in leadership behaviour.", None),

    # Servant Leadership Survey
    ("SLS", "Develops Talent", "primary",
     "The core servant leadership orientation prioritises the growth and development of followers.", None),
    ("SLS", "Customer Focus", "supporting",
     "Servant leaders prioritise stakeholder needs above self-interest.", None),
    ("SLS", "Collaborates", "supporting",
     "Servant leaders build community and shared purpose as a foundation for collaboration.", None),
    ("SLS", "Emotional Intelligence", "supporting",
     "Empathy is a central component of servant leadership measured by the SLS.", None),

    # Team Trust Scale
    ("TTS", "Instills Trust", "primary",
     "The Team Trust Scale directly measures trust climate within a team or work group.", None),
    ("TTS", "Builds Effective Teams", "supporting",
     "Trust is the psychological foundation of team effectiveness and performance.", None),
    ("TTS", "Collaborates", "supporting",
     "High-trust teams share resources and information more freely, enabling collaboration.", None),
    ("TTS", "Teamwork and Collaboration", "supporting",
     "Team trust is a proximal predictor of collaborative willingness and information sharing.", None),

    # CSES — Core Self-Evaluations Scale
    ("CSES", "Demonstrates Self-Awareness", "primary",
     "Self-esteem and internal locus of control subscales directly reflect self-concept clarity.", "Self-Esteem"),
    ("CSES", "Being Resilient", "supporting",
     "Emotional stability subscale predicts recovery from setbacks and stress regulation.", "Emotional Stability"),
    ("CSES", "Action Oriented", "supporting",
     "General self-efficacy and locus of control predict initiative-taking and proactive behaviour.", None),

    # BFI-10 — Big Five Inventory-10
    ("BFI-10", "Communicates Effectively", "supporting",
     "Extraversion predicts verbal fluency and comfort in social communication contexts.", "Extraversion"),
    ("BFI-10", "Being Resilient", "supporting",
     "Neuroticism (reversed) is the primary personality predictor of emotional stability and stress resilience.", "Neuroticism"),
    ("BFI-10", "Teamwork and Collaboration", "supporting",
     "Agreeableness predicts cooperation, altruism, and willingness to put team above self.", "Agreeableness"),
    ("BFI-10", "Self-Development and Learning Agility", "supporting",
     "Openness to Experience is the primary personality predictor of learning agility and curiosity.", "Openness"),
    ("BFI-10", "Results Orientation", "supporting",
     "Conscientiousness is the strongest personality predictor of job performance across contexts.", "Conscientiousness"),

    # HEXACO-60
    ("HEXACO-60", "Ethics and Integrity", "primary",
     "Honesty-Humility is the defining HEXACO factor; high scorers are sincere, fair, and avoid exploitation.", "Honesty-Humility"),
    ("HEXACO-60", "Emotional Intelligence", "supporting",
     "Emotionality factor measures sentimentality and empathy, key components of EI.", "Emotionality"),
    ("HEXACO-60", "Teamwork and Collaboration", "supporting",
     "Agreeableness-HEXACO predicts cooperative, forgiving, and patient team behaviour.", "Agreeableness"),
    ("HEXACO-60", "Being Resilient", "supporting",
     "Emotional regulation subscale within Emotionality reflects stress management capacity.", "Emotionality"),
    ("HEXACO-60", "Self-Development and Learning Agility", "supporting",
     "Openness to Experience predicts curiosity-driven learning and intellectual exploration.", "Openness to Experience"),

    # IMI — Intrinsic Motivation Inventory
    ("IMI", "Self-Development and Learning Agility", "primary",
     "Intrinsic motivation is the foundational predictor of autonomous, sustained learning behaviour.", "Interest/Enjoyment"),
    ("IMI", "Results Orientation", "supporting",
     "Effort/importance subscale predicts persistence and quality of performance on challenging tasks.", "Effort/Importance"),

    # PERMA Profiler
    ("PERMA", "Emotional Intelligence", "supporting",
     "Positive emotion and meaning dimensions reflect emotional awareness and sense of purpose.", "Positive Emotion"),
    ("PERMA", "Teamwork and Collaboration", "supporting",
     "Relationships dimension measures quality of positive interpersonal connections at work.", "Relationships"),
    ("PERMA", "Results Orientation", "supporting",
     "Accomplishment dimension captures perceived goal achievement and performance satisfaction.", "Accomplishment"),

    # SWL — Satisfaction with Life Scale
    ("SWL", "Being Resilient", "supporting",
     "Life satisfaction is a protective factor against burnout and work-related adversity.", None),

    # OLBI — Oldenburg Burnout Inventory
    ("OLBI", "Being Resilient", "primary",
     "Burnout (exhaustion + disengagement) is the direct opposite pole of resilience under sustained stress.", None),
    ("OLBI", "Results Orientation", "supporting",
     "Disengagement subscale predicts withdrawal of effort and reduction in performance quality.", "Disengagement"),

    # POS — Perceived Organizational Support
    ("POS", "Drives Engagement", "primary",
     "Perceived support from the organisation predicts employee engagement and discretionary effort.", None),
    ("POS", "Ensures Accountability", "supporting",
     "Organisational support norms create reciprocal obligation and accountability.", None),

    # WFC — Work-Family Conflict Scale
    ("WFC", "Manages Ambiguity", "supporting",
     "High work-family conflict reflects difficulty managing competing demands — relevant to adaptability and stress.", None),

    # JSS — Job Satisfaction Survey
    ("JSS", "Drives Engagement", "supporting",
     "Job satisfaction is a leading indicator of engagement levels and voluntary behaviour at work.", None),

    # NEO-PI
    ("NEO-PI", "Ethics and Integrity", "supporting",
     "Agreeableness facets (trust, altruism, compliance) and Conscientiousness (dutifulness) predict ethical conduct.", "Conscientiousness"),
    ("NEO-PI", "Self-Development and Learning Agility", "supporting",
     "Openness to Experience is the strongest personality predictor of learning agility.", "Openness to Experience"),
    ("NEO-PI", "Emotional Intelligence", "supporting",
     "Neuroticism facets measure emotional reactivity relevant to self-regulation.", "Neuroticism"),

    # NFC — Need for Cognition
    ("NFC", "Complex Problem Solving", "primary",
     "Need for Cognition directly predicts engagement with complex analytical tasks.", None),
    ("NFC", "Critical Thinking", "primary",
     "High NFC predicts systematic, effortful processing — the cognitive basis of critical thinking.", None),

    # MLQ — Multifactor Leadership Questionnaire
    ("MLQ", "Leadership and Influence", "primary",
     "The MLQ is the gold-standard measure of transformational and transactional leadership behaviours.", None),
    ("MLQ", "Develops Talent", "supporting",
     "Individual consideration subscale captures developmental coaching behaviours.", "Individual Consideration"),
    ("MLQ", "Cultivates Innovation", "supporting",
     "Intellectual stimulation subscale reflects the leader's ability to inspire creative thinking.", "Intellectual Stimulation"),
]


async def seed_instrument_competency_mappings(session: AsyncSession) -> None:
    """Idempotently create instrument-competency mappings."""

    # Check if already seeded
    existing_count_result = await session.execute(
        select(CompetencyInstrumentMapping).limit(1)
    )
    if existing_count_result.scalar_one_or_none() is not None:
        log.debug("Instrument-competency mappings already seeded.")
        return

    # Load all competencies and instruments
    comps = (await session.execute(select(CompetencyDefinition))).scalars().all()
    insts = (await session.execute(select(Instrument))).scalars().all()

    comp_by_name: dict[str, CompetencyDefinition] = {c.name: c for c in comps}
    inst_by_short: dict[str, Instrument] = {i.short_name: i for i in insts}

    created = 0
    skipped = 0

    for short_name, comp_name, strength, rationale, subscale in _MAPPINGS:
        instrument = inst_by_short.get(short_name)
        competency = comp_by_name.get(comp_name)

        if instrument is None:
            log.debug("Instrument not found in library: %s — skipping mapping", short_name)
            skipped += 1
            continue
        if competency is None:
            log.debug("Competency not found: %s — skipping mapping", comp_name)
            skipped += 1
            continue

        mapping = CompetencyInstrumentMapping(
            competency_id=competency.id,
            instrument_id=instrument.id,
            mapping_strength=strength,
            rationale=rationale,
            subscale_focus=subscale,
        )
        session.add(mapping)
        created += 1

    await session.commit()
    log.info(
        "Instrument-competency mappings seeded: %d created, %d skipped (instrument/competency not found).",
        created,
        skipped,
    )
