"""Ranks library competencies for a guided-flow framework proposal.

Scoring (per product spec — weights tunable here):
    +3  role_family match (inferred from free-text role description)
    +2  any gap keyword found in (name + cluster + role_family + definition)
    +1  cluster diversity bonus (applied at set level during greedy selection)

Required competency IDs are guaranteed-included regardless of score.
The outcome parameter is collected but not scored yet — listed in the
response for use in rationale text.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.competency import CompetencyDefinition

# ---------------------------------------------------------------------------
# Tunable mappings
# ---------------------------------------------------------------------------

# Free-text role description → role_family (substring match on lowercased text)
ROLE_FAMILY_KEYWORDS: dict[str, list[str]] = {
    "Sales": [
        "sales", "account exec", "account manager", "revenue",
        "commercial", "business development", " bd ", "seller",
    ],
    "Technical/Engineering": [
        "engineer", "developer", "software", "data scientist",
        "technical", "architect", "devops", "platform",
        "frontend", "backend", "full stack", "sre",
    ],
    "People Management": [
        "manager", "director", " vp ", "head of", "team lead",
        "people manager", "engineering manager", "chief",
    ],
    "Customer Service and Success": [
        "customer service", "customer support", "customer success",
        " support ", " success ", " cx ", "csm",
    ],
    "Operations and Project Management": [
        "operations", "supply chain", "logistics", "project manager",
        "program manager", "pmo", "manufacturing", " ops ",
    ],
    "Human Resources and People Operations": [
        " hr ", "talent acquisition", "recruit", "people ops",
        "human resources", "l&d", "compensation", "people partner",
    ],
    "Finance and Accounting": [
        "finance", "accounting", "treasury", "fp&a",
        "controller", "auditor", "tax ",
    ],
    "Marketing and Communications": [
        "marketing", " brand ", "campaign", "communications",
        " pr ", "growth marketing", "content marketing",
    ],
}

# Gap-concern label → keywords (lowercased) searched in
# (name + cluster + role_family + definition). One match per gap is enough
# to fire the +2; we don't compound across multiple gaps for a single competency.
GAP_KEYWORDS: dict[str, list[str]] = {
    "Communication": ["communic", "presenting", "writing", "speaking"],
    "Execution and delivery": [
        "delivering", "operating", "operational", "project discipline",
        "execution", "results", "schedule", "milestone",
    ],
    "People development": [
        "talent", "develops talent", "manager effectiveness",
        "coaching", "develops others",
    ],
    "Strategy and vision": [
        "strategic", "strategy", "vision", "business insight",
        "workforce strategy", "financial strategy",
    ],
    "Customer focus": ["customer", "service interaction", "client"],
    "Cross-functional collaboration": [
        "collaborat", "external coordination", "stakeholder",
    ],
    "Decision quality": [
        "decision quality", "complex problem solving",
        "engineering judgement", "judgment",
    ],
    "Resilience and adaptability": [
        "flexible", "adaptab", "coping", "resilien",
    ],
    "Innovation and creativity": [
        "innovat", "creating the new", "creative", "cultivates innovation",
    ],
    "Technical depth": [
        "engineering practice", "engineering judgement",
        "technology design", "programming",
    ],
}

# Default suggested proficiency level per role level
# (Spec: IC → 2-3, Manager → 3-4, Director+ → 4-5; defaulting to middle of each band)
SUGGESTED_LEVEL: dict[str, int] = {
    "IC": 3,
    "Team Lead": 3,
    "Manager": 4,
    "Director+": 5,
}

# Size caps: middle of each user-facing band (lean 5-7 → 6, standard 8-12 → 10, comp 13-18 → 15)
SIZE_CAPS: dict[str, int] = {
    "lean": 6,
    "standard": 10,
    "comprehensive": 15,
}


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass
class RankedCompetency:
    competency_id: str
    name: str
    definition: str | None
    cluster: str | None
    role_family: str | None
    framework_id: str
    framework_name: str
    score: int
    rationale: str
    suggested_proficiency_level: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def infer_role_family(role_text: str) -> str | None:
    """Return the first matching role_family by substring keyword, else None."""
    lower = " " + role_text.lower() + " "
    for family, keywords in ROLE_FAMILY_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return family
    return None


def _flatten_gap_keywords(gaps: list[str]) -> list[str]:
    keywords: set[str] = set()
    for gap in gaps:
        for kw in GAP_KEYWORDS.get(gap, []):
            keywords.add(kw.lower())
    return list(keywords)


def _base_score(
    comp: CompetencyDefinition,
    role_family: str | None,
    gap_keywords: list[str],
) -> tuple[int, list[str]]:
    """Score a competency without the cluster diversity bonus."""
    parts: list[str] = []
    score = 0

    if role_family and comp.role_family == role_family:
        score += 3
        parts.append(f"role-family match ({role_family})")

    if gap_keywords:
        haystack = " ".join(
            filter(
                None,
                [
                    comp.name.lower() if comp.name else "",
                    (comp.cluster or "").lower(),
                    (comp.role_family or "").lower(),
                    (comp.definition or "").lower(),
                ],
            )
        )
        if any(kw in haystack for kw in gap_keywords):
            score += 2
            parts.append("addresses gap concern")

    return score, parts


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def rank_competencies(
    session: AsyncSession,
    role: str,
    level: str,
    outcome: str,
    gaps: list[str],
    size: str,
    required_ids: list[str] | None = None,
) -> list[RankedCompetency]:
    """Rank library competencies for a guided-flow framework proposal.

    Required IDs are pinned at the top of the result regardless of score.
    Remaining slots are filled by greedy selection that applies the +1
    cluster-diversity bonus dynamically (favours unseen clusters until each
    one is represented at least once).
    """
    role_family = infer_role_family(role)
    cap = SIZE_CAPS.get(size, 10)
    suggested_level = SUGGESTED_LEVEL.get(level, 3)
    required_set = set(required_ids or [])

    gap_keywords = _flatten_gap_keywords(gaps)

    # Load all library competencies (framework eager-loaded for response label)
    stmt = select(CompetencyDefinition).options(
        selectinload(CompetencyDefinition.framework)
    )
    all_comps = (await session.execute(stmt)).scalars().all()

    # Base scoring pass (no diversity yet)
    scored: list[tuple[CompetencyDefinition, int, list[str]]] = []
    for comp in all_comps:
        s, parts = _base_score(comp, role_family, gap_keywords)
        scored.append((comp, s, parts))

    # Split required vs. remaining
    required: list[tuple[CompetencyDefinition, int, list[str]]] = []
    rest: list[tuple[CompetencyDefinition, int, list[str]]] = []
    for tup in scored:
        if tup[0].id in required_set:
            required.append((tup[0], tup[1], ["selected as required"] + tup[2]))
        else:
            rest.append(tup)

    # Required first, then greedy pick from rest with dynamic diversity bonus
    selected: list[tuple[CompetencyDefinition, int, list[str]]] = []
    seen_clusters: set[str] = set()

    def commit(tup: tuple[CompetencyDefinition, int, list[str]]) -> None:
        comp, score, parts = tup
        cluster_key = comp.cluster or "_uncategorised"
        if cluster_key not in seen_clusters:
            score += 1
            parts = parts + ["cluster diversity"]
            seen_clusters.add(cluster_key)
        selected.append((comp, score, parts))

    for tup in required:
        if len(selected) >= cap:
            break
        commit(tup)

    while rest and len(selected) < cap:
        # Pick the candidate with the highest *effective* score, where
        # effective = base + (1 if its cluster is not yet represented).
        best_idx = 0
        best_eff = -1
        for i, (comp, base, _) in enumerate(rest):
            cluster_key = comp.cluster or "_uncategorised"
            eff = base + (1 if cluster_key not in seen_clusters else 0)
            if eff > best_eff:
                best_eff = eff
                best_idx = i
        commit(rest.pop(best_idx))

    return [
        RankedCompetency(
            competency_id=comp.id,
            name=comp.name,
            definition=comp.definition,
            cluster=comp.cluster,
            role_family=comp.role_family,
            framework_id=comp.framework_id,
            framework_name=comp.framework.name if comp.framework else "",
            score=score,
            rationale="; ".join(parts) or "general fit",
            suggested_proficiency_level=suggested_level,
        )
        for (comp, score, parts) in selected
    ]
