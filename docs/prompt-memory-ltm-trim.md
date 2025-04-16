# LTM Trimming Prompt

**Prompt Location:** [video-watcher/server/memory-manager.mjs](//starter-applets/video-watcher/server/memory-manager.mjs#L269)

---

```
The following is the current long-term memory for a user assistant that exceeds our token limit of ${LTM_TOKEN_LIMIT}.
Current size: approximately ${currentTokenCount} tokens.

Please condense this information to a more concise representation while preserving the most important insights.
Focus on:
1. Core user preferences and established patterns
2. Most relevant skills, knowledge, and workflows
3. Highest confidence insights and explicitly stated facts

Current LTM:
---
${JSON.stringify(this.longTermMemory, null, 2)}
---

Return a condensed version in the same JSON structure, but more concise and within our ${LTM_TOKEN_LIMIT} token limit.
Ensure the output is a valid JSON object with the same structure.
``` 