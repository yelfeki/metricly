import numpy as np
from scipy.special import expit
from scipy.optimize import minimize
from scipy.stats import chi2 as chi2_dist

from ..schemas.dif import DIFRequest, DIFItemResult, DIFResponse


# ---------------------------------------------------------------------------
# Effect size classifiers
# ---------------------------------------------------------------------------

def _mh_effect_label(delta: float) -> str:
    """
    ETS delta scale classification (Zwick & Ercikan, 1989).
    |Δ| < 1.0 → negligible (A), 1.0–1.5 → moderate (B), ≥ 1.5 → large (C).
    """
    abs_d = abs(delta)
    if abs_d < 1.0:
        return "negligible"
    if abs_d < 1.5:
        return "moderate"
    return "large"


def _lr_effect_label(r2_change: float) -> str:
    """
    Jodoin & Gierl (2001) R²Δ classification.
    < 0.035 → negligible, 0.035–0.07 → moderate, ≥ 0.07 → large.
    """
    if r2_change < 0.035:
        return "negligible"
    if r2_change < 0.070:
        return "moderate"
    return "large"


# ---------------------------------------------------------------------------
# Logistic regression helpers
# ---------------------------------------------------------------------------

def _neg_log_likelihood(params: np.ndarray, X: np.ndarray, y: np.ndarray) -> float:
    p = expit(X @ params)
    p = np.clip(p, 1e-10, 1.0 - 1e-10)
    return -float(np.sum(y * np.log(p) + (1.0 - y) * np.log(1.0 - p)))


def _fit_logistic(X: np.ndarray, y: np.ndarray) -> tuple[float, bool]:
    """Return (log_likelihood, converged)."""
    result = minimize(
        _neg_log_likelihood,
        x0=np.zeros(X.shape[1]),
        args=(X, y),
        method="L-BFGS-B",
        options={"maxiter": 500, "ftol": 1e-9},
    )
    return -result.fun, result.success


def _nagelkerke_r2(ll_model: float, ll_null: float, n: int) -> float:
    """Nagelkerke pseudo-R² given model and null log-likelihoods and sample size."""
    cs = 1.0 - np.exp(2.0 / n * (ll_null - ll_model))
    cs_max = 1.0 - np.exp(2.0 / n * ll_null)
    return float(np.clip(cs / cs_max, 0.0, 1.0)) if cs_max > 0 else 0.0


# ---------------------------------------------------------------------------
# Mantel-Haenszel DIF
# ---------------------------------------------------------------------------

def _mh_dif_item(
    responses: np.ndarray,
    groups: np.ndarray,
    item_idx: int,
) -> dict:
    """
    Mantel-Haenszel DIF analysis for one binary item.

    Stratifies respondents by rest score (total score excluding the studied
    item), then accumulates the MH chi-square statistic and odds ratio across
    strata (Holland & Thayer, 1988).

    Chi-square uses Yates' continuity correction.  The ETS delta metric is
    Δ_MH = -2.35 * ln(α_MH), where α_MH is the common log odds ratio.
    Positive Δ means the item favours the focal group; negative means it
    favours the reference group.
    """
    item = responses[:, item_idx].astype(float)
    rest = responses[:, np.arange(responses.shape[1]) != item_idx].sum(axis=1)

    numerator = 0.0  # Σ (A_k - E[A_k])
    ad_sum = 0.0     # Σ A_k D_k / n_k  — odds ratio numerator
    bc_sum = 0.0     # Σ B_k C_k / n_k  — odds ratio denominator
    var_sum = 0.0    # Σ Var(A_k)

    for score in np.unique(rest):
        mask = rest == score
        ref = mask & (groups == 0)
        foc = mask & (groups == 1)

        n_r = int(ref.sum())
        n_f = int(foc.sum())
        n_k = n_r + n_f

        if n_k < 2 or n_r == 0 or n_f == 0:
            continue

        A = float((ref & (item == 1)).sum())  # reference correct
        B = float((ref & (item == 0)).sum())  # reference incorrect
        C = float((foc & (item == 1)).sum())  # focal correct
        D = float((foc & (item == 0)).sum())  # focal incorrect

        n_1k = A + C  # total correct at this score level
        n_0k = B + D  # total incorrect at this score level

        if n_1k == 0 or n_0k == 0:
            continue  # no variance within this stratum

        numerator += A - n_r * n_1k / n_k
        ad_sum += A * D / n_k
        bc_sum += B * C / n_k
        var_sum += n_r * n_f * n_1k * n_0k / (n_k ** 2 * (n_k - 1))

    # Odds ratio and ETS delta
    if bc_sum == 0:
        odds_ratio = 999.0
        delta = -99.0
    elif ad_sum == 0:
        odds_ratio = 0.0
        delta = 99.0
    else:
        raw_or = ad_sum / bc_sum
        odds_ratio = round(float(raw_or), 4)
        delta = round(-2.35 * float(np.log(raw_or)), 4)

    # Chi-square with continuity correction
    if var_sum == 0:
        chi_sq = 0.0
        p_value = 1.0
    else:
        chi_sq = round(float(max(abs(numerator) - 0.5, 0.0) ** 2 / var_sum), 4)
        p_value = round(float(1.0 - chi2_dist.cdf(chi_sq, df=1)), 4)

    return {
        "chi_square": chi_sq,
        "p_value": p_value,
        "odds_ratio": odds_ratio,
        "delta": delta,
    }


# ---------------------------------------------------------------------------
# Logistic regression DIF
# ---------------------------------------------------------------------------

def _lr_dif_item(
    responses: np.ndarray,
    groups: np.ndarray,
    item_idx: int,
    alpha: float,
) -> dict:
    """
    Logistic regression DIF analysis for one binary item (Swaminathan & Rogers 1990).

    Fits three nested models and uses likelihood-ratio tests to classify DIF:
      Model 0 (base):        logit(P) = β₀ + β₁·score
      Model 1 (uniform):     logit(P) = β₀ + β₁·score + β₂·group
      Model 2 (non-uniform): logit(P) = β₀ + β₁·score + β₂·group + β₃·score×group

    Uniform DIF:     Model 1 significantly improves on Model 0 (group main effect).
    Non-uniform DIF: Model 2 significantly improves on Model 1 (interaction).

    Effect size is the Nagelkerke R² change from base to full model.
    Score is standardised within the sample for numerical stability.
    """
    y = responses[:, item_idx].astype(float)
    score = responses[:, np.arange(responses.shape[1]) != item_idx].sum(axis=1).astype(float)
    g = groups.astype(float)
    n = len(y)

    std = score.std(ddof=1)
    score_z = (score - score.mean()) / std if std > 0 else score - score.mean()

    ones = np.ones(n)
    interaction = score_z * g

    ll_null, _ = _fit_logistic(ones.reshape(-1, 1), y)
    ll_base, ok0 = _fit_logistic(np.column_stack([ones, score_z]), y)
    ll_uni, ok1 = _fit_logistic(np.column_stack([ones, score_z, g]), y)
    ll_full, ok2 = _fit_logistic(np.column_stack([ones, score_z, g, interaction]), y)

    if not (ok0 and ok1 and ok2):
        return {
            "chi_square": 0.0, "p_value": 1.0,
            "r2_change": 0.0, "dif_type": "none",
        }

    lr_uniform = max(0.0, 2.0 * (ll_uni - ll_base))
    lr_interaction = max(0.0, 2.0 * (ll_full - ll_uni))

    p_uniform = float(1.0 - chi2_dist.cdf(lr_uniform, df=1))
    p_interaction = float(1.0 - chi2_dist.cdf(lr_interaction, df=1))

    r2_change = max(0.0, _nagelkerke_r2(ll_full, ll_null, n) - _nagelkerke_r2(ll_base, ll_null, n))

    if p_interaction < alpha:
        dif_type = "non-uniform"
        chi_sq = lr_interaction
        p_value = p_interaction
    elif p_uniform < alpha:
        dif_type = "uniform"
        chi_sq = lr_uniform
        p_value = p_uniform
    else:
        dif_type = "none"
        chi_sq = max(lr_uniform, lr_interaction)
        p_value = min(p_uniform, p_interaction)

    return {
        "chi_square": round(float(chi_sq), 4),
        "p_value": round(float(p_value), 4),
        "r2_change": round(float(r2_change), 4),
        "dif_type": dif_type,
    }


# ---------------------------------------------------------------------------
# Recommendation text
# ---------------------------------------------------------------------------

def _item_recommendation(
    mh_detected: bool,
    lr_detected: bool,
    lr_dif_type: str,
    mh_effect: str,
    lr_effect: str,
) -> str:
    if not mh_detected and not lr_detected:
        return "No DIF detected. Item appears unbiased across groups."

    method = (
        "both MH and LR" if (mh_detected and lr_detected)
        else ("MH" if mh_detected else "LR")
    )
    qualifier = (
        "Non-uniform DIF (interaction effect)"
        if lr_dif_type == "non-uniform" and lr_detected
        else "Uniform DIF"
    )
    severity_order = ["negligible", "moderate", "large"]
    top_effect = severity_order[max(
        severity_order.index(mh_effect),
        severity_order.index(lr_effect),
    )]
    action = {
        "large": "Consider removing or revising this item.",
        "moderate": "Conduct expert bias review before retaining.",
        "negligible": "Flag for review; effect is small.",
    }[top_effect]

    return f"{qualifier} detected by {method}. {action}"


def _summary_recommendation(n_flagged: int, n_items: int) -> str:
    if n_flagged == 0:
        return "No items show significant DIF. The scale appears unbiased across groups."
    pct = n_flagged / n_items * 100
    if pct > 20:
        return (
            f"{n_flagged} of {n_items} items ({pct:.0f}%) show DIF. "
            "High proportion — consider full scale revision and expert bias review."
        )
    return (
        f"{n_flagged} of {n_items} item(s) show DIF. "
        "Review flagged items for content and cultural bias."
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def compute_dif(request: DIFRequest) -> DIFResponse:
    responses = np.array(request.responses, dtype=int)
    groups = np.array(request.groups, dtype=int)
    n_respondents, n_items = responses.shape
    alpha = request.alpha

    if np.any(responses.var(axis=0) == 0):
        raise ValueError(
            "One or more items have zero variance (all responses identical). "
            "Remove constant items before running DIF analysis."
        )

    item_results: list[DIFItemResult] = []
    for i in range(n_items):
        mh = _mh_dif_item(responses, groups, i)
        lr = _lr_dif_item(responses, groups, i, alpha)

        mh_effect = _mh_effect_label(mh["delta"])
        lr_effect = _lr_effect_label(lr["r2_change"])

        # Detected = statistically significant AND at least moderate effect size
        mh_detected = (mh["p_value"] < alpha) and (mh_effect != "negligible")
        lr_detected = (lr["dif_type"] != "none") and (lr_effect != "negligible")

        item_results.append(DIFItemResult(
            item_index=i,
            mh_chi_square=mh["chi_square"],
            mh_p_value=mh["p_value"],
            mh_odds_ratio=mh["odds_ratio"],
            mh_delta=mh["delta"],
            mh_effect_size=mh_effect,
            mh_dif_detected=mh_detected,
            lr_chi_square=lr["chi_square"],
            lr_p_value=lr["p_value"],
            lr_r2_change=lr["r2_change"],
            lr_effect_size=lr_effect,
            lr_dif_type=lr["dif_type"],
            lr_dif_detected=lr_detected,
            dif_detected=mh_detected or lr_detected,
            recommendation=_item_recommendation(
                mh_detected, lr_detected, lr["dif_type"], mh_effect, lr_effect
            ),
        ))

    flagged = [r.item_index for r in item_results if r.dif_detected]

    return DIFResponse(
        items=item_results,
        n_items_flagged_mh=sum(1 for r in item_results if r.mh_dif_detected),
        n_items_flagged_lr=sum(1 for r in item_results if r.lr_dif_detected),
        n_items_flagged_either=len(flagged),
        flagged_item_indices=flagged,
        summary_recommendation=_summary_recommendation(len(flagged), n_items),
        n_items=n_items,
        n_respondents=n_respondents,
        scale_name=request.scale_name,
    )
