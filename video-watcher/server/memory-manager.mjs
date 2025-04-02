import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Constants for memory management
const MEMORY_DIR = path.join(process.cwd(), 'memory');
const STM_TOKEN_LIMIT = 8000;
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
      
      // Comprehensive LTM summarization prompt with clear instructions and structure
      const prompt = `
Synthesize the following user activity log entries (which include explicit statements and inferred insights) into a concise, structured long-term memory profile. Focus on consolidating recurring themes, established facts, and significant patterns regarding the user's:

* Skills & Knowledge (including gaps)
* Preferences & Habits
* Common Workflows & Tool Usage
* Recurring Frustrations or Challenges
* Inferred Goals & Motivations
* Implicit Opinions or Attitudes

Preserve the nuance between explicitly stated facts and inferred observations where possible. This summary will be added to the user's persistent profile to inform a personalized AI assistant.

Existing LTM:
---
${JSON.stringify(this.longTermMemory, null, 2)}
---

New STM Entries to Summarize & Integrate:
---
${formattedSTMEntries}
---

Guidelines for synthesis:
1. Merge similar insights, prioritizing explicit statements over inferred ones when there's a conflict
2. Note the confidence/certainty level when including inferences
3. Build upon existing knowledge in the LTM, refining or correcting previous entries as needed
4. Maintain a balance between specificity (concrete examples) and generalization (patterns)
5. Preserve important contextual information that helps explain the user's behavior

Output the *entire updated* LTM as a single, consolidated JSON object following this structure:
{
  "profile_summary": "Brief overview of the user",
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

Ensure the output is a valid JSON object with no trailing commas or syntax errors.`;

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
      
      // Working memory reasoning prompt with clear reasoning steps and explanation
      const prompt = `
Based on the recent activity log (STM - including explicit statements AND inferred insights), the long-term user profile (LTM), and the current Working Memory (WM), update the WM. The goal is to refine our understanding of the user's *current state, active goals, and immediate context*, including their potential mental state, unspoken needs, and opinions.

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

Instructions:

1. ANALYZE recent STM entries (especially 'inferred_insights') in light of LTM and current WM.

2. GENERATE new 'untested_hypotheses' reflecting fresh observations about user state, intent, opinions, needs, confusion, etc.
   - Focus on what's relevant to their CURRENT context
   - Phrase as specific, testable statements
   - Include hypotheses about immediate needs, mental state, and short-term goals

3. REVIEW existing 'untested_hypotheses':
   - If recent STM/LTM SUPPORTS a hypothesis, PROMOTE it to 'corroborated_hypotheses'
   - If recent STM/LTM CONTRADICTS a hypothesis, REMOVE it
   - If hypothesis is no longer relevant to current context, REMOVE it
   - Otherwise, KEEP it in 'untested_hypotheses'

4. REVIEW existing 'corroborated_hypotheses':
   - If CONSISTENTLY and STRONGLY supported over time, PROMOTE to 'established_facts'
   - If recent activity raises DOUBTS, DEMOTE back to 'untested_hypotheses'
   - If STRONGLY refuted, REMOVE it
   - Otherwise, KEEP it in 'corroborated_hypotheses'

5. Format each hypothesis/fact:
   - Be CONCISE but SPECIFIC
   - Include BASIS for belief (e.g., "User prefers dark mode [based on repeated UI selections]")
   - Focus on ACTIONABLE insights (what would help the user NOW)
   - Avoid redundancy with LTM and between lists

Output the *entire updated* WM as a JSON object:
{
  "untested_hypotheses": [
    "Hypothesis 1 [basis: observation X]",
    "Hypothesis 2 [basis: inference from Y]"
  ],
  "corroborated_hypotheses": [
    "Stronger hypothesis 1 [basis: consistent pattern Z]",
    "Stronger hypothesis 2 [basis: multiple observations of A]"
  ],
  "established_facts": [
    "Established fact 1 [basis: repeated confirmation of B]",
    "Established fact 2 [basis: explicit statement plus consistent behavior]"
  ]
}

Ensure the output is ONLY the valid JSON object with no explanations or trailing text.`;

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
}

// Export singleton instance
const memoryManager = new MemoryManager();
export default memoryManager; 