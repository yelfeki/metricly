"""User role management."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.survey import UserRole
from ..schemas.survey import RoleOut

users_router = APIRouter(prefix="/users", tags=["users"])

# Emails that are automatically granted admin role on first login.
_ADMIN_EMAILS = {"yelfeki@vt.edu"}


@users_router.get("/me/role", response_model=RoleOut)
async def get_my_role(
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> RoleOut:
    """Return the current user's role, creating the record on first call."""
    stmt = select(UserRole).where(UserRole.user_id == current_user.user_id)
    role_row = (await db.execute(stmt)).scalar_one_or_none()

    if role_row is None:
        assigned = "admin" if current_user.email in _ADMIN_EMAILS else "client"
        role_row = UserRole(user_id=current_user.user_id, role=assigned)
        db.add(role_row)
        await db.commit()
        await db.refresh(role_row)

    return RoleOut(user_id=role_row.user_id, role=role_row.role)
