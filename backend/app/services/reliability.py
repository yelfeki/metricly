import numpy as np
from ..schemas.reliability import CronbachAlphaRequest, CronbachAlphaResponse


def _cronbach_alpha(data: np.ndarray) -> float:
    """
    Compute Cronbach's alpha for a (respondents x items) matrix.
    Formula: alpha = (k / (k-1)) * (1 - sum(item_variances) / total_variance)
    """
    n_items = data.shape[1]
    item_variances = data.var(axis=0, ddof=1)
    total_scores = data.sum(axis=1)
    total_variance = total_scores.var(ddof=1)
    if total_variance == 0:
        return 0.0
    return (n_items / (n_items - 1)) * (1 - item_variances.sum() / total_variance)


def _item_total_correlations(data: np.ndarray) -> list[float]:
    """
    Pearson correlation between each item and the sum of all other items
    (corrected item-total correlation).
    """
    correlations = []
    for i in range(data.shape[1]):
        item = data[:, i]
        rest = data[:, np.arange(data.shape[1]) != i].sum(axis=1)
        if item.std(ddof=1) == 0 or rest.std(ddof=1) == 0:
            correlations.append(0.0)
        else:
            r = np.corrcoef(item, rest)[0, 1]
            correlations.append(round(float(r), 4))
    return correlations


def _alpha_if_item_deleted(data: np.ndarray) -> list[float]:
    """
    Cronbach's alpha recomputed after dropping each item in turn.
    """
    alphas = []
    for i in range(data.shape[1]):
        reduced = data[:, np.arange(data.shape[1]) != i]
        alphas.append(round(_cronbach_alpha(reduced), 4))
    return alphas


def _interpret(alpha: float) -> str:
    if alpha < 0.60:
        return "poor"
    if alpha < 0.70:
        return "acceptable"
    if alpha < 0.90:
        return "good"
    return "excellent"


def compute_cronbach_alpha(request: CronbachAlphaRequest) -> CronbachAlphaResponse:
    data = np.array(request.items, dtype=float)  # shape: (respondents, items)
    alpha = _cronbach_alpha(data)

    return CronbachAlphaResponse(
        alpha=round(float(alpha), 4),
        n_items=data.shape[1],
        n_respondents=data.shape[0],
        item_total_correlations=_item_total_correlations(data),
        alpha_if_item_deleted=_alpha_if_item_deleted(data),
        interpretation=_interpret(alpha),
        scale_name=request.scale_name,
    )
