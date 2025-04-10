/**
 * API client for the Video Watcher application
 */

/**
 * Get the server status
 * @returns {Promise<Object>} Status object
 */
export async function getStatus() {
  const response = await fetch('/api/status');
  if (!response.ok) {
    throw new Error('Failed to fetch status');
  }
  return response.json();
}

/**
 * Get all processed videos
 * @returns {Promise<Array>} Array of video objects
 */
export async function getVideos() {
  const response = await fetch('/api/videos');
  if (!response.ok) {
    throw new Error('Failed to fetch videos');
  }
  const data = await response.json();
  return data.videos || [];
}

/**
 * Get the current memory state
 * @returns {Promise<Object>} Memory state object
 */
export async function getMemoryState() {
  const response = await fetch('/api/memory');
  if (!response.ok) {
    throw new Error('Failed to fetch memory state');
  }
  return response.json();
}

/**
 * Query the memory system conversationally
 * @param {string} query - The user's query about the memory system
 * @returns {Promise<Object>} Response from the memory system
 */
export async function queryMemory(query) {
  const response = await fetch('/api/memory/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to query memory system');
  }
  
  return response.json();
}

/**
 * Search through video analyses based on a natural language query
 * @param {string} query - The search query
 * @returns {Promise<Array>} Array of relevant video objects
 */
export async function searchVideos(query) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Search request failed' }));
    throw new Error(errorData.error || 'Failed to perform search');
  }
  
  return response.json(); // Should return { results: [...] }
}

/**
 * Continue discussion with a specific video, including memory context
 * @param {string} query - The original search query
 * @param {string} filename - The filename of the video to continue discussion with
 * @returns {Promise<Object>} Video and memory context for continuation
 */
export async function continueDiscussion(query, filename) {
  const response = await fetch('/api/videos/continue-discussion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, filename }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Continue discussion request failed' }));
    throw new Error(errorData.error || 'Failed to continue discussion with video');
  }
  
  return response.json();
}

/**
 * Send a chat message in the video discussion
 * @param {string} message - The user's message
 * @param {Array} history - Previous messages in the conversation
 * @param {Object} videoContext - Context about the video
 * @param {Object} memoryContext - Memory state context
 * @returns {Promise<Object>} Response from the AI
 */
export async function sendChatMessage(message, history, videoContext, memoryContext) {
  const response = await fetch('/api/videos/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      history,
      videoContext,
      memoryContext
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Chat request failed' }));
    throw new Error(errorData.error || 'Failed to process chat message');
  }
  
  return response.json();
} 