# Prompt Templates in This Repository

This document lists and describes all prompt templates used in the codebase, including their purpose, structure, and where they are defined.

---

## 1. Video Analysis Prompt

**Location:** `server/video-processor.mjs` (`DEFAULT_PROMPT`)

**Purpose:**  
Instructs the Gemini model to analyze a video recording and provide a structured, detailed description of its content.

**Prompt Structure:**
- Analyze the video and provide:
  1. Content visible on the screen
  2. Actions or activities being performed
  3. Key topics discussed or shown
  4. Transcription of spoken content
- **Response Format:** JSON object with fields:
  - `summary`: Detailed summary of the video
  - `screenContent`: Description of what's visible
  - `actions`: Description of actions performed
  - `topics`: Array of topics
  - `transcript`: Transcription of speech
  - `tags`: Array of tags

---

## 2. Video Insight Inference Prompt

**Location:** `server/video-processor.mjs` (`INFERENCE_PROMPT`)

**Purpose:**  
Instructs the model to infer both explicit and implicit information from a screen recording, including user mental state, intentions, and tacit knowledge.

**Prompt Structure:**
- Analyze for:
  - Explicit directives & preferences
  - Inferred user state & intentions (mental/emotional state, goals, needs, habits, knowledge gaps, opinions, withheld ideas)
- **Guidelines:**  
  - Make evidence-based inferences
  - Include reasoning and certainty for each insight
  - Be specific and actionable
  - Look for behavioral patterns
- **Response Format:** JSON object with:
  - `explicit_directives`: Array of detected commands
  - `explicit_statements`: Array of explicit user statements
  - `inferred_insights`: Array of inferred insights (with type, basis, certainty)
  - `relevant_context_summary`: Brief summary focused on user state/goals

---

## 3. Video Analysis Relevance Search Prompt

**Location:** `server/index.mjs` (`batchPrompt` in `searchVideoAnalyses`)

**Purpose:**  
Used to determine the relevance of multiple video analyses to a user's query.

**Prompt Structure:**
- Analyze a batch of video analyses for relevance to a user question.
- For each analysis, provide:
  - `filename`
  - `is_relevant` (boolean)
  - `relevance_score` (0.0 to 1.0)
  - `justification` (brief explanation)
- **Response Format:** JSON array, one object per video analysis.

---

## 4. Memory System Prompts

### a. Long-Term Memory (LTM) Trimming Prompt

**Location:** `server/memory-manager.mjs` (`trimLTM`)

**Purpose:**  
Condenses the long-term memory to fit within a token limit, preserving the most important insights.

**Prompt Structure:**
- Focus on:
  1. Core user preferences and patterns
  2. Most relevant skills, knowledge, workflows
  3. Highest confidence insights and explicit facts
- **Response Format:** Condensed JSON object, same structure as LTM.

---

### b. Working Memory (WM) Update Prompt

**Location:** `server/memory-manager.mjs` (`updateWorkingMemory`)

**Purpose:**  
Updates the working memory to reflect the user's current state, goals, needs, and context, using recent STM, LTM, and current WM.

**Prompt Structure:**
- Analyze recent STM entries in context of LTM and WM.
- Maintain three categories:
  - Untested hypotheses
  - Corroborated hypotheses
  - Established facts
- For each, include:
  - Insight
  - Evidence basis
  - Relevance to current context/goals
- **Response Format:** JSON object with three arrays.

---

### c. Working Memory (WM) Trimming Prompt

**Location:** `server/memory-manager.mjs` (`trimWM`)

**Purpose:**  
Condenses working memory to fit within a token limit, prioritizing established facts and most relevant hypotheses.

**Prompt Structure:**
- Focus on:
  1. All established facts
  2. Most relevant corroborated hypotheses
  3. Most recent/actionable untested hypotheses
- **Response Format:** Condensed JSON object, same structure as WM.

---

### d. Long-Term Memory (LTM) Summarization Prompt

**Location:** `server/memory-manager.mjs` (`createLTMSummary`)

**Purpose:**  
Synthesizes new observations into the user's long-term memory profile, integrating with existing knowledge.

**Prompt Structure:**
- Merge new observations with existing LTM
- Prioritize explicit statements over inferences
- Indicate confidence levels for inferred traits
- Focus on patterns (skills, habits, frustrations, goals, etc.)
- Condense redundant entries, remove outdated info
- **Response Format:** Hierarchical JSON object with fields for profile summary, skills, preferences, workflows, challenges, goals, and traits.

---

### e. Conversational Memory Query Prompt

**Location:** `server/memory-manager.mjs` (`conversationalMemoryQuery`)

**Purpose:**  
Provides a conversational interface to the memory system, answering user queries about memory content, editing, or system operation.

**Prompt Structure:**
- Describes the memory system (STM, LTM, WM)
- Shows current memory state
- Responds to user query with transparency and conciseness
- Explains content, editing, or system operation as appropriate
- **Response Format:** Natural language response, not strictly structured.

---

## Notes

- All prompts are dynamically constructed with current memory or video data.
- Prompts are designed for use with Google Gemini models.
- For details or modifications, see the relevant files and functions listed above.

---

If you need further breakdowns or want to see the full text of any prompt, please specify which one.
