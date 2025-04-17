import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStatus, getVideos, getMemoryState, queryMemory, searchVideos } from './api';

function App() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [memoryState, setMemoryState] = useState(null);
  const [activeTab, setActiveTab] = useState('videos');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResponse, setMemoryResponse] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for most recent, 'asc' for oldest
  const VIDEOS_PER_PAGE = 12;

  // Fetch server status and videos on component mount
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const statusData = await getStatus();
        setStatus(statusData);
        
        const videosData = await getVideos();
        setVideos(videosData);
        
        // Fetch memory state
        if (activeTab === 'memory') {
          const memoryData = await getMemoryState();
          setMemoryState(memoryData);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please check if the server is running.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Poll for updates every 10 seconds
    const intervalId = setInterval(fetchData, 10000);
    
    return () => clearInterval(intervalId);
  }, [activeTab]);

  // Handle memory query submission
  const handleMemoryQuery = async (e) => {
    e.preventDefault();
    
    if (!memoryQuery.trim()) return;
    
    try {
      setQueryLoading(true);
      const result = await queryMemory(memoryQuery);
      setMemoryResponse(result.response);
    } catch (err) {
      console.error('Error querying memory:', err);
      setMemoryResponse('Sorry, there was an error processing your query.');
    } finally {
      setQueryLoading(false);
    }
  };

  // Handle search form submission
  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setSearchLoading(true);
    setSearchResults([]);
    setSearchError(null);
    
    try {
      const data = await searchVideos(searchQuery);
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchError(err.message || 'An unknown error occurred during search.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle navigation to discussion page
  const handleNavigateToDiscussion = (filename) => {
    navigate(`/discuss/${filename}?query=${encodeURIComponent(searchQuery)}`);
  };

  // Handle direct navigation to discussion from video card
  const handleDirectVideoDiscussion = (filename, videoFileName) => {
    // Create a default query based on the video name
    const defaultQuery = `Tell me about this video: ${videoFileName}`;
    navigate(`/discuss/${filename}?query=${encodeURIComponent(defaultQuery)}`);
  };

  // Render a video card
  const VideoCard = ({ video }) => {
    const { id, videoFileName, processedAt, analysis } = video;
    // Construct the video URL (same as used in VideoDiscussion)
    const videoUrl = `/videos/${encodeURIComponent(videoFileName)}`;
    // Use the generated thumbnail as the poster
    const thumbName = videoFileName.replace(/\.[^/.]+$/, '.jpg');
    const posterUrl = `/thumbnails/${encodeURIComponent(thumbName)}`;
    const fallbackPoster = "/video-placeholder.jpg";

    return (
      <div className="card">
        <div className="video-thumbnail" style={{ width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
          <video
            src={videoUrl}
            poster={posterUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            controls={false}
            tabIndex={-1}
            preload="metadata"
            onError={e => { e.target.poster = fallbackPoster; }}
          />
        </div>
        <h3>{videoFileName}</h3>
        <p><strong>Processed:</strong> {new Date(processedAt).toLocaleString()}</p>
        
        {analysis && (
          <div>
            <h4>Analysis</h4>
            {analysis.summary && (
              <p><strong>Summary:</strong> {analysis.summary}</p>
            )}
            
            {analysis.topics && analysis.topics.length > 0 && (
              <div>
                <strong>Topics:</strong>
                <ul>
                  {analysis.topics.map((topic, index) => (
                    <li key={index}>{topic}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {analysis.tags && analysis.tags.length > 0 && (
              <div>
                <strong>Tags:</strong>{' '}
                {analysis.tags.map(tag => (
                  <span key={tag} style={{ 
                    display: 'inline-block',
                    margin: '0 4px 4px 0',
                    padding: '2px 8px',
                    backgroundColor: '#444',
                    borderRadius: '12px',
                    fontSize: '0.8rem'
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        
        <button 
          className="continue-discussion-btn"
          onClick={() => handleDirectVideoDiscussion(videoFileName.replace(/\.[^/.]+$/, '.json'), videoFileName)}
        >
          Chat with Video
        </button>
      </div>
    );
  };

  // Render a search result card
  const SearchResultCard = ({ result }) => {
    return (
      <div className="card result-card">
        <h3>{result.videoFileName}</h3>
        <p><strong>Processed:</strong> {new Date(result.processedAt).toLocaleString()}</p>
        <p><strong>Relevance Score:</strong> {result.score.toFixed(2)}</p>
        <p><strong>Justification:</strong> {result.justification}</p>
        <button 
          className="continue-discussion-btn"
          onClick={() => handleNavigateToDiscussion(result.filename)}
        >
          Continue Discussion
        </button>
      </div>
    );
  };

  // Sort and paginate videos
  const sortedVideos = [...videos].sort((a, b) => {
    if (sortOrder === 'desc') {
      return new Date(b.processedAt) - new Date(a.processedAt);
    } else {
      return new Date(a.processedAt) - new Date(b.processedAt);
    }
  });
  const totalPages = Math.ceil(sortedVideos.length / VIDEOS_PER_PAGE);
  const paginatedVideos = sortedVideos.slice((currentPage - 1) * VIDEOS_PER_PAGE, currentPage * VIDEOS_PER_PAGE);

  if (loading && !status) {
    return <div className="container">Loading...</div>;
  }

  if (error) {
    return (
      <div className="container">
        <h1>Video Watcher</h1>
        <div className="card" style={{ backgroundColor: '#442222' }}>
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Video Watcher</h1>
      
      {status && (
        <div className="card">
          <h2>Server Status</h2>
          <p>
            Status: <span className={`status status-active`}>{status.status}</span>
          </p>
          <p><strong>Watching folder:</strong> {status.watchFolder}</p>
          <p><strong>Dataset folder:</strong> {status.datasetFolder}</p>
        </div>
      )}
      
      {/* Search card - place it before the tabs */}
      <div className="card search-card">
        <h3>Search Video Journals</h3>
        <form onSubmit={handleSearchSubmit} className="search-form">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask about your past recordings..."
            className="search-input"
            disabled={searchLoading}
          />
          <button
            type="submit"
            disabled={searchLoading || !searchQuery.trim()}
            className="search-submit"
          >
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {searchError && <p className="error-text">{searchError}</p>}
      </div>
      
      {/* Display search results if available */}
      {searchResults.length > 0 && (
        <div className="search-results">
          <h2>Search Results ({searchResults.length})</h2>
          <div className="video-list">
            {searchResults.map((result, index) => (
              <SearchResultCard key={index} result={result} />
            ))}
          </div>
        </div>
      )}
      
      {/* Show "no results" message if search was performed but returned nothing */}
      {!searchLoading && searchResults.length === 0 && searchQuery && searchError === null && (
        <div className="card"><p>No relevant videos found for your query.</p></div>
      )}
      
      <div className="tabs">
        <button 
          className={activeTab === 'videos' ? 'active' : ''} 
          onClick={() => setActiveTab('videos')}
        >
          Videos
        </button>
        <button 
          className={activeTab === 'memory' ? 'active' : ''} 
          onClick={() => setActiveTab('memory')}
        >
          Memory Portal
        </button>
      </div>
      
      {/* Only show regular video list if no search results are displayed */}
      {activeTab === 'videos' && searchResults.length === 0 && (
        <div>
          <h2>Processed Videos ({videos.length})</h2>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <label htmlFor="sortOrder" style={{ marginRight: 8 }}>Sort by:</label>
            <select id="sortOrder" value={sortOrder} onChange={e => { setSortOrder(e.target.value); setCurrentPage(1); }}>
              <option value="desc">Most Recent</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
          {videos.length === 0 ? (
            <div className="card">
              <p>No videos have been processed yet. Record a video in OBS and save it to the watched folder.</p>
            </div>
          ) : (
            <>
              <div className="video-list">
                {paginatedVideos.map(video => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
                <span style={{ margin: '0 12px' }}>Page {currentPage} of {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
              </div>
            </>
          )}
        </div>
      )}
      
      {activeTab === 'memory' && (
        <div className="memory-portal">
          <h2>Memory Portal</h2>
          
          <div className="card">
            <h3>Query Memory System</h3>
            <p>Ask questions about the memory system or the insights it has gathered.</p>
            
            <form onSubmit={handleMemoryQuery} className="memory-form">
              <input
                type="text"
                value={memoryQuery}
                onChange={(e) => setMemoryQuery(e.target.value)}
                placeholder="Ask about what the system remembers..."
                className="memory-input"
              />
              <button 
                type="submit" 
                disabled={queryLoading}
                className="memory-submit"
              >
                {queryLoading ? 'Thinking...' : 'Ask'}
              </button>
            </form>
            
            {memoryResponse && (
              <div className="memory-response">
                <h4>Response:</h4>
                <p>{memoryResponse}</p>
              </div>
            )}
          </div>
          
          <div className="memory-state">
            <h3>Memory State</h3>
            
            {memoryState ? (
              <div className="memory-cards">
                <div className="card">
                  <h4>Working Memory</h4>
                  <details>
                    <summary>Established Facts ({memoryState.workingMemory?.established_facts?.length || 0})</summary>
                    <ul>
                      {memoryState.workingMemory?.established_facts?.map((fact, idx) => (
                        <li key={idx}>{fact}</li>
                      )) || <li>No established facts yet</li>}
                    </ul>
                  </details>
                  <details>
                    <summary>Corroborated Hypotheses ({memoryState.workingMemory?.corroborated_hypotheses?.length || 0})</summary>
                    <ul>
                      {memoryState.workingMemory?.corroborated_hypotheses?.map((hyp, idx) => (
                        <li key={idx}>{hyp}</li>
                      )) || <li>No corroborated hypotheses yet</li>}
                    </ul>
                  </details>
                  <details>
                    <summary>Untested Hypotheses ({memoryState.workingMemory?.untested_hypotheses?.length || 0})</summary>
                    <ul>
                      {memoryState.workingMemory?.untested_hypotheses?.map((hyp, idx) => (
                        <li key={idx}>{hyp}</li>
                      )) || <li>No untested hypotheses yet</li>}
                    </ul>
                  </details>
                </div>
                
                <div className="card">
                  <h4>Long-Term Memory</h4>
                  {memoryState.longTermMemory?.profile_summary && (
                    <div>
                      <strong>Profile Summary:</strong>
                      <p>{memoryState.longTermMemory.profile_summary}</p>
                    </div>
                  )}
                  <details>
                    <summary>Skills & Knowledge</summary>
                    <pre className="memory-json">
                      {JSON.stringify(memoryState.longTermMemory?.skills_and_knowledge || {}, null, 2)}
                    </pre>
                  </details>
                  <details>
                    <summary>Preferences & Habits</summary>
                    <pre className="memory-json">
                      {JSON.stringify(memoryState.longTermMemory?.preferences_and_habits || {}, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            ) : (
              <div className="card">
                <p>Loading memory state...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 