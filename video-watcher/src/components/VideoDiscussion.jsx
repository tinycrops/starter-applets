import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { continueDiscussion, sendChatMessage } from '../api';

function VideoDiscussion() {
  const { filename } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('query') || '';
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [discussionData, setDiscussionData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Ref for auto-scrolling messages
  const messagesEndRef = useRef(null);
  
  // Function to scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Auto-scroll when messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  useEffect(() => {
    const loadDiscussion = async () => {
      if (!filename || !query) {
        setError('Missing required parameters');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const data = await continueDiscussion(query, filename);
        setDiscussionData(data);
        
        // Initialize with system message and original query
        setMessages([
          {
            type: 'system',
            content: `Discussion about: "${query}" with video "${data.videoContext.videoFileName}"`
          },
          {
            type: 'user',
            content: query
          }
        ]);
        
        // Make initial assistant response using the chat API
        setIsProcessing(true);
        try {
          const initialResponse = await sendChatMessage(
            query,
            [{ type: 'user', content: query }],
            data.videoContext,
            data.memoryContext
          );
          
          setMessages(prev => [
            ...prev,
            {
              type: 'assistant',
              content: initialResponse.response
            }
          ]);
        } catch (chatError) {
          console.error('Error getting initial response:', chatError);
          setMessages(prev => [
            ...prev,
            {
              type: 'assistant',
              content: 'I apologize, but I encountered an error while preparing my response. Please try again or ask a different question.'
            }
          ]);
        } finally {
          setIsProcessing(false);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error loading discussion:', err);
        setError(err.message || 'Failed to load discussion data');
      } finally {
        setLoading(false);
      }
    };
    
    loadDiscussion();
  }, [filename, query]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentMessage.trim() || isProcessing) return;
    
    // Add user message
    const updatedMessages = [
      ...messages,
      { type: 'user', content: currentMessage }
    ];
    
    setMessages(updatedMessages);
    setCurrentMessage('');
    setIsProcessing(true);
    
    try {
      // Send message to the API for processing
      // Filter out system messages and only send user/assistant messages
      const chatHistory = updatedMessages.filter(msg => msg.type === 'user' || msg.type === 'assistant');
      
      const response = await sendChatMessage(
        currentMessage,
        chatHistory,
        discussionData.videoContext,
        discussionData.memoryContext
      );
      
      // Add assistant response
      setMessages(prev => [
        ...prev,
        { 
          type: 'assistant', 
          content: response.response
        }
      ]);
    } catch (error) {
      console.error('Error sending chat message:', error);
      
      // Add error message
      setMessages(prev => [
        ...prev,
        { 
          type: 'assistant', 
          content: 'I apologize, but I encountered an error while processing your message. Please try again.'
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const getVideoUrl = () => {
    if (!discussionData || !discussionData.videoContext.videoFileName) return null;
    
    // In a real implementation, you would have a proper URL to the video file
    // This is a placeholder that assumes videos are served from a /videos endpoint
    return `/videos/${encodeURIComponent(discussionData.videoContext.videoFileName)}`;
  };
  
  const goBack = () => {
    navigate('/');
  };
  
  if (loading) {
    return (
      <div className="container">
        <h1>Loading Discussion...</h1>
        <div className="loading-spinner"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container">
        <h1>Error Loading Discussion</h1>
        <div className="card" style={{ backgroundColor: '#442222' }}>
          <p>{error}</p>
          <button onClick={goBack}>Return to Home</button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container discussion-page">
      <header className="discussion-header">
        <button className="back-button" onClick={goBack}>&larr; Back to Search</button>
        <h1>Video Discussion</h1>
      </header>
      
      <div className="discussion-layout">
        <section className="video-section">
          <div className="video-container">
            <h2>{discussionData.videoContext.videoFileName}</h2>
            <p><strong>Processed:</strong> {new Date(discussionData.videoContext.processedAt).toLocaleString()}</p>
            
            {/* Video element - in a real implementation, you would have proper video URLs */}
            <div className="video-player">
              {getVideoUrl() ? (
                <video 
                  controls 
                  width="100%" 
                  src={getVideoUrl()}
                  poster="/video-placeholder.jpg"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="video-placeholder">
                  <p>Video preview not available</p>
                  <p className="small">The actual video file can be found at: {discussionData.videoContext.videoFileName}</p>
                </div>
              )}
            </div>
            
            <div className="video-info">
              <h3>Video Information</h3>
              {discussionData.videoContext.summary && (
                <div className="info-section">
                  <h4>Summary</h4>
                  <p>{discussionData.videoContext.summary}</p>
                </div>
              )}
              
              {discussionData.videoContext.topics && discussionData.videoContext.topics.length > 0 && (
                <div className="info-section">
                  <h4>Topics</h4>
                  <ul>
                    {discussionData.videoContext.topics.map((topic, idx) => (
                      <li key={idx}>{topic}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {discussionData.videoContext.insights && discussionData.videoContext.insights.length > 0 && (
                <div className="info-section">
                  <h4>Insights</h4>
                  <ul>
                    {discussionData.videoContext.insights.map((insight, idx) => (
                      <li key={idx}>
                        {insight.insight}
                        {insight.basis && <span className="basis">Based on: {insight.basis}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
        
        <section className="chat-section">
          <div className="messages-container">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.type}`}>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            {isProcessing && (
              <div className="message assistant">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <form onSubmit={handleSubmit} className="discussion-form">
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder="Continue the discussion..."
              className="discussion-input"
              disabled={isProcessing}
            />
            <button 
              type="submit" 
              className="discussion-submit"
              disabled={isProcessing || !currentMessage.trim()}
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default VideoDiscussion; 