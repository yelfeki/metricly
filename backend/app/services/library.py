"""Pure service functions for the Assessment Library.

All functions in this module are side-effect-free and fully unit-testable.
The route handlers in api/library.py call these functions and then perform
the actual DB writes.
"""

from __future__ import annotations

from typing import Any

from ..models.library import Instrument, InstrumentItem, InstrumentSubscale
from ..schemas.library import (
    CategoryGroup,
    InstrumentCategoryOut,
    InstrumentListItem,
    LibraryGrouped,
)


# ---------------------------------------------------------------------------
# Response-format → question_type mapping
# ---------------------------------------------------------------------------

_RESPONSE_FORMAT_TO_QTYPE: dict[str, str] = {
    "likert5": "likert_5",
    "likert7": "likert_7",
    "forced_choice": "single_choice",
    "other": "text",  # non-standard scales (e.g. PERMA 0–10) fall back to text
}

_RESPONSE_FORMAT_SCALE: dict[str, tuple[float, float]] = {
    "likert5": (1.0, 5.0),
    "likert7": (1.0, 7.0),
    "forced_choice": (0.0, 1.0),
    "other": (0.0, 10.0),   # PERMA-style 0–10; text questions won't be scored
}


# ---------------------------------------------------------------------------
# build_library_grouped — pure, no DB
# ---------------------------------------------------------------------------


def build_instrument_list_item(
    instrument: Instrument,
    category_name: str | None,
) -> InstrumentListItem:
    return InstrumentListItem(
        id=instrument.id,
        name=instrument.name,
        short_name=instrument.short_name,
        description=instrument.description,
        construct_measured=instrument.construct_measured,
        category_id=instrument.category_id,
        category_name=category_name,
        license_type=instrument.license_type,
        is_proprietary=instrument.is_proprietary,
        total_items=instrument.total_items,
        estimated_minutes=instrument.estimated_minutes,
        scoring_type=instrument.scoring_type,
        response_format=instrument.response_format,
        languages=instrument.languages,
        reliability_alpha=instrument.reliability_alpha,
        subscale_count=len(instrument.subscales),
    )


def build_library_grouped(
    instruments: list[Instrument],
) -> LibraryGrouped:
    """Group instruments by category, preserving category order_index."""
    # Collect categories in display order
    cat_map: dict[str | None, list[Instrument]] = {}
    cat_meta: dict[str | None, Any] = {}

    for inst in instruments:
        cid = inst.category_id
        cat_map.setdefault(cid, []).append(inst)
        if cid is not None and cid not in cat_meta:
            cat_meta[cid] = inst.category

    # Sort categories by order_index (uncategorised last)
    def _cat_order(cid: str | None) -> int:
        if cid is None:
            return 9999
        cat = cat_meta.get(cid)
        return cat.order_index if cat else 9998

    ordered_cids = sorted(cat_map.keys(), key=_cat_order)

    groups: list[CategoryGroup] = []
    for cid in ordered_cids:
        cat_obj = cat_meta.get(cid) if cid else None
        if cat_obj is None:
            cat_out = InstrumentCategoryOut(
                id="",
                name="Uncategorised",
                description=None,
                icon_name=None,
                order_index=9999,
            )
        else:
            cat_out = InstrumentCategoryOut(
                id=cat_obj.id,
                name=cat_obj.name,
                description=cat_obj.description,
                icon_name=cat_obj.icon_name,
                order_index=cat_obj.order_index,
            )

        cat_name = cat_out.name if cat_out.id else None
        items_out = [
            build_instrument_list_item(inst, cat_name)
            for inst in sorted(cat_map[cid], key=lambda i: i.name)
        ]
        groups.append(CategoryGroup(category=cat_out, instruments=items_out))

    return LibraryGrouped(
        total_instruments=len(instruments),
        categories=groups,
    )


# ---------------------------------------------------------------------------
# build_survey_spec — pure, no DB
# ---------------------------------------------------------------------------


def build_survey_spec(
    instrument: Instrument,
    items: list[InstrumentItem],
    subscales: list[InstrumentSubscale],
    item_ids: list[str] | None = None,
) -> dict[str, Any]:
    """
    Build a structured spec dict describing how to create a Survey + Factors
    + Questions + ScoringAlgorithms from a library instrument deployment.

    Returns a dict ready for the route handler to execute against the DB.
    The function is pure: no DB calls, no side effects.

    Structure:
    {
        "survey_name": str,
        "survey_description": str | None,
        "question_type": str,
        "scale_min": float,
        "scale_max": float,
        "factors": [
            {
                "subscale_id": str | None,
                "name": str,
                "description": str | None,
                "items": [
                    {
                        "instrument_item_id": str,
                        "text": str,
                        "reverse_scored": bool,
                        "scoring_key": str | None,
                        "position": int,   # 1-based within the whole survey
                    }
                ],
                "min_possible": float,
                "max_possible": float,
            }
        ]
    }
    """
    # Filter items if caller specified a subset
    if item_ids is not None:
        id_set = set(item_ids)
        selected = [it for it in items if it.id in id_set]
    else:
        selected = list(items)

    selected.sort(key=lambda it: it.order_index)

    qtype = _RESPONSE_FORMAT_TO_QTYPE.get(instrument.response_format, "likert_5")
    scale_min, scale_max = _RESPONSE_FORMAT_SCALE.get(
        instrument.response_format, (1.0, 5.0)
    )

    # UWES uses 0-6 scale despite response_format = "likert7"
    if instrument.short_name == "UWES-9":
        scale_min = 0.0
        scale_max = 6.0

    # Group items by subscale (preserving subscale order)
    subscale_map: dict[str | None, list[InstrumentItem]] = {}
    for it in selected:
        subscale_map.setdefault(it.subscale_id, []).append(it)

    subscale_order: list[str | None] = []
    if subscales:
        for ss in sorted(subscales, key=lambda s: s.name):
            if ss.id in subscale_map:
                subscale_order.append(ss.id)
    if None in subscale_map:
        subscale_order.append(None)

    subscale_by_id: dict[str, InstrumentSubscale] = {ss.id: ss for ss in subscales}

    factors: list[dict[str, Any]] = []
    position = 1  # 1-based across whole survey

    if not subscale_order or (len(subscale_order) == 1 and subscale_order[0] is None):
        # Single factor (overall or all items have no subscale)
        factor_items = subscale_map.get(None, selected)
        item_specs = []
        for it in factor_items:
            item_specs.append({
                "instrument_item_id": it.id,
                "text": it.item_text,
                "reverse_scored": it.is_reverse_scored,
                "scoring_key": it.scoring_key,
                "position": position,
            })
            position += 1
        n = len(item_specs)
        factors.append({
            "subscale_id": None,
            "name": "Overall",
            "description": None,
            "items": item_specs,
            "min_possible": n * scale_min,
            "max_possible": n * scale_max,
        })
    else:
        for sid in subscale_order:
            ss_items = subscale_map.get(sid, [])
            if not ss_items:
                continue
            ss_obj = subscale_by_id.get(sid) if sid else None
            factor_name = ss_obj.name if ss_obj else "Overall"
            factor_desc = ss_obj.description if ss_obj else None
            item_specs = []
            for it in ss_items:
                item_specs.append({
                    "instrument_item_id": it.id,
                    "text": it.item_text,
                    "reverse_scored": it.is_reverse_scored,
                    "scoring_key": it.scoring_key,
                    "position": position,
                })
                position += 1
            n = len(item_specs)
            factors.append({
                "subscale_id": sid,
                "name": factor_name,
                "description": factor_desc,
                "items": item_specs,
                "min_possible": n * scale_min,
                "max_possible": n * scale_max,
            })

    return {
        "survey_name": instrument.name,
        "survey_description": instrument.description,
        "question_type": qtype,
        "scale_min": scale_min,
        "scale_max": scale_max,
        "factors": factors,
    }


# ---------------------------------------------------------------------------
# Psychometric warning for customized deployments
# ---------------------------------------------------------------------------


def psychometric_warning(
    original_item_count: int,
    selected_item_count: int,
    reliability_alpha: float | None,
) -> str | None:
    """Return a warning string if dropping items may affect validity."""
    if selected_item_count >= original_item_count:
        return None
    pct_removed = 1 - selected_item_count / original_item_count
    if pct_removed > 0.3:
        return (
            f"You have removed {original_item_count - selected_item_count} of "
            f"{original_item_count} items ({round(pct_removed * 100)}%). "
            "Removing more than 30% of items may substantially reduce validity "
            "and affect psychometric properties. Use with caution."
        )
    if reliability_alpha is not None and reliability_alpha > 0.7:
        return (
            "Removing items from a validated instrument may affect its "
            "reliability and construct validity. The reported α applies to "
            "the full item set only."
        )
    return None
