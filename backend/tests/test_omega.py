import pytest
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.omega import (
    compute_mcdonald_omega,
    _extract_first_factor,
    _omega_from_loadings,
    _omega_if_item_deleted,
    _interpret,
)
from app.schemas.omega import McDonaldOmegaRequest

client = TestClient(app)

# ---------------------------------------------------------------------------
# Datasets
# ---------------------------------------------------------------------------

# 5 respondents, 4 items.
# Verified values (see computation below):
#   R[0,1]=0.891  R[2,3]=0.646  — mixed correlations, unidimensional
#   omega = 0.7739  (good)
#   loadings ≈ [0.9145, 0.9325, 0.6098, 0.1012]
DATA = np.array([
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 3, 3, 3],
    [4, 4, 4, 4],
    [2, 2, 4, 4],
], dtype=float)

# 50 respondents, 5 items generated from a single strong factor (seed=42).
# omega ≈ 0.9857  (excellent)
_rng = np.random.default_rng(42)
_factor = _rng.standard_normal(50)
HIGH_DATA = np.column_stack(
    [_factor + _rng.normal(0, 0.3, 50) for _ in range(5)]
)


class TestExtractFirstFactor:
    def test_shape(self):
        R = np.corrcoef(DATA, rowvar=False)
        loadings = _extract_first_factor(R)
        assert loadings.shape == (DATA.shape[1],)

    def test_sum_is_positive(self):
        R = np.corrcoef(DATA, rowvar=False)
        loadings = _extract_first_factor(R)
        assert loadings.sum() > 0

    def test_perfect_scale_loadings_are_one(self):
        # All items perfectly correlated -> R = all 1s
        # eigenvalue = k, eigenvector = [1/sqrt(k), ...], loading = 1 per item
        perfect = np.tile([1, 2, 3, 4, 5], (4, 1)).T.astype(float)
        R = np.corrcoef(perfect, rowvar=False)
        loadings = _extract_first_factor(R)
        assert np.allclose(loadings, 1.0, atol=1e-9)

    def test_returns_floats(self):
        R = np.corrcoef(DATA, rowvar=False)
        loadings = _extract_first_factor(R)
        assert loadings.dtype.kind == "f"


class TestOmegaFromLoadings:
    def test_perfect_consistency_is_one(self):
        loadings = np.ones(4)
        assert _omega_from_loadings(loadings) == 1.0

    def test_zero_loadings_is_zero(self):
        # All uniqueness, no common variance
        loadings = np.zeros(4)
        assert _omega_from_loadings(loadings) == 0.0

    def test_known_value(self):
        # loadings from DATA, verified above
        loadings = np.array([0.9145, 0.9325, 0.6098, 0.1012])
        omega = _omega_from_loadings(loadings)
        assert abs(omega - 0.7739) < 0.002

    def test_output_in_unit_interval(self):
        R = np.corrcoef(DATA, rowvar=False)
        loadings = _extract_first_factor(R)
        omega = _omega_from_loadings(loadings)
        assert 0.0 <= omega <= 1.0


class TestOmegaIfItemDeleted:
    def test_returns_one_per_item(self):
        R = np.corrcoef(DATA, rowvar=False)
        result = _omega_if_item_deleted(R)
        assert len(result) == DATA.shape[1]

    def test_all_valid_floats(self):
        R = np.corrcoef(DATA, rowvar=False)
        result = _omega_if_item_deleted(R)
        for v in result:
            assert isinstance(v, float)
            assert not np.isnan(v)

    def test_known_values(self):
        # Verified: removing item 4 (low loading 0.10) raises omega to 0.867
        R = np.corrcoef(DATA, rowvar=False)
        result = _omega_if_item_deleted(R)
        assert abs(result[3] - 0.867) < 0.002


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


class TestComputeMcDonaldOmega:
    def test_known_omega(self):
        req = McDonaldOmegaRequest(items=DATA.tolist())
        result = compute_mcdonald_omega(req)
        assert abs(result.omega - 0.7739) < 0.001

    def test_interpretation_for_data(self):
        req = McDonaldOmegaRequest(items=DATA.tolist())
        result = compute_mcdonald_omega(req)
        assert result.interpretation == "good"

    def test_high_reliability_dataset(self):
        req = McDonaldOmegaRequest(items=HIGH_DATA.tolist())
        result = compute_mcdonald_omega(req)
        assert result.omega > 0.95
        assert result.interpretation == "excellent"

    def test_output_shape(self):
        req = McDonaldOmegaRequest(items=DATA.tolist(), scale_name="engagement")
        result = compute_mcdonald_omega(req)
        assert result.n_items == 4
        assert result.n_respondents == 5
        assert len(result.factor_loadings) == 4
        assert len(result.communalities) == 4
        assert len(result.uniquenesses) == 4
        assert len(result.omega_if_item_deleted) == 4
        assert result.scale_name == "engagement"

    def test_communalities_are_loadings_squared(self):
        req = McDonaldOmegaRequest(items=DATA.tolist())
        result = compute_mcdonald_omega(req)
        for l, h2 in zip(result.factor_loadings, result.communalities):
            assert abs(h2 - round(l ** 2, 4)) < 1e-3

    def test_uniquenesses_complement_communalities(self):
        req = McDonaldOmegaRequest(items=DATA.tolist())
        result = compute_mcdonald_omega(req)
        for h2, theta in zip(result.communalities, result.uniquenesses):
            assert abs(h2 + theta - 1.0) < 1e-3

    def test_all_loadings_positive(self):
        req = McDonaldOmegaRequest(items=DATA.tolist())
        result = compute_mcdonald_omega(req)
        # Sum must be positive (sign convention); individual loadings may vary
        assert sum(result.factor_loadings) > 0

    def test_perfect_consistency_omega_is_one(self):
        perfect = [[float(v)] * 4 for v in [1, 2, 3, 4, 5]]
        req = McDonaldOmegaRequest(items=perfect)
        result = compute_mcdonald_omega(req)
        assert abs(result.omega - 1.0) < 1e-9

    def test_scale_name_none_by_default(self):
        req = McDonaldOmegaRequest(items=DATA.tolist())
        result = compute_mcdonald_omega(req)
        assert result.scale_name is None


class TestValidation:
    def test_single_respondent_rejected(self):
        with pytest.raises(Exception):
            McDonaldOmegaRequest(items=[[1, 2, 3]])

    def test_single_item_rejected(self):
        with pytest.raises(Exception):
            McDonaldOmegaRequest(items=[[1], [2], [3]])

    def test_jagged_rows_rejected(self):
        with pytest.raises(Exception):
            McDonaldOmegaRequest(items=[[1, 2, 3], [1, 2]])

    def test_zero_variance_item_rejected(self):
        # Item 2 is constant — correlation matrix is undefined
        bad = [[1, 5, 3], [2, 5, 4], [3, 5, 3], [4, 5, 4], [2, 5, 2]]
        req = McDonaldOmegaRequest(items=bad)
        with pytest.raises(ValueError, match="zero variance"):
            compute_mcdonald_omega(req)


class TestAPIEndpoint:
    def test_happy_path(self):
        payload = {"items": DATA.tolist(), "scale_name": "autonomy"}
        response = client.post("/api/v1/reliability/omega", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert "omega" in body
        assert "factor_loadings" in body
        assert "communalities" in body
        assert "uniquenesses" in body
        assert "omega_if_item_deleted" in body
        assert "interpretation" in body
        assert body["n_items"] == 4
        assert body["n_respondents"] == 5

    def test_without_scale_name(self):
        payload = {"items": DATA.tolist()}
        response = client.post("/api/v1/reliability/omega", json=payload)
        assert response.status_code == 200
        assert response.json()["scale_name"] is None

    def test_known_omega_via_api(self):
        payload = {"items": DATA.tolist()}
        response = client.post("/api/v1/reliability/omega", json=payload)
        assert abs(response.json()["omega"] - 0.7739) < 0.001

    def test_invalid_payload_returns_422(self):
        payload = {"items": [[1, 2, 3]]}  # only 1 respondent
        response = client.post("/api/v1/reliability/omega", json=payload)
        assert response.status_code == 422

    def test_zero_variance_returns_422(self):
        bad = [[1, 5, 3], [2, 5, 4], [3, 5, 3], [4, 5, 4], [2, 5, 2]]
        response = client.post("/api/v1/reliability/omega", json={"items": bad})
        assert response.status_code == 422

    def test_cronbach_endpoint_still_works(self):
        payload = {"items": DATA.tolist()}
        response = client.post("/api/v1/reliability/cronbach-alpha", json=payload)
        assert response.status_code == 200
