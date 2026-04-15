"""Tests for the Assessment Library pure service functions."""

import json
from unittest.mock import MagicMock

import pytest

from app.services.library import (
    build_library_grouped,
    build_instrument_list_item,
    build_survey_spec,
    psychometric_warning,
)


# ---------------------------------------------------------------------------
# Helpers — lightweight mock objects (no DB needed)
# ---------------------------------------------------------------------------


def _make_category(name="Org Health", order_index=1):
    cat = MagicMock()
    cat.id = "cat-1"
    cat.name = name
    cat.description = "desc"
    cat.icon_name = "building"
    cat.order_index = order_index
    return cat


def _make_instrument(
    short_name="PSS-7",
    name="Psych Safety Scale",
    response_format="likert7",
    scoring_type="mean",
    total_items=7,
    subscales=None,
    category=None,
    category_id="cat-1",
):
    inst = MagicMock()
    inst.id = f"inst-{short_name}"
    inst.short_name = short_name
    inst.name = name
    inst.description = "Test description"
    inst.construct_measured = "Safety"
    inst.category_id = category_id
    inst.category = category
    inst.license_type = "open"
    inst.is_proprietary = False
    inst.total_items = total_items
    inst.estimated_minutes = 5
    inst.scoring_type = scoring_type
    inst.response_format = response_format
    inst.languages = '["en","ar"]'
    inst.reliability_alpha = 0.82
    inst.subscales = subscales or []
    return inst


def _make_subscale(name, iid, count=3):
    ss = MagicMock()
    ss.id = f"ss-{name.lower().replace(' ', '-')}"
    ss.name = name
    ss.description = f"{name} subscale"
    ss.instrument_id = iid
    ss.item_count = count
    return ss


def _make_item(idx, text="Item text", subscale_id=None, reverse=False):
    item = MagicMock()
    item.id = f"item-{idx}"
    item.item_text = text
    item.order_index = idx
    item.subscale_id = subscale_id
    item.is_reverse_scored = reverse
    item.scoring_key = None
    return item


# ---------------------------------------------------------------------------
# build_instrument_list_item
# ---------------------------------------------------------------------------


class TestBuildInstrumentListItem:
    def test_basic_fields(self):
        cat = _make_category()
        inst = _make_instrument(category=cat)
        item = build_instrument_list_item(inst, "Org Health")
        assert item.name == inst.name
        assert item.short_name == inst.short_name
        assert item.category_name == "Org Health"
        assert item.license_type == "open"

    def test_subscale_count(self):
        ss1 = _make_subscale("Vigor", "inst-1", 3)
        ss2 = _make_subscale("Dedication", "inst-1", 3)
        inst = _make_instrument(subscales=[ss1, ss2])
        item = build_instrument_list_item(inst, "Org Health")
        assert item.subscale_count == 2


# ---------------------------------------------------------------------------
# build_library_grouped
# ---------------------------------------------------------------------------


class TestBuildLibraryGrouped:
    def test_empty_library(self):
        result = build_library_grouped([])
        assert result.total_instruments == 0
        assert result.categories == []

    def test_groups_by_category(self):
        cat = _make_category()
        inst1 = _make_instrument(short_name="A", name="Alpha", category=cat)
        inst2 = _make_instrument(short_name="B", name="Beta", category=cat)
        result = build_library_grouped([inst1, inst2])
        assert result.total_instruments == 2
        assert len(result.categories) == 1
        assert result.categories[0].category.name == "Org Health"
        assert len(result.categories[0].instruments) == 2

    def test_instruments_sorted_by_name(self):
        cat = _make_category()
        inst1 = _make_instrument(short_name="Z", name="Zeta", category=cat)
        inst2 = _make_instrument(short_name="A", name="Alpha", category=cat)
        result = build_library_grouped([inst1, inst2])
        names = [i.name for i in result.categories[0].instruments]
        assert names == sorted(names)

    def test_uncategorised_last(self):
        cat = _make_category(order_index=1)
        inst_with_cat = _make_instrument(short_name="A", name="Alpha", category=cat, category_id="cat-1")
        inst_no_cat = _make_instrument(short_name="B", name="Beta", category=None, category_id=None)
        result = build_library_grouped([inst_with_cat, inst_no_cat])
        assert len(result.categories) == 2
        assert result.categories[-1].category.name == "Uncategorised"


# ---------------------------------------------------------------------------
# build_survey_spec — single factor (no subscales)
# ---------------------------------------------------------------------------


class TestBuildSurveySpecSingleFactor:
    def setup_method(self):
        self.inst = _make_instrument(response_format="likert7", total_items=3)
        self.items = [_make_item(i + 1, f"Item {i+1}") for i in range(3)]
        self.subscales = []

    def test_creates_one_overall_factor(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        assert len(spec["factors"]) == 1
        assert spec["factors"][0]["name"] == "Overall"

    def test_positions_are_1_based(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        positions = [it["position"] for it in spec["factors"][0]["items"]]
        assert positions == [1, 2, 3]

    def test_likert7_scale_range(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        assert spec["scale_min"] == 1.0
        assert spec["scale_max"] == 7.0

    def test_min_max_possible_for_3_items_likert7(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        factor = spec["factors"][0]
        assert factor["min_possible"] == 3.0   # 3 items × 1
        assert factor["max_possible"] == 21.0  # 3 items × 7

    def test_question_type_likert7(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        assert spec["question_type"] == "likert_7"

    def test_item_ids_filter(self):
        spec = build_survey_spec(
            self.inst, self.items, self.subscales,
            item_ids=["item-1", "item-2"]
        )
        assert len(spec["factors"][0]["items"]) == 2


# ---------------------------------------------------------------------------
# build_survey_spec — multiple subscales
# ---------------------------------------------------------------------------


class TestBuildSurveySpecSubscales:
    def setup_method(self):
        self.inst = _make_instrument(short_name="UWES-9", response_format="likert7", scoring_type="subscale")
        self.ss_vigor = _make_subscale("Vigor", self.inst.id, 3)
        self.ss_ded = _make_subscale("Dedication", self.inst.id, 3)
        self.ss_abs = _make_subscale("Absorption", self.inst.id, 3)
        self.subscales = [self.ss_vigor, self.ss_ded, self.ss_abs]

        self.items = []
        for i in range(3):
            self.items.append(_make_item(i + 1, f"Vigor {i+1}", subscale_id=self.ss_vigor.id))
        for i in range(3):
            self.items.append(_make_item(i + 4, f"Ded {i+1}", subscale_id=self.ss_ded.id))
        for i in range(3):
            self.items.append(_make_item(i + 7, f"Abs {i+1}", subscale_id=self.ss_abs.id))

    def test_creates_three_factors(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        assert len(spec["factors"]) == 3

    def test_positions_continuous_across_factors(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        all_positions = []
        for f in spec["factors"]:
            all_positions.extend(it["position"] for it in f["items"])
        assert all_positions == list(range(1, 10))

    def test_uwes_uses_0_6_scale(self):
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        assert spec["scale_min"] == 0.0
        assert spec["scale_max"] == 6.0
        # Each factor: 3 items × 0 = 0, 3 items × 6 = 18
        for f in spec["factors"]:
            assert f["min_possible"] == 0.0
            assert f["max_possible"] == 18.0


# ---------------------------------------------------------------------------
# build_survey_spec — deploy behaviour
# ---------------------------------------------------------------------------


class TestDeploySpec:
    """Verify the spec that the deploy route handler uses to create DB records."""

    def setup_method(self):
        self.inst = _make_instrument(short_name="PSS-7", response_format="likert7", total_items=7)
        self.items = [
            _make_item(i + 1, f"Item {i+1}", reverse=(i % 2 == 0))
            for i in range(7)
        ]
        self.subscales = []

    def test_creates_correct_number_of_questions(self):
        """Full deploy: spec contains one item entry per instrument item."""
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        total = sum(len(f["items"]) for f in spec["factors"])
        assert total == 7

    def test_reverse_scored_propagated(self):
        """Items created with reverse=True appear as reverse_scored=True in spec."""
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        spec_items = spec["factors"][0]["items"]
        # items at indices 0, 2, 4, 6 were created with reverse=True
        assert spec_items[0]["reverse_scored"] is True
        assert spec_items[1]["reverse_scored"] is False
        assert spec_items[2]["reverse_scored"] is True

    def test_item_ids_subset_creates_only_those_items(self):
        """Passing item_ids limits the items in the spec."""
        subset_ids = ["item-1", "item-3", "item-5"]
        spec = build_survey_spec(self.inst, self.items, self.subscales, item_ids=subset_ids)
        total = sum(len(f["items"]) for f in spec["factors"])
        assert total == 3

    def test_spec_has_survey_name_and_description(self):
        """Spec carries the survey name/description the route uses to create Survey row."""
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        assert spec["survey_name"] == self.inst.name
        assert spec["survey_description"] == self.inst.description

    def test_other_format_maps_to_text_question_type(self):
        """Instruments with response_format='other' (e.g. PERMA 0–10) get type 'text'."""
        inst = _make_instrument(short_name="PERMA-18", response_format="other", total_items=3)
        items = [_make_item(i + 1, f"Item {i+1}") for i in range(3)]
        spec = build_survey_spec(inst, items, [])
        assert spec["question_type"] == "text"

    def test_likert5_format_maps_to_likert_5_question_type(self):
        inst = _make_instrument(short_name="X", response_format="likert5", total_items=3)
        items = [_make_item(i + 1, f"Item {i+1}") for i in range(3)]
        spec = build_survey_spec(inst, items, [])
        assert spec["question_type"] == "likert_5"
        assert spec["scale_min"] == 1.0
        assert spec["scale_max"] == 5.0

    def test_likert7_format_maps_to_likert_7_question_type(self):
        inst = _make_instrument(short_name="Y", response_format="likert7", total_items=3)
        items = [_make_item(i + 1, f"Item {i+1}") for i in range(3)]
        spec = build_survey_spec(inst, items, [])
        assert spec["question_type"] == "likert_7"
        assert spec["scale_min"] == 1.0
        assert spec["scale_max"] == 7.0

    def test_positions_are_sequential_from_one(self):
        """Positions must be 1-based and contiguous so survey renders correctly."""
        spec = build_survey_spec(self.inst, self.items, self.subscales)
        positions = [it["position"] for it in spec["factors"][0]["items"]]
        assert positions == list(range(1, 8))


# ---------------------------------------------------------------------------
# psychometric_warning
# ---------------------------------------------------------------------------


class TestPsychometricWarning:
    def test_no_warning_when_all_items_included(self):
        assert psychometric_warning(10, 10, 0.85) is None

    def test_warning_when_more_than_30_pct_removed(self):
        result = psychometric_warning(10, 6, 0.85)
        assert result is not None
        assert "30%" in result

    def test_mild_warning_when_items_removed_but_under_30_pct(self):
        result = psychometric_warning(10, 8, 0.80)
        assert result is not None
        assert "reliability" in result.lower()

    def test_no_warning_for_low_alpha_mild_removal(self):
        # If alpha is low to start with, removing a few items is less alarming
        result = psychometric_warning(10, 9, 0.55)
        assert result is None  # below 0.7 threshold
