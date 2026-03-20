# Clai

AI-assisted product design workspace with a simple flow:

`prompt -> Gemini image -> Trellis 3D draft -> editor/chat iteration -> packaging -> export`

## Demo

[![Demo Video](https://img.youtube.com/vi/-yTFJw_ekxk/0.jpg)](https://www.youtube.com/watch?v=-yTFJw_ekxk)

## Current Product Flow

1. Enter a product prompt on `/`.
2. The frontend creates or activates a project and starts `/product/create`.
3. The backend builds a structured design brief, generates one Gemini concept preview, auto-selects it, and sends it to Trellis.
4. Trellis returns a GLB draft and the app opens `/product`.
5. The product page shows the 3D model and a minimal chat sidebar for iteration.
6. Each follow-up chat edit generates one edited reference image with Gemini, rebuilds the model with Trellis, and saves a new product version.

The product side is intentionally minimal now. The editor is the long-lived workspace after the first draft exists.

## Current Packaging Flow

Packaging stays separate from product generation.

1. Open `/packaging`.
2. Choose `box` or `cylinder`, adjust dimensions, and select a panel or generate all panels.
3. Optionally attach a reference image for packaging style guidance.
4. Gemini generates packaging textures.
5. `/final-view` combines product and packaging output for review/export.

## Stack

### Frontend

- Next.js `16.1.1`
- React `19`
- TypeScript `5`
- Tailwind CSS `4`
- Radix UI
- `three`, `@react-three/fiber`, `@react-three/drei`

### Backend

- FastAPI
- Pydantic
- Redis-backed state
- Gemini for image generation
- Trellis via `fal-client` for 3D draft generation
- CairoSVG-backed export utilities

## Key Files

- `frontend/app/page.tsx`
  Home page and project list.
- `frontend/app/product/page.tsx`
  Product viewer + chat workspace.
- `frontend/components/ProductAIChatPanel.tsx`
  Product create/edit prompt UI.
- `frontend/app/packaging/page.tsx`
  Packaging editor and panel workflow.
- `frontend/components/PackagingAIChatPanel.tsx`
  Panel texture generation UI.
- `backend/app/services/product_pipeline.py`
  Main product orchestration.
- `backend/app/integrations/gemini.py`
  Gemini image generation integration.
- `backend/app/integrations/trellis.py`
  Trellis 3D generation integration.
- `backend/app/services/project_store.py`
  Saved-project persistence.
- `backend/app/core/redis.py`
  Redis access with file fallback.

## Requirements

- Node.js `20+`
- npm
- Python `3.10+`
- Redis

Docker is optional for the backend.

## Local Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy env.example .env
uvicorn main:app --reload
```

Backend runs on `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

### 3. Optional Backend Docker Setup

```bash
cd backend
docker compose up --build
```

## Environment

Create `backend/.env` from `backend/env.example`.

Required:

```env
FAL_KEY=your_fal_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
REDIS_URL=redis://localhost:6379/0
```

Optional:

```env
GEMINI_FLASH_MODEL=gemini-3.1-flash-image-preview
GEMINI_IMAGE_SIZE=1K
GEMINI_IMAGE_ASPECT_RATIO=1:1
SAVE_ARTIFACTS_LOCALLY=false
TRELLIS_MODEL_ID=fal-ai/trellis-2
```

Frontend:

- `NEXT_PUBLIC_API_URL` is optional.
- If it is not set, the frontend calls `http(s)://<current-host>:8000`.
- That means LAN access works as long as the backend is reachable on the same host at port `8000`.

## State Storage

App state is stored in:

- Redis database `0` by default
- `backend/data/redis_fallback.json` if Redis is unavailable

Saved projects, current product state, packaging state, and product status all live there.

## Reset App State

To start fresh, clear Redis and reset the fallback file:

```powershell
@'
from pathlib import Path
import sys

sys.path.insert(0, r"backend")

from app.core.redis import redis_service

redis_service.flushdb()
Path(r"backend/data/redis_fallback.json").write_text("{}\n", encoding="utf-8")
print("Cleared app state")
'@ | python -
```

## Useful Commands

```bash
# frontend
cd frontend
npm run dev
npm run build

# backend
cd backend
uvicorn main:app --reload
```

```bash
# repo root
python -m pytest backend/tests/test_trellis_service.py backend/tests/test_product_pipeline.py backend/tests/test_projects.py
```

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
|   |-- lib/
|   `-- providers/
|-- backend/
|   |-- app/
|   |   |-- core/
|   |   |-- endpoints/
|   |   |-- integrations/
|   |   |-- models/
|   |   `-- services/
|   |-- data/
|   |-- tests/
|   |-- env.example
|   |-- main.py
|   `-- requirements.txt
`-- README.md
```

## Verification Baseline

Current baseline:

- `npm run build` passes in `frontend`
- `python -m pytest backend/tests/test_trellis_service.py backend/tests/test_product_pipeline.py backend/tests/test_projects.py` passes
- product flow is prompt-first and editor-first
- packaging stays separate from product editing
