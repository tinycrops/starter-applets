# Video Watcher - User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Basic Usage](#basic-usage)
5. [Advanced Features](#advanced-features)
6. [Troubleshooting](#troubleshooting)

## Introduction

Video Watcher is an intelligent application that automatically analyzes video content using Google's Gemini AI. It's designed to help content creators, researchers, and data analysts build structured datasets from video content.

### Key Features
- Real-time video monitoring
- AI-powered content analysis
- Dataset generation and management
- Web-based interface for data exploration
- Customizable analysis parameters

## Installation

### Prerequisites
- Node.js 18.x or higher
- Google Gemini API key
- OBS Studio (for video recording)

### Setup Steps
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment variables (see Configuration section)

## Configuration

### Environment Variables
Create a `.env` file in the project root with the following variables:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VIDEO_WATCH_FOLDER=path_to_your_video_folder
VIDEO_DATASET_FOLDER=path_to_your_dataset_folder
```

### OBS Studio Setup
1. Open OBS Studio
2. Go to Settings > Output
3. Set the Recording Path to match your `VIDEO_WATCH_FOLDER`
4. Configure your desired recording format (MP4 recommended)

## Basic Usage

### Starting the Application
1. Start the application:
   ```bash
   npm run dev
   ```
2. Open your browser to http://localhost:8001

### Recording and Analysis
1. Start recording in OBS Studio
2. The application will automatically detect new videos
3. Videos will be processed and analyzed by Gemini AI
4. Results will appear in the web interface

### Web Interface
- **Dashboard**: Overview of all analyzed videos
- **Video Details**: View detailed analysis for each video
- **Dataset Explorer**: Browse and search through the generated dataset

## Advanced Features

### Custom Analysis Prompts
You can customize the analysis prompts by editing the `DEFAULT_PROMPT` in `server/video-processor.mjs`. This allows you to:
- Focus on specific aspects of the video
- Generate different types of metadata
- Customize the analysis depth

### Dataset Management
- Export dataset in various formats
- Filter and search through analyzed videos
- View analysis history and trends

### API Integration
The application provides REST endpoints for:
- Video analysis
- Dataset management
- Status monitoring

## Troubleshooting

### Common Issues
1. **Video not detected**
   - Check if the watch folder path is correct
   - Verify file permissions
   - Ensure OBS is saving to the correct location

2. **Analysis failed**
   - Verify Gemini API key
   - Check internet connection
   - Ensure video format is supported

3. **Web interface not loading**
   - Verify the server is running
   - Check port availability
   - Clear browser cache

### Support
For additional support:
- Check the GitHub issues page
- Review the documentation
- Contact the development team 