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
    <div className="min-h-screen bg-zinc-900 text-zinc-200">
      {/* Header Bar */}
      <header className="bg-zinc-800 border-b border-zinc-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-blue-500" fill="#3b82f6" width="24" height="24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 ml-5">AI Powered Book Character Analyzer</h1>
          </div>
          <span className="text-zinc-400 text-sm">by Mohammed Ajabnoor</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left: Form and Book Info */}
          <section className="lg:col-span-1 space-y-10">
            {/* Form Card */}
            <div className="bg-zinc-800 rounded-2xl shadow-lg p-10 border border-zinc-700">
              <div className="flex items-center mb-8">
                <svg className="w-5 h-5" fill="#3b82f6" width="20" height="20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h2 className="text-xl font-semibold text-zinc-100 ml-5">Analyze a Book</h2>
              </div>
              <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                  <label htmlFor="bookId" className="block text-sm font-medium text-zinc-300 mb-3 ml-2">
                    Project Gutenberg Book ID
                  </label>
                  <input
                    id="bookId"
                    type="text"
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    placeholder="e.g., 1661 for Sherlock Holmes"
                    className="w-full px-4 py-3 border border-zinc-600 rounded-lg bg-zinc-900 text-zinc-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="flex items-center ml-2">
                  <input
                    id="namesOnly"
                    type="checkbox"
                    checked={namesOnly}
                    onChange={(e) => setNamesOnly(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-600 rounded bg-zinc-900"
                  />
                  <label htmlFor="namesOnly" className="ml-3 text-sm text-zinc-300">
                    Names only (skip unnamed characters)
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-4 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-4 h-5 w-5" width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <circle className="opacity-25" cx="10" cy="10" r="8" stroke="white" strokeWidth="2"></circle>
                        <path className="opacity-75" fill="white" d="M4 10a6 6 0 016-6V0C2.686 0 0 2.686 0 6h4zm2 4.291A5.962 5.962 0 014 10H0c0 2.042 1.135 3.824 3 5.938l3-2.647z"></path>
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-4" fill="white" width="20" height="20">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      Analyze Book
                    </>
                  )}
                </button>
              </form>
              {error && (
                <div className="mt-8 bg-red-900 border border-red-700 rounded-lg p-4">
                  <div className="flex">
                    <svg className="w-5 h-5" fill="#f87171" width="20" height="20">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    <div className="ml-5">
                      <h3 className="text-sm font-medium text-red-200">Error</h3>
                      <p className="text-sm text-red-300 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section Divider */}
            <div className="h-1 bg-zinc-600 rounded-full" />

            {/* Book Info Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-10 border border-zinc-700">
                <div className="flex items-center mb-6">
                  <svg className="w-5 h-5" fill="#10b981" width="20" height="20">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <h2 className="text-2xl font-bold text-zinc-100 ml-5">{analysis.title}</h2>
                </div>
                <p className="text-zinc-400 text-lg mb-2 ml-2">by {analysis.author}</p>
                <p className="text-zinc-500 text-sm ml-2">Book ID: {analysis.book_id}</p>
              </div>
            )}
          </section>

          {/* Right: Graph and Lists */}
          <section className="lg:col-span-2 space-y-10">
            {/* Graph Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-10 border border-zinc-700">
                <div className="flex items-center mb-8">
                  <svg className="w-5 h-5" fill="#a855f7" width="20" height="20">
                    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100 ml-5">Character Relationship Graph</h3>
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
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-10 border border-zinc-700">
                <div className="flex items-center mb-8">
                  <svg className="w-5 h-5" fill="#eab308" width="20" height="20">
                    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0018.54 8H17c-.8 0-1.54.37-2.01 1l-4.7 6.28c-.37.5-.58 1.11-.58 1.73V20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100 ml-5">
                    Characters ({analysis.characters.length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {analysis.characters.map((character, index) => (
                    <div key={index} className="bg-zinc-700 rounded-lg p-6 border border-zinc-600">
                      <div className="flex items-center mb-2">
                        {index < 3 && (
                          <div className="flex-shrink-0">
                            {index === 0 && (
                              <svg className="w-6 h-6" fill="#fbbf24" width="24" height="24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            )}
                            {index === 1 && (
                              <svg className="w-6 h-6" fill="#9ca3af" width="24" height="24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            )}
                            {index === 2 && (
                              <svg className="w-6 h-6" fill="#d97706" width="24" height="24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            )}
                          </div>
                        )}
                        <div className="font-medium text-zinc-100 ml-4">{character.name}</div>
                      </div>
                      <div className="text-sm text-zinc-400">{character.mentions} mentions</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section Divider */}
            {analysis && <div className="h-1 bg-zinc-600 rounded-full" />}

            {/* Interaction List Card */}
            {analysis && (
              <div className="bg-zinc-800 rounded-2xl shadow-lg p-10 border border-zinc-700">
                <div className="flex items-center mb-8">
                  <svg className="w-5 h-5" fill="#ec4899" width="20" height="20">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-100 ml-5">
                    Character Interactions ({analysis.interactions.length})
                  </h3>
                </div>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {analysis.interactions
                    .sort((a, b) => b.strength - a.strength)
                    .map((interaction, index) => (
                    <div key={index} className="bg-zinc-700 rounded-lg p-6 border border-zinc-600">
                      <div className="flex items-center mb-2">
                        {index < 3 && (
                          <div className="flex-shrink-0">
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
                        <div className="font-medium text-zinc-100 ml-4">
                          {interaction.from} ↔ {interaction.to}
                        </div>
                      </div>
                      <div className="text-sm text-zinc-400">
                        {interaction.count} interactions • {interaction.strength} relationship strength
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
