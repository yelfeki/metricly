import pytest
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.dif import (
    compute_dif,
    _mh_dif_item,
    _lr_dif_item,
    _mh_effect_label,
    _lr_effect_label,
    _item_recommendation,
    _summary_recommendation,
)
from app.schemas.dif import DIFRequest

client = TestClient(app)

# ---------------------------------------------------------------------------
# Datasets (fixed seeds for reproducibility)
# ---------------------------------------------------------------------------
# 150 respondents per group, 5 binary items.
#
# NO_DIF: items generated from the same IRT parameters for both groups.
#   Pre-computed: all items p > 0.05 and negligible effect → 0 flagged.
#
# DIF:    Item 0 is 2.5 logits easier for the reference group.
#   Pre-computed: item 0 flagged by both MH (χ²≈39.0, Δ≈-5.65)
#                 and LR (R²Δ≈0.22, type=uniform).

_rng = np.random.default_rng(42)
_N = 150
_diff = np.array([-0.5, 0.0, 0.5, -0.3, 0.3])

_ab_ref = _rng.standard_normal(_N) + 0.2
_ab_foc = _rng.standard_normal(_N)

from scipy.special import expit as _expit

def _gen(ability, diff, rng):
    p = _expit(ability.reshape(-1, 1) - diff.reshape(1, -1))
    return (rng.random((len(ability), len(diff))) < p).astype(int)

_no_dif_ref = _gen(_ab_ref, _diff, _rng)
_no_dif_foc = _gen(_ab_foc, _diff, _rng)
NO_DIF_R = np.vstack([_no_dif_ref, _no_dif_foc])
NO_DIF_G = np.array([0] * _N + [1] * _N)

_dif_ref = _gen(_ab_ref, _diff, _rng)
_dif_ref[:, 0] = (_rng.random(_N) < _expit(_ab_ref - _diff[0] + 2.5)).astype(int)
_dif_foc = _gen(_ab_foc, _diff, _rng)
DIF_R = np.vstack([_dif_ref, _dif_foc])
DIF_G = np.array([0] * _N + [1] * _N)


# ---------------------------------------------------------------------------
# _mh_effect_label
# ---------------------------------------------------------------------------

class TestMHEffectLabel:
    def test_negligible(self):
        assert _mh_effect_label(0.5) == "negligible"

    def test_negligible_negative(self):
        assert _mh_effect_label(-0.9) == "negligible"

    def test_moderate(self):
        assert _mh_effect_label(1.2) == "moderate"

    def test_moderate_negative(self):
        assert _mh_effect_label(-1.3) == "moderate"

    def test_large(self):
        assert _mh_effect_label(2.0) == "large"

    def test_large_negative(self):
        assert _mh_effect_label(-3.5) == "large"

    def test_boundary_negligible_to_moderate(self):
        assert _mh_effect_label(1.0) == "moderate"

    def test_boundary_moderate_to_large(self):
        assert _mh_effect_label(1.5) == "large"


# ---------------------------------------------------------------------------
# _lr_effect_label
# ---------------------------------------------------------------------------

class TestLREffectLabel:
    def test_negligible(self):
        assert _lr_effect_label(0.01) == "negligible"

    def test_moderate(self):
        assert _lr_effect_label(0.05) == "moderate"

    def test_large(self):
        assert _lr_effect_label(0.08) == "large"

    def test_boundary_negligible_to_moderate(self):
        assert _lr_effect_label(0.035) == "moderate"

    def test_boundary_moderate_to_large(self):
        assert _lr_effect_label(0.070) == "large"


# ---------------------------------------------------------------------------
# _mh_dif_item
# ---------------------------------------------------------------------------

class TestMHDIFItem:
    def test_no_dif_item_not_significant(self):
        # Pre-computed: item 0 in NO_DIF has p ≈ 0.42
        result = _mh_dif_item(NO_DIF_R, NO_DIF_G, 0)
        assert result["p_value"] > 0.05

    def test_dif_item_highly_significant(self):
        # Pre-computed: item 0 in DIF has χ² ≈ 39.0, p ≈ 0
        result = _mh_dif_item(DIF_R, DIF_G, 0)
        assert result["chi_square"] > 20.0
        assert result["p_value"] < 0.001

    def test_dif_item_large_delta(self):
        # Pre-computed: Δ ≈ -5.65 (large effect, favours reference group)
        result = _mh_dif_item(DIF_R, DIF_G, 0)
        assert abs(result["delta"]) > 3.0

    def test_no_dif_negligible_effect(self):
        result = _mh_dif_item(NO_DIF_R, NO_DIF_G, 0)
        assert _mh_effect_label(result["delta"]) == "negligible"

    def test_dif_large_effect(self):
        result = _mh_dif_item(DIF_R, DIF_G, 0)
        assert _mh_effect_label(result["delta"]) == "large"

    def test_returns_required_keys(self):
        result = _mh_dif_item(NO_DIF_R, NO_DIF_G, 0)
        for key in ("chi_square", "p_value", "odds_ratio", "delta"):
            assert key in result

    def test_chi_square_non_negative(self):
        for i in range(5):
            assert _mh_dif_item(NO_DIF_R, NO_DIF_G, i)["chi_square"] >= 0.0

    def test_p_value_in_unit_interval(self):
        for i in range(5):
            p = _mh_dif_item(NO_DIF_R, NO_DIF_G, i)["p_value"]
            assert 0.0 <= p <= 1.0


# ---------------------------------------------------------------------------
# _lr_dif_item
# ---------------------------------------------------------------------------

class TestLRDIFItem:
    def test_no_dif_item_type_is_none(self):
        result = _lr_dif_item(NO_DIF_R, NO_DIF_G, 0, alpha=0.05)
        assert result["dif_type"] == "none"

    def test_no_dif_item_negligible_r2(self):
        result = _lr_dif_item(NO_DIF_R, NO_DIF_G, 0, alpha=0.05)
        assert result["r2_change"] < 0.035

    def test_dif_item_uniform_type(self):
        # Pre-computed: item 0 in DIF shows uniform DIF (group main effect)
        result = _lr_dif_item(DIF_R, DIF_G, 0, alpha=0.05)
        assert result["dif_type"] == "uniform"

    def test_dif_item_large_r2(self):
        # Pre-computed: R²Δ ≈ 0.22
        result = _lr_dif_item(DIF_R, DIF_G, 0, alpha=0.05)
        assert result["r2_change"] > 0.07

    def test_dif_item_large_effect(self):
        result = _lr_dif_item(DIF_R, DIF_G, 0, alpha=0.05)
        assert _lr_effect_label(result["r2_change"]) == "large"

    def test_returns_required_keys(self):
        result = _lr_dif_item(NO_DIF_R, NO_DIF_G, 0, alpha=0.05)
        for key in ("chi_square", "p_value", "r2_change", "dif_type"):
            assert key in result

    def test_r2_change_non_negative(self):
        for i in range(5):
            assert _lr_dif_item(NO_DIF_R, NO_DIF_G, i, alpha=0.05)["r2_change"] >= 0.0

    def test_p_value_in_unit_interval(self):
        for i in range(5):
            p = _lr_dif_item(NO_DIF_R, NO_DIF_G, i, alpha=0.05)["p_value"]
            assert 0.0 <= p <= 1.0


# ---------------------------------------------------------------------------
# _item_recommendation
# ---------------------------------------------------------------------------

class TestItemRecommendation:
    def test_no_dif(self):
        rec = _item_recommendation(False, False, "none", "negligible", "negligible")
        assert "No DIF" in rec

    def test_mh_only(self):
        rec = _item_recommendation(True, False, "none", "large", "negligible")
        assert "MH" in rec

    def test_lr_only(self):
        rec = _item_recommendation(False, True, "uniform", "negligible", "moderate")
        assert "LR" in rec

    def test_both_methods(self):
        rec = _item_recommendation(True, True, "uniform", "large", "large")
        assert "both" in rec

    def test_large_effect_recommends_removal(self):
        rec = _item_recommendation(True, True, "uniform", "large", "large")
        assert "removing" in rec.lower() or "revising" in rec.lower()

    def test_non_uniform_label(self):
        rec = _item_recommendation(False, True, "non-uniform", "negligible", "large")
        assert "non-uniform" in rec.lower()

    def test_moderate_effect_recommends_review(self):
        rec = _item_recommendation(True, False, "uniform", "moderate", "negligible")
        assert "review" in rec.lower() or "monitor" in rec.lower()


# ---------------------------------------------------------------------------
# _summary_recommendation
# ---------------------------------------------------------------------------

class TestSummaryRecommendation:
    def test_no_flags(self):
        rec = _summary_recommendation(0, 10)
        assert "No items" in rec or "unbiased" in rec.lower()

    def test_some_flags(self):
        rec = _summary_recommendation(2, 10)
        assert "2" in rec

    def test_high_proportion_triggers_revision(self):
        rec = _summary_recommendation(4, 10)  # 40% > 20%
        assert "revision" in rec.lower() or "high proportion" in rec.lower()

    def test_low_proportion_triggers_review(self):
        rec = _summary_recommendation(1, 10)
        assert "review" in rec.lower()


# ---------------------------------------------------------------------------
# compute_dif (integration)
# ---------------------------------------------------------------------------

class TestComputeDIF:
    def test_output_structure(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist())
        result = compute_dif(req)
        assert result.n_items == 5
        assert result.n_respondents == 2 * _N
        assert len(result.items) == 5

    def test_item_result_fields(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist())
        item = compute_dif(req).items[0]
        for attr in (
            "item_index", "mh_chi_square", "mh_p_value", "mh_odds_ratio",
            "mh_delta", "mh_effect_size", "mh_dif_detected",
            "lr_chi_square", "lr_p_value", "lr_r2_change", "lr_effect_size",
            "lr_dif_type", "lr_dif_detected", "dif_detected", "recommendation",
        ):
            assert hasattr(item, attr)

    def test_no_dif_dataset_zero_flagged(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist())
        result = compute_dif(req)
        assert result.n_items_flagged_either == 0
        assert result.flagged_item_indices == []

    def test_dif_dataset_item_0_flagged(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        result = compute_dif(req)
        assert 0 in result.flagged_item_indices

    def test_dif_dataset_item_0_both_methods(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        item0 = compute_dif(req).items[0]
        assert item0.mh_dif_detected is True
        assert item0.lr_dif_detected is True
        assert item0.dif_detected is True

    def test_dif_dataset_item_0_large_delta(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        item0 = compute_dif(req).items[0]
        assert abs(item0.mh_delta) > 3.0
        assert item0.mh_effect_size == "large"

    def test_dif_dataset_item_0_large_r2(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        item0 = compute_dif(req).items[0]
        assert item0.lr_r2_change > 0.07
        assert item0.lr_effect_size == "large"

    def test_dif_dataset_item_0_uniform_type(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        item0 = compute_dif(req).items[0]
        assert item0.lr_dif_type == "uniform"

    def test_no_dif_summary_says_unbiased(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist())
        result = compute_dif(req)
        assert "unbiased" in result.summary_recommendation.lower() or \
               "no items" in result.summary_recommendation.lower()

    def test_dif_summary_mentions_flagged_count(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        result = compute_dif(req)
        assert str(result.n_items_flagged_either) in result.summary_recommendation

    def test_flagged_indices_consistent_with_items(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        result = compute_dif(req)
        detected = [r.item_index for r in result.items if r.dif_detected]
        assert result.flagged_item_indices == detected

    def test_mh_count_consistent(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        result = compute_dif(req)
        manual = sum(1 for r in result.items if r.mh_dif_detected)
        assert result.n_items_flagged_mh == manual

    def test_lr_count_consistent(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        result = compute_dif(req)
        manual = sum(1 for r in result.items if r.lr_dif_detected)
        assert result.n_items_flagged_lr == manual

    def test_alpha_override_stricter(self):
        # alpha=0.001 should not flag anything in the no-DIF dataset
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist(), alpha=0.001)
        result = compute_dif(req)
        assert result.n_items_flagged_either == 0

    def test_scale_name_passed_through(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist(), scale_name="engagement")
        assert compute_dif(req).scale_name == "engagement"

    def test_scale_name_none_default(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist())
        assert compute_dif(req).scale_name is None

    def test_item_indices_sequential(self):
        req = DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist())
        indices = [r.item_index for r in compute_dif(req).items]
        assert indices == list(range(5))

    def test_item_recommendations_are_strings(self):
        req = DIFRequest(responses=DIF_R.tolist(), groups=DIF_G.tolist())
        for item in compute_dif(req).items:
            assert isinstance(item.recommendation, str) and len(item.recommendation) > 0


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestValidation:
    def test_too_few_respondents(self):
        with pytest.raises(Exception):
            DIFRequest(responses=[[1, 0], [0, 1]], groups=[0, 1])

    def test_single_item_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=[[1]] * 10, groups=[0] * 5 + [1] * 5)

    def test_jagged_rows_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=[[1, 0], [1, 0, 1]] * 5, groups=[0] * 5 + [1] * 5)

    def test_non_binary_response_rejected(self):
        bad = [[1, 2, 0]] * 10
        with pytest.raises(Exception):
            DIFRequest(responses=bad, groups=[0] * 5 + [1] * 5)

    def test_non_binary_group_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=NO_DIF_R.tolist(), groups=[2] * len(NO_DIF_G))

    def test_groups_length_mismatch_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=NO_DIF_R.tolist(), groups=[0, 1])

    def test_only_reference_group_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=NO_DIF_R.tolist(), groups=[0] * len(NO_DIF_G))

    def test_only_focal_group_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=NO_DIF_R.tolist(), groups=[1] * len(NO_DIF_G))

    def test_alpha_out_of_range_rejected(self):
        with pytest.raises(Exception):
            DIFRequest(responses=NO_DIF_R.tolist(), groups=NO_DIF_G.tolist(), alpha=1.5)

    def test_zero_variance_item_rejected(self):
        bad = NO_DIF_R.copy()
        bad[:, 0] = 1  # constant item
        req = DIFRequest(responses=bad.tolist(), groups=NO_DIF_G.tolist())
        with pytest.raises(ValueError, match="zero variance"):
            compute_dif(req)


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

class TestAPIEndpoint:
    def test_happy_path_no_dif(self):
        payload = {"responses": NO_DIF_R.tolist(), "groups": NO_DIF_G.tolist()}
        response = client.post("/api/v1/dif", json=payload)
        assert response.status_code == 200
        body = response.json()
        for key in (
            "items", "n_items_flagged_mh", "n_items_flagged_lr",
            "n_items_flagged_either", "flagged_item_indices",
            "summary_recommendation", "n_items", "n_respondents",
        ):
            assert key in body

    def test_dif_dataset_flags_item_0(self):
        payload = {"responses": DIF_R.tolist(), "groups": DIF_G.tolist()}
        response = client.post("/api/v1/dif", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert 0 in body["flagged_item_indices"]
        assert body["items"][0]["mh_dif_detected"] is True
        assert body["items"][0]["lr_dif_detected"] is True

    def test_scale_name_via_api(self):
        payload = {
            "responses": NO_DIF_R.tolist(),
            "groups": NO_DIF_G.tolist(),
            "scale_name": "bias_check",
        }
        response = client.post("/api/v1/dif", json=payload)
        assert response.json()["scale_name"] == "bias_check"

    def test_invalid_payload_returns_422(self):
        response = client.post("/api/v1/dif", json={"responses": [[1, 0]], "groups": [0]})
        assert response.status_code == 422

    def test_zero_variance_returns_422(self):
        bad = NO_DIF_R.copy()
        bad[:, 0] = 1
        payload = {"responses": bad.tolist(), "groups": NO_DIF_G.tolist()}
        response = client.post("/api/v1/dif", json=payload)
        assert response.status_code == 422

    def test_prior_endpoints_unaffected(self):
        from tests.test_reliability import DATA as R_DATA
        assert client.post(
            "/api/v1/reliability/cronbach-alpha", json={"items": R_DATA.tolist()}
        ).status_code == 200
        assert client.post(
            "/api/v1/reliability/omega", json={"items": R_DATA.tolist()}
        ).status_code == 200
