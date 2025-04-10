import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Constants for memory management
const MEMORY_DIR = path.join(process.cwd(), 'memory');
const STM_TOKEN_LIMIT = 8000;
const LTM_TOKEN_LIMIT = 8000;
const WM_TOKEN_LIMIT = 8000;
const DEFAULT_MODEL = 'gemini-2.0-flash';
const SUMMARY_MODEL = 'gemini-2.5-pro-exp-03-25'
const MEMORY_STATE_FILE = path.join(MEMORY_DIR, 'memory-state.json');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

/**
 * Multi-tiered memory system manager
 */
export class MemoryManager {
  constructor() {
    this.shortTermMemory = []; // In-memory array of recent events
    this.longTermMemory = {}; // Structured persistent memory
    this.workingMemory = {
      untested_hypotheses: [],
      corroborated_hypotheses: [],
      established_facts: []
    };
    this.initialized = false;
  }

  /**
   * Initialize the memory manager by loading persisted state
   */
  async initialize() {
    try {
      // Ensure memory directory exists
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      
      // Try to load the complete memory state first
      try {
        const stateContent = await fs.readFile(MEMORY_STATE_FILE, 'utf-8');
        const savedState = JSON.parse(stateContent);
        
        // Restore complete state
        this.shortTermMemory = savedState.shortTermMemory || [];
        this.longTermMemory = savedState.longTermMemory || {};
        this.workingMemory = savedState.workingMemory || {
          untested_hypotheses: [],
          corroborated_hypotheses: [],
          established_facts: []
        };
        
        console.log('Loaded complete memory state from memory-state.json');
      } catch (error) {
        console.log('No existing complete memory state found, trying individual memory files');
        
        // Fall back to loading individual memory files if complete state isn't available
        try {
          const ltmContent = await fs.readFile(path.join(MEMORY_DIR, 'ltm.json'), 'utf-8');
          this.longTermMemory = JSON.parse(ltmContent);
          console.log('Loaded long-term memory');
        } catch (error) {
          console.log('No existing LTM found, initializing empty LTM');
          this.longTermMemory = {};
        }
        
        try {
          const wmContent = await fs.readFile(path.join(MEMORY_DIR, 'wm.json'), 'utf-8');
          this.workingMemory = JSON.parse(wmContent);
          console.log('Loaded working memory');
        } catch (error) {
          console.log('No existing WM found, initializing empty WM');
        }
        
        try {
          const stmContent = await fs.readFile(path.join(MEMORY_DIR, 'stm.json'), 'utf-8');
          this.shortTermMemory = JSON.parse(stmContent);
          console.log('Loaded short-term memory');
        } catch (error) {
          console.log('No existing STM found, initializing empty STM');
        }
        
        // Save the initial state to create the complete state file
        await this.persistCompleteState();
      }
      
      this.initialized = true;
      console.log('Memory Manager initialized');
    } catch (error) {
      console.error('Error initializing memory manager:', error);
      throw error;
    }
  }

  /**
   * Estimate token count for a string (rough approximation)
   * @param {string} text - Text to estimate token count for
   * @returns {number} - Estimated token count
   */
  estimateTokens(text) {
    // Simple estimation: 1 token ~ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Add new entries to short-term memory and trigger processing
   * @param {object} analysisResult - Result of video analysis including explicit directives and inferred insights
   */
  async processNewAnalysis(analysisResult) {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const contextEntry = {
      timestamp,
      type: 'video_analysis_summary',
      data: {
        summary: analysisResult.relevantContextSummary || analysisResult.summary || "No summary available"
      }
    };
    
    // Add context summary as a single entry
    this.shortTermMemory.push(contextEntry);
    
    // Add each explicit directive as a separate entry
    if (analysisResult.explicit_directives && Array.isArray(analysisResult.explicit_directives)) {
      for (const directive of analysisResult.explicit_directives) {
        this.shortTermMemory.push({
          timestamp,
          type: 'explicit_directive',
          data: directive
        });
      }
    }
    
    // Add each explicit statement as a separate entry
    if (analysisResult.explicit_statements && Array.isArray(analysisResult.explicit_statements)) {
      for (const statement of analysisResult.explicit_statements) {
        this.shortTermMemory.push({
          timestamp,
          type: 'explicit_statement',
          data: statement
        });
      }
    }
    
    // Add each inferred insight as a separate entry
    if (analysisResult.inferred_insights && Array.isArray(analysisResult.inferred_insights)) {
      for (const insight of analysisResult.inferred_insights) {
        this.shortTermMemory.push({
          timestamp,
          type: 'inferred_insight',
          data: insight
        });
      }
    }
    
    console.log(`Added ${1 + 
      (analysisResult.explicit_directives?.length || 0) + 
      (analysisResult.explicit_statements?.length || 0) + 
      (analysisResult.inferred_insights?.length || 0)} entries to STM`);
    
    // Persist STM after adding new entries
    await this.persistSTM();
    
    // Save complete memory state
    await this.persistCompleteState();
    
    // Check if STM needs consolidation
    await this.checkSTMSize();
    
    // Update working memory with new insights
    await this.updateWorkingMemory();
  }

  /**
   * Check if STM exceeds token limit and consolidate if needed
   */
  async checkSTMSize() {
    try {
      // Estimate total tokens in STM
      const stmString = JSON.stringify(this.shortTermMemory);
      const tokenCount = this.estimateTokens(stmString);
      
      console.log(`STM size: ${tokenCount} tokens (limit: ${STM_TOKEN_LIMIT})`);
      
      // If STM exceeds token limit, consolidate oldest entries into LTM
      if (tokenCount > STM_TOKEN_LIMIT) {
        console.log('STM exceeds token limit, consolidating to LTM...');
        await this.consolidateToLTM();
      }
    } catch (error) {
      console.error('Error checking STM size:', error);
    }
  }

  /**
   * Consolidate oldest STM entries into LTM
   */
  async consolidateToLTM() {
    try {
      // Sort entries by timestamp
      this.shortTermMemory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Take oldest ~3000 tokens worth of entries
      let oldestEntries = [];
      let tokenCount = 0;
      let i = 0;
      
      while (i < this.shortTermMemory.length && tokenCount < 3000) {
        oldestEntries.push(this.shortTermMemory[i]);
        tokenCount += this.estimateTokens(JSON.stringify(this.shortTermMemory[i]));
        i++;
      }
      
      if (oldestEntries.length === 0) {
        console.log('No entries to consolidate');
        return;
      }
      
      console.log(`Consolidating ${oldestEntries.length} oldest entries (${tokenCount} tokens) to LTM`);
      
      // Create LTM summary using Gemini
      const updatedLTM = await this.createLTMSummary(oldestEntries);
      
      // Update LTM with new summary
      this.longTermMemory = updatedLTM;
      
      // Check LTM size and trim if needed
      await this.checkLTMSize();
      
      // Persist updated LTM
      await this.persistLTM();
      
      // Remove consolidated entries from STM
      this.shortTermMemory.splice(0, oldestEntries.length);
      
      // Persist updated STM
      await this.persistSTM();
      
      // Save complete memory state
      await this.persistCompleteState();
      
      console.log(`STM consolidated. ${this.shortTermMemory.length} entries remaining.`);
    } catch (error) {
      console.error('Error consolidating to LTM:', error);
    }
  }

  /**
   * Check and trim LTM if it exceeds token limit
   */
  async checkLTMSize() {
    try {
      const ltmString = JSON.stringify(this.longTermMemory);
      const tokenCount = this.estimateTokens(ltmString);
      
      console.log(`LTM size: ${tokenCount} tokens (limit: ${LTM_TOKEN_LIMIT})`);
      
      if (tokenCount > LTM_TOKEN_LIMIT) {
        console.log('LTM exceeds token limit, trimming...');
        await this.trimLTM(tokenCount);
      }
    } catch (error) {
      console.error('Error checking LTM size:', error);
    }
  }

  /**
   * Trim LTM to stay within token limit
   */
  async trimLTM(currentTokenCount) {
    try {
      // Use Gemini to create a more concise summary
      const prompt = `
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
Ensure the output is a valid JSON object with the same structure.`;

      const model = genAI.getGenerativeModel({ model: SUMMARY_MODEL });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      try {
        // Extract JSON from response
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }
        
        const trimmedLTM = JSON.parse(jsonStr);
        const newTokenCount = this.estimateTokens(JSON.stringify(trimmedLTM));
        
        if (newTokenCount <= LTM_TOKEN_LIMIT) {
          this.longTermMemory = trimmedLTM;
          console.log(`Successfully trimmed LTM to ${newTokenCount} tokens`);
        } else {
          console.warn(`Trimmed LTM still exceeds token limit (${newTokenCount} tokens)`);
          // Force additional trimming by removing less important categories
          const priorityOrder = [
            "profile_summary", 
            "skills_and_knowledge.confirmed_skills",
            "preferences_and_habits.ui_preferences",
            "preferences_and_habits.tool_preferences",
            "goals_and_motivations.stated_goals",
            "challenges.recurring_frustrations"
          ];
          
          // Keep trimming based on priority until we're under the limit
          this.longTermMemory = this.forceTrimByPriority(trimmedLTM, priorityOrder);
        }
      } catch (parseError) {
        console.error('Error parsing trimmed LTM JSON:', parseError);
        // If parsing fails, we'll do a manual basic trimming
        this.longTermMemory = this.basicTrimLTM();
      }
    } catch (error) {
      console.error('Error trimming LTM:', error);
      // Fallback to basic trimming
      this.longTermMemory = this.basicTrimLTM();
    }
  }

  /**
   * Force trim LTM by keeping high priority elements
   */
  forceTrimByPriority(ltm, priorityOrder) {
    // Deep clone to avoid modifying the original
    const result = JSON.parse(JSON.stringify(ltm));
    
    // Start with only the prioritized fields
    const trimmed = {};
    priorityOrder.forEach(path => {
      const parts = path.split('.');
      if (parts.length === 1) {
        if (result[parts[0]]) {
          if (!trimmed[parts[0]]) trimmed[parts[0]] = result[parts[0]];
        }
      } else if (parts.length === 2) {
        if (!trimmed[parts[0]]) trimmed[parts[0]] = {};
        if (result[parts[0]] && result[parts[0]][parts[1]]) {
          trimmed[parts[0]][parts[1]] = result[parts[0]][parts[1]]; 
        }
      }
    });
    
    console.log('Created priority-based trimmed LTM');
    return trimmed;
  }

  /**
   * Basic trim LTM as a fallback
   */
  basicTrimLTM() {
    // Simple fallback - keep only profile summary and most important categories
    const basic = {
      profile_summary: this.longTermMemory.profile_summary || "User profile",
      skills_and_knowledge: {
        confirmed_skills: this.longTermMemory.skills_and_knowledge?.confirmed_skills?.slice(0, 5) || []
      },
      preferences_and_habits: {
        ui_preferences: this.longTermMemory.preferences_and_habits?.ui_preferences?.slice(0, 5) || []
      }
    };
    
    console.log('Created basic trimmed LTM due to errors in advanced trimming');
    return basic;
  }

  /**
   * Update working memory based on STM and LTM
   */
  async updateWorkingMemory() {
    try {
      // Only update if we have STM entries
      if (this.shortTermMemory.length === 0) {
        console.log('No STM entries to update working memory');
        return;
      }
      
      console.log('Updating working memory...');
      
      // Format STM entries for the prompt
      const recentSTM = this.shortTermMemory.slice(-20); // Take most recent entries for context
      const formattedSTM = recentSTM.map(entry => {
        return `[${entry.timestamp}] (${entry.type}): ${JSON.stringify(entry.data)}`;
      }).join('\n');
      
      // Improved working memory reasoning prompt
      const prompt = `
You are an advanced cognitive model that builds a coherent user mental model by analyzing recent activity, long-term patterns, and current context.

Your task is to update the Working Memory (WM) to reflect the user's current state, goals, needs, and context.

Current WM:
---
${JSON.stringify(this.workingMemory, null, 2)}
---

STM (Recent Activity & Inferences):
---
${formattedSTM}
---

LTM (Long-Term Profile):
---
${JSON.stringify(this.longTermMemory, null, 2)}
---

INSTRUCTIONS:

1. ANALYZE recent STM entries through the lens of existing LTM and current WM.

2. Maintain these three categories in WM:
   a) UNTESTED HYPOTHESES: Fresh observations that seem plausible but need more evidence
   b) CORROBORATED HYPOTHESES: Observations with moderate support across multiple interactions
   c) ESTABLISHED FACTS: Consistently supported observations or explicitly stated information

3. For each hypothesis/fact, include:
   - The specific insight written concisely but precisely
   - The evidence basis in [brackets]
   - Relevance to the user's current context/goals
   
4. Focus on what would help understand and assist the user RIGHT NOW.

5. Maintain cognitive hierarchy:
   - PROMOTE untested hypotheses to corroborated when additional evidence appears
   - PROMOTE corroborated hypotheses to facts when consistently supported
   - DEMOTE or REMOVE when evidence contradicts

The updated WM should prioritize insights that are:
- Actionable (can inform immediate recommendations)
- Context-aware (relevant to current session)
- Specific (detailed enough to guide decisions)
- Evidence-based (clearly linked to observations)

Output the updated WM as a JSON object with these three arrays. Ensure the total response stays within ${WM_TOKEN_LIMIT} tokens.
`;

      // Generate updated working memory using Gemini
      const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      try {
        // Extract JSON from response (handles both raw JSON or markdown-wrapped JSON)
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }
        
        const updatedWM = JSON.parse(jsonStr);
        this.workingMemory = updatedWM;
        console.log('Successfully updated working memory');
        
        // Check WM size and trim if needed
        await this.checkWMSize();
        
        // Persist updated WM
        await this.persistWM();
        
        // Save complete memory state
        await this.persistCompleteState();
      } catch (parseError) {
        console.error('Error parsing working memory JSON:', parseError);
        console.log('Raw WM response:', responseText);
      }
    } catch (error) {
      console.error('Error updating working memory:', error);
    }
  }

  /**
   * Check and trim WM if it exceeds token limit
   */
  async checkWMSize() {
    try {
      const wmString = JSON.stringify(this.workingMemory);
      const tokenCount = this.estimateTokens(wmString);
      
      console.log(`WM size: ${tokenCount} tokens (limit: ${WM_TOKEN_LIMIT})`);
      
      if (tokenCount > WM_TOKEN_LIMIT) {
        console.log('WM exceeds token limit, trimming...');
        await this.trimWM();
      }
    } catch (error) {
      console.error('Error checking WM size:', error);
    }
  }

  /**
   * Trim WM to stay within token limit
   */
  async trimWM() {
    try {
      // First try to trim by priority
      const trimmed = { ...this.workingMemory };
      
      // Keep all established facts
      // Reduce corroborated hypotheses if needed
      if (trimmed.corroborated_hypotheses && trimmed.corroborated_hypotheses.length > 10) {
        trimmed.corroborated_hypotheses = trimmed.corroborated_hypotheses.slice(0, 10);
      }
      
      // Reduce untested hypotheses more aggressively
      if (trimmed.untested_hypotheses && trimmed.untested_hypotheses.length > 5) {
        trimmed.untested_hypotheses = trimmed.untested_hypotheses.slice(0, 5);
      }
      
      const tokenCount = this.estimateTokens(JSON.stringify(trimmed));
      if (tokenCount <= WM_TOKEN_LIMIT) {
        this.workingMemory = trimmed;
        console.log(`Trimmed WM to ${tokenCount} tokens by reducing hypotheses count`);
        return;
      }
      
      // If still too large, use Gemini to create a more concise version
      const prompt = `
The following working memory for a user assistant exceeds our token limit of ${WM_TOKEN_LIMIT}.

Please condense this working memory while preserving the most important insights.
Focus on:
1. All established facts
2. Most relevant corroborated hypotheses
3. Only the most recent and actionable untested hypotheses

Current WM:
---
${JSON.stringify(this.workingMemory, null, 2)}
---

Return a condensed version with the same structure but more concise entries.
Make sure to maintain the three categories: untested_hypotheses, corroborated_hypotheses, and established_facts.
Ensure the output is a valid JSON object and stays within ${WM_TOKEN_LIMIT} tokens.`;

      const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      try {
        // Extract JSON from response
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }
        
        const trimmedWM = JSON.parse(jsonStr);
        this.workingMemory = trimmedWM;
        console.log('Successfully trimmed WM using Gemini');
      } catch (parseError) {
        console.error('Error parsing trimmed WM JSON:', parseError);
        // If parsing fails, revert to the basic trimming we tried earlier
        this.workingMemory = trimmed;
      }
    } catch (error) {
      console.error('Error trimming WM:', error);
    }
  }

  /**
   * Persist long-term memory to disk
   */
  async persistLTM() {
    try {
      await fs.writeFile(
        path.join(MEMORY_DIR, 'ltm.json'),
        JSON.stringify(this.longTermMemory, null, 2),
        'utf-8'
      );
      console.log('Persisted LTM to disk');
    } catch (error) {
      console.error('Error persisting LTM:', error);
    }
  }

  /**
   * Persist working memory to disk
   */
  async persistWM() {
    try {
      await fs.writeFile(
        path.join(MEMORY_DIR, 'wm.json'),
        JSON.stringify(this.workingMemory, null, 2),
        'utf-8'
      );
      console.log('Persisted WM to disk');
    } catch (error) {
      console.error('Error persisting WM:', error);
    }
  }

  /**
   * Persist short-term memory to disk
   */
  async persistSTM() {
    try {
      await fs.writeFile(
        path.join(MEMORY_DIR, 'stm.json'),
        JSON.stringify(this.shortTermMemory, null, 2),
        'utf-8'
      );
      console.log('Persisted STM to disk');
    } catch (error) {
      console.error('Error persisting STM:', error);
    }
  }

  /**
   * Persist the complete memory state to a single JSON file
   */
  async persistCompleteState() {
    try {
      const completeState = {
        shortTermMemory: this.shortTermMemory,
        longTermMemory: this.longTermMemory,
        workingMemory: this.workingMemory,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(
        MEMORY_STATE_FILE,
        JSON.stringify(completeState, null, 2),
        'utf-8'
      );
      console.log('Persisted complete memory state to disk');
    } catch (error) {
      console.error('Error persisting complete memory state:', error);
    }
  }

  /**
   * Get the current memory state
   * @returns {Object} - Current memory state
   */
  getMemoryState() {
    return {
      shortTermMemory: this.shortTermMemory,
      longTermMemory: this.longTermMemory,
      workingMemory: this.workingMemory
    };
  }

  /**
   * Create LTM summary from STM entries using Gemini
   * @param {Array} stmEntries - STM entries to summarize
   * @returns {Object} - Updated LTM object
   */
  async createLTMSummary(stmEntries) {
    try {
      // Format STM entries for the prompt
      const formattedSTMEntries = stmEntries.map(entry => {
        return `[${entry.timestamp}] (${entry.type}): ${JSON.stringify(entry.data)}`;
      }).join("\n");
      
      // Improved LTM summarization prompt
      const prompt = `
You are an advanced cognitive system that builds and maintains a rich user profile from interaction history.

Your task: Synthesize new observations into the user's Long-Term Memory (LTM) profile, integrating them with existing knowledge.

EXISTING LTM:
---
${JSON.stringify(this.longTermMemory, null, 2)}
---

NEW OBSERVATIONS TO INTEGRATE:
---
${formattedSTMEntries}
---

Follow these guidelines:

1. MERGE observations with the existing LTM, REFINING understanding rather than just adding items
2. PRIORITIZE explicit statements over inferences when they conflict
3. INDICATE confidence levels for inferred traits (high/medium/low)
4. FOCUS on patterns that reveal:
   - Skill proficiency and knowledge areas
   - UI/UX preferences and workflow habits
   - Recurring frustrations and challenges
   - Goals and motivations driving behavior
   - Communication and learning style

5. CONDENSE redundant or similar entries to maintain a clean profile
6. REMOVE outdated information when new evidence suggests a change
7. STRUCTURE the profile hierarchically using the template below

Output the ENTIRE UPDATED LTM as a valid JSON object with this structure:
{
  "profile_summary": "Brief overview of user's primary traits and patterns",
  "skills_and_knowledge": {
    "confirmed_skills": [...],
    "inferred_skills": [...],
    "knowledge_gaps": [...]
  },
  "preferences_and_habits": {
    "ui_preferences": [...],
    "workflow_habits": [...],
    "tool_preferences": [...]
  },
  "workflows": {
    "common_tasks": [...],
    "approaches": [...],
    "frequency_patterns": [...]
  },
  "challenges": {
    "recurring_frustrations": [...],
    "difficulties": [...],
    "blockers": [...]
  },
  "goals_and_motivations": {
    "stated_goals": [...],
    "inferred_goals": [...],
    "motivations": [...]
  },
  "traits_and_attitudes": {
    "communication_style": [...],
    "decision_making": [...],
    "learning_approach": [...]
  }
}

Ensure the output stays within approximately ${LTM_TOKEN_LIMIT} tokens and is valid JSON without trailing commas.`;

      // Generate LTM summary using Gemini
      const model = genAI.getGenerativeModel({ model: SUMMARY_MODEL });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      try {
        // Extract JSON from response (handles both raw JSON or markdown-wrapped JSON)
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1];
        }
        
        const updatedLTM = JSON.parse(jsonStr);
        console.log('Successfully created LTM summary');
        return updatedLTM;
      } catch (parseError) {
        console.error('Error parsing LTM summary JSON:', parseError);
        // If parsing fails, keep existing LTM and log the error
        console.log('Raw LTM response:', responseText);
        return this.longTermMemory;
      }
    } catch (error) {
      console.error('Error creating LTM summary:', error);
      return this.longTermMemory;
    }
  }

  /**
   * Create a conversational interface to the memory system
   * @param {string} query - User query about the memory system
   * @returns {string} - Response from the memory system
   */
  async conversationalMemoryQuery(query) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      console.log(`Processing memory query: ${query}`);
      
      // Format current memory state for the prompt
      const memoryState = {
        stm: this.shortTermMemory.slice(-10), // Last 10 STM entries for context
        ltm: this.longTermMemory,
        wm: this.workingMemory
      };
      
      const prompt = `
You are the Memory Portal, an interface to a multi-tiered memory system for an AI assistant.
The system includes:

1. Short-Term Memory (STM): Recent observations and inferences
2. Long-Term Memory (LTM): Persistent user profile and patterns
3. Working Memory (WM): Current hypotheses and established facts

The user is asking about this memory system. Respond helpfully, transparently, and concisely.

Current Memory State:
---
${JSON.stringify(memoryState, null, 2)}
---

User Query: "${query}"

Guidelines:
- If the query is about the CONTENT of memories, answer based on the data shown above
- If the query is about EDITING memories, explain how memories are processed and consolidated
- If the query is about HOW THE SYSTEM WORKS, explain the relevant components
- If the query is a COMMAND to update memory, respond as if you've made the change (the actual implementation will happen elsewhere)
- Keep your response concise but informative
- Be transparent about confidence levels when discussing inferences vs. explicit observations

Remember your role as a Memory Portal - you provide access to the system's knowledge about the user, not general knowledge.`;

      // Generate response using Gemini
      const model = genAI.getGenerativeModel({ model: SUMMARY_MODEL });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      console.log('Generated memory portal response');
      return responseText;
    } catch (error) {
      console.error('Error in conversational memory query:', error);
      return "Sorry, I encountered an error accessing the memory system. Please try again.";
    }
  }
}

// Export singleton instance
const memoryManager = new MemoryManager();
export default memoryManager; 