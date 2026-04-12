import pytest
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.reliability import (
    compute_cronbach_alpha,
    _cronbach_alpha,
    _item_total_correlations,
    _alpha_if_item_deleted,
    _interpret,
)
from app.schemas.reliability import CronbachAlphaRequest

client = TestClient(app)

# ---------------------------------------------------------------------------
# Known-answer dataset (hand-verifiable)
# 5 respondents, 4 items — alpha ≈ 0.8332 per standard formula
# ---------------------------------------------------------------------------
DATA = np.array([
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 3, 3, 3],
    [4, 4, 4, 4],
    [2, 2, 4, 4],
], dtype=float)


class TestCronbachAlphaFormula:
    def test_known_value(self):
        # Verified by hand: sum of item variances = 2.8, total score variance = 5.2
        # alpha = (4/3) * (1 - 2.8/5.2) = 0.6154
        alpha = _cronbach_alpha(DATA)
        assert abs(alpha - 0.6154) < 0.001

    def test_perfect_consistency(self):
        # All items identical — alpha should be 1.0
        perfect = np.tile([1, 2, 3, 4, 5], (4, 1)).T  # 5 respondents, 4 identical items
        assert abs(_cronbach_alpha(perfect) - 1.0) < 1e-9

    def test_zero_variance_returns_zero(self):
        # All scores the same — total variance is 0
        flat = np.ones((5, 4))
        assert _cronbach_alpha(flat) == 0.0

    def test_two_items_minimum(self):
        two_item = DATA[:, :2]
        alpha = _cronbach_alpha(two_item)
        assert 0.0 <= alpha <= 1.0


class TestItemTotalCorrelations:
    def test_returns_one_per_item(self):
        corrs = _item_total_correlations(DATA)
        assert len(corrs) == DATA.shape[1]

    def test_values_in_range(self):
        corrs = _item_total_correlations(DATA)
        for r in corrs:
            assert -1.0 <= r <= 1.0


class TestAlphaIfItemDeleted:
    def test_returns_one_per_item(self):
        alphas = _alpha_if_item_deleted(DATA)
        assert len(alphas) == DATA.shape[1]

    def test_all_valid_floats(self):
        alphas = _alpha_if_item_deleted(DATA)
        for a in alphas:
            assert isinstance(a, float)
            assert not np.isnan(a)


class TestInterpret:
    def test_poor(self):
        assert _interpret(0.50) == "poor"

    def test_acceptable(self):
        assert _interpret(0.65) == "acceptable"

    def test_good(self):
        assert _interpret(0.80) == "good"

    def test_excellent(self):
        assert _interpret(0.95) == "excellent"

    def test_boundary_acceptable(self):
        assert _interpret(0.60) == "acceptable"

    def test_boundary_good(self):
        assert _interpret(0.70) == "good"

    def test_boundary_excellent(self):
        assert _interpret(0.90) == "excellent"


class TestComputeCronbachAlpha:
    def test_full_output_shape(self):
        req = CronbachAlphaRequest(items=DATA.tolist(), scale_name="test scale")
        result = compute_cronbach_alpha(req)
        assert result.n_items == 4
        assert result.n_respondents == 5
        assert len(result.item_total_correlations) == 4
        assert len(result.alpha_if_item_deleted) == 4
        assert result.scale_name == "test scale"
        assert result.interpretation in {"poor", "acceptable", "good", "excellent"}

    def test_alpha_matches_formula(self):
        req = CronbachAlphaRequest(items=DATA.tolist())
        result = compute_cronbach_alpha(req)
        assert abs(result.alpha - 0.6154) < 0.001


class TestValidation:
    def test_single_respondent_rejected(self):
        with pytest.raises(Exception):
            CronbachAlphaRequest(items=[[1, 2, 3]])

    def test_single_item_rejected(self):
        with pytest.raises(Exception):
            CronbachAlphaRequest(items=[[1], [2], [3]])

    def test_jagged_rows_rejected(self):
        with pytest.raises(Exception):
            CronbachAlphaRequest(items=[[1, 2, 3], [1, 2]])


class TestAPIEndpoint:
    def test_happy_path(self):
        payload = {"items": DATA.tolist(), "scale_name": "engagement"}
        response = client.post("/api/v1/reliability/cronbach-alpha", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert "alpha" in body
        assert "interpretation" in body
        assert body["n_items"] == 4
        assert body["n_respondents"] == 5

    def test_without_scale_name(self):
        payload = {"items": DATA.tolist()}
        response = client.post("/api/v1/reliability/cronbach-alpha", json=payload)
        assert response.status_code == 200
        assert response.json()["scale_name"] is None

    def test_invalid_payload_returns_422(self):
        payload = {"items": [[1, 2, 3]]}  # only 1 respondent
        response = client.post("/api/v1/reliability/cronbach-alpha", json=payload)
        assert response.status_code == 422

    def test_health_endpoint(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
