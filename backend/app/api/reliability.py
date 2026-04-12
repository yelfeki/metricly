from fastapi import APIRouter
from ..schemas.reliability import CronbachAlphaRequest, CronbachAlphaResponse
from ..services.reliability import compute_cronbach_alpha

router = APIRouter(prefix="/reliability", tags=["reliability"])


@router.post("/cronbach-alpha", response_model=CronbachAlphaResponse)
async def cronbach_alpha(request: CronbachAlphaRequest) -> CronbachAlphaResponse:
    return compute_cronbach_alpha(request)
