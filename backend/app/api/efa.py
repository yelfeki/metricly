from fastapi import APIRouter, HTTPException
from ..schemas.efa import EFARequest, EFAResponse
from ..services.efa import compute_efa

router = APIRouter(prefix="/efa", tags=["efa"])


@router.post("", response_model=EFAResponse)
async def exploratory_factor_analysis(request: EFARequest) -> EFAResponse:
    try:
        return compute_efa(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
