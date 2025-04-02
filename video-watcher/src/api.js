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