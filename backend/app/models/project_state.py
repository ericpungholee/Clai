from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from app.models.packaging_state import PackagingState
from app.models.product_state import ProductState, ProductStatus

PROJECT_INDEX_KEY = "projects:index"
CURRENT_PROJECT_KEY = "projects:current"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SavedProjectRecord(BaseModel):
    """Persisted multi-step project snapshot."""

    project_id: str
    name: str = "Untitled project"
    prompt: Optional[str] = None
    last_route: str = "/product"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    product_state: ProductState = Field(default_factory=ProductState)
    product_status: ProductStatus = Field(default_factory=ProductStatus)
    packaging_state: PackagingState = Field(default_factory=PackagingState)

    def as_json(self) -> dict:
        return self.model_dump(mode="json")


class SavedProjectSummary(BaseModel):
    """Compact project payload for the home page."""

    project_id: str
    name: str
    prompt: Optional[str] = None
    last_route: str = "/product"
    created_at: datetime
    updated_at: datetime
    workflow_stage: str = "idle"
    status_label: str = "New project"
    preview_image: Optional[str] = None
    selected_concept_title: Optional[str] = None
    has_product_model: bool = False
    has_packaging: bool = False

    def as_json(self) -> dict:
        return self.model_dump(mode="json")
