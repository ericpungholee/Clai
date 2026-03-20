from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.core.redis import redis_service

PRODUCT_STATE_KEY = "product:current"
PRODUCT_STATUS_KEY = "product_status:current"

WorkflowStage = Literal[
    "idle",
    "brief_ready",
    "concepts_ready",
    "references_ready",
    "draft_ready",
    "editing",
    "error",
]
ProductMode = Literal["idle", "create", "edit"]
IterationType = Literal["create", "edit"]
ReferenceRole = Literal["sketch", "hero", "ortho_front", "ortho_side", "detail"]
EditorInteractionMode = Literal["view", "direct_edit"]
EditorTool = Literal["resize", "move", "rotate"]
OperationType = Literal[
    "create_brief",
    "generate_concepts",
    "refine_concepts",
    "choose_concept",
    "generate_references",
    "generate_3d_draft",
    "edit_whole_product",
    "edit_region",
    "restyle_materials",
    "rewind_version",
    "recover_prior_result",
]
OperationState = Literal["pending", "running", "complete", "error"]


def _utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class TrellisArtifacts(BaseModel):
    """Latest Trellis asset bundle."""

    model_file: Optional[str] = None
    color_video: Optional[str] = None
    gaussian_ply: Optional[str] = None
    normal_video: Optional[str] = None
    combined_video: Optional[str] = None
    no_background_images: List[str] = Field(default_factory=list)


class DesignBrief(BaseModel):
    """Structured design intent extracted from the raw prompt."""

    product_name: str
    category: str
    target_user: str
    primary_use_case: str
    key_features: List[str] = Field(default_factory=list)
    style_keywords: List[str] = Field(default_factory=list)
    materials: List[str] = Field(default_factory=list)
    size_class: str = "desktop"
    ergonomic_goals: List[str] = Field(default_factory=list)
    manufacturing_hints: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    must_have: List[str] = Field(default_factory=list)
    avoid: List[str] = Field(default_factory=list)
    uncertainty_flags: List[str] = Field(default_factory=list)


class ConceptDirection(BaseModel):
    """A design direction shown before committing to references or 3D."""

    concept_id: str
    title: str
    concept_image_url: Optional[str] = None
    summary: str
    silhouette: str
    form_language: str
    materials: List[str] = Field(default_factory=list)
    aesthetic_keywords: List[str] = Field(default_factory=list)
    key_differentiators: List[str] = Field(default_factory=list)
    pros: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    confidence: float = 0.0


class ReferenceImage(BaseModel):
    """Role-specific generated image used for exploration and 3D."""

    role: ReferenceRole
    url: str
    prompt: str
    generated_at: datetime = Field(default_factory=_utcnow)


class ReferenceSet(BaseModel):
    """A concept-linked bundle of controlled reference images."""

    reference_set_id: str
    concept_id: str
    images: List[ReferenceImage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RegionMetadata(BaseModel):
    """Semantic product regions used for targeted edit scopes."""

    region_id: str
    label: str
    description: str
    confidence: float = 0.0


class AIOperation(BaseModel):
    """Structured operation log for the AI workflow."""

    operation_id: str
    type: OperationType
    status: OperationState
    input_prompt: Optional[str] = None
    target_scope: str = "whole_product"
    created_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None
    artifact_ids: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    summary: Optional[str] = None


class DesignVersion(BaseModel):
    """Persistent product-level design version."""

    version_id: str
    parent_version_id: Optional[str] = None
    source_operation_id: Optional[str] = None
    source_prompt: Optional[str] = None
    concept_id: Optional[str] = None
    model_asset_url: Optional[str] = None
    preview_images: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)
    summary_of_changes: str = "Initial draft"
    named_regions: List[RegionMetadata] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)


class ProductTransformState(BaseModel):
    """Whole-product transform used for direct manipulation in the editor."""

    position: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    scale: List[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0])


class ProductEditorState(BaseModel):
    """Context that lets the editor act as the long-lived workspace."""

    current_model_url: Optional[str] = None
    active_version_id: Optional[str] = None
    interaction_mode: EditorInteractionMode = "view"
    handles_visible: bool = False
    active_tool: EditorTool = "resize"
    transform: ProductTransformState = Field(default_factory=ProductTransformState)
    camera_presets: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    selected_part_id: Optional[str] = None
    material_assignments: Dict[str, str] = Field(default_factory=dict)
    annotations: List[str] = Field(default_factory=list)
    ai_region_labels: List[RegionMetadata] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)


class ProductIteration(BaseModel):
    """Historical record for create/edit passes preserved for compatibility."""

    id: str
    type: IterationType = "create"
    prompt: str
    images: List[str] = Field(default_factory=list)
    trellis_output: Optional[TrellisArtifacts] = None
    created_at: datetime = Field(default_factory=_utcnow)
    note: Optional[str] = None
    duration_seconds: Optional[float] = None
    source_operation_id: Optional[str] = None
    version_id: Optional[str] = None
    concept_id: Optional[str] = None


class ProductState(BaseModel):
    """Single-session source of truth for the product workflow."""

    prompt: Optional[str] = None
    latest_instruction: Optional[str] = None
    mode: ProductMode = "idle"
    status: str = "idle"
    message: Optional[str] = None
    workflow_stage: WorkflowStage = "idle"
    last_completed_stage: WorkflowStage = "idle"
    in_progress: bool = False
    generation_started_at: Optional[datetime] = None
    image_count: int = 1
    images: List[str] = Field(default_factory=list)
    trellis_output: Optional[TrellisArtifacts] = None
    iterations: List[ProductIteration] = Field(default_factory=list)
    design_brief: Optional[DesignBrief] = None
    concept_directions: List[ConceptDirection] = Field(default_factory=list)
    selected_concept_id: Optional[str] = None
    reference_set: Optional[ReferenceSet] = None
    ai_operations: List[AIOperation] = Field(default_factory=list)
    version_history: List[DesignVersion] = Field(default_factory=list)
    active_version_id: Optional[str] = None
    current_model_asset_url: Optional[str] = None
    named_regions: List[RegionMetadata] = Field(default_factory=list)
    editor_state: ProductEditorState = Field(default_factory=ProductEditorState)
    last_error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    export_files: Dict[str, str] = Field(default_factory=dict)

    def as_json(self) -> dict:
        """Return a JSON-serializable dict."""
        return self.model_dump(mode="json")

    def set_stage(self, stage: WorkflowStage) -> None:
        self.workflow_stage = stage
        if stage != "error":
            self.last_completed_stage = stage
        self.updated_at = _utcnow()

    def mark_error(self, error_message: str) -> None:
        """Convenience helper when the workflow fails."""
        self.status = "error"
        self.workflow_stage = "error"
        self.message = error_message
        self.last_error = error_message
        self.in_progress = False
        self.generation_started_at = None
        self.updated_at = _utcnow()

    def mark_complete(
        self,
        message: str = "Complete",
        workflow_stage: Optional[WorkflowStage] = None,
    ) -> None:
        self.status = "complete"
        self.message = message
        self.in_progress = False
        self.generation_started_at = None
        if workflow_stage:
            self.set_stage(workflow_stage)
        else:
            self.updated_at = _utcnow()

    def mark_progress(
        self,
        status: str,
        message: Optional[str] = None,
        workflow_stage: Optional[WorkflowStage] = None,
    ) -> None:
        self.status = status
        if message:
            self.message = message
        if workflow_stage:
            self.set_stage(workflow_stage)
        else:
            self.updated_at = _utcnow()

    def get_selected_concept(self) -> Optional[ConceptDirection]:
        if not self.selected_concept_id:
            return None
        for concept in self.concept_directions:
            if concept.concept_id == self.selected_concept_id:
                return concept
        return None

    def get_active_version(self) -> Optional[DesignVersion]:
        if not self.active_version_id:
            return None
        for version in self.version_history:
            if version.version_id == self.active_version_id:
                return version
        return None


class ProductStatus(BaseModel):
    """Lightweight payload that the frontend polls frequently."""

    status: str = "idle"
    progress: int = 0
    message: Optional[str] = None
    error: Optional[str] = None
    workflow_stage: WorkflowStage = "idle"
    active_operation_id: Optional[str] = None
    active_operation_type: Optional[OperationType] = None
    active_version_id: Optional[str] = None
    model_file: Optional[str] = None
    preview_image: Optional[str] = None
    updated_at: datetime = Field(default_factory=_utcnow)

    def as_json(self) -> dict:
        return self.model_dump(mode="json")


def get_product_state() -> ProductState:
    """Fetch the current session state from Redis or return a default object."""
    payload = redis_service.get_json(PRODUCT_STATE_KEY)
    if not payload:
        return ProductState()
    return ProductState.model_validate(payload)


def save_product_state(state: ProductState) -> None:
    """Persist the session state back to Redis."""
    state.updated_at = _utcnow()
    redis_service.set_json(PRODUCT_STATE_KEY, state.as_json())
    try:
        from app.services.project_store import sync_current_project_product_state

        sync_current_project_product_state(state)
    except Exception:
        pass


def clear_product_state() -> ProductState:
    """Reset the stored state."""
    state = ProductState()
    save_product_state(state)
    return state


def get_product_status() -> ProductStatus:
    payload = redis_service.get_json(PRODUCT_STATUS_KEY)
    if not payload:
        return ProductStatus()
    return ProductStatus.model_validate(payload)


def save_product_status(status: ProductStatus) -> None:
    status.updated_at = _utcnow()
    redis_service.set_json(PRODUCT_STATUS_KEY, status.as_json())
    try:
        from app.services.project_store import sync_current_project_product_status

        sync_current_project_product_status(status)
    except Exception:
        pass
