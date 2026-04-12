import pytest
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.efa import (
    compute_efa,
    _smr,
    _paf,
    _kaiser_n_factors,
    _scree_n_factors,
    _variance_explained,
    _is_unidimensional,
)
from app.schemas.efa import EFARequest

client = TestClient(app)

# ---------------------------------------------------------------------------
# Datasets (fixed seeds for reproducibility)
# ---------------------------------------------------------------------------

# 5 respondents, 4 items — small sample, produces Heywood cases; used for
# structural / shape tests only, not numerical assertions.
DATA = np.array([
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 3, 3, 3],
    [4, 4, 4, 4],
    [2, 2, 4, 4],
], dtype=float)

# 100 respondents, 6 items generated from a single strong latent factor.
# Pre-computed: n_kaiser=1, n_scree=1, var_explained≈87.12%, ratio≈31.69
# → is_unidimensional=True
_rng = np.random.default_rng(42)
_fac = _rng.standard_normal(100)
UNI = np.column_stack([_fac + _rng.normal(0, 0.3, 100) for _ in range(6)])

# 100 respondents, 6 items — 3 items per orthogonal factor.
# Pre-computed: n_kaiser=2, n_scree=2 → is_unidimensional=False
_rng2 = np.random.default_rng(7)
_f1 = _rng2.standard_normal(100)
_f2 = _rng2.standard_normal(100)
BI = np.column_stack([
    _f1 + _rng2.normal(0, 0.5, 100),
    _f1 + _rng2.normal(0, 0.5, 100),
    _f1 + _rng2.normal(0, 0.5, 100),
    _f2 + _rng2.normal(0, 0.5, 100),
    _f2 + _rng2.normal(0, 0.5, 100),
    _f2 + _rng2.normal(0, 0.5, 100),
])


# ---------------------------------------------------------------------------
# _smr
# ---------------------------------------------------------------------------

class TestSMR:
    def test_shape(self):
        R = np.corrcoef(UNI, rowvar=False)
        h2 = _smr(R)
        assert h2.shape == (UNI.shape[1],)

    def test_values_in_unit_interval(self):
        R = np.corrcoef(UNI, rowvar=False)
        h2 = _smr(R)
        assert np.all(h2 >= 0.0) and np.all(h2 <= 1.0)

    def test_high_correlation_gives_high_smc(self):
        # Strongly correlated items → SMC close to 1
        R = np.corrcoef(UNI, rowvar=False)
        h2 = _smr(R)
        assert np.all(h2 > 0.8)


# ---------------------------------------------------------------------------
# _paf
# ---------------------------------------------------------------------------

class TestPAF:
    def test_shape_single_factor(self):
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        assert L.shape == (6, 1)

    def test_shape_two_factors(self):
        R = np.corrcoef(BI, rowvar=False)
        L = _paf(R, n_factors=2)
        assert L.shape == (6, 2)

    def test_loadings_finite(self):
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        assert np.all(np.isfinite(L))

    def test_single_factor_strong_loadings(self):
        # All items share one factor → all loadings should be substantial
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        assert np.all(np.abs(L[:, 0]) > 0.5)


# ---------------------------------------------------------------------------
# _kaiser_n_factors
# ---------------------------------------------------------------------------

class TestKaiser:
    def test_unifactorial_returns_one(self):
        R = np.corrcoef(UNI, rowvar=False)
        ev = np.sort(np.linalg.eigvalsh(R))[::-1]
        assert _kaiser_n_factors(ev) == 1

    def test_bifactorial_returns_two(self):
        R = np.corrcoef(BI, rowvar=False)
        ev = np.sort(np.linalg.eigvalsh(R))[::-1]
        assert _kaiser_n_factors(ev) == 2

    def test_minimum_is_one(self):
        # If no eigenvalue > 1, still return 1
        ev = np.array([0.9, 0.8, 0.7])
        assert _kaiser_n_factors(ev) == 1

    def test_all_above_one_counts_all(self):
        ev = np.array([3.0, 2.0, 1.5])
        assert _kaiser_n_factors(ev) == 3


# ---------------------------------------------------------------------------
# _scree_n_factors
# ---------------------------------------------------------------------------

class TestScree:
    def test_unifactorial_returns_one(self):
        R = np.corrcoef(UNI, rowvar=False)
        ev = np.sort(np.linalg.eigvalsh(R))[::-1]
        # Pre-computed: n_scree = 1
        assert _scree_n_factors(ev) == 1

    def test_bifactorial_returns_two(self):
        R = np.corrcoef(BI, rowvar=False)
        ev = np.sort(np.linalg.eigvalsh(R))[::-1]
        # Pre-computed: n_scree = 2
        assert _scree_n_factors(ev) == 2

    def test_minimum_is_one(self):
        assert _scree_n_factors(np.array([2.0, 1.0])) == 1

    def test_short_series_handled(self):
        assert _scree_n_factors(np.array([1.5])) == 1

    def test_sharp_single_elbow(self):
        # Large drop after first eigenvalue → 1 factor
        ev = np.array([5.0, 0.8, 0.7, 0.5])
        assert _scree_n_factors(ev) == 1


# ---------------------------------------------------------------------------
# _variance_explained
# ---------------------------------------------------------------------------

class TestVarianceExplained:
    def test_shape_matches_n_factors(self):
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        pct, cpct = _variance_explained(L)
        assert len(pct) == 1
        assert len(cpct) == 1

    def test_two_factor_shape(self):
        R = np.corrcoef(BI, rowvar=False)
        L = _paf(R, n_factors=2)
        pct, cpct = _variance_explained(L)
        assert len(pct) == 2
        assert len(cpct) == 2

    def test_values_in_range(self):
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        pct, _ = _variance_explained(L)
        assert all(0.0 <= v <= 100.0 for v in pct)

    def test_cumulative_is_monotone(self):
        R = np.corrcoef(BI, rowvar=False)
        L = _paf(R, n_factors=2)
        _, cpct = _variance_explained(L)
        assert cpct[1] >= cpct[0]

    def test_known_uni_variance(self):
        # Pre-computed: first factor explains ≈ 87.12% for UNI
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        pct, _ = _variance_explained(L)
        assert abs(pct[0] - 87.12) < 0.5


# ---------------------------------------------------------------------------
# _is_unidimensional
# ---------------------------------------------------------------------------

class TestIsUnidimensional:
    def _ev(self, data):
        R = np.corrcoef(data, rowvar=False)
        return np.sort(np.linalg.eigvalsh(R))[::-1]

    def test_unifactorial_is_true(self):
        ev = self._ev(UNI)
        nk = _kaiser_n_factors(ev)
        R = np.corrcoef(UNI, rowvar=False)
        L = _paf(R, n_factors=1)
        vp, _ = _variance_explained(L)
        assert _is_unidimensional(nk, ev, vp) is True

    def test_bifactorial_is_false(self):
        ev = self._ev(BI)
        nk = _kaiser_n_factors(ev)
        R = np.corrcoef(BI, rowvar=False)
        L = _paf(R, n_factors=nk)
        vp, _ = _variance_explained(L)
        assert _is_unidimensional(nk, ev, vp) is False

    def test_n_kaiser_gt_1_forces_false(self):
        ev = np.array([3.0, 2.0, 0.5, 0.3])
        assert _is_unidimensional(2, ev, [50.0, 25.0]) is False

    def test_low_variance_forces_false(self):
        # Even if Kaiser = 1 and ratio is high, < 40% variance → False
        ev = np.array([4.0, 0.5, 0.3, 0.2])
        assert _is_unidimensional(1, ev, [30.0]) is False

    def test_low_eigenvalue_ratio_forces_false(self):
        # Kaiser = 1 but ratio = 4.0/3.5 < 4 → False
        ev = np.array([4.0, 3.5, 0.3, 0.2])
        assert _is_unidimensional(1, ev, [45.0]) is False

    def test_no_second_eigenvalue_is_true(self):
        ev = np.array([4.0])
        assert _is_unidimensional(1, ev, [50.0]) is True


# ---------------------------------------------------------------------------
# compute_efa (integration)
# ---------------------------------------------------------------------------

class TestComputeEFA:
    def test_output_shape_uni(self):
        req = EFARequest(items=UNI.tolist(), scale_name="autonomy")
        result = compute_efa(req)
        assert result.n_items == 6
        assert result.n_respondents == 100
        assert len(result.loadings_matrix) == 6
        assert len(result.loadings_matrix[0]) == 1   # 1 factor extracted
        assert len(result.communalities) == 6
        assert len(result.eigenvalues) == 6
        assert result.scale_name == "autonomy"

    def test_n_factors_kaiser_uni(self):
        req = EFARequest(items=UNI.tolist())
        assert compute_efa(req).n_factors_kaiser == 1

    def test_n_factors_scree_uni(self):
        req = EFARequest(items=UNI.tolist())
        assert compute_efa(req).n_factors_scree == 1

    def test_is_unidimensional_uni(self):
        req = EFARequest(items=UNI.tolist())
        assert compute_efa(req).is_unidimensional is True

    def test_variance_explained_uni(self):
        req = EFARequest(items=UNI.tolist())
        result = compute_efa(req)
        assert abs(result.variance_explained[0] - 87.12) < 0.5

    def test_eigenvalues_descending(self):
        req = EFARequest(items=UNI.tolist())
        ev = compute_efa(req).eigenvalues
        assert all(ev[i] >= ev[i + 1] for i in range(len(ev) - 1))

    def test_communalities_clipped_to_unit_interval(self):
        # Small-sample DATA can produce Heywood cases; clipping must hold.
        req = EFARequest(items=DATA.tolist())
        result = compute_efa(req)
        assert all(0.0 <= h <= 1.0 for h in result.communalities)

    def test_n_factors_kaiser_bi(self):
        req = EFARequest(items=BI.tolist())
        assert compute_efa(req).n_factors_kaiser == 2

    def test_is_unidimensional_bi(self):
        req = EFARequest(items=BI.tolist())
        assert compute_efa(req).is_unidimensional is False

    def test_output_shape_bi(self):
        req = EFARequest(items=BI.tolist())
        result = compute_efa(req)
        assert len(result.loadings_matrix[0]) == 2   # 2 factors extracted

    def test_n_factors_override_extracts_correct_columns(self):
        # Force 2 factors from a unifactorial dataset
        req = EFARequest(items=UNI.tolist(), n_factors=2)
        result = compute_efa(req)
        assert len(result.loadings_matrix[0]) == 2

    def test_n_factors_override_does_not_change_kaiser(self):
        # Kaiser / scree reflect the data, not the override
        req = EFARequest(items=UNI.tolist(), n_factors=2)
        result = compute_efa(req)
        assert result.n_factors_kaiser == 1

    def test_cumulative_variance_last_equals_sum(self):
        req = EFARequest(items=BI.tolist())
        result = compute_efa(req)
        assert abs(result.cumulative_variance[-1] - sum(result.variance_explained)) < 0.01

    def test_scale_name_none_by_default(self):
        req = EFARequest(items=UNI.tolist())
        assert compute_efa(req).scale_name is None

    def test_n_factors_capped_at_k_minus_one(self):
        # Requesting more factors than k-1 should be silently capped
        req = EFARequest(items=UNI.tolist(), n_factors=100)
        result = compute_efa(req)
        assert len(result.loadings_matrix[0]) == UNI.shape[1] - 1


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestValidation:
    def test_single_respondent_rejected(self):
        with pytest.raises(Exception):
            EFARequest(items=[[1, 2, 3]])

    def test_single_item_rejected(self):
        with pytest.raises(Exception):
            EFARequest(items=[[1], [2], [3]])

    def test_jagged_rows_rejected(self):
        with pytest.raises(Exception):
            EFARequest(items=[[1, 2, 3], [1, 2]])

    def test_n_factors_zero_rejected(self):
        with pytest.raises(Exception):
            EFARequest(items=UNI.tolist(), n_factors=0)

    def test_zero_variance_item_rejected(self):
        bad = [[1, 5, 3], [2, 5, 4], [3, 5, 3], [4, 5, 4], [2, 5, 2]]
        req = EFARequest(items=bad)
        with pytest.raises(ValueError, match="zero variance"):
            compute_efa(req)


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

class TestAPIEndpoint:
    def test_happy_path(self):
        response = client.post("/api/v1/efa", json={"items": UNI.tolist()})
        assert response.status_code == 200
        body = response.json()
        for key in (
            "n_factors_kaiser", "n_factors_scree", "eigenvalues",
            "loadings_matrix", "communalities", "variance_explained",
            "cumulative_variance", "is_unidimensional", "n_items", "n_respondents",
        ):
            assert key in body

    def test_known_unidimensional_result(self):
        response = client.post("/api/v1/efa", json={"items": UNI.tolist()})
        body = response.json()
        assert body["n_factors_kaiser"] == 1
        assert body["is_unidimensional"] is True
        assert abs(body["variance_explained"][0] - 87.12) < 0.5

    def test_bifactorial_result(self):
        response = client.post("/api/v1/efa", json={"items": BI.tolist()})
        body = response.json()
        assert body["n_factors_kaiser"] == 2
        assert body["is_unidimensional"] is False

    def test_n_factors_override_via_api(self):
        response = client.post(
            "/api/v1/efa",
            json={"items": UNI.tolist(), "n_factors": 2},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["loadings_matrix"][0]) == 2

    def test_scale_name_passed_through(self):
        response = client.post(
            "/api/v1/efa",
            json={"items": UNI.tolist(), "scale_name": "engagement"},
        )
        assert response.json()["scale_name"] == "engagement"

    def test_invalid_payload_returns_422(self):
        response = client.post("/api/v1/efa", json={"items": [[1, 2, 3]]})
        assert response.status_code == 422

    def test_zero_variance_returns_422(self):
        bad = [[1, 5, 3], [2, 5, 4], [3, 5, 3], [4, 5, 4], [2, 5, 2]]
        response = client.post("/api/v1/efa", json={"items": bad})
        assert response.status_code == 422

    def test_reliability_endpoints_unaffected(self):
        payload = {"items": DATA.tolist()}
        assert client.post("/api/v1/reliability/cronbach-alpha", json=payload).status_code == 200
        assert client.post("/api/v1/reliability/omega", json=payload).status_code == 200
