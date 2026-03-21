from typing import Literal, Optional
from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings


_DEFAULTS = {
    "REDIS_URL": "redis://localhost:6379/0",
    "GEMINI_FLASH_MODEL": "gemini-3.1-flash-image-preview",
    "GEMINI_PRO_MODEL": "gemini-3.1-flash-image-preview",
    "GEMINI_THINKING_LEVEL": "low",
    "GEMINI_IMAGE_SIZE": "1K",
    "GEMINI_IMAGE_ASPECT_RATIO": "1:1",
    "TRELLIS_MODEL_ID": "fal-ai/trellis-2",
    "TRELLIS_PRODUCT_QUALITY": "balanced_plus",
}

class Settings(BaseSettings):
    FAL_KEY: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Gemini - Image Generation (single-model pipeline)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_FLASH_MODEL: str = "gemini-3.1-flash-image-preview"  # Used for both create and edit flows
    GEMINI_PRO_MODEL: str = "gemini-3.1-flash-image-preview"  # Backward-compatible alias; not selected separately
    GEMINI_THINKING_LEVEL: Optional[str] = "low"  # Retained for compatibility; not used by image generation
    GEMINI_IMAGE_SIZE: Optional[str] = "1K"  # Image resolution hint
    GEMINI_IMAGE_ASPECT_RATIO: Optional[str] = "1:1"  # Aspect ratio for generated images
    
    # Artifact Storage
    SAVE_ARTIFACTS_LOCALLY: bool = False  # Save to filesystem for testing/debugging
    
    # Trellis
    TRELLIS_MODEL_ID: str = "fal-ai/trellis-2"
    TRELLIS_ENABLE_MULTI_IMAGE: bool = False
    TRELLIS_MULTIIMAGE_ALGO: str = "stochastic"  # stochastic | multidiffusion
    TRELLIS_PRODUCT_QUALITY: Literal["fast", "balanced", "balanced_plus", "high_quality"] = "balanced_plus"

    @field_validator(
        "FAL_KEY",
        "GEMINI_API_KEY",
        "REDIS_URL",
        "GEMINI_FLASH_MODEL",
        "GEMINI_PRO_MODEL",
        "GEMINI_THINKING_LEVEL",
        "GEMINI_IMAGE_SIZE",
        "GEMINI_IMAGE_ASPECT_RATIO",
        "TRELLIS_MODEL_ID",
        "TRELLIS_PRODUCT_QUALITY",
        mode="before",
    )
    @classmethod
    def normalize_blank_env_values(cls, value: Optional[str], info: ValidationInfo):
        if value is None:
            return value
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return _DEFAULTS.get(info.field_name)
            return cleaned
        return value
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Allow extra fields in .env

settings = Settings()
