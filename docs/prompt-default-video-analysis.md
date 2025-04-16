# DEFAULT_PROMPT: Video Analysis Prompt

**Prompt Location:** [video-watcher/server/video-processor.mjs](//starter-applets/video-watcher/server/video-processor.mjs#L13)

---

```
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