#!/bin/bash

echo "🚀 Starting Project Gutenberg Book Analyzer Demo"
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed or not in PATH"
    echo "Please install Python 3 and try again"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    echo "Please install Node.js and try again"
    exit 1
fi

# Check if .env file exists in backend
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Warning: backend/.env file not found"
    echo "Please create backend/.env with your GROQ_API_KEY"
    echo "Example:"
    echo "GROQ_API_KEY=your_api_key_here"
    echo ""
fi

echo "📦 Starting Backend..."
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Starting Flask server..."
python3 app.py &
BACKEND_PID=$!

cd ..

echo "🌐 Starting Frontend..."
cd frontend

echo "Installing dependencies..."
npm install

echo "Starting Vite dev server..."
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "✅ Demo is starting up!"
echo "📱 Frontend: http://localhost:5174/"
echo "🔧 Backend API: http://localhost:5001/"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to stop
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait 