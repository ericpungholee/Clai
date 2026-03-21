from __future__ import annotations

import hashlib
import logging
import tempfile
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

PRODUCT_MODEL_DIR = Path(tempfile.gettempdir()) / "clai_product_models"
PRODUCT_MODEL_DIR.mkdir(parents=True, exist_ok=True)


def _safe_suffix_from_url(url: str) -> str:
    lower_url = url.lower()
    if ".glb" in lower_url:
        return ".glb"
    return ".bin"


def get_cached_product_model_path(cache_key: str, source_url: str) -> Path:
    digest = hashlib.sha256(source_url.encode("utf-8")).hexdigest()[:16]
    suffix = _safe_suffix_from_url(source_url)
    local_path = PRODUCT_MODEL_DIR / f"{cache_key}_{digest}{suffix}"

    if local_path.exists() and local_path.stat().st_size > 0:
        return local_path

    logger.info("[product-model-store] Caching product model %s", source_url)
    with urllib.request.urlopen(source_url) as response:
        local_path.write_bytes(response.read())
    return local_path
