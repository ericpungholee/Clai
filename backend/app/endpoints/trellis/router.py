import logging
import traceback
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.redis import redis_service
from app.integrations.trellis import TrellisOutput, TrellisQuality, resolve_trellis_preset, trellis_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trellis", tags=["trellis"])
STATUS_KEY = "trellis_status:current"


class Generate3DRequest(BaseModel):
    images: List[str]
    seed: int = 1337
    resolution: Optional[int] = None
    texture_size: Optional[int] = None
    decimation_target: Optional[int] = None
    ss_sampling_steps: Optional[int] = None
    ss_guidance_strength: Optional[float] = None
    shape_slat_sampling_steps: Optional[int] = None
    shape_slat_guidance_strength: Optional[float] = None
    tex_slat_sampling_steps: Optional[int] = None
    tex_slat_guidance_strength: Optional[float] = None
    remesh: Optional[bool] = None
    remesh_band: Optional[float] = None
    quality: TrellisQuality = "balanced"
    use_multi_image: Optional[bool] = None


@router.post("/generate", response_model=TrellisOutput)
async def generate_3d_asset(request: Generate3DRequest):
    """Generate a 3D asset from input images using Trellis."""

    try:
        logger.info("=" * 80)
        logger.info("TRELLIS REQUEST PARAMETERS:")
        logger.info("  image_count: %s", len(request.images))
        logger.info("  quality: %s", request.quality)
        logger.info("=" * 80)

        _set_status(
            {
                "status": "processing",
                "progress": 5,
                "message": "Submitting job to Trellis...",
            }
        )

        preset = resolve_trellis_preset(request.quality)
        overrides = {
            "resolution": request.resolution,
            "texture_size": request.texture_size,
            "decimation_target": request.decimation_target,
            "ss_sampling_steps": request.ss_sampling_steps,
            "ss_guidance_strength": request.ss_guidance_strength,
            "shape_slat_sampling_steps": request.shape_slat_sampling_steps,
            "shape_slat_guidance_strength": request.shape_slat_guidance_strength,
            "tex_slat_sampling_steps": request.tex_slat_sampling_steps,
            "tex_slat_guidance_strength": request.tex_slat_guidance_strength,
            "remesh": request.remesh,
            "remesh_band": request.remesh_band,
        }
        for key, value in overrides.items():
            if value is not None:
                preset[key] = value

        use_multi = request.use_multi_image if request.use_multi_image is not None else len(request.images) > 1

        output = trellis_service.generate_3d_asset(
            images=request.images,
            seed=request.seed,
            resolution=preset["resolution"],
            texture_size=preset["texture_size"],
            decimation_target=preset["decimation_target"],
            ss_sampling_steps=preset["ss_sampling_steps"],
            ss_guidance_strength=preset["ss_guidance_strength"],
            shape_slat_sampling_steps=preset["shape_slat_sampling_steps"],
            shape_slat_guidance_strength=preset["shape_slat_guidance_strength"],
            tex_slat_sampling_steps=preset["tex_slat_sampling_steps"],
            tex_slat_guidance_strength=preset["tex_slat_guidance_strength"],
            remesh=preset["remesh"],
            remesh_band=preset["remesh_band"],
            use_multi_image=use_multi,
        )
        logger.info("Successfully generated 3D asset")
        _set_status(
            {
                "status": "complete",
                "progress": 100,
                "message": "3D model generated successfully!",
                "model_file": output.get("model_file"),
                "color_video": output.get("color_video"),
                "no_background_images": output.get("no_background_images", []),
            }
        )
        return output
    except Exception as exc:
        logger.error("Error generating 3D asset: %s", exc)
        logger.error(traceback.format_exc())
        _set_status(
            {
                "status": "error",
                "progress": 0,
                "message": f"Generation failed: {exc}",
            }
        )
        raise HTTPException(status_code=500, detail=f"Failed to generate 3D asset: {exc}")


@router.get("/status")
async def get_generation_status():
    """Retrieve the status of the most recent Trellis generation job."""

    status = redis_service.get_json(STATUS_KEY)
    if not status:
        return {"status": "idle", "progress": 0, "message": "No generation started"}
    return status


def _set_status(payload: Dict[str, Any]) -> None:
    redis_service.set_json(STATUS_KEY, payload, ex=3600)
