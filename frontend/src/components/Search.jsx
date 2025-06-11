import React, { useState } from 'react';
import axios from 'axios';

const Search = () => {
  const [query, setQuery] = useState('');
  const [liveResults, setLiveResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:3001/api/realtime-search?q=${query}`);
      setLiveResults(res.data || []);
    } catch (err) {
      console.error('Real-time search failed', err);
      setLiveResults([]);
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-800 dark:bg-gray-900 min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blogs..."
            className="flex-1 px-5 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Search
          </button>
        </div>

        {loading && <p className="text-white">Loading...</p>}

        {liveResults.length > 0 && (
          <div className="mt-10">
            <h2 className="text-white text-xl font-semibold mb-4">Live Web Results</h2>
            <div className="grid gap-6">
              {liveResults.map((hit, idx) => (
                <a
                  key={idx}
                  href={hit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-2xl p-6 shadow-md transition"
                >
                  <h3 className="text-2xl font-bold text-white mb-2">{hit.title}</h3>
                  <p className="text-sm text-gray-400 mb-2">
                    <strong>Author:</strong> {hit.author || 'Unknown'} | <strong>Source:</strong> {hit.source}
                  </p>
                  <p className="text-gray-300">{hit.content?.slice(0, 200)}...</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
