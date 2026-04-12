from pydantic import BaseModel, field_validator, model_validator
from typing import Optional


class DIFRequest(BaseModel):
    responses: list[list[int]]  # (n_respondents, n_items), binary: 0 or 1
    groups: list[int]           # length n_respondents; 0 = reference, 1 = focal
    alpha: float = 0.05         # significance level for both tests
    scale_name: Optional[str] = None

    @field_validator("responses")
    @classmethod
    def validate_responses(cls, v: list[list[int]]) -> list[list[int]]:
        if len(v) < 4:
            raise ValueError("At least 4 respondents are required.")
        row_len = len(v[0])
        if row_len < 2:
            raise ValueError("At least 2 items are required.")
        if any(len(row) != row_len for row in v):
            raise ValueError("All respondents must have the same number of item scores.")
        for row in v:
            if any(val not in (0, 1) for val in row):
                raise ValueError("Item responses must be binary (0 or 1).")
        return v

    @field_validator("groups")
    @classmethod
    def validate_groups(cls, v: list[int]) -> list[int]:
        if any(g not in (0, 1) for g in v):
            raise ValueError("Group values must be 0 (reference) or 1 (focal).")
        return v

    @field_validator("alpha")
    @classmethod
    def validate_alpha(cls, v: float) -> float:
        if not (0.0 < v < 1.0):
            raise ValueError("alpha must be strictly between 0 and 1.")
        return v

    @model_validator(mode="after")
    def validate_consistency(self) -> "DIFRequest":
        if len(self.responses) != len(self.groups):
            raise ValueError(
                "responses and groups must have the same number of rows "
                f"(got {len(self.responses)} and {len(self.groups)})."
            )
        if self.groups.count(0) < 2:
            raise ValueError("Reference group (0) must have at least 2 members.")
        if self.groups.count(1) < 2:
            raise ValueError("Focal group (1) must have at least 2 members.")
        return self


class DIFItemResult(BaseModel):
    item_index: int
    # Mantel-Haenszel
    mh_chi_square: float
    mh_p_value: float
    mh_odds_ratio: float
    mh_delta: float               # ETS delta scale: -2.35 * ln(α_MH)
    mh_effect_size: str           # negligible / moderate / large
    mh_dif_detected: bool
    # Logistic regression
    lr_chi_square: float
    lr_p_value: float
    lr_r2_change: float           # Nagelkerke R² change: base → full model
    lr_effect_size: str
    lr_dif_type: str              # none / uniform / non-uniform
    lr_dif_detected: bool
    # Combined
    dif_detected: bool
    recommendation: str


class DIFResponse(BaseModel):
    items: list[DIFItemResult]
    n_items_flagged_mh: int
    n_items_flagged_lr: int
    n_items_flagged_either: int
    flagged_item_indices: list[int]
    summary_recommendation: str
    n_items: int
    n_respondents: int
    scale_name: Optional[str] = None
