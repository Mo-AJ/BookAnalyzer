# BookAnalyzer

A simple web application that analyzes character interactions in books from Project Gutenberg using AI.

## Features

- Analyze any book from Project Gutenberg by entering its book ID
- Extract character names and count their mentions
- Identify character interactions and count their frequency
- Interactive character relationship graph visualization
- AI-powered chatbot for asking questions about analyzed books
- Character images from Wikipedia (with fallback avatars)
- Simple, clean interface with modern styling

## Tech Stack

- **Backend**: Python Flask with Groq LLM API
- **Frontend**: React with TypeScript and Force Graph visualization
- **AI**: Groq API for character and interaction analysis
- **Caching**: File-based caching system for performance

## Setup

### Prerequisites

- Python 3.8+
- Node.js 16+
- Groq API key

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the backend directory:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   ```

5. Run the backend server:
   ```bash
   python app.py
   ```

The backend will run on `http://localhost:5001`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

The frontend will run on `http://localhost:5173`

## Usage

1. Open the application in your browser
2. Enter a Project Gutenberg book ID (e.g., 1661 for Sherlock Holmes)
3. Click "Analyze Book"
4. View the results showing:
   - Interactive character relationship graph
   - List of characters with mention counts and images
   - List of character interactions with frequency
   - AI chatbot for asking questions about the book

## Popular Book IDs

- 1661: The Adventures of Sherlock Holmes
- 1342: Pride and Prejudice
- 11: Alice's Adventures in Wonderland
- 84: Frankenstein
- 98: A Tale of Two Cities
- 2701: Moby Dick
- 76: Adventures of Huckleberry Finn
- 345: Dracula

## API Endpoints

### Core Analysis
- `POST /api/analyze` - Analyze a book by ID
  ```bash
  curl -X POST http://localhost:5001/api/analyze \
    -H "Content-Type: application/json" \
    -d '{"book_id": "1661", "names_only": false}'
  ```

### Chatbot
- `POST /api/query` - Ask questions about an analyzed book
  ```bash
  curl -X POST http://localhost:5001/api/query \
    -H "Content-Type: application/json" \
    -d '{
      "book_id": "1661",
      "question": "What happens to the main character?",
      "chunk_selection": "random"
    }'
  ```

### Book Information
- `GET /api/test_book/<book_id>` - Get book metadata
  ```bash
  curl http://localhost:5001/api/test_book/1661
  ```

- `GET /api/chunks/<book_id>` - Get chunk count for a book
  ```bash
  curl http://localhost:5001/api/chunks/1661
  ```

### Character Images
- `GET /api/character_image?name=<character_name>` - Get character image
  ```bash
  curl "http://localhost:5001/api/character_image?name=Sherlock%20Holmes"
  ```

### System
- `GET /api/health` - Health check
  ```bash
  curl http://localhost:5001/api/health
  ```

## Cache Management

The application uses a file-based caching system to improve performance and reduce API calls. All cached data is stored in the `cache/` directory.

### Check Cache Information
```bash
curl http://localhost:5001/api/cache_info
```

This returns information about:
- Cache directory location
- Total cache size (bytes and MB)
- Number of cached items
- Whether cache directory exists

Example response:
```json
{
  "status": "success",
  "cache_dir": "/path/to/cache",
  "exists": true,
  "size_bytes": 1048576,
  "size_mb": 1.0,
  "items": 25
}
```

### Clear Cache
```bash
curl -X POST http://localhost:5001/api/clear_cache
```

This will:
- Remove all cached data
- Recreate the empty cache directory
- Return success status

Example response:
```json
{
  "status": "success",
  "message": "Cache cleared successfully",
  "cache_dir": "/path/to/cache"
}
```

### Cache Structure
The cache stores several types of data:
- `books_meta/<book_id>.json` - Book metadata (title, author)
- `books_chunks/<book_id>.json` - Book text chunks for analysis
- `graphs/<book_id>_<names_only>.json` - Analysis results
- Character images are cached by the browser

### Manual Cache Management
You can also manually manage the cache by:
```bash
# Remove specific book cache
rm -rf cache/books_meta/1661.json
rm -rf cache/books_chunks/1661.json
rm -rf cache/graphs/1661_*.json

# Clear all cache
rm -rf cache/
mkdir cache/
```

## Project Structure

```
├── backend/
│   ├── app.py              # Flask application
│   ├── requirements.txt    # Python dependencies
│   ├── gunicorn.conf.py    # Production server config
│   ├── Procfile           # Deployment configuration
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main React component
│   │   ├── GraphView.tsx  # Force graph visualization
│   │   ├── index.css      # Styles
│   │   └── main.tsx       # React entry point
│   ├── package.json       # Node.js dependencies
│   └── vite.config.ts     # Vite configuration
├── cache/                 # Cached data (auto-generated)
├── .gitignore             # Git ignore rules
├── DEPLOYMENT.md          # Deployment guide
├── start-demo.sh          # Demo startup script
└── README.md              # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License 