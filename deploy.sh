#!/bin/bash

echo "🚀 Starting deployment process..."

# Check if git is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Git repository is not clean. Please commit your changes first."
    exit 1
fi

# Push to GitHub
echo "📤 Pushing code to GitHub..."
git push origin main

echo ""
echo "✅ Code pushed successfully!"
echo ""
echo "🌐 Backend Deployment (Render):"
echo "1. Go to https://render.com and sign up/login"
echo "2. Click 'New +' and select 'Web Service'"
echo "3. Connect your GitHub repository"
echo "4. Configure the service:"
echo "   - Name: sarj-backend"
echo "   - Environment: Python 3"
echo "   - Build Command: pip install -r backend/requirements.txt"
echo "   - Start Command: cd backend && gunicorn app:app --bind 0.0.0.0:\$PORT"
echo "   - Root Directory: (leave empty)"
echo "5. Add Environment Variables:"
echo "   - GROQ_API_KEY: your_groq_api_key"
echo "   - FLASK_ENV: production"
echo "   - DEBUG: false"
echo "6. Click 'Create Web Service'"
echo ""
echo "📱 Frontend Deployment (Vercel):"
echo "1. Go to https://vercel.com and sign up/login"
echo "2. Click 'New Project'"
echo "3. Import your GitHub repository"
echo "4. Configure:"
echo "   - Framework Preset: Vite"
echo "   - Root Directory: frontend"
echo "   - Build Command: npm run build"
echo "   - Output Directory: dist"
echo "5. Click 'Deploy'"
echo ""
echo "🔧 After backend deployment:"
echo "1. Copy the backend URL from Render"
echo "2. Update frontend/.env.local with the new API URL"
echo "3. Redeploy frontend if needed"
echo ""
echo "🎉 Deployment complete!" 