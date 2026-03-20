# Clai

AI-assisted physical product design workspace for product concepts, 3D drafts, packaging, and export.

## Demo

[![Demo Video](https://img.youtube.com/vi/-yTFJw_ekxk/0.jpg)](https://www.youtube.com/watch?v=-yTFJw_ekxk)

## What The App Does

Clai turns a rough product idea into a structured design workflow instead of a one-shot image-to-3D pipeline.

Current product flow:

1. User prompt -> structured design brief
2. Design brief -> concept directions
3. User selects or refines a concept
4. Selected concept -> controlled reference image set
5. Reference set -> Trellis 3D draft
6. Draft enters the editor as the long-lived workspace
7. Later AI edits create versioned changes instead of restarting from zero

Packaging remains a separate workflow with its own state, panel texture generation, dielines, and exports.

## Current Stack

### Frontend

- Next.js `16.1.1`
- React `19`
- TypeScript `5`
- Tailwind CSS `4`
- Radix UI
- `@react-three/fiber`, `@react-three/drei`, `three`

### Backend

- FastAPI
- Pydantic models
- Redis-backed session state
- Gemini for image generation
- Trellis for 3D draft generation
- File export utilities with lazy CairoSVG gating

## Key Product Architecture

The product workflow is now stage-aware and design-state-first.

- `backend/app/models/product_state.py`
  Stores the authoritative product workflow state, including `design_brief`, `concept_directions`, `selected_concept_id`, `reference_set`, `workflow_stage`, `ai_operations`, `version_history`, and editor metadata.
- `backend/app/services/product_pipeline.py`
  Orchestrates stage-specific product actions such as brief creation, concept generation, concept refinement, reference generation, 3D draft generation, and structured edits.
- `backend/app/endpoints/product/router.py`
  Exposes state-aware product routes such as create, concept refine/select, reference generation, draft generation, edit, rewind, recover, and export.
- `frontend/app/product/page.tsx`
  Renders the stage-aware workspace for brief, concepts, references, draft generation, editor state, version history, and operation history.
- `frontend/components/ProductAIChatPanel.tsx`
  Dispatches structured product actions instead of acting as a generic prompt box.
- `frontend/app/packaging/page.tsx`
  Owns the packaging workflow and remains separate from product editing logic.
- `frontend/app/final-view/page.tsx`
  Composes product and packaging outputs for final review and export.

## Repository Layout

```text
Clai/
|-- frontend/
|   |-- app/
|   |   |-- page.tsx
|   |   |-- product/
|   |   |-- packaging/
|   |   `-- final-view/
|   |-- components/
|   |-- hooks/
|   `-- lib/
|       |-- api-client.ts
|       |-- api-config.ts
|       |-- product-api.ts
|       `-- packaging-helpers.ts
|-- backend/
|   |-- app/
|   |   |-- endpoints/
|   |   |-- integrations/
|   |   |-- models/
|   |   `-- services/
|   |-- tests/
|   |-- main.py
|   `-- requirements.txt
`-- README.md
```

## Requirements

- Node.js `20.9+`
- npm
- Python `3.10+`
- Redis

Docker is optional if you prefer containerized backend setup.

## Local Development

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy env.example .env
uvicorn main:app --reload
```

Backend runs on `http://localhost:8000`.

### 3. Backend With Docker

```bash
cd backend
docker compose up --build
```

## Environment Variables

Add these in `backend/.env`:

```env
FAL_KEY=your_fal_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
REDIS_URL=redis://localhost:6379/0
```

Optional backend flags already supported:

- `SAVE_ARTIFACTS_LOCALLY=true`
- `GEMINI_FLASH_MODEL=gemini-3.1-flash-image-preview`
- `GEMINI_PRO_MODEL=gemini-3.1-flash-image-preview`

## Useful Commands

```bash
# Frontend
cd frontend
npm run build
npm run lint

# Backend
cd backend
python -m pytest
uvicorn main:app --reload
```

## Packaging Workflow

Packaging is intentionally separate from product generation.

- shape state is persisted independently
- panel texture generation stays isolated from product edit logic
- final export composes product and packaging without merging their session states

## Artifact Saving

To save generated assets locally for debugging:

```bash
cd backend
set SAVE_ARTIFACTS_LOCALLY=true
uvicorn main:app --reload
```

Or use the helper script:

```bash
Artifacts are written under `backend/tests/artifacts/`.

## Verification Baseline

The current baseline after the Next.js update is:

- frontend pinned to `next@16.1.1`
- frontend pinned to `eslint-config-next@16.1.1`
- backend tests pass with `python -m pytest`
- frontend production build passes with `npm run build`

## Notes

- The frontend is intentionally kept on the existing App Router + React 19 + Tailwind 4 stack.
- Product and packaging workflows stay separate by design.
- The editor is the primary product workspace after the first draft exists.
