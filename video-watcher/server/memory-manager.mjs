import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_DIR = path.join(__dirname, "..", "memory");
const LTM_PATH = path.join(MEMORY_DIR, "ltm.json"); // Store LTM as structured data or text summary
const WM_PATH = path.join(MEMORY_DIR, "wm.json");
const STM_TOKEN_LIMIT = 8000;
const STM_TRIM_THRESHOLD = 3000; // How many tokens worth of old entries to summarize for LTM
const GEMINI_MODEL = "gemini-1.5-flash"; // Updated model

// --- State ---
let stm = []; // Array of { timestamp: Date, type: string, data: any, tokenEstimate?: number }
let ltmContent = { summary: "" }; // Or could be structured data
let wm = {
  untested: [],
  tested: [],
  solid: [],
};
let genAI = null;
let isInitialized = false;

// --- Helper Functions ---

/**
 * Simple token estimation heuristic.
 * Replace with a proper tokenizer if more accuracy is needed.
 * @param {any} data Data to estimate tokens for.
 * @returns {number} Estimated token count.
 */
function estimateTokens(data) {
  try {
    const jsonString = JSON.stringify(data);
    // Basic heuristic: words * 1.3. Split by space and punctuation.
    const words = jsonString.split(/[\s,.!?;:]+/).filter(Boolean);
    return Math.ceil(words.length * 1.3);
  } catch (error) {
    console.error("Error estimating tokens:", error);
    return 100; // Default fallback
  }
}

/**
 * Ensures the memory directory exists.
 */
async function ensureMemoryDir() {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
  } catch (error) {
    console.error("Error creating memory directory:", error);
    // Depending on the error, we might want to throw or handle differently
    if (error.code !== 'EEXIST') {
        throw error; // Re-throw if it's not just that the directory already exists
    }
  }
}

/**
 * Generic function to make calls to the Gemini API.
 * @param {string} prompt The prompt to send to the model.
 * @param {boolean} expectJson Should the response be parsed as JSON?
 * @returns {Promise<any>} The response from the API.
 */
async function geminiApiCall(prompt, expectJson = false) {
  if (!genAI) {
    throw new Error("Gemini AI client not initialized.");
  }
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (expectJson) {
      try {
        // Clean potential markdown ```json ... ``` syntax
        const jsonString = text.replace(/^```json\s*|```$/g, "").trim();
        return JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Failed to parse Gemini response as JSON:", parseError);
        console.error("Original Gemini text:", text);
        // Return a default structure or throw, depending on requirements
        return expectJson ? {} : text; // Return empty object if JSON was expected but failed
      }
    }
    return text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error; // Re-throw to be handled by the caller
  }
}

// --- Core Memory Functions ---

/**
 * Loads LTM and WM from disk.
 */
async function loadMemory() {
    await ensureMemoryDir();
    try {
        const ltmData = await fs.readFile(LTM_PATH, 'utf8');
        ltmContent = JSON.parse(ltmData);
        console.log("Loaded LTM from", LTM_PATH);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("LTM file not found, starting fresh.");
            ltmContent = { summary: "" }; // Initialize default LTM
            await persistLtm(); // Create the file
        } else {
            console.error("Error loading LTM:", error);
        }
    }

    try {
        const wmData = await fs.readFile(WM_PATH, 'utf8');
        wm = JSON.parse(wmData);
        console.log("Loaded WM from", WM_PATH);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("WM file not found, starting fresh.");
            wm = { untested: [], tested: [], solid: [] }; // Initialize default WM
            await persistWm(); // Create the file
        } else {
            console.error("Error loading WM:", error);
        }
    }
}


/**
 * Saves LTM content to disk.
 */
async function persistLtm() {
  try {
    await fs.writeFile(LTM_PATH, JSON.stringify(ltmContent, null, 2), 'utf8');
    // console.log("Persisted LTM to", LTM_PATH); // Can be noisy
  } catch (error) {
    console.error("Error persisting LTM:", error);
  }
}

/**
 * Saves WM state to disk.
 */
async function persistWm() {
  try {
    await fs.writeFile(WM_PATH, JSON.stringify(wm, null, 2), 'utf8');
    // console.log("Persisted WM to", WM_PATH); // Can be noisy
  } catch (error) {
    console.error("Error persisting WM:", error);
  }
}

/**
 * Extracts commands and preferences from a transcript using Gemini.
 * @param {string} transcript The video transcript.
 * @returns {Promise<object>} Parsed JSON object with commands/preferences.
 */
export async function extractCommandsPreferences(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    console.log("Transcript is empty, skipping command/preference extraction.");
    return {
        detected_commands: [],
        user_preferences_goals: [],
        relevant_context: "Transcript was empty.",
    };
  }
  const prompt = `
Analyze the following transcript obtained from a screen recording. Identify any potential commands the user might be implicitly or explicitly directing towards an AI assistant, or any stated preferences, goals, or frustrations relevant to their computer usage or tasks. Structure the response as a JSON object with the following fields:
{
  "detected_commands": [
    { "command": "...", "target": "...", "parameters": {...}, "certainty": "high/medium/low" }
  ],
  "user_preferences_goals": [
    { "statement": "...", "type": "preference/goal/frustration/interest", "certainty": "high/medium/low" }
  ],
  "relevant_context": "Brief summary of transcript context relevant to commands/preferences."
}
If no commands or preferences are detected, return an empty array for the respective fields and provide context.

Transcript:
---
${transcript}
---
`;
  console.log("Requesting command/preference extraction from Gemini...");
  try {
      const result = await geminiApiCall(prompt, true); // Expect JSON response
      // Add basic validation
       if (typeof result !== 'object' || result === null || !Array.isArray(result.detected_commands) || !Array.isArray(result.user_preferences_goals)) {
            console.error("Invalid JSON structure received for commands/preferences:", result);
            // Return a default valid structure
            return {
                detected_commands: [],
                user_preferences_goals: [],
                relevant_context: "Error processing transcript or invalid response structure received.",
            };
        }
      console.log("Command/preference extraction successful.");
      return result;
  } catch (error) {
      console.error("Error during command/preference extraction:", error);
       // Return default structure on error
       return {
           detected_commands: [],
           user_preferences_goals: [],
           relevant_context: "Error occurred during command/preference extraction.",
       };
  }
}

/**
 * Summarizes oldest STM entries for LTM using Gemini.
 * @param {Array<object>} entriesToSummarize Array of STM entries.
 * @returns {Promise<string>} The generated summary.
 */
async function summarizeStmForLtm(entriesToSummarize) {
  if (!entriesToSummarize || entriesToSummarize.length === 0) {
    return "";
  }
  // Format entries for the prompt
  const formattedEntries = entriesToSummarize.map(entry =>
    `[${entry.timestamp.toISOString()}] (${entry.type}): ${JSON.stringify(entry.data)}`
  ).join("\n");

  const prompt = `
Summarize the following user activity log entries into a concise paragraph focusing on recurring themes, established preferences, skills, goals, or common issues. This summary will be added to a long-term user profile. Focus on information useful for a personalized AI assistant to better understand the user. Append this summary to the existing long-term memory, do not replace it.

Existing Long-Term Memory Summary:
---
${ltmContent.summary || "None"}
---

Entries to Summarize:
---
${formattedEntries}
---

New Combined Long-Term Memory Summary:
`;
  console.log("Requesting LTM summarization from Gemini...");
  try {
      const summary = await geminiApiCall(prompt);
       console.log("LTM summarization successful.");
      return summary.trim();
  } catch (error) {
      console.error("Error during LTM summarization:", error);
      return ""; // Return empty string on error, so we don't wipe LTM
  }
}

/**
 * Updates the Working Memory based on STM and LTM using Gemini.
 */
async function updateWorkingMemory() {
  // Prepare STM content for the prompt (maybe summarize if too long, but for now use all)
  const stmSummaryForPrompt = stm.slice(-20).map(entry => // Limit context sent to WM prompt
      `[${entry.timestamp.toISOString()}] (${entry.type}): ${JSON.stringify(entry.data)}`
  ).join("\n");

  const prompt = `
Based on the recent activity log (STM) and the long-term user summary (LTM), update the user's Working Memory (WM).

Current WM:
---
${JSON.stringify(wm, null, 2)}
---

STM (Recent Activity Log - Last ~20 Entries):
---
${stmSummaryForPrompt || "No recent activity"}
---

LTM (Long-Term Summary):
---
${ltmContent.summary || "None"}
---

Instructions:
1. Analyze STM and LTM for new insights about the user's goals, preferences, skills, habits, or context.
2. Add completely new insights to the 'untested' list.
3. Review items in 'untested'. If recent STM activity corroborates an item, move it to 'tested'. If contradicted, remove it.
4. Review items in 'tested'. If recent STM activity strongly corroborates an item consistently over time (consider LTM), move it to 'solid'. If contradicted, move it back to 'untested' or remove if strongly refuted.
5. Keep statements concise and action-oriented where possible. Avoid redundancy. Ensure lists contain only strings.
6. Output the *entire updated* WM as a JSON object in the format: { "untested": [...], "tested": [...], "solid": [...] }
   Strictly adhere to the JSON format. Ensure the output is ONLY the JSON object, without any surrounding text or markdown.
`;

  console.log("Requesting WM update from Gemini...");
  try {
    const updatedWmJson = await geminiApiCall(prompt, true); // Expect JSON

    // Validate the structure of the response
    if (
        typeof updatedWmJson === 'object' && updatedWmJson !== null &&
        Array.isArray(updatedWmJson.untested) &&
        Array.isArray(updatedWmJson.tested) &&
        Array.isArray(updatedWmJson.solid) &&
        updatedWmJson.untested.every(item => typeof item === 'string') &&
        updatedWmJson.tested.every(item => typeof item === 'string') &&
        updatedWmJson.solid.every(item => typeof item === 'string')
       ) {
        wm = updatedWmJson;
        console.log("WM update successful.");
        await persistWm(); // Persist after successful update
    } else {
        console.error("Invalid JSON structure received for WM update:", updatedWmJson);
        // Optionally revert or keep the old WM state
    }

  } catch (error) {
    console.error("Error during WM update:", error);
    // Decide if we should retry or just skip the update
  }
}

/**
 * Checks STM token limit and triggers summarization/trimming if needed.
 */
async function checkAndTrimStm() {
  let currentTokenCount = stm.reduce((sum, entry) => sum + (entry.tokenEstimate || 0), 0);
  console.log(`STM Status: ${stm.length} entries, ~${currentTokenCount} tokens.`);

  if (currentTokenCount > STM_TOKEN_LIMIT) {
    console.log(`STM token limit (${STM_TOKEN_LIMIT}) exceeded. Summarizing oldest entries for LTM...`);
    let tokensToTrim = 0;
    let entriesToSummarize = [];
    let entriesToKeep = [];

    // Iterate from oldest (start of array)
    for (const entry of stm) {
      if (tokensToTrim < STM_TRIM_THRESHOLD) {
        tokensToTrim += (entry.tokenEstimate || 0);
        entriesToSummarize.push(entry);
      } else {
        entriesToKeep.push(entry);
      }
    }

    console.log(`Attempting to summarize ${entriesToSummarize.length} entries (~${tokensToTrim} tokens).`);
    const summary = await summarizeStmForLtm(entriesToSummarize);

    if (summary) {
        // Append new summary to existing LTM content.
        // A more sophisticated approach might involve structuring LTM better.
        ltmContent.summary = ltmContent.summary
            ? `${ltmContent.summary}\n\n[${new Date().toISOString()}] Summary of older activity:\n${summary}`
            : `[${new Date().toISOString()}] Summary of activity:\n${summary}`;

        await persistLtm();
        stm = entriesToKeep; // Update STM
        console.log(`STM trimmed. New size: ${stm.length} entries, ~${currentTokenCount - tokensToTrim} tokens.`);
    } else {
        console.error("LTM summarization failed. STM not trimmed to avoid data loss.");
        // Potentially implement a fallback trimming mechanism (e.g., just remove oldest without summary)
        // For now, we'll just leave STM large.
    }
  }
}


// --- Public API ---

/**
 * Initializes the memory manager. MUST be called before other functions.
 * @param {string} apiKey Gemini API Key.
 */
export async function initializeMemoryManager(apiKey) {
  if (isInitialized) {
    console.warn("Memory manager already initialized.");
    return;
  }
  console.log("Initializing Memory Manager...");
  if (!apiKey) {
      throw new Error("Gemini API key is required for Memory Manager initialization.");
  }
  genAI = new GoogleGenerativeAI(apiKey);
  await loadMemory(); // Load persisted state
  isInitialized = true;
  console.log("Memory Manager Initialized.");

  // Initial WM update based on loaded state
  console.log("Performing initial WM update based on loaded LTM/STM state...");
  await updateWorkingMemory();
}

/**
 * Adds an event to the Short-Term Memory.
 * Triggers LTM summarization and WM updates as needed.
 * @param {{ type: string, data: any }} event The event to add.
 */
export async function addEventToStm(event) {
  if (!isInitialized) {
    console.error("Memory manager not initialized. Cannot add event.");
    return;
  }
  console.log(`Adding event to STM: ${event.type}`);
  const timestamp = new Date();
  const tokenEstimate = estimateTokens(event.data);
  stm.push({ ...event, timestamp, tokenEstimate });

  // Check token limits and potentially trim/summarize asynchronously
  // We run this without awaiting it directly here to avoid blocking
  checkAndTrimStm().catch(error => {
    console.error("Error during background STM check/trim:", error);
  });

  // Update working memory asynchronously based on the new STM state
  // Also run without awaiting directly
  updateWorkingMemory().catch(error => {
    console.error("Error during background WM update:", error);
  });
}

/**
 * Gets the current state of the memory components.
 * @returns {{stm: Array<object>, ltm: object, wm: object}} Current memory state.
 */
export function getMemoryState() {
    if (!isInitialized) {
        return {
            stm: [],
            ltm: { summary: "Memory manager not initialized." },
            wm: { untested: [], tested: [], solid: [] },
        };
    }
  return {
    stm: stm,
    ltm: ltmContent,
    wm: wm,
  };
} 