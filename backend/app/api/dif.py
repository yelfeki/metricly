from fastapi import APIRouter, HTTPException
from ..schemas.dif import DIFRequest, DIFResponse
from ..services.dif import compute_dif

router = APIRouter(prefix="/dif", tags=["dif"])


@router.post("", response_model=DIFResponse)
async def dif_analysis(request: DIFRequest) -> DIFResponse:
    try:
        return compute_dif(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
