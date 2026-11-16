from fastapi import APIRouter

from app.ai.frameworks import list_frameworks
from app.schemas import FrameworkItem

router = APIRouter(prefix="/api", tags=["frameworks"])


@router.get("/frameworks", response_model=list[FrameworkItem])
def get_frameworks() -> list[FrameworkItem]:
    return list_frameworks()
