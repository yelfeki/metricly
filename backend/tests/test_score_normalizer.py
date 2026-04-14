"""Tests for app.services.score_normalizer."""

import pytest

from app.services.score_normalizer import get_label, normalize


# ---------------------------------------------------------------------------
# normalize()
# ---------------------------------------------------------------------------


class TestNormalize:
    def test_midpoint(self):
        """Raw midpoint maps to normalized midpoint."""
        assert normalize(3.0, 1.0, 5.0) == pytest.approx(50.0)

    def test_minimum_maps_to_normalized_min(self):
        assert normalize(1.0, 1.0, 5.0) == pytest.approx(0.0)

    def test_maximum_maps_to_normalized_max(self):
        assert normalize(5.0, 1.0, 5.0) == pytest.approx(100.0)

    def test_custom_normalized_range(self):
        """Maps correctly to a non-default [20, 80] scale."""
        result = normalize(3.0, 1.0, 5.0, normalized_min=20.0, normalized_max=80.0)
        assert result == pytest.approx(50.0)

    def test_custom_normalized_range_minimum(self):
        result = normalize(1.0, 1.0, 5.0, normalized_min=20.0, normalized_max=80.0)
        assert result == pytest.approx(20.0)

    def test_custom_normalized_range_maximum(self):
        result = normalize(5.0, 1.0, 5.0, normalized_min=20.0, normalized_max=80.0)
        assert result == pytest.approx(80.0)

    def test_degenerate_range_returns_normalized_min(self):
        """min_possible == max_possible — avoid division by zero."""
        assert normalize(3.0, 5.0, 5.0) == pytest.approx(0.0)

    def test_degenerate_range_custom_normalized_min(self):
        assert normalize(3.0, 5.0, 5.0, normalized_min=25.0, normalized_max=75.0) == pytest.approx(25.0)

    def test_out_of_range_below(self):
        """Values below min_possible produce results below normalized_min (not clamped)."""
        result = normalize(0.0, 1.0, 5.0)
        assert result < 0.0

    def test_out_of_range_above(self):
        """Values above max_possible produce results above normalized_max (not clamped)."""
        result = normalize(6.0, 1.0, 5.0)
        assert result > 100.0

    def test_likert_7_quarter(self):
        """1-based 7-point scale: raw=2.5 → approx 25%."""
        result = normalize(2.5, 1.0, 7.0)
        assert result == pytest.approx(25.0)

    def test_float_precision(self):
        result = normalize(4.333, 1.0, 7.0)
        expected = (4.333 - 1.0) / (7.0 - 1.0) * 100.0
        assert result == pytest.approx(expected, rel=1e-6)


# ---------------------------------------------------------------------------
# get_label()
# ---------------------------------------------------------------------------


LABELS = [
    {"threshold": 80.0, "label": "Advanced", "color": "#22c55e"},
    {"threshold": 60.0, "label": "Proficient", "color": "#3b82f6"},
    {"threshold": 40.0, "label": "Developing", "color": "#f59e0b"},
]


class TestGetLabel:
    def test_returns_none_for_empty_labels(self):
        assert get_label(75.0, []) is None

    def test_returns_none_below_all_thresholds(self):
        assert get_label(20.0, LABELS) is None

    def test_exactly_at_lowest_threshold(self):
        result = get_label(40.0, LABELS)
        assert result == {"label": "Developing", "color": "#f59e0b"}

    def test_between_two_thresholds(self):
        result = get_label(55.0, LABELS)
        assert result == {"label": "Developing", "color": "#f59e0b"}

    def test_exactly_at_middle_threshold(self):
        result = get_label(60.0, LABELS)
        assert result == {"label": "Proficient", "color": "#3b82f6"}

    def test_between_high_thresholds(self):
        result = get_label(70.0, LABELS)
        assert result == {"label": "Proficient", "color": "#3b82f6"}

    def test_exactly_at_highest_threshold(self):
        result = get_label(80.0, LABELS)
        assert result == {"label": "Advanced", "color": "#22c55e"}

    def test_above_highest_threshold(self):
        result = get_label(99.9, LABELS)
        assert result == {"label": "Advanced", "color": "#22c55e"}

    def test_unsorted_input_is_handled(self):
        """Labels not sorted by threshold should still resolve correctly."""
        unsorted = [
            {"threshold": 40.0, "label": "Developing", "color": "#f59e0b"},
            {"threshold": 80.0, "label": "Advanced", "color": "#22c55e"},
            {"threshold": 60.0, "label": "Proficient", "color": "#3b82f6"},
        ]
        assert get_label(85.0, unsorted) == {"label": "Advanced", "color": "#22c55e"}
        assert get_label(65.0, unsorted) == {"label": "Proficient", "color": "#3b82f6"}
        assert get_label(45.0, unsorted) == {"label": "Developing", "color": "#f59e0b"}

    def test_single_threshold_above(self):
        labels = [{"threshold": 50.0, "label": "Pass", "color": "#22c55e"}]
        assert get_label(50.0, labels) == {"label": "Pass", "color": "#22c55e"}

    def test_single_threshold_below(self):
        labels = [{"threshold": 50.0, "label": "Pass", "color": "#22c55e"}]
        assert get_label(49.9, labels) is None

    def test_zero_threshold_matches_zero_score(self):
        labels = [{"threshold": 0.0, "label": "Any", "color": "#000000"}]
        assert get_label(0.0, labels) == {"label": "Any", "color": "#000000"}

    def test_zero_threshold_with_negative_score(self):
        """Negative scores (out-of-range) are below even threshold 0."""
        labels = [{"threshold": 0.0, "label": "Any", "color": "#000000"}]
        assert get_label(-1.0, labels) is None
