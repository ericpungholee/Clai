import logging
import os
import time
from typing import Dict, List, Literal, Optional

import fal_client
from typing_extensions import TypedDict

from app.core.config import settings

logger = logging.getLogger(__name__)

TrellisQuality = Literal["fast", "balanced", "balanced_plus", "high_quality"]

TRELLIS_PRESETS: Dict[TrellisQuality, Dict[str, object]] = {
    "fast": {
        "resolution": 512,
        "texture_size": 1024,
        "decimation_target": 250000,
        "ss_sampling_steps": 8,
        "ss_guidance_strength": 7.5,
        "shape_slat_sampling_steps": 8,
        "shape_slat_guidance_strength": 7.5,
        "tex_slat_sampling_steps": 8,
        "tex_slat_guidance_strength": 1.0,
        "remesh": True,
        "remesh_band": 1.0,
    },
    "balanced": {
        "resolution": 1024,
        "texture_size": 2048,
        "decimation_target": 500000,
        "ss_sampling_steps": 12,
        "ss_guidance_strength": 7.5,
        "shape_slat_sampling_steps": 12,
        "shape_slat_guidance_strength": 7.5,
        "tex_slat_sampling_steps": 12,
        "tex_slat_guidance_strength": 1.0,
        "remesh": True,
        "remesh_band": 1.0,
    },
    "balanced_plus": {
        "resolution": 1024,
        "texture_size": 2048,
        "decimation_target": 550000,
        "ss_sampling_steps": 12,
        "ss_guidance_strength": 8.0,
        "shape_slat_sampling_steps": 12,
        "shape_slat_guidance_strength": 8.0,
        "tex_slat_sampling_steps": 12,
        "tex_slat_guidance_strength": 1.0,
        "remesh": True,
        "remesh_band": 1.0,
    },
    "high_quality": {
        "resolution": 1536,
        "texture_size": 4096,
        "decimation_target": 750000,
        "ss_sampling_steps": 20,
        "ss_guidance_strength": 8.0,
        "shape_slat_sampling_steps": 20,
        "shape_slat_guidance_strength": 8.0,
        "tex_slat_sampling_steps": 16,
        "tex_slat_guidance_strength": 1.0,
        "remesh": True,
        "remesh_band": 1.0,
    },
}


def resolve_trellis_preset(quality: TrellisQuality) -> Dict[str, object]:
    return TRELLIS_PRESETS[quality].copy()


class TrellisOutput(TypedDict, total=False):
    """Output schema from the active Trellis model."""

    model_file: str
    color_video: str
    gaussian_ply: str
    normal_video: str
    combined_video: str
    no_background_images: List[str]


class TrellisService:
    def __init__(self):
        self.api_key = settings.FAL_KEY
        self.model_id = settings.TRELLIS_MODEL_ID
        self._progress_callback = None

        if self.api_key:
            os.environ["FAL_KEY"] = self.api_key
            logger.info("fal.ai API key configured: %s...", self.api_key[:10])
        else:
            logger.warning("No fal.ai API key found in settings")

    def generate_3d_asset(
        self,
        images: List[str],
        seed: int = 1337,
        resolution: int = 512,
        texture_size: int = 1024,
        decimation_target: int = 250000,
        ss_sampling_steps: int = 8,
        ss_guidance_strength: float = 7.5,
        shape_slat_sampling_steps: int = 8,
        shape_slat_guidance_strength: float = 7.5,
        tex_slat_sampling_steps: int = 8,
        tex_slat_guidance_strength: float = 1.0,
        remesh: bool = True,
        remesh_band: float = 1.0,
        progress_callback=None,
        use_multi_image: bool = False,
        multiimage_algo: Optional[str] = None,
    ) -> TrellisOutput:
        """Generate a 3D asset from input images using fal.ai Trellis."""

        try:
            if not images:
                raise ValueError("No images provided")

            use_multi = use_multi_image and len(images) > 1
            self._progress_callback = progress_callback

            logger.info("=" * 80)
            logger.info("TRELLIS SERVICE - Submitting request to fal.ai")
            logger.info("  model_id: %s", self.model_id)
            logger.info("  image_count: %s", len(images))
            logger.info("  seed: %s", seed)
            logger.info("  resolution: %s", resolution)
            logger.info("  texture_size: %s", texture_size)
            logger.info("  decimation_target: %s", decimation_target)
            logger.info("  ss_sampling_steps: %s", ss_sampling_steps)
            logger.info("  ss_guidance_strength: %s", ss_guidance_strength)
            logger.info("  shape_slat_sampling_steps: %s", shape_slat_sampling_steps)
            logger.info("  shape_slat_guidance_strength: %s", shape_slat_guidance_strength)
            logger.info("  tex_slat_sampling_steps: %s", tex_slat_sampling_steps)
            logger.info("  tex_slat_guidance_strength: %s", tex_slat_guidance_strength)
            logger.info("  remesh: %s", remesh)
            logger.info("  remesh_band: %s", remesh_band)
            logger.info("=" * 80)

            arguments = {
                "seed": seed,
                "resolution": resolution,
                "texture_size": texture_size,
                "decimation_target": decimation_target,
                "ss_sampling_steps": ss_sampling_steps,
                "ss_guidance_strength": ss_guidance_strength,
                "shape_slat_sampling_steps": shape_slat_sampling_steps,
                "shape_slat_guidance_strength": shape_slat_guidance_strength,
                "tex_slat_sampling_steps": tex_slat_sampling_steps,
                "tex_slat_guidance_strength": tex_slat_guidance_strength,
                "remesh": remesh,
                "remesh_band": remesh_band,
            }

            if use_multi:
                arguments["image_urls"] = images
                if multiimage_algo:
                    logger.info(
                        "  multiimage_algo %s ignored by %s",
                        multiimage_algo,
                        self.model_id,
                    )
            else:
                arguments["image_url"] = images[0]

            start_time = time.time()
            result = fal_client.subscribe(
                self.model_id,
                arguments=arguments,
                with_logs=True,
                on_queue_update=lambda update: self._handle_queue_update(update),
            )
            generation_time = time.time() - start_time

            logger.info("=" * 80)
            logger.info("Request completed successfully")
            logger.info(
                "GENERATION TIME: %.2f seconds (%.2f minutes)",
                generation_time,
                generation_time / 60,
            )
            logger.info("=" * 80)

            if isinstance(result, dict) and "timings" in result:
                logger.info("Fal.ai timings: %s", result["timings"])

            output = self._map_result(result)
            logger.info("Successfully generated 3D asset in %.2fs: %s", generation_time, output)
            return output

        except Exception as exc:
            logger.exception("Failed to generate 3D asset: %s", exc)
            raise Exception(f"Failed to generate 3D asset: {exc}")

    def _map_result(self, result) -> TrellisOutput:
        output: TrellisOutput = {}

        if not isinstance(result, dict):
            raise Exception(f"No valid output received from fal.ai. Result was: {result}")

        model_glb = result.get("model_glb")
        if isinstance(model_glb, dict) and "url" in model_glb:
            output["model_file"] = model_glb["url"]
        elif isinstance(model_glb, str):
            output["model_file"] = model_glb

        # Fallback for older Trellis result shapes if the model id is overridden.
        if "model_file" not in output:
            legacy_model_mesh = result.get("model_mesh")
            if isinstance(legacy_model_mesh, dict) and "url" in legacy_model_mesh:
                output["model_file"] = legacy_model_mesh["url"]
            elif isinstance(legacy_model_mesh, str):
                output["model_file"] = legacy_model_mesh

        if "model_file" not in output:
            raise Exception(f"No valid output received from fal.ai. Result was: {result}")

        return output

    def _handle_queue_update(self, update):
        """Handle queue status updates and log progress."""

        status_msg = None
        progress_val = None

        if hasattr(update, "status"):
            logger.info("Queue status: %s", update.status)
            status_msg = update.status
            if update.status == "IN_QUEUE":
                progress_val = 50
            elif update.status == "IN_PROGRESS":
                progress_val = 70

        if hasattr(update, "logs") and update.logs:
            for log in update.logs:
                if hasattr(log, "message"):
                    logger.info("  Progress: %s", log.message)
                    status_msg = log.message
                elif isinstance(log, dict) and "message" in log:
                    logger.info("  Progress: %s", log["message"])
                    status_msg = log["message"]
                elif isinstance(log, str):
                    logger.info("  Progress: %s", log)
                    status_msg = log

        if self._progress_callback and status_msg:
            self._progress_callback(
                status="generating_model",
                progress=progress_val or 60,
                message=f"Trellis: {status_msg}",
            )


trellis_service = TrellisService()
