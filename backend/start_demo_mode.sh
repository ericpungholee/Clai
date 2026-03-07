#!/bin/bash
# Start Vril in DEMO MODE - saves all artifacts to backend/tests/artifacts/
# 
# This runs the full app with artifact saving enabled so you can:
# - Generate products through the UI
# - View saved models, images, videos in tests/artifacts/
# - Use for demos, presentations, or debugging
#
# Usage: ./backend/start_demo_mode.sh

set -e

echo "🎨 Starting Vril in DEMO MODE"
echo "============================================"
echo ""
echo "📁 Artifacts will be saved to:"
echo "   backend/tests/artifacts/"
echo ""
echo "📂 Each generation creates timestamped folders:"
echo "   - gemini_create_* (AI-generated images)"
echo "   - trellis_create_* (3D models, videos, state)"
echo "   - gemini_edit_* (edit images)"
echo "   - trellis_edit_* (edited models)"
echo ""
echo "============================================"

# Load environment variables
if [ -f backend/.env ]; then
    echo "📋 Loading environment from backend/.env..."
    export $(grep -v '^#' backend/.env | xargs)
elif [ -f .env ]; then
    echo "📋 Loading environment from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Check required API keys
if [ -z "$FAL_KEY" ] || [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ ERROR: FAL_KEY and GEMINI_API_KEY must be set in .env"
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose -f backend/docker-compose.yml down

# Start with demo mode enabled
echo "🚀 Starting containers with DEMO MODE enabled..."
docker compose -f backend/docker-compose.yml -f backend/docker-compose.demo.yml up -d

echo ""
echo "✅ DEMO MODE STARTED"
echo "============================================"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "📁 Artifacts: backend/tests/artifacts/"
echo ""
echo "💡 Tip: Every product you create will be saved to artifacts/"
echo "============================================"
echo ""
echo "📊 Viewing logs:"
echo "   docker compose -f backend/docker-compose.yml logs -f fastapi_app"
echo ""
echo "🛑 To stop:"
echo "   docker compose -f backend/docker-compose.yml down"
echo ""

