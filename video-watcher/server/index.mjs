import express from 'express';
import ViteExpress from 'vite-express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import { analyzeVideo, saveToDataset, genAI, generateThumbnail } from './video-processor.mjs';
import memoryManager from './memory-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const WATCH_FOLDER = process.env.VIDEO_WATCH_FOLDER || 'Q:\\';
const DATASET_FOLDER = process.env.VIDEO_DATASET_FOLDER || path.join(process.env.HOME || process.env.USERPROFILE, 'video-dataset');

const THUMBNAIL_FOLDER = path.join(DATASET_FOLDER, 'thumbnails');

// Keep track of processed videos to avoid reprocessing
const processedVideos = new Set();

// Track files that are being processed to avoid duplicate processing
const processingFiles = new Set();

// Function to check if file size has stabilized (recording has stopped)
async function isFileStable(filePath) {
  try {
    // Get initial file size
    const initialStats = await fs.stat(filePath);
    const initialSize = initialStats.size;
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get new file size
    const newStats = await fs.stat(filePath);
    const newSize = newStats.size;
    
    // If sizes match, file is no longer being written to
    const isStable = initialSize === newSize;
    console.log(`File ${path.basename(filePath)} size check: ${initialSize} -> ${newSize}, stable: ${isStable}`);
    return isStable;
  } catch (error) {
    console.error(`Error checking file stability: ${error.message}`);
    return false;
  }
}

// Load already processed videos
async function loadProcessedVideos() {
  try {
    // Check if dataset folder exists
    try {
      await fs.access(DATASET_FOLDER);
    } catch (error) {
      return; // If folder doesn't exist yet, there are no processed videos
    }
    
    // Get all json files from dataset folder
    const files = await fs.readdir(DATASET_FOLDER);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = await fs.readFile(path.join(DATASET_FOLDER, file), 'utf-8');
          const videoData = JSON.parse(data);
          
          // Add the video filename to the processed set
          if (videoData && videoData.videoFileName) {
            processedVideos.add(videoData.videoFileName);
            console.log(`Marked as already processed: ${videoData.videoFileName}`);
          }
        } catch (error) {
          console.error(`Error reading processed video data: ${file}`, error);
        }
      }
    }
    
    console.log(`Loaded ${processedVideos.size} already processed videos`);
  } catch (error) {
    console.error('Error loading processed videos:', error);
  }
}

// Ensure dataset directory exists
async function ensureDirectoryExists(directory) {
  try {
    await fs.mkdir(directory, { recursive: true });
    console.log(`Created directory: ${directory}`);
  } catch (error) {
    console.error(`Error creating directory: ${directory}`, error);
  }
}

// Ensure thumbnail folder exists
async function ensureThumbnailFolder() {
  await ensureDirectoryExists(THUMBNAIL_FOLDER);
}

// Check all videos for missing thumbnails and generate them if needed
async function generateMissingThumbnails() {
  await ensureThumbnailFolder();
  const files = await fs.readdir(DATASET_FOLDER);
  const videoFiles = files.filter(f => f.endsWith('.json'));
  for (const jsonFile of videoFiles) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(DATASET_FOLDER, jsonFile), 'utf-8'));
      const videoFileName = data.videoFileName;
      if (!videoFileName) continue;
      const videoPath = path.join(WATCH_FOLDER, videoFileName);
      const thumbName = path.parse(videoFileName).name + '.jpg';
      const thumbPath = path.join(THUMBNAIL_FOLDER, thumbName);
      try {
        await fs.access(thumbPath);
        // Thumbnail exists
      } catch {
        // Thumbnail missing, try to generate
        try {
          await generateThumbnail(videoPath, thumbPath);
          console.log(`Generated missing thumbnail for ${videoFileName}`);
        } catch (err) {
          console.warn(`Could not generate thumbnail for ${videoFileName}:`, err.message);
        }
      }
    } catch (err) {
      console.warn(`Could not process dataset entry ${jsonFile}:`, err.message);
    }
  }
}

// Set up Express
const app = express();
app.use(express.json());

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'active',
    watchFolder: WATCH_FOLDER,
    datasetFolder: DATASET_FOLDER,
    processedCount: processedVideos.size
  });
});

// Add memory API endpoint
app.get('/api/memory', (req, res) => {
  try {
    const memoryState = memoryManager.getMemoryState();
    res.json({
      shortTermMemory: memoryState.shortTermMemory,
      longTermMemory: memoryState.longTermMemory,
      workingMemory: memoryState.workingMemory
    });
  } catch (error) {
    console.error('Error fetching memory state:', error);
    res.status(500).json({ error: 'Failed to retrieve memory state' });
  }
});

// Endpoint for conversational memory interface
app.post('/api/memory/query', async (req, res) => {
  try {
    if (!req.body.query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const response = await memoryManager.conversationalMemoryQuery(req.body.query);
    res.json({ response });
  } catch (error) {
    console.error('Error processing memory query:', error);
    res.status(500).json({ error: 'Failed to process memory query' });
  }
});

// New endpoint to manually process a video
app.get('/api/process/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(WATCH_FOLDER, filename);
    
    console.log(`Manually processing video: ${filePath}`);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }
    
    // Process the video
    const result = await analyzeVideo(filePath);
    const saveResult = await saveToDataset(filePath, result, DATASET_FOLDER);
    console.log(`Manually processed and saved analysis for: ${filePath}`);
    
    // Process analysis results with memory manager
    await memoryManager.processNewAnalysis(result);
    
    // Mark as processed
    processedVideos.add(filename);
    
    // Generate thumbnail
    await ensureThumbnailFolder();
    const thumbName = path.parse(filename).name + '.jpg';
    const thumbPath = path.join(THUMBNAIL_FOLDER, thumbName);
    await generateThumbnail(filePath, thumbPath);
    
    res.json({ 
      success: true, 
      videoPath: filePath,
      datasetPath: saveResult.datasetPath 
    });
  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const files = await fs.readdir(DATASET_FOLDER);
    const videos = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await fs.readFile(path.join(DATASET_FOLDER, file), 'utf-8');
        videos.push(JSON.parse(data));
      }
    }
    
    res.json({ videos });
  } catch (error) {
    console.error('Error reading videos:', error);
    res.status(500).json({ error: 'Failed to read videos' });
  }
});

// Function to find unprocessed videos
async function scanForMissedVideos() {
  try {
    console.log('Scanning for missed videos...');
    
    // Get all mp4 files in the watch folder
    const files = await fs.readdir(WATCH_FOLDER);
    const videoFiles = files.filter(file => file.endsWith('.mp4'));
    
    let missedCount = 0;
    let reprocessedCount = 0;
    
    // First, check for failed processing attempts in the dataset
    try {
      const datasetFiles = await fs.readdir(DATASET_FOLDER);
      const jsonFiles = datasetFiles.filter(file => file.endsWith('.json'));
      
      for (const jsonFile of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(DATASET_FOLDER, jsonFile), 'utf-8');
          const data = JSON.parse(content);
          
          // Check if this is a failed processing attempt
          if (data.analysis?.error === 'File never reached ACTIVE state after multiple attempts') {
            const videoPath = data.videoPath;
            const videoFileName = data.videoFileName;
            
            // Skip if this file is currently being processed
            if (processingFiles.has(videoPath)) {
              console.log(`File ${videoFileName} is already being processed, skipping.`);
              continue;
            }
            
            processingFiles.add(videoPath);
            
            try {
              // Check if file is stable before processing
              console.log(`Checking if failed video is stable: ${videoFileName}`);
              let stable = await isFileStable(videoPath);
              
              if (stable) {
                console.log(`Reprocessing previously failed video: ${videoPath}`);
                const result = await analyzeVideo(videoPath);
                await saveToDataset(videoPath, result, DATASET_FOLDER);
                console.log(`Successfully reprocessed and updated analysis for: ${videoPath}`);
                
                // Process analysis results with memory manager
                await memoryManager.processNewAnalysis(result);
                
                // Mark as processed
                processedVideos.add(videoFileName);
                reprocessedCount++;
                
                // Generate thumbnail
                await ensureThumbnailFolder();
                const thumbName = path.parse(videoFileName).name + '.jpg';
                const thumbPath = path.join(THUMBNAIL_FOLDER, thumbName);
                await generateThumbnail(videoPath, thumbPath);
              } else {
                console.log(`Failed video ${videoFileName} is still being written, will try again later.`);
              }
            } catch (error) {
              console.error(`Error reprocessing failed video ${videoPath}:`, error);
            } finally {
              processingFiles.delete(videoPath);
            }
          }
        } catch (error) {
          console.error(`Error reading/parsing dataset file ${jsonFile}:`, error);
        }
      }
    } catch (error) {
      console.error('Error scanning dataset for failed videos:', error);
    }
    
    // Then check for completely unprocessed videos
    for (const videoFile of videoFiles) {
      if (!processedVideos.has(videoFile)) {
        missedCount++;
        console.log(`Found missed video: ${videoFile}`);
        
        // Process the video if it's stable (not currently being recorded)
        const filePath = path.join(WATCH_FOLDER, videoFile);
        
        // Skip if this file is currently being processed
        if (processingFiles.has(filePath)) {
          console.log(`File ${videoFile} is already being processed, skipping.`);
          continue;
        }
        
        processingFiles.add(filePath);
        
        try {
          // Check if file is stable before processing
          console.log(`Checking if missed video is stable: ${videoFile}`);
          let stable = await isFileStable(filePath);
          
          if (stable) {
            console.log(`Processing missed video: ${filePath}`);
            const result = await analyzeVideo(filePath);
            await saveToDataset(filePath, result, DATASET_FOLDER);
            console.log(`Processed and saved analysis for missed video: ${filePath}`);
            
            // Process analysis results with memory manager
            await memoryManager.processNewAnalysis(result);
            
            // Mark as processed
            processedVideos.add(videoFile);
            
            // Generate thumbnail
            await ensureThumbnailFolder();
            const thumbName = path.parse(videoFile).name + '.jpg';
            const thumbPath = path.join(THUMBNAIL_FOLDER, thumbName);
            await generateThumbnail(filePath, thumbPath);
          } else {
            console.log(`Missed video ${videoFile} is still being written, will try again later.`);
          }
        } catch (error) {
          console.error(`Error processing missed video ${filePath}:`, error);
        } finally {
          processingFiles.delete(filePath);
        }
      }
    }
    
    console.log(`Scan complete. Found ${missedCount} missed videos and reprocessed ${reprocessedCount} failed videos.`);
  } catch (error) {
    console.error('Error scanning for missed videos:', error);
  }
}

// Set up file watcher
async function setupWatcher() {
  // Initialize memory manager
  try {
    await memoryManager.initialize();
    console.log('Memory manager initialized');
  } catch (error) {
    console.error('Error initializing memory manager:', error);
  }
  
  await ensureDirectoryExists(DATASET_FOLDER);
  await loadProcessedVideos();
  await ensureThumbnailFolder();
  // Run thumbnail generation in the background
  console.log('Starting background thumbnail generation for missing thumbnails...');
  generateMissingThumbnails().then(() => {
    console.log('Background thumbnail generation complete.');
  }).catch(err => {
    console.warn('Background thumbnail generation failed:', err.message);
  });
  
  // Scan for missed videos on startup
  await scanForMissedVideos();
  
  const watcher = chokidar.watch(WATCH_FOLDER, {
    ignored: /(^|[\/\\])\../, // Ignore hidden files
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 1000
    }
  });
  
  watcher
    .on('add', async (filePath) => {
      const fileName = path.basename(filePath);
      
      // Skip if this file has already been processed or is currently being processed
      if (!filePath.endsWith('.mp4') || processedVideos.has(fileName) || processingFiles.has(filePath)) {
        return;
      }
      
      console.log(`New video detected: ${filePath}`);
      processingFiles.add(filePath);
      
      try {
        // First wait for chokidar's stabilityThreshold
        await new Promise(resolve => setTimeout(resolve, 6000));
        
        // Then do our own check to make sure recording has stopped
        console.log(`Checking if recording has completed for: ${filePath}`);
        let stable = false;
        let attempts = 0;
        
        // Keep checking until file size stabilizes (up to 5 attempts)
        while (!stable && attempts < 5) {
          stable = await isFileStable(filePath);
          if (!stable) {
            console.log(`File ${path.basename(filePath)} is still being written, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
          }
        }
        
        if (stable) {
          console.log(`Recording complete, processing: ${filePath}`);
          const result = await analyzeVideo(filePath);
          await saveToDataset(filePath, result, DATASET_FOLDER);
          console.log(`Processed and saved analysis for: ${filePath}`);
          
          // Process analysis results with memory manager
          await memoryManager.processNewAnalysis(result);
          
          // Mark as processed
          processedVideos.add(fileName);
          
          // Generate thumbnail
          await ensureThumbnailFolder();
          const thumbName = path.parse(fileName).name + '.jpg';
          const thumbPath = path.join(THUMBNAIL_FOLDER, thumbName);
          await generateThumbnail(filePath, thumbPath);
        } else {
          console.log(`File ${path.basename(filePath)} never stabilized, skipping processing`);
        }
      } catch (error) {
        console.error(`Error processing video ${filePath}:`, error);
      } finally {
        processingFiles.delete(filePath);
      }
    });
    
  // Setup periodic scan for missed videos (every 2 minutes)
  const scanInterval = setInterval(() => {
    scanForMissedVideos();
  }, 2 * 60 * 1000);
  
  // Cleanup interval on process exit
  process.on('SIGINT', () => {
    clearInterval(scanInterval);
    process.exit(0);
  });
  
  console.log('File watcher initialized.');
}

// Function to search video analyses based on a natural language query
async function searchVideoAnalyses(query) {
  console.log(`Received search query: ${query}`);
  try {
    // Read all analysis files from the dataset folder
    const files = await fs.readdir(DATASET_FOLDER);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      return [];
    }
    
    // Read and parse each JSON file
    const analysesData = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(DATASET_FOLDER, file), 'utf-8');
        const data = JSON.parse(content);
        analysesData.push({ filename: file, data });
      } catch (error) {
        console.error(`Error parsing JSON file ${file}:`, error);
      }
    }
    
    // Prepare data for relevance check
    const videoInfos = [];
    for (const item of analysesData) {
      const { data } = item;
      
      // Extract key text content from the analysis
      let textContent = '';
      
      // Include summary if available
      if (data.analysis?.summary) {
        textContent += `Summary: ${data.analysis.summary}\n\n`;
      }
      
      // Include transcript if available
      if (data.analysis?.transcript) {
        textContent += `Transcript: ${data.analysis.transcript}\n\n`;
      }
      
      // Include topics if available
      if (data.analysis?.topics && data.analysis.topics.length > 0) {
        textContent += `Topics: ${data.analysis.topics.join(', ')}\n\n`;
      }
      
      // Include inferred insights if available
      if (data.analysis?.inferred_insights && data.analysis.inferred_insights.length > 0) {
        textContent += 'Insights:\n';
        data.analysis.inferred_insights.forEach(insight => {
          textContent += `- ${insight.insight} (Basis: ${insight.basis})\n`;
        });
        textContent += '\n';
      }
      
      videoInfos.push({
        filename: item.filename,
        videoPath: data.videoPath,
        videoFileName: data.videoFileName,
        processedAt: data.processedAt,
        textContent
      });
    }
    
    // Use Gemini to evaluate relevance in batches
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const relevantVideos = [];
    
    // Process videos in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < videoInfos.length; i += BATCH_SIZE) {
      const batch = videoInfos.slice(i, i + BATCH_SIZE);
      
      // Create a combined prompt for the batch
      const batchPrompt = `
        Analyze the following video analyses and determine their relevance to the user's question: "${query}"

        For each video analysis below, determine if it is relevant and provide a relevance score and justification.
        Respond with a JSON array where each element contains:
        {
          "filename": "The filename of the video",
          "is_relevant": boolean,
          "relevance_score": number (0.0 to 1.0),
          "justification": "Brief explanation (1-2 sentences)"
        }

        Video Analyses:
        ${batch.map((info, index) => `
          Video ${index + 1} (${info.videoFileName}):
          ---
          ${info.textContent}
          ---
        `).join('\n\n')}
      `;
      
      try {
        const result = await model.generateContent(batchPrompt);
        const responseText = result.response.text();
        
        // Parse the response
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }
        
        const parsedResponses = JSON.parse(jsonStr);
        
        // Add relevant videos to results
        parsedResponses.forEach((response, index) => {
          if (response.is_relevant && response.relevance_score > 0.5) {
            const videoInfo = batch[index];
            relevantVideos.push({
              filename: videoInfo.filename,
              videoPath: videoInfo.videoPath,
              videoFileName: videoInfo.videoFileName,
              processedAt: videoInfo.processedAt,
              score: response.relevance_score,
              justification: response.justification
            });
          }
        });
      } catch (error) {
        console.error(`Error evaluating batch ${i / BATCH_SIZE + 1}:`, error);
      }
    }
    
    // Sort by relevance score (descending)
    return relevantVideos.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('Error searching video analyses:', error);
    throw error;
  }
}

// Function to handle chat conversation in video discussion
async function handleChatConversation(message, history, videoContext, memoryContext) {
  console.log('Handling chat conversation with message:', message);
  
  try {
    // Create a Gemini model instance
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });
    
    // Format conversation history for Gemini
    const formattedHistory = history.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));
    
    // Filter out system messages and ensure the first message is always from user
    let filteredHistory = formattedHistory.filter(msg => msg.role === 'user' || msg.role === 'model');
    
    // If history exists but doesn't start with user message, adjust accordingly
    if (filteredHistory.length > 0 && filteredHistory[0].role !== 'user') {
      filteredHistory = [];
    }
    
    // Start chat session with history if it exists
    const chatSession = model.startChat({
      history: filteredHistory.length >= 2 ? filteredHistory.slice(0, -1) : [],
    });
    
    // Prepare context information
    const contextInfo = `
You are an AI assistant helping a user discuss a video they've previously recorded. You have access to the following context:

VIDEO CONTEXT:
- Title: ${videoContext.videoFileName}
- Summary: ${videoContext.summary}
${videoContext.topics && videoContext.topics.length > 0 ? `- Topics: ${videoContext.topics.join(', ')}` : ''}
${videoContext.transcript ? '- Full transcript is available' : '- No transcript available'}

MEMORY CONTEXT:
- Working Memory: ${memoryContext.workingMemory?.established_facts?.length || 0} established facts and ${memoryContext.workingMemory?.untested_hypotheses?.length || 0} hypotheses
- Short-Term Memory: ${memoryContext.shortTermMemory?.length || 0} recent items
- Long-Term Memory: Profile information and knowledge base available

Use this context to provide informed, helpful responses about the video content and the user's memories related to it.
The user's message is: ${message}
`;

    // Send message with context
    const result = await chatSession.sendMessage(contextInfo);
    const response = result.response.text();
    
    console.log('Generated response:', response);
    return { response };
    
  } catch (error) {
    console.error('Error in chat conversation:', error);
    throw error;
  }
}

// New endpoint for searching video analyses
app.post('/api/search', async (req, res) => {
  try {
    if (!req.body.query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const query = req.body.query;
    const results = await searchVideoAnalyses(query);
    
    res.json({ results });
  } catch (error) {
    console.error('Error searching videos:', error);
    res.status(500).json({ error: error.message || 'Failed to search videos' });
  }
});

// New endpoint for video discussion chat
app.post('/api/videos/chat', async (req, res) => {
  try {
    const { message, history, videoContext, memoryContext } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!videoContext || !memoryContext) {
      return res.status(400).json({ error: 'Video and memory context are required' });
    }
    
    const result = await handleChatConversation(message, history || [], videoContext, memoryContext);
    res.json(result);
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process chat message',
      success: false 
    });
  }
});

// New endpoint for continuing discussion with a specific video context
app.post('/api/videos/continue-discussion', async (req, res) => {
  try {
    const { query, filename } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    if (!filename) {
      return res.status(400).json({ error: 'Video filename is required' });
    }
    
    // Read the video file data
    const videoPath = path.join(DATASET_FOLDER, filename);
    
    // Check if file exists using fs.access instead of fs.existsSync
    try {
      await fs.access(videoPath);
    } catch (error) {
      return res.status(404).json({ error: 'Video data not found' });
    }
    
    const videoData = JSON.parse(await fs.readFile(videoPath, 'utf-8'));
    
    // Get current memory state
    const memoryState = await memoryManager.getMemoryState();
    
    // Prepare a response with the combined context
    const responseData = {
      success: true,
      videoContext: {
        videoFileName: videoData.videoFileName,
        processedAt: videoData.processedAt,
        summary: videoData.analysis?.summary || 'No summary available',
        transcript: videoData.analysis?.transcript || null,
        topics: videoData.analysis?.topics || [],
        insights: videoData.analysis?.inferred_insights || []
      },
      memoryContext: {
        workingMemory: memoryState.workingMemory,
        shortTermMemory: memoryState.shortTermMemory,
        longTermMemory: memoryState.longTermMemory
      },
      initialQuery: query
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Error continuing discussion:', error);
    res.status(500).json({ error: error.message || 'Failed to continue discussion' });
  }
});

// Endpoint to serve video files
app.get('/videos/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const sourceVideoPath = path.join(WATCH_FOLDER, filename);
    
    // Check if file exists
    try {
      await fs.access(sourceVideoPath);
    } catch (error) {
      return res.status(404).send('Video file not found');
    }
    
    // Get file stats to determine size
    const stat = await fs.stat(sourceVideoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    // Handle range requests for video streaming
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      
      const fileStream = createReadStream(sourceVideoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      };
      
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      // No range requested, send entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      
      res.writeHead(200, head);
      createReadStream(sourceVideoPath).pipe(res);
    }
  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).send('Error serving video file');
  }
});

// New endpoint to serve thumbnails
app.get('/thumbnails/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const thumbnailPath = path.join(THUMBNAIL_FOLDER, filename);
    await fs.access(thumbnailPath);
    res.sendFile(thumbnailPath);
  } catch (error) {
    res.status(404).send('Thumbnail not found');
  }
});

// Initialize server
const port = process.env.PORT || 8001;
const server = ViteExpress.listen(app, port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Watching folder: ${WATCH_FOLDER}`);
  console.log(`Dataset folder: ${DATASET_FOLDER}`);
});

setupWatcher().catch(error => {
  console.error('Failed to set up file watcher:', error);
}); 