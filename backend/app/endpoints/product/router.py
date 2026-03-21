import asyncio
import logging
from typing import Literal, Optional, Set

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.models.product_state import (
    ProductTransformState,
    ProductState,
    ProductStatus,
    TrellisArtifacts,
    _utcnow,
    clear_product_state,
    get_product_state,
    get_product_status,
    save_product_state,
    save_product_status,
)
from app.services.file_export import export_product_formats, get_export_file_path
from app.services.product_model_store import get_cached_product_model_path
from app.services.product_pipeline import product_pipeline_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/product", tags=["product"])
_background_tasks: Set[asyncio.Task] = set()

class ProductCreateRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=2000)
    image_count: int = Field(1, ge=1, le=6)


class ProductConceptRefineRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)


class ProductConceptSelectRequest(BaseModel):
    concept_id: str = Field(..., min_length=3, max_length=200)
    combine_with_ids: list[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ProductReferenceGenerateRequest(BaseModel):
    concept_id: Optional[str] = Field(default=None, min_length=3, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ProductEditRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    edit_type: Literal["whole_product", "region", "restyle_materials"] = "whole_product"
    target_scope: str = Field(default="whole_product", min_length=1, max_length=200)


class ProductEditRegionRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    region_id: str = Field(..., min_length=1, max_length=200)


class ProductEditorStateUpdateRequest(BaseModel):
    interaction_mode: Optional[Literal["view", "direct_edit"]] = None
    handles_visible: Optional[bool] = None
    active_tool: Optional[Literal["resize", "move", "rotate"]] = None
    transform: Optional[ProductTransformState] = None


class TrellisOnlyRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    images: list[str] = Field(..., min_length=1, max_length=6)
    mode: str = Field("create", description="'create' for new product, 'edit' for modification")


def _has_active_tasks() -> bool:
    return any(not task.done() for task in _background_tasks)


def _find_active_operation(state: ProductState):
    return next(
        (operation for operation in reversed(state.ai_operations) if operation.status == "running"),
        None,
    )


def _current_model_url(state: ProductState) -> Optional[str]:
    active_version = state.get_active_version()
    if active_version and active_version.model_asset_url:
        return active_version.model_asset_url
    if state.current_model_asset_url:
        return state.current_model_asset_url
    if state.trellis_output:
        return state.trellis_output.model_file
    return None


def _preview_image(state: ProductState) -> Optional[str]:
    active_version = state.get_active_version()
    if active_version and active_version.preview_images:
        return active_version.preview_images[0]
    if state.trellis_output and state.trellis_output.no_background_images:
        return state.trellis_output.no_background_images[0]
    if state.images:
        return state.images[0]
    return None


def _resolve_model_source_url(state: ProductState, version_id: Optional[str] = None) -> Optional[str]:
    if version_id:
        version = next(
            (item for item in state.version_history if item.version_id == version_id),
            None,
        )
        if version and version.model_asset_url:
            return version.model_asset_url
        return None

    active_version = state.get_active_version()
    if active_version and active_version.model_asset_url:
        return active_version.model_asset_url
    return _current_model_url(state)


def _save_status_from_state(
    state: ProductState,
    *,
    status: str,
    progress: int,
    message: str,
    error: Optional[str] = None,
) -> None:
    active_operation = _find_active_operation(state)
    payload = ProductStatus(
        status=status,
        progress=progress,
        message=message,
        error=error,
        workflow_stage=state.workflow_stage,
        active_operation_id=active_operation.operation_id if active_operation else None,
        active_operation_type=active_operation.type if active_operation else None,
        active_version_id=state.active_version_id,
        model_file=_current_model_url(state),
        preview_image=_preview_image(state),
    )
    save_product_status(payload)


def _auto_recover_if_needed(state: ProductState) -> bool:
    if not state.in_progress:
        return False

    if _has_active_tasks():
        return False

    logger.warning("[product-router] Auto-recovering stale in-progress state")
    state.in_progress = False
    state.status = "idle"
    state.message = "Recovered from interrupted generation"
    state.generation_started_at = None
    state.workflow_stage = state.last_completed_stage
    save_product_state(state)
    _save_status_from_state(
        state,
        status="idle",
        progress=0,
        message="Recovered from interrupted generation",
    )
    return True


def _ensure_not_busy(state: ProductState) -> None:
    if state.in_progress:
        if _auto_recover_if_needed(state):
            return
        raise HTTPException(status_code=409, detail="Generation already running")


def _track_background_task(task: asyncio.Task) -> None:
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@router.post("/create")
async def start_create(request: ProductCreateRequest):
    state = get_product_state()
    _ensure_not_busy(state)

    logger.info("[product-router] Queuing create request")

    state = clear_product_state()
    state.prompt = request.prompt
    state.latest_instruction = request.prompt
    state.mode = "create"
    state.status = "pending"
    state.message = "Preparing product brief"
    state.in_progress = True
    state.generation_started_at = _utcnow()
    state.image_count = request.image_count
    save_product_state(state)

    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message="Preparing product brief",
    )

    task = asyncio.create_task(
        product_pipeline_service.run_create(request.prompt, request.image_count)
    )
    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.post("/concepts/refine")
async def refine_concepts(request: ProductConceptRefineRequest):
    state = get_product_state()
    _ensure_not_busy(state)
    if not state.design_brief:
        raise HTTPException(status_code=400, detail="No design brief available to refine")

    state.in_progress = True
    state.status = "pending"
    state.message = "Preparing refined concepts"
    state.generation_started_at = _utcnow()
    save_product_state(state)
    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message="Preparing refined concepts",
    )

    task = asyncio.create_task(product_pipeline_service.run_refine_concepts(request.prompt))
    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.post("/concepts/select")
async def select_concept(request: ProductConceptSelectRequest):
    state = get_product_state()
    _ensure_not_busy(state)

    try:
        concept = product_pipeline_service.select_or_refine_concept(
            state,
            concept_id=request.concept_id,
            combine_with_ids=request.combine_with_ids,
            notes=request.notes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    state.status = "complete"
    state.message = f"Selected concept: {concept.title}"
    state.in_progress = False
    state.last_error = None
    save_product_state(state)
    _save_status_from_state(
        state,
        status="complete",
        progress=100,
        message=state.message,
    )

    return {
        "status": "selected",
        "selected_concept_id": concept.concept_id,
        "selected_concept_title": concept.title,
    }


@router.post("/references/generate")
async def generate_references(request: ProductReferenceGenerateRequest):
    state = get_product_state()
    _ensure_not_busy(state)
    if request.concept_id and not any(
        concept.concept_id == request.concept_id for concept in state.concept_directions
    ):
        raise HTTPException(status_code=400, detail="Selected concept was not found")

    state.in_progress = True
    state.status = "pending"
    state.message = "Preparing controlled references"
    state.generation_started_at = _utcnow()
    save_product_state(state)
    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message="Preparing controlled references",
    )

    task = asyncio.create_task(
        product_pipeline_service.run_generate_references(
            concept_id=request.concept_id,
            notes=request.notes,
        )
    )
    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.post("/draft/generate")
async def generate_draft():
    state = get_product_state()
    _ensure_not_busy(state)
    selected_concept = state.get_selected_concept()
    if not selected_concept:
        raise HTTPException(status_code=400, detail="No concept selected for 3D draft generation")
    if not selected_concept.concept_image_url:
        raise HTTPException(status_code=400, detail="Selected concept is missing its concept image")

    state.in_progress = True
    state.status = "pending"
    state.message = "Preparing base 3D generation from selected concept"
    state.generation_started_at = _utcnow()
    save_product_state(state)
    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message="Preparing base 3D generation from selected concept",
    )

    task = asyncio.create_task(product_pipeline_service.run_generate_draft())
    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.post("/edit")
async def start_edit(request: ProductEditRequest):
    state = get_product_state()
    _ensure_not_busy(state)
    if not state.current_model_asset_url and not state.trellis_output:
        raise HTTPException(status_code=400, detail="No base product available to edit")

    logger.info("[product-router] Queuing edit request")

    state.latest_instruction = request.prompt
    state.mode = "edit"
    state.status = "pending"
    state.message = "Preparing edit request"
    state.in_progress = True
    state.generation_started_at = _utcnow()
    save_product_state(state)
    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message="Preparing edit request",
    )

    edit_kind = {
        "region": "edit_region",
        "restyle_materials": "restyle_materials",
    }.get(request.edit_type, "edit_whole_product")
    task = asyncio.create_task(
        product_pipeline_service.run_edit(
            instruction=request.prompt,
            target_scope=request.target_scope,
            edit_kind=edit_kind,
        )
    )

    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.post("/edit-region")
async def start_region_edit(request: ProductEditRegionRequest):
    state = get_product_state()
    _ensure_not_busy(state)
    if not state.current_model_asset_url and not state.trellis_output:
        raise HTTPException(status_code=400, detail="No base product available to edit")

    state.latest_instruction = request.prompt
    state.mode = "edit"
    state.status = "pending"
    state.message = f"Preparing region edit for {request.region_id}"
    state.in_progress = True
    state.generation_started_at = _utcnow()
    save_product_state(state)
    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message=state.message,
    )

    task = asyncio.create_task(
        product_pipeline_service.run_edit(
            instruction=request.prompt,
            target_scope=request.region_id,
            edit_kind="edit_region",
        )
    )
    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.post("/editor-state")
async def update_editor_state(request: ProductEditorStateUpdateRequest):
    state = get_product_state()

    if request.interaction_mode is not None:
        state.editor_state.interaction_mode = request.interaction_mode
    if request.handles_visible is not None:
        state.editor_state.handles_visible = request.handles_visible
    if request.active_tool is not None:
        state.editor_state.active_tool = request.active_tool
    if request.transform is not None:
        state.editor_state.transform = request.transform

    if state.current_model_asset_url or (state.trellis_output and state.trellis_output.model_file):
        state.workflow_stage = "editing"
        state.last_completed_stage = "editing"

    save_product_state(state)
    return {
        "status": "updated",
        "editor_state": state.editor_state.model_dump(mode="json"),
    }


@router.post("/trellis-only")
async def start_trellis_only(request: TrellisOnlyRequest):
    state = get_product_state()
    _ensure_not_busy(state)

    logger.info("[product-router] Queuing Trellis-only request with %s images", len(request.images))
    if request.mode == "create":
        state = clear_product_state()
        state.prompt = request.prompt
    else:
        state.latest_instruction = request.prompt

    state.mode = request.mode
    state.status = "pending"
    state.message = "Preparing 3D generation from pre-generated images"
    state.in_progress = True
    state.generation_started_at = _utcnow()
    state.images = request.images
    state.last_error = None
    save_product_state(state)
    _save_status_from_state(
        state,
        status="pending",
        progress=0,
        message="Preparing 3D generation from pre-generated images",
    )

    task = asyncio.create_task(
        product_pipeline_service.run_trellis_only(
            prompt=request.prompt,
            images=request.images,
            mode=request.mode,
        )
    )
    _track_background_task(task)
    return get_product_status().model_dump(mode="json")


@router.get("")
async def fetch_product_state():
    return get_product_state().model_dump(mode="json")


@router.get("/state")
async def fetch_product_state_alias():
    return get_product_state().model_dump(mode="json")


@router.get("/status")
async def fetch_product_status():
    return get_product_status().model_dump(mode="json")


@router.get("/model/current")
async def fetch_current_product_model():
    state = get_product_state()
    source_url = _resolve_model_source_url(state)
    if not source_url:
        raise HTTPException(status_code=404, detail="No product model available")

    cache_key = state.active_version_id or "current"
    try:
        file_path = get_cached_product_model_path(cache_key, source_url)
    except Exception as exc:
        logger.error("[product-router] Failed to cache current product model: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to retrieve product model: {exc}") from exc

    return FileResponse(
        str(file_path),
        media_type="model/gltf-binary",
        filename="product.glb",
    )


@router.get("/model/{version_id}")
async def fetch_version_product_model(version_id: str):
    state = get_product_state()
    source_url = _resolve_model_source_url(state, version_id=version_id)
    if not source_url:
        raise HTTPException(status_code=404, detail="Product model version not found")

    try:
        file_path = get_cached_product_model_path(version_id, source_url)
    except Exception as exc:
        logger.error("[product-router] Failed to cache product model %s: %s", version_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to retrieve product model: {exc}") from exc

    return FileResponse(
        str(file_path),
        media_type="model/gltf-binary",
        filename=f"{version_id}.glb",
    )


@router.post("/recover")
async def recover_state():
    state = get_product_state()
    recovered = _auto_recover_if_needed(state)
    return {
        "recovered": recovered,
        "in_progress": state.in_progress,
        "has_active_tasks": _has_active_tasks(),
        "workflow_stage": state.workflow_stage,
    }


@router.post("/recover-version/{version_id}")
async def recover_version(version_id: str):
    state = get_product_state()
    _ensure_not_busy(state)

    version_index = next(
        (index for index, version in enumerate(state.version_history) if version.version_id == version_id),
        None,
    )
    if version_index is None:
        raise HTTPException(status_code=404, detail="Version not found")

    version = state.version_history[version_index]
    state.active_version_id = version.version_id
    state.current_model_asset_url = version.model_asset_url
    state.named_regions = version.named_regions
    state.images = version.preview_images.copy()
    state.trellis_output = TrellisArtifacts(
        model_file=version.model_asset_url,
        no_background_images=version.preview_images.copy(),
    )
    state.editor_state.current_model_url = version.model_asset_url
    state.editor_state.active_version_id = version.version_id
    state.editor_state.interaction_mode = "direct_edit"
    state.editor_state.handles_visible = True
    state.editor_state.active_tool = "resize"
    state.editor_state.transform = ProductTransformState()
    state.editor_state.ai_region_labels = version.named_regions
    state.editor_state.provenance = {
        "source_operation_id": version.source_operation_id,
        "recovered": True,
    }
    state.workflow_stage = "editing"
    state.status = "idle"
    state.message = "Recovered prior result"
    state.in_progress = False
    state.last_error = None
    save_product_state(state)
    _save_status_from_state(
        state,
        status="idle",
        progress=0,
        message="Recovered prior result",
    )

    return {
        "status": "recovered",
        "version_id": version.version_id,
        "active_version_id": state.active_version_id,
    }


@router.post("/rewind/{iteration_index}")
async def rewind_product(iteration_index: int):
    state = get_product_state()

    if state.in_progress:
        raise HTTPException(status_code=409, detail="Cannot rewind while generation is running")

    if iteration_index < 0 or iteration_index >= len(state.iterations):
        raise HTTPException(status_code=400, detail="Invalid iteration index")

    target_iteration = state.iterations[iteration_index]
    state.iterations = state.iterations[: iteration_index + 1]
    state.images = target_iteration.images.copy()
    state.trellis_output = target_iteration.trellis_output
    state.latest_instruction = target_iteration.prompt
    if target_iteration.type == "create":
        state.prompt = target_iteration.prompt
    state.mode = target_iteration.type
    state.status = "idle"
    state.message = "Rewound to previous version"
    state.in_progress = False
    state.last_error = None

    if target_iteration.version_id:
        version_index = next(
            (
                index
                for index, version in enumerate(state.version_history)
                if version.version_id == target_iteration.version_id
            ),
            None,
        )
        if version_index is not None:
            state.version_history = state.version_history[: version_index + 1]
            target_version = state.version_history[version_index]
            state.active_version_id = target_version.version_id
            state.current_model_asset_url = target_version.model_asset_url
            state.named_regions = target_version.named_regions
            state.editor_state.current_model_url = target_version.model_asset_url
            state.editor_state.active_version_id = target_version.version_id
            state.editor_state.interaction_mode = "direct_edit"
            state.editor_state.handles_visible = True
            state.editor_state.active_tool = "resize"
            state.editor_state.transform = ProductTransformState()
            state.editor_state.ai_region_labels = target_version.named_regions
            state.workflow_stage = "editing"
    else:
        state.active_version_id = None
        state.current_model_asset_url = state.trellis_output.model_file if state.trellis_output else None
        state.workflow_stage = state.last_completed_stage

    save_product_state(state)
    _save_status_from_state(
        state,
        status="idle",
        progress=0,
        message="Rewound to previous version",
    )

    return {
        "status": "rewound",
        "iteration_index": iteration_index,
        "total_iterations": len(state.iterations),
        "active_version_id": state.active_version_id,
    }


@router.post("/export")
async def trigger_product_export():
    state = get_product_state()

    if not state.trellis_output or not state.trellis_output.model_file:
        raise HTTPException(status_code=400, detail="No product model available for export")

    session_id = str(int(state.updated_at.timestamp()))

    try:
        export_files = export_product_formats(state, session_id)
        state.export_files = {fmt: str(path) for fmt, path in export_files.items()}
        save_product_state(state)
        return {
            "status": "success",
            "files": {fmt: str(path) for fmt, path in export_files.items()},
        }
    except Exception as exc:
        logger.error("[product-router] Export failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(exc)}") from exc


@router.get("/export/{format}")
async def download_product_export(format: str):
    if format not in ["blend", "stl", "jpg"]:
        raise HTTPException(status_code=400, detail=f"Invalid format: {format}")

    state = get_product_state()
    if not state.trellis_output or not state.trellis_output.model_file:
        raise HTTPException(status_code=400, detail="No product model available for export")

    session_id = str(int(state.updated_at.timestamp()))
    file_path = get_export_file_path(session_id, "product", format)

    if not file_path or not file_path.exists():
        try:
            export_files = export_product_formats(state, session_id)
            state.export_files = {fmt: str(path) for fmt, path in export_files.items()}
            save_product_state(state)
            file_path = export_files.get(format)
        except Exception as exc:
            logger.error("[product-router] Export generation failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Export generation failed: {str(exc)}") from exc

    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Export file not found: {format}")

    media_type_map = {
        "blend": "application/octet-stream",
        "stl": "application/octet-stream",
        "jpg": "image/jpeg",
    }
    return FileResponse(
        str(file_path),
        media_type=media_type_map.get(format, "application/octet-stream"),
        filename=f"product.{format if format != 'blend' else 'obj'}",
    )


@router.post("/clear")
async def clear_state():
    logger.info("[product-router] Clearing product state")
    state = clear_product_state()
    save_product_status(ProductStatus(status="idle", message="Product state cleared"))
    return {
        "message": "Product state cleared",
        "state": state.as_json(),
    }
