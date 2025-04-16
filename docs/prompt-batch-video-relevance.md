# batchPrompt: Batch Video Relevance Analysis Prompt

**Prompt Location:** [video-watcher/server/index.mjs](//starter-applets/video-watcher/server/index.mjs#L473)

---

```
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
<video analyses inserted here> 