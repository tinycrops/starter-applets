# Video Watcher - Gemini Dataset Builder

This application watches a folder for new video recordings from OBS, sends them to Google's Gemini AI for analysis, and builds a dataset of AI-generated labels and descriptions.

## Features

- **Automatic Video Detection**: Monitors a specified folder for new video recordings
- **AI Analysis**: Sends videos to Gemini for detailed analysis
- **Dataset Building**: Creates a structured dataset of AI-generated labels
- **Web Interface**: View and explore the generated dataset

## Prerequisites

1. Node.js 18.x or higher
2. Google Gemini API key
3. OBS Studio configured to save recordings to a specific folder

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the project root with the following variables:
   ```
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VIDEO_WATCH_FOLDER=Q:\\
   VIDEO_DATASET_FOLDER=C:\\Users\\YourUsername\\video-dataset
   ```
   Note: Update the paths to match your system configuration.

## Usage

1. Start the application:
   ```
   npm run dev
   ```

2. The server will start watching the specified folder for new video recordings

3. Record a video in OBS and save it to the watched folder (Q:\ by default)

4. The application will automatically detect the new video, send it to Gemini for analysis, and add it to the dataset

5. Open your browser to http://localhost:8001 to view the web interface

## How It Works

1. The application uses `chokidar` to watch the specified folder for new video files
2. When a new video is detected, it is uploaded to Google's Gemini AI
3. A structured prompt asks Gemini to analyze the video and provide detailed information
4. The response is parsed and saved to the dataset folder as a JSON file
5. The web interface displays all analyzed videos and their AI-generated metadata

## Customization

- To modify the prompt sent to Gemini, edit the `DEFAULT_PROMPT` in `server/video-processor.mjs`
- To change the watched folder or dataset location, update the environment variables in `.env`

## Folder Structure

- `/server`: Backend Node.js server code
- `/src`: Frontend React application
- `/server/video-processor.mjs`: Core module for video analysis with Gemini 