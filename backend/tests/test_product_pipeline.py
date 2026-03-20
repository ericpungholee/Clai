import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.product_state import (  # noqa: E402
    DesignVersion,
    ProductState,
    ProductStatus,
    TrellisArtifacts,
    clear_product_state,
    get_product_state,
    get_product_status,
    save_product_state,
    save_product_status,
)
from app.services.product_pipeline import product_pipeline_service  # noqa: E402


@pytest.mark.asyncio
async def test_create_flow_builds_initial_draft(monkeypatch):
    clear_product_state()
    save_product_status(ProductStatus())

    generated_prompts: list[tuple[str, str]] = []

    async def fake_generate_images(prompt, workflow, image_count=1, reference_images=None, base_description=None):
        await asyncio.sleep(0)
        del reference_images, base_description
        generated_prompts.append((workflow, prompt))
        assert workflow == "create"
        assert image_count == 1
        return [f"concept-image-{len(generated_prompts)}"]

    async def fake_generate_trellis(images):
        await asyncio.sleep(0)
        assert images == ["concept-image-1"]
        return {
            "model_file": "https://cdn.local/model.glb",
            "color_video": "https://cdn.local/color.mp4",
            "no_background_images": ["https://cdn.local/nobg.png"],
        }

    monkeypatch.setattr(product_pipeline_service, "_generate_product_images", fake_generate_images)
    monkeypatch.setattr(product_pipeline_service, "_generate_trellis_model", fake_generate_trellis)

    await product_pipeline_service.run_create("New speaker concept", image_count=1)

    state = get_product_state()
    status = get_product_status()

    assert state.prompt == "New speaker concept"
    assert state.design_brief is not None
    assert state.design_brief.product_name
    assert len(state.concept_directions) == 1
    assert all(concept.concept_image_url for concept in state.concept_directions)
    assert state.selected_concept_id == state.concept_directions[0].concept_id
    assert state.images == ["concept-image-1"]
    assert state.workflow_stage == "editing"
    assert state.trellis_output is not None
    assert state.current_model_asset_url == "https://cdn.local/model.glb"
    assert len(state.version_history) == 1
    assert len(generated_prompts) == 1
    assert status.status == "complete"
    assert status.workflow_stage == "editing"
    assert status.model_file == "https://cdn.local/model.glb"
    assert not state.in_progress


@pytest.mark.asyncio
async def test_generate_draft_can_create_another_version_from_current_concept(monkeypatch):
    clear_product_state()
    save_product_status(ProductStatus())

    generated_prompts: list[tuple[str, str]] = []
    trellis_calls: list[list[str]] = []

    async def fake_generate_images(prompt, workflow, image_count=1, reference_images=None, base_description=None):
        await asyncio.sleep(0)
        del reference_images, base_description
        generated_prompts.append((workflow, prompt))
        assert workflow == "create"
        assert image_count == 1
        return [f"concept-image-{len(generated_prompts)}"]

    async def fake_generate_trellis(images):
        await asyncio.sleep(0)
        trellis_calls.append(images)
        if len(trellis_calls) == 1:
            assert images == ["concept-image-1"]
            return {
                "model_file": "https://cdn.local/model-1.glb",
                "color_video": "https://cdn.local/color-1.mp4",
                "no_background_images": ["https://cdn.local/nobg-1.png"],
            }

        assert images == ["concept-image-1"]
        return {
            "model_file": "https://cdn.local/model-2.glb",
            "color_video": "https://cdn.local/color-2.mp4",
            "no_background_images": ["https://cdn.local/nobg-2.png"],
        }

    monkeypatch.setattr(product_pipeline_service, "_generate_product_images", fake_generate_images)
    monkeypatch.setattr(product_pipeline_service, "_generate_trellis_model", fake_generate_trellis)

    await product_pipeline_service.run_create("New speaker concept", image_count=1)
    state = get_product_state()
    selected_concept = state.concept_directions[0]
    product_pipeline_service.select_or_refine_concept(state, selected_concept.concept_id)
    await product_pipeline_service.run_generate_draft()

    state = get_product_state()
    status = get_product_status()

    assert len(generated_prompts) == 1
    assert state.reference_set is not None
    assert len(state.reference_set.images) == 1
    assert state.reference_set.images[0].url == "concept-image-1"
    assert state.trellis_output is not None
    assert state.trellis_output.model_file == "https://cdn.local/model-2.glb"
    assert len(state.version_history) == 2
    assert state.active_version_id == state.version_history[-1].version_id
    assert state.current_model_asset_url == "https://cdn.local/model-2.glb"
    assert state.workflow_stage == "editing"
    assert status.status == "complete"
    assert status.workflow_stage == "editing"
    assert status.model_file == "https://cdn.local/model-2.glb"


@pytest.mark.asyncio
async def test_edit_flow_creates_child_version(monkeypatch):
    clear_product_state()

    base_state = ProductState(
        prompt="Base bottle",
        latest_instruction="Base bottle",
        status="complete",
        mode="idle",
        workflow_stage="draft_ready",
        last_completed_stage="draft_ready",
        design_brief=product_pipeline_service._infer_design_brief("Base bottle"),
        concept_directions=product_pipeline_service._build_concept_directions(
            product_pipeline_service._infer_design_brief("Base bottle")
        ),
        selected_concept_id="base-bottle-soft-radius-1",
        images=["existing-image"],
        trellis_output=TrellisArtifacts(model_file="https://cdn.local/base.glb"),
        version_history=[
            DesignVersion(
                version_id="version_base",
                model_asset_url="https://cdn.local/base.glb",
                preview_images=["existing-image"],
                summary_of_changes="Initial draft",
            )
        ],
        active_version_id="version_base",
        current_model_asset_url="https://cdn.local/base.glb",
        named_regions=product_pipeline_service._infer_regions(
            product_pipeline_service._infer_design_brief("Base bottle")
        ),
    )
    save_product_state(base_state)
    save_product_status(ProductStatus(status="complete", progress=100, workflow_stage="draft_ready"))

    async def fake_generate_images(prompt, workflow, image_count=1, reference_images=None, base_description=None):
        await asyncio.sleep(0)
        assert workflow == "edit"
        assert image_count == 1
        assert reference_images == ["existing-image"]
        assert "front_face" in prompt
        return ["edit-1"]

    async def fake_generate_trellis(images):
        await asyncio.sleep(0)
        assert images == ["edit-1"]
        return TrellisArtifacts(model_file="https://cdn.local/new.glb").model_dump(mode="json")

    monkeypatch.setattr(product_pipeline_service, "_generate_product_images", fake_generate_images)
    monkeypatch.setattr(product_pipeline_service, "_generate_trellis_model", fake_generate_trellis)

    await product_pipeline_service.run_edit(
        "Add metallic label",
        target_scope="front_face",
        edit_kind="edit_region",
    )

    state = get_product_state()
    status = get_product_status()

    assert len(state.version_history) == 2
    assert state.active_version_id == state.version_history[-1].version_id
    assert state.version_history[-1].parent_version_id == "version_base"
    assert state.editor_state.selected_part_id == "front_face"
    assert state.workflow_stage == "editing"
    assert state.editor_state.interaction_mode == "direct_edit"
    assert state.editor_state.handles_visible is True
    assert state.editor_state.active_tool == "resize"
    assert state.iterations[-1].type == "edit"
    assert state.trellis_output is not None
    assert state.trellis_output.model_file == "https://cdn.local/new.glb"
    assert status.status == "complete"
    assert status.workflow_stage == "editing"
    assert status.model_file == "https://cdn.local/new.glb"
