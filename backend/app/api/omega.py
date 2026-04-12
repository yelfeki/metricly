from fastapi import APIRouter, HTTPException
from ..schemas.omega import McDonaldOmegaRequest, McDonaldOmegaResponse
from ..services.omega import compute_mcdonald_omega

router = APIRouter(prefix="/reliability", tags=["reliability"])


@router.post("/omega", response_model=McDonaldOmegaResponse)
async def mcdonald_omega(request: McDonaldOmegaRequest) -> McDonaldOmegaResponse:
    try:
        return compute_mcdonald_omega(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
