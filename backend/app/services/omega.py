import numpy as np
from ..schemas.omega import McDonaldOmegaRequest, McDonaldOmegaResponse


def _extract_first_factor(R: np.ndarray) -> np.ndarray:
    """
    Extract first principal factor loadings from correlation matrix R via
    eigendecomposition.  loadings = sqrt(lambda_1) * v_1

    numpy.linalg.eigh returns eigenvalues in ascending order; the last column
    of eigenvectors is the one corresponding to the largest eigenvalue.
    Sign convention: flip so the sum of loadings is positive.
    """
    eigenvalues, eigenvectors = np.linalg.eigh(R)
    lambda1 = max(float(eigenvalues[-1]), 0.0)
    loadings = np.sqrt(lambda1) * eigenvectors[:, -1]
    if loadings.sum() < 0:
        loadings = -loadings
    return loadings


def _omega_from_loadings(loadings: np.ndarray) -> float:
    """
    CFA-based McDonald's omega for a unidimensional scale.

    ω = (Σλᵢ)² / [(Σλᵢ)² + Σθᵢ]

    where λᵢ are standardised factor loadings and θᵢ = 1 − λᵢ² are
    item uniquenesses.  Assumes a single common factor extracted from the
    correlation matrix (items treated as standardised).
    """
    sum_loadings_sq = float(loadings.sum()) ** 2
    sum_uniqueness = float((1.0 - loadings ** 2).sum())
    denominator = sum_loadings_sq + sum_uniqueness
    if denominator == 0.0:
        return 0.0
    return sum_loadings_sq / denominator


def _omega_if_item_deleted(R: np.ndarray) -> list[float]:
    """Recompute omega after dropping each item in turn."""
    k = R.shape[0]
    result = []
    for i in range(k):
        keep = np.arange(k) != i
        loadings = _extract_first_factor(R[np.ix_(keep, keep)])
        result.append(round(_omega_from_loadings(loadings), 4))
    return result


def _interpret(omega: float) -> str:
    if omega < 0.60:
        return "poor"
    if omega < 0.70:
        return "acceptable"
    if omega < 0.90:
        return "good"
    return "excellent"


def compute_mcdonald_omega(request: McDonaldOmegaRequest) -> McDonaldOmegaResponse:
    data = np.array(request.items, dtype=float)  # shape: (respondents, items)

    # Guard: zero-variance items make the correlation matrix undefined.
    if np.any(data.std(axis=0, ddof=1) == 0):
        raise ValueError(
            "One or more items have zero variance. "
            "Remove constant items before computing omega."
        )

    R = np.corrcoef(data, rowvar=False)  # (items x items) correlation matrix
    loadings = _extract_first_factor(R)
    communalities = loadings ** 2
    uniquenesses = 1.0 - communalities
    omega = _omega_from_loadings(loadings)

    return McDonaldOmegaResponse(
        omega=round(omega, 4),
        n_items=data.shape[1],
        n_respondents=data.shape[0],
        factor_loadings=[round(float(l), 4) for l in loadings],
        communalities=[round(float(c), 4) for c in communalities],
        uniquenesses=[round(float(u), 4) for u in uniquenesses],
        omega_if_item_deleted=_omega_if_item_deleted(R),
        interpretation=_interpret(omega),
        scale_name=request.scale_name,
    )
