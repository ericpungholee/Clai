from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.packaging_state import clear_packaging_state
from app.models.product_state import ProductStatus, clear_product_state, save_product_status
from app.services.project_store import (
    create_project,
    get_current_project_summary,
    get_project_record,
    get_project_summary,
    list_project_summaries,
    open_project,
    save_current_project,
    touch_current_project_route,
)

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    prompt: Optional[str] = Field(default=None, max_length=2000)
    last_route: str = Field(default="/product", max_length=120)
    reset_workspace: bool = True


class SaveProjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    last_route: Optional[str] = Field(default=None, max_length=120)


class UpdateProjectContextRequest(BaseModel):
    last_route: str = Field(..., max_length=120)


@router.get("")
async def list_projects():
    return {
        "projects": [summary.as_json() for summary in list_project_summaries()],
        "current_project_id": getattr(get_current_project_summary(), "project_id", None),
    }


@router.get("/current")
async def get_current_project():
    summary = get_current_project_summary()
    return summary.as_json() if summary else None


@router.get("/{project_id}")
async def get_project(project_id: str):
    summary = get_project_summary(project_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Project not found")
    return summary.as_json()


@router.post("")
async def create_new_project(request: CreateProjectRequest):
    record = create_project(
        name=request.name,
        prompt=request.prompt,
        last_route=request.last_route,
        activate=True,
    )

    if request.reset_workspace:
        clear_product_state()
        clear_packaging_state()
        save_product_status(ProductStatus(status="idle", message="New project ready"))
        record = save_current_project(name=request.name, last_route=request.last_route)

    summary = get_project_summary(record.project_id)
    return {
        "project": summary.as_json() if summary else None,
    }


@router.post("/save")
async def save_project(request: SaveProjectRequest):
    record = save_current_project(name=request.name, last_route=request.last_route)
    summary = get_project_summary(record.project_id)
    return {
        "project": summary.as_json() if summary else None,
    }


@router.post("/current/context")
async def update_current_project_context(request: UpdateProjectContextRequest):
    record = touch_current_project_route(request.last_route)
    if not record:
        return {"updated": False, "project": None}
    summary = get_project_summary(record.project_id)
    return {
        "updated": True,
        "project": summary.as_json() if summary else None,
    }


@router.post("/{project_id}/open")
async def open_existing_project(project_id: str):
    if not get_project_record(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    record = open_project(project_id)
    summary = get_project_summary(record.project_id)
    return {
        "project": summary.as_json() if summary else None,
    }
