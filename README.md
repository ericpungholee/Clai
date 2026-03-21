# Clai

**AI workspace for designing physical products.**  
Turn a text prompt into a manufacturable 3D design and packaging in minutes.
## Demo

[![Demo Video](https://img.youtube.com/vi/-yTFJw_ekxk/0.jpg)](https://www.youtube.com/watch?v=-yTFJw_ekxk)

---

## Problem

Designing physical products is slow, fragmented, and expensive.

- You need CAD tools, designers, and multiple iterations  
- Translating ideas → visuals → 3D models → packaging is manual  
- Early-stage founders and small teams are locked out of fast prototyping  

Result: weeks of work before you even see a first draft.

---

## Solution

Clai is a prompt-to-product workspace.

- Describe your idea → get a 3D product instantly  
- Iterate using chat, not CAD  
- Generate packaging alongside the product  
- Export assets ready for manufacturing workflows  

From idea → 3D model → packaging in minutes.

---

## How It Works

### Product Flow

1. Enter a product prompt  
2. Clai generates a structured design brief  
3. Gemini creates a concept image  
4. Trellis generates a 3D model (GLB)  
5. Open the editor workspace  
6. Iterate via chat → each edit creates a new version  

### Packaging Flow

1. Choose packaging type (box or cylinder)  
2. Set dimensions and panels  
3. Optionally provide style references  
4. Generate packaging textures with AI  
5. Combine product + packaging in final view  

---

## Why Now

- Generative models can now produce usable visual + 3D outputs  
- Manufacturing is becoming more API-accessible  
- Indie builders are launching physical products faster than ever  

But tools are still built for experts. Clai makes product design accessible to anyone.

---

## Product Vision

Clai is building the **Canva for physical product design**.

Long term:

- Full product → packaging → manufacturing pipeline  
- AI-native design editor instead of CAD  
- Collaboration layer for teams and suppliers  
- Direct export to manufacturers  

---

## Tech Stack

### Frontend

- Next.js 16  
- React 19  
- TypeScript 5  
- Tailwind CSS 4  
- Three.js / React Three Fiber  

### Backend

- FastAPI  
- Redis (state)  
- Gemini (image generation)  
- Trellis via fal (3D generation)  
- CairoSVG (exports)  

---

## Architecture

- Prompt → structured design brief  
- Image generation → reference concept  
- 3D generation → GLB model  
- Iterative edits → versioned outputs  
- State stored in Redis with file fallback  

---

## Status

- Prompt → 3D model pipeline working  
- Chat-based iteration working  
- Packaging flow working  
- Versioned product outputs  

---

## The Idea

If Figma made design collaborative for digital products,  
Clai does the same for physical products.

From idea → reality, instantly.
