import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.integrations.trellis import TrellisService, resolve_trellis_preset  # noqa: E402


def test_generate_3d_asset_uses_valid_fast_defaults(monkeypatch):
    captured: dict[str, object] = {}

    def fake_subscribe(model_id, arguments, with_logs, on_queue_update):
        del with_logs, on_queue_update
        captured["model_id"] = model_id
        captured["arguments"] = arguments
        return {"model_glb": {"url": "https://cdn.local/model.glb"}}

    monkeypatch.setattr("app.integrations.trellis.fal_client.subscribe", fake_subscribe)

    service = TrellisService()
    output = service.generate_3d_asset(images=["data:image/png;base64,abc"])

    assert output["model_file"] == "https://cdn.local/model.glb"
    assert captured["model_id"] == service.model_id
    assert captured["arguments"]["resolution"] == 512
    assert captured["arguments"]["texture_size"] == 1024
    assert captured["arguments"]["image_url"] == "data:image/png;base64,abc"


def test_balanced_plus_preset_uses_supported_texture_size():
    preset = resolve_trellis_preset("balanced_plus")

    assert preset["texture_size"] in {1024, 2048, 4096}
    assert preset["texture_size"] == 2048
