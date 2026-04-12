from fastapi import FastAPI
from .api.reliability import router as reliability_router
from .api.omega import router as omega_router
from .api.efa import router as efa_router
from .api.dif import router as dif_router

app = FastAPI(
    title="Metricly API",
    description="Psychometric platform for the Arab world",
    version="0.1.0",
)

app.include_router(reliability_router, prefix="/api/v1")
app.include_router(omega_router, prefix="/api/v1")
app.include_router(efa_router, prefix="/api/v1")
app.include_router(dif_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
