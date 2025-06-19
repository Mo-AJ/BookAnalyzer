import React, { useState } from 'react';
import GraphView from "./GraphView";

interface Character {
  name: string;
  mentions: number;
}

interface Interaction {
  from: string;
  to: string;
  count: number;
  strength: number;
}

interface BookAnalysis {
  book_id: string;
  title: string;
  author: string;
  characters: Character[];
  interactions: Interaction[];
}

function App() {
  const [bookId, setBookId] = useState('');
  const [analysis, setAnalysis] = useState<BookAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [namesOnly, setNamesOnly] = useState(false);
  const [error, setError] = useState('');

  const analyzeBook = async () => {
    if (!bookId.trim()) return;

    setLoading(true);
    setError('');
    setAnalysis(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          book_id: bookId,
          names_only: namesOnly 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze book');
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze book');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzeBook();
  };

  return (
    <div>
      <h1>Book Character Analyzer</h1>
      
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Book ID:
            <input
              type="text"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              placeholder="Enter Project Gutenberg book ID (e.g., 1661)"
            />
          </label>
        </div>
        
        <div>
          <label>
            <input
              type="checkbox"
              checked={namesOnly}
              onChange={(e) => setNamesOnly(e.target.checked)}
            />
            Names only (skips unnamed characters e.g. "the masked man")
          </label>
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze Book'}
        </button>
      </form>

      {error && (
        <div>
          <p>Error: {error}</p>
        </div>
      )}

      {analysis && (
        <div>
          <h2>{analysis.title}</h2>
          <p>by {analysis.author}</p>

          {/* graph */}
          <GraphView
            characters={analysis.characters}
            interactions={analysis.interactions}
          />

          {/* character list */}
          <h3>Characters ({analysis.characters.length})</h3>
          <ul>
            {analysis.characters.map((character, index) => (
              <li key={index}>
                {character.name}: {character.mentions} mentions
              </li>
            ))}
          </ul>

          {/* interaction list */}  
          <h3>Character Interactions ({analysis.interactions.length})</h3>
          <ul>
            {analysis.interactions.map((interaction, index) => (
              <li key={index}>
                {interaction.from} ↔ {interaction.to}: {interaction.count} interactions, {interaction.strength} relationship strength
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
