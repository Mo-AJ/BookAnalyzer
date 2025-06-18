# BookAnalyzer

A simple web application that analyzes character interactions in books from Project Gutenberg using AI.

## Features

- Analyze any book from Project Gutenberg by entering its book ID
- Extract character names and count their mentions
- Identify character interactions and count their frequency
- Simple, clean interface with no complex styling

## Tech Stack

- **Backend**: Python Flask with Groq LLM API
- **Frontend**: React with TypeScript
- **AI**: Groq API for character and interaction analysis

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
   - List of characters with mention counts
   - List of character interactions with frequency

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

- `GET /api/health` - Health check
- `GET /api/search?q=<query>` - Search for books
- `POST /api/analyze` - Analyze a book by ID

## Project Structure

```
├── backend/
│   ├── app.py              # Flask application
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main React component
│   │   ├── index.css      # Styles
│   │   └── main.tsx       # React entry point
│   ├── package.json       # Node.js dependencies
│   └── vite.config.ts     # Vite configuration
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License 