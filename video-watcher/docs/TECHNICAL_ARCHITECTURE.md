# Video Watcher - Technical Architecture

## System Overview

Video Watcher is built as a modern web application with a client-server architecture. The system consists of several key components working together to provide video monitoring, analysis, and dataset management capabilities.

## Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  OBS Studio     │────▶│  Video Watcher  │────▶│  Gemini AI      │
│  (Video Source) │     │  (Server)       │     │  (Analysis)     │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │
│  Web Interface  │◀────│  Dataset Store  │
│  (React)        │     │  (JSON Files)   │
│                 │     │                 │
└─────────────────┘     └─────────────────┘
```

## Component Details

### 1. Frontend (React Application)

#### Technologies
- React 18.x
- Vite for build and development
- D3.js for data visualization
- SASS for styling

#### Key Components
- **Dashboard**: Main interface for video monitoring
- **Video Explorer**: Dataset browsing and search
- **Analysis Viewer**: Detailed video analysis results
- **Settings Panel**: Configuration management

### 2. Backend (Node.js Server)

#### Technologies
- Node.js 18.x
- Express.js for API endpoints
- Chokidar for file system monitoring
- Google Generative AI SDK

#### Core Modules
- **Video Processor**: Handles video analysis with Gemini
- **File Watcher**: Monitors for new video files
- **Dataset Manager**: Manages JSON dataset storage
- **API Server**: Provides REST endpoints

### 3. Data Storage

#### Structure
- JSON-based dataset storage
- File-based video storage
- In-memory caching for performance

#### Data Models
```typescript
interface VideoMetadata {
  id: string;
  filename: string;
  path: string;
  timestamp: string;
  duration: number;
  analysis: {
    labels: string[];
    description: string;
    metadata: Record<string, any>;
  };
}
```

## API Endpoints

### Video Management
- `POST /api/videos/analyze` - Submit video for analysis
- `GET /api/videos` - List all analyzed videos
- `GET /api/videos/:id` - Get video details
- `DELETE /api/videos/:id` - Remove video from dataset

### Dataset Operations
- `GET /api/dataset` - Get dataset summary
- `POST /api/dataset/export` - Export dataset
- `GET /api/dataset/search` - Search dataset
- `POST /api/dataset/filter` - Filter dataset

## Data Flow

1. **Video Detection**
   - OBS Studio saves video to watched folder
   - File watcher detects new file
   - Video processor initiates analysis

2. **Analysis Process**
   - Video is sent to Gemini AI
   - Analysis results are processed
   - Metadata is extracted and structured
   - Results are saved to dataset

3. **User Interaction**
   - Web interface requests data
   - Server retrieves from dataset
   - Data is formatted and returned
   - Frontend displays results

## Security Considerations

### Authentication
- API key validation
- Rate limiting
- Request validation

### Data Protection
- Secure file handling
- Input sanitization
- Error handling

## Performance Optimization

### Caching Strategy
- In-memory cache for recent videos
- File system cache for large datasets
- API response caching

### Resource Management
- Concurrent processing limits
- Memory usage monitoring
- File system cleanup

## Deployment

### Requirements
- Node.js 18.x environment
- Sufficient disk space for videos
- Network access to Gemini API
- File system permissions

### Configuration
- Environment variables
- API keys
- File paths
- Performance settings

## Monitoring and Logging

### Metrics
- Video processing time
- API response times
- Memory usage
- Disk space utilization

### Logging
- Application events
- Error tracking
- Performance metrics
- User actions

## Development Guidelines

### Code Structure
- Modular design
- Clear separation of concerns
- Consistent naming conventions
- Comprehensive documentation

### Testing
- Unit tests for core functionality
- Integration tests for API endpoints
- End-to-end tests for critical paths
- Performance testing

## Future Technical Considerations

### Scalability
- Horizontal scaling support
- Load balancing
- Database migration
- Caching improvements

### Integration
- Additional AI providers
- Cloud storage options
- Third-party services
- Custom analysis plugins 