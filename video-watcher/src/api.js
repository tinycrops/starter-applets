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