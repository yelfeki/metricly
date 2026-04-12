from pydantic import BaseModel, field_validator
from typing import Optional


class EFARequest(BaseModel):
    items: list[list[float]]
    n_factors: Optional[int] = None  # if None, Kaiser criterion is used
    max_iter: int = 1000
    scale_name: Optional[str] = None

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) < 2:
            raise ValueError("At least 2 respondents are required.")
        row_len = len(v[0])
        if row_len < 2:
            raise ValueError("At least 2 items are required.")
        if any(len(row) != row_len for row in v):
            raise ValueError("All respondents must have the same number of item scores.")
        return v

    @field_validator("n_factors")
    @classmethod
    def validate_n_factors(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("n_factors must be at least 1.")
        return v


class EFAResponse(BaseModel):
    n_factors_kaiser: int
    n_factors_scree: int
    eigenvalues: list[float]           # all eigenvalues of R, descending
    loadings_matrix: list[list[float]] # shape: [n_items][n_factors_extracted]
    communalities: list[float]         # h² per item, clipped to [0, 1]
    variance_explained: list[float]    # % of total item variance per factor
    cumulative_variance: list[float]   # cumulative %
    is_unidimensional: bool
    n_items: int
    n_respondents: int
    scale_name: Optional[str] = None
