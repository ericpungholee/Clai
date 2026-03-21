import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.redis import redis_service  # noqa: E402
from app.models.product_state import (  # noqa: E402
    DesignVersion,
    ProductState,
    ProductStatus,
    TrellisArtifacts,
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


def test_product_model_endpoint_serves_active_version(monkeypatch):
    client = TestClient(app)
    product_router_module = importlib.import_module("app.endpoints.product.router")

    state = ProductState(
        prompt="speaker concept",
        status="complete",
        workflow_stage="editing",
        last_completed_stage="editing",
        current_model_asset_url="https://cdn.local/model.glb",
        trellis_output=TrellisArtifacts(model_file="https://cdn.local/model.glb"),
        version_history=[
            DesignVersion(
                version_id="version_1",
                model_asset_url="https://cdn.local/model.glb",
                summary_of_changes="Initial draft",
            )
        ],
        active_version_id="version_1",
    )
    save_product_state(state)
    save_product_status(
        ProductStatus(
            status="complete",
            progress=100,
            workflow_stage="editing",
            active_version_id="version_1",
            model_file="https://cdn.local/model.glb",
        )
    )

    def fake_get_cached_product_model_path(cache_key: str, source_url: str) -> Path:
        assert cache_key == "version_1"
        assert source_url == "https://cdn.local/model.glb"
        path = Path.cwd() / "backend" / "tests" / "artifacts" / "test-model.glb"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"glb")
        return path

    monkeypatch.setattr(product_router_module, "get_cached_product_model_path", fake_get_cached_product_model_path)

    response = client.get("/product/model/version_1")

    assert response.status_code == 200, response.text
    assert response.content == b"glb"
