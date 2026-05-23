"""Competency Framework Database API — browsing, straw-man blueprint generation, and Excel export."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.competency import (
    CompetencyDefinition,
    CompetencyFramework,
    CompetencyInstrumentMapping,
    CompetencyProficiencyLevel,
)
from ..models.library import Instrument, InstrumentSubscale

competencies_router = APIRouter(prefix="/competencies", tags=["competencies"])


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------


class ProficiencyLevelOut(BaseModel):
    level: int
    label: str
    behavioral_indicators: list[str]
    example_behaviors: list[str]


class InstrumentMappingOut(BaseModel):
    instrument_id: str
    instrument_name: str
    instrument_short_name: str
    mapping_strength: str  # primary | supporting
    rationale: str | None
    subscale_focus: str | None
    total_items: int
    reliability_alpha: float | None
    response_format: str


class CompetencyListItem(BaseModel):
    id: str
    name: str
    definition: str | None
    framework_id: str
    framework_name: str
    factor: str | None
    cluster: str | None
    category: str | None
    is_leadership: bool
    is_technical: bool
    primary_instrument: str | None  # short name of primary instrument if any


class CompetencyDetail(BaseModel):
    id: str
    name: str
    definition: str | None
    framework_id: str
    framework_name: str
    factor: str | None
    cluster: str | None
    category: str | None
    is_leadership: bool
    is_technical: bool
    proficiency_levels: list[ProficiencyLevelOut]
    instrument_mappings: list[InstrumentMappingOut]


class FrameworkListItem(BaseModel):
    id: str
    name: str
    source: str | None
    description: str | None
    version: str | None
    competency_count: int


# ---------------------------------------------------------------------------
# Straw-man schemas
# ---------------------------------------------------------------------------


class StrawManRequest(BaseModel):
    role_title: str | None = None
    initiative: str | None = None
    competency_ids: list[str] | None = None
    seniority_level: str = "mid"  # junior | mid | senior | executive
    purpose: str = "development"  # selection | development | 360


class StrawManInstrumentRef(BaseModel):
    name: str
    short_name: str
    subscale: str | None
    items: int
    alpha: float | None
    response_format: str
    rationale: str | None


class StrawManRow(BaseModel):
    competency: str
    competency_id: str
    framework: str
    factor: str | None
    cluster: str | None
    required_proficiency_level: int
    proficiency_label: str
    behavioral_indicators: list[str]
    primary_instrument: StrawManInstrumentRef | None
    supporting_instruments: list[StrawManInstrumentRef]
    assessment_method: str
    rationale: str


class StrawManResponse(BaseModel):
    title: str
    generated_at: str
    seniority_level: str
    purpose: str
    rows: list[StrawManRow]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_json_field(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _proficiency_out(pl: CompetencyProficiencyLevel) -> ProficiencyLevelOut:
    return ProficiencyLevelOut(
        level=pl.level,
        label=pl.label,
        behavioral_indicators=_parse_json_field(pl.behavioral_indicators),
        example_behaviors=_parse_json_field(pl.example_behaviors),
    )


def _mapping_out(m: CompetencyInstrumentMapping, instrument: Instrument) -> InstrumentMappingOut:
    return InstrumentMappingOut(
        instrument_id=instrument.id,
        instrument_name=instrument.name,
        instrument_short_name=instrument.short_name,
        mapping_strength=m.mapping_strength,
        rationale=m.rationale,
        subscale_focus=m.subscale_focus,
        total_items=instrument.total_items,
        reliability_alpha=instrument.reliability_alpha,
        response_format=instrument.response_format,
    )


def _required_level(seniority: str, purpose: str) -> int:
    """Determine minimum required proficiency level for the blueprint."""
    base = {"junior": 1, "mid": 2, "senior": 3, "executive": 4}.get(seniority, 2)
    if purpose == "selection":
        base = min(base + 1, 5)
    return base


def _assessment_method(instrument: Instrument | None) -> str:
    if instrument is None:
        return "Structured interview / behavioural observation"
    fmt = instrument.response_format
    if "likert" in fmt:
        return "Self-report psychometric survey"
    if fmt == "forced_choice":
        return "Forced-choice psychometric survey"
    return "Multi-rater survey"


def _select_competency_ids_for_role(
    all_comps: list[CompetencyDefinition],
    seniority: str,
    purpose: str,
    role_title: str | None,
    initiative: str | None,
) -> list[str]:
    """
    Heuristic selection of competencies for a straw man when no explicit IDs are given.
    Returns up to 12 competency IDs based on role/seniority/purpose signals.
    """
    role_lower = (role_title or "").lower()
    init_lower = (initiative or "").lower()

    # ── Always-include criteria ─────────────────────────────────────────────
    always_names = {
        "Communication",
        "Teamwork and Collaboration",
        "Results Orientation",
        "Ethics and Integrity",
    }

    # ── Seniority signals ───────────────────────────────────────────────────
    if seniority in ("senior", "executive"):
        always_names.update({
            "Strategic Mindset",
            "Drives Results",
            "Develops Talent",
            "Instills Trust",
            "Leadership and Influence",
        })
    if seniority == "executive":
        always_names.update({
            "Business Insight",
            "Cultivates Innovation",
            "Builds Effective Teams",
        })

    # ── Purpose signals ─────────────────────────────────────────────────────
    if purpose == "selection":
        always_names.update({"Decision Quality", "Action Oriented", "Being Resilient"})
    if purpose == "360":
        always_names.update({
            "Communicates Effectively",
            "Emotional Intelligence",
            "Demonstrates Self-Awareness",
        })
    if purpose == "development":
        always_names.update({
            "Self-Development and Learning Agility",
            "Nimble Learning",
            "Adaptability and Flexibility",
        })

    # ── Role-keyword signals ────────────────────────────────────────────────
    sales_kw = {"sales", "account", "revenue", "commercial", "business development"}
    tech_kw = {"engineer", "developer", "software", "data", "it ", "technical", "architect"}
    people_kw = {"manager", "director", "vp", "head", "lead", "hr", "people", "talent"}
    customer_kw = {"customer", "service", "support", "success", "cx"}
    ops_kw = {"operations", "supply", "logistics", "manufacturing", "process"}

    combined_text = role_lower + " " + init_lower
    if any(k in combined_text for k in sales_kw):
        always_names.update({"Persuades", "Customer Focus", "Drives Results"})
    if any(k in combined_text for k in tech_kw):
        always_names.update({"Complex Problem Solving", "Tech Savvy", "Manages Complexity"})
    if any(k in combined_text for k in people_kw):
        always_names.update({"Drives Engagement", "Develops Talent", "Manages Conflict"})
    if any(k in combined_text for k in customer_kw):
        always_names.update({"Customer Focus", "Communication", "Service Orientation"})
    if any(k in combined_text for k in ops_kw):
        always_names.update({"Plans and Aligns", "Ensures Accountability", "Manages Complexity"})

    # Build final ID list — prefer KF + Core Behavioral, max 12
    selected: list[str] = []
    for comp in all_comps:
        if comp.name in always_names:
            selected.append(comp.id)
        if len(selected) >= 12:
            break

    # If we're short, add more from Core Behavioral
    core_beh_names = {
        "Problem Solving and Critical Thinking",
        "Adaptability and Flexibility",
        "Innovation and Creativity",
        "Diversity, Equity and Inclusion",
    }
    for comp in all_comps:
        if len(selected) >= 12:
            break
        if comp.name in core_beh_names and comp.id not in selected:
            selected.append(comp.id)

    return selected[:12]


def _build_straw_man_row(
    comp: CompetencyDefinition,
    framework_name: str,
    seniority: str,
    purpose: str,
    instrument_map: dict[str, Instrument],
) -> StrawManRow:
    req_level = _required_level(seniority, purpose)

    # Get proficiency level data
    prof_levels = sorted(comp.proficiency_levels, key=lambda x: x.level)
    # Use requested level, clamped to available
    target_pl = next(
        (pl for pl in prof_levels if pl.level == req_level),
        prof_levels[req_level - 1] if len(prof_levels) >= req_level else (prof_levels[-1] if prof_levels else None),
    )

    behavioral_indicators: list[str] = []
    if target_pl:
        behavioral_indicators = _parse_json_field(target_pl.behavioral_indicators)

    # Sort mappings: primary first
    sorted_mappings = sorted(
        comp.instrument_mappings,
        key=lambda m: (0 if m.mapping_strength == "primary" else 1),
    )

    primary_ref: StrawManInstrumentRef | None = None
    supporting_refs: list[StrawManInstrumentRef] = []

    for mapping in sorted_mappings:
        inst = instrument_map.get(mapping.instrument_id)
        if inst is None:
            continue
        ref = StrawManInstrumentRef(
            name=inst.name,
            short_name=inst.short_name,
            subscale=mapping.subscale_focus,
            items=inst.total_items,
            alpha=inst.reliability_alpha,
            response_format=inst.response_format,
            rationale=mapping.rationale,
        )
        if mapping.mapping_strength == "primary" and primary_ref is None:
            primary_ref = ref
        else:
            supporting_refs.append(ref)

    return StrawManRow(
        competency=comp.name,
        competency_id=comp.id,
        framework=framework_name,
        factor=comp.factor,
        cluster=comp.cluster,
        required_proficiency_level=req_level,
        proficiency_label=LEVEL_LABELS.get(req_level, "Proficient"),
        behavioral_indicators=behavioral_indicators[:3],  # top 3 for conciseness
        primary_instrument=primary_ref,
        supporting_instruments=supporting_refs[:2],  # top 2 supporting
        assessment_method=_assessment_method(
            instrument_map.get(sorted_mappings[0].instrument_id) if sorted_mappings else None
        ),
        rationale=(
            sorted_mappings[0].rationale if sorted_mappings else
            f"{comp.name} is a core competency relevant to this role and assessment purpose."
        ),
    )


LEVEL_LABELS = {1: "Novice", 2: "Developing", 3: "Proficient", 4: "Advanced", 5: "Expert"}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@competencies_router.get("/frameworks", response_model=list[FrameworkListItem])
async def list_frameworks(
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[FrameworkListItem]:
    stmt = select(CompetencyFramework).options(selectinload(CompetencyFramework.competencies))
    rows = (await db.execute(stmt)).scalars().all()
    return [
        FrameworkListItem(
            id=f.id,
            name=f.name,
            source=f.source,
            description=f.description,
            version=f.version,
            competency_count=len(f.competencies),
        )
        for f in rows
    ]


@competencies_router.get("", response_model=list[CompetencyListItem])
async def list_competencies(
    framework_id: str | None = Query(None),
    factor: str | None = Query(None),
    cluster: str | None = Query(None),
    category: str | None = Query(None),
    is_leadership: bool | None = Query(None),
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[CompetencyListItem]:
    stmt = (
        select(CompetencyDefinition)
        .options(
            selectinload(CompetencyDefinition.framework),
            selectinload(CompetencyDefinition.instrument_mappings),
        )
    )
    if framework_id:
        stmt = stmt.where(CompetencyDefinition.framework_id == framework_id)
    if factor:
        stmt = stmt.where(CompetencyDefinition.factor == factor)
    if cluster:
        stmt = stmt.where(CompetencyDefinition.cluster == cluster)
    if category:
        stmt = stmt.where(CompetencyDefinition.category == category)
    if is_leadership is not None:
        stmt = stmt.where(CompetencyDefinition.is_leadership == is_leadership)

    rows = (await db.execute(stmt)).scalars().all()

    # Find primary instrument short names
    inst_ids = {
        m.instrument_id
        for c in rows
        for m in c.instrument_mappings
        if m.mapping_strength == "primary"
    }
    insts: dict[str, str] = {}
    if inst_ids:
        inst_rows = (
            await db.execute(select(Instrument).where(Instrument.id.in_(inst_ids)))
        ).scalars().all()
        insts = {i.id: i.short_name for i in inst_rows}

    return [
        CompetencyListItem(
            id=c.id,
            name=c.name,
            definition=c.definition,
            framework_id=c.framework_id,
            framework_name=c.framework.name if c.framework else "",
            factor=c.factor,
            cluster=c.cluster,
            category=c.category,
            is_leadership=c.is_leadership,
            is_technical=c.is_technical,
            primary_instrument=next(
                (insts[m.instrument_id] for m in c.instrument_mappings
                 if m.mapping_strength == "primary" and m.instrument_id in insts),
                None,
            ),
        )
        for c in rows
    ]


@competencies_router.get("/{competency_id}", response_model=CompetencyDetail)
async def get_competency(
    competency_id: str,
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> CompetencyDetail:
    stmt = (
        select(CompetencyDefinition)
        .where(CompetencyDefinition.id == competency_id)
        .options(
            selectinload(CompetencyDefinition.framework),
            selectinload(CompetencyDefinition.proficiency_levels),
            selectinload(CompetencyDefinition.instrument_mappings),
        )
    )
    comp = (await db.execute(stmt)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status_code=404, detail="Competency not found.")

    # Load instruments for mappings
    inst_ids = [m.instrument_id for m in comp.instrument_mappings]
    insts: dict[str, Instrument] = {}
    if inst_ids:
        inst_rows = (
            await db.execute(select(Instrument).where(Instrument.id.in_(inst_ids)))
        ).scalars().all()
        insts = {i.id: i for i in inst_rows}

    return CompetencyDetail(
        id=comp.id,
        name=comp.name,
        definition=comp.definition,
        framework_id=comp.framework_id,
        framework_name=comp.framework.name if comp.framework else "",
        factor=comp.factor,
        cluster=comp.cluster,
        category=comp.category,
        is_leadership=comp.is_leadership,
        is_technical=comp.is_technical,
        proficiency_levels=[_proficiency_out(pl) for pl in comp.proficiency_levels],
        instrument_mappings=[
            _mapping_out(m, insts[m.instrument_id])
            for m in comp.instrument_mappings
            if m.instrument_id in insts
        ],
    )


@competencies_router.post("/straw-man", response_model=StrawManResponse)
async def generate_straw_man(
    body: StrawManRequest,
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> StrawManResponse:
    """Generate an assessment blueprint straw man."""

    # Load competencies
    if body.competency_ids:
        stmt = (
            select(CompetencyDefinition)
            .where(CompetencyDefinition.id.in_(body.competency_ids))
            .options(
                selectinload(CompetencyDefinition.framework),
                selectinload(CompetencyDefinition.proficiency_levels),
                selectinload(CompetencyDefinition.instrument_mappings),
            )
        )
        comps = (await db.execute(stmt)).scalars().all()
    else:
        # Heuristic selection
        all_comps_stmt = (
            select(CompetencyDefinition)
            .options(
                selectinload(CompetencyDefinition.framework),
                selectinload(CompetencyDefinition.proficiency_levels),
                selectinload(CompetencyDefinition.instrument_mappings),
            )
        )
        all_comps = (await db.execute(all_comps_stmt)).scalars().all()
        selected_ids = _select_competency_ids_for_role(
            all_comps, body.seniority_level, body.purpose, body.role_title, body.initiative
        )
        comps = [c for c in all_comps if c.id in set(selected_ids)]

    if not comps:
        raise HTTPException(status_code=404, detail="No competencies found for the given criteria.")

    # Load all referenced instruments
    inst_ids = {m.instrument_id for c in comps for m in c.instrument_mappings}
    insts: dict[str, Instrument] = {}
    if inst_ids:
        inst_rows = (
            await db.execute(select(Instrument).where(Instrument.id.in_(inst_ids)))
        ).scalars().all()
        insts = {i.id: i for i in inst_rows}

    # Load framework names
    fw_ids = {c.framework_id for c in comps}
    fw_rows = (
        await db.execute(select(CompetencyFramework).where(CompetencyFramework.id.in_(fw_ids)))
    ).scalars().all()
    fw_names: dict[str, str] = {f.id: f.name for f in fw_rows}

    rows = [
        _build_straw_man_row(
            comp=c,
            framework_name=fw_names.get(c.framework_id, ""),
            seniority=body.seniority_level,
            purpose=body.purpose,
            instrument_map=insts,
        )
        for c in comps
    ]

    role_part = body.role_title or body.initiative or "Assessment"
    title = f"Assessment Blueprint: {role_part}"

    return StrawManResponse(
        title=title,
        generated_at=datetime.now(timezone.utc).isoformat(),
        seniority_level=body.seniority_level,
        purpose=body.purpose,
        rows=rows,
    )


@competencies_router.post("/straw-man/export")
async def export_straw_man(
    body: StrawManRequest,
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Generate and return an Excel (.xlsx) assessment blueprint."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import (
            Alignment,
            Border,
            Font,
            PatternFill,
            Side,
        )
        from openpyxl.utils import get_column_letter
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="openpyxl not installed. Run: pip install openpyxl",
        ) from exc

    # Re-use the straw-man logic
    straw_man = await generate_straw_man(body, _, db)

    wb = Workbook()
    ws = wb.active
    ws.title = "Assessment Blueprint"

    # ── Factor colour palette ────────────────────────────────────────────────
    FACTOR_COLORS: dict[str, str] = {
        "Thought": "DBEAFE",   # blue-100
        "Results": "D1FAE5",   # green-100
        "People": "EDE9FE",    # violet-100
        "Self": "FEF3C7",      # amber-100
        "Content Skills": "FEE2E2",
        "Process Skills": "FEF9C3",
        "Social Skills": "DCFCE7",
        "Complex Problem Solving": "E0F2FE",
        "Technical Skills": "F3E8FF",
        "Systems Skills": "FFE4E6",
        "Resource Management": "F0FDF4",
        "default": "F9FAFB",   # gray-50
    }

    def _factor_color(factor: str | None) -> str:
        return FACTOR_COLORS.get(factor or "default", FACTOR_COLORS["default"])

    # ── Header row ───────────────────────────────────────────────────────────
    headers = [
        "Competency", "Framework", "Factor", "Cluster",
        "Required Proficiency", "Behavioral Indicators",
        "Primary Measure", "Subscale", "Items", "α",
        "Supporting Measures", "Assessment Method", "Rationale",
    ]

    header_fill = PatternFill(start_color="1E1B4B", end_color="1E1B4B", fill_type="solid")
    header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    thin = Side(border_style="thin", color="D1D5DB")
    cell_border = Border(left=thin, right=thin, top=thin, bottom=thin)
    wrap_align = Alignment(wrap_text=True, vertical="top")
    center_align = Alignment(horizontal="center", vertical="top")

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = cell_border

    # ── Data rows ────────────────────────────────────────────────────────────
    for row_idx, row in enumerate(straw_man.rows, start=2):
        fill_color = _factor_color(row.factor)
        row_fill = PatternFill(start_color=fill_color, end_color=fill_color, fill_type="solid")

        supporting = "; ".join(
            f"{s.short_name}" + (f" ({s.subscale})" if s.subscale else "")
            for s in row.supporting_instruments
        )
        indicators_text = "\n".join(f"• {ind}" for ind in row.behavioral_indicators)

        values = [
            row.competency,
            row.framework,
            row.factor or "",
            row.cluster or "",
            f"{row.required_proficiency_level} — {row.proficiency_label}",
            indicators_text,
            row.primary_instrument.short_name if row.primary_instrument else "Behavioural Interview",
            row.primary_instrument.subscale if row.primary_instrument and row.primary_instrument.subscale else "",
            row.primary_instrument.items if row.primary_instrument else "",
            round(row.primary_instrument.alpha, 2) if row.primary_instrument and row.primary_instrument.alpha else "",
            supporting,
            row.assessment_method,
            row.rationale or "",
        ]

        for col_idx, value in enumerate(values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.fill = row_fill
            cell.border = cell_border
            cell.alignment = wrap_align if col_idx in (6, 11, 13) else (
                center_align if col_idx in (5, 9, 10) else
                Alignment(vertical="top")
            )
            cell.font = Font(name="Calibri", size=10)

    # ── Column widths ────────────────────────────────────────────────────────
    col_widths = [22, 20, 14, 18, 18, 38, 14, 16, 7, 6, 24, 22, 40]
    for col_idx, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    # ── Freeze top row ───────────────────────────────────────────────────────
    ws.freeze_panes = "A2"

    # ── Metadata sheet ───────────────────────────────────────────────────────
    meta_ws = wb.create_sheet("Metadata")
    meta_ws.append(["Generated by", "Metricly Assessment Platform"])
    meta_ws.append(["Generated at", straw_man.generated_at])
    meta_ws.append(["Role / Initiative", body.role_title or body.initiative or ""])
    meta_ws.append(["Seniority Level", body.seniority_level])
    meta_ws.append(["Assessment Purpose", body.purpose])
    meta_ws.append(["Total Competencies", len(straw_man.rows)])

    # ── Write to buffer ──────────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    role_slug = (body.role_title or body.initiative or "Blueprint").replace(" ", "_")[:30]
    today = date.today().isoformat()
    filename = f"Metricly_Assessment_Blueprint_{role_slug}_{today}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
