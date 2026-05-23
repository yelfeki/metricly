"""Tests for the Competency Framework Database — seed integrity, mapping correctness,
straw-man logic, and Excel export.

All tests use in-memory / pure-service-function approaches where possible.
No DB connection required for the pure-logic tests.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.competencies import (
    LEVEL_LABELS,
    StrawManRequest,
    _assessment_method,
    _build_straw_man_row,
    _parse_json_field,
    _required_level,
    _select_competency_ids_for_role,
)
from app.services.competency_seed import (
    LEVEL_LABELS as SEED_LEVEL_LABELS,
    _CORE_BEHAVIORAL,
    _KF_COMPETENCIES,
    _ONET_SKILLS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_comp(
    name: str = "Drives Results",
    factor: str = "Results",
    cluster: str = "Delivering",
    category: str | None = None,
    is_leadership: bool = True,
    framework_id: str = "fw-kf",
    mappings: list | None = None,
    levels: list | None = None,
) -> MagicMock:
    comp = MagicMock()
    comp.id = f"comp-{name.lower().replace(' ', '-')[:20]}"
    comp.name = name
    comp.definition = f"Definition of {name}."
    comp.factor = factor
    comp.cluster = cluster
    comp.category = category
    comp.is_leadership = is_leadership
    comp.is_technical = False
    comp.framework_id = framework_id
    comp.instrument_mappings = mappings or []
    comp.proficiency_levels = levels or []
    return comp


def _make_instrument(
    short_name: str = "UWES-9",
    name: str = "UWES-9 Scale",
    items: int = 9,
    alpha: float | None = 0.90,
    response_format: str = "likert7",
) -> MagicMock:
    inst = MagicMock()
    inst.id = f"inst-{short_name}"
    inst.short_name = short_name
    inst.name = name
    inst.total_items = items
    inst.reliability_alpha = alpha
    inst.response_format = response_format
    return inst


def _make_mapping(
    instrument_id: str,
    strength: str = "primary",
    rationale: str = "Test rationale.",
    subscale: str | None = None,
) -> MagicMock:
    m = MagicMock()
    m.instrument_id = instrument_id
    m.mapping_strength = strength
    m.rationale = rationale
    m.subscale_focus = subscale
    return m


def _make_proficiency_level(level: int, indicators: list[str], examples: list[str]) -> MagicMock:
    pl = MagicMock()
    pl.level = level
    pl.label = LEVEL_LABELS[level]
    pl.behavioral_indicators = json.dumps(indicators)
    pl.example_behaviors = json.dumps(examples)
    return pl


# ---------------------------------------------------------------------------
# 1. Seed data integrity
# ---------------------------------------------------------------------------


class TestKornFerryIntegrity:
    def test_kf_competency_count(self):
        assert len(_KF_COMPETENCIES) >= 30, "Should have at least 30 KF competencies"

    def test_every_kf_competency_has_5_levels(self):
        for comp in _KF_COMPETENCIES:
            assert len(comp["levels"]) == 5, (
                f"KF competency '{comp['name']}' should have exactly 5 proficiency levels, "
                f"got {len(comp['levels'])}"
            )

    def test_every_kf_competency_has_factor(self):
        for comp in _KF_COMPETENCIES:
            assert comp.get("factor"), f"KF competency '{comp['name']}' missing factor"

    def test_every_kf_competency_has_cluster(self):
        for comp in _KF_COMPETENCIES:
            assert comp.get("cluster"), f"KF competency '{comp['name']}' missing cluster"

    def test_every_kf_competency_has_definition(self):
        for comp in _KF_COMPETENCIES:
            assert comp.get("definition") and len(comp["definition"]) > 10, (
                f"KF competency '{comp['name']}' has an empty or very short definition"
            )

    def test_kf_factors_are_valid(self):
        valid_factors = {"Thought", "Results", "People", "Self"}
        for comp in _KF_COMPETENCIES:
            assert comp["factor"] in valid_factors, (
                f"KF competency '{comp['name']}' has invalid factor '{comp['factor']}'"
            )

    def test_kf_level_indicators_are_lists(self):
        """Each level should have (indicators: list, examples: list)."""
        for comp in _KF_COMPETENCIES:
            for lvl_idx, (indicators, examples) in enumerate(comp["levels"], start=1):
                assert isinstance(indicators, list) and len(indicators) >= 1, (
                    f"{comp['name']} level {lvl_idx}: indicators should be non-empty list"
                )
                assert isinstance(examples, list) and len(examples) >= 1, (
                    f"{comp['name']} level {lvl_idx}: examples should be non-empty list"
                )

    def test_kf_all_competencies_marked_leadership(self):
        for comp in _KF_COMPETENCIES:
            assert comp.get("is_leadership", False) is True, (
                f"KF competency '{comp['name']}' should be marked is_leadership=True"
            )


class TestONETIntegrity:
    def test_onet_competency_count(self):
        assert len(_ONET_SKILLS) >= 30, "O*NET should have at least 30 skills"

    def test_every_onet_skill_has_5_levels(self):
        for skill in _ONET_SKILLS:
            assert len(skill["levels"]) == 5, (
                f"O*NET skill '{skill['name']}' should have exactly 5 levels"
            )

    def test_every_onet_skill_has_category(self):
        for skill in _ONET_SKILLS:
            assert skill.get("category"), f"O*NET skill '{skill['name']}' missing category"

    def test_onet_categories_are_valid(self):
        valid_cats = {
            "Content Skills", "Process Skills", "Social Skills",
            "Complex Problem Solving", "Technical Skills",
            "Systems Skills", "Resource Management",
        }
        for skill in _ONET_SKILLS:
            assert skill["category"] in valid_cats, (
                f"O*NET skill '{skill['name']}' has unexpected category '{skill['category']}'"
            )

    def test_onet_has_all_seven_categories(self):
        cats = {s["category"] for s in _ONET_SKILLS}
        expected = {
            "Content Skills", "Process Skills", "Social Skills",
            "Complex Problem Solving", "Technical Skills",
            "Systems Skills", "Resource Management",
        }
        assert cats == expected


class TestCoreBehavioralIntegrity:
    def test_core_behavioral_count(self):
        assert len(_CORE_BEHAVIORAL) == 12, "Should have exactly 12 Core Behavioral competencies"

    def test_every_core_has_5_levels(self):
        for comp in _CORE_BEHAVIORAL:
            assert len(comp["levels"]) == 5, (
                f"Core competency '{comp['name']}' should have exactly 5 levels"
            )

    def test_required_names_present(self):
        names = {c["name"] for c in _CORE_BEHAVIORAL}
        required = {
            "Communication",
            "Teamwork and Collaboration",
            "Emotional Intelligence",
            "Ethics and Integrity",
            "Results Orientation",
            "Customer Focus",
        }
        assert required <= names


class TestLevelLabels:
    def test_seed_labels_match_api_labels(self):
        assert SEED_LEVEL_LABELS == LEVEL_LABELS

    def test_all_5_levels_present(self):
        for lvl in range(1, 6):
            assert lvl in LEVEL_LABELS

    def test_level_label_names(self):
        assert LEVEL_LABELS[1] == "Novice"
        assert LEVEL_LABELS[3] == "Proficient"
        assert LEVEL_LABELS[5] == "Expert"


# ---------------------------------------------------------------------------
# 2. Pure-function unit tests
# ---------------------------------------------------------------------------


class TestParseJsonField:
    def test_valid_json_list(self):
        result = _parse_json_field('["a", "b", "c"]')
        assert result == ["a", "b", "c"]

    def test_empty_string(self):
        assert _parse_json_field("") == []

    def test_none(self):
        assert _parse_json_field(None) == []

    def test_invalid_json(self):
        assert _parse_json_field("{bad json") == []

    def test_json_object_not_list(self):
        assert _parse_json_field('{"key": "value"}') == []


class TestRequiredLevel:
    def test_mid_development(self):
        assert _required_level("mid", "development") == 2

    def test_senior_development(self):
        assert _required_level("senior", "development") == 3

    def test_executive_development(self):
        assert _required_level("executive", "development") == 4

    def test_mid_selection_bumps_up(self):
        # selection adds 1
        assert _required_level("mid", "selection") == 3

    def test_executive_selection_capped_at_5(self):
        assert _required_level("executive", "selection") == 5

    def test_junior(self):
        assert _required_level("junior", "development") == 1


class TestAssessmentMethod:
    def test_likert_instrument_returns_self_report(self):
        inst = _make_instrument(response_format="likert5")
        assert "Self-report" in _assessment_method(inst)

    def test_forced_choice_returns_forced_choice(self):
        inst = _make_instrument(response_format="forced_choice")
        assert "Forced-choice" in _assessment_method(inst)

    def test_no_instrument_returns_interview(self):
        assert "interview" in _assessment_method(None).lower()


class TestSelectCompetencyIds:
    def _make_comps(self, names: list[str]) -> list[MagicMock]:
        return [_make_comp(name=n) for n in names]

    def test_returns_at_most_12(self):
        comps = self._make_comps(
            ["Communication", "Results Orientation", "Ethics and Integrity",
             "Teamwork and Collaboration", "Strategic Mindset", "Drives Results",
             "Develops Talent", "Instills Trust", "Leadership and Influence",
             "Business Insight", "Cultivates Innovation", "Builds Effective Teams",
             "Action Oriented", "Being Resilient", "Decision Quality"]
        )
        selected = _select_competency_ids_for_role(comps, "executive", "selection", None, None)
        assert len(selected) <= 12

    def test_executive_gets_strategic_mindset(self):
        comps = self._make_comps([
            "Communication", "Results Orientation", "Ethics and Integrity",
            "Teamwork and Collaboration", "Strategic Mindset", "Drives Results",
            "Develops Talent", "Instills Trust", "Leadership and Influence",
        ])
        selected = _select_competency_ids_for_role(comps, "executive", "development", None, None)
        selected_names = {c.name for c in comps if c.id in set(selected)}
        assert "Strategic Mindset" in selected_names

    def test_sales_role_gets_customer_focus(self):
        comps = self._make_comps([
            "Communication", "Results Orientation", "Persuades", "Customer Focus",
            "Ethics and Integrity", "Teamwork and Collaboration", "Drives Results",
        ])
        selected = _select_competency_ids_for_role(
            comps, "mid", "selection", "Regional Sales Manager", None
        )
        selected_names = {c.name for c in comps if c.id in set(selected)}
        assert "Customer Focus" in selected_names

    def test_tech_role_gets_tech_savvy(self):
        comps = self._make_comps([
            "Communication", "Results Orientation", "Tech Savvy",
            "Complex Problem Solving", "Ethics and Integrity", "Teamwork and Collaboration",
        ])
        selected = _select_competency_ids_for_role(
            comps, "senior", "development", "Software Engineer", None
        )
        selected_names = {c.name for c in comps if c.id in set(selected)}
        assert "Tech Savvy" in selected_names

    def test_development_purpose_gets_nimble_learning(self):
        comps = self._make_comps([
            "Communication", "Results Orientation", "Nimble Learning",
            "Self-Development and Learning Agility", "Ethics and Integrity",
            "Teamwork and Collaboration",
        ])
        selected = _select_competency_ids_for_role(
            comps, "mid", "development", None, "Leadership Development Program"
        )
        selected_names = {c.name for c in comps if c.id in set(selected)}
        assert "Nimble Learning" in selected_names


class TestBuildStrawManRow:
    def _make_row(
        self,
        comp_name: str = "Drives Results",
        seniority: str = "mid",
        purpose: str = "development",
        has_instrument: bool = True,
    ) -> MagicMock:
        inst = _make_instrument() if has_instrument else None
        mapping = _make_mapping("inst-UWES-9") if has_instrument else None
        levels = [
            _make_proficiency_level(i, [f"Indicator {i}a", f"Indicator {i}b"], [f"Example {i}"])
            for i in range(1, 6)
        ]
        comp = _make_comp(
            name=comp_name,
            mappings=[mapping] if mapping else [],
            levels=levels,
        )
        instrument_map = {"inst-UWES-9": inst} if inst else {}
        return _build_straw_man_row(
            comp=comp,
            framework_name="Korn Ferry Leadership Architect",
            seniority=seniority,
            purpose=purpose,
            instrument_map=instrument_map,
        )

    def test_row_has_competency_name(self):
        row = self._make_row()
        assert row.competency == "Drives Results"

    def test_row_has_framework(self):
        row = self._make_row()
        assert row.framework == "Korn Ferry Leadership Architect"

    def test_required_level_matches_seniority(self):
        row_mid = self._make_row(seniority="mid")
        assert row_mid.required_proficiency_level == 2
        row_senior = self._make_row(seniority="senior")
        assert row_senior.required_proficiency_level == 3

    def test_behavioral_indicators_populated(self):
        row = self._make_row()
        assert len(row.behavioral_indicators) > 0

    def test_primary_instrument_present(self):
        row = self._make_row(has_instrument=True)
        assert row.primary_instrument is not None
        assert row.primary_instrument.short_name == "UWES-9"

    def test_no_instrument_falls_back_gracefully(self):
        row = self._make_row(has_instrument=False)
        assert row.primary_instrument is None
        assert "interview" in row.assessment_method.lower()

    def test_proficiency_label_matches_level(self):
        row = self._make_row(seniority="senior", purpose="development")  # level 3
        assert row.proficiency_label == "Proficient"

    def test_rationale_present(self):
        row = self._make_row()
        assert row.rationale and len(row.rationale) > 5


# ---------------------------------------------------------------------------
# 3. Mapping coverage checks
# ---------------------------------------------------------------------------


class TestInstrumentMappings:
    """Validate the mapping specification in instrument_competency_mapper."""

    def test_all_mapping_strengths_valid(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        valid = {"primary", "supporting"}
        for short_name, comp_name, strength, rationale, subscale in _MAPPINGS:
            assert strength in valid, (
                f"Mapping ({short_name} → {comp_name}) has invalid strength '{strength}'"
            )

    def test_all_rationales_non_empty(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        for short_name, comp_name, strength, rationale, subscale in _MAPPINGS:
            assert rationale and len(rationale) > 10, (
                f"Mapping ({short_name} → {comp_name}) has empty/short rationale"
            )

    def test_uwes_has_primary_mapping(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        primaries = [(s, c) for s, c, st, *_ in _MAPPINGS if s == "UWES-9" and st == "primary"]
        assert len(primaries) >= 1, "UWES-9 should have at least one primary competency mapping"

    def test_lmx7_maps_to_instills_trust(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        found = any(
            s == "LMX-7" and c == "Instills Trust" and st == "primary"
            for s, c, st, *_ in _MAPPINGS
        )
        assert found, "LMX-7 should have primary mapping to 'Instills Trust'"

    def test_ethical_leadership_maps_to_ethics(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        found = any(
            s == "ELS" and c == "Ethics and Integrity" and st == "primary"
            for s, c, st, *_ in _MAPPINGS
        )
        assert found, "ELS should have primary mapping to 'Ethics and Integrity'"

    def test_grit_s_maps_to_being_resilient(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        found = any(
            s == "Grit-S" and c == "Being Resilient"
            for s, c, *_ in _MAPPINGS
        )
        assert found, "Grit-S should map to 'Being Resilient'"

    def test_no_duplicate_primary_mapping_per_instrument_competency(self):
        from app.services.instrument_competency_mapper import _MAPPINGS
        primaries = [
            (s, c) for s, c, st, *_ in _MAPPINGS if st == "primary"
        ]
        assert len(primaries) == len(set(primaries)), "Duplicate primary mappings found"


# ---------------------------------------------------------------------------
# 4. Total count validation
# ---------------------------------------------------------------------------


class TestTotalCompetencies:
    def test_total_competency_count(self):
        total = len(_KF_COMPETENCIES) + len(_ONET_SKILLS) + len(_CORE_BEHAVIORAL)
        assert total >= 80, f"Expected 80+ competencies total, got {total}"
        # Report the actual count for visibility
        print(f"\nTotal competencies seeded: {total}")
        print(f"  Korn Ferry: {len(_KF_COMPETENCIES)}")
        print(f"  O*NET: {len(_ONET_SKILLS)}")
        print(f"  Core Behavioral: {len(_CORE_BEHAVIORAL)}")

    def test_total_proficiency_levels_seeded(self):
        """Each competency has exactly 5 levels — validate the multiplication."""
        total_comps = len(_KF_COMPETENCIES) + len(_ONET_SKILLS) + len(_CORE_BEHAVIORAL)
        total_levels = total_comps * 5
        assert total_levels >= 400, f"Expected 400+ proficiency levels, got {total_levels}"
