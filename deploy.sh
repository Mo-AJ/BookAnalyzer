#!/bin/bash

echo "🚀 SARJ Deployment Script"
echo "=========================="

# Check if git is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Git repository has uncommitted changes. Please commit or stash them first."
    exit 1
fi

echo "✅ Git repository is clean"

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main

echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. BACKEND DEPLOYMENT (Render):"
echo "   - Go to https://render.com"
echo "   - Click 'New +' → 'Web Service'"
echo "   - Connect your GitHub repo"
echo "   - Configure:"
echo "     • Name: sarj-backend"
echo "     • Environment: Python 3"
echo "     • Build Command: pip install -r backend/requirements.txt"
echo "     • Start Command: cd backend && gunicorn app:app --bind 0.0.0.0:\$PORT"
echo "   - Add Environment Variables:"
echo "     • GROQ_API_KEY=your_api_key"
echo "     • FLASK_ENV=production"
echo "     • DEBUG=0"
echo ""
echo "2. FRONTEND DEPLOYMENT (Vercel):"
echo "   - Go to https://vercel.com"
echo "   - Click 'New Project'"
echo "   - Import your GitHub repo"
echo "   - Configure:"
echo "     • Framework: Vite"
echo "     • Root Directory: frontend"
echo "   - Add Environment Variable:"
echo "     • VITE_API_URL=https://your-backend-url.onrender.com"
echo ""
echo "3. UPDATE FRONTEND API URL:"
echo "   - After backend deploys, copy the URL"
echo "   - Update VITE_API_URL in Vercel environment variables"
echo ""
echo "✅ Deployment files are ready!" 