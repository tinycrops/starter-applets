import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { exec } from 'child_process';

// Initialize Gemini AI - using the same approach as video folder project
const key = process.env.VITE_GEMINI_API_KEY;
const fileManager = new GoogleAIFileManager(key);
const genAI = new GoogleGenerativeAI(key);

// Export genAI for use in other modules
export { genAI };

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
  "summary": "Detailed summary of the video",
  "screenContent": "Description of what's visible on the screen",
  "actions": "Description of actions performed",
  "topics": ["topic1", "topic2"],
  "transcript": "Transcription of speech",
  "tags": ["tag1", "tag2"]
}
`;

// Prompt template for insight inference directly from video
const INFERENCE_PROMPT = `
Analyze this screen recording to identify both explicit statements and infer the user's underlying mental state, intentions, and tacit knowledge. Go beyond the literal content to provide deeper insights.

Focus on:
1.  **Explicit Directives & Preferences:** Commands (implicit/explicit) for an AI, stated preferences, goals, or expressed frustrations.
2.  **Inferred User State & Intentions:** Interpret the user's actions and words to deduce:
    *   **Mental/Emotional State:** Signs of confusion, focus, frustration, satisfaction, contemplation, cognitive load, etc. (e.g., "User seems hesitant", "User sounds frustrated with the loading time").
    *   **Underlying Goals/Motivations:** What is the user *really* trying to achieve, even if not stated? (e.g., "Appears to be learning [Software X]", "Trying to optimize their workflow for task Y").
    *   **Unspoken Needs/Desires:** What might the user want or need based on their actions? (e.g., "User seems to be looking for a shortcut", "Might benefit from an explanation of [Concept Z]").
    *   **Observed Workflow/Habits:** Patterns in how the user interacts with the system or performs tasks (e.g., "Prefers using keyboard shortcuts", "Methodically checks settings before proceeding", "Often multi-tasks between App A and App B").
    *   **Potential Knowledge Gaps:** Areas where the user seems uncertain or lacks information (e.g., "Unsure how feature X works", "Searching for basic commands").
    *   **Implied Opinions/Critiques:** Subtle judgments about tools, processes, or outcomes, even if not voiced directly (e.g., "Seems unimpressed by the tool's speed", "Appears to implicitly prefer Tool A over Tool B for this task").
    *   **Withheld Recommendations/Ideas:** Potential improvements or alternative approaches the user might be considering but not stating (e.g., "Might be thinking about automating this step", "Considering a different tool for the next step").

Guidelines for analysis:
1. Focus on making reasonable inferences based on evidence in the video
2. Include a basis or reasoning for each inference to explain your thinking
3. Rate your certainty for each insight (high/medium/low)
4. Be specific and actionable rather than vague
5. Look for patterns in the user's behavior, language, and screen interactions

Structure the response as a JSON object:
{
  "explicit_directives": [
    { 
      "command": "The specific instruction or command detected", 
      "target": "What/who the command is directed to", 
      "parameters": {"param1": "value1"}, 
      "certainty": "high/medium/low", 
      "context": "Description of when/how this directive was given" 
    }
  ],
  "explicit_statements": [
    { 
      "statement": "The explicit statement made by the user", 
      "type": "preference/goal/frustration/interest/question", 
      "certainty": "high/medium/low", 
      "context": "Description of when/how this statement was made" 
    }
  ],
  "inferred_insights": [
    { 
      "insight": "The inferred insight about the user's state, goals, needs, etc.", 
      "type": "mental_state/goal/need/workflow/knowledge_gap/opinion/withheld_idea", 
      "basis": "The specific observation or pattern that led to this inference", 
      "certainty": "high/medium/low" 
    }
  ],
  "relevant_context_summary": "Brief summary of the video focusing on aspects most relevant to understanding the user's current state and goals."
}

If no significant explicit items or inferences can be made, return empty arrays for the respective fields but provide the context summary. Be specific in the 'basis' field for inferences.
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
    let retryCount = 0;
    const baseWaitTime = 2000; // Start with 2 second wait
    
    while (!isReady) {
      const progress = await checkProgress(uploadResult.name);
      console.log(`File status: ${JSON.stringify(progress)}`);
      
      if (progress.state === 'ACTIVE') {
        isReady = true;
        break;
      }
      
      // Calculate wait time with exponential backoff, capped at 30 seconds
      const waitTime = Math.min(baseWaitTime * Math.pow(1.5, retryCount), 30000);
      console.log(`File not ready, waiting ${waitTime/1000}s before retry...`);
      await wait(waitTime);
      retryCount++;
    }
    
    // Create request for Gemini for basic video analysis
    const req = [
      { text: customPrompt },
      {
        fileData: {
          mimeType: uploadResult.mimeType,
          fileUri: uploadResult.uri
        }
      }
    ];
    
    console.log(`Sending to Gemini (model: ${DEFAULT_MODEL}) for basic analysis...`);
    const result = await genAI.getGenerativeModel({ model: DEFAULT_MODEL }).generateContent(req);
    
    console.log('Response received from Gemini for basic analysis');
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
      
      // Make a second API call for deeper insights using the same video file
      console.log('Making second API call for deeper inference analysis...');
      const inferenceResult = await analyzeVideoForInsights(uploadResult);
      
      // Combine both results
      const enhancedResponse = {
        ...parsedResponse,
        ...inferenceResult
      };
      
      return {
        ...enhancedResponse,
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
 * Analyzes a video to infer explicit directives and deeper insights
 * @param {Object} uploadedFile - The uploaded file object from Gemini API
 * @returns {Promise<Object>} - Analysis results with explicit and inferred information
 */
async function analyzeVideoForInsights(uploadedFile) {
  try {
    console.log('Analyzing video for explicit directives and inferred insights...');
    
    // Create request for Gemini with inference prompt
    const req = [
      { text: INFERENCE_PROMPT },
      {
        fileData: {
          mimeType: uploadedFile.mimeType,
          fileUri: uploadedFile.uri
        }
      }
    ];
    
    // Use the same model for both analyses
    const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });
    
    // Generate inference analysis
    console.log(`Sending to Gemini (model: ${DEFAULT_MODEL}) for inference analysis...`);
    const result = await model.generateContent(req);
    const responseText = result.response.text();
    
    try {
      // Try to parse the JSON response (handling both raw JSON and markdown-wrapped JSON)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1];
      }
      
      const inferenceResult = JSON.parse(jsonStr);
      console.log('Successfully parsed inference analysis');
      
      return inferenceResult;
    } catch (parseError) {
      console.error('Error parsing inference analysis:', parseError);
      console.log('Raw inference response:', responseText);
      
      // Return default structure with empty arrays if parsing fails
      return {
        explicit_directives: [],
        explicit_statements: [],
        inferred_insights: [],
        relevant_context_summary: "Error parsing inference analysis"
      };
    }
  } catch (error) {
    console.error('Error analyzing video for insights:', error);
    
    // Return default structure with empty arrays if analysis fails
    return {
      explicit_directives: [],
      explicit_statements: [],
      inferred_insights: [],
      relevant_context_summary: `Error analyzing video: ${error.message}`
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
      analysis: analysisResult,
      // Include inferred insights in the dataset entry if available
      inferred_insights: analysisResult.inferred_insights || []
    };
    
    // Save to the dataset folder
    const jsonFileName = `${path.parse(videoFileName).name}.json`;
    const jsonPath = path.join(datasetFolder, jsonFileName);
    
    await fs.writeFile(
      jsonPath, 
      JSON.stringify(datasetEntry, null, 2), 
      'utf-8'
    );
    
    return {
      success: true,
      datasetPath: jsonPath
    };
  } catch (error) {
    console.error('Error saving to dataset:', error);
    throw new Error(`Failed to save to dataset: ${error.message}`);
  }
}

/**
 * Generate a thumbnail at 5 seconds into the video using ffmpeg
 * @param {string} videoPath - Path to the video file
 * @param {string} thumbnailPath - Path to save the generated thumbnail image
 * @returns {Promise<void>} Resolves when the thumbnail is created
 */
export function generateThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    // -ss 5 seeks to 5 seconds, -vframes 1 outputs one frame
    const cmd = `ffmpeg -y -ss 5 -i "${videoPath}" -vframes 1 -vf "scale=320:-1" "${thumbnailPath}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('Error generating thumbnail:', error, stderr);
        reject(error);
      } else {
        resolve();
      }
    });
  });
} 