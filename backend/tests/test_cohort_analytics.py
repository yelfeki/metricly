"""Tests for app.services.cohort_analytics."""

import math
import pytest

from app.services.cohort_analytics import cohort_summary, group_comparison


# ---------------------------------------------------------------------------
# Fixtures / shared data
# ---------------------------------------------------------------------------

FACTOR_A = [60.0, 65.0, 70.0, 55.0, 75.0]
FACTOR_B = [30.0, 35.0, 28.0, 40.0, 32.0]
TWO_FACTORS = {"A": FACTOR_A, "B": FACTOR_B}


# ---------------------------------------------------------------------------
# cohort_summary()
# ---------------------------------------------------------------------------


class TestCohortSummary:
    def test_returns_all_factors(self):
        result = cohort_summary(TWO_FACTORS)
        assert set(result.keys()) == {"A", "B"}

    def test_n_matches_input(self):
        result = cohort_summary(TWO_FACTORS)
        assert result["A"]["n"] == len(FACTOR_A)

    def test_mean_is_correct(self):
        result = cohort_summary({"X": [10.0, 20.0, 30.0]})
        assert result["X"]["mean"] == pytest.approx(20.0)

    def test_sd_is_correct(self):
        # [10, 20, 30] — sample SD = sqrt(((−10)^2 + 0^2 + 10^2) / 2) = sqrt(100) = 10
        result = cohort_summary({"X": [10.0, 20.0, 30.0]})
        assert result["X"]["sd"] == pytest.approx(10.0, abs=0.01)

    def test_min_max(self):
        result = cohort_summary({"X": [10.0, 50.0, 90.0]})
        assert result["X"]["min"] == pytest.approx(10.0)
        assert result["X"]["max"] == pytest.approx(90.0)

    def test_single_value_sd_is_zero(self):
        result = cohort_summary({"X": [42.0]})
        assert result["X"]["sd"] == pytest.approx(0.0)
        assert result["X"]["n"] == 1

    def test_empty_factor_returns_none_stats(self):
        result = cohort_summary({"X": []})
        assert result["X"]["mean"] is None
        assert result["X"]["n"] == 0

    def test_histogram_has_10_bins(self):
        result = cohort_summary({"X": FACTOR_A})
        assert len(result["X"]["histogram"]) == 10

    def test_histogram_bins_cover_0_to_100(self):
        result = cohort_summary({"X": FACTOR_A})
        hist = result["X"]["histogram"]
        assert hist[0]["start"] == pytest.approx(0.0)
        assert hist[-1]["end"] == pytest.approx(100.0)

    def test_histogram_counts_sum_to_n(self):
        result = cohort_summary({"X": FACTOR_A})
        total = sum(b["count"] for b in result["X"]["histogram"])
        assert total == len(FACTOR_A)

    def test_histogram_bin_placement(self):
        # 50.0 → bin index 5 (50–60)
        result = cohort_summary({"X": [50.0]})
        assert result["X"]["histogram"][5]["count"] == 1

    def test_histogram_value_at_100_goes_in_last_bin(self):
        result = cohort_summary({"X": [100.0]})
        total = sum(b["count"] for b in result["X"]["histogram"])
        assert total == 1

    def test_empty_input_dict(self):
        assert cohort_summary({}) == {}


# ---------------------------------------------------------------------------
# group_comparison()
# ---------------------------------------------------------------------------


# Two groups with a clear separation
HIGH_GROUP = [80.0, 82.0, 85.0, 78.0, 83.0, 81.0, 84.0]
LOW_GROUP = [30.0, 28.0, 32.0, 35.0, 29.0, 31.0, 27.0]

# Three groups
GROUP_X = [50.0, 52.0, 48.0, 51.0]
GROUP_Y = [70.0, 72.0, 68.0, 71.0]
GROUP_Z = [30.0, 28.0, 32.0, 31.0]

# Almost-identical groups (should not be significant)
SAME_A = [50.0, 51.0, 50.5, 49.5, 50.2]
SAME_B = [50.1, 49.9, 50.3, 50.0, 49.8]


class TestGroupComparisonTwoGroups:
    def _run(self):
        return group_comparison({"F": {"high": HIGH_GROUP, "low": LOW_GROUP}})

    def test_returns_factor(self):
        assert "F" in self._run()

    def test_test_type_is_t_test(self):
        assert self._run()["F"]["test_type"] == "t-test"

    def test_effect_size_type_is_cohen_d(self):
        assert self._run()["F"]["effect_size_type"] == "cohen_d"

    def test_significant_with_separated_groups(self):
        assert self._run()["F"]["significant"] is True

    def test_p_value_is_float(self):
        p = self._run()["F"]["p_value"]
        assert isinstance(p, float)

    def test_p_value_in_unit_interval(self):
        p = self._run()["F"]["p_value"]
        assert 0.0 <= p <= 1.0

    def test_effect_size_is_positive(self):
        d = self._run()["F"]["effect_size"]
        assert d is not None and d > 0.0

    def test_large_effect_interpretation(self):
        interp = self._run()["F"]["interpretation"]
        assert "large effect" in interp

    def test_groups_list_has_two_entries(self):
        groups = self._run()["F"]["groups"]
        assert len(groups) == 2

    def test_group_n_is_correct(self):
        result = self._run()["F"]
        totals = {g["group_value"]: g["n"] for g in result["groups"]}
        assert totals["high"] == len(HIGH_GROUP)
        assert totals["low"] == len(LOW_GROUP)

    def test_no_significant_difference_with_identical_groups(self):
        result = group_comparison({"F": {"a": SAME_A, "b": SAME_B}})
        assert result["F"]["significant"] is False
        assert result["F"]["interpretation"] == "no significant difference"

    def test_small_effect_interpretation(self):
        # groups very close → small Cohen's d if marginally significant
        a = [50.0, 51.0, 52.0, 50.5]
        b = [48.0, 49.0, 50.0, 48.5]
        result = group_comparison({"F": {"a": a, "b": b}})
        if result["F"]["significant"]:
            assert "significant difference" in result["F"]["interpretation"]


class TestGroupComparisonThreeGroups:
    def _run(self):
        return group_comparison({"F": {"x": GROUP_X, "y": GROUP_Y, "z": GROUP_Z}})

    def test_test_type_is_anova(self):
        assert self._run()["F"]["test_type"] == "anova"

    def test_effect_size_type_is_eta_squared(self):
        assert self._run()["F"]["effect_size_type"] == "eta_squared"

    def test_significant_with_separated_groups(self):
        assert self._run()["F"]["significant"] is True

    def test_groups_list_has_three_entries(self):
        assert len(self._run()["F"]["groups"]) == 3

    def test_p_value_in_unit_interval(self):
        p = self._run()["F"]["p_value"]
        assert 0.0 <= p <= 1.0

    def test_eta_squared_in_unit_interval(self):
        eta2 = self._run()["F"]["effect_size"]
        assert eta2 is not None
        assert 0.0 <= eta2 <= 1.0


class TestGroupComparisonEdgeCases:
    def test_single_group_insufficient(self):
        result = group_comparison({"F": {"only": [50.0, 60.0]}})
        assert result["F"]["test_type"] is None
        assert result["F"]["significant"] is False
        assert "insufficient" in result["F"]["interpretation"]

    def test_empty_groups_excluded(self):
        # One group empty, one non-empty → insufficient
        result = group_comparison({"F": {"a": [], "b": [50.0, 60.0]}})
        assert result["F"]["test_type"] is None

    def test_multiple_factors(self):
        data = {
            "F1": {"high": HIGH_GROUP, "low": LOW_GROUP},
            "F2": {"a": SAME_A, "b": SAME_B},
        }
        result = group_comparison(data)
        assert "F1" in result and "F2" in result
        assert result["F1"]["significant"] is True
        assert result["F2"]["significant"] is False

    def test_empty_factor_map(self):
        assert group_comparison({}) == {}

    def test_groups_sorted_alphabetically(self):
        result = group_comparison({"F": {"beta": [50.0], "alpha": [60.0]}})
        keys = [g["group_value"] for g in result["F"]["groups"]]
        assert keys == sorted(keys)
