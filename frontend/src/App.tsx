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

interface ChatMessage {
  question: string;
  answer: string;
  timestamp: Date;
}

function App() {
  const [bookId, setBookId] = useState('');
  const [analysis, setAnalysis] = useState<BookAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [namesOnly, setNamesOnly] = useState(false);
  const [error, setError] = useState('');
  
  // Chatbot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chunkSelection, setChunkSelection] = useState<'random' | 'user'>('random');
  const [selectedChunks, setSelectedChunks] = useState<number[]>([]);
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [chunkCountLoading, setChunkCountLoading] = useState(false);
  const [characterImages, setCharacterImages] = useState<{[key: string]: string}>({});
  const [imagesLoading, setImagesLoading] = useState(false);

  const analyzeBook = async () => {
    if (!bookId.trim()) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    setChatMessages([]); // Clear chat when analyzing new book
    setChunkCount(null); // Clear chunk count
    setCharacterImages({}); // Clear character images
    setImagesLoading(false); // Reset image loading state
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
      
      // Fetch chunk count after successful analysis
      await fetchChunkCount(data.book_id);
      
      // Fetch character images for top 10 characters
      await fetchCharacterImages(data.characters.slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze book');
    } finally {
      setLoading(false);
    }
  };

  const fetchChunkCount = async (bookId: string) => {
    setChunkCountLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/chunks/${bookId}`);
      if (response.ok) {
        const data = await response.json();
        setChunkCount(data.chunk_count);
      }
    } catch (err) {
      console.error('Failed to fetch chunk count:', err);
    } finally {
      setChunkCountLoading(false);
    }
  };

  const fetchCharacterImages = async (characters: Character[]) => {
    setImagesLoading(true);
    const images: {[key: string]: string} = {};
    
    for (const character of characters) {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/character_image?name=${encodeURIComponent(character.name)}`);
        if (response.ok) {
          const data = await response.json();
          images[character.name] = data.url;
          // Update state incrementally to show images as they load
          setCharacterImages(prev => ({ ...prev, [character.name]: data.url }));
        }
      } catch (err) {
        console.error(`Failed to fetch image for ${character.name}:`, err);
      }
    }
    
    setImagesLoading(false);
  };

  const askQuestion = async () => {
    if (!currentQuestion.trim() || !analysis) return;
    
    setChatLoading(true);
    try {
      const requestBody: any = {
        book_id: analysis.book_id,
        question: currentQuestion.trim(),
        chunk_selection: chunkSelection
      };
      
      if (chunkSelection === 'user') {
        requestBody.selected_chunks = selectedChunks;
      }
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get answer');
      }
      
      const data = await response.json();
      const newMessage: ChatMessage = {
        question: currentQuestion.trim(),
        answer: data.answer,
        timestamp: new Date()
      };
      
      setChatMessages(prev => [...prev, newMessage]);
      setCurrentQuestion('');
    } catch (err) {
      const errorMessage: ChatMessage = {
        question: currentQuestion.trim(),
        answer: err instanceof Error ? err.message : 'Failed to get answer',
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzeBook();
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askQuestion();
  };

  const handleChunkToggle = (chunkIndex: number) => {
    setSelectedChunks(prev => {
      if (prev.includes(chunkIndex)) {
        return prev.filter(c => c !== chunkIndex);
      } else {
        if (prev.length >= 3) {
          return prev; // Don't add more than 3
        }
        return [...prev, chunkIndex];
      }
    });
  };

  const resetChunkSelection = () => {
    setSelectedChunks([]);
    setChunkSelection('random');
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-200">
      {/* Header Bar */}
      <header className="bg-zinc-800 border-b border-zinc-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-10 flex items-center justify-between">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-blue-500 me-6" fill="#3b82f6" width="24" height="24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">AI Powered Book Character Analyzer</h1>
          </div>
          <span className="text-zinc-400 text-sm">by Mohammed Ajabnoor</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left: Form and Book Info */}
          <section className="lg:col-span-1 space-y-12">
            {/* Form Card */}
            <div className="bg-zinc-800 rounded-2xl shadow-lg p-12 border border-zinc-700">
              <div className="flex items-center mb-10">
                <svg className="w-5 h-5 me-6" fill="#3b82f6" width="20" height="20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h2 className="text-xl font-semibold text-zinc-100">Analyze a Book</h2>
              </div>
              <form onSubmit={handleSubmit} className="space-y-10">
                <div>
                  <label htmlFor="bookId" className="block text-sm font-medium text-zinc-300 mb-4 ml-2">
                    Project Gutenberg Book ID
                  </label>
                  <input
                    id="bookId"
                    type="text"
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    placeholder="e.g., 1661 for Sherlock Holmes"
                    className="w-full px-5 py-4 border border-zinc-600 rounded-lg bg-zinc-900 text-zinc-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="flex items-center ms-2">
                  <input
                    id="namesOnly"
                    type="checkbox"
                    checked={namesOnly}
                    onChange={(e) => setNamesOnly(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-600 rounded bg-zinc-900"
                  />
                  <label htmlFor="namesOnly" className="ms-4 text-sm text-zinc-300">
                    Names only (skip unnamed characters)
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-5 px-8 rounded-lg transition-colors duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin me-5 h-5 w-5" width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <circle className="opacity-25" cx="10" cy="10" r="8" stroke="white" strokeWidth="2"></circle>
                        <path className="opacity-75" fill="white" d="M4 10a6 6 0 016-6V0C2.686 0 0 2.686 0 6h4zm2 4.291A5.962 5.962 0 014 10H0c0 2.042 1.135 3.824 3 5.938l3-2.647z"></path>
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 me-5" fill="#3b82f6" width="20" height="18">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      Analyze Book
                    </>
                  )}
                </button>
              </form>
              {error && (
                <div className="mt-10 bg-red-900 border border-red-700 rounded-lg p-6">
                  <div className="flex">
                    <svg className="w-5 h-5 me-6" fill="#f87171" width="20" height="20">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    <div>
                      <h3 className="text-sm font-medium text-red-200">Error</h3>
                      <p className="text-sm text-red-300 mt-2">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section Divider */}
            <div className="h-1 bg-zinc-600 rounded-full" />

            {/* Book Info Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-12 border border-zinc-700">
                <div className="flex items-center mb-8">
                  <svg className="w-5 h-5 me-6" fill="#10b981" width="20" height="20">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <h2 className="text-2xl font-bold text-zinc-100">{analysis.title}</h2>
                </div>
                <p className="text-zinc-400 text-lg mb-3 ms-2">by {analysis.author}</p>
                <p className="text-zinc-500 text-sm ms-2">Book ID: {analysis.book_id}</p>
              </div>
            )}
          </section>

          {/* Right: Graph and Lists */}
          <section className="lg:col-span-2 space-y-12">
            {/* Graph Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-12 border border-zinc-700">
                <div className="section-header flex items-center">
                  <svg className="w-5 h-5 me-6" fill="#a855f7" width="20" height="20">
                    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100">Character Relationship Graph</h3>
                </div>
                <GraphView
                  characters={analysis.characters}
                  interactions={analysis.interactions}
                />
              </div>
            )}

            {/* Section Divider */}
            {analysis && <div className="h-1 bg-zinc-600 rounded-full" />}

            {/* Character List Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-12 border border-zinc-700">
                <div className="section-header flex items-center">
                  <svg className="w-5 h-5 me-6" fill="#eab308" width="20" height="20">
                    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0018.54 8H17c-.8 0-1.54.37-2.01 1l-4.7 6.28c-.37.5-.58 1.11-.58 1.73V20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100">
                    Characters ({analysis.characters.length})
                  </h3>
                </div>
                
                {/* Top 10 Characters with Images */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-6 mb-10">
                  {analysis.characters.slice(0, 10).map((character, index) => (
                    <div key={index} className="bg-zinc-700 rounded-lg p-6 border border-zinc-600 text-center mx-2 my-2">
                      {/* Character Image */}
                      <div className="mb-4 flex justify-center px-2">
                        {imagesLoading ? (
                          // Loading state
                          <div className="w-8 h-8 rounded-full bg-zinc-600 border border-zinc-500 flex items-center justify-center">
                            <svg className="animate-spin w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 5.938l3-2.647z"></path>
                            </svg>
                          </div>
                        ) : characterImages[character.name] ? (
                          // Loaded image
                          <div className="w-8 h-8 rounded-full border border-zinc-500 overflow-hidden bg-zinc-600 flex items-center justify-center">
                            <img 
                              src={characterImages[character.name]} 
                              alt={character.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.log(`Image failed to load for ${character.name}, using fallback`);
                                // Fallback to a default avatar if image fails to load
                                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(character.name)}`;
                              }}
                              onLoad={() => {
                                console.log(`Image loaded successfully for ${character.name}: ${characterImages[character.name]}`);
                              }}
                            />
                          </div>
                        ) : (
                          // Default placeholder
                          <div className="w-8 h-8 rounded-full bg-zinc-600 border border-zinc-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      
                      {/* Character Name */}
                      <div className="font-medium text-zinc-100 text-sm mb-2 truncate px-2" title={character.name}>
                        {character.name}
                      </div>
                      
                      {/* Mentions */}
                      <div className="text-xs text-zinc-400 px-2">
                        {character.mentions} mentions
                      </div>
                      
                      {/* Medal for top 3 */}
                      {index < 3 && (
                        <div className="mt-3 flex justify-center px-2">
                          {index === 0 && (
                            <svg className="w-4 h-4" fill="#fbbf24" viewBox="0 0 20 20">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          )}
                          {index === 1 && (
                            <svg className="w-4 h-4" fill="#9ca3af" viewBox="0 0 20 20">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          )}
                          {index === 2 && (
                            <svg className="w-4 h-4" fill="#d97706" viewBox="0 0 20 20">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Remaining Characters (without images) */}
                {analysis.characters.length > 10 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {analysis.characters.slice(10).map((character, index) => (
                      <div key={index + 10} className="bg-zinc-700 rounded-lg p-8 border border-zinc-600 mx-2 my-2">
                        <div className="flex items-center mb-3 px-2">
                          <div className="font-medium text-zinc-100">{character.name}</div>
                        </div>
                        <div className="text-sm text-zinc-400 px-2">{character.mentions} mentions</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Section Divider */}
            {analysis && <div className="h-1 bg-zinc-600 rounded-full" />}

            {/* Interaction List Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-12 border border-zinc-700">
                <div className="section-header flex items-center">
                  <svg className="w-5 h-5 me-6" fill="#ec4899" width="20" height="20">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100">
                    Character Interactions ({analysis.interactions.length})
                  </h3>
                </div>
                <div className="space-y-6 max-h-96 overflow-y-auto">
                  {analysis.interactions
                    .sort((a, b) => b.strength - a.strength)
                    .map((interaction, index) => (
                    <div key={index} className="bg-zinc-700 rounded-lg p-8 border border-zinc-600 mx-2 my-2">
                      <div className="flex items-center mb-3 px-2">
                        {index < 3 && (
                          <div className="flex-shrink-0 me-4">
                            {index === 0 && (
                              <svg className="w-6 h-6" fill="#ef4444" width="24" height="24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            )}
                            {index === 1 && (
                              <svg className="w-6 h-6" fill="#10b981" width="24" height="24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                              </svg>
                            )}
                            {index === 2 && (
                              <svg className="w-6 h-6" fill="#3b82f6" width="24" height="24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                              </svg>
                            )}
                          </div>
                        )}
                        <div className="font-medium text-zinc-100">
                          {interaction.from} ↔ {interaction.to}
                        </div>
                      </div>
                      <div className="text-sm text-zinc-400 px-2">
                        {interaction.count} interactions • {interaction.strength} relationship strength
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section Divider */}
            {analysis && <div className="h-1 bg-zinc-600 rounded-full" />}

            {/* Chatbot Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-12 border border-zinc-700">
                <div className="section-header flex items-center">
                  <svg className="w-5 h-5 me-6" fill="#06b6d4" width="20" height="20">
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100">
                    Ask Questions About the Book
                  </h3>
                </div>

                {/* Chunk Selection */}
                {chunkCount !== null && (
                  <div className="mb-8 p-6 bg-zinc-700 rounded-lg border border-zinc-600">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-medium text-zinc-200">Chunk Selection</h4>
                      <span className="text-xs text-zinc-400">
                        {chunkCount} total chunks available
                      </span>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center space-x-6">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="random"
                            checked={chunkSelection === 'random'}
                            onChange={(e) => setChunkSelection(e.target.value as 'random' | 'user')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-600 rounded bg-zinc-900"
                          />
                          <span className="ms-3 text-sm text-zinc-300">Random (AI picks 3 chunks)</span>
                        </label>
                        
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="user"
                            checked={chunkSelection === 'user'}
                            onChange={(e) => setChunkSelection(e.target.value as 'random' | 'user')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-600 rounded bg-zinc-900"
                          />
                          <span className="ms-3 text-sm text-zinc-300">Manual (You pick 3 chunks)</span>
                        </label>
                      </div>

                      {chunkSelection === 'user' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-300">
                              Select up to 3 chunks: {selectedChunks.length}/3
                            </span>
                            <button
                              onClick={resetChunkSelection}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Reset
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-5 gap-3 max-h-32 overflow-y-auto">
                            {Array.from({ length: chunkCount }, (_, i) => (
                              <button
                                key={i}
                                onClick={() => handleChunkToggle(i)}
                                disabled={!selectedChunks.includes(i) && selectedChunks.length >= 3}
                                className={`px-3 py-2 text-xs rounded border transition-colors ${
                                  selectedChunks.includes(i)
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : selectedChunks.length >= 3
                                    ? 'bg-zinc-600 border-zinc-500 text-zinc-400 cursor-not-allowed'
                                    : 'bg-zinc-700 border-zinc-600 text-zinc-300 hover:bg-zinc-600'
                                }`}
                              >
                                {i}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Chat Messages */}
                <div className="space-y-6 mb-8 max-h-96 overflow-y-auto">
                  {chatMessages.map((message, index) => (
                    <div key={index} className="space-y-3">
                      {/* Question */}
                      <div className="bg-zinc-700 rounded-lg p-6 border border-zinc-600">
                        <div className="flex items-center mb-3">
                          <svg className="w-4 h-4 me-3" fill="#3b82f6" width="16" height="16">
                            <path d="M8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"/>
                          </svg>
                          <span className="text-sm font-medium text-zinc-300">Your Question</span>
                          <span className="text-xs text-zinc-500 ml-auto">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-zinc-200">{message.question}</p>
                      </div>
                      
                      {/* Answer */}
                      <div className="bg-blue-900/20 rounded-lg p-6 border border-blue-700/30">
                        <div className="flex items-center mb-3">
                          <svg className="w-4 h-4 me-3" fill="#06b6d4" width="16" height="16">
                            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                          </svg>
                          <span className="text-sm font-medium text-zinc-300">AI Answer</span>
                        </div>
                        <p className="text-zinc-200 whitespace-pre-wrap">{message.answer}</p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Loading indicator */}
                  {chatLoading && (
                    <div className="bg-blue-900/20 rounded-lg p-6 border border-blue-700/30">
                      <div className="flex items-center">
                        <svg className="animate-spin w-4 h-4 me-3" fill="#06b6d4" width="16" height="16">
                          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 5.938l3-2.647z"/>
                        </svg>
                        <span className="text-sm text-zinc-300">Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Question Input */}
                <form onSubmit={handleChatSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="question" className="block text-sm font-medium text-zinc-300 mb-3">
                      Ask a question about {analysis.title}
                    </label>
                    <textarea
                      id="question"
                      value={currentQuestion}
                      onChange={(e) => setCurrentQuestion(e.target.value)}
                      placeholder="e.g., What happens to the main character? Who is the villain? What is the main conflict?"
                      className="w-full px-5 py-4 border border-zinc-600 rounded-lg bg-zinc-900 text-zinc-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                      rows={3}
                      disabled={chatLoading || (chunkSelection === 'user' && selectedChunks.length === 0)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!currentQuestion.trim() || chatLoading || (chunkSelection === 'user' && selectedChunks.length === 0)}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-4 px-8 rounded-lg transition-colors duration-200 flex items-center justify-center"
                  >
                    {chatLoading ? (
                      <>
                        <svg className="animate-spin me-4 h-4 w-4" width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="none">
                          <circle className="opacity-25" cx="8" cy="8" r="6" stroke="white" strokeWidth="2"></circle>
                          <path className="opacity-75" fill="white" d="M2 8a6 6 0 016-6V0C2.686 0 0 2.686 0 6h4zm2 4.291A5.962 5.962 0 012 8H0c0 2.042 1.135 3.824 3 5.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 me-4" fill="white" width="16" height="16">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                        </svg>
                        Ask Question
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
