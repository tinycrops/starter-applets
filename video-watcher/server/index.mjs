import express from 'express';
import ViteExpress from 'vite-express';
import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import { analyzeVideo, saveToDataset } from './video-processor.mjs';
import memoryManager from './memory-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const WATCH_FOLDER = process.env.VIDEO_WATCH_FOLDER || 'Q:\\';
const DATASET_FOLDER = process.env.VIDEO_DATASET_FOLDER || path.join(process.env.HOME || process.env.USERPROFILE, 'video-dataset');

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
    
    // Check each video file
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
    
    console.log(`Scan complete. Found ${missedCount} missed videos.`);
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