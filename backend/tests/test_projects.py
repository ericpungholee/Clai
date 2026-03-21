import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.redis import redis_service  # noqa: E402
from app.models.packaging_state import (  # noqa: E402
    PackagingState,
    PanelTexture,
    get_packaging_state,
    save_packaging_state,
)
from app.models.product_state import (  # noqa: E402
    DesignVersion,
    ProductEditorState,
    ProductState,
    ProductStatus,
    ProductTransformState,
    TrellisArtifacts,
    get_product_state,
    get_product_status,
    save_product_state,
    save_product_status,
)
from main import app  # noqa: E402


_redis_snapshot: dict[str, str | None] = {}


def setup_function():
    global _redis_snapshot
    _redis_snapshot = {key: redis_service.get(key) for key in redis_service.keys("*")}
    redis_service.flushdb()


def teardown_function():
    redis_service.flushdb()
    for key, value in _redis_snapshot.items():
        if value is not None:
            redis_service.set(key, value)


def test_projects_save_current_workspace_snapshot():
    client = TestClient(app)

    create_response = client.post(
        "/projects",
        json={
            "prompt": "portable speaker concept",
            "last_route": "/product",
        },
    )
    assert create_response.status_code == 200, create_response.text
    created_project = create_response.json()["project"]
    assert created_project["project_id"]

    product_state = ProductState(
        prompt="portable speaker concept",
        status="complete",
        workflow_stage="editing",
        last_completed_stage="editing",
        current_model_asset_url="https://cdn.local/speaker.glb",
        trellis_output=TrellisArtifacts(model_file="https://cdn.local/speaker.glb"),
        editor_state=ProductEditorState(
            current_model_url="https://cdn.local/speaker.glb",
            interaction_mode="direct_edit",
            handles_visible=True,
            active_tool="move",
            transform=ProductTransformState(
                position=[0.4, 0.0, -0.2],
                rotation=[0.0, 0.25, 0.0],
                scale=[1.15, 0.95, 1.05],
            ),
        ),
    )
    save_product_state(product_state)
    save_product_status(
        ProductStatus(
            status="complete",
            progress=100,
            workflow_stage="editing",
            model_file="https://cdn.local/speaker.glb",
        )
    )

    packaging_state = PackagingState()
    packaging_state.current_package_type = "cylinder"
    packaging_state.cylinder_state.dimensions = {"width": 120.0, "height": 180.0, "depth": 120.0}
    packaging_state.cylinder_state.panel_textures = {
        "body": PanelTexture(
            panel_id="body",
            texture_url="data:image/png;base64,abc123",
            prompt="speaker can wrap",
        )
    }
    save_packaging_state(packaging_state)

    save_response = client.post("/projects/save", json={"last_route": "/packaging"})
    assert save_response.status_code == 200, save_response.text
    saved_project = save_response.json()["project"]

    assert saved_project["project_id"] == created_project["project_id"]
    assert saved_project["last_route"] == "/packaging"
    assert saved_project["has_product_model"] is True
    assert saved_project["has_packaging"] is True
    assert saved_project["status_label"] == "Packaging in progress"

    list_response = client.get("/projects")
    assert list_response.status_code == 200, list_response.text
    payload = list_response.json()

    assert payload["current_project_id"] == created_project["project_id"]
    assert len(payload["projects"]) == 1
    assert payload["projects"][0]["project_id"] == created_project["project_id"]


def test_open_project_restores_saved_workspace_state():
    client = TestClient(app)

    create_response = client.post(
        "/projects",
        json={
            "prompt": "desk lamp concept",
            "last_route": "/product",
        },
    )
    assert create_response.status_code == 200, create_response.text
    project_id = create_response.json()["project"]["project_id"]

    saved_product_state = ProductState(
        prompt="desk lamp concept",
        status="pending",
        workflow_stage="editing",
        last_completed_stage="editing",
        in_progress=True,
        current_model_asset_url="https://cdn.local/lamp.glb",
        trellis_output=TrellisArtifacts(
            model_file="https://cdn.local/lamp.glb",
            no_background_images=["https://cdn.local/lamp.png"],
        ),
        editor_state=ProductEditorState(
            current_model_url="https://cdn.local/lamp.glb",
            interaction_mode="direct_edit",
            handles_visible=True,
            active_tool="rotate",
            transform=ProductTransformState(
                position=[0.1, 0.2, 0.3],
                rotation=[0.0, 0.5, 0.0],
                scale=[1.3, 1.0, 0.8],
            ),
        ),
    )
    save_product_state(saved_product_state)
    save_product_status(
        ProductStatus(
            status="pending",
            progress=72,
            workflow_stage="editing",
            model_file="https://cdn.local/lamp.glb",
        )
    )

    saved_packaging_state = PackagingState()
    saved_packaging_state.current_package_type = "box"
    saved_packaging_state.box_state.dimensions = {"width": 140.0, "height": 210.0, "depth": 90.0}
    saved_packaging_state.box_state.panel_textures = {
        "front": PanelTexture(
            panel_id="front",
            texture_url="data:image/png;base64,front123",
            prompt="lamp front panel",
        )
    }
    save_packaging_state(saved_packaging_state)

    save_response = client.post("/projects/save", json={"last_route": "/packaging"})
    assert save_response.status_code == 200, save_response.text

    second_project_response = client.post(
        "/projects",
        json={
            "prompt": "different project",
            "last_route": "/product",
        },
    )
    assert second_project_response.status_code == 200, second_project_response.text

    save_product_state(ProductState(prompt="different project"))
    save_product_status(ProductStatus(status="idle", workflow_stage="idle"))
    save_packaging_state(PackagingState())

    open_response = client.post(f"/projects/{project_id}/open")
    assert open_response.status_code == 200, open_response.text
    reopened_project = open_response.json()["project"]

    current_product_state = get_product_state()
    current_product_status = get_product_status()
    current_packaging_state = get_packaging_state()

    assert reopened_project["project_id"] == project_id
    assert reopened_project["last_route"] == "/packaging"

    assert current_product_state.prompt == "desk lamp concept"
    assert current_product_state.in_progress is False
    assert current_product_state.editor_state.active_tool == "rotate"
    assert current_product_state.editor_state.transform.scale == [1.3, 1.0, 0.8]
    assert current_product_state.editor_state.transform.position == [0.1, 0.2, 0.3]

    assert current_product_status.status == "idle"
    assert current_product_status.workflow_stage == "editing"
    assert current_product_status.model_file == "https://cdn.local/lamp.glb"

    assert current_packaging_state.current_package_type == "box"
    assert current_packaging_state.box_state.dimensions == {
        "width": 140.0,
        "height": 210.0,
        "depth": 90.0,
    }
    assert "front" in current_packaging_state.box_state.panel_textures


def test_project_list_prefers_inline_preview_images_for_cards():
    client = TestClient(app)

    create_response = client.post(
        "/projects",
        json={
            "prompt": "speaker concept",
            "last_route": "/product",
        },
    )
    assert create_response.status_code == 200, create_response.text

    product_state = ProductState(
        prompt="speaker concept",
        status="complete",
        workflow_stage="editing",
        last_completed_stage="editing",
        current_model_asset_url="https://cdn.local/speaker.glb",
        images=["data:image/png;base64,inline-preview"],
        trellis_output=TrellisArtifacts(
            model_file="https://cdn.local/speaker.glb",
            no_background_images=["https://cdn.local/expiring-preview.png"],
        ),
        version_history=[
            DesignVersion(
                version_id="version_1",
                model_asset_url="https://cdn.local/speaker.glb",
                preview_images=["https://cdn.local/version-preview.png"],
                summary_of_changes="Initial draft",
            )
        ],
        active_version_id="version_1",
    )
    save_product_state(product_state)
    save_product_status(
        ProductStatus(
            status="complete",
            progress=100,
            workflow_stage="editing",
            model_file="https://cdn.local/speaker.glb",
        )
    )

    list_response = client.get("/projects")
    assert list_response.status_code == 200, list_response.text
    payload = list_response.json()

    assert payload["projects"][0]["preview_image"] == "data:image/png;base64,inline-preview"
