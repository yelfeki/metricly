from pydantic import BaseModel, field_validator
from typing import Optional


class McDonaldOmegaRequest(BaseModel):
    items: list[list[float]]
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


class McDonaldOmegaResponse(BaseModel):
    omega: float
    n_items: int
    n_respondents: int
    factor_loadings: list[float]
    communalities: list[float]
    uniquenesses: list[float]
    omega_if_item_deleted: list[float]
    interpretation: str
    scale_name: Optional[str] = None
