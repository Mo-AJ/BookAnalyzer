# Deployment Guide

## Overview
This application consists of a Flask backend (Python) and a React frontend (TypeScript/Vite). The backend is deployed on Render, and the frontend is deployed on Vercel.

## Prerequisites
- GitHub repository with your code
- Groq API key
- Render account (free tier available)
- Vercel account (free tier available)

## Backend Deployment (Render)

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up with your GitHub account

### 2. Create Web Service
- Click "New +" → "Web Service"
- Connect your GitHub repository
- Configure the service:
  - **Name**: `sarj-backend`
  - **Environment**: `Python 3`
  - **Build Command**: `pip install -r backend/requirements.txt`
  - **Start Command**: `cd backend && gunicorn app:app --bind 0.0.0.0:$PORT`
  - **Root Directory**: (leave empty)

### 3. Environment Variables
Add these environment variables:
- `GROQ_API_KEY`: Your Groq API key
- `FLASK_ENV`: `production`
- `DEBUG`: `false`

### 4. Deploy
- Click "Create Web Service"
- Wait for the build to complete
- Copy the generated URL (e.g., `https://your-app.onrender.com`)

## Frontend Deployment (Vercel)

### 1. Create Vercel Account
- Go to [vercel.com](https://vercel.com)
- Sign up with your GitHub account

### 2. Import Project
- Click "New Project"
- Import your GitHub repository
- Configure:
  - **Framework Preset**: `Vite`
  - **Root Directory**: `frontend`
  - **Build Command**: `npm run build`
  - **Output Directory**: `dist`

### 3. Environment Variables
Add this environment variable:
- `VITE_API_URL`: Your backend URL from Render

### 4. Deploy
- Click "Deploy"
- Wait for the build to complete

## Post-Deployment

### 1. Update API URL
After the backend is deployed:
1. Copy the backend URL from Render
2. Update the `VITE_API_URL` environment variable in Vercel
3. Redeploy the frontend if needed

### 2. Test the Application
- Visit your Vercel frontend URL
- Test uploading and analyzing a book
- Verify that character images are loading correctly

## Troubleshooting

### Backend Issues
- **Build fails**: Check that all dependencies are in `requirements.txt`
- **Runtime errors**: Check the logs in Render dashboard
- **API key issues**: Verify `GROQ_API_KEY` is set correctly

### Frontend Issues
- **API connection**: Verify `VITE_API_URL` points to the correct backend
- **Build fails**: Check that all dependencies are in `package.json`
- **CORS errors**: Backend should have CORS configured (already done)

### Character Images Not Loading
- Check that the backend `/api/character_image` endpoint is working
- Verify the frontend is correctly calling the API
- Check browser console for any errors

## File Structure
```
├── backend/
│   ├── app.py              # Main Flask application
│   ├── requirements.txt    # Python dependencies
│   ├── gunicorn.conf.py    # Production server config
│   └── Procfile           # Deployment configuration
├── frontend/
│   ├── src/
│   │   └── App.tsx        # Main React component
│   ├── package.json       # Node.js dependencies
│   └── .env.local         # Environment variables
└── deploy.sh              # Deployment automation script
```

## Notes
- The backend uses a fallback tokenizer if `tiktoken` is not available
- Character images are fetched asynchronously after book analysis
- The application is designed to handle large books efficiently
- All deployments use free tiers where possible 