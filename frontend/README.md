# Frontend

The main project documentation lives in the root README:

- [Root README](../README.md)

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Backend URL

By default the frontend calls the backend on the same host at port `8000`.

Examples:

- `http://localhost:3000` -> `http://localhost:8000`
- `http://192.168.1.120:3000` -> `http://192.168.1.120:8000`

Override with:

```env
NEXT_PUBLIC_API_URL=http://your-backend-host:8000
```
