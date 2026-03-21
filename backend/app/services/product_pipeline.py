from __future__ import annotations

import asyncio
import base64
import inspect
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

try:
    from app.integrations.trellis import resolve_trellis_preset, trellis_service

    TRELLIS_AVAILABLE = True
except ImportError:
    resolve_trellis_preset = None
    trellis_service = None
    TRELLIS_AVAILABLE = False

from app.core.config import settings
from app.integrations.gemini import gemini_image_service
from app.models.product_state import (
    AIOperation,
    ConceptDirection,
    DesignBrief,
    DesignVersion,
    OperationType,
    ProductEditorState,
    ProductIteration,
    ProductState,
    ProductStatus,
    ProductTransformState,
    ReferenceImage,
    ReferenceRole,
    ReferenceSet,
    RegionMetadata,
    TrellisArtifacts,
    _utcnow,
    get_product_state,
    get_product_status,
    save_product_state,
    save_product_status,
)

logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path(__file__).parent.parent.parent / "tests" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

_STYLE_KEYWORDS = {
    "minimal": ["minimal", "clean", "restrained"],
    "premium": ["premium", "refined", "high-end"],
    "playful": ["playful", "friendly", "expressive"],
    "industrial": ["industrial", "technical", "precise"],
    "portable": ["portable", "compact", "travel-ready"],
    "rounded": ["rounded", "soft", "approachable"],
    "matte": ["matte", "tactile", "low-gloss"],
    "sleek": ["sleek", "streamlined", "modern"],
}

_MATERIAL_KEYWORDS = {
    "metal": "brushed aluminum",
    "aluminum": "brushed aluminum",
    "steel": "stainless steel",
    "glass": "glass",
    "wood": "sealed wood",
    "plastic": "injection-molded polymer",
    "silicone": "soft-touch silicone",
    "rubber": "grip rubber",
    "ceramic": "ceramic",
    "fabric": "woven fabric",
    "leather": "wrapped leather",
}

_CATEGORY_RULES = {
    "bottle": {
        "category": "hydration product",
        "use_case": "portable hydration",
        "regions": [
            ("cap", "Cap", "Upper closure and grip surface"),
            ("body", "Body shell", "Main cylindrical body"),
            ("label_area", "Label area", "Primary front-facing branding band"),
            ("base", "Base", "Lower support surface"),
        ],
    },
    "mug": {
        "category": "drinkware",
        "use_case": "hot beverage consumption",
        "regions": [
            ("handle", "Handle", "Primary grip loop"),
            ("body", "Body shell", "Main vessel wall"),
            ("rim", "Rim", "Top lip and drinking edge"),
            ("base", "Base", "Lower resting surface"),
        ],
    },
    "speaker": {
        "category": "consumer audio device",
        "use_case": "desktop audio playback",
        "regions": [
            ("front_face", "Front face", "Primary speaker grille or acoustic face"),
            ("top_surface", "Top surface", "Upper interaction area"),
            ("control_ring", "Control ring", "Lighting and interaction perimeter"),
            ("body_shell", "Body shell", "Main housing volume"),
            ("base", "Base", "Bottom support and stability zone"),
        ],
    },
    "lamp": {
        "category": "lighting product",
        "use_case": "ambient task lighting",
        "regions": [
            ("head", "Lamp head", "Primary light-emitting enclosure"),
            ("arm", "Arm", "Connecting support arm"),
            ("control_area", "Control area", "Brightness or switch interaction zone"),
            ("base", "Base", "Support and stability surface"),
        ],
    },
    "appliance": {
        "category": "countertop appliance",
        "use_case": "daily kitchen utility",
        "regions": [
            ("front_face", "Front face", "Primary interface surface"),
            ("body_shell", "Body shell", "Main enclosure"),
            ("handle", "Handle", "Primary grip or open/close area"),
            ("top", "Top surface", "Upper lid or access surface"),
            ("base", "Base", "Lower support surface"),
        ],
    },
}

_FALLBACK_REGIONS = [
    ("front_face", "Front face", "Primary user-facing surface"),
    ("body_shell", "Body shell", "Main enclosure or volume"),
    ("interaction_area", "Interaction area", "Buttons, grip, or controls"),
    ("top_surface", "Top surface", "Upper cap, lid, or surface"),
    ("base", "Base", "Lower support surface"),
]

_CONCEPT_ARCHETYPES = [
    {
        "suffix": "Soft Radius",
        "summary": "Emphasizes rounded geometry, calmer edge transitions, and an approachable premium feel.",
        "silhouette": "Soft monolithic volume with gently blended edges",
        "form_language": "Organic, quiet, and continuous",
        "keywords": ["rounded", "calm", "approachable"],
        "differentiators": [
            "Prioritizes soft radii and a less technical read",
            "Makes the product feel more tactile and friendly",
        ],
        "pros": ["Strong mass-market appeal", "Feels safer and easier to handle"],
        "risks": [
            "Can lose some perceived performance edge",
            "Needs tight proportion control to avoid looking generic",
        ],
        "confidence": 0.82,
    },
    {
        "suffix": "Precision Frame",
        "summary": "Pushes a sharper, more architectural direction with clearer seams and more deliberate structure.",
        "silhouette": "Tighter frame with sharper breaks and defined planes",
        "form_language": "Technical, precise, and engineered",
        "keywords": ["technical", "precise", "architectural"],
        "differentiators": [
            "Highlights assembly logic and structural clarity",
            "Creates stronger contrast between primary and secondary surfaces",
        ],
        "pros": [
            "Communicates durability and intent",
            "Works well for more performance-oriented positioning",
        ],
        "risks": [
            "Sharper forms may feel colder or less approachable",
            "Requires cleaner manufacturing tolerances",
        ],
        "confidence": 0.8,
    },
    {
        "suffix": "Interface Forward",
        "summary": "Organizes the product around the main interaction zone so the interface becomes the dominant visual anchor.",
        "silhouette": "Front-facing hierarchy with a deliberate interaction focal point",
        "form_language": "Structured, clear, and user-guiding",
        "keywords": ["interface-led", "legible", "functional"],
        "differentiators": [
            "Makes controls or brand touchpoints easy to read",
            "Improves scanability from the primary use angle",
        ],
        "pros": [
            "Feels intuitive in the editor and in reference views",
            "Creates clear region-level edit scopes later",
        ],
        "risks": [
            "Front-face focus can flatten the silhouette",
            "May under-develop secondary views if not balanced",
        ],
        "confidence": 0.78,
    },
    {
        "suffix": "Premium Sculpted",
        "summary": "Uses more tension in the surfacing, stronger taper, and richer material contrast for a higher-end direction.",
        "silhouette": "Tapered sculpted body with controlled highlights",
        "form_language": "Refined, directional, and premium",
        "keywords": ["premium", "sculpted", "contrasted"],
        "differentiators": [
            "Introduces stronger top-to-bottom hierarchy",
            "Builds visual richness through material breakups",
        ],
        "pros": [
            "Feels more elevated and brandable",
            "Creates stronger hero views and detail opportunities",
        ],
        "risks": [
            "Can become visually busy if overdone",
            "Needs disciplined material boundaries",
        ],
        "confidence": 0.76,
    },
]

_REFERENCE_ROLE_ORDER: Sequence[ReferenceRole] = (
    "hero",
    "ortho_front",
    "ortho_side",
    "detail",
    "sketch",
)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000)}"


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "concept"


def _unique_list(values: Iterable[str]) -> List[str]:
    result: List[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def _first_sentence(text: str) -> str:
    for delimiter in [".", ",", ";"]:
        if delimiter in text:
            return text.split(delimiter, 1)[0].strip()
    return text.strip()


class ProductPipelineService:
    """Stage-aware orchestration for the product workflow."""

    def __init__(self) -> None:
        self._default_image_count = 1

    async def run_create(self, prompt: str, image_count: Optional[int] = None) -> None:
        logger.info("[product-pipeline] Starting staged create flow")
        state = get_product_state()
        self._reset_state_for_new_product(
            state=state,
            prompt=prompt,
            image_count=image_count or self._default_image_count,
        )
        save_product_state(state)

        try:
            await self.create_design_brief(state, prompt)
            primary_concept = await self.generate_initial_sketch(state)
            await self.generate_3d_draft(state, note="Initial draft from prompt")
            state.mark_complete(
                "Initial 3D draft ready for editing",
                workflow_stage="editing",
            )
            save_product_state(state)
            self._sync_status_from_state(
                state,
                progress=100,
                message="Initial 3D draft ready",
            )
        except Exception as exc:
            self._handle_failure(state, exc)

    async def generate_initial_sketch(self, state: ProductState) -> ConceptDirection:
        if not state.design_brief:
            raise RuntimeError("Design brief missing")

        concept = self._build_concept_directions(state.design_brief, feedback=None)[0]
        operation = self._begin_operation(
            state,
            operation_type="generate_concepts",
            input_prompt=state.prompt,
            target_scope="initial_sketch",
        )
        state.mark_progress(
            "generating_concepts",
            "Generating Gemini sketch",
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=40,
            message="Generating Gemini sketch",
            operation=operation,
        )

        images = await self._generate_product_images(
            prompt=self._build_concept_image_prompt(state.design_brief, concept),
            workflow="create",
            image_count=1,
            base_description=self._build_base_description(state.design_brief, concept),
        )
        if not images:
            raise RuntimeError(f"Concept image generation returned no image for '{concept.title}'")

        concept.concept_image_url = images[0]
        state.concept_directions = [concept]
        state.selected_concept_id = concept.concept_id
        state.reference_set = None
        state.images = [images[0]]
        state.set_stage("concepts_ready")
        self._complete_operation(
            state,
            operation,
            summary="Generated initial Gemini sketch for 3D model generation",
            artifact_ids=[concept.concept_id],
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=65,
            message="Gemini sketch ready",
        )

        if settings.SAVE_ARTIFACTS_LOCALLY:
            self._save_gemini_images(state.images, "concepts")

        return concept

    async def run_refine_concepts(self, feedback: str) -> None:
        logger.info("[product-pipeline] Refining concept directions")
        state = get_product_state()
        if not state.design_brief:
            raise RuntimeError("Create a design brief before refining concepts")

        state.in_progress = True
        state.mode = "create"
        state.latest_instruction = feedback
        state.generation_started_at = _utcnow()
        save_product_state(state)

        try:
            await self.generate_concept_directions(state, feedback=feedback)
            state.mark_complete(
                "Refined concept directions ready",
                workflow_stage="concepts_ready",
            )
            save_product_state(state)
            self._sync_status_from_state(
                state,
                progress=100,
                message="Refined concept directions ready",
            )
        except Exception as exc:
            self._handle_failure(state, exc)

    async def run_generate_references(
        self,
        concept_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> None:
        logger.info("[product-pipeline] Generating concept references")
        state = get_product_state()
        if concept_id:
            self.select_or_refine_concept(state, concept_id=concept_id)

        if not state.get_selected_concept():
            raise RuntimeError("Select a concept before generating references")

        state.in_progress = True
        state.mode = "create"
        state.generation_started_at = _utcnow()
        save_product_state(state)

        try:
            await self.generate_reference_set(state, notes=notes)
            state.mark_complete(
                "Reference set ready for 3D draft generation",
                workflow_stage="references_ready",
            )
            save_product_state(state)
            self._sync_status_from_state(
                state,
                progress=100,
                message="Reference set ready",
            )
        except Exception as exc:
            self._handle_failure(state, exc)

    async def run_generate_draft(self) -> None:
        logger.info("[product-pipeline] Generating 3D draft")
        state = get_product_state()
        selected_concept = state.get_selected_concept()
        if not selected_concept:
            raise RuntimeError("Select a concept before building a 3D draft")
        if not selected_concept.concept_image_url:
            raise RuntimeError("Selected concept is missing its concept image")

        state.in_progress = True
        state.mode = "create"
        state.generation_started_at = _utcnow()
        save_product_state(state)

        try:
            await self.generate_3d_draft(state)
            state.mark_complete(
                "Base 3D ready. Editor opened with resize handles.",
                workflow_stage="editing",
            )
            save_product_state(state)
            self._sync_status_from_state(
                state,
                progress=100,
                message="Base 3D ready for direct editing",
            )
        except Exception as exc:
            self._handle_failure(state, exc)

    async def run_edit(
        self,
        instruction: str,
        target_scope: str = "whole_product",
        edit_kind: str = "edit_whole_product",
    ) -> None:
        logger.info("[product-pipeline] Starting structured edit flow")
        state = get_product_state()
        if not state.prompt:
            raise RuntimeError("Cannot edit before creating an initial product")
        if not state.current_model_asset_url and not state.trellis_output:
            raise RuntimeError("Generate a 3D draft before editing the product")

        state.in_progress = True
        state.mode = "edit"
        state.latest_instruction = instruction
        state.generation_started_at = _utcnow()
        save_product_state(state)

        try:
            await self.apply_design_edit(
                state,
                instruction=instruction,
                edit_kind=edit_kind,
                target_scope=target_scope,
            )
            state.mark_complete("Product edit complete", workflow_stage="editing")
            save_product_state(state)
            self._sync_status_from_state(
                state,
                progress=100,
                message="Product edit complete",
            )
        except Exception as exc:
            self._handle_failure(state, exc)

    async def run_trellis_only(
        self,
        prompt: str,
        images: List[str],
        mode: str = "create",
    ) -> None:
        logger.info(
            "[product-pipeline] Starting Trellis-only flow with %s provided images",
            len(images),
        )
        state = get_product_state()
        if mode == "create":
            self._reset_state_for_new_product(
                state=state,
                prompt=prompt,
                image_count=len(images) or self._default_image_count,
            )
        else:
            state.latest_instruction = prompt
            state.mode = "edit"

        state.in_progress = True
        state.generation_started_at = _utcnow()
        save_product_state(state)

        try:
            if not state.design_brief:
                state.design_brief = self._infer_design_brief(prompt)
            if not state.concept_directions:
                state.concept_directions = self._build_concept_directions(state.design_brief)
            if not state.selected_concept_id and state.concept_directions:
                state.selected_concept_id = state.concept_directions[0].concept_id

            state.reference_set = ReferenceSet(
                reference_set_id=_new_id("refs"),
                concept_id=state.selected_concept_id or "external",
                images=[
                    ReferenceImage(role="hero", url=image, prompt="Pre-generated reference")
                    for image in images
                ],
                metadata={"source": "external"},
            )
            state.images = images.copy()
            save_product_state(state)

            await self.generate_3d_draft(state, source_images=images, note="Trellis-only draft")
            state.mark_complete(
                "Base 3D ready. Editor opened with resize handles.",
                workflow_stage="editing",
            )
            save_product_state(state)
            self._sync_status_from_state(
                state,
                progress=100,
                message="Base 3D ready for direct editing",
            )
        except Exception as exc:
            self._handle_failure(state, exc)

    async def create_design_brief(
        self,
        state: ProductState,
        prompt: str,
    ) -> DesignBrief:
        operation = self._begin_operation(
            state,
            operation_type="create_brief",
            input_prompt=prompt,
            target_scope="design_brief",
        )
        state.mark_progress(
            "creating_brief",
            "Preparing product brief",
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=12,
            message="Preparing product brief",
            operation=operation,
        )

        brief = self._infer_design_brief(prompt)
        state.prompt = prompt
        state.design_brief = brief
        state.set_stage("brief_ready")
        self._complete_operation(
            state,
            operation,
            summary="Structured design brief extracted from the raw prompt",
            artifact_ids=["design_brief"],
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=25,
            message="Product brief ready",
        )
        return brief

    async def generate_concept_directions(
        self,
        state: ProductState,
        feedback: Optional[str] = None,
        max_concepts: Optional[int] = None,
    ) -> List[ConceptDirection]:
        if not state.design_brief:
            raise RuntimeError("Design brief missing")

        operation = self._begin_operation(
            state,
            operation_type="refine_concepts" if feedback else "generate_concepts",
            input_prompt=feedback or state.prompt,
            target_scope="concept_directions",
        )
        state.mark_progress(
            "generating_concepts",
            "Exploring concept directions",
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=42,
            message="Generating concept directions",
            operation=operation,
        )

        concepts = self._build_concept_directions(state.design_brief, feedback=feedback)
        if max_concepts is not None:
            concepts = concepts[: max(1, max_concepts)]
        total_concepts = len(concepts)
        self._sync_status_from_state(
            state,
            progress=42,
            message=(
                "Rendering initial concept preview"
                if total_concepts == 1
                else f"Rendering {total_concepts} concept previews"
            ),
            operation=operation,
        )

        completed_previews = 0
        for index, concept in enumerate(concepts, start=1):
            image_url = await self._generate_concept_preview(
                state=state,
                brief=state.design_brief,
                concept=concept,
                operation=operation,
                index=index,
                total=total_concepts,
            )
            concepts[index - 1].concept_image_url = image_url
            completed_previews += 1
            progress = 42 + int(completed_previews * (22 / max(total_concepts, 1)))
            self._sync_status_from_state(
                state,
                progress=progress,
                message=(
                    "Initial concept preview ready"
                    if total_concepts == 1
                    else f"Rendered {completed_previews} of {total_concepts} concept previews"
                ),
                operation=operation,
            )

        state.concept_directions = concepts
        state.selected_concept_id = None
        state.reference_set = None
        state.images = [concept.concept_image_url for concept in concepts if concept.concept_image_url]
        state.set_stage("concepts_ready")
        concept_count_label = "one" if total_concepts == 1 else str(total_concepts)
        self._complete_operation(
            state,
            operation,
            summary=f"Generated {concept_count_label} concept direction"
            f"{'' if total_concepts == 1 else 's'} with preview images",
            artifact_ids=[concept.concept_id for concept in concepts],
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=68,
            message=(
                "Initial concept preview ready"
                if total_concepts == 1
                else f"{total_concepts} concept images ready for selection"
            ),
        )
        if settings.SAVE_ARTIFACTS_LOCALLY:
            self._save_gemini_images(state.images, "concepts")
        return concepts

    def select_or_refine_concept(
        self,
        state: ProductState,
        concept_id: str,
        combine_with_ids: Optional[List[str]] = None,
        notes: Optional[str] = None,
    ) -> ConceptDirection:
        concept_lookup = {concept.concept_id: concept for concept in state.concept_directions}
        base_concept = concept_lookup.get(concept_id)
        if not base_concept:
            raise RuntimeError("Selected concept was not found")

        selected_concept = base_concept
        combine_with_ids = combine_with_ids or []
        extra_concepts = [
            concept_lookup[extra_id]
            for extra_id in combine_with_ids
            if extra_id in concept_lookup and extra_id != concept_id
        ]

        if extra_concepts:
            combined_title = " + ".join([base_concept.title, *[concept.title for concept in extra_concepts]])
            selected_concept = ConceptDirection(
                concept_id=_new_id("concept"),
                title=f"Blend: {combined_title}",
                concept_image_url=base_concept.concept_image_url,
                summary=self._combine_sentences(
                    [base_concept.summary, *[concept.summary for concept in extra_concepts], notes or ""]
                ),
                silhouette=self._combine_sentences(
                    [base_concept.silhouette, *[concept.silhouette for concept in extra_concepts]]
                ),
                form_language=self._combine_sentences(
                    [base_concept.form_language, *[concept.form_language for concept in extra_concepts]]
                ),
                materials=_unique_list(
                    [
                        *base_concept.materials,
                        *[material for concept in extra_concepts for material in concept.materials],
                    ]
                ),
                aesthetic_keywords=_unique_list(
                    [
                        *base_concept.aesthetic_keywords,
                        *[
                            keyword
                            for concept in extra_concepts
                            for keyword in concept.aesthetic_keywords
                        ],
                    ]
                ),
                key_differentiators=_unique_list(
                    [
                        *base_concept.key_differentiators,
                        *[
                            item
                            for concept in extra_concepts
                            for item in concept.key_differentiators
                        ],
                        notes or "",
                    ]
                ),
                pros=_unique_list(
                    [*base_concept.pros, *[item for concept in extra_concepts for item in concept.pros]]
                ),
                risks=_unique_list(
                    [*base_concept.risks, *[item for concept in extra_concepts for item in concept.risks]]
                ),
                confidence=round(
                    (
                        base_concept.confidence
                        + sum(concept.confidence for concept in extra_concepts)
                    )
                    / (len(extra_concepts) + 1),
                    2,
                ),
            )
            state.concept_directions.append(selected_concept)

        operation = self._begin_operation(
            state,
            operation_type="choose_concept",
            input_prompt=notes,
            target_scope=selected_concept.title,
        )
        state.selected_concept_id = selected_concept.concept_id
        state.reference_set = None
        state.images = [selected_concept.concept_image_url] if selected_concept.concept_image_url else []
        state.set_stage("concepts_ready")
        state.message = f"Selected concept: {selected_concept.title}"
        self._complete_operation(
            state,
            operation,
            summary=f"Selected concept direction '{selected_concept.title}'",
            artifact_ids=[selected_concept.concept_id],
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=100,
            message=f"Selected concept: {selected_concept.title}",
        )
        return selected_concept

    async def generate_reference_set(
        self,
        state: ProductState,
        notes: Optional[str] = None,
    ) -> ReferenceSet:
        brief = state.design_brief
        concept = state.get_selected_concept()
        if not brief or not concept:
            raise RuntimeError("Selected concept missing")

        operation = self._begin_operation(
            state,
            operation_type="generate_references",
            input_prompt=notes,
            target_scope=concept.title,
        )
        state.mark_progress(
            "generating_references",
            "Generating controlled reference views",
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=12,
            message="Generating controlled reference views",
            operation=operation,
        )

        references: List[ReferenceImage] = []
        total_roles = len(_REFERENCE_ROLE_ORDER)
        role_order = {role: index for index, role in enumerate(_REFERENCE_ROLE_ORDER)}
        base_description = self._build_base_description(brief, concept)

        self._sync_status_from_state(
            state,
            progress=12,
            message="Generating hero reference",
            operation=operation,
        )
        hero_prompt = self._build_reference_prompt(brief, concept, "hero", notes=notes)
        hero_images = await self._generate_product_images(
            prompt=hero_prompt,
            workflow="create",
            image_count=1,
            base_description=base_description,
        )
        if not hero_images:
            raise RuntimeError("Reference generation returned no image for role 'hero'")

        hero_reference = ReferenceImage(
            role="hero",
            url=hero_images[0],
            prompt=hero_prompt,
        )
        references.append(hero_reference)

        remaining_roles = [role for role in _REFERENCE_ROLE_ORDER if role != "hero"]
        completed_roles = 1
        if remaining_roles:
            self._sync_status_from_state(
                state,
                progress=12 + int(completed_roles * (55 / total_roles)),
                message=f"Generating {len(remaining_roles)} supporting references",
                operation=operation,
            )

            for role in remaining_roles:
                prompt = self._build_reference_prompt(brief, concept, role, notes=notes)
                images = await self._generate_product_images(
                    prompt=prompt,
                    workflow="edit",
                    image_count=1,
                    reference_images=[hero_reference.url],
                    base_description=base_description,
                )
                if not images:
                    raise RuntimeError(f"Reference generation returned no image for role '{role}'")
                references.append(
                    ReferenceImage(
                        role=role,
                        url=images[0],
                        prompt=prompt,
                    )
                )
                completed_roles += 1
                progress = 12 + int(completed_roles * (55 / total_roles))
                self._sync_status_from_state(
                    state,
                    progress=progress,
                    message=f"Generated {completed_roles} of {total_roles} references",
                    operation=operation,
                )

        references.sort(key=lambda reference: role_order[reference.role])

        reference_set = ReferenceSet(
            reference_set_id=_new_id("refs"),
            concept_id=concept.concept_id,
            images=references,
            metadata={
                "concept_title": concept.title,
                "notes": notes,
                "roles": list(_REFERENCE_ROLE_ORDER),
            },
        )
        state.reference_set = reference_set
        state.images = [reference.url for reference in references]
        state.set_stage("references_ready")
        self._complete_operation(
            state,
            operation,
            summary="Generated controlled reference views for 3D draft quality",
            artifact_ids=[reference.role for reference in references],
        )
        save_product_state(state)

        if settings.SAVE_ARTIFACTS_LOCALLY:
            self._save_gemini_images([reference.url for reference in references], "references")

        return reference_set

    async def generate_3d_draft(
        self,
        state: ProductState,
        source_images: Optional[List[str]] = None,
        note: Optional[str] = None,
    ) -> DesignVersion:
        brief = state.design_brief
        concept = state.get_selected_concept()
        images = source_images or self._select_images_for_draft(state)
        if not images:
            raise RuntimeError("No selected concept image available for 3D draft generation")

        if concept and concept.concept_image_url:
            state.reference_set = ReferenceSet(
                reference_set_id=_new_id("refs"),
                concept_id=concept.concept_id,
                images=[
                    ReferenceImage(
                        role="hero",
                        url=concept.concept_image_url,
                        prompt=self._build_concept_image_prompt(brief, concept),
                    )
                ],
                metadata={
                    "source": "selected_concept",
                    "concept_title": concept.title,
                },
            )

        operation = self._begin_operation(
            state,
            operation_type="generate_3d_draft",
            input_prompt=concept.title if concept else state.prompt,
            target_scope="3d_draft",
        )
        state.mark_progress(
            "generating_model",
            "Generating 3D model",
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=70,
            message="Generating 3D model",
            operation=operation,
        )

        trellis_output = await self._generate_trellis_model(images)
        artifacts = TrellisArtifacts.model_validate(trellis_output)

        state.trellis_output = artifacts
        state.current_model_asset_url = artifacts.model_file
        state.images = source_images.copy() if source_images else images.copy()

        parent_version_id = state.active_version_id
        version = DesignVersion(
            version_id=_new_id("version"),
            parent_version_id=parent_version_id,
            source_operation_id=operation.operation_id,
            source_prompt=state.latest_instruction or state.prompt,
            concept_id=concept.concept_id if concept else state.selected_concept_id,
            model_asset_url=artifacts.model_file,
            preview_images=artifacts.no_background_images or state.images[:3],
            summary_of_changes=note or self._build_draft_summary(state, concept),
            named_regions=self._infer_regions(brief),
            provenance={
                "reference_set_id": state.reference_set.reference_set_id if state.reference_set else None,
                "source_concept_image": concept.concept_image_url if concept else None,
                "workflow_stage": state.workflow_stage,
            },
        )
        state.version_history.append(version)
        state.active_version_id = version.version_id
        state.named_regions = version.named_regions
        state.editor_state = self._build_direct_edit_state(
            model_url=artifacts.model_file,
            version_id=version.version_id,
            named_regions=version.named_regions,
            provenance={
                "source_operation_id": operation.operation_id,
                "concept_id": version.concept_id,
            },
        )

        iteration_type = "edit" if parent_version_id else "create"
        iteration = ProductIteration(
            id=_new_id("iter"),
            type=iteration_type,
            prompt=state.latest_instruction or state.prompt or "",
            images=state.images.copy(),
            trellis_output=artifacts,
            note=note or ("Draft from selected concept" if not parent_version_id else "Versioned draft update"),
            duration_seconds=None,
            source_operation_id=operation.operation_id,
            version_id=version.version_id,
            concept_id=version.concept_id,
        )
        state.iterations.append(iteration)
        state.set_stage("editing")
        self._complete_operation(
            state,
            operation,
            summary="Generated a base 3D model from the selected concept",
            artifact_ids=[version.version_id],
        )
        save_product_state(state)

        if settings.SAVE_ARTIFACTS_LOCALLY:
            self._save_trellis_model(artifacts, "draft")
            self._save_product_state(state, "draft")

        return version

    async def apply_design_edit(
        self,
        state: ProductState,
        instruction: str,
        edit_kind: str,
        target_scope: str,
    ) -> DesignVersion:
        base_images = self._get_edit_reference_images(state)
        if not base_images:
            raise RuntimeError("No current reference context available for edit")

        operation_type = {
            "edit_region": "edit_region",
            "restyle_materials": "restyle_materials",
        }.get(edit_kind, "edit_whole_product")
        operation = self._begin_operation(
            state,
            operation_type=operation_type,
            input_prompt=instruction,
            target_scope=target_scope,
        )
        state.mark_progress(
            "generating_images",
            "Generating edited product references",
        )
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=15,
            message="Generating edited product references",
            operation=operation,
        )

        prompt = self._build_edit_prompt(state, instruction, target_scope=target_scope)
        edited_images = await self._generate_product_images(
            prompt=prompt,
            workflow="edit",
            image_count=1,
            reference_images=base_images,
            base_description=self._build_base_description(
                state.design_brief,
                state.get_selected_concept(),
            ),
        )
        if not edited_images:
            raise RuntimeError("Edit generation returned no images")

        state.images = edited_images
        save_product_state(state)

        self._sync_status_from_state(
            state,
            progress=48,
            message="Updating 3D draft from edited references",
            operation=operation,
        )

        trellis_output = await self._generate_trellis_model(edited_images)
        artifacts = TrellisArtifacts.model_validate(trellis_output)
        state.trellis_output = artifacts
        state.current_model_asset_url = artifacts.model_file

        version = DesignVersion(
            version_id=_new_id("version"),
            parent_version_id=state.active_version_id,
            source_operation_id=operation.operation_id,
            source_prompt=instruction,
            concept_id=state.selected_concept_id,
            model_asset_url=artifacts.model_file,
            preview_images=artifacts.no_background_images or edited_images[:3],
            summary_of_changes=self._summarize_edit(edit_kind, instruction, target_scope),
            named_regions=state.named_regions or self._infer_regions(state.design_brief),
            provenance={
                "target_scope": target_scope,
                "edit_kind": edit_kind,
            },
        )
        state.version_history.append(version)
        state.active_version_id = version.version_id
        state.named_regions = version.named_regions
        state.editor_state.current_model_url = artifacts.model_file
        state.editor_state.active_version_id = version.version_id
        state.editor_state.interaction_mode = "direct_edit"
        state.editor_state.handles_visible = True
        state.editor_state.active_tool = "resize"
        state.editor_state.transform = ProductTransformState()
        state.editor_state.selected_part_id = target_scope if target_scope != "whole_product" else None
        state.editor_state.ai_region_labels = version.named_regions
        state.editor_state.provenance = {
            "source_operation_id": operation.operation_id,
            "parent_version_id": version.parent_version_id,
        }

        iteration = ProductIteration(
            id=_new_id("iter"),
            type="edit",
            prompt=instruction,
            images=edited_images,
            trellis_output=artifacts,
            note=self._summarize_edit(edit_kind, instruction, target_scope),
            source_operation_id=operation.operation_id,
            version_id=version.version_id,
            concept_id=version.concept_id,
        )
        state.iterations.append(iteration)
        state.set_stage("editing")
        self._complete_operation(
            state,
            operation,
            summary=self._summarize_edit(edit_kind, instruction, target_scope),
            artifact_ids=[version.version_id],
        )
        save_product_state(state)

        if settings.SAVE_ARTIFACTS_LOCALLY:
            self._save_gemini_images(edited_images, "edit")
            self._save_trellis_model(artifacts, "edit")
            self._save_product_state(state, "edit")

        return version

    async def _generate_product_images(self, prompt: str, **kwargs) -> List[str]:
        generate_images = gemini_image_service.generate_product_images
        signature = inspect.signature(generate_images)
        parameters = signature.parameters.values()
        accepts_var_kwargs = any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD
            for parameter in parameters
        )

        supported_kwargs = (
            kwargs
            if accepts_var_kwargs
            else {
                key: value
                for key, value in kwargs.items()
                if key in signature.parameters
            }
        )

        return await generate_images(prompt=prompt, **supported_kwargs)

    async def _generate_trellis_model(
        self,
        images: List[str],
        multi_image: Optional[bool] = None,
        multi_image_algo: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not TRELLIS_AVAILABLE or not trellis_service:
            raise RuntimeError(
                "Trellis service is not available. Please install fal_client dependency."
            )

        def progress_callback(status: str, progress: int, message: str):
            current_state = get_product_state()
            current_status = get_product_status()
            current_state.status = status
            current_state.message = "Generating 3D model"
            self._sync_status_from_state(
                current_state,
                progress=max(current_status.progress, progress),
                message="Generating 3D model",
            )

        use_multi = (
            multi_image
            if multi_image is not None
            else (settings.TRELLIS_ENABLE_MULTI_IMAGE and len(images) > 1)
        )
        algo = multi_image_algo or settings.TRELLIS_MULTIIMAGE_ALGO
        preset = resolve_trellis_preset(settings.TRELLIS_PRODUCT_QUALITY)

        return await asyncio.to_thread(
            trellis_service.generate_3d_asset,
            images=images,
            progress_callback=progress_callback,
            use_multi_image=use_multi,
            multiimage_algo=algo,
            **preset,
        )

    def _reset_state_for_new_product(
        self,
        state: ProductState,
        prompt: str,
        image_count: int,
    ) -> None:
        state.prompt = prompt
        state.latest_instruction = prompt
        state.mode = "create"
        state.status = "pending"
        state.message = "Preparing design brief"
        state.workflow_stage = "idle"
        state.last_completed_stage = "idle"
        state.in_progress = True
        state.generation_started_at = _utcnow()
        state.image_count = image_count
        state.images = []
        state.trellis_output = None
        state.iterations = []
        state.design_brief = None
        state.concept_directions = []
        state.selected_concept_id = None
        state.reference_set = None
        state.ai_operations = []
        state.version_history = []
        state.active_version_id = None
        state.current_model_asset_url = None
        state.named_regions = []
        state.editor_state = ProductEditorState()
        state.last_error = None
        state.export_files = {}

    def _infer_design_brief(self, prompt: str) -> DesignBrief:
        text = re.sub(r"\s+", " ", prompt.strip())
        lower_text = text.lower()
        category_key = next(
            (key for key in _CATEGORY_RULES if key in lower_text),
            "appliance" if any(word in lower_text for word in ["appliance", "countertop", "kitchen"]) else None,
        )
        category_info = _CATEGORY_RULES.get(category_key or "", {})
        category = category_info.get("category") or self._guess_category(text)
        primary_use_case = category_info.get("use_case") or f"daily {category}"

        style_keywords = _unique_list(
            keyword
            for term, keywords in _STYLE_KEYWORDS.items()
            if term in lower_text
            for keyword in keywords
        )
        if not style_keywords:
            style_keywords = ["clean", "balanced", "product-focused"]

        materials = _unique_list(
            material
            for term, material in _MATERIAL_KEYWORDS.items()
            if term in lower_text
        )
        if not materials:
            materials = ["painted polymer", "soft-touch polymer"]

        feature_terms = re.split(r",| with | and ", text)
        key_features = _unique_list(
            self._normalize_feature_phrase(term)
            for term in feature_terms
            if len(term.strip()) > 3
        )[:5]

        size_class = "portable" if any(
            word in lower_text for word in ["portable", "travel", "compact", "small", "handheld"]
        ) else "desktop"
        target_user = (
            "design-conscious general consumers"
            if "consumer" in lower_text or category != "industrial equipment"
            else "specialized operators"
        )
        ergonomic_goals = ["Comfortable primary grip", "Clear primary interaction zone"]
        if "rounded" in lower_text:
            ergonomic_goals.append("Soft hand contact transitions")
        if size_class == "portable":
            ergonomic_goals.append("Easy one-hand handling")

        manufacturing_hints = [
            "Favor split lines that align with the dominant form breaks",
            "Keep part count low for the first draft",
        ]
        if any(material in lower_text for material in ["metal", "aluminum", "steel"]):
            manufacturing_hints.append("Use material contrast sparingly around touchpoints")

        constraints = [
            "Maintain stable proportions across hero and orthographic references",
            "Avoid cinematic staging that obscures geometry",
        ]
        must_have = key_features[:3] or ["Clear product identity", "Stable proportions"]
        avoid = [
            "Busy lifestyle scene backgrounds",
            "Floating props or hands",
            "Overly dramatic shadows that hide edges",
        ]
        uncertainty_flags = []
        if category_key is None:
            uncertainty_flags.append("Category inferred from prompt wording")
        if len(key_features) <= 1:
            uncertainty_flags.append("Feature set is still underspecified")

        product_name = self._derive_product_name(text, category)

        return DesignBrief(
            product_name=product_name,
            category=category,
            target_user=target_user,
            primary_use_case=primary_use_case,
            key_features=key_features,
            style_keywords=style_keywords,
            materials=materials,
            size_class=size_class,
            ergonomic_goals=ergonomic_goals,
            manufacturing_hints=manufacturing_hints,
            constraints=constraints,
            must_have=must_have,
            avoid=avoid,
            uncertainty_flags=uncertainty_flags,
        )

    def _build_concept_directions(
        self,
        brief: DesignBrief,
        feedback: Optional[str] = None,
    ) -> List[ConceptDirection]:
        feedback_terms = self._extract_feedback_terms(feedback)
        concept_directions: List[ConceptDirection] = []
        for index, archetype in enumerate(_CONCEPT_ARCHETYPES, start=1):
            title = f"{brief.product_name} {archetype['suffix']}"
            concept_directions.append(
                ConceptDirection(
                    concept_id=f"{_slugify(title)}-{index}",
                    title=title,
                    summary=self._combine_sentences(
                        [
                            f"A {brief.category} direction for {brief.primary_use_case}.",
                            archetype["summary"],
                            feedback_terms.get("summary"),
                        ]
                    ),
                    silhouette=archetype["silhouette"],
                    form_language=archetype["form_language"],
                    materials=_unique_list([*brief.materials, *feedback_terms.get("materials", [])])[:4],
                    aesthetic_keywords=_unique_list(
                        [*brief.style_keywords, *archetype["keywords"], *feedback_terms.get("keywords", [])]
                    )[:6],
                    key_differentiators=_unique_list(
                        [
                            *archetype["differentiators"],
                            *brief.must_have[:2],
                            feedback_terms.get("differentiator", ""),
                        ]
                    ),
                    pros=_unique_list([*archetype["pros"], "Keeps the product legible in orthographic views"]),
                    risks=_unique_list(archetype["risks"]),
                    confidence=min(0.95, archetype["confidence"] + (0.02 if feedback else 0)),
                )
            )
        return concept_directions

    def _build_reference_prompt(
        self,
        brief: DesignBrief,
        concept: ConceptDirection,
        role: ReferenceRole,
        notes: Optional[str] = None,
    ) -> str:
        shared_context = (
            f"Design an isolated {brief.category} named {brief.product_name}. "
            f"Selected concept: {concept.title}. "
            f"Summary: {concept.summary} "
            f"Form language: {concept.form_language}. "
            f"Materials: {', '.join(concept.materials)}. "
            f"Key features: {', '.join(brief.key_features[:4])}. "
            f"Avoid busy backgrounds, props, hands, dramatic shadows, or lifestyle scenes. "
            f"Use a plain neutral background and preserve clean, readable geometry."
        )

        role_instructions = {
            "hero": (
                "Create a clean studio hero render at a stable three-quarter angle. "
                "Keep the full product visible, centered, and proportionally accurate."
            ),
            "ortho_front": (
                "Create a front orthographic-like view with minimal perspective distortion. "
                "Make the front face easy to read and keep the product isolated."
            ),
            "ortho_side": (
                "Create a side orthographic-like view with minimal perspective distortion. "
                "Preserve the same product proportions as the hero view."
            ),
            "detail": (
                f"Create a detail-focused close view of the {self._pick_detail_focus(brief)}. "
                "Show interaction and material transitions clearly while keeping the object isolated."
            ),
            "sketch": (
                "Create an industrial design exploration sketch on a clean white page. "
                "Use simple shading, readable edge lines, and no environment."
            ),
        }

        return self._combine_sentences(
            [
                shared_context,
                role_instructions[role],
                notes or "",
            ]
        )

    def _build_concept_image_prompt(
        self,
        brief: DesignBrief,
        concept: ConceptDirection,
    ) -> str:
        return self._combine_sentences(
            [
                f"Create one isolated product concept render for {brief.product_name}, a {brief.category}.",
                f"Concept direction: {concept.title}.",
                f"Summary: {concept.summary}",
                f"Silhouette: {concept.silhouette}.",
                f"Form language: {concept.form_language}.",
                f"Materials: {', '.join(concept.materials[:4])}.",
                f"Style keywords: {', '.join(concept.aesthetic_keywords[:5])}.",
                f"Key product requirements: {', '.join(brief.must_have[:3])}.",
                "Show the whole product centered on a clean white studio background.",
                "Make the shape legible, proportionally consistent, and ready for concept selection.",
            ]
        )

    def _build_base_description(
        self,
        brief: Optional[DesignBrief],
        concept: Optional[ConceptDirection],
    ) -> Optional[str]:
        if not brief:
            return None
        concept_fragment = f"Selected concept: {concept.title}. " if concept else ""
        return (
            f"{brief.product_name}, a {brief.category} for {brief.primary_use_case}. "
            f"{concept_fragment}"
            f"Materials: {', '.join((concept.materials if concept else brief.materials)[:4])}. "
            f"Style keywords: {', '.join((concept.aesthetic_keywords if concept else brief.style_keywords)[:5])}."
        )

    def _build_edit_prompt(
        self,
        state: ProductState,
        instruction: str,
        target_scope: str,
    ) -> str:
        brief = state.design_brief
        concept = state.get_selected_concept()
        scope_text = (
            "Apply the change only to the named region and preserve all other areas."
            if target_scope != "whole_product"
            else "Apply the change to the whole product while keeping the overall identity stable."
        )
        context = self._build_base_description(brief, concept) or "the existing product"
        return (
            f"Update {context} "
            f"User edit request: {instruction}. "
            f"Target scope: {target_scope}. "
            f"{scope_text} "
            "Keep the same product family, maintain a clean studio render, and make the requested change obvious."
        )

    def _summarize_edit(self, edit_kind: str, instruction: str, target_scope: str) -> str:
        if edit_kind == "edit_region":
            return f"Updated only the {target_scope}: {instruction}"
        if edit_kind == "restyle_materials":
            return f"Restyled the product materials: {instruction}"
        return f"Edited the product: {instruction}"

    def _build_draft_summary(
        self,
        state: ProductState,
        concept: Optional[ConceptDirection],
    ) -> str:
        if concept:
            return f"Base 3D draft from concept '{concept.title}'"
        return f"Initial 3D draft from prompt '{state.prompt or 'product'}'"

    async def _generate_concept_preview(
        self,
        state: ProductState,
        brief: DesignBrief,
        concept: ConceptDirection,
        operation: AIOperation,
        index: int,
        total: int,
    ) -> str:
        progress = 42 + int(index * (22 / max(total, 1)))
        self._sync_status_from_state(
            state,
            progress=progress,
            message=f"Rendering concept {index} of {total}",
            operation=operation,
        )
        images = await self._generate_product_images(
            prompt=self._build_concept_image_prompt(brief, concept),
            workflow="create",
            image_count=1,
            base_description=self._build_base_description(brief, concept),
        )
        if not images:
            raise RuntimeError(f"Concept image generation returned no image for '{concept.title}'")
        return images[0]

    def _build_direct_edit_state(
        self,
        model_url: Optional[str],
        version_id: str,
        named_regions: List[RegionMetadata],
        provenance: Dict[str, Any],
    ) -> ProductEditorState:
        return ProductEditorState(
            current_model_url=model_url,
            active_version_id=version_id,
            interaction_mode="direct_edit",
            handles_visible=True,
            active_tool="resize",
            transform=ProductTransformState(),
            ai_region_labels=named_regions,
            provenance=provenance,
        )

    def _infer_regions(self, brief: Optional[DesignBrief]) -> List[RegionMetadata]:
        if not brief:
            region_specs = _FALLBACK_REGIONS
        else:
            category_key = next(
                (
                    key
                    for key, data in _CATEGORY_RULES.items()
                    if data["category"] == brief.category or key in brief.category.lower()
                ),
                None,
            )
            region_specs = _CATEGORY_RULES.get(category_key or "", {}).get("regions") or _FALLBACK_REGIONS

        return [
            RegionMetadata(
                region_id=region_id,
                label=label,
                description=description,
                confidence=0.65 if region_specs is _FALLBACK_REGIONS else 0.8,
            )
            for region_id, label, description in region_specs
        ]

    def _select_images_for_trellis(self, reference_set: Optional[ReferenceSet]) -> List[str]:
        if not reference_set:
            return []
        preferred_roles = {"hero", "ortho_front", "ortho_side", "detail"}
        prioritized = [image.url for image in reference_set.images if image.role in preferred_roles]
        return prioritized or [image.url for image in reference_set.images]

    def _select_images_for_draft(self, state: ProductState) -> List[str]:
        concept = state.get_selected_concept()
        if concept and concept.concept_image_url:
            return [concept.concept_image_url]
        return self._select_images_for_trellis(state.reference_set)

    def _get_edit_reference_images(self, state: ProductState) -> List[str]:
        if state.images:
            return state.images
        if state.reference_set and state.reference_set.images:
            return [image.url for image in state.reference_set.images]
        active_version = state.get_active_version()
        if active_version and active_version.preview_images:
            return active_version.preview_images
        return []

    def _guess_category(self, prompt: str) -> str:
        words = [word for word in re.findall(r"[a-zA-Z]+", prompt.lower()) if len(word) > 2]
        if not words:
            return "physical product"
        return f"{words[-1]} product"

    def _derive_product_name(self, prompt: str, category: str) -> str:
        sentence = _first_sentence(prompt)
        cleaned = re.sub(r"\b(create|design|generate|build|make)\b", "", sentence, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.")
        if not cleaned:
            cleaned = category
        title = " ".join(word.capitalize() for word in cleaned.split()[:4])
        if len(title.split()) == 1 and category:
            return f"{title} {category.title()}"
        return title

    def _normalize_feature_phrase(self, value: str) -> str:
        cleaned = value.strip(" .")
        cleaned = re.sub(r"^(create|design|generate|build|make)\s+", "", cleaned, flags=re.IGNORECASE)
        return cleaned or "Clear product identity"

    def _extract_feedback_terms(self, feedback: Optional[str]) -> Dict[str, Any]:
        if not feedback:
            return {"keywords": [], "materials": []}
        lower_feedback = feedback.lower()
        return {
            "summary": f"Refinement emphasis: {feedback.strip()}",
            "keywords": [
                keyword
                for term, keywords in _STYLE_KEYWORDS.items()
                if term in lower_feedback
                for keyword in keywords
            ],
            "materials": [
                material
                for term, material in _MATERIAL_KEYWORDS.items()
                if term in lower_feedback
            ],
            "differentiator": feedback.strip(),
        }

    def _pick_detail_focus(self, brief: DesignBrief) -> str:
        if any("button" in feature.lower() for feature in brief.key_features):
            return "button cluster"
        if "consumer audio device" in brief.category:
            return "front control ring"
        if brief.size_class == "portable":
            return "primary grip and touchpoint"
        return "main interaction area"

    def _combine_sentences(self, fragments: Sequence[Optional[str]]) -> str:
        return " ".join(fragment.strip() for fragment in fragments if fragment and fragment.strip())

    def _begin_operation(
        self,
        state: ProductState,
        operation_type: OperationType,
        input_prompt: Optional[str],
        target_scope: str,
    ) -> AIOperation:
        operation = AIOperation(
            operation_id=_new_id("op"),
            type=operation_type,
            status="running",
            input_prompt=input_prompt,
            target_scope=target_scope,
        )
        state.ai_operations.append(operation)
        return operation

    def _complete_operation(
        self,
        state: ProductState,
        operation: AIOperation,
        summary: str,
        artifact_ids: Optional[List[str]] = None,
    ) -> None:
        del state
        operation.status = "complete"
        operation.completed_at = _utcnow()
        operation.summary = summary
        operation.artifact_ids = artifact_ids or []
        operation.error = None

    def _fail_operation(
        self,
        operation: Optional[AIOperation],
        error: str,
    ) -> None:
        if operation is None:
            return
        operation.status = "error"
        operation.completed_at = _utcnow()
        operation.error = error

    def _handle_failure(self, state: ProductState, exc: Exception) -> None:
        logger.exception("Product workflow failed: %s", exc)
        running_operation = next(
            (operation for operation in reversed(state.ai_operations) if operation.status == "running"),
            None,
        )
        self._fail_operation(running_operation, str(exc))
        state.mark_error(str(exc))
        save_product_state(state)
        self._sync_status_from_state(
            state,
            progress=0,
            message=str(exc),
            error=str(exc),
        )

    def _determine_preview_image(self, state: ProductState) -> Optional[str]:
        active_version = state.get_active_version()
        if active_version and active_version.preview_images:
            return active_version.preview_images[0]
        if state.trellis_output and state.trellis_output.no_background_images:
            return state.trellis_output.no_background_images[0]
        if state.images:
            return state.images[0]
        return None

    def _sync_status_from_state(
        self,
        state: ProductState,
        progress: int,
        message: Optional[str],
        operation: Optional[AIOperation] = None,
        error: Optional[str] = None,
    ) -> None:
        current_operation = operation or next(
            (item for item in reversed(state.ai_operations) if item.status == "running"),
            None,
        )
        self._update_status(
            ProductStatus(
                status=state.status,
                progress=progress,
                message=message or state.message,
                error=error,
                workflow_stage=state.workflow_stage,
                active_operation_id=current_operation.operation_id if current_operation else None,
                active_operation_type=current_operation.type if current_operation else None,
                active_version_id=state.active_version_id,
                model_file=state.current_model_asset_url
                or (state.trellis_output.model_file if state.trellis_output else None),
                preview_image=self._determine_preview_image(state),
            )
        )

    def _update_status(self, status: ProductStatus) -> None:
        payload = get_product_status()
        payload.status = status.status
        payload.progress = status.progress
        payload.message = status.message
        payload.error = status.error
        payload.workflow_stage = status.workflow_stage
        payload.active_operation_id = status.active_operation_id
        payload.active_operation_type = status.active_operation_type
        payload.active_version_id = status.active_version_id or payload.active_version_id
        payload.model_file = status.model_file or payload.model_file
        payload.preview_image = status.preview_image or payload.preview_image
        payload.updated_at = status.updated_at
        # Status updates are polled directly by the product page. Avoid rewriting
        # the full current-project record on every transient progress tick.
        save_product_status(payload, sync_project=False)

    def _save_gemini_images(self, images: List[str], mode: str) -> None:
        try:
            run_dir = ARTIFACTS_DIR / f"gemini_{mode}_{int(time.time())}"
            run_dir.mkdir(parents=True, exist_ok=True)
            for idx, img in enumerate(images, start=1):
                if isinstance(img, str) and img.startswith("data:image"):
                    header, b64_data = img.split(",", 1)
                    mime = header.split(";")[0].split(":")[1] if ":" in header else "image/png"
                    extension = mime.split("/")[-1] if "/" in mime else "png"
                    dest = run_dir / f"gemini_view_{idx}.{extension}"
                    dest.write_bytes(base64.b64decode(b64_data))
        except Exception as exc:  # noqa: BLE001
            logger.warning("[product-pipeline] Failed to save Gemini images: %s", exc)

    def _save_trellis_model(self, artifacts: TrellisArtifacts, mode: str) -> None:
        try:
            if not artifacts.model_file:
                return

            run_dir = ARTIFACTS_DIR / f"trellis_{mode}_{int(time.time())}"
            run_dir.mkdir(parents=True, exist_ok=True)

            import urllib.request
            from urllib.error import URLError

            glb_path = run_dir / "model.glb"
            with urllib.request.urlopen(artifacts.model_file) as response:
                glb_path.write_bytes(response.read())

            video_assets = [
                ("color_video", "trellis_color.mp4"),
                ("normal_video", "trellis_normal.mp4"),
                ("combined_video", "trellis_combined.mp4"),
            ]
            for attr_name, filename in video_assets:
                url = getattr(artifacts, attr_name, None)
                if url:
                    try:
                        video_path = run_dir / filename
                        with urllib.request.urlopen(url) as response:
                            video_path.write_bytes(response.read())
                    except URLError as exc:
                        logger.warning(
                            "[product-pipeline] Failed to download %s: %s",
                            attr_name,
                            exc,
                        )

            if artifacts.no_background_images:
                no_bg_dir = run_dir / "no_background"
                no_bg_dir.mkdir(exist_ok=True)
                for idx, img_url in enumerate(artifacts.no_background_images, start=1):
                    try:
                        img_path = no_bg_dir / f"no_bg_{idx}.png"
                        with urllib.request.urlopen(img_url) as response:
                            img_path.write_bytes(response.read())
                    except URLError as exc:
                        logger.warning(
                            "[product-pipeline] Failed to download no-bg image %s: %s",
                            idx,
                            exc,
                        )
        except Exception as exc:  # noqa: BLE001
            logger.warning("[product-pipeline] Failed to save Trellis artifacts: %s", exc)

    def _save_product_state(self, state: ProductState, mode: str) -> None:
        try:
            import json

            trellis_dirs = sorted(
                ARTIFACTS_DIR.glob(f"trellis_{mode}_*"),
                key=lambda path: path.name,
            )
            if not trellis_dirs:
                return

            run_dir = trellis_dirs[-1]
            state_path = run_dir / "state.json"
            state_path.write_text(json.dumps(state.as_json(), indent=2))
        except Exception as exc:  # noqa: BLE001
            logger.warning("[product-pipeline] Failed to save product state: %s", exc)


product_pipeline_service = ProductPipelineService()
