import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { extractCommandsPreferences, addEventToStm } from './memory-manager.mjs';

// Initialize Gemini AI - using the same approach as video folder project
const key = process.env.VITE_GEMINI_API_KEY;
const fileManager = new GoogleAIFileManager(key);
const genAI = new GoogleGenerativeAI(key);

// Default model to use if not specified
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Prompt template for video analysis
const DEFAULT_PROMPT = `
Analyze this video recording and provide a detailed description of:
1. The content visible on the screen
2. Any actions or activities being performed
3. Key topics discussed or shown
4. Transcribe any spoken content

Structure your response as a JSON object with the following fields:
{
  "summary": "Detailed
  edg summary of the video",
  "screenContent": "Description of what's visible on the screen",
  "actions": "Description of actions performed",
  "topics": ["topic1", "topic2"],
  "transcript": "Transcription of speech",
  "tags": ["tag1", "tag2"]
}
`;

/**
 * Wait for a specified time
 * @param {number} ms - Time to wait in milliseconds
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Checks the progress of file processing
 * @param {string} fileId - ID of the uploaded file
 * @returns {Promise<Object>} - File status information
 */
async function checkProgress(fileId) {
  try {
    const result = await fileManager.getFile(fileId);
    return result;
  } catch (error) {
    console.error('Error checking file progress:', error);
    return { error };
  }
}

/**
 * Uploads a video file to Google AI for processing
 * @param {string} filePath - Path to the video file
 * @returns {Promise<Object>} - Upload result
 */
async function uploadVideoFile(filePath) {
  try {
    const fileName = path.basename(filePath);
    const fileStats = await fs.stat(filePath);
    console.log(`Uploading ${fileName} (${fileStats.size} bytes)...`);
    
    const uploadResult = await fileManager.uploadFile(filePath, {
      displayName: fileName,
      mimeType: 'video/mp4'
    });
    
    console.log(`Upload successful: ${uploadResult.file.name}`);
    return uploadResult.file;
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
}

/**
 * Analyzes a video using Google Gemini
 * @param {string} filePath - Path to the video file
 * @param {string} customPrompt - Optional custom prompt
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeVideo(filePath, customPrompt = DEFAULT_PROMPT) {
  try {
    // Upload the video file
    const uploadResult = await uploadVideoFile(filePath);
    
    // Wait for file processing (checking progress)
    console.log(`Checking progress for file ${uploadResult.name}...`);
    let isReady = false;
    
    // Try up to 6 times, with increasing delays
    for (let i = 0; i < 6; i++) {
      const progress = await checkProgress(uploadResult.name);
      console.log(`File status: ${JSON.stringify(progress)}`);
      
      if (progress.state === 'ACTIVE') {
        isReady = true;
        break;
      }
      
      // Wait with increasing delay (2s, 3s, 4s, 5s, 6s)
      const waitTime = (i + 2) * 1000;
      console.log(`File not ready, waiting ${waitTime/1000}s before retry...`);
      await wait(waitTime);
    }
    
    if (!isReady) {
      throw new Error('File never reached ACTIVE state after multiple attempts');
    }
    
    // Create request for Gemini
    const req = [
      { text: customPrompt },
      {
        fileData: {
          mimeType: uploadResult.mimeType,
          fileUri: uploadResult.uri
        }
      }
    ];
    
    console.log(`Sending to Gemini (model: ${DEFAULT_MODEL}) for analysis...`);
    const result = await genAI.getGenerativeModel({ model: DEFAULT_MODEL }).generateContent(req);
    
    console.log('Response received from Gemini');
    const responseText = result.response.text();
    
    // Try to parse the JSON response
    try {
      // The response might have markdown formatting with JSON inside ```json blocks
      let jsonStr = responseText;
      
      // Check if response is wrapped in markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1];
      }
      
      const parsedResponse = JSON.parse(jsonStr);

      // NEW: If we have a transcript, extract commands and preferences
      if (parsedResponse.transcript && parsedResponse.transcript.trim().length > 0) {
        try {
          console.log("Transcript found, extracting commands and preferences...");
          const commandsPreferences = await extractCommandsPreferences(parsedResponse.transcript);
          
          // Add to the response
          parsedResponse.commands_preferences = commandsPreferences;
          
          // Also add to short-term memory
          await addEventToStm({
            type: 'video_transcript_analysis',
            data: {
              videoFileName: path.basename(filePath),
              transcript: parsedResponse.transcript,
              commandsPreferences: commandsPreferences
            }
          });
          
          console.log("Commands and preferences extracted and added to memory.");
        } catch (extractError) {
          console.error("Error extracting commands/preferences:", extractError);
          // Continue with the rest of the function even if this part fails
        }
      } else {
        console.log("No transcript found or transcript empty, skipping command/preference extraction.");
      }
      
      return {
        ...parsedResponse,
        text: responseText,
        candidates: result.response.candidates,
        feedback: result.response.promptFeedback
      };
    } catch (parseError) {
      console.warn('Could not parse response as JSON, returning raw text');
      return {
        rawResponse: responseText,
        text: responseText,
        candidates: result.response.candidates,
        feedback: result.response.promptFeedback,
        error: 'Response could not be parsed as JSON'
      };
    }
  } catch (error) {
    console.error('Error analyzing video:', error);
    
    // Return a simplified response with the error for testing
    return {
      error: error.message,
      summary: "Error processing video with Gemini",
      screenContent: "Could not analyze screen content due to API error",
      actions: "No actions detected due to processing error",
      topics: ["error", "processing failed"],
      transcript: "Transcript unavailable due to processing error",
      tags: ["error", "api-failure", "test-data"]
    };
  }
}

/**
 * Saves analysis results to the dataset
 * @param {string} videoPath - Path to the original video
 * @param {Object} analysisResult - Analysis results from Gemini
 * @param {string} datasetFolder - Path to the dataset folder
 */
export async function saveToDataset(videoPath, analysisResult, datasetFolder) {
  try {
    const videoFileName = path.basename(videoPath);
    const timestamp = new Date().toISOString();
    
    // Create a dataset entry
    const datasetEntry = {
      id: `video_${Date.now()}`,
      videoFileName: videoFileName,
      videoPath: videoPath,
      processedAt: timestamp,
      analysis: analysisResult
    };
    
    // Save to the dataset folder
    const jsonFileName = `${path.parse(videoFileName).name}.json`;
    const jsonPath = path.join(datasetFolder, jsonFileName);
    
    await fs.writeFile(
      jsonPath, 
      JSON.stringify(datasetEntry, null, 2), 
      'utf-8'
    );
    
    // NEW: Add the analysis completion event to short-term memory
    try {
      await addEventToStm({
        type: 'video_analysis_complete',
        data: {
          videoFileName: videoFileName,
          analysisId: datasetEntry.id,
          timestamp: timestamp,
          summary: analysisResult.summary || "No summary available",
          topics: analysisResult.topics || []
        }
      });
    } catch (memoryError) {
      console.error("Error adding analysis to memory (non-critical):", memoryError);
      // Continue even if memory update fails
    }
    
    return {
      success: true,
      datasetPath: jsonPath
    };
  } catch (error) {
    console.error('Error saving to dataset:', error);
    throw new Error(`Failed to save to dataset: ${error.message}`);
  }
} 