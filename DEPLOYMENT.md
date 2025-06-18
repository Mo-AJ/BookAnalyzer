# Deployment Guide

This guide will help you deploy the SARJ application to production.

## Backend Deployment (Render/Railway)

### Option 1: Render

1. **Create a Render Account**
   - Go to [render.com](https://render.com)
   - Sign up for a free account

2. **Connect Your Repository**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the repository

3. **Configure the Service**
   - **Name**: `sarj-backend` (or your preferred name)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `cd backend && gunicorn app:app --bind 0.0.0.0:$PORT`
   - **Root Directory**: Leave empty (or set to `backend` if needed)

4. **Set Environment Variables**
   - Go to "Environment" tab
   - Add the following variables:
     ```
     GROQ_API_KEY=your_groq_api_key
     SAMNANOVA_API_KEY=your_samnanova_api_key
     FLASK_ENV=production
     DATABASE_URL=sqlite:///./app.db
     ```

5. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy your application

### Option 2: Railway

1. **Create a Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up for a free account

2. **Deploy from GitHub**
   - Click "Deploy from GitHub repo"
   - Select your repository
   - Railway will auto-detect it's a Python application

3. **Configure Environment Variables**
   - Go to "Variables" tab
   - Add the same environment variables as above

4. **Deploy**
   - Railway will automatically deploy your application

## Frontend Deployment (Vercel)

1. **Create a Vercel Account**
   - Go to [vercel.com](https://vercel.com)
   - Sign up for a free account

2. **Import Your Repository**
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect it's a Vite React app

3. **Configure the Project**
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. **Set Environment Variables**
   - Go to "Environment Variables" tab
   - Add:
     ```
     VITE_API_URL=https://your-backend-url.onrender.com
     ```

5. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your frontend

## Environment Variables

### Backend (.env)
```bash
# LLM API Keys
GROQ_API_KEY=your_groq_api_key_here
SAMNANOVA_API_KEY=your_samnanova_api_key_here

# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=False

# Database Configuration
DATABASE_URL=sqlite:///./app.db

# Server Configuration
HOST=0.0.0.0
PORT=5000
```

### Frontend (.env.local)
```bash
# API Configuration
VITE_API_URL=https://your-backend-url.onrender.com

# Development Configuration
VITE_APP_TITLE=SARJ - AI-Powered Application
```

## Getting API Keys

### Groq API Key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to "API Keys"
4. Create a new API key
5. Copy the key to your environment variables

### SamnaNova API Key
1. Go to [samnanova.ai](https://samnanova.ai)
2. Sign up for a free account
3. Navigate to "API Keys" or "Settings"
4. Create a new API key
5. Copy the key to your environment variables

## Custom Domain (Optional)

### Backend Custom Domain
- **Render**: Go to your service → "Settings" → "Custom Domains"
- **Railway**: Go to your service → "Settings" → "Domains"

### Frontend Custom Domain
- **Vercel**: Go to your project → "Settings" → "Domains"
- Add your custom domain and configure DNS

## Monitoring and Logs

### Backend Monitoring
- **Render**: Go to your service → "Logs" tab
- **Railway**: Go to your service → "Logs" tab

### Frontend Monitoring
- **Vercel**: Go to your project → "Functions" tab for serverless function logs

## Troubleshooting

### Common Issues

1. **Backend not starting**
   - Check if all environment variables are set
   - Verify the build command is correct
   - Check logs for Python version compatibility

2. **Frontend build failing**
   - Ensure all dependencies are installed
   - Check if the API URL is correct
   - Verify TypeScript compilation

3. **CORS errors**
   - Ensure the backend CORS configuration includes your frontend domain
   - Check if the API URL is correct in frontend environment variables

4. **Database issues**
   - SQLite files are ephemeral on most platforms
   - Consider using a persistent database like PostgreSQL for production

### Support

- **Render**: [docs.render.com](https://docs.render.com)
- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs) 