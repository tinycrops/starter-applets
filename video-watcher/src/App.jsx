import React, { useState, useEffect } from 'react';
import { getStatus, getVideos, getMemoryState, queryMemory } from './api';

function App() {
  const [status, setStatus] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [memoryState, setMemoryState] = useState(null);
  const [activeTab, setActiveTab] = useState('videos');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResponse, setMemoryResponse] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

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

  // Render a video card
  const VideoCard = ({ video }) => {
    const { id, videoFileName, processedAt, analysis } = video;
    
    return (
      <div className="card">
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
      </div>
    );
  };

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
      
      {activeTab === 'videos' && (
        <div>
          <h2>Processed Videos ({videos.length})</h2>
          
          {videos.length === 0 ? (
            <div className="card">
              <p>No videos have been processed yet. Record a video in OBS and save it to the watched folder.</p>
            </div>
          ) : (
            <div className="video-list">
              {videos.map(video => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
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