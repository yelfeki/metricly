import numpy as np
from ..schemas.efa import EFARequest, EFAResponse


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _smr(R: np.ndarray) -> np.ndarray:
    """
    Squared multiple correlations as initial communality estimates for PAF.
    h²_i = 1 - 1 / R⁻¹[i,i]

    Falls back to the maximum absolute off-diagonal correlation when R is
    singular (e.g. perfect multicollinearity).
    """
    k = R.shape[0]
    try:
        R_inv = np.linalg.inv(R)
        return np.clip(1.0 - 1.0 / np.diag(R_inv), 0.0, 1.0)
    except np.linalg.LinAlgError:
        return np.array([
            float(np.max(np.abs(R[i, np.arange(k) != i])))
            for i in range(k)
        ])


def _paf(
    R: np.ndarray,
    n_factors: int,
    max_iter: int = 1000,
    tol: float = 1e-6,
) -> np.ndarray:
    """
    Principal axis factoring.

    Iteratively replaces the diagonal of R with updated communality estimates
    (initialised from SMRs) until convergence, then returns the loading matrix
    of shape (n_items, n_factors).

    Negative eigenvalues are floored to zero before computing loadings so that
    sqrt remains real.  Final communalities are clipped to [0, 1] to suppress
    Heywood cases (communalities > 1 can occur with small samples).
    """
    h2 = _smr(R)
    R_red = R.copy()
    np.fill_diagonal(R_red, h2)

    for _ in range(max_iter):
        eigenvalues, eigenvectors = np.linalg.eigh(R_red)
        order = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[order]
        eigenvectors = eigenvectors[:, order]

        ev_pos = np.maximum(eigenvalues[:n_factors], 0.0)
        loadings = eigenvectors[:, :n_factors] * np.sqrt(ev_pos)

        h2_new = np.clip((loadings ** 2).sum(axis=1), 0.0, 1.0)
        if np.max(np.abs(h2_new - h2)) < tol:
            break
        h2 = h2_new
        np.fill_diagonal(R_red, h2)

    return loadings


def _kaiser_n_factors(eigenvalues: np.ndarray) -> int:
    """
    Kaiser criterion: retain factors whose eigenvalue (from the full,
    unreduced correlation matrix) exceeds 1.0.  Always returns at least 1.
    """
    return max(int(np.sum(eigenvalues > 1.0)), 1)


def _scree_n_factors(eigenvalues: np.ndarray) -> int:
    """
    Scree elbow via the acceleration factor (Cattell & Jaspers 1967).

    The acceleration is the second difference of the sorted-descending
    eigenvalue sequence.  The elbow is the point of maximum absolute
    acceleration — the index just before the curve flattens.
    Always returns at least 1.
    """
    if len(eigenvalues) < 3:
        return 1
    d1 = np.diff(eigenvalues)
    d2 = np.diff(d1)
    return max(1, int(np.argmax(np.abs(d2))) + 1)


def _variance_explained(
    loadings: np.ndarray,
) -> tuple[list[float], list[float]]:
    """
    Percentage of total item variance explained by each factor.

    SS_j / k  (sum of squared loadings for factor j divided by number of items)
    Returns (per_factor_pct, cumulative_pct).
    """
    k = loadings.shape[0]
    ss = (loadings ** 2).sum(axis=0)
    pct = ss / k * 100.0
    return (
        [round(float(v), 2) for v in pct],
        [round(float(v), 2) for v in np.cumsum(pct)],
    )


def _is_unidimensional(
    n_kaiser: int,
    eigenvalues: np.ndarray,
    var_pct: list[float],
) -> bool:
    """
    Heuristic unidimensionality flag.  All three conditions must hold:

    1. Kaiser criterion retains exactly one factor.
    2. The first factor explains >= 40 % of total item variance
       (Reise et al., 2013).
    3. The ratio of the first to the second eigenvalue >= 4.0
       (Reeve et al., 2007).  If there is no second positive eigenvalue the
       condition is considered satisfied.
    """
    if n_kaiser != 1:
        return False
    if var_pct[0] < 40.0:
        return False
    if len(eigenvalues) < 2 or eigenvalues[1] <= 0.0:
        return True
    return float(eigenvalues[0]) / float(eigenvalues[1]) >= 4.0


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def compute_efa(request: EFARequest) -> EFAResponse:
    data = np.array(request.items, dtype=float)  # (respondents, items)
    k = data.shape[1]

    if np.any(data.std(axis=0, ddof=1) == 0):
        raise ValueError(
            "One or more items have zero variance. "
            "Remove constant items before running EFA."
        )

    R = np.corrcoef(data, rowvar=False)

    # Eigenvalues from the full (unreduced) R drive retention rules.
    full_eigenvalues = np.sort(np.linalg.eigvalsh(R))[::-1]

    n_kaiser = _kaiser_n_factors(full_eigenvalues)
    n_scree = _scree_n_factors(full_eigenvalues)

    # Honour explicit override; cap at k-1 (extracting k factors is saturated).
    n_extract = request.n_factors if request.n_factors is not None else n_kaiser
    n_extract = min(n_extract, k - 1)

    loadings = _paf(R, n_factors=n_extract, max_iter=request.max_iter)

    # Clip communalities to [0, 1] — Heywood cases arise with small samples.
    communalities = np.clip((loadings ** 2).sum(axis=1), 0.0, 1.0)
    var_pct, cumvar_pct = _variance_explained(loadings)

    return EFAResponse(
        n_factors_kaiser=n_kaiser,
        n_factors_scree=n_scree,
        eigenvalues=[round(float(v), 4) for v in full_eigenvalues],
        loadings_matrix=[[round(float(v), 4) for v in row] for row in loadings.tolist()],
        communalities=[round(float(v), 4) for v in communalities],
        variance_explained=var_pct,
        cumulative_variance=cumvar_pct,
        is_unidimensional=_is_unidimensional(n_kaiser, full_eigenvalues, var_pct),
        n_items=k,
        n_respondents=data.shape[0],
        scale_name=request.scale_name,
    )
