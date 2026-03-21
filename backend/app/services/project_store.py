from __future__ import annotations

import logging
import re
from typing import Optional
from uuid import uuid4

from app.core.redis import redis_service
from app.models.packaging_state import PackagingState
from app.models.product_state import ProductState, ProductStatus
from app.models.project_state import (
    CURRENT_PROJECT_KEY,
    PROJECT_INDEX_KEY,
    SavedProjectRecord,
    SavedProjectSummary,
    _utcnow,
)

logger = logging.getLogger(__name__)

_UNTITLED_PROJECT_NAME = "Untitled project"


def _project_key(project_id: str) -> str:
    return f"project:{project_id}"


def _load_index() -> list[str]:
    payload = redis_service.get_json(PROJECT_INDEX_KEY, default=[])
    if not isinstance(payload, list):
        return []
    return [value for value in payload if isinstance(value, str) and value]


def _save_index(project_ids: list[str]) -> None:
    redis_service.set_json(PROJECT_INDEX_KEY, project_ids)


def _serialize_project(record: SavedProjectRecord) -> SavedProjectRecord:
    return SavedProjectRecord.model_validate(record.model_dump(mode="json"))


def _sanitize_project_name(name: Optional[str]) -> Optional[str]:
    if name is None:
        return None
    cleaned = re.sub(r"\s+", " ", name).strip()
    return cleaned[:80] if cleaned else None


def _derive_project_name(
    current_name: Optional[str],
    *,
    prompt: Optional[str],
    product_state: Optional[ProductState],
) -> str:
    cleaned_name = _sanitize_project_name(current_name)
    if cleaned_name and cleaned_name != _UNTITLED_PROJECT_NAME:
        return cleaned_name

    brief_name = product_state.design_brief.product_name if product_state and product_state.design_brief else None
    if brief_name:
        return _sanitize_project_name(brief_name) or _UNTITLED_PROJECT_NAME

    cleaned_prompt = _sanitize_project_name(prompt)
    if cleaned_prompt:
        return cleaned_prompt[:60]

    return _UNTITLED_PROJECT_NAME


def _is_inline_image(url: Optional[str]) -> bool:
    return bool(url and isinstance(url, str) and url.startswith("data:image"))


def _preview_image(product_state: ProductState, packaging_state: PackagingState) -> Optional[str]:
    # Prefer inline previews first because Trellis no-background URLs can expire,
    # while Gemini and packaging data URLs remain stable for project cards.
    inline_candidates = [
        *product_state.images,
        *(product_state.get_active_version().preview_images if product_state.get_active_version() else []),
        *(product_state.trellis_output.no_background_images if product_state.trellis_output else []),
        *[
            texture.texture_url
            for texture in product_state_to_packaging_textures(packaging_state)
        ],
    ]
    for candidate in inline_candidates:
        if _is_inline_image(candidate):
            return candidate

    active_version = product_state.get_active_version()
    if active_version and active_version.preview_images:
        return active_version.preview_images[0]
    if product_state.trellis_output and product_state.trellis_output.no_background_images:
        return product_state.trellis_output.no_background_images[0]
    if product_state.images:
        return product_state.images[0]
    for texture in packaging_state.box_state.panel_textures.values():
        if texture.texture_url:
            return texture.texture_url
    for texture in packaging_state.cylinder_state.panel_textures.values():
        if texture.texture_url:
            return texture.texture_url
    return None


def product_state_to_packaging_textures(packaging_state: PackagingState):
    return [
        *packaging_state.box_state.panel_textures.values(),
        *packaging_state.cylinder_state.panel_textures.values(),
    ]


def _has_packaging_assets(packaging_state: PackagingState) -> bool:
    return bool(packaging_state.box_state.panel_textures or packaging_state.cylinder_state.panel_textures)


def _status_label(product_state: ProductState, packaging_state: PackagingState) -> str:
    if product_state.workflow_stage == "error" or product_state.status == "error":
        return "Needs attention"
    if _has_packaging_assets(packaging_state):
        return "Packaging in progress"
    if product_state.current_model_asset_url or (product_state.trellis_output and product_state.trellis_output.model_file):
        return "3D draft ready"
    if product_state.selected_concept_id:
        return "Concept selected"
    if product_state.concept_directions:
        return "Concepts ready"
    if product_state.prompt:
        return "Brief started"
    return "New project"


def _build_summary(record: SavedProjectRecord) -> SavedProjectSummary:
    selected_concept = record.product_state.get_selected_concept()
    return SavedProjectSummary(
        project_id=record.project_id,
        name=_derive_project_name(
            record.name,
            prompt=record.prompt,
            product_state=record.product_state,
        ),
        prompt=record.product_state.prompt or record.prompt,
        last_route=record.last_route,
        created_at=record.created_at,
        updated_at=record.updated_at,
        workflow_stage=record.product_state.workflow_stage,
        status_label=_status_label(record.product_state, record.packaging_state),
        preview_image=_preview_image(record.product_state, record.packaging_state),
        selected_concept_title=selected_concept.title if selected_concept else None,
        has_product_model=bool(
            record.product_state.current_model_asset_url
            or (record.product_state.trellis_output and record.product_state.trellis_output.model_file)
        ),
        has_packaging=_has_packaging_assets(record.packaging_state),
    )


def _store_project_record(record: SavedProjectRecord) -> SavedProjectRecord:
    record.updated_at = _utcnow()
    redis_service.set_json(_project_key(record.project_id), record.as_json())

    project_ids = _load_index()
    project_ids = [project_id for project_id in project_ids if project_id != record.project_id]
    project_ids.insert(0, record.project_id)
    _save_index(project_ids)
    return record


def list_project_summaries() -> list[SavedProjectSummary]:
    summaries: list[SavedProjectSummary] = []
    retained_ids: list[str] = []

    for project_id in _load_index():
        record = get_project_record(project_id)
        if not record:
            continue
        retained_ids.append(project_id)
        summaries.append(_build_summary(record))

    if retained_ids != _load_index():
        _save_index(retained_ids)

    return summaries


def get_project_record(project_id: str) -> Optional[SavedProjectRecord]:
    payload = redis_service.get_json(_project_key(project_id))
    if not payload:
        return None
    try:
        return SavedProjectRecord.model_validate(payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[project-store] Failed to validate project %s: %s", project_id, exc)
        return None


def get_project_summary(project_id: str) -> Optional[SavedProjectSummary]:
    record = get_project_record(project_id)
    if not record:
        return None
    return _build_summary(record)


def get_current_project_id() -> Optional[str]:
    value = redis_service.get(CURRENT_PROJECT_KEY)
    return value or None


def set_current_project_id(project_id: Optional[str]) -> None:
    if project_id:
        redis_service.set(CURRENT_PROJECT_KEY, project_id)
    else:
        redis_service.delete(CURRENT_PROJECT_KEY)


def get_current_project_record() -> Optional[SavedProjectRecord]:
    project_id = get_current_project_id()
    if not project_id:
        return None
    return get_project_record(project_id)


def get_current_project_summary() -> Optional[SavedProjectSummary]:
    record = get_current_project_record()
    if not record:
        return None
    return _build_summary(record)


def create_project(
    *,
    name: Optional[str] = None,
    prompt: Optional[str] = None,
    last_route: str = "/product",
    activate: bool = True,
    product_state: Optional[ProductState] = None,
    product_status: Optional[ProductStatus] = None,
    packaging_state: Optional[PackagingState] = None,
) -> SavedProjectRecord:
    base_product_state = _serialize_project(
        SavedProjectRecord(
            project_id=f"proj_{uuid4().hex[:12]}",
            name=_derive_project_name(name, prompt=prompt, product_state=product_state),
            prompt=prompt,
            last_route=last_route,
            product_state=product_state or ProductState(),
            product_status=product_status or ProductStatus(),
            packaging_state=packaging_state or PackagingState(),
        )
    )

    _store_project_record(base_product_state)
    if activate:
        set_current_project_id(base_product_state.project_id)
    return base_product_state


def touch_current_project_route(last_route: str) -> Optional[SavedProjectRecord]:
    record = get_current_project_record()
    if not record:
        return None
    record.last_route = last_route
    return _store_project_record(record)


def ensure_current_project(
    *,
    name: Optional[str] = None,
    prompt: Optional[str] = None,
    last_route: str = "/product",
) -> SavedProjectRecord:
    existing = get_current_project_record()
    if existing:
        return existing

    from app.models.packaging_state import get_packaging_state
    from app.models.product_state import get_product_state, get_product_status

    return create_project(
        name=name,
        prompt=prompt or get_product_state().prompt,
        last_route=last_route,
        activate=True,
        product_state=get_product_state(),
        product_status=get_product_status(),
        packaging_state=get_packaging_state(),
    )


def _normalize_product_state_for_reopen(state: ProductState) -> ProductState:
    normalized = ProductState.model_validate(state.model_dump(mode="json"))
    if normalized.in_progress:
        normalized.in_progress = False
        normalized.generation_started_at = None
        if normalized.workflow_stage != "error":
            normalized.workflow_stage = normalized.last_completed_stage
        if normalized.status != "error":
            normalized.status = "idle"
        normalized.message = "Saved project reopened"
    return normalized


def _normalize_product_status_for_reopen(state: ProductState) -> ProductStatus:
    preview_image = _preview_image(state, PackagingState())
    model_file = state.current_model_asset_url or (state.trellis_output.model_file if state.trellis_output else None)
    if state.workflow_stage == "error" or state.status == "error":
        return ProductStatus(
            status="error",
            progress=0,
            message=state.last_error or state.message or "Project reopened with errors",
            error=state.last_error,
            workflow_stage=state.workflow_stage,
            active_version_id=state.active_version_id,
            model_file=model_file,
            preview_image=preview_image,
        )

    progress = 100 if state.workflow_stage in {"concepts_ready", "references_ready", "draft_ready", "editing"} else 0
    return ProductStatus(
        status="idle",
        progress=progress,
        message="Saved project reopened",
        workflow_stage=state.workflow_stage,
        active_version_id=state.active_version_id,
        model_file=model_file,
        preview_image=preview_image,
    )


def _normalize_packaging_state_for_reopen(state: PackagingState) -> PackagingState:
    normalized = PackagingState.model_validate(state.model_dump(mode="json"))
    normalized.in_progress = False
    normalized.generating_panel = None
    normalized.generating_panels = []
    normalized.bulk_generation_in_progress = False
    return normalized


def open_project(project_id: str) -> SavedProjectRecord:
    record = get_project_record(project_id)
    if not record:
        raise KeyError(project_id)

    from app.models.packaging_state import save_packaging_state
    from app.models.product_state import save_product_state, save_product_status

    normalized_product_state = _normalize_product_state_for_reopen(record.product_state)
    normalized_product_status = _normalize_product_status_for_reopen(normalized_product_state)
    normalized_packaging_state = _normalize_packaging_state_for_reopen(record.packaging_state)

    set_current_project_id(record.project_id)
    save_product_state(normalized_product_state)
    save_product_status(normalized_product_status)
    save_packaging_state(normalized_packaging_state)

    reopened = get_project_record(project_id)
    return reopened or record


def save_current_project(
    *,
    name: Optional[str] = None,
    last_route: Optional[str] = None,
) -> SavedProjectRecord:
    from app.models.packaging_state import get_packaging_state
    from app.models.product_state import get_product_state, get_product_status

    record = ensure_current_project(last_route=last_route or "/product")
    record.product_state = ProductState.model_validate(get_product_state().model_dump(mode="json"))
    record.product_status = ProductStatus.model_validate(get_product_status().model_dump(mode="json"))
    record.packaging_state = PackagingState.model_validate(get_packaging_state().model_dump(mode="json"))
    record.prompt = record.product_state.prompt or record.prompt
    if last_route:
        record.last_route = last_route
    record.name = _derive_project_name(
        name if name is not None else record.name,
        prompt=record.prompt,
        product_state=record.product_state,
    )
    return _store_project_record(record)


def sync_current_project_product_state(state: ProductState | dict) -> Optional[SavedProjectRecord]:
    record = get_current_project_record()
    if not record:
        return None
    record.product_state = ProductState.model_validate(
        state.model_dump(mode="json") if isinstance(state, ProductState) else state
    )
    record.prompt = record.product_state.prompt or record.prompt
    record.name = _derive_project_name(record.name, prompt=record.prompt, product_state=record.product_state)
    return _store_project_record(record)


def sync_current_project_product_status(status: ProductStatus | dict) -> Optional[SavedProjectRecord]:
    record = get_current_project_record()
    if not record:
        return None
    record.product_status = ProductStatus.model_validate(
        status.model_dump(mode="json") if isinstance(status, ProductStatus) else status
    )
    return _store_project_record(record)


def sync_current_project_packaging_state(state: PackagingState | dict) -> Optional[SavedProjectRecord]:
    record = get_current_project_record()
    if not record:
        return None
    record.packaging_state = PackagingState.model_validate(
        state.model_dump(mode="json") if isinstance(state, PackagingState) else state
    )
    return _store_project_record(record)
