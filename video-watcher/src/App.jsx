import React, { useState, useEffect } from 'react';
import { getStatus, getVideos } from './api';

function App() {
  const [status, setStatus] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch server status and videos on component mount
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const statusData = await getStatus();
        setStatus(statusData);
        
        const videosData = await getVideos();
        setVideos(videosData);
        
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
  }, []);

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
    </div>
  );
}

export default App; 